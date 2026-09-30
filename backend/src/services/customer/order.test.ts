import assert from "node:assert/strict";
import test from "node:test";
import { checkoutCart, customerOrderResponse, fromPaise, getCustomerOrders, quoteCart, toPaise } from "./order.service";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getTableName } from "drizzle-orm";

test("customer order projection retains purchase snapshots and strips internal fields", () => {
  const projected = customerOrderResponse({
    id: "order", orderNumber: "ORD-test", status: "CONFIRMED", paymentStatus: "PAID", currency: "INR",
    subtotal: "20.00", shippingAmount: "0.00", discountAmount: "0.00", totalAmount: "20.00", createdAt: new Date(), deliveredAt: null,
    customerId: "private-customer", internalNotes: "secret", shippingAddressSnapshot: { contactName: "Buyer", phone: "123", line1: "Road", city: "City", state: "State", postalCode: "123456", country: "IN", internalNotes: "secret" },
  } as never, [{ id: "item", productId: "product", variantId: null, productNameSnapshot: "Purchased name", variantTitleSnapshot: null, quantity: 2, unitPrice: "10.00", totalAmount: "20.00", adminId: "private-admin", skuSnapshot: "internal-sku", weightKgSnapshot: "1", internalNotes: "secret" }] as never);
  assert.equal(projected.items[0].productNameSnapshot, "Purchased name");
  assert.equal(projected.items[0].unitPrice, "10.00");
  assert.equal(projected.shippingAddressSnapshot.contactName, "Buyer");
  assert.equal(projected.paymentStatus, "PAID");
  assert.doesNotMatch(JSON.stringify(projected), /private-|internal|skuSnapshot|weightKgSnapshot|customerId|adminId/);
});

test("customer order list and detail always constrain reads to the authenticated owner", async () => {
  const dialect = new PgDialect();
  const predicates: { sql: string; params: unknown[] }[] = [];
  const db = { select: () => ({ from: () => ({ where: (predicate: SQL) => {
    predicates.push(dialect.sqlToQuery(predicate));
    return { orderBy: async () => [] };
  } }) }) };
  assert.deepEqual(await getCustomerOrders(db as never, "customer-b"), []);
  await assert.rejects(getCustomerOrders(db as never, "customer-b", "customer-a-order"), { status: 404 });
  assert.match(predicates[0].sql, /customer_id/);
  assert.deepEqual(predicates[0].params, ["customer-b"]);
  assert.match(predicates[1].sql, /customer_id/);
  assert.deepEqual(predicates[1].params, ["customer-a-order", "customer-b"]);
});

test("order money conversion preserves exact two-decimal price snapshots", () => {
  assert.equal(toPaise("1299.95"), 129995);
  assert.equal(fromPaise(129995), "1299.95");
  assert.equal(fromPaise(toPaise("10") * 3), "30.00");
  assert.throws(() => toPaise("10.999"), /Invalid money/);
});

test("checkout quote uses current server price and stock without creating an order", async () => {
  const responses: Record<string, unknown[]> = {
    customer_addresses: [{ id: "address" }], carts: [{ id: "cart", version: 1 }],
    cart_items: [{ productId: "product", variantId: null, quantity: 2 }],
    products: [{ id: "product", categoryId: "category", subcategoryId: "subcategory", createdByAdminId: "seller", currency: "INR", name: "Test product", status: "PUBLISHED", price: "129.95", sku: "SKU", weightKg: "1", lengthCm: "10", breadthCm: "10", heightCm: "10" }],
    categories: [{ id: "category", status: "PUBLISHED" }],
    subcategories: [{ id: "subcategory", categoryId: "category", status: "PUBLISHED" }],
    admins: [{ id: "seller", status: "ACTIVE", deletedAt: null }],
    admin_category_assignments: [{ id: "assignment" }], product_admins: [{ productId: "product", adminId: "seller" }],
    inventories: [{ id: "inventory", availableQuantity: 2 }],
  };
  const fakeDb = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
    select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: () => ({ limit: async () => responses[getTableName(table)], then: (resolve: (rows: unknown[]) => void) => Promise.resolve(responses[getTableName(table)]).then(resolve) }) }) }),
    insert: () => { throw new Error("quote attempted insert"); },
    update: () => { throw new Error("quote attempted update"); },
    delete: () => { throw new Error("quote attempted delete"); },
  };
  const quote = await quoteCart(fakeDb as never, "customer", "address");
  assert.equal(quote.valid, true);
  assert.equal(quote.totalAmount, "259.90");
  assert.equal(quote.items[0].unitPrice, "129.95");
  assert.equal(quote.cartVersion, 1);
  assert.match(quote.lineFingerprint, /^[0-9a-f]{64}$/);
});

test("checkout retries the whole transaction at most three times on PostgreSQL deadlock", async () => {
  let attempts = 0;
  const db = { transaction: async () => { attempts++; throw Object.assign(new Error("deadlock"), { code: "40P01" }); } };
  await assert.rejects(checkoutCart(db as never, "customer", { addressId: "address", key: "00000000-0000-4000-8000-000000000001", cartVersion: 0, lineFingerprint: "a".repeat(64) }), /RETRYABLE_TRANSACTION/);
  assert.equal(attempts, 3);
});
