import { and, eq, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminAddresses } from "../../db/schema/admin";
import { orderItems, orders, payments } from "../../db/schema/orders";
import { categories, products } from "../../db/schema/catalog";
import { refunds, returnInspections, returnItems, returns } from "../../db/schema/returns";
import { shipmentItems, shipments } from "../../db/schema/shipping";
import { admins } from "../../db/schema/rbac";
import type { Actor } from "../../middleware/authorization";
import { DomainError, requiredText } from "../admin/admin.service";
import { CashfreeRefundAdapter } from "./cashfree-refund.adapter";
import { withTransitionRetry } from "../reservation.service";
import { requireFulfillmentEligible } from "../order-eligibility";

type Db = ReturnType<typeof createDb>["db"];

export function returnWindowDays(raw: string | undefined): number {
  if (raw !== "5") throw new DomainError("The 5-day return policy is not configured", 409);
  return 5;
}

export function withinReturnWindow(deliveredAt: Date | null, now: Date, windowDays: number): boolean {
  return deliveredAt !== null && Number.isInteger(windowDays) && windowDays === 5
    && now.getTime() >= deliveredAt.getTime() && now.getTime() <= deliveredAt.getTime() + 5 * 86400000;
}

export async function requestReturn(db: Db, customerId: string, orderItemId: string, quantity: number, reason: string, notes: string | null, windowDays: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new DomainError("Invalid return quantity", 422);
  return withTransitionRetry(db, async (tx) => {
    const [item] = await tx.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
    if (!item || quantity > item.quantity) throw new DomainError("Order item unavailable", 404);
    // Shared with settlement/payout eligibility. Check the deadline only after
    // waiting for this lock, so a stale pre-lock check cannot admit a late return.
    const [order] = await tx.select({ customerId: orders.customerId, paymentStatus: orders.paymentStatus, deliveredAt: orders.deliveredAt }).from(orders).where(eq(orders.id, item.orderId)).limit(1).for("update");
    if (order?.customerId !== customerId) throw new DomainError("Order item unavailable", 404);
    if (order.paymentStatus !== "PAID") throw new DomainError("Paid order required", 422);
    const [product] = await tx.select({ returnEnabled: products.returnEnabled, categorySlug: categories.slug })
      .from(products).innerJoin(categories, eq(products.categoryId, categories.id)).where(eq(products.id, item.productId)).limit(1);
    if (!product?.returnEnabled || product.categorySlug !== "dress") throw new DomainError("Product is not returnable", 422);
    const [existing] = await tx.select({ id: returnItems.id }).from(returnItems).where(eq(returnItems.orderItemId, orderItemId)).limit(1);
    if (existing) throw new DomainError("Order item already has a return", 409);
    const [delivery] = await tx.select({ deliveredAt: shipments.deliveredAt }).from(shipmentItems)
      .innerJoin(shipments, eq(shipmentItems.shipmentId, shipments.id))
      .where(and(eq(shipmentItems.orderItemId, orderItemId), eq(shipments.status, "DELIVERED"))).limit(1);
    if (!delivery?.deliveredAt) throw new DomainError("Delivered shipment required", 422);
    if (!order.deliveredAt) throw new DomainError("Delivered order required", 422);
    // Keep PostgreSQL timestamp precision at the inclusive boundary. Converting
    // to a JavaScript Date would truncate fractions of a millisecond and could
    // overlap settlement's strictly-after deadline.
    const [clock] = await tx.select({ within: sql<boolean>`clock_timestamp() between ${orders.deliveredAt} and ${orders.deliveredAt} + interval '5 days'` })
      .from(orders).where(eq(orders.id, item.orderId));
    if (windowDays !== 5 || !clock.within) throw new DomainError("Return window has closed", 422);
    const [result] = await tx.insert(returns).values({ orderId: item.orderId, customerId, adminId: item.adminId, reason: requiredText(reason, "reason", 500), customerNotes: notes?.slice(0, 2000) ?? null }).returning();
    await tx.insert(returnItems).values({ returnId: result.id, orderItemId, orderId: item.orderId, adminId: item.adminId, quantity });
    return result;
  });
}

