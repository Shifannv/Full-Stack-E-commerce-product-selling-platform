import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orderItems, orders } from "./orders";
import { admins } from "./rbac";

// These are percentage rates expressed in basis points (10% = 1000).  Keeping
// the rate integral means settlement arithmetic never depends on floats.
export const platformFinanceSettings = pgTable("platform_finance_settings", {
  settingKey: text("setting_key").primaryKey(),
  basisPoints: numeric("basis_points", { precision: 5, scale: 0 }).notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("platform_finance_settings_key_check", sql`${table.settingKey} in ('COMMISSION_BPS', 'PAYMENT_GATEWAY_FEE_BPS')`),
  check("platform_finance_settings_bps_check", sql`${table.basisPoints} >= 0 and ${table.basisPoints} <= 10000`),
]);

export const adminSettlements = pgTable("admin_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }).notNull(),
  gatewayFeeAmount: numeric("gateway_fee_amount", { precision: 12, scale: 2 }).notNull(),
  refundAdjustmentAmount: numeric("refund_adjustment_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("AVAILABLE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("admin_settlements_order_item_unique").on(table.orderItemId),
  index("admin_settlements_admin_status_idx").on(table.adminId, table.status),
  check("admin_settlements_amounts_check", sql`${table.grossAmount} >= 0 and ${table.commissionAmount} >= 0 and ${table.gatewayFeeAmount} >= 0 and ${table.refundAdjustmentAmount} >= 0 and ${table.netPayable} >= 0`),
  check("admin_settlements_status_check", sql`${table.status} in ('AVAILABLE','PAYOUT_PENDING','PAID','HELD')`),
]);

export const payoutRequests = pgTable("payout_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("REQUESTED"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentReference: text("payment_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("payout_requests_admin_status_idx").on(table.adminId, table.status),
  check("payout_requests_amount_check", sql`${table.amount} > 0`),
  check("payout_requests_status_check", sql`${table.status} in ('REQUESTED','APPROVED','REJECTED','PAID')`),
]);

export const payoutSettlementItems = pgTable("payout_settlement_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  payoutRequestId: uuid("payout_request_id").notNull().references(() => payoutRequests.id),
  settlementId: uuid("settlement_id").notNull().unique().references(() => adminSettlements.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
