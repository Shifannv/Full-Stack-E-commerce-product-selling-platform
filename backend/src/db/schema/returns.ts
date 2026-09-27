import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { orders, orderItems, payments, type AddressSnapshot } from "./orders";
import { admins } from "./rbac";

export const returns = pgTable("returns", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  customerId: text("customer_id").notNull().references(() => users.id),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  status: text("status").notNull().default("REQUESTED"),
  reason: text("reason").notNull(),
  customerNotes: text("customer_notes"),
  returnAddressSnapshot: jsonb("return_address_snapshot").$type<AddressSnapshot>(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  qcStatus: text("qc_status"),
  qcNotes: text("qc_notes"),
  grossRefundAmount: numeric("gross_refund_amount", { precision: 12, scale: 2 }),
  deductionAmount: numeric("deduction_amount", { precision: 12, scale: 2 }),
  netRefundAmount: numeric("net_refund_amount", { precision: 12, scale: 2 }),
  deductionBreakdown: jsonb("deduction_breakdown").$type<Record<string, string>>(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("returns_customer_idx").on(table.customerId),
  index("returns_admin_idx").on(table.adminId),
  unique("returns_id_order_admin_unique").on(table.id, table.orderId, table.adminId),
  check("returns_status_check", sql`${table.status} in ('REQUESTED','APPROVED','RETURN_PENDING','RECEIVED','QC_IN_PROGRESS','QC_APPROVED','QC_REJECTED','REFUND_PROCESSING','REFUNDED','RETURN_ISSUE','REJECTED')`),
  check("returns_amounts_check", sql`(${table.grossRefundAmount} is null or ${table.grossRefundAmount} >= 0) and (${table.deductionAmount} is null or ${table.deductionAmount} >= 0) and (${table.netRefundAmount} is null or ${table.netRefundAmount} >= 0)`),
]);

export const returnItems = pgTable("return_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  returnId: uuid("return_id").notNull().references(() => returns.id),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  orderId: uuid("order_id").notNull(),
  adminId: uuid("admin_id").notNull(),
  quantity: integer("quantity").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.returnId, table.orderId, table.adminId], foreignColumns: [returns.id, returns.orderId, returns.adminId], name: "return_items_return_scope_fk" }),
  foreignKey({ columns: [table.orderItemId, table.orderId, table.adminId], foreignColumns: [orderItems.id, orderItems.orderId, orderItems.adminId], name: "return_items_order_item_scope_fk" }),
  unique("return_items_order_item_unique").on(table.orderItemId),
  check("return_items_quantity_check", sql`${table.quantity} > 0`),
]);

export const returnInspections = pgTable("return_inspections", {
  id: uuid("id").defaultRandom().primaryKey(),
  returnId: uuid("return_id").notNull().references(() => returns.id),
  inspectedByAdminId: uuid("inspected_by_admin_id").notNull().references(() => admins.id),
  conditionStatus: text("condition_status").notNull(),
  packagingStatus: text("packaging_status"),
  notes: text("notes"),
  decision: text("decision").notNull(),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("return_inspections_return_unique").on(table.returnId),
  check("return_inspections_decision_check", sql`${table.decision} in ('APPROVED','REJECTED')`),
]);

export const refunds = pgTable("refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  returnId: uuid("return_id").notNull().unique().references(() => returns.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("INR"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("PENDING_PROVIDER"),
  providerReference: text("provider_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("refunds_order_idx").on(table.orderId),
  check("refunds_amount_check", sql`${table.amount} >= 0`),
]);
