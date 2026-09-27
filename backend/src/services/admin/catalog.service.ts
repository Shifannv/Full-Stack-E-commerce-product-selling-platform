import { and, eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminCategoryAssignments } from "../../db/schema/admin";
import { categories, categoryProductFields, productAdmins, products, subcategories } from "../../db/schema/catalog";
import { admins } from "../../db/schema/rbac";
import { DomainError, requiredText } from "./admin.service";

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

export async function assertCategoryScope(db: Db, adminId: string, categoryId: string): Promise<void> {
  const [admin] = await db.select({ status: admins.status }).from(admins).where(eq(admins.id, adminId)).limit(1);
  if (admin?.status !== "ACTIVE") throw new DomainError("Admin approval required", 403);
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
  const [category] = await db.select({ status: categories.status }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!category || category.status !== "PUBLISHED") throw new DomainError("Category unavailable", 404);
  if (adminId) await assertCategoryScope(db, adminId, categoryId);
  const [result] = await db.insert(subcategories).values({ categoryId, name: requiredText(input.name, "name"), slug: slug(input.slug), customizedByAdminId: adminId, status: adminId ? "DRAFT" : "PUBLISHED" }).returning();
  return result;
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
  await assertCategoryScope(db, adminId, categoryId);
  const [subcategory] = await db.select({ id: subcategories.id }).from(subcategories).where(and(eq(subcategories.id, subcategoryId), eq(subcategories.categoryId, categoryId), eq(subcategories.status, "PUBLISHED"))).limit(1);
  if (!subcategory) throw new DomainError("Subcategory does not belong to the selected main category", 422);
  const fields = await db.select().from(categoryProductFields).where(eq(categoryProductFields.categoryId, categoryId));
  const attributes = input.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) throw new DomainError("Invalid product attributes", 422);
  const values = attributes as Record<string, unknown>;
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
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(products).values({
      categoryId, subcategoryId, createdByAdminId: adminId,
      name: requiredText(input.name, "name"), slug: slug(input.slug),
      description: typeof input.description === "string" ? input.description.trim().slice(0, 5000) : null,
      sku: typeof input.sku === "string" ? input.sku.trim().slice(0, 100) : null,
      price: money(input.price), attributes: values,
      weightKg: optionalPositive(input.weightKg, "weightKg"),
      lengthCm: optionalPositive(input.lengthCm, "lengthCm"),
      breadthCm: optionalPositive(input.breadthCm, "breadthCm"),
      heightCm: optionalPositive(input.heightCm, "heightCm"),
    }).returning();
    await tx.insert(productAdmins).values({ productId: result.id, adminId });
    return result;
  });
}
