import { and, eq, isNull } from "drizzle-orm";
import type { createDb } from "../../db";
import {
  categories,
  inventories,
  productAdmins,
  products,
  productVariants,
  subcategories,
} from "../../db/schema/catalog";
import { adminCategoryAssignments } from "../../db/schema/admin";
import { admins } from "../../db/schema/rbac";
import { DomainError } from "../admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];
type QueryDb = Pick<Db, "select">;

export async function canPurchaseProduct(
  db: QueryDb,
  productId: string,
  variantId: string | null,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    throw new DomainError("Invalid quantity", 422);
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product || product.status !== "PUBLISHED")
    throw new DomainError("PRODUCT_UNAVAILABLE", 409);
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, product.categoryId))
    .limit(1);
  if (category?.status !== "PUBLISHED")
    throw new DomainError("PRODUCT_UNAVAILABLE", 409);
  const [subcategory] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, product.subcategoryId))
    .limit(1);
  if (
    subcategory?.status !== "PUBLISHED" ||
    subcategory.categoryId !== product.categoryId
  )
    throw new DomainError("PRODUCT_UNAVAILABLE", 409);
  const [seller] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, product.createdByAdminId))
    .limit(1);
  if (seller?.status !== "ACTIVE" || seller.deletedAt)
    throw new DomainError("PRODUCT_UNAVAILABLE", 409);
  const [assignment] = await db
    .select()
    .from(adminCategoryAssignments)
    .where(
      and(
        eq(adminCategoryAssignments.adminId, seller.id),
        eq(adminCategoryAssignments.categoryId, product.categoryId),
        eq(adminCategoryAssignments.status, "ACTIVE"),
      ),
    )
    .limit(1);
  const [management] = await db
    .select()
    .from(productAdmins)
    .where(
      and(
        eq(productAdmins.productId, product.id),
        eq(productAdmins.adminId, seller.id),
      ),
    )
    .limit(1);
  if (!assignment || !management)
    throw new DomainError("PRODUCT_UNAVAILABLE", 409);
  const [variant] = variantId
    ? await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1)
    : [null];
  if (
    variantId &&
    (!variant ||
      variant.productId !== product.id ||
      variant.status !== "ACTIVE")
  )
    throw new DomainError("VARIANT_UNAVAILABLE", 409);
  const [inventory] = await db
    .select()
    .from(inventories)
    .where(
      and(
        eq(inventories.productId, product.id),
        variant
          ? eq(inventories.variantId, variant.id)
          : isNull(inventories.variantId),
      ),
    )
    .limit(1);
  if (!inventory || inventory.availableQuantity < quantity)
    throw new DomainError("INSUFFICIENT_STOCK", 409);
  const unitPrice = variant?.price ?? product.price;
  if (
    product.currency !== "INR" ||
    !/^\d+(\.\d{1,2})?$/.test(unitPrice) ||
    !(variant?.sku ?? product.sku)?.trim() ||
    !product.weightKg ||
    !product.lengthCm ||
    !product.breadthCm ||
    !product.heightCm
  )
    throw new DomainError("PRODUCT_UNAVAILABLE", 409);
  return { product, variant, inventory, unitPrice };
}