export async function decideReturn(db: Db, returnId: string, adminId: string, approve: boolean, notes: string) {
  return withTransitionRetry(db, async (tx) => {
    const [record] = await tx.select().from(returns).where(and(eq(returns.id, returnId), eq(returns.adminId, adminId))).limit(1).for("update");
    if (!record) throw new DomainError("Return unavailable", 404);
    // A replay must preserve the original timestamp, notes and address snapshot,
    // including when an approved return has progressed to receipt/QC/refund.
    if (approve ? record.approvedAt !== null : record.status === "REJECTED") return record;
    if (record.status !== "REQUESTED") throw new DomainError("RETURN_DECISION_CONFLICT", 409);
    let address: typeof record.returnAddressSnapshot = null;
    if (approve) {
      const [configured] = await tx.select().from(adminAddresses).where(and(eq(adminAddresses.adminId, adminId), eq(adminAddresses.addressType, "RETURN"), eq(adminAddresses.isActive, true))).limit(1);
      if (!configured) throw new DomainError("Return address is required", 422);
      address = { contactName: configured.contactName, phone: configured.phone, line1: configured.line1, line2: configured.line2, city: configured.city, state: configured.state, postalCode: configured.postalCode, country: configured.country, businessName: configured.businessName };
    }
    const [result] = await tx.update(returns).set({ status: approve ? "APPROVED" : "REJECTED", approvedAt: approve ? new Date() : null, returnAddressSnapshot: address, qcNotes: notes, updatedAt: new Date() }).where(eq(returns.id, returnId)).returning();
    return result;
  });
}

export async function markReturnReceived(db: Db, returnId: string, adminId: string) {
  return withTransitionRetry(db, async (tx) => {
    const [record] = await tx.select().from(returns).where(and(eq(returns.id, returnId), eq(returns.adminId, adminId))).limit(1).for("update");
    if (!record) throw new DomainError("Return unavailable", 404);
    if (record.receivedAt) return record;
    if (record.status !== "APPROVED") throw new DomainError("RETURN_RECEIPT_CONFLICT", 409);
    const [result] = await tx.update(returns).set({ status: "RECEIVED", receivedAt: new Date(), updatedAt: new Date() }).where(eq(returns.id, returnId)).returning();
    return result;
  });
}

export async function inspectReturn(db: Db, returnId: string, adminId: string, decision: "APPROVED" | "REJECTED", conditionStatus: string, packagingStatus: string | null, notes: string) {
  return withTransitionRetry(db, async (tx) => {
    const [record] = await tx.select().from(returns).where(and(eq(returns.id, returnId), eq(returns.adminId, adminId))).limit(1).for("update");
    if (!record) throw new DomainError("Return unavailable", 404);
    const [existing] = await tx.select().from(returnInspections).where(eq(returnInspections.returnId, returnId)).limit(1);
    if (existing) {
      if (existing.decision === decision) return existing;
      throw new DomainError("RETURN_QC_CONFLICT", 409);
    }
    if (!record || record.status !== "RECEIVED" || !record.receivedAt) throw new DomainError("Seller receipt is required before QC", 409);
    const [inspection] = await tx.insert(returnInspections).values({ returnId, inspectedByAdminId: adminId, conditionStatus: requiredText(conditionStatus, "conditionStatus", 100), packagingStatus, notes, decision, inspectedAt: new Date() }).returning();
    await tx.update(returns).set({ status: decision === "APPROVED" ? "QC_APPROVED" : "QC_REJECTED", qcStatus: decision, qcNotes: notes, updatedAt: new Date() }).where(eq(returns.id, returnId));
    return inspection;
  });
}

