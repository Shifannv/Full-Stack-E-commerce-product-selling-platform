import { and, eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminAddresses } from "../../db/schema/admin";
import { orderItems, orders, payments } from "../../db/schema/orders";
import { refunds, returnInspections, returnItems, returns } from "../../db/schema/returns";
import { shipmentItems, shipments } from "../../db/schema/shipping";
import { admins } from "../../db/schema/rbac";
import type { Actor } from "../../middleware/authorization";
import { DomainError, requiredText } from "../admin/admin.service";
import { CashfreeRefundAdapter } from "./cashfree-refund.adapter";

type Db = ReturnType<typeof createDb>["db"];

export function returnWindowDays(raw: string | undefined): number {
  const days = Number(raw);
  if (!raw || !Number.isInteger(days) || days < 1 || days > 365) throw new DomainError("Return policy window is not configured", 409);
  return days;
}

export async function requestReturn(db: Db, customerId: string, orderItemId: string, quantity: number, reason: string, notes: string | null, windowDays: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new DomainError("Invalid return quantity", 422);
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
  if (!item || quantity > item.quantity) throw new DomainError("Order item unavailable", 404);
  const [order] = await db.select({ customerId: orders.customerId, paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, item.orderId)).limit(1);
  if (order?.customerId !== customerId) throw new DomainError("Order item unavailable", 404);
  if (order.paymentStatus !== "PAID") throw new DomainError("Paid order required", 422);
  const [existing] = await db.select({ id: returnItems.id }).from(returnItems).where(eq(returnItems.orderItemId, orderItemId)).limit(1);
  if (existing) throw new DomainError("Order item already has a return", 409);
  const [delivery] = await db.select({ deliveredAt: shipments.deliveredAt }).from(shipmentItems)
    .innerJoin(shipments, eq(shipmentItems.shipmentId, shipments.id))
    .where(and(eq(shipmentItems.orderItemId, orderItemId), eq(shipments.status, "DELIVERED"))).limit(1);
  if (!delivery?.deliveredAt) throw new DomainError("Delivered shipment required", 422);
  if (Date.now() > delivery.deliveredAt.getTime() + windowDays * 86400000) throw new DomainError("Return window has closed", 422);
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(returns).values({ orderId: item.orderId, customerId, adminId: item.adminId, reason: requiredText(reason, "reason", 500), customerNotes: notes?.slice(0, 2000) ?? null }).returning();
    await tx.insert(returnItems).values({ returnId: result.id, orderItemId, orderId: item.orderId, adminId: item.adminId, quantity });
    return result;
  });
}

export async function decideReturn(db: Db, returnId: string, adminId: string, approve: boolean, notes: string) {
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(returns).where(and(eq(returns.id, returnId), eq(returns.adminId, adminId))).limit(1);
    if (!record) throw new DomainError("Return unavailable", 404);
    if (record.status !== "REQUESTED") throw new DomainError("Return is not pending", 409);
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
  const [result] = await db.update(returns).set({ status: "RECEIVED", receivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(returns.id, returnId), eq(returns.adminId, adminId), eq(returns.status, "APPROVED"))).returning();
  if (!result) throw new DomainError("Approved return unavailable", 409);
  return result;
}

export async function inspectReturn(db: Db, returnId: string, adminId: string, decision: "APPROVED" | "REJECTED", conditionStatus: string, packagingStatus: string | null, notes: string) {
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(returns).where(and(eq(returns.id, returnId), eq(returns.adminId, adminId))).limit(1);
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
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(returns).where(eq(returns.id, returnId)).limit(1);
    if (!record || record.status !== "QC_APPROVED" || !record.receivedAt) throw new DomainError("Receipt and approved QC are required", 409);
    const [existing] = await tx.select().from(refunds).where(eq(refunds.returnId, returnId)).limit(1);
    if (existing) return existing;
    const [inspection] = await tx.select().from(returnInspections).where(and(eq(returnInspections.returnId, returnId), eq(returnInspections.decision, "APPROVED"))).limit(1);
    if (!inspection) throw new DomainError("Approved QC inspection is required", 409);
    const [payment] = await tx.select().from(payments).where(and(eq(payments.orderId, record.orderId), eq(payments.status, "PAID"))).limit(1).for("update");
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
  const [payment] = await db.select({ providerOrderId: payments.providerOrderId }).from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  if (!payment?.providerOrderId) throw new DomainError("Provider payment reference unavailable", 422);
  const result = refund.status === "PENDING_PROVIDER"
    ? await provider.createRefund(payment.providerOrderId, refund.id, refund.amount)
    : await provider.getRefund(payment.providerOrderId, refund.id);
  const status = result.status === "SUCCESS" ? "SUCCESS" : ["CANCELLED", "REJECTED"].includes(result.status) ? "FAILED" : "PROCESSING";
  const [updated] = await db.transaction(async (tx) => {
    const [saved] = await tx.update(refunds).set({ status, providerReference: result.providerReference, updatedAt: new Date() }).where(eq(refunds.id, refund.id)).returning();
    await tx.update(returns).set({ status: status === "SUCCESS" ? "REFUNDED" : status === "FAILED" ? "RETURN_ISSUE" : "REFUND_PROCESSING", updatedAt: new Date() }).where(eq(returns.id, returnId));
    return [saved];
  });
  return updated;
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
