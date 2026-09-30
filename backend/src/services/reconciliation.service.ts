/**
 * Cross-domain operational reconciliation service.
 *
 * Covers PAYMENT, REFUND, and FINANCE discrepancies. Shipping uses its own
 * `shippingOperations` table which predates this framework; this service
 * does NOT duplicate or replace shipping reconciliation.
 *
 * State machine:  PENDING → RETRYABLE → REVIEW → RESOLVED
 *                           ↑          ↑
 *                           └──────────┘ (operator retry or fresh evidence)
 *
 * Safety invariants:
 *  - Never resurrects EXPIRED/CANCELLED orders
 *  - Never regresses terminal refund states (SUCCESS/FAILED)
 *  - Never makes ineligible settlements payable
 *  - Never issues blind external mutations
 *  - Bounded retries (max 5), then escalates to REVIEW
 *  - All operator resolutions are audited atomically
 */

import { and, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { createDb } from "../db";
import { orders, payments } from "../db/schema/orders";
import { refunds } from "../db/schema/returns";
import { adminSettlements } from "../db/schema/finance";
import { reconciliationItems } from "../db/schema/reconciliation";
import { recordSensitiveAction } from "./security-audit";
import { DomainError } from "./admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

export const MAX_RETRY_COUNT = 5;
const RETRY_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_DISCOVERY_BATCH = 100;
const MAX_RECONCILIATION_BATCH = 50;

const VALID_STATES = ["PENDING", "RETRYABLE", "REVIEW", "RESOLVED"] as const;
const VALID_DOMAINS = ["PAYMENT", "REFUND", "FINANCE"] as const;

// ────────────────────────────────────────────────────────────────────────────
// Discovery: detect recoverable operational discrepancies
// ────────────────────────────────────────────────────────────────────────────

export type DiscoveredItem = {
  itemKey: string;
  domain: typeof VALID_DOMAINS[number];
  type: string;
  entityId: string;
  providerReference: string | null;
  evidence: Record<string, unknown> | null;
};

/**
 * PAYMENT discovery:
 * 1. Paid payments on non-confirmed, non-delivered orders with REFUND_REQUIRED
 *    but no refund record → LATE_PAYMENT_UNRESOLVED
 * 2. Payments with providerOrderId but no providerPaymentId and order still
 *    CREATED → UNKNOWN_OUTCOME (session created, outcome unknown)
 */
export async function discoverPaymentDiscrepancies(db: Db): Promise<DiscoveredItem[]> {
  const items: DiscoveredItem[] = [];

  // Late payment requiring refund but no refund record
  const latePayments = await db
    .select({
      orderId: orders.id,
      paymentId: payments.id,
      providerOrderId: payments.providerOrderId,
      providerPaymentId: payments.providerPaymentId,
      orderStatus: orders.status,
      amount: payments.amount,
      currency: payments.currency,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(payments.status, "PAID"),
        eq(payments.resolutionStatus, "REFUND_REQUIRED"),
        inArray(orders.status, ["EXPIRED", "CANCELLED"]),
      ),
    )
    .limit(MAX_DISCOVERY_BATCH);

  for (const row of latePayments) {
    const [existing] = await db
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.paymentId, row.paymentId))
      .limit(1);
    if (!existing) {
      items.push({
        itemKey: `payment:late:${row.orderId}`,
        domain: "PAYMENT",
        type: "LATE_PAYMENT_UNRESOLVED",
        entityId: row.orderId,
        providerReference: row.providerPaymentId,
        evidence: { amount: row.amount, currency: row.currency, orderStatus: row.orderStatus },
      });
    }
  }

  // Stale pending payments with provider session but no outcome
  const stalePending = await db
    .select({
      orderId: orders.id,
      paymentId: payments.id,
      providerOrderId: payments.providerOrderId,
      orderStatus: orders.status,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(payments.status, "PENDING"),
        eq(orders.status, "CREATED"),
        sql`${payments.providerOrderId} is not null`,
        sql`${payments.providerPaymentId} is null`,
        // Only stale: payment window has expired
        sql`${orders.paymentExpiresAt} < clock_timestamp() - interval '10 minutes'`,
      ),
    )
    .limit(MAX_DISCOVERY_BATCH);

  for (const row of stalePending) {
    items.push({
      itemKey: `payment:unknown:${row.orderId}`,
      domain: "PAYMENT",
      type: "UNKNOWN_OUTCOME",
      entityId: row.orderId,
      providerReference: row.providerOrderId,
      evidence: { orderStatus: row.orderStatus },
    });
  }

  return items;
}

