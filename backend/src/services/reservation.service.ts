import { and, eq, isNull, sql } from "drizzle-orm";
import type { createDb } from "../db";
import { inventories } from "../db/schema/catalog";
import { orderItems, orders, payments } from "../db/schema/orders";
import { refunds } from "../db/schema/returns";
import { DomainError } from "./admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function pgCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const detail = current as { code?: string; cause?: unknown };
    if (detail.code) return detail.code;
    current = detail.cause;
  }
  return undefined;
}

export async function withTransitionRetry<T>(db: Db, action: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.transaction(action); }
    catch (error) {
      const code = pgCode(error);
      if (code !== "40P01" && code !== "40001") {
        if (code?.startsWith("23")) throw new DomainError("PAYMENT_TRANSITION_CONFLICT", 409);
        throw error;
      }
      if (attempt === 2) throw new DomainError("RETRYABLE_TRANSACTION", 503);
    }
  }
  throw new DomainError("RETRYABLE_TRANSACTION", 503);
}

async function lockOrderAndPayment(tx: Tx, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
  if (!order) throw new DomainError("ORDER_UNAVAILABLE", 404);
  const [payment] = await tx.select().from(payments).where(eq(payments.orderId, orderId)).limit(1).for("update");
  if (!payment) throw new DomainError("PAYMENT_UNAVAILABLE", 404);
  return { order, payment };
}

