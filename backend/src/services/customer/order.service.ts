import { and, desc, eq, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { inventories, products, productVariants } from "../../db/schema/catalog";
import { cartItems, carts, customerAddresses } from "../../db/schema/customer";
import { orderItems, orders, payments, type AddressSnapshot } from "../../db/schema/orders";
import { admins } from "../../db/schema/rbac";
import type { Actor } from "../../middleware/authorization";
import { DomainError } from "../admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];
export const toPaise = (value: string): number => { if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new DomainError("Invalid money value", 422); const [whole, decimals = ""] = value.split("."); return Number(whole) * 100 + Number(decimals.padEnd(2, "0")); };
export const fromPaise = (value: number): string => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

// Read-only preview. The order transaction below remains the final authority and
// rechecks every value under a row lock before changing stock or creating an order.
export async function quoteCart(db: Db, customerId: string, addressId?: string) {
  const problems: string[] = [];
  const [address] = addressId ? await db.select({ id: customerAddresses.id }).from(customerAddresses).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId))).limit(1) : [];
  if (!address) problems.push(addressId ? "Address unavailable" : "Select a delivery address");
  const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, customerId)).limit(1);
  const cartRows = cart ? await db.select({ productId: cartItems.productId, variantId: cartItems.variantId, quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.cartId, cart.id)) : [];
  if (!cartRows.length) problems.push("Cart is empty");
  const lines: Array<{ productId: string; variantId: string | null; name: string; variantTitle: string | null; quantity: number; unitPrice: string; lineTotal: string; available: boolean }> = [];
  let subtotalPaise = 0;
  for (const item of cartRows) {
    const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
    if (!product || product.status !== "PUBLISHED") { problems.push("A cart product is unavailable"); continue; }
    const [variant] = item.variantId ? await db.select().from(productVariants).where(and(eq(productVariants.id, item.variantId), eq(productVariants.productId, product.id), eq(productVariants.status, "ACTIVE"))).limit(1) : [null];
    if (item.variantId && !variant) { problems.push("A cart variant is unavailable"); continue; }
    if (!(variant?.sku ?? product.sku) || !product.weightKg || !product.lengthCm || !product.breadthCm || !product.heightCm) problems.push("A cart product is missing fulfillment data");
    const stockWhere = variant ? eq(inventories.variantId, variant.id) : and(eq(inventories.productId, product.id), sql`${inventories.variantId} is null`);
    const [stock] = await db.select({ availableQuantity: inventories.availableQuantity }).from(inventories).where(stockWhere).limit(1);
    const available = Boolean(stock && stock.availableQuantity >= item.quantity);
    if (!available) problems.push("Insufficient stock");
    const unitPrice = variant?.price ?? product.price;
    const lineTotal = fromPaise(toPaise(unitPrice) * item.quantity);
    subtotalPaise += toPaise(lineTotal);
    lines.push({ productId: product.id, variantId: variant?.id ?? null, name: product.name, variantTitle: variant?.title ?? null, quantity: item.quantity, unitPrice, lineTotal, available });
  }
  const subtotal = fromPaise(subtotalPaise);
  // Checkout currently has no coupon or shipping-rate calculation; both amounts
  // are explicitly zero in the order transaction, never estimated in the browser.
  return { items: lines, subtotal, discountAmount: "0.00", shippingAmount: "0.00", totalAmount: problems.length ? null : subtotal, currency: "INR", valid: problems.length === 0, problems };
}

