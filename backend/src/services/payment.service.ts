import { and, eq } from "drizzle-orm";
import type { createDb } from "../db";
import { users } from "../db/schema/auth";
import { cashfreeWebhookEvents, orders, payments } from "../db/schema/orders";
import { DomainError } from "./admin/admin.service";
import type { CashfreePaymentAdapter } from "./cashfree-payment.adapter";
import { recordVerifiedPayment, withTransitionRetry } from "./reservation.service";

type Db = ReturnType<typeof createDb>["db"];

export async function createPaymentSession(db: Db, provider: CashfreePaymentAdapter, orderId: string, customerId: string, returnUrl: string, notifyUrl: string) {
  const [row] = await db.select({ order: orders, payment: payments, customer: users }).from(orders).innerJoin(payments, eq(payments.orderId, orders.id)).innerJoin(users, eq(users.id, orders.customerId)).where(and(eq(orders.id, orderId), eq(orders.customerId, customerId), eq(payments.provider, "CASHFREE"))).limit(1);
  if (!row) throw new DomainError("Order unavailable", 404);
  if (row.payment.status === "PAID") throw new DomainError("Order is already paid", 409);
  const result = await provider.createOrder({ orderId: row.payment.providerOrderId ?? row.order.id, amount: row.payment.amount, currency: row.payment.currency, customerId, customerName: row.customer.name, customerEmail: row.customer.email, customerPhone: row.order.shippingAddressSnapshot.phone, returnUrl, notifyUrl });
  await db.update(payments).set({ providerOrderId: result.providerOrderId, updatedAt: new Date() }).where(and(eq(payments.id, row.payment.id), eq(payments.status, "PENDING")));
  return { orderId: row.order.id, paymentSessionId: result.paymentSessionId };
}

type CashfreeWebhook = { type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK" | "PAYMENT_USER_DROPPED_WEBHOOK"; data: { order: { order_id: string; order_amount: number; order_currency: string }; payment: { cf_payment_id: string | number; payment_status: string; payment_amount: number; payment_currency: string } } };
export function parseCashfreeWebhook(value: unknown): CashfreeWebhook {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid payment webhook", 422);
  const payload = value as Record<string, unknown>, allowed = ["PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK"];
  if (typeof payload.type !== "string" || !allowed.includes(payload.type)) throw new DomainError("Unsupported payment webhook", 422);
  const data = payload.data as Record<string, unknown> | undefined, order = data?.order as Record<string, unknown> | undefined, payment = data?.payment as Record<string, unknown> | undefined;
  if (!order || !payment || typeof order.order_id !== "string" || typeof order.order_amount !== "number" || typeof order.order_currency !== "string" || (typeof payment.cf_payment_id !== "string" && typeof payment.cf_payment_id !== "number") || typeof payment.payment_status !== "string" || typeof payment.payment_amount !== "number" || typeof payment.payment_currency !== "string") throw new DomainError("Invalid payment webhook", 422);
  return payload as unknown as CashfreeWebhook;
}

export async function ingestCashfreeWebhook(db: Db, input: unknown) {
  const event = parseCashfreeWebhook(input), providerPaymentId = String(event.data.payment.cf_payment_id), eventKey = `${event.type}:${providerPaymentId}`;
  return withTransitionRetry(db, async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.provider, "CASHFREE"), eq(payments.providerOrderId, event.data.order.order_id))).limit(1);
    if (!payment) throw new DomainError("Payment order unavailable", 404);
    const amount = Number(payment.amount);
    if (event.data.order.order_amount !== amount || event.data.payment.payment_amount !== amount || event.data.order.order_currency !== payment.currency || event.data.payment.payment_currency !== payment.currency) throw new DomainError("Payment webhook amount or currency mismatch", 422);
    const result = event.type === "PAYMENT_SUCCESS_WEBHOOK" && event.data.payment.payment_status === "SUCCESS" ? "PAID" : "IGNORED";
    if (result === "PAID") await recordVerifiedPayment(tx, payment.orderId, providerPaymentId);
    const [receipt] = await tx.insert(cashfreeWebhookEvents).values({ eventKey, eventType: event.type, providerOrderId: event.data.order.order_id, providerPaymentId, orderId: payment.orderId, result }).onConflictDoNothing().returning({ id: cashfreeWebhookEvents.id });
    if (!receipt) return { accepted: 0, duplicates: 1 };
    return { accepted: 1, duplicates: 0 };
  });
}
