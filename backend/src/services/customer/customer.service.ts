import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { categories, inventories, productImages, products, productVariants, subcategories } from "../../db/schema/catalog";
import { cartItems, carts, customerAddresses, wishlistItems } from "../../db/schema/customer";
import { reviews } from "../../db/schema/reviews";
import { DomainError, requiredText } from "../admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];

export type CatalogSort = "newest" | "price-asc" | "price-desc";
export async function listCatalog(db: Db, filters: { q?: string; category?: string; subcategory?: string; minPrice?: number; maxPrice?: number; featured?: boolean; available?: boolean; sort?: CatalogSort; limit: number; offset: number }) {
  const conditions = [eq(products.status, "PUBLISHED"), eq(categories.status, "PUBLISHED"), eq(subcategories.status, "PUBLISHED")];
  if (filters.q) conditions.push(or(ilike(products.name, `%${filters.q}%`), ilike(products.description, `%${filters.q}%`))!);
  if (filters.category) conditions.push(eq(categories.slug, filters.category));
  if (filters.subcategory) conditions.push(eq(subcategories.slug, filters.subcategory));
  if (filters.minPrice !== undefined) conditions.push(gte(products.price, filters.minPrice.toFixed(2)));
  if (filters.maxPrice !== undefined) conditions.push(lte(products.price, filters.maxPrice.toFixed(2)));
  if (filters.featured === true) conditions.push(eq(products.featured, true));
  const stockCount = sql<number>`coalesce((select sum(i.available_quantity)::integer from inventories i where i.product_id = ${products.id} and (i.variant_id is null or exists (select 1 from product_variants v where v.id = i.variant_id and v.status = 'ACTIVE'))), 0)`;
  if (filters.available === true) conditions.push(sql`${stockCount} > 0`);
  const order = filters.sort === "price-asc" ? [asc(products.price), desc(products.createdAt), asc(products.id)] : filters.sort === "price-desc" ? [desc(products.price), desc(products.createdAt), asc(products.id)] : [desc(products.createdAt), asc(products.id)];
  return db.select({ id: products.id, name: products.name, slug: products.slug, description: products.description, price: products.price, currency: products.currency, returnEnabled: products.returnEnabled, featured: products.featured, createdAt: products.createdAt, category: categories.name, categorySlug: categories.slug, subcategory: subcategories.name, subcategorySlug: subcategories.slug,
    image: sql<{ objectKey: string; altText: string | null } | null>`(select json_build_object('objectKey', pi.object_key, 'altText', pi.alt_text) from product_images pi where pi.product_id = ${products.id} order by pi.sort_order, pi.id limit 1)`,
    available: sql<boolean>`${stockCount} > 0`,
    rating: sql<number | null>`(select round(avg(r.rating)::numeric, 2)::float from reviews r where r.product_id = ${products.id} and r.status = 'PUBLISHED')`,
    reviewCount: sql<number>`(select count(*)::integer from reviews r where r.product_id = ${products.id} and r.status = 'PUBLISHED')`,
  })
    .from(products).innerJoin(categories, eq(products.categoryId, categories.id)).innerJoin(subcategories, eq(products.subcategoryId, subcategories.id))
    .where(and(...conditions)).orderBy(...order).limit(filters.limit).offset(filters.offset);
}

export async function listPublicCategories(db: Db) {
  const rows = await db.select({ id: categories.id, name: categories.name, slug: categories.slug, description: categories.description })
    .from(categories).where(eq(categories.status, "PUBLISHED")).orderBy(asc(categories.sortOrder), asc(categories.name));
  return Promise.all(rows.map(async (category) => ({ ...category, subcategories: await db.select({ id: subcategories.id, name: subcategories.name, slug: subcategories.slug })
    .from(subcategories).where(and(eq(subcategories.categoryId, category.id), eq(subcategories.status, "PUBLISHED"))).orderBy(asc(subcategories.sortOrder), asc(subcategories.name)) })));
}

export async function getPublicProduct(db: Db, slug: string) {
  const [product] = await db.select({ id: products.id, categoryId: products.categoryId, subcategoryId: products.subcategoryId, name: products.name, slug: products.slug, description: products.description, price: products.price, currency: products.currency, attributes: products.attributes, returnEnabled: products.returnEnabled, createdAt: products.createdAt })
    .from(products).where(and(eq(products.slug, slug), eq(products.status, "PUBLISHED"))).limit(1);
  if (!product) throw new DomainError("Product unavailable", 404);
  const [category] = await db.select({ status: categories.status }).from(categories).where(eq(categories.id, product.categoryId)).limit(1);
  const [subcategory] = await db.select({ status: subcategories.status }).from(subcategories).where(eq(subcategories.id, product.subcategoryId)).limit(1);
  if (category?.status !== "PUBLISHED" || subcategory?.status !== "PUBLISHED") throw new DomainError("Product unavailable", 404);
  const images = await db.select({ id: productImages.id, objectKey: productImages.objectKey, altText: productImages.altText, sortOrder: productImages.sortOrder }).from(productImages).where(eq(productImages.productId, product.id)).orderBy(productImages.sortOrder);
  const variants = await db.select({ id: productVariants.id, sku: productVariants.sku, title: productVariants.title, price: productVariants.price, attributes: productVariants.attributes }).from(productVariants).where(and(eq(productVariants.productId, product.id), eq(productVariants.status, "ACTIVE")));
  const stock = await db.select({ variantId: inventories.variantId, availableQuantity: inventories.availableQuantity }).from(inventories).where(eq(inventories.productId, product.id));
  const activeVariantIds = new Set(variants.map((variant) => variant.id));
  const available = stock.some((row) => row.availableQuantity > 0 && (row.variantId === null || activeVariantIds.has(row.variantId)));
  const [reviewSummary] = await db.select({ rating: sql<number | null>`round(avg(${reviews.rating})::numeric, 2)::float`, reviewCount: sql<number>`count(*)::integer` }).from(reviews).where(and(eq(reviews.productId, product.id), eq(reviews.status, "PUBLISHED")));
  return { ...product, images, variants, available, rating: reviewSummary.rating, reviewCount: reviewSummary.reviewCount };
}