function paise(value: string): number {
  const [whole, decimals = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0").slice(0, 2));
}

export async function authorizeRefund(db: Db, returnId: string) {
  return withTransitionRetry(db, async (tx) => {
    const [reference] = await tx.select({ orderId: returns.orderId }).from(returns).where(eq(returns.id, returnId)).limit(1);
    if (!reference) throw new DomainError("RETURN_UNAVAILABLE", 404);
    const [order] = await tx.select().from(orders).where(eq(orders.id, reference.orderId)).limit(1).for("update");
    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, reference.orderId)).limit(1).for("update");
    const [record] = await tx.select().from(returns).where(eq(returns.id, returnId)).limit(1).for("update");
    const [existing] = await tx.select().from(refunds).where(eq(refunds.returnId, returnId)).limit(1);
    if (existing) return existing;
    if (!record || record.status !== "QC_APPROVED" || !record.receivedAt) throw new DomainError("Receipt and approved QC are required", 409);
    requireFulfillmentEligible(order, payment, true);
    if (order.status !== "DELIVERED" || !order.deliveredAt) throw new DomainError("DELIVERED_ORDER_REQUIRED", 409);
    const [inspection] = await tx.select().from(returnInspections).where(and(eq(returnInspections.returnId, returnId), eq(returnInspections.decision, "APPROVED"))).limit(1);
    if (!inspection) throw new DomainError("Approved QC inspection is required", 409);
    if (!payment?.providerOrderId) throw new DomainError("Verified provider payment is required", 422);
    const itemRows = await tx.select({ quantity: returnItems.quantity, purchasedQuantity: orderItems.quantity, totalAmount: orderItems.totalAmount }).from(returnItems)
      .innerJoin(orderItems, eq(returnItems.orderItemId, orderItems.id)).where(eq(returnItems.returnId, returnId));
    const grossPaise = itemRows.reduce((total, item) => total + Math.round(paise(item.totalAmount) * item.quantity / item.purchasedQuantity), 0);
    const priorRefunds = await tx.select({ amount: refunds.amount, status: refunds.status }).from(refunds).where(eq(refunds.paymentId, payment.id));
    const alreadyReserved = priorRefunds.filter((refund) => refund.status !== "FAILED").reduce((total, refund) => total + paise(refund.amount), 0);
    if (grossPaise <= 0 || grossPaise + alreadyReserved > paise(payment.amount)) throw new DomainError("Refund amount exceeds the verified payment", 422);
    // V1 has no platform return-courier deduction: the customer pays the courier directly.
    const amount = (grossPaise / 100).toFixed(2);
    const [refund] = await tx.insert(refunds).values({ returnId, orderId: record.orderId, paymentId: payment.id, amount, currency: payment.currency, reason: "APPROVED_RETURN", status: "PENDING_PROVIDER" }).returning();
    await tx.update(returns).set({ grossRefundAmount: amount, deductionAmount: "0", netRefundAmount: amount, deductionBreakdown: {}, updatedAt: new Date() }).where(eq(returns.id, returnId));
    return refund;
  });
}

