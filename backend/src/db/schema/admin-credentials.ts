import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { admins } from "./rbac";
import { users } from "./auth";

// Only newly provisioned sellers get a row. Never backfill existing identities.
export const adminCredentials = pgTable("admin_credentials", {
  adminId: uuid("admin_id").primaryKey().references(() => admins.id),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  provisionedByUserId: text("provisioned_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  passwordChangedAt: timestamp("password_changed_at"),
});
