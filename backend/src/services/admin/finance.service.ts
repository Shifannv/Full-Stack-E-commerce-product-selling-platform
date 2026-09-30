import { and, eq, inArray } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminSettlements, payoutRequests, payoutSettlementItems } from "../../db/schema/finance";
import { orderItems, orders } from "../../db/schema/orders";
import { DomainError, requiredText } from "./admin.service";
import { requireSettlementEligible } from "./settlement-eligibility";
import { refunds, returnItems } from "../../db/schema/returns";
import { withTransitionRetry } from "../reservation.service";

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
  return withTransitionRetry(db, async (tx) => {
    paise(refundAdjustment);
    const item = await requireSettlementEligible(tx, orderItemId, refundAdjustment);
    const values = calculateSettlement(item.totalAmount, commissionBps, gatewayFeeBps, refundAdjustment);
    try { const [result] = await tx.insert(adminSettlements).values({ adminId: item.adminId, orderId: item.orderId, orderItemId: item.id, ...values }).returning(); return result; }
    catch (error) { if ((error as { code?: string }).code === "23505") throw new DomainError("Settlement already exists", 409); throw error; }
  });
}

export async function getAdminFinance(db: Db, adminId: string) {
  const settlements = await db.select().from(adminSettlements).where(eq(adminSettlements.adminId, adminId));
  const payouts = await db.select().from(payoutRequests).where(eq(payoutRequests.adminId, adminId));
  const available = settlements.filter((entry) => entry.status === "AVAILABLE").reduce((sum, entry) => sum + paise(entry.netPayable), 0);
  const refundObligations = await db.select({ refundId: refunds.id, orderId: refunds.orderId, orderItemId: returnItems.orderItemId, amount: refunds.amount, currency: refunds.currency, status: refunds.status })
    .from(refunds).innerJoin(returnItems, eq(returnItems.returnId, refunds.returnId)).where(eq(returnItems.adminId, adminId));
  return { availableBalance: rupees(available), settlements, payouts, refundObligations };
}

export async function requestPayout(db: Db, adminId: string) {
  const result = await withTransitionRetry(db, async (tx) => {
    // Freeze candidate IDs. Rows inserted later cannot enter this allocation.
    const candidates = await tx.select({ id: adminSettlements.id, orderId: adminSettlements.orderId })
      .from(adminSettlements).where(and(eq(adminSettlements.adminId, adminId), inArray(adminSettlements.status, ["AVAILABLE", "HELD"])))
      .orderBy(adminSettlements.orderId, adminSettlements.orderItemId, adminSettlements.id);
    if (!candidates.length) return null;
    const orderIds = [...new Set(candidates.map((row) => row.orderId))].sort();
    await tx.select({ id: orders.id }).from(orders).where(inArray(orders.id, orderIds)).orderBy(orders.id).for("update");
    const entries: (typeof adminSettlements.$inferSelect)[] = [];
    for (const candidate of candidates) {
      const [row] = await tx.select().from(adminSettlements).where(eq(adminSettlements.id, candidate.id));
      if (!row || row.adminId !== adminId || !["AVAILABLE", "HELD"].includes(row.status)) continue;
      try {
        const [reference] = await tx.select().from(orderItems).where(eq(orderItems.id, row.orderItemId));
        if (!reference || reference.adminId !== adminId || reference.orderId !== row.orderId)
          throw new DomainError("SETTLEMENT_OWNER_INVALID", 409);
        const item = await requireSettlementEligible(tx, row.orderItemId, row.refundAdjustmentAmount);
        if (item.adminId !== adminId || item.orderId !== row.orderId || paise(item.totalAmount) !== paise(row.grossAmount))
          throw new DomainError("SETTLEMENT_OWNER_INVALID", 409);
        if (paise(row.netPayable) !== paise(row.grossAmount) - paise(row.commissionAmount) - paise(row.gatewayFeeAmount) - paise(row.refundAdjustmentAmount))
          throw new DomainError("SETTLEMENT_AMOUNT_INVALID", 409);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        await tx.update(adminSettlements).set({ status: "HELD", updatedAt: new Date() })
          .where(and(eq(adminSettlements.id, row.id), inArray(adminSettlements.status, ["AVAILABLE", "HELD"])));
        continue;
      }
      const [locked] = await tx.select().from(adminSettlements).where(eq(adminSettlements.id, row.id)).for("update");
      if (!locked || locked.adminId !== adminId || !["AVAILABLE", "HELD"].includes(locked.status)) continue;
      for (const field of ["orderId", "orderItemId", "grossAmount", "commissionAmount", "gatewayFeeAmount", "refundAdjustmentAmount", "netPayable"] as const) {
        if (locked[field] !== row[field]) throw new DomainError("SETTLEMENT_CHANGED", 409);
      }
      const [allocated] = await tx.select({ id: payoutSettlementItems.id }).from(payoutSettlementItems).where(eq(payoutSettlementItems.settlementId, locked.id));
      if (allocated) throw new DomainError("SETTLEMENT_ALREADY_ALLOCATED", 409);
      entries.push(locked);
    }
    if (!entries.length || entries.every((entry) => paise(entry.netPayable) === 0)) return null;
    const ids = entries.map((entry) => entry.id);
    const amount = rupees(entries.reduce((sum, entry) => sum + paise(entry.netPayable), 0));
    const [request] = await tx.insert(payoutRequests).values({ adminId, amount }).returning();
    await tx.insert(payoutSettlementItems).values(entries.map((entry) => ({ payoutRequestId: request.id, settlementId: entry.id })));
    const updated = await tx.update(adminSettlements).set({ status: "PAYOUT_PENDING", updatedAt: new Date() })
      .where(and(inArray(adminSettlements.id, ids), eq(adminSettlements.adminId, adminId), inArray(adminSettlements.status, ["AVAILABLE", "HELD"])))
      .returning({ id: adminSettlements.id });
    if (updated.length !== ids.length) throw new DomainError("SETTLEMENT_ALLOCATION_CONFLICT", 409);
    return request;
  });
  // Preserve quarantine changes even if no payable balance remains.
  if (!result) throw new DomainError("No payable balance is available", 409);
  return result;
}

export async function reviewPayout(db: Db, payoutId: string, userId: string, decision: "APPROVED" | "REJECTED", notes: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx.update(payoutRequests).set({ status: decision, reviewedByUserId: userId, reviewNotes: requiredText(notes, "notes", 1000), reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(payoutRequests.id, payoutId), eq(payoutRequests.status, "REQUESTED"))).returning();
    if (!request) throw new DomainError("Pending payout unavailable", 409);
    if (decision === "REJECTED") {
      const links = await tx.select({ id: payoutSettlementItems.settlementId }).from(payoutSettlementItems).where(eq(payoutSettlementItems.payoutRequestId, payoutId));
      for (const link of links) await tx.update(adminSettlements).set({ status: "HELD", updatedAt: new Date() }).where(eq(adminSettlements.id, link.id));
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