export async function submitRefund(db: Db, returnId: string, provider: CashfreeRefundAdapter) {
  const [refund] = await db.select().from(refunds).where(eq(refunds.returnId, returnId)).limit(1);
  if (!refund) throw new DomainError("Authorized refund unavailable", 404);
  if (refund.status === "SUCCESS") return refund;
  if (refund.status === "FAILED") throw new DomainError("Failed refund needs manual review", 409);
  const [payment] = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  const [record] = await db.select().from(returns).where(eq(returns.id, returnId)).limit(1);
  if (!payment?.providerOrderId || payment.provider !== "CASHFREE" || payment.status !== "PAID" || !payment.providerPaymentId
    || payment.orderId !== refund.orderId || payment.currency !== refund.currency
    || !record || record.orderId !== refund.orderId || refund.reason !== "APPROVED_RETURN")
    throw new DomainError("Refund provider association unavailable", 409);

  const finalize = (status: "SUCCESS" | "FAILED" | "PROCESSING", providerReference: string | null) => withTransitionRetry(db, async (tx) => {
    // Provider I/O stays outside this transaction. Every decision is checked
    // again after locking order -> payment -> return -> refund.
    const [lockedOrder] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, refund.orderId)).for("update");
    const [lockedPayment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).for("update");
    const [lockedReturn] = await tx.select().from(returns).where(eq(returns.id, returnId)).for("update");
    const [current] = await tx.select().from(refunds).where(eq(refunds.id, refund.id)).for("update");
    if (!lockedOrder || !lockedPayment || !lockedReturn || !current || current.returnId !== returnId
      || current.orderId !== lockedOrder.id || lockedReturn.orderId !== lockedOrder.id
      || lockedPayment.orderId !== lockedOrder.id || lockedPayment.provider !== "CASHFREE"
      || lockedPayment.providerOrderId !== payment.providerOrderId || lockedPayment.providerPaymentId !== payment.providerPaymentId
      || lockedPayment.currency !== current.currency || lockedPayment.status !== "PAID"
      || current.paymentId !== lockedPayment.id || current.reason !== "APPROVED_RETURN" || current.amount !== refund.amount)
      throw new DomainError("Refund provider association changed", 409);
    if (current.status === "SUCCESS") return current;
    if (current.status === "FAILED") {
      if (status === "SUCCESS") throw new DomainError("Failed refund needs manual review", 409);
      return current;
    }
    if (current.providerReference && providerReference && current.providerReference !== providerReference)
      throw new DomainError("Refund provider reference conflict", 409);
    if (current.status === status && (!providerReference || current.providerReference === providerReference)) return current;
    const [saved] = await tx.update(refunds).set({ status, providerReference: providerReference ?? current.providerReference, updatedAt: new Date() }).where(eq(refunds.id, current.id)).returning();
    await tx.update(returns).set({ status: status === "SUCCESS" ? "REFUNDED" : status === "FAILED" ? "RETURN_ISSUE" : "REFUND_PROCESSING", updatedAt: new Date() }).where(eq(returns.id, returnId));
    return saved;
  });

  let result: Awaited<ReturnType<CashfreeRefundAdapter["createRefund"]>>;
  try {
    result = refund.status === "PENDING_PROVIDER"
      ? await provider.createRefund(payment.providerOrderId, refund.id, refund.amount)
      : await provider.getRefund(payment.providerOrderId, refund.id);
    if (result.refundId !== refund.id || result.orderId !== payment.providerOrderId
      || result.currency !== refund.currency || Math.round(result.amount * 100) !== paise(refund.amount)
      || result.providerPaymentId !== payment.providerPaymentId
      || (["SUCCESS", "CANCELLED", "REJECTED"].includes(result.status) && !result.providerReference))
      throw new DomainError("Refund provider result mismatch", 502);
  } catch (error) {
    // A lost or unattributable response is UNKNOWN, not FAILED. The merchant
    // refund ID and payment order ID remain available for a later GET lookup.
    await finalize("PROCESSING", null);
    throw error;
  }
  const status = result.status === "SUCCESS" ? "SUCCESS" : ["CANCELLED", "REJECTED"].includes(result.status) ? "FAILED" : "PROCESSING";
  return finalize(status, result.providerReference);
}

export async function getReturn(db: Db, returnId: string, actor: Actor, view: "customer" | "admin") {
  const [record] = await db.select().from(returns).where(eq(returns.id, returnId)).limit(1);
  if (!record) throw new DomainError("Return unavailable", 404);
  if (view === "customer" && record.customerId !== actor.userId) throw new DomainError("Return unavailable", 404);
  if (view === "admin" && !actor.roles.includes("SUPER_ADMIN")) {
    if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("orders.view")) throw new DomainError("Return unavailable", 404);
    const [admin] = await db.select({ id: admins.id }).from(admins).where(eq(admins.userId, actor.userId)).limit(1);
    if (admin?.id !== record.adminId) throw new DomainError("Return unavailable", 404);
  }
  const [refund] = await db.select({ status: refunds.status, amount: refunds.amount, providerReference: refunds.providerReference }).from(refunds).where(eq(refunds.returnId, returnId)).limit(1);
  return {
    id: record.id, orderId: record.orderId, status: record.status, reason: record.reason,
    customerNotes: record.customerNotes, requestedAt: record.requestedAt, approvedAt: record.approvedAt,
    receivedAt: record.receivedAt, qcStatus: record.qcStatus, qcNotes: record.qcNotes,
    grossRefundAmount: record.grossRefundAmount, deductionAmount: record.deductionAmount,
    netRefundAmount: record.netRefundAmount, refund,
    returnAddress: ["APPROVED", "RETURN_PENDING", "RECEIVED", "QC_IN_PROGRESS", "QC_APPROVED", "QC_REJECTED", "REFUND_PROCESSING", "REFUNDED", "RETURN_ISSUE"].includes(record.status) ? record.returnAddressSnapshot : null,
  };
}
