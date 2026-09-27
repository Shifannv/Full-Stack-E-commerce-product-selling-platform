import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { products } from "./catalog";
import { admins } from "./rbac";

export type AddressSnapshot = {
  contactName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  businessName?: string | null;
};

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: text("customer_id").notNull().references(() => users.id),
  status: text("status").notNull().default("CREATED"),
  currency: text("currency").notNull().default("INR"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  shippingAmount: numeric("shipping_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  shippingAddressSnapshot: jsonb("shipping_address_snapshot").$type<AddressSnapshot>().notNull(),
  paymentStatus: text("payment_status").notNull().default("PENDING"),
  placedAt: timestamp("placed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("orders_customer_idx").on(table.customerId),
  check("orders_amounts_check", sql`${table.subtotal} >= 0 and ${table.shippingAmount} >= 0 and ${table.discountAmount} >= 0 and ${table.totalAmount} >= 0`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  skuSnapshot: text("sku_snapshot"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  weightKgSnapshot: numeric("weight_kg_snapshot", { precision: 8, scale: 3 }),
  lengthCmSnapshot: numeric("length_cm_snapshot", { precision: 8, scale: 2 }),
  breadthCmSnapshot: numeric("breadth_cm_snapshot", { precision: 8, scale: 2 }),
  heightCmSnapshot: numeric("height_cm_snapshot", { precision: 8, scale: 2 }),
  quantity: integer("quantity").notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("order_items_order_admin_idx").on(table.orderId, table.adminId),
  unique("order_items_id_order_admin_unique").on(table.id, table.orderId, table.adminId),
  check("order_items_amounts_check", sql`${table.quantity} > 0 and ${table.unitPrice} >= 0 and ${table.subtotal} >= 0 and ${table.discountAmount} >= 0 and ${table.totalAmount} >= 0`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  provider: text("provider").notNull().default("CASHFREE"),
  providerOrderId: text("provider_order_id"),
  providerPaymentId: text("provider_payment_id"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("PENDING"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("payments_order_idx").on(table.orderId), check("payments_amount_check", sql`${table.amount} >= 0`)]);
