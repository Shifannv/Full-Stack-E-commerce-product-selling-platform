import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { categories } from "./catalog";
import { admins } from "./rbac";

export const adminKycSubmissions = pgTable("admin_kyc_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").notNull().unique().references(() => admins.id),
  status: text("status").notNull().default("DRAFT"),
  legalName: text("legal_name"),
  businessType: text("business_type"),
  contactPhone: text("contact_phone"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("admin_kyc_status_check", sql`${table.status} in ('DRAFT','PENDING_SUPER_ADMIN_APPROVAL','CHANGES_REQUIRED','APPROVED','ACTIVE','SUSPENDED','REJECTED')`)]);

export const adminKycDocuments = pgTable("admin_kyc_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id").notNull().references(() => adminKycSubmissions.id),
  documentType: text("document_type").notNull(),
  // Private R2 key only. No public URL and no document body in PostgreSQL.
  privateObjectKey: text("private_object_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("admin_kyc_documents_submission_idx").on(table.submissionId)]);

export const adminAddresses = pgTable("admin_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  addressType: text("address_type").notNull(),
  businessName: text("business_name"),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("IN"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("admin_addresses_type_check", sql`${table.addressType} in ('SHIPPING_ORIGIN','RETURN')`),
  uniqueIndex("admin_addresses_one_active_type_idx").on(table.adminId, table.addressType).where(sql`${table.isActive} = true`),
  unique("admin_addresses_id_admin_type_unique").on(table.id, table.adminId, table.addressType),
]);

export const adminCategoryAssignments = pgTable("admin_category_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  status: text("status").notNull().default("REQUESTED"),
  assignedByUserId: text("assigned_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("admin_category_assignments_admin_category_unique").on(table.adminId, table.categoryId),
  index("admin_category_assignments_category_idx").on(table.categoryId),
  check("admin_category_assignments_status_check", sql`${table.status} in ('REQUESTED','ACTIVE','REVOKED')`),
]);

export const adminAuditEvents = pgTable("admin_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").references(() => admins.id),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull().default("ADMIN"),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  changedFields: jsonb("changed_fields").$type<string[]>().notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("admin_audit_events_admin_created_idx").on(table.adminId, table.createdAt)]);
