import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminAuditEvents, adminCategoryAssignments } from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import { categories, categoryProductFields, inventories, productAdmins, productImages, products, productVariants, subcategories } from "../../db/schema/catalog";
import { admins } from "../../db/schema/rbac";
import { DomainError, requiredText } from "./admin.service";
import { lockAdmin, requireActiveAdmin, type AdminTx } from "./admin-lock";

type Db = ReturnType<typeof createDb>["db"];
const money = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new DomainError("Invalid price", 422);
  return value;
};
const optionalPositive = (value: unknown, name: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{1,5}(\.\d{1,3})?$/.test(value) || Number(value) <= 0) throw new DomainError(`Invalid ${name}`, 422);
  return value;
};
const slug = (value: unknown): string => {
  const result = requiredText(value, "slug", 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) throw new DomainError("Invalid slug", 422);
  return result;
};

async function validateAttributes(db: Db, categoryId: string, input: unknown): Promise<Record<string, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainError("Invalid product attributes", 422);
  const values = input as Record<string, unknown>;
  const fields = await db.select().from(categoryProductFields).where(eq(categoryProductFields.categoryId, categoryId));
  if (Object.keys(values).some((key) => !fields.some((field) => field.key === key))) throw new DomainError("Unknown category product field", 422);
  for (const field of fields) {
    const value = values[field.key];
    if ((value === undefined || value === null || value === "") && field.required) throw new DomainError(`${field.key} is required`, 422);
    if (value === undefined || value === null || value === "") continue;
    if (field.inputType === "TEXT" && (typeof value !== "string" || value.length > 500)) throw new DomainError(`Invalid ${field.key}`, 422);
    if (field.inputType === "NUMBER" && (typeof value !== "number" || !Number.isFinite(value))) throw new DomainError(`Invalid ${field.key}`, 422);
    if (field.inputType === "BOOLEAN" && typeof value !== "boolean") throw new DomainError(`Invalid ${field.key}`, 422);
    if (field.inputType === "SELECT" && !field.options?.includes(String(value))) throw new DomainError(`Invalid ${field.key}`, 422);
  }
  return values;
}

export async function assertCategoryScope(db: Db, adminId: string, categoryId: string): Promise<void> {
  const [admin] = await db.select({ status: admins.status, deletedAt: admins.deletedAt, userStatus: users.status, userDeletedAt: users.deletedAt })
    .from(admins).innerJoin(users, eq(users.id, admins.userId)).where(eq(admins.id, adminId)).limit(1);
  if (admin?.status !== "ACTIVE" || admin.deletedAt || admin.userStatus !== "ACTIVE" || admin.userDeletedAt) throw new DomainError("Admin approval required", 403);
  const [assignment] = await db.select({ id: adminCategoryAssignments.id }).from(adminCategoryAssignments)
    .where(and(eq(adminCategoryAssignments.adminId, adminId), eq(adminCategoryAssignments.categoryId, categoryId), eq(adminCategoryAssignments.status, "ACTIVE"))).limit(1);
  if (!assignment) throw new DomainError("Category is outside Admin scope", 403);
}

export async function getAdminCategoryConfig(db: Db, adminId: string) {
  const assignments = await db.select({ id: categories.id, name: categories.name, slug: categories.slug, status: categories.status })
    .from(adminCategoryAssignments).innerJoin(categories, eq(adminCategoryAssignments.categoryId, categories.id))
    .where(and(eq(adminCategoryAssignments.adminId, adminId), eq(adminCategoryAssignments.status, "ACTIVE"), eq(categories.status, "PUBLISHED")));
  return Promise.all(assignments.map(async (category) => ({
    ...category,
    subcategories: await db.select({ id: subcategories.id, name: subcategories.name, slug: subcategories.slug }).from(subcategories).where(and(eq(subcategories.categoryId, category.id), eq(subcategories.status, "PUBLISHED"))),
    fields: await db.select({ key: categoryProductFields.key, label: categoryProductFields.label, inputType: categoryProductFields.inputType, required: categoryProductFields.required, options: categoryProductFields.options, sortOrder: categoryProductFields.sortOrder }).from(categoryProductFields).where(eq(categoryProductFields.categoryId, category.id)),
  })));
}

