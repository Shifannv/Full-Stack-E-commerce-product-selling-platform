import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { admins } from "./rbac";
import { users } from "./auth";

export const adminDeletionRequests = pgTable(
  "admin_account_deletion_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id),
    status: text("status").notNull().default("REQUESTED"),
    reason: text("reason").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "admin_deletion_status_check",
      sql`${t.status} in ('REQUESTED','PENDING','APPROVED','REJECTED')`,
    ),
    check(
      "admin_deletion_verified_check",
      sql`${t.status} not in ('PENDING','APPROVED') or ${t.verifiedAt} is not null`,
    ),
    uniqueIndex("admin_deletion_open_unique")
      .on(t.adminId)
      .where(sql`${t.status} in ('REQUESTED','PENDING')`),
  ],
);

// Commerce, KYC, addresses and ownership stay in their original tables. This
// is a lifecycle manifest, never a copy of credentials or sensitive evidence.
export const adminArchives = pgTable(
  "admin_archives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id),
    deletionRequestId: uuid("deletion_request_id")
      .notNull()
      .unique()
      .references(() => adminDeletionRequests.id),
    categoryManifest: jsonb("category_manifest")
      .$type<Array<{ id: string; categoryId: string; revision: string }>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    restoredByUserId: text("restored_by_user_id").references(() => users.id),
  },
  (t) => [
    uniqueIndex("admin_archive_open_unique")
      .on(t.adminId)
      .where(sql`${t.restoredAt} is null`),
  ],
);

export const adminRecoveryRequests = pgTable(
  "admin_recovery_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    archiveId: uuid("archive_id")
      .notNull()
      .references(() => adminArchives.id),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id),
    status: text("status").notNull().default("PENDING"),
    reason: text("reason").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
  },
  (t) => [
    check(
      "admin_recovery_status_check",
      sql`${t.status} in ('PENDING','APPROVED','REJECTED')`,
    ),
    uniqueIndex("admin_recovery_open_unique")
      .on(t.adminId)
      .where(sql`${t.status} = 'PENDING'`),
  ],
);
