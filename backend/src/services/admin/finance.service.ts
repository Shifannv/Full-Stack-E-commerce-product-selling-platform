import { and, eq, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminSettlements, payoutRequests, payoutSettlementItems } from "../../db/schema/finance";
import { orderItems, orders, payments } from "../../db/schema/orders";
import { DomainError, requiredText } from "./admin.service";

type Db = ReturnType<typeof createDb>["db"];
const paise = (value: string) => { if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new DomainError("Invalid amount", 422); const [whole, decimal = ""] = value.split("."); return Number(whole) * 100 + Number(decimal.padEnd(2, "0")); };
const rupees = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

export function calculateSettlement(gross: string, commissionBps: number, gatewayFeeBps: number, refundAdjustment = "0.00") {
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10000 || !Number.isInteger(gatewayFeeBps) || gatewayFeeBps < 0 || gatewayFeeBps > 10000) throw new DomainError("Invalid fee rate", 422);
  const grossPaise = paise(gross), refundPaise = paise(refundAdjustment);
  const commission = Math.round(grossPaise * commissionBps / 10000), gateway = Math.round(grossPaise * gatewayFeeBps / 10000);
  const net = grossPaise - commission - gateway - refundPaise;
  if (net < 0) throw new DomainError("Adjustments exceed gross amount", 422);
  return { grossAmount: rupees(grossPaise), commissionAmount: rupees(commission), gatewayFeeAmount: rupees(gateway), refundAdjustmentAmount: rupees(refundPaise), netPayable: rupees(net) };
}

export async function createSettlement(db: Db, orderItemId: string, commissionBps: number, gatewayFeeBps: number, refundAdjustment: string) {
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
  if (!item) throw new DomainError("Order item unavailable", 404);
  const [order] = await db.select({ paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.id, item.orderId)).limit(1);
  const [payment] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.orderId, item.orderId), eq(payments.status, "PAID"))).limit(1);
  if (order?.paymentStatus !== "PAID" || !payment) throw new DomainError("Verified paid order required", 422);
  const values = calculateSettlement(item.totalAmount, commissionBps, gatewayFeeBps, refundAdjustment);
  try { const [result] = await db.insert(adminSettlements).values({ adminId: item.adminId, orderId: item.orderId, orderItemId: item.id, ...values }).returning(); return result; }
  catch (error) { if ((error as { code?: string }).code === "23505") throw new DomainError("Settlement already exists", 409); throw error; }
}

export async function getAdminFinance(db: Db, adminId: string) {
  const settlements = await db.select().from(adminSettlements).where(eq(adminSettlements.adminId, adminId));
  const payouts = await db.select().from(payoutRequests).where(eq(payoutRequests.adminId, adminId));
  const available = settlements.filter((entry) => entry.status === "AVAILABLE").reduce((sum, entry) => sum + paise(entry.netPayable), 0);
  return { availableBalance: rupees(available), settlements, payouts };
}

export async function requestPayout(db: Db, adminId: string) {
  return db.transaction(async (tx) => {
    const entries = await tx.select().from(adminSettlements).where(and(eq(adminSettlements.adminId, adminId), eq(adminSettlements.status, "AVAILABLE"))).for("update");
    if (!entries.length) throw new DomainError("No payable balance is available", 409);
    const amount = rupees(entries.reduce((sum, entry) => sum + paise(entry.netPayable), 0));
    const [request] = await tx.insert(payoutRequests).values({ adminId, amount }).returning();
    await tx.insert(payoutSettlementItems).values(entries.map((entry) => ({ payoutRequestId: request.id, settlementId: entry.id })));
    await tx.update(adminSettlements).set({ status: "PAYOUT_PENDING", updatedAt: new Date() }).where(and(eq(adminSettlements.adminId, adminId), eq(adminSettlements.status, "AVAILABLE")));
    return request;
  });
}

export async function reviewPayout(db: Db, payoutId: string, userId: string, decision: "APPROVED" | "REJECTED", notes: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx.update(payoutRequests).set({ status: decision, reviewedByUserId: userId, reviewNotes: requiredText(notes, "notes", 1000), reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(payoutRequests.id, payoutId), eq(payoutRequests.status, "REQUESTED"))).returning();
    if (!request) throw new DomainError("Pending payout unavailable", 409);
    if (decision === "REJECTED") {
      const links = await tx.select({ id: payoutSettlementItems.settlementId }).from(payoutSettlementItems).where(eq(payoutSettlementItems.payoutRequestId, payoutId));
      for (const link of links) await tx.update(adminSettlements).set({ status: "AVAILABLE", updatedAt: new Date() }).where(eq(adminSettlements.id, link.id));
      await tx.delete(payoutSettlementItems).where(eq(payoutSettlementItems.payoutRequestId, payoutId));
    }
    return request;
  });
}

export async function markPayoutPaid(db: Db, payoutId: string, reference: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx.update(payoutRequests).set({ status: "PAID", paidAt: new Date(), paymentReference: requiredText(reference, "paymentReference", 200), updatedAt: new Date() }).where(and(eq(payoutRequests.id, payoutId), eq(payoutRequests.status, "APPROVED"))).returning();
    if (!request) throw new DomainError("Approved payout unavailable", 409);
    const links = await tx.select({ id: payoutSettlementItems.settlementId }).from(payoutSettlementItems).where(eq(payoutSettlementItems.payoutRequestId, payoutId));
    for (const link of links) await tx.update(adminSettlements).set({ status: "PAID", updatedAt: new Date() }).where(eq(adminSettlements.id, link.id));
    return request;
  });
}