/**
 * REFUND discovery:
 * 1. Refunds stuck in PENDING_PROVIDER for too long → STALE_PROCESSING
 * 2. Late-payment refunds marked INTERNAL_RECORDED but resolution not RESOLVED → RESOLUTION_MISMATCH
 */
export async function discoverRefundDiscrepancies(db: Db): Promise<DiscoveredItem[]> {
  const items: DiscoveredItem[] = [];

  // Stale PENDING_PROVIDER refunds
  const staleRefunds = await db
    .select({
      refundId: refunds.id,
      orderId: refunds.orderId,
      paymentId: refunds.paymentId,
      amount: refunds.amount,
      currency: refunds.currency,
      providerReference: refunds.providerReference,
      reason: refunds.reason,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.status, "PENDING_PROVIDER"),
        sql`${refunds.createdAt} < clock_timestamp() - interval '30 minutes'`,
      ),
    )
    .limit(MAX_DISCOVERY_BATCH);

  for (const row of staleRefunds) {
    items.push({
      itemKey: `refund:stale:${row.refundId}`,
      domain: "REFUND",
      type: "STALE_PROCESSING",
      entityId: row.refundId,
      providerReference: row.providerReference,
      evidence: { orderId: row.orderId, amount: row.amount, currency: row.currency, reason: row.reason },
    });
  }

  // Late-payment refunds with resolution mismatch
  const mismatched = await db
    .select({
      refundId: refunds.id,
      orderId: refunds.orderId,
      paymentId: refunds.paymentId,
      resolutionStatus: payments.resolutionStatus,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(
      and(
        eq(refunds.reason, "LATE_PAYMENT"),
        eq(refunds.status, "INTERNAL_RECORDED"),
        ne(payments.resolutionStatus, "RESOLVED"),
      ),
    )
    .limit(MAX_DISCOVERY_BATCH);

  for (const row of mismatched) {
    items.push({
      itemKey: `refund:mismatch:${row.refundId}`,
      domain: "REFUND",
      type: "RESOLUTION_MISMATCH",
      entityId: row.refundId,
      providerReference: null,
      evidence: { orderId: row.orderId, paymentId: row.paymentId, resolutionStatus: row.resolutionStatus },
    });
  }

  return items;
}

/**
 * FINANCE discovery:
 * 1. Settlements on orders that have been cancelled/expired/have unresolved
 *    refunds but settlement is still AVAILABLE → SETTLEMENT_DISCREPANCY
 */
export async function discoverFinanceDiscrepancies(db: Db): Promise<DiscoveredItem[]> {
  const items: DiscoveredItem[] = [];

  // Settlements on expired/cancelled orders that shouldn't be payable
  const badSettlements = await db
    .select({
      settlementId: adminSettlements.id,
      orderId: adminSettlements.orderId,
      status: adminSettlements.status,
      orderStatus: orders.status,
      paymentResolution: payments.resolutionStatus,
    })
    .from(adminSettlements)
    .innerJoin(orders, eq(orders.id, adminSettlements.orderId))
    .innerJoin(payments, eq(payments.orderId, adminSettlements.orderId))
    .where(
      and(
        eq(adminSettlements.status, "AVAILABLE"),
        inArray(orders.status, ["EXPIRED", "CANCELLED"]),
      ),
    )
    .limit(MAX_DISCOVERY_BATCH);

  for (const row of badSettlements) {
    items.push({
      itemKey: `finance:settlement:${row.settlementId}`,
      domain: "FINANCE",
      type: "SETTLEMENT_DISCREPANCY",
      entityId: row.settlementId,
      providerReference: null,
      evidence: { orderId: row.orderId, settlementStatus: row.status, orderStatus: row.orderStatus, paymentResolution: row.paymentResolution },
    });
  }

  return items;
}

/**
 * Unified discovery: runs all domain-specific discovery and upserts new items.
 * Returns only newly created items (deduplication by itemKey).
 */
export async function discoverAllDiscrepancies(db: Db): Promise<{ discovered: number; duplicates: number }> {
  const [paymentItems, refundItems, financeItems] = await Promise.all([
    discoverPaymentDiscrepancies(db),
    discoverRefundDiscrepancies(db),
    discoverFinanceDiscrepancies(db),
  ]);

  const all = [...paymentItems, ...refundItems, ...financeItems];
  let discovered = 0, duplicates = 0;

  for (const item of all) {
    const [inserted] = await db
      .insert(reconciliationItems)
      .values({
        itemKey: item.itemKey,
        domain: item.domain,
        type: item.type,
        entityId: item.entityId,
        providerReference: item.providerReference,
        state: "PENDING",
        evidence: item.evidence,
        nextRetryAt: new Date(Date.now() + RETRY_INTERVAL_MS),
      })
      .onConflictDoNothing()
      .returning({ id: reconciliationItems.id });
    if (inserted) discovered++;
    else duplicates++;
  }

  return { discovered, duplicates };
}

// ────────────────────────────────────────────────────────────────────────────
// Bounded retry: attempt automated resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Attempt automated resolution for a single item, WITHOUT making external
 * provider calls. This only reconciles local state using existing evidence.
 *
 * Domain-specific safety:
 *  - PAYMENT: uses markRefundResolved path for late payments, never resurrects
 *  - REFUND: checks resolution mismatch, never overwrites terminal states
 *  - FINANCE: holds ineligible settlements, never makes them payable
 */
async function attemptAutomatedResolution(db: Db, item: typeof reconciliationItems.$inferSelect): Promise<boolean> {
  if (item.domain === "PAYMENT" && item.type === "LATE_PAYMENT_UNRESOLVED") {
    // Attempt to resolve the late-payment obligation internally
    try {
      const { markRefundResolved } = await import("./reservation.service");
      const result = await markRefundResolved(db, item.entityId);
      return result.outcome === "RESOLVED";
    } catch {
      return false;
    }
  }

  if (item.domain === "REFUND" && item.type === "RESOLUTION_MISMATCH") {
    // Check if the mismatch has been resolved externally
    const evidence = item.evidence as Record<string, unknown> | null;
    const paymentId = evidence?.paymentId as string | undefined;
    if (!paymentId) return false;
    const [payment] = await db.select({ resolutionStatus: payments.resolutionStatus })
      .from(payments).where(eq(payments.id, paymentId)).limit(1);
    return payment?.resolutionStatus === "RESOLVED";
  }

  if (item.domain === "FINANCE" && item.type === "SETTLEMENT_DISCREPANCY") {
    // Hold the ineligible settlement
    const [updated] = await db
      .update(adminSettlements)
      .set({ status: "HELD", updatedAt: new Date() })
      .where(and(eq(adminSettlements.id, item.entityId), eq(adminSettlements.status, "AVAILABLE")))
      .returning({ id: adminSettlements.id });
    return !!updated;
  }

  // UNKNOWN_OUTCOME and STALE_PROCESSING cannot be resolved without provider
  // evidence. Move to REVIEW after exhaustion.
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Scheduled batch: bounded reconciliation cycle
// ────────────────────────────────────────────────────────────────────────────

/**
 * Process a bounded batch of due reconciliation items.
 * - SKIP LOCKED for worker-level concurrency
 * - Per-record failure isolation
 * - Bounded retries → REVIEW after exhaustion
 * - No external calls while holding business-state locks
 */
export async function runReconciliationBatch(
  db: Db,
  limit = MAX_RECONCILIATION_BATCH,
  now = new Date(),
): Promise<{ processed: number; resolved: number; escalated: number; failed: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECONCILIATION_BATCH) {
    throw new DomainError("Invalid reconciliation batch size", 422);
  }

  // Claim items atomically with SKIP LOCKED
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(reconciliationItems)
      .where(
        and(
          inArray(reconciliationItems.state, ["PENDING", "RETRYABLE"]),
          lte(reconciliationItems.nextRetryAt, now),
        ),
      )
      .orderBy(reconciliationItems.nextRetryAt, reconciliationItems.id)
      .limit(limit)
      .for("update", { skipLocked: true });

    const result = [];
    for (const row of rows) {
      if (row.retryCount >= MAX_RETRY_COUNT) {
        // Escalate to REVIEW
        await tx
          .update(reconciliationItems)
          .set({ state: "REVIEW", nextRetryAt: null, lastError: "RETRY_LIMIT", updatedAt: now })
          .where(eq(reconciliationItems.id, row.id));
        continue;
      }
      // Claim for processing
      const [updated] = await tx
        .update(reconciliationItems)
        .set({
          retryCount: row.retryCount + 1,
          lastAttemptedAt: now,
          nextRetryAt: new Date(now.getTime() + RETRY_INTERVAL_MS),
          updatedAt: now,
        })
        .where(eq(reconciliationItems.id, row.id))
        .returning();
      result.push(updated);
    }
    return result;
  });

  let resolved = 0, escalated = 0, failed = 0;

  for (const item of claimed) {
    try {
      const success = await attemptAutomatedResolution(db, item);
      if (success) {
        // Conditional update: only resolve if still ours
        await db
          .update(reconciliationItems)
          .set({
            state: "RESOLVED",
            resolvedAt: now,
            nextRetryAt: null,
            lastError: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(reconciliationItems.id, item.id),
              eq(reconciliationItems.retryCount, item.retryCount),
              ne(reconciliationItems.state, "RESOLVED"),
            ),
          );
        resolved++;
      } else if (item.retryCount >= MAX_RETRY_COUNT) {
        await db
          .update(reconciliationItems)
          .set({
            state: "REVIEW",
            nextRetryAt: null,
            lastError: "AUTOMATED_RESOLUTION_FAILED",
            updatedAt: now,
          })
          .where(
            and(
              eq(reconciliationItems.id, item.id),
              eq(reconciliationItems.retryCount, item.retryCount),
              ne(reconciliationItems.state, "RESOLVED"),
            ),
          );
        escalated++;
      }
    } catch (error) {
      failed++;
      const lastError = error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN";
      await db
        .update(reconciliationItems)
        .set({
          state: item.retryCount >= MAX_RETRY_COUNT ? "REVIEW" : "RETRYABLE",
          lastError,
          nextRetryAt: item.retryCount >= MAX_RETRY_COUNT ? null : new Date(now.getTime() + RETRY_INTERVAL_MS),
          updatedAt: now,
        })
        .where(
          and(
            eq(reconciliationItems.id, item.id),
            eq(reconciliationItems.retryCount, item.retryCount),
            ne(reconciliationItems.state, "RESOLVED"),
          ),
        )
        .catch(() => undefined);
    }
  }

  return { processed: claimed.length, resolved, escalated, failed };
}

