import { boolean, check, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { admins } from "./rbac";

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").notNull().default("DRAFT"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subcategories = pgTable("subcategories", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  customizedByAdminId: uuid("customized_by_admin_id").references(() => admins.id),
  status: text("status").notNull().default("DRAFT"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("subcategories_category_slug_unique").on(table.categoryId, table.slug), unique("subcategories_id_category_unique").on(table.id, table.categoryId)]);

export const categoryProductFields = pgTable("category_product_fields", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  key: text("key").notNull(),
  label: text("label").notNull(),
  inputType: text("input_type").notNull(),
  required: boolean("required").notNull().default(false),
  options: jsonb("options").$type<string[]>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("category_product_fields_category_key_unique").on(table.categoryId, table.key),
  check("category_product_fields_type_check", sql`${table.inputType} in ('TEXT','NUMBER','SELECT','BOOLEAN')`),
]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  subcategoryId: uuid("subcategory_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  sku: text("sku").unique(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  weightKg: numeric("weight_kg", { precision: 8, scale: 3 }),
  lengthCm: numeric("length_cm", { precision: 8, scale: 2 }),
  breadthCm: numeric("breadth_cm", { precision: 8, scale: 2 }),
  heightCm: numeric("height_cm", { precision: 8, scale: 2 }),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("DRAFT"),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
  returnEnabled: boolean("return_enabled").notNull().default(false),
  // Featured flag: set by Super Admin to surface products on the Home page.
  // Distinct from New Arrivals (createdAt desc) and any future trending logic.
  featured: boolean("featured").notNull().default(false),
  createdByAdminId: uuid("created_by_admin_id").notNull().references(() => admins.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("products_category_idx").on(table.categoryId),
  index("products_admin_idx").on(table.createdByAdminId),
  // Partial index — only indexes the small subset of featured=true rows.
  index("products_featured_idx").on(table.id).where(sql`${table.featured} = true`),
  // The composite FK makes an out-of-category subcategory impossible, even outside the API.
  foreignKey({ columns: [table.subcategoryId, table.categoryId], foreignColumns: [subcategories.id, subcategories.categoryId], name: "products_subcategory_category_fk" }),
  check("products_price_check", sql`${table.price} >= 0`),
  check("products_package_check", sql`(${table.weightKg} is null or ${table.weightKg} > 0) and (${table.lengthCm} is null or ${table.lengthCm} > 0) and (${table.breadthCm} is null or ${table.breadthCm} > 0) and (${table.heightCm} is null or ${table.heightCm} > 0)`),
]);

export const productAdmins = pgTable("product_admins", {
  productId: uuid("product_id").notNull().references(() => products.id),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
}, (table) => [primaryKey({ columns: [table.productId, table.adminId] }), index("product_admins_admin_idx").on(table.adminId)]);

export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id),
  sku: text("sku").notNull().unique(),
  title: text("title").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }),
  attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("product_variants_product_idx").on(table.productId),
  check("product_variants_price_check", sql`${table.price} >= 0`),
  check("product_variants_status_check", sql`${table.status} in ('ACTIVE','INACTIVE')`),
]);

export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  objectKey: text("object_key").notNull(),
  altText: text("alt_text"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("product_images_product_sort_idx").on(table.productId, table.sortOrder)]);

export const inventories = pgTable("inventories", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id),
  variantId: uuid("variant_id").references(() => productVariants.id),
  availableQuantity: integer("available_quantity").notNull().default(0),
  reservedQuantity: integer("reserved_quantity").notNull().default(0),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("inventories_base_product_unique").on(table.productId).where(sql`${table.variantId} is null`),
  uniqueIndex("inventories_variant_unique").on(table.variantId).where(sql`${table.variantId} is not null`),
  check("inventories_quantities_check", sql`${table.availableQuantity} >= 0 and ${table.reservedQuantity} >= 0`),
]);
