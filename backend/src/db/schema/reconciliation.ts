import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Cross-domain reconciliation record. Each row represents one recoverable
 * operational discrepancy (unknown payment outcome, stuck refund, settlement
 * mismatch, etc.). Shipping discrepancies continue to live in
 * `shipping_operations` which predates this table.
 *
 * State machine:  PENDING → RETRYABLE → REVIEW → RESOLVED
 *                           ↑          ↑
 *                           └──────────┘ (operator retry)
 *
 * Bounded retries: max 5 attempts, then escalated to REVIEW.
 */
export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Stable deduplication key (e.g. "payment:<orderId>" or "refund:<refundId>"). */
    itemKey: text("item_key").notNull().unique(),

    /** Top-level domain: PAYMENT, REFUND, FINANCE */
    domain: text("domain").notNull(),

    /** Sub-type within the domain (e.g. UNKNOWN_OUTCOME, STALE_PROCESSING, SETTLEMENT_MISMATCH). */
    type: text("type").notNull(),

    /** Primary entity ID (order ID, refund ID, settlement ID). */
    entityId: text("entity_id").notNull(),

    /** Provider reference when relevant (e.g. Cashfree order ID). */
    providerReference: text("provider_reference"),

    /** Current lifecycle state. */
    state: text("state").notNull().default("PENDING"),

    /** Number of automated retry attempts consumed. */
    retryCount: integer("retry_count").notNull().default(0),

    /** When the next automated retry may execute. */
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),

    /** Timestamp of the most recent retry attempt. */
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),

    /** Machine-readable error key from the most recent attempt. */
    lastError: text("last_error"),

    /** Bounded, normalized evidence/metadata (not raw provider payloads). */
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),

    /** Timestamp when the item reached RESOLVED. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    /** User ID of the operator who resolved the item (null for automated resolution). */
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id),

    /** Operator resolution note. */
    resolutionNote: text("resolution_note"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "reconciliation_items_domain_check",
      sql`${table.domain} in ('PAYMENT','REFUND','FINANCE')`,
    ),
    check(
      "reconciliation_items_state_check",
      sql`${table.state} in ('PENDING','RETRYABLE','REVIEW','RESOLVED')`,
    ),
    check(
      "reconciliation_items_retry_check",
      sql`${table.retryCount} between 0 and 5`,
    ),
    index("reconciliation_items_due_idx")
      .on(table.nextRetryAt, table.id)
      .where(sql`${table.state} in ('PENDING','RETRYABLE')`),
    index("reconciliation_items_entity_idx").on(table.domain, table.entityId),
    index("reconciliation_items_unresolved_idx")
      .on(table.domain, table.state)
      .where(sql`${table.state} <> 'RESOLVED'`),
  ],
);