// ────────────────────────────────────────────────────────────────────────────
// Operator review: list / inspect / resolve
// ────────────────────────────────────────────────────────────────────────────

/**
 * List unresolved reconciliation items, optionally filtered by domain.
 */
export async function listUnresolvedItems(
  db: Db,
  options: { domain?: string; limit?: number; afterId?: string } = {},
): Promise<(typeof reconciliationItems.$inferSelect)[]> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainError("Invalid limit", 422);
  }

  const conditions = [ne(reconciliationItems.state, "RESOLVED")];
  if (options.domain) {
    if (!VALID_DOMAINS.includes(options.domain as typeof VALID_DOMAINS[number])) {
      throw new DomainError("Invalid domain filter", 422);
    }
    conditions.push(eq(reconciliationItems.domain, options.domain));
  }
  if (options.afterId) {
    conditions.push(sql`${reconciliationItems.id} > ${options.afterId}::uuid`);
  }

  return db
    .select()
    .from(reconciliationItems)
    .where(and(...conditions))
    .orderBy(reconciliationItems.createdAt, reconciliationItems.id)
    .limit(limit);
}

/**
 * Get a single reconciliation item by ID.
 */
export async function getReconciliationItem(
  db: Db,
  id: string,
): Promise<typeof reconciliationItems.$inferSelect> {
  const [item] = await db
    .select()
    .from(reconciliationItems)
    .where(eq(reconciliationItems.id, id))
    .limit(1);
  if (!item) throw new DomainError("Reconciliation item unavailable", 404);
  return item;
}

