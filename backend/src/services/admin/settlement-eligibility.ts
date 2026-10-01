import { and, eq, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { orderItems, orders, payments } from "../../db/schema/orders";
import { refunds, returnItems, returns } from "../../db/schema/returns";
import { DomainError } from "./admin.service";
import { requireFulfillmentEligible } from "../order-eligibility";

type Db = ReturnType<typeof createDb>["db"];
export type FinanceTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Lock order: all orders (UUID ascending for a batch), then for each item:
// payment -> order item -> returns -> refunds -> settlement. Return creation and
// refund authorization share the order lock; QC only locks the return row.
// Callers retain these locks until the settlement/allocation transaction commits.
export async function requireSettlementEligible(
  tx: FinanceTx,
  orderItemId: string,
  refundAdjustment: string,
) {
  const [reference] = await tx
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId));
  if (!reference) throw new DomainError("Order item unavailable", 404);
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, reference.orderId))
    .for("update");
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.orderId, reference.orderId))
    .for("update");
  requireFulfillmentEligible(order, payment, true);
  if (order.status !== "DELIVERED" || !order.deliveredAt)
    throw new DomainError("SETTLEMENT_DELIVERY_REQUIRED", 409);
  const [item] = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .for("update");
  const itemReturns = await tx
    .select({ id: returns.id, status: returns.status })
    .from(returns)
    .innerJoin(returnItems, eq(returnItems.returnId, returns.id))
    .where(eq(returnItems.orderItemId, item.id))
    .orderBy(returns.id)
    .for("update", { of: returns });
  let recordedAdjustment = 0;
  for (const record of itemReturns) {
    const obligations = await tx
      .select()
      .from(refunds)
      .where(eq(refunds.returnId, record.id))
      .orderBy(refunds.id)
      .for("update");
    const rejected =
      ["REJECTED", "QC_REJECTED"].includes(record.status) &&
      obligations.length === 0;
    const refunded =
      record.status === "REFUNDED" &&
      obligations.length === 1 &&
      obligations[0].status === "SUCCESS";
    if (!rejected && !refunded)
      throw new DomainError("RETURN_REFUND_UNRESOLVED", 409);
    if (refunded) {
      const refund = obligations[0];
      if (
        refund.paymentId !== payment.id ||
        refund.orderId !== order.id ||
        refund.currency !== payment.currency
      )
        throw new DomainError("SETTLEMENT_REFUND_SCOPE_INVALID", 409);
      // V1 creates one item per return. Never charge a whole multi-item refund
      // to each item if historical/imported data violates that contract.
      const links = await tx
        .select({ id: returnItems.orderItemId })
        .from(returnItems)
        .where(eq(returnItems.returnId, record.id));
      if (links.length !== 1 || links[0].id !== item.id)
        throw new DomainError("SETTLEMENT_REFUND_SCOPE_INVALID", 409);
      recordedAdjustment += Math.round(Number(refund.amount) * 100);
    }
  }
  const orderObligations = await tx
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(eq(refunds.paymentId, payment.id), sql`${refunds.returnId} is null`),
    )
    .for("update");
  if (orderObligations.length)
    throw new DomainError("RETURN_REFUND_UNRESOLVED", 409);
  if (Math.round(Number(refundAdjustment) * 100) < recordedAdjustment)
    throw new DomainError("REFUND_ADJUSTMENT_REQUIRED", 409);
  // Check the database clock AFTER acquiring locks. Returns include the exact
  // fifth-day endpoint, so settlement eligibility begins strictly after it.
  const [clock] = await tx
    .select({
      elapsed: sql<boolean>`${orders.deliveredAt} + interval '5 days' < clock_timestamp()`,
    })
    .from(orders)
    .where(eq(orders.id, order.id));
  if (!clock.elapsed)
    throw new DomainError("SETTLEMENT_RETURN_WINDOW_OPEN", 409);
  return item;
}