export async function checkoutCart(db: Db, customerId: string, addressId: string) {
  return db.transaction(async (tx) => {
    const [address] = await tx.select().from(customerAddresses).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId))).limit(1);
    if (!address) throw new DomainError("Address unavailable", 404);
    const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.customerId, customerId)).limit(1);
    if (!cart) throw new DomainError("Cart is empty", 422);
    const items = await tx.select({ id: cartItems.id, productId: cartItems.productId, variantId: cartItems.variantId, quantity: cartItems.quantity }).from(cartItems).where(eq(cartItems.cartId, cart.id));
    if (!items.length) throw new DomainError("Cart is empty", 422);

    const prepared: Array<{ product: typeof products.$inferSelect; variant: typeof productVariants.$inferSelect | null; quantity: number }> = [];
    let subtotalPaise = 0;
    for (const item of items) {
      const [product] = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product || product.status !== "PUBLISHED") throw new DomainError("A cart product is unavailable", 409);
      const [variant] = item.variantId ? await tx.select().from(productVariants).where(and(eq(productVariants.id, item.variantId), eq(productVariants.productId, product.id), eq(productVariants.status, "ACTIVE"))).limit(1) : [null];
      if (item.variantId && !variant) throw new DomainError("A cart variant is unavailable", 409);
      if (!(variant?.sku ?? product.sku) || !product.weightKg || !product.lengthCm || !product.breadthCm || !product.heightCm) throw new DomainError("A cart product is missing fulfillment data", 422);
      const stockWhere = variant ? eq(inventories.variantId, variant.id) : and(eq(inventories.productId, product.id), sql`${inventories.variantId} is null`);
      const [stock] = await tx.select().from(inventories).where(stockWhere).limit(1).for("update");
      if (!stock || stock.availableQuantity < item.quantity) throw new DomainError("Insufficient stock", 409);
      subtotalPaise += toPaise(variant?.price ?? product.price) * item.quantity;
      prepared.push({ product, variant, quantity: item.quantity });
    }
    const snapshot: AddressSnapshot = { contactName: address.contactName, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country };
    const amount = fromPaise(subtotalPaise);
    const [order] = await tx.insert(orders).values({ orderNumber: `ORD-${crypto.randomUUID()}`, customerId, subtotal: amount, totalAmount: amount, shippingAddressSnapshot: snapshot }).returning();
    await tx.insert(orderItems).values(prepared.map(({ product, variant, quantity }) => ({
      orderId: order.id, adminId: product.createdByAdminId, productId: product.id, variantId: variant?.id, productNameSnapshot: product.name, variantTitleSnapshot: variant?.title, skuSnapshot: variant?.sku ?? product.sku,
      unitPrice: variant?.price ?? product.price, weightKgSnapshot: product.weightKg, lengthCmSnapshot: product.lengthCm, breadthCmSnapshot: product.breadthCm, heightCmSnapshot: product.heightCm,
      quantity, subtotal: fromPaise(toPaise(variant?.price ?? product.price) * quantity), totalAmount: fromPaise(toPaise(variant?.price ?? product.price) * quantity),
    })));
    for (const { product, variant, quantity } of prepared) await tx.update(inventories).set({ availableQuantity: sql`${inventories.availableQuantity} - ${quantity}`, updatedAt: new Date() }).where(variant ? eq(inventories.variantId, variant.id) : and(eq(inventories.productId, product.id), sql`${inventories.variantId} is null`));
    await tx.insert(payments).values({ orderId: order.id, amount, status: "PENDING" });
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return order;
  });
}

export async function getCustomerOrders(db: Db, customerId: string, orderId?: string) {
  const rows = await db.select().from(orders).where(orderId ? and(eq(orders.id, orderId), eq(orders.customerId, customerId)) : eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt));
  if (orderId && !rows.length) throw new DomainError("Order unavailable", 404);
  return Promise.all(rows.map(async (order) => ({ ...order, items: await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)) })));
}

export async function getAdminOrders(db: Db, actor: Actor, orderId?: string) {
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("orders.view")) throw new DomainError("Forbidden", 403);
  const [admin] = await db.select({ id: admins.id }).from(admins).where(eq(admins.userId, actor.userId)).limit(1);
  if (!admin) throw new DomainError("Forbidden", 403);
  const scoped = await db.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.adminId, admin.id));
  const ids = [...new Set(scoped.map((item) => item.orderId))];
  if (orderId && !ids.includes(orderId)) throw new DomainError("Order unavailable", 404);
  const selected = orderId ? ids.filter((id) => id === orderId) : ids;
  return Promise.all(selected.map(async (id) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, id), eq(orderItems.adminId, admin.id)));
    return {
      id: order.id, orderNumber: order.orderNumber, status: order.status, currency: order.currency,
      paymentStatus: order.paymentStatus, shippingAddress: order.shippingAddressSnapshot,
      placedAt: order.placedAt, createdAt: order.createdAt,
      adminSubtotal: fromPaise(items.reduce((sum, item) => sum + toPaise(item.totalAmount), 0)), items,
    };
  }));
}
