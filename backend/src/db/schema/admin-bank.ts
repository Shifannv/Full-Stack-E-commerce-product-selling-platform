import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { admins } from "./rbac";
import { users } from "./auth";

export const adminBankAccounts = pgTable("admin_bank_accounts", {
  adminId: uuid("admin_id").primaryKey().references(() => admins.id),
  encryptedDetails: text("encrypted_details").notNull(),
  accountLast4: text("account_last4").notNull(),
  status: text("status").notNull().default("PENDING"),
  revision: uuid("revision").notNull().defaultRandom(),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
