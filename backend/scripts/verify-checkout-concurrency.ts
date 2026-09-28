import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../src/db";
import { users } from "../src/db/schema/auth";
import { categories, inventories, products, subcategories } from "../src/db/schema/catalog";
import { cartItems, carts, customerAddresses } from "../src/db/schema/customer";
import { orderItems, orders, payments } from "../src/db/schema/orders";
import { admins } from "../src/db/schema/rbac";
import { checkoutCart } from "../src/services/customer/order.service";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { db, client } = createDb(process.env.DATABASE_URL);
const fixture = randomUUID();
const customerIds = [`race-a-${fixture}`, `race-b-${fixture}`];
const sellerId = `race-seller-${fixture}`;
const categoryId = randomUUID(), subcategoryId = randomUUID(), productId = randomUUID(), adminId = randomUUID();

async function main() {
  try {
    const addresses = await db.transaction(async (tx) => {
      await tx.insert(users).values([...customerIds, sellerId].map((id) => ({ id, name: "Checkout Race Fixture", email: `${id}@example.invalid` })));
      await tx.insert(admins).values({ id: adminId, userId: sellerId, status: "ACTIVE" });
      await tx.insert(categories).values({ id: categoryId, name: "Race Fixture", slug: `race-${fixture}`, status: "PUBLISHED" });
      await tx.insert(subcategories).values({ id: subcategoryId, categoryId, name: "Race Fixture", slug: "race", status: "PUBLISHED" });
      await tx.insert(products).values({ id: productId, categoryId, subcategoryId, createdByAdminId: adminId, name: "Last Stock Fixture", slug: `race-${fixture}`, status: "PUBLISHED", price: "100.00", sku: `race-${fixture}`, weightKg: "1", lengthCm: "10", breadthCm: "10", heightCm: "10" });
      await tx.insert(inventories).values({ productId, availableQuantity: 1 });
      const addresses = await tx.insert(customerAddresses).values(customerIds.map((customerId) => ({ customerId, label: "Fixture", contactName: "Fixture", phone: "9999999999", line1: "Fixture Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" }))).returning();
      const fixtureCarts = await tx.insert(carts).values(customerIds.map((customerId) => ({ customerId }))).returning();
      await tx.insert(cartItems).values(fixtureCarts.map((cart) => ({ cartId: cart.id, productId, quantity: 1 })));
      return addresses;
    });
    const results = await Promise.allSettled(customerIds.map((id) => checkoutCart(db, id, addresses.find((address) => address.customerId === id)!.id)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.match(rejected.reason.message, /Insufficient stock/);
    const savedOrders = await db.select({ id: orders.id }).from(orders).where(inArray(orders.customerId, customerIds));
    assert.equal(savedOrders.length, 1);
    const [stock] = await db.select({ quantity: inventories.availableQuantity }).from(inventories).where(eq(inventories.productId, productId));
    assert.equal(stock.quantity, 0);
    console.log("Last-stock concurrency passed: two independent checkouts, one order, one stock rejection, stock = 0.");
  } finally {
    await db.transaction(async (tx) => {
      const fixtureOrders = await tx.select({ id: orders.id }).from(orders).where(inArray(orders.customerId, customerIds));
      if (fixtureOrders.length) {
        const ids = fixtureOrders.map((order) => order.id);
        await tx.delete(payments).where(inArray(payments.orderId, ids));
        await tx.delete(orderItems).where(inArray(orderItems.orderId, ids));
        await tx.delete(orders).where(inArray(orders.id, ids));
      }
      await tx.delete(cartItems).where(eq(cartItems.productId, productId));
      await tx.delete(carts).where(inArray(carts.customerId, customerIds));
      await tx.delete(customerAddresses).where(inArray(customerAddresses.customerId, customerIds));
      await tx.delete(inventories).where(eq(inventories.productId, productId));
      await tx.delete(products).where(eq(products.id, productId));
      await tx.delete(subcategories).where(eq(subcategories.id, subcategoryId));
      await tx.delete(categories).where(eq(categories.id, categoryId));
      await tx.delete(admins).where(eq(admins.id, adminId));
      await tx.delete(users).where(inArray(users.id, [...customerIds, sellerId]));
    });
    assert.equal((await db.select({ id: users.id }).from(users).where(inArray(users.id, [...customerIds, sellerId]))).length, 0);
    console.log("Concurrency fixture cleanup verified.");
  }
}
main().catch((error: unknown) => { console.error("Concurrency verification failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error && error.name === "AssertionError" ? error.message : undefined, code: (error as { code?: string })?.code }); process.exitCode = 1; }).finally(() => client.end({ timeout: 1 }));
