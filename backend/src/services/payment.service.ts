import { and, eq, sql } from "drizzle-orm";
import type { createDb } from "../db";
import { users } from "../db/schema/auth";
import { cashfreeWebhookEvents, orders, payments } from "../db/schema/orders";
import { DomainError } from "./admin/admin.service";
import type { CashfreePaymentAdapter } from "./cashfree-payment.adapter";
import {
  recordVerifiedPayment,
  withTransitionRetry,
} from "./reservation.service";

type Db = ReturnType<typeof createDb>["db"];

export async function createPaymentSession(
  db: Db,
  provider: CashfreePaymentAdapter,
  orderId: string,
  customerId: string,
  returnUrl: string,
  notifyUrl: string,
) {
  const outcome = await db.transaction(async (tx) => {
    // The order lock is shared with expiry, cancellation and verified payment.
    // It covers the provider call so none can make this order ineligible before
    // session creation. The adapter uses the persisted deterministic order ID.
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
      .for("update");
    if (!order) throw new DomainError("Order unavailable", 404);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.orderId, order.id), eq(payments.provider, "CASHFREE")),
      )
      .for("update");
    const [customer] = await tx
      .select()
      .from(users)
      .where(eq(users.id, customerId));
    if (!payment || !customer) throw new DomainError("Order unavailable", 404);
    const [clock] = await tx
      .select({
        eligible: sql<boolean>`${orders.paymentExpiresAt} > clock_timestamp()`,
      })
      .from(orders)
      .where(eq(orders.id, order.id));
    if (
      order.status !== "CREATED" ||
      order.stockState !== "RESERVED" ||
      order.paymentStatus !== "PENDING" ||
      order.expiredAt ||
      order.cancelledAt ||
      payment.status !== "PENDING" ||
      payment.resolutionStatus !== "NONE" ||
      payment.amount !== order.totalAmount ||
      payment.currency !== order.currency ||
      (payment.providerOrderId !== null &&
        payment.providerOrderId !== order.id) ||
      !clock.eligible
    )
      throw new DomainError("PAYMENT_SESSION_INELIGIBLE", 409);
    const expectedOrderId = payment.providerOrderId ?? order.id;
    const result = await provider.createOrder({
      orderId: expectedOrderId,
      amount: payment.amount,
      currency: payment.currency,
      customerId,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: order.shippingAddressSnapshot.phone,
      returnUrl,
      notifyUrl,
    });
    if (result.providerOrderId !== expectedOrderId || !result.paymentSessionId)
      throw new DomainError("Payment provider order mismatch", 502);
    const [saved] = await tx
      .update(payments)
      .set({ providerOrderId: result.providerOrderId, updatedAt: new Date() })
      .where(
        and(
          eq(payments.id, payment.id),
          eq(payments.status, "PENDING"),
          eq(payments.resolutionStatus, "NONE"),
        ),
      )
      .returning({ id: payments.id });
    if (!saved) throw new DomainError("PAYMENT_SESSION_STATE_CHANGED", 409);
    const [remaining] = await tx
      .select({
        eligible: sql<boolean>`${orders.paymentExpiresAt} > clock_timestamp()`,
      })
      .from(orders)
      .where(eq(orders.id, order.id));
    return {
      paymentSessionId: result.paymentSessionId,
      eligible: remaining.eligible,
    };
  });
  // If the deadline passed during the provider call, retain its deterministic
  // reference for late-payment reconciliation but never return the session.
  if (!outcome.eligible)
    throw new DomainError("PAYMENT_SESSION_INELIGIBLE", 409);
  return { orderId, paymentSessionId: outcome.paymentSessionId };
}

type CashfreeWebhook = {
  type:
    | "PAYMENT_SUCCESS_WEBHOOK"
    | "PAYMENT_FAILED_WEBHOOK"
    | "PAYMENT_USER_DROPPED_WEBHOOK";
  data: {
    order: { order_id: string; order_amount: number; order_currency: string };
    payment: {
      cf_payment_id: string | number;
      payment_status: string;
      payment_amount: number;
      payment_currency: string;
    };
  };
};
export function parseCashfreeWebhook(value: unknown): CashfreeWebhook {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("Invalid payment webhook", 422);
  const payload = value as Record<string, unknown>,
    allowed = [
      "PAYMENT_SUCCESS_WEBHOOK",
      "PAYMENT_FAILED_WEBHOOK",
      "PAYMENT_USER_DROPPED_WEBHOOK",
    ];
  if (typeof payload.type !== "string" || !allowed.includes(payload.type))
    throw new DomainError("Unsupported payment webhook", 422);
  const data = payload.data as Record<string, unknown> | undefined,
    order = data?.order as Record<string, unknown> | undefined,
    payment = data?.payment as Record<string, unknown> | undefined;
  if (
    !order ||
    !payment ||
    typeof order.order_id !== "string" ||
    typeof order.order_amount !== "number" ||
    typeof order.order_currency !== "string" ||
    (typeof payment.cf_payment_id !== "string" &&
      typeof payment.cf_payment_id !== "number") ||
    typeof payment.payment_status !== "string" ||
    typeof payment.payment_amount !== "number" ||
    typeof payment.payment_currency !== "string"
  )
    throw new DomainError("Invalid payment webhook", 422);
  return payload as unknown as CashfreeWebhook;
}

export async function ingestCashfreeWebhook(db: Db, input: unknown) {
  const event = parseCashfreeWebhook(input),
    providerPaymentId = String(event.data.payment.cf_payment_id),
    eventKey = `${event.type}:${providerPaymentId}`;
  return withTransitionRetry(db, async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.provider, "CASHFREE"),
          eq(payments.providerOrderId, event.data.order.order_id),
        ),
      )
      .limit(1);
    if (!payment) throw new DomainError("Payment order unavailable", 404);
    const amount = Number(payment.amount);
    if (
      event.data.order.order_amount !== amount ||
      event.data.payment.payment_amount !== amount ||
      event.data.order.order_currency !== payment.currency ||
      event.data.payment.payment_currency !== payment.currency
    )
      throw new DomainError("Payment webhook amount or currency mismatch", 422);
    const result =
      event.type === "PAYMENT_SUCCESS_WEBHOOK" &&
      event.data.payment.payment_status === "SUCCESS"
        ? "PAID"
        : "IGNORED";
    if (result === "PAID")
      await recordVerifiedPayment(tx, payment.orderId, providerPaymentId);
    const [receipt] = await tx
      .insert(cashfreeWebhookEvents)
      .values({
        eventKey,
        eventType: event.type,
        providerOrderId: event.data.order.order_id,
        providerPaymentId,
        orderId: payment.orderId,
        result,
      })
      .onConflictDoNothing()
      .returning({ id: cashfreeWebhookEvents.id });
    if (!receipt) return { accepted: 0, duplicates: 1 };
    return { accepted: 1, duplicates: 0 };
  });
}