/**
 * Operator resolves an item. Validates current state under lock.
 * Resolution + audit are committed atomically.
 *
 * Only PENDING, RETRYABLE, or REVIEW items can be resolved.
 * RESOLVED items are idempotent (return success without changing state).
 */
export async function resolveReconciliationItem(
  db: Db,
  id: string,
  actorUserId: string,
  note: string,
): Promise<typeof reconciliationItems.$inferSelect> {
  if (!note?.trim() || note.length > 2000) {
    throw new DomainError("Resolution note is required (max 2000 chars)", 422);
  }

  return db.transaction(async (tx) => {
    // Lock the row
    const [item] = await tx
      .select()
      .from(reconciliationItems)
      .where(eq(reconciliationItems.id, id))
      .for("update");
    if (!item) throw new DomainError("Reconciliation item unavailable", 404);

    // Idempotent: already resolved
    if (item.state === "RESOLVED") return item;

    // Only resolvable states
    if (!["PENDING", "RETRYABLE", "REVIEW"].includes(item.state)) {
      throw new DomainError(`Cannot resolve item in state ${item.state}`, 409);
    }

    const previousState = item.state;
    const now = new Date();

    const [resolved] = await tx
      .update(reconciliationItems)
      .set({
        state: "RESOLVED",
        resolvedAt: now,
        resolvedByUserId: actorUserId,
        resolutionNote: note.trim(),
        nextRetryAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(reconciliationItems.id, id),
          ne(reconciliationItems.state, "RESOLVED"),
        ),
      )
      .returning();

    if (!resolved) throw new DomainError("Concurrent resolution conflict", 409);

    // Atomic audit
    await recordSensitiveAction(tx, actorUserId, "RECONCILIATION_RESOLVED", item.domain, item.entityId, {
      reconciliationItemId: id,
      previousState,
      newState: "RESOLVED",
      type: item.type,
      note: note.trim().slice(0, 500),
    });

    return resolved;
  });
}