export async function createCategory(db: Db, input: Record<string, unknown>) {
  const [result] = await db.insert(categories).values({ name: requiredText(input.name, "name"), slug: slug(input.slug), description: typeof input.description === "string" ? input.description.trim().slice(0, 2000) : null }).returning();
  return result;
}

export async function createSubcategory(db: Db, input: Record<string, unknown>, adminId?: string) {
  const categoryId = requiredText(input.categoryId, "categoryId", 40);
  return db.transaction(async (tx) => {
    const admin = adminId ? await lockedCategoryScope(tx, adminId, categoryId) : null;
    const [category] = await tx.select({ status: categories.status }).from(categories).where(eq(categories.id, categoryId)).limit(1);
    if (!category || category.status !== "PUBLISHED") throw new DomainError("Category unavailable", 404);
    const [result] = await tx.insert(subcategories).values({ categoryId, name: requiredText(input.name, "name"), slug: slug(input.slug), customizedByAdminId: adminId, status: adminId ? "DRAFT" : "PUBLISHED" }).returning();
    if (admin) await tx.insert(adminAuditEvents).values({ adminId: admin.id, actorUserId: admin.userId, action: "SUBCATEGORY_CREATED", changedFields: [result.id, categoryId] });
    return result;
  });
}

export async function configureField(db: Db, input: Record<string, unknown>) {
  const categoryId = requiredText(input.categoryId, "categoryId", 40);
  const key = requiredText(input.key, "key", 80);
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new DomainError("Invalid field key", 422);
  if (!(["TEXT", "NUMBER", "SELECT", "BOOLEAN"] as unknown[]).includes(input.inputType)) throw new DomainError("Invalid field type", 422);
  const inputType = input.inputType as string;
  const options = inputType === "SELECT" ? input.options : null;
  if (inputType === "SELECT" && (!Array.isArray(options) || !options.length || options.length > 50 || options.some((value) => typeof value !== "string" || !value.trim() || value.length > 100))) throw new DomainError("Invalid field options", 422);
  const [result] = await db.insert(categoryProductFields).values({
    categoryId, key, label: requiredText(input.label, "label"), inputType,
    required: input.required === true, options: options as string[] | null,
  }).onConflictDoUpdate({ target: [categoryProductFields.categoryId, categoryProductFields.key], set: { label: requiredText(input.label, "label"), inputType, required: input.required === true, options: options as string[] | null, updatedAt: new Date() } }).returning();
  return result;
}

export async function createProduct(db: Db, adminId: string, input: Record<string, unknown>) {
  const categoryId = requiredText(input.categoryId, "categoryId", 40);
  const subcategoryId = requiredText(input.subcategoryId, "subcategoryId", 40);
  const [subcategory] = await db.select({ id: subcategories.id }).from(subcategories).where(and(eq(subcategories.id, subcategoryId), eq(subcategories.categoryId, categoryId), eq(subcategories.status, "PUBLISHED"))).limit(1);
  if (!subcategory) throw new DomainError("Subcategory does not belong to the selected main category", 422);
  const values = await validateAttributes(db, categoryId, input.attributes);
  const [category] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (input.returnEnabled !== undefined && typeof input.returnEnabled !== "boolean") throw new DomainError("returnEnabled must be a boolean", 422);
  if (input.returnEnabled === true && category?.slug !== "dress") throw new DomainError("Only Dress products can enable returns", 422);
  return db.transaction(async (tx) => {
    const admin = await lockedCategoryScope(tx, adminId, categoryId);
    const [result] = await tx.insert(products).values({
      categoryId, subcategoryId, createdByAdminId: adminId,
      name: requiredText(input.name, "name"), slug: slug(input.slug),
      description: typeof input.description === "string" ? input.description.trim().slice(0, 5000) : null,
      sku: typeof input.sku === "string" ? input.sku.trim().slice(0, 100) : null,
      price: money(input.price), attributes: values, returnEnabled: input.returnEnabled === true,
      weightKg: optionalPositive(input.weightKg, "weightKg"),
      lengthCm: optionalPositive(input.lengthCm, "lengthCm"),
      breadthCm: optionalPositive(input.breadthCm, "breadthCm"),
      heightCm: optionalPositive(input.heightCm, "heightCm"),
    }).returning();
    await tx.insert(productAdmins).values({ productId: result.id, adminId });
    await tx.insert(adminAuditEvents).values({ adminId, actorUserId: admin.userId, action: "PRODUCT_CREATED", changedFields: [result.id, categoryId] });
    return result;
  });
}