async function moveReserved(tx: Tx, orderId: string, release: boolean) {
  const lines = await tx.select({ productId: orderItems.productId, variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const [stock] = await tx.select({ id: inventories.id }).from(inventories).where(and(eq(inventories.productId, line.productId), line.variantId ? eq(inventories.variantId, line.variantId) : isNull(inventories.variantId))).limit(1);
    if (!stock) throw new DomainError("INVENTORY_MISSING", 409);
    quantities.set(stock.id, (quantities.get(stock.id) ?? 0) + line.quantity);
  }
  for (const [id, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
    const [stock] = await tx.select().from(inventories).where(eq(inventories.id, id)).limit(1).for("update");
    if (!stock || stock.reservedQuantity < quantity) throw new DomainError("RESERVATION_MISMATCH", 409);
    await tx.update(inventories).set({
      reservedQuantity: sql`${inventories.reservedQuantity} - ${quantity}`,
      ...(release ? { availableQuantity: sql`${inventories.availableQuantity} + ${quantity}` } : {}),
      version: sql`${inventories.version} + 1`,
      updatedAt: sql`clock_timestamp()`,
    }).where(eq(inventories.id, id));
  }
}

// Caller owns the transaction. The order lock is always acquired before the
// payment and inventory locks, including on repeated webhook delivery.
export async function recordVerifiedPayment(tx: Tx, orderId: string, providerPaymentId: string) {
  const { order, payment } = await lockOrderAndPayment(tx, orderId);
  const [{ expired }] = await tx.execute<{ expired: boolean }>(sql`select clock_timestamp() >= payment_expires_at as expired from orders where id = ${orderId}`);
  if (payment.status === "PAID") return { outcome: payment.resolutionStatus === "REFUND_REQUIRED" ? "REFUND_REQUIRED" : payment.resolutionStatus === "RESOLVED" ? "RESOLVED" : "CONFIRMED" };
  if (order.stockState === "RESERVED" && !expired && order.status === "CREATED" && payment.status === "PENDING") {
    await moveReserved(tx, orderId, false);
    await tx.update(orders).set({ status: "CONFIRMED", stockState: "CONSUMED", paymentStatus: "PAID", placedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "PAID", providerPaymentId, paidAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(payments.id, payment.id));
    return { outcome: "CONFIRMED" };
  }
  if (order.stockState === "RESERVED" && order.status === "CREATED" && payment.status === "PENDING" && expired) {
    await moveReserved(tx, orderId, true);
    await tx.update(orders).set({ status: "EXPIRED", stockState: "RELEASED", paymentStatus: "EXPIRED", expiredAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
  }
  else if (order.stockState !== "RELEASED") throw new DomainError("ORDER_STATE_INVALID", 409);
  await tx.update(payments).set({ status: "PAID", resolutionStatus: "REFUND_REQUIRED", providerPaymentId, paidAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(payments.id, payment.id));
  await tx.update(orders).set({ paymentStatus: "PAID", updatedAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
  return { outcome: "REFUND_REQUIRED" };
}

export const applyVerifiedPayment = (db: Db, orderId: string, providerPaymentId: string) => withTransitionRetry(db, (tx) => recordVerifiedPayment(tx, orderId, providerPaymentId));

export async function expireUnpaidOrder(db: Db, orderId: string) {
  return withTransitionRetry(db, (tx) => expireUnpaidOrderInTransaction(tx, orderId));
}

export async function expireUnpaidOrderInTransaction(tx: Tx, orderId: string) {
    const { order, payment } = await lockOrderAndPayment(tx, orderId);
    if (order.status === "EXPIRED" && order.stockState === "RELEASED") return { stockState: "RELEASED", status: "EXPIRED" };
    if (order.status !== "CREATED" || payment.status !== "PENDING" || order.stockState !== "RESERVED") return { stockState: order.stockState, status: order.status };
    const [{ expired }] = await tx.execute<{ expired: boolean }>(sql`select clock_timestamp() >= payment_expires_at as expired from orders where id = ${orderId}`);
    if (!expired) throw new DomainError("PAYMENT_WINDOW_OPEN", 409);
    await moveReserved(tx, orderId, true);
    await tx.update(orders).set({ status: "EXPIRED", stockState: "RELEASED", paymentStatus: "EXPIRED", expiredAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "EXPIRED", updatedAt: sql`clock_timestamp()` }).where(eq(payments.id, payment.id));
    return { stockState: "RELEASED", status: "EXPIRED" };
}

export const releaseUnpaidOrder = (db: Db, orderId: string, reason: "EXPIRED") => {
  if (reason !== "EXPIRED") throw new DomainError("UNPAID_CANCELLATION_UNAVAILABLE", 409);
  return expireUnpaidOrder(db, orderId);
};

export async function cancelUnpaidOrder(db: Db, orderId: string, customerId: string) {
  return withTransitionRetry(db, async (tx) => {
    const { order, payment } = await lockOrderAndPayment(tx, orderId);
    if (order.customerId !== customerId) throw new DomainError("ORDER_UNAVAILABLE", 404);
    if (order.status !== "CREATED" || payment.status !== "PENDING" || order.stockState !== "RESERVED") throw new DomainError("UNPAID_CANCELLATION_UNAVAILABLE", 409);
    await moveReserved(tx, orderId, true);
    await tx.update(orders).set({ status: "CANCELLED", stockState: "RELEASED", cancelledAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
    return { stockState: "RELEASED", status: "CANCELLED" };
  });
}

// Only a definitive provider-order failure may call this. A dropped browser,
// failed attempt, or timeout must leave the payment PENDING.
export async function recordDefinitivePaymentFailure(db: Db, orderId: string) {
  return withTransitionRetry(db, async (tx) => {
    const { order, payment } = await lockOrderAndPayment(tx, orderId);
    if (order.status === "CANCELLED" && order.stockState === "RELEASED" && payment.status === "FAILED") return { stockState: "RELEASED", paymentStatus: "FAILED" };
    if (order.status !== "CREATED" || payment.status !== "PENDING" || order.stockState !== "RESERVED") throw new DomainError("DEFINITIVE_FAILURE_UNAVAILABLE", 409);
    await moveReserved(tx, orderId, true);
    await tx.update(orders).set({ status: "CANCELLED", stockState: "RELEASED", paymentStatus: "FAILED", cancelledAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "FAILED", updatedAt: sql`clock_timestamp()` }).where(eq(payments.id, payment.id));
    return { stockState: "RELEASED", paymentStatus: "FAILED" };
  });
}

// V1 resolution records the full obligation internally; it does not assert
// that money has been sent by a provider. No stock or order state is changed.
export async function markRefundResolved(db: Db, orderId: string) {
  return withTransitionRetry(db, async (tx) => {
    const { order, payment } = await lockOrderAndPayment(tx, orderId);
    if (!["EXPIRED", "CANCELLED"].includes(order.status)) throw new DomainError("REFUND_NOT_PENDING", 409);
    const [record] = await tx.select().from(refunds).where(and(eq(refunds.paymentId, payment.id), eq(refunds.reason, "LATE_PAYMENT"))).limit(1);
    if (payment.resolutionStatus === "RESOLVED" && payment.status === "PAID" && order.stockState === "RELEASED") {
      if (!record || record.amount !== payment.amount || record.currency !== payment.currency || record.status !== "INTERNAL_RECORDED") throw new DomainError("REFUND_RESOLUTION_RECORD_MISSING", 409);
      return { outcome: "RESOLVED" };
    }
    if (payment.status !== "PAID" || payment.resolutionStatus !== "REFUND_REQUIRED" || order.stockState !== "RELEASED") throw new DomainError("REFUND_NOT_PENDING", 409);
    const prior = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.paymentId, payment.id));
    if (prior.length) throw new DomainError("REFUND_RECONCILIATION_CONFLICT", 409);
    await tx.insert(refunds).values({ orderId, paymentId: payment.id, amount: payment.amount, currency: payment.currency, reason: "LATE_PAYMENT", status: "INTERNAL_RECORDED" });
    await tx.update(payments).set({ resolutionStatus: "RESOLVED", updatedAt: sql`clock_timestamp()` }).where(eq(payments.id, payment.id));
    return { outcome: "RESOLVED" };
  });
}

export async function listUnresolvedRefundObligations(db: Db) {
  return db.select({ orderId: orders.id, paymentId: payments.id, amount: payments.amount, currency: payments.currency, orderStatus: orders.status })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.status, "PAID"), eq(payments.resolutionStatus, "REFUND_REQUIRED")));
}