function addressInput(value: Record<string, unknown>) {
  const postalCode = requiredText(value.postalCode, "postalCode", 20);
  if (!/^\d{6}$/.test(postalCode)) throw new DomainError("Invalid postalCode", 422);
  return {
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 50) : "Home",
    contactName: requiredText(value.contactName, "contactName"), phone: requiredText(value.phone, "phone", 30),
    line1: requiredText(value.line1, "line1", 300), line2: typeof value.line2 === "string" ? value.line2.trim().slice(0, 300) || null : null,
    city: requiredText(value.city, "city", 100), state: requiredText(value.state, "state", 100), postalCode,
    country: typeof value.country === "string" && value.country.trim() ? value.country.trim().slice(0, 60) : "IN",
    isDefault: value.isDefault === true,
  };
}

export async function saveCustomerAddress(db: Db, customerId: string, value: Record<string, unknown>, addressId?: string) {
  const input = addressInput(value);
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(customerAddresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(customerAddresses.customerId, customerId));
    if (addressId) {
      const [saved] = await tx.update(customerAddresses).set({ ...input, updatedAt: new Date() }).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId))).returning();
      if (!saved) throw new DomainError("Address unavailable", 404);
      return saved;
    }
    const [saved] = await tx.insert(customerAddresses).values({ ...input, customerId }).returning();
    return saved;
  });
}

export async function listCustomerAddresses(db: Db, customerId: string) { return db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customerId)).orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt)); }
export async function deleteCustomerAddress(db: Db, customerId: string, addressId: string) { const [deleted] = await db.delete(customerAddresses).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId))).returning({ id: customerAddresses.id }); if (!deleted) throw new DomainError("Address unavailable", 404); return deleted; }

async function getCartId(db: Db, customerId: string): Promise<string> { const [cart] = await db.insert(carts).values({ customerId }).onConflictDoUpdate({ target: carts.customerId, set: { updatedAt: new Date() } }).returning({ id: carts.id }); return cart.id; }

export async function setCartItem(db: Db, customerId: string, productId: string, quantity: number, variantId?: string) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new DomainError("Invalid quantity", 422);
  const [product] = await db.select({ id: products.id, status: products.status }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.status !== "PUBLISHED") throw new DomainError("Product unavailable", 404);
  if (variantId) {
    const [variant] = await db.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), eq(productVariants.status, "ACTIVE"))).limit(1);
    if (!variant) throw new DomainError("Variant unavailable", 404);
  }
  const stockWhere = variantId ? eq(inventories.variantId, variantId) : and(eq(inventories.productId, productId), sql`${inventories.variantId} is null`);
  const [stock] = await db.select({ available: inventories.availableQuantity }).from(inventories).where(stockWhere).limit(1);
  if (!stock || stock.available < quantity) throw new DomainError("Insufficient stock", 422);
  const cartId = await getCartId(db, customerId);
  const existingWhere = variantId ? and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)) : and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId), sql`${cartItems.variantId} is null`);
  const [existing] = await db.select({ id: cartItems.id }).from(cartItems).where(existingWhere).limit(1);
  const [item] = existing
    ? await db.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, existing.id)).returning()
    : await db.insert(cartItems).values({ cartId, productId, variantId: variantId ?? null, quantity }).returning();
  return item;
}

export async function getCart(db: Db, customerId: string) {
  const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, customerId)).limit(1);
  if (!cart) return { items: [], subtotal: "0.00" };
  const items = await db.select({ id: cartItems.id, productId: products.id, variantId: cartItems.variantId, name: products.name, slug: products.slug, basePrice: products.price, variantTitle: productVariants.title, variantPrice: productVariants.price, currency: products.currency, quantity: cartItems.quantity })
    .from(cartItems).innerJoin(products, eq(cartItems.productId, products.id)).leftJoin(productVariants, eq(cartItems.variantId, productVariants.id)).where(eq(cartItems.cartId, cart.id));
  return { items: items.map((item) => ({ ...item, price: item.variantPrice ?? item.basePrice })), subtotal: items.reduce((sum, item) => sum + Number(item.variantPrice ?? item.basePrice) * item.quantity, 0).toFixed(2) };
}

export async function removeCartItem(db: Db, customerId: string, itemId: string) { const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, customerId)).limit(1); if (!cart) throw new DomainError("Cart item unavailable", 404); const [deleted] = await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id))).returning({ id: cartItems.id }); if (!deleted) throw new DomainError("Cart item unavailable", 404); return deleted; }

export async function setWishlist(db: Db, customerId: string, productId: string, enabled: boolean) {
  if (enabled) { const [product] = await db.select({ status: products.status }).from(products).where(eq(products.id, productId)).limit(1); if (product?.status !== "PUBLISHED") throw new DomainError("Product unavailable", 404); await db.insert(wishlistItems).values({ customerId, productId }).onConflictDoNothing(); }
  else await db.delete(wishlistItems).where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId)));
  return { productId, enabled };
}

export async function getWishlist(db: Db, customerId: string) { return db.select({ productId: products.id, name: products.name, slug: products.slug, price: products.price, currency: products.currency }).from(wishlistItems).innerJoin(products, eq(wishlistItems.productId, products.id)).where(and(eq(wishlistItems.customerId, customerId), eq(products.status, "PUBLISHED"))); }