async function lockedCategoryScope(tx: AdminTx, adminId: string, categoryId: string) {
  const admin = await lockAdmin(tx, adminId);
  requireActiveAdmin(admin);
  const [assignment] = await tx.select({ id: adminCategoryAssignments.id }).from(adminCategoryAssignments)
    .where(and(eq(adminCategoryAssignments.adminId, adminId), eq(adminCategoryAssignments.categoryId, categoryId), eq(adminCategoryAssignments.status, "ACTIVE")))
    .limit(1).for("update");
  if (!assignment) throw new DomainError("Category is outside Admin scope", 403);
  return admin;
}

async function lockedProductScope(tx: AdminTx, adminId: string, productId: string) {
  const [candidate] = await tx.select({ categoryId: products.categoryId }).from(products).where(eq(products.id, productId)).limit(1);
  if (!candidate) throw new DomainError("Product unavailable", 404);
  const admin = await lockedCategoryScope(tx, adminId, candidate.categoryId);
  const [managed] = await tx.select({ productId: productAdmins.productId }).from(productAdmins)
    .where(and(eq(productAdmins.productId, productId), eq(productAdmins.adminId, adminId))).limit(1).for("update");
  if (!managed) throw new DomainError("Product unavailable", 404);
  const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1).for("update");
  if (!product || product.categoryId !== candidate.categoryId) throw new DomainError("Product category changed", 409);
  return { admin, product };
}

export async function assertProductAdmin(db: Db, adminId: string, productId: string) {
  const [owned] = await db.select({ id: productAdmins.productId }).from(productAdmins).where(and(eq(productAdmins.productId, productId), eq(productAdmins.adminId, adminId))).limit(1);
  if (!owned) throw new DomainError("Product unavailable", 404);
  const [product] = await db.select({ categoryId: products.categoryId }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new DomainError("Product unavailable", 404);
  await assertCategoryScope(db, adminId, product.categoryId);
}

export async function updateProduct(db: Db, adminId: string, productId: string, input: Record<string, unknown>) {
  const [current] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!current) throw new DomainError("Product unavailable", 404);
  if (input.categoryId !== undefined || input.subcategoryId !== undefined || input.status !== undefined || input.createdByAdminId !== undefined || input.featured !== undefined) {
    throw new DomainError("Category, owner, publication status, and featured status cannot be changed here", 422);
  }
  const changes: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) changes.name = requiredText(input.name, "name");
  if (input.slug !== undefined) changes.slug = slug(input.slug);
  if (input.description !== undefined) changes.description = typeof input.description === "string" ? input.description.trim().slice(0, 5000) || null : null;
  if (input.sku !== undefined) changes.sku = typeof input.sku === "string" ? input.sku.trim().slice(0, 100) || null : null;
  if (input.price !== undefined) changes.price = money(input.price);
  if (input.attributes !== undefined) changes.attributes = await validateAttributes(db, current.categoryId, input.attributes);
  if (input.returnEnabled !== undefined) {
    if (typeof input.returnEnabled !== "boolean") throw new DomainError("returnEnabled must be a boolean", 422);
    const [category] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, current.categoryId)).limit(1);
    if (input.returnEnabled && category?.slug !== "dress") throw new DomainError("Only Dress products can enable returns", 422);
    changes.returnEnabled = input.returnEnabled;
  }
  for (const key of ["weightKg", "lengthCm", "breadthCm", "heightCm"] as const) {
    if (input[key] !== undefined) changes[key] = optionalPositive(input[key], key);
  }
  return db.transaction(async (tx) => {
    const { admin } = await lockedProductScope(tx, adminId, productId);
    const [result] = await tx.update(products).set(changes).where(eq(products.id, productId)).returning();
    await tx.insert(adminAuditEvents).values({ adminId, actorUserId: admin.userId, action: "PRODUCT_UPDATED", changedFields: [productId, ...Object.keys(input)] });
    return result;
  });
}