/**
 * Operator marks an item for manual review.
 * Only PENDING or RETRYABLE items can be escalated.
 * REVIEW items are idempotent.
 */
export async function escalateToReview(
  db: Db,
  id: string,
  actorUserId: string,
  note: string,
): Promise<typeof reconciliationItems.$inferSelect> {
  if (!note?.trim() || note.length > 2000) {
    throw new DomainError("Review note is required (max 2000 chars)", 422);
  }

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(reconciliationItems)
      .where(eq(reconciliationItems.id, id))
      .for("update");
    if (!item) throw new DomainError("Reconciliation item unavailable", 404);

    if (item.state === "REVIEW") return item;
    if (item.state === "RESOLVED") {
      throw new DomainError("Cannot escalate a resolved item", 409);
    }

    const previousState = item.state;
    const now = new Date();

    const [escalated] = await tx
      .update(reconciliationItems)
      .set({
        state: "REVIEW",
        nextRetryAt: null,
        lastError: "OPERATOR_ESCALATION",
        updatedAt: now,
      })
      .where(
        and(
          eq(reconciliationItems.id, id),
          inArray(reconciliationItems.state, ["PENDING", "RETRYABLE"]),
        ),
      )
      .returning();

    if (!escalated) throw new DomainError("Concurrent escalation conflict", 409);

    await recordSensitiveAction(tx, actorUserId, "RECONCILIATION_ESCALATED", item.domain, item.entityId, {
      reconciliationItemId: id,
      previousState,
      newState: "REVIEW",
      type: item.type,
      note: note.trim().slice(0, 500),
    });

    return escalated;
  });
}
