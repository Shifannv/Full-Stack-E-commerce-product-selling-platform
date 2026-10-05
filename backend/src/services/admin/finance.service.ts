import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { createDb } from "../../db";
import {
  adminSettlements,
  payoutRequests,
  payoutSettlementItems,
  platformFinanceSettings,
} from "../../db/schema/finance";
import { orderItems, orders } from "../../db/schema/orders";
import { DomainError, requiredText } from "./admin.service";
import { requireSettlementEligible } from "./settlement-eligibility";
import { refunds, returnItems } from "../../db/schema/returns";
import { withTransitionRetry } from "../reservation.service";
import { recordSensitiveAction } from "../security-audit";
import { admins } from "../../db/schema/rbac";
import { requireVerifiedBank } from "./bank.service";

type Db = ReturnType<typeof createDb>["db"];
type FinanceSettingKey = "COMMISSION_BPS" | "PAYMENT_GATEWAY_FEE_BPS";
type FinanceTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const financeSettingKeys: FinanceSettingKey[] = [
  "COMMISSION_BPS",
  "PAYMENT_GATEWAY_FEE_BPS",
];
const paise = (value: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new DomainError("Invalid amount", 422);
  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
};
const rupees = (value: number) =>
  `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

function validBasisPoints(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10000
  );
}

export function parseBasisPoints(value: unknown): number {
  // JSON numbers only: strings such as "10%", exponent notation, and decimal
  // percentages have no ambiguous interpretation at this API boundary.
  if (!validBasisPoints(value)) throw new DomainError("Invalid fee rate", 422);
  return value;
}

async function lockedFinanceSettings(tx: FinanceTx) {
  const rows = await tx
    .select()
    .from(platformFinanceSettings)
    .where(inArray(platformFinanceSettings.settingKey, financeSettingKeys))
    .orderBy(platformFinanceSettings.settingKey)
    .for("update");
  if (rows.length !== financeSettingKeys.length)
    throw new DomainError("Finance settings unavailable", 503);
  const values = new Map(
    rows.map((row) => [row.settingKey, Number(row.basisPoints)]),
  );
  const commissionBps = values.get("COMMISSION_BPS"),
    gatewayFeeBps = values.get("PAYMENT_GATEWAY_FEE_BPS");
  if (!validBasisPoints(commissionBps) || !validBasisPoints(gatewayFeeBps))
    throw new DomainError("Finance settings invalid", 503);
  return { commissionBps, gatewayFeeBps };
}

export async function getFinanceSettings(db: Db) {
  return db.transaction(async (tx) => lockedFinanceSettings(tx));
}

export async function updateFinanceSetting(
  db: Db,
  settingKey: FinanceSettingKey,
  basisPoints: unknown,
  actorUserId: string,
) {
  const rate = parseBasisPoints(basisPoints);
  return db.transaction(async (tx) => {
    // Lock both rows in a fixed order so an update and settlement observe either
    // the complete old pair or the complete new pair.
    const current = await lockedFinanceSettings(tx);
    const oldValue =
      settingKey === "COMMISSION_BPS"
        ? current.commissionBps
        : current.gatewayFeeBps;
    const [setting] = await tx
      .update(platformFinanceSettings)
      .set({
        basisPoints: String(rate),
        updatedByUserId: actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(platformFinanceSettings.settingKey, settingKey))
      .returning();
    await recordSensitiveAction(
      tx,
      actorUserId,
      "FINANCE_SETTING_UPDATED",
      "FINANCE_SETTING",
      settingKey,
      { setting: settingKey, oldValue, newValue: rate },
    );
    return setting;
  });
}

export function calculateSettlement(
  gross: string,
  commissionBps: number,
  gatewayFeeBps: number,
  refundAdjustment = "0.00",
) {
  if (
    !Number.isInteger(commissionBps) ||
    commissionBps < 0 ||
    commissionBps > 10000 ||
    !Number.isInteger(gatewayFeeBps) ||
    gatewayFeeBps < 0 ||
    gatewayFeeBps > 10000
  )
    throw new DomainError("Invalid fee rate", 422);
  const grossPaise = paise(gross),
    refundPaise = paise(refundAdjustment);
  const commission = Math.round((grossPaise * commissionBps) / 10000),
    gateway = Math.round((grossPaise * gatewayFeeBps) / 10000);
  const net = grossPaise - commission - gateway - refundPaise;
  if (net < 0) throw new DomainError("Adjustments exceed gross amount", 422);
  return {
    grossAmount: rupees(grossPaise),
    commissionAmount: rupees(commission),
    gatewayFeeAmount: rupees(gateway),
    refundAdjustmentAmount: rupees(refundPaise),
    netPayable: rupees(net),
  };
}

export async function createSettlement(
  db: Db,
  orderItemId: string,
  refundAdjustment: string,
  actorUserId: string,
) {
  return withTransitionRetry(db, async (tx) => {
    paise(refundAdjustment);
    const { commissionBps, gatewayFeeBps } = await lockedFinanceSettings(tx);
    const item = await requireSettlementEligible(
      tx,
      orderItemId,
      refundAdjustment,
    );
    const values = calculateSettlement(
      item.totalAmount,
      commissionBps,
      gatewayFeeBps,
      refundAdjustment,
    );
    try {
      const [result] = await tx
        .insert(adminSettlements)
        .values({
          adminId: item.adminId,
          orderId: item.orderId,
          orderItemId: item.id,
          ...values,
        })
        .returning();
      await recordSensitiveAction(
        tx,
        actorUserId,
        "SETTLEMENT_CREATED",
        "SETTLEMENT",
        result.id,
        { orderItemId },
        item.adminId,
      );
      return result;
    } catch (error) {
      const code =
        (error as { code?: string }).code ??
        ((error as { cause?: { code?: string } }).cause?.code);
      if (code === "23505")
        throw new DomainError("Settlement already exists", 409);
      throw error;
    }
  });
}

export async function getAdminFinance(db: Db, adminId: string) {
  const settlements = await db
    .select()
    .from(adminSettlements)
    .where(eq(adminSettlements.adminId, adminId));
  const payouts = await db
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.adminId, adminId));
  const available = settlements
    .filter((entry) => entry.status === "AVAILABLE")
    .reduce((sum, entry) => sum + paise(entry.netPayable), 0);
  const refundObligations = await db
    .select({
      refundId: refunds.id,
      orderId: refunds.orderId,
      orderItemId: returnItems.orderItemId,
      amount: refunds.amount,
      currency: refunds.currency,
      status: refunds.status,
    })
    .from(refunds)
    .innerJoin(returnItems, eq(returnItems.returnId, refunds.returnId))
    .where(eq(returnItems.adminId, adminId));
  return {
    availableBalance: rupees(available),
    settlements,
    payouts,
    refundObligations,
  };
}

export async function requestPayout(db: Db, adminId: string) {
  const result = await withTransitionRetry(db, async (tx) => {
    // Freeze candidate IDs. Rows inserted later cannot enter this allocation.
    const candidates = await tx
      .select({ id: adminSettlements.id, orderId: adminSettlements.orderId })
      .from(adminSettlements)
      .where(
        and(
          eq(adminSettlements.adminId, adminId),
          inArray(adminSettlements.status, ["AVAILABLE", "HELD"]),
        ),
      )
      .orderBy(
        adminSettlements.orderId,
        adminSettlements.orderItemId,
        adminSettlements.id,
      );
    if (!candidates.length) return null;
    const orderIds = [...new Set(candidates.map((row) => row.orderId))].sort();
    await tx
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.id, orderIds))
      .orderBy(orders.id)
      .for("update");
    const entries: (typeof adminSettlements.$inferSelect)[] = [];
    for (const candidate of candidates) {
      const [row] = await tx
        .select()
        .from(adminSettlements)
        .where(eq(adminSettlements.id, candidate.id));
      if (
        !row ||
        row.adminId !== adminId ||
        !["AVAILABLE", "HELD"].includes(row.status)
      )
        continue;
      try {
        const [reference] = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.id, row.orderItemId));
        if (
          !reference ||
          reference.adminId !== adminId ||
          reference.orderId !== row.orderId
        )
          throw new DomainError("SETTLEMENT_OWNER_INVALID", 409);
        const item = await requireSettlementEligible(
          tx,
          row.orderItemId,
          row.refundAdjustmentAmount,
        );
        if (
          item.adminId !== adminId ||
          item.orderId !== row.orderId ||
          paise(item.totalAmount) !== paise(row.grossAmount)
        )
          throw new DomainError("SETTLEMENT_OWNER_INVALID", 409);
        if (
          paise(row.netPayable) !==
          paise(row.grossAmount) -
            paise(row.commissionAmount) -
            paise(row.gatewayFeeAmount) -
            paise(row.refundAdjustmentAmount)
        )
          throw new DomainError("SETTLEMENT_AMOUNT_INVALID", 409);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        await tx
          .update(adminSettlements)
          .set({ status: "HELD", updatedAt: new Date() })
          .where(
            and(
              eq(adminSettlements.id, row.id),
              inArray(adminSettlements.status, ["AVAILABLE", "HELD"]),
            ),
          );
        continue;
      }
      const [locked] = await tx
        .select()
        .from(adminSettlements)
        .where(eq(adminSettlements.id, row.id))
        .for("update");
      if (
        !locked ||
        locked.adminId !== adminId ||
        !["AVAILABLE", "HELD"].includes(locked.status)
      )
        continue;
      for (const field of [
        "orderId",
        "orderItemId",
        "grossAmount",
        "commissionAmount",
        "gatewayFeeAmount",
        "refundAdjustmentAmount",
        "netPayable",
      ] as const) {
        if (locked[field] !== row[field])
          throw new DomainError("SETTLEMENT_CHANGED", 409);
      }
      const [allocated] = await tx
        .select({ id: payoutSettlementItems.id })
        .from(payoutSettlementItems)
        .where(eq(payoutSettlementItems.settlementId, locked.id));
      if (allocated) throw new DomainError("SETTLEMENT_ALREADY_ALLOCATED", 409);
      entries.push(locked);
    }
    if (
      !entries.length ||
      entries.every((entry) => paise(entry.netPayable) === 0)
    )
      return null;
    const ids = entries.map((entry) => entry.id);
    const amount = rupees(
      entries.reduce((sum, entry) => sum + paise(entry.netPayable), 0),
    );
    const [request] = await tx
      .insert(payoutRequests)
      .values({ adminId, amount })
      .returning();
    await tx.insert(payoutSettlementItems).values(
      entries.map((entry) => ({
        payoutRequestId: request.id,
        settlementId: entry.id,
      })),
    );
    const updated = await tx
      .update(adminSettlements)
      .set({ status: "PAYOUT_PENDING", updatedAt: new Date() })
      .where(
        and(
          inArray(adminSettlements.id, ids),
          eq(adminSettlements.adminId, adminId),
          inArray(adminSettlements.status, ["AVAILABLE", "HELD"]),
        ),
      )
      .returning({ id: adminSettlements.id });
    if (updated.length !== ids.length)
      throw new DomainError("SETTLEMENT_ALLOCATION_CONFLICT", 409);
    const [owner] = await tx
      .select({ userId: admins.userId })
      .from(admins)
      .where(eq(admins.id, adminId));
    await recordSensitiveAction(
      tx,
      owner.userId,
      "PAYOUT_REQUESTED",
      "PAYOUT",
      request.id,
      { settlementCount: ids.length },
      adminId,
    );
    return request;
  });
  // Preserve quarantine changes even if no payable balance remains.
  if (!result) throw new DomainError("No payable balance is available", 409);
  return result;
}

export async function reviewPayout(
  db: Db,
  payoutId: string,
  userId: string,
  decision: "APPROVED" | "REJECTED",
  notes: string,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .update(payoutRequests)
      .set({
        status: decision,
        reviewedByUserId: userId,
        reviewNotes: requiredText(notes, "notes", 1000),
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payoutRequests.id, payoutId),
          eq(payoutRequests.status, "REQUESTED"),
        ),
      )
      .returning();
    if (!request) throw new DomainError("Pending payout unavailable", 409);
    if (decision === "APPROVED") await requireVerifiedBank(tx, request.adminId);
    if (decision === "REJECTED") {
      const links = await tx
        .select({ id: payoutSettlementItems.settlementId })
        .from(payoutSettlementItems)
        .where(eq(payoutSettlementItems.payoutRequestId, payoutId));
      for (const link of links)
        await tx
          .update(adminSettlements)
          .set({ status: "HELD", updatedAt: new Date() })
          .where(eq(adminSettlements.id, link.id));
      await tx
        .delete(payoutSettlementItems)
        .where(eq(payoutSettlementItems.payoutRequestId, payoutId));
    }
    await recordSensitiveAction(
      tx,
      userId,
      `PAYOUT_${decision}`,
      "PAYOUT",
      request.id,
      {},
      request.adminId,
    );
    return request;
  });
}

export async function markPayoutPaid(
  db: Db,
  payoutId: string,
  reference: string,
  actorUserId: string,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .update(payoutRequests)
      .set({
        status: "PAID",
        paidAt: new Date(),
        paymentReference: requiredText(reference, "paymentReference", 200),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payoutRequests.id, payoutId),
          eq(payoutRequests.status, "APPROVED"),
        ),
      )
      .returning();
    if (!request) throw new DomainError("Approved payout unavailable", 409);
    await requireVerifiedBank(tx, request.adminId);
    const links = await tx
      .select({ id: payoutSettlementItems.settlementId })
      .from(payoutSettlementItems)
      .where(eq(payoutSettlementItems.payoutRequestId, payoutId));
    for (const link of links)
      await tx
        .update(adminSettlements)
        .set({ status: "PAID", updatedAt: new Date() })
        .where(eq(adminSettlements.id, link.id));
    await recordSensitiveAction(
      tx,
      actorUserId,
      "PAYOUT_PAID",
      "PAYOUT",
      request.id,
      {},
      request.adminId,
    );
    return request;
  });
}

// ---------------------------------------------------------------------------
// GET /api/super-admin/payouts — Super Admin payout queue list.
// Returns payout requests across all admins with optional status filter.
// This endpoint is SUPER_ADMIN only. Finance values are read from stored rows;
// no recalculation is performed here.
// Deterministic ordering: requestedAt DESC, id ASC for ties.
// ---------------------------------------------------------------------------
export type PayoutStatusFilter =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

export const VALID_PAYOUT_STATUSES: PayoutStatusFilter[] = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "PAID",
];

export async function listSuperAdminPayouts(
  db: Db,
  opts: {
    status?: string;
    adminId?: string;
    limit: number;
    offset: number;
  },
) {
  const conditions = [];
  if (opts.status) conditions.push(eq(payoutRequests.status, opts.status));
  if (opts.adminId) conditions.push(eq(payoutRequests.adminId, opts.adminId));

  return db
    .select({
      id: payoutRequests.id,
      adminId: payoutRequests.adminId,
      amount: payoutRequests.amount,
      status: payoutRequests.status,
      requestedAt: payoutRequests.requestedAt,
      reviewedAt: payoutRequests.reviewedAt,
      reviewNotes: payoutRequests.reviewNotes,
      paidAt: payoutRequests.paidAt,
      paymentReference: payoutRequests.paymentReference,
      createdAt: payoutRequests.createdAt,
      updatedAt: payoutRequests.updatedAt,
    })
    .from(payoutRequests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(payoutRequests.requestedAt), asc(payoutRequests.id))
    .limit(opts.limit)
    .offset(opts.offset);
}