export async function createVariant(db: Db, adminId: string, productId: string, input: Record<string, unknown>) {
  const attributes = input.attributes && typeof input.attributes === "object" && !Array.isArray(input.attributes) ? input.attributes as Record<string, unknown> : {};
  return db.transaction(async (tx) => {
    const { admin } = await lockedProductScope(tx, adminId, productId);
    const [variant] = await tx.insert(productVariants).values({ productId, sku: requiredText(input.sku, "sku", 100), title: requiredText(input.title, "title", 200), price: money(input.price), attributes }).returning();
    await tx.insert(adminAuditEvents).values({ adminId, actorUserId: admin.userId, action: "PRODUCT_VARIANT_CREATED", changedFields: [productId, variant.id] });
    return variant;
  });
}

export async function saveProductImageMetadata(db: Db, adminId: string, productId: string, input: Record<string, unknown>) {
  const objectKey = requiredText(input.objectKey, "objectKey", 500);
  if (!objectKey.startsWith(`products/${productId}/`)) throw new DomainError("Invalid product image object key", 422);
  const variantId = typeof input.variantId === "string" ? input.variantId : null;
  if (variantId) {
    const [variant] = await db.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId))).limit(1);
    if (!variant) throw new DomainError("Variant unavailable", 404);
  }
  const sortOrder = Number(input.sortOrder ?? 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000) throw new DomainError("Invalid sortOrder", 422);
  return db.transaction(async (tx) => {
    const { admin } = await lockedProductScope(tx, adminId, productId);
    const [image] = await tx.insert(productImages).values({ productId, variantId, objectKey, altText: typeof input.altText === "string" ? input.altText.trim().slice(0, 300) : null, sortOrder }).returning();
    await tx.insert(adminAuditEvents).values({ adminId, actorUserId: admin.userId, action: "PRODUCT_IMAGE_SAVED", changedFields: [productId, image.id] });
    return image;
  });
}

export async function setProductInventory(db: Db, adminId: string, productId: string, quantity: number, variantId?: string, expectedVersion?: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10_000_000) throw new DomainError("Invalid inventory quantity", 422);
  if (variantId) {
    const [variant] = await db.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId))).limit(1);
    if (!variant) throw new DomainError("Variant unavailable", 404);
  }
  if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 0) throw new DomainError("INVENTORY_VERSION_REQUIRED", 422);
  return db.transaction(async (tx) => {
    const { admin } = await lockedProductScope(tx, adminId, productId);
    const [existing] = await tx.select({ id: inventories.id }).from(inventories).where(variantId ? eq(inventories.variantId, variantId) : and(eq(inventories.productId, productId), sql`${inventories.variantId} is null`)).limit(1).for("update");
    const [inventory] = existing
      ? await tx.update(inventories).set({ availableQuantity: quantity, version: sql`${inventories.version} + 1`, updatedAt: new Date() }).where(and(eq(inventories.id, existing.id), eq(inventories.version, expectedVersion as number))).returning()
      : expectedVersion === 0 ? await tx.insert(inventories).values({ productId, variantId: variantId ?? null, availableQuantity: quantity }).onConflictDoNothing().returning() : [];
    if (!inventory) throw new DomainError("INVENTORY_VERSION_STALE", 409);
    await tx.insert(adminAuditEvents).values({ adminId, actorUserId: admin.userId, action: "INVENTORY_SET", changedFields: [productId, variantId ?? "base", "availableQuantity"] });
    return inventory;
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/products — Admin's own product list with category scope check.
// Returns paginated list of products created by or assigned to this admin.
// ---------------------------------------------------------------------------
export async function listAdminProducts(
  db: Db,
  adminId: string,
  opts: { status?: string; limit: number; offset: number },
) {
  const conditions = [eq(productAdmins.adminId, adminId), eq(adminCategoryAssignments.status, "ACTIVE"), eq(categories.status, "PUBLISHED")];
  if (opts.status) conditions.push(eq(products.status, opts.status));
  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      price: products.price,
      currency: products.currency,
      status: products.status,
      featured: products.featured,
      returnEnabled: products.returnEnabled,
      category: categories.name,
      categorySlug: categories.slug,
      subcategory: subcategories.name,
      subcategorySlug: subcategories.slug,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(productAdmins)
    .innerJoin(products, eq(productAdmins.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(adminCategoryAssignments, and(eq(adminCategoryAssignments.adminId, adminId), eq(adminCategoryAssignments.categoryId, products.categoryId)))
    .innerJoin(subcategories, eq(products.subcategoryId, subcategories.id))
    .where(and(...conditions))
    .orderBy(desc(products.updatedAt))
    .limit(opts.limit)
    .offset(opts.offset);
}
