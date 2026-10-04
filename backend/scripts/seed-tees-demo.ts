/**
 * Dev demo seed — Tees product with 2 size variants in ownline_checkout_test.
 *
 * Run:     npx tsx scripts/seed-tees-demo.ts          (from ecommerce/backend/)
 * Cleanup: npx tsx scripts/seed-tees-demo.ts --cleanup
 *
 * Safety:  Aborts if CHECKOUT_TEST_DATABASE_URL is not 127.0.0.1:5432/ownline_checkout_test.
 *          Never reads or writes DATABASE_URL (Aiven/production).
 */

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/db/index.js";
import {
  categories,
  subcategories,
  products,
  productAdmins,
  productVariants,
  productImages,
  inventories,
} from "../src/db/schema/catalog.js";
import { admins } from "../src/db/schema/rbac.js";
import { users } from "../src/db/schema/auth.js";
import {
  adminCategoryAssignments,
  adminKycSubmissions,
} from "../src/db/schema/admin.js";

// Load test env (preferred) then fall back to .env.
// Paths are relative to CWD (ecommerce/backend/) — same convention as all other scripts.
config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

// ── Safety guard (runs before any DB connection is made) ──────────────────────
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) {
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL is not set");
  process.exit(1);
}
const parsedUrl = new URL(testUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "5432" ||
  parsedUrl.pathname !== "/ownline_checkout_test" ||
  decodeURIComponent(parsedUrl.username) !== "postgres"
) {
  console.error(
    "ABORT: CHECKOUT_TEST_DATABASE_URL must point to postgres@127.0.0.1:5432/ownline_checkout_test",
    `\nGot: ${parsedUrl.username}@${parsedUrl.host}${parsedUrl.pathname}`,
  );
  process.exit(1);
}
if (process.env.DATABASE_URL) {
  const shared = new URL(process.env.DATABASE_URL);
  if (parsedUrl.host === shared.host && parsedUrl.pathname === shared.pathname) {
    console.error(
      "ABORT: CHECKOUT_TEST_DATABASE_URL and DATABASE_URL point to the same database",
    );
    process.exit(1);
  }
}

// ── Stable seed identifiers ───────────────────────────────────────────────────
const SEED_USER_ID = "tees-demo-seed-user";
const SEED_EMAIL = "tees-demo-seed@example.invalid";
const CATEGORY_SLUG = "mens-clothing";
const SUBCATEGORY_SLUG = "t-shirts";
const PRODUCT_SLUG = "tees";
const SKU_M = "MTC-TEE-001-M";
const SKU_L = "MTC-TEE-001-L";

// ── Cleanup ────────────────────────────────────────────────────────────────────
async function cleanup(db: ReturnType<typeof createDb>["db"]) {
  console.log("\nResolving seed IDs for cleanup…");
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, SEED_USER_ID))
    .limit(1);
  if (!user) {
    console.log("Seed user not found — nothing to clean up.");
    return;
  }
  const [admin] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.userId, SEED_USER_ID))
    .limit(1);
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, CATEGORY_SLUG))
    .limit(1);
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, PRODUCT_SLUG))
    .limit(1);

  console.log("Cleaning up Tees demo fixture…");
  await db.transaction(async (tx) => {
    if (product) {
      await tx.delete(productImages).where(eq(productImages.productId, product.id));
      await tx.delete(inventories).where(eq(inventories.productId, product.id));
      await tx.delete(productVariants).where(eq(productVariants.productId, product.id));
      await tx.delete(productAdmins).where(eq(productAdmins.productId, product.id));
      await tx.delete(products).where(eq(products.id, product.id));
    }
    if (admin) {
      await tx.delete(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, admin.id));
      await tx.delete(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, admin.id));
      await tx.delete(admins).where(eq(admins.id, admin.id));
    }
    if (category) {
      const [sub] = await tx
        .select({ id: subcategories.id })
        .from(subcategories)
        .where(and(eq(subcategories.categoryId, category.id), eq(subcategories.slug, SUBCATEGORY_SLUG)))
        .limit(1);
      if (sub) await tx.delete(subcategories).where(eq(subcategories.id, sub.id));
      await tx.delete(categories).where(eq(categories.id, category.id));
    }
    await tx.delete(users).where(eq(users.id, SEED_USER_ID));
  });
  console.log("Cleanup complete.");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { db, client } = createDb(testUrl!);
  const doCleanup = process.argv.includes("--cleanup");
  try {
    if (doCleanup) {
      await cleanup(db);
      return;
    }

    console.log(`\nSeeding Tees demo into ownline_checkout_test (${parsedUrl.host})…\n`);

    // Idempotency guard
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, SEED_USER_ID))
      .limit(1);
    if (existing) {
      console.error("ABORT: Seed already present (tees-demo-seed-user exists). Run --cleanup first.");
      process.exitCode = 1;
      return;
    }

    const adminId = randomUUID();
    const categoryId = randomUUID();
    const subcategoryId = randomUUID();
    const productId = randomUUID();
    const variantMId = randomUUID();
    const variantLId = randomUUID();
    const imageId = randomUUID();
    const imageObjectKey = `products/${productId}/${randomUUID()}.jpg`;

    await db.transaction(async (tx) => {
      // 1. Minimal ACTIVE user + admin (no invitation/KYC flow needed for dev)
      await tx.insert(users).values({
        id: SEED_USER_ID,
        name: "Tees Demo Seller",
        email: SEED_EMAIL,
        emailVerified: true,
        status: "ACTIVE",
      });
      await tx.insert(admins).values({ id: adminId, userId: SEED_USER_ID, status: "ACTIVE" });
      await tx.insert(adminKycSubmissions).values({
        adminId,
        status: "APPROVED",
        legalName: "Tees Demo Seller",
        businessType: "PERSON",
        contactPhone: "9999999999",
      });

      // 2. Category + subcategory (PUBLISHED)
      await tx.insert(categories).values({
        id: categoryId,
        name: "Men's Thrift Clothing",
        slug: CATEGORY_SLUG,
        status: "PUBLISHED",
      });
      await tx.insert(subcategories).values({
        id: subcategoryId,
        categoryId,
        name: "T-Shirts",
        slug: SUBCATEGORY_SLUG,
        status: "PUBLISHED",
      });
      await tx.insert(adminCategoryAssignments).values({ adminId, categoryId, status: "ACTIVE" });

      // 3. Product — PUBLISHED so the public catalog query returns it.
      //    attributes: {} (no categoryProductFields configured for mens-clothing)
      //    sku: null (product-level SKU is optional; variants carry their own SKUs)
      //    returnEnabled: false (only "dress" category slug permits true)
      await tx.insert(products).values({
        id: productId,
        categoryId,
        subcategoryId,
        createdByAdminId: adminId,
        name: "Tees",
        slug: PRODUCT_SLUG,
        price: "249.00",
        currency: "INR",
        status: "PUBLISHED",
        featured: true,
        returnEnabled: false,
        attributes: {},
      });
      await tx.insert(productAdmins).values({ productId, adminId });

      // 4. Size variants (size at variant level, not product level)
      await tx.insert(productVariants).values([
        { id: variantMId, productId, sku: SKU_M, title: "M", price: "249.00", attributes: { size: "M" }, status: "ACTIVE" },
        { id: variantLId, productId, sku: SKU_L, title: "L", price: "249.00", attributes: { size: "L" }, status: "ACTIVE" },
      ]);

      // 5. Inventory per variant (version=0 for fresh INSERT path)
      await tx.insert(inventories).values([
        { productId, variantId: variantMId, availableQuantity: 1, version: 0 },
        { productId, variantId: variantLId, availableQuantity: 1, version: 0 },
      ]);

      // 6. Image metadata (placeholder objectKey — actual file needs R2 upload later)
      await tx.insert(productImages).values({
        id: imageId,
        productId,
        variantId: null,
        objectKey: imageObjectKey,
        altText: "Tees demo image",
        sortOrder: 0,
      });
    });

    // ── Verification queries ────────────────────────────────────────────────
    console.log("Running post-insert verification queries…\n");

    const [cat] = await db
      .select({ id: categories.id, name: categories.name, slug: categories.slug, status: categories.status })
      .from(categories).where(eq(categories.slug, CATEGORY_SLUG)).limit(1);
    assert.ok(cat, "Category not found after insert");
    assert.equal(cat.slug, CATEGORY_SLUG);
    assert.equal(cat.status, "PUBLISHED");
    console.log(`[1] category       : ${cat.name} (${cat.slug}) status=${cat.status}  ✓`);

    const [sub] = await db
      .select({ id: subcategories.id, name: subcategories.name, slug: subcategories.slug, status: subcategories.status })
      .from(subcategories)
      .where(and(eq(subcategories.categoryId, cat.id), eq(subcategories.slug, SUBCATEGORY_SLUG)))
      .limit(1);
    assert.ok(sub, "Subcategory not found after insert");
    assert.equal(sub.status, "PUBLISHED");
    console.log(`[2] subcategory    : ${sub.name} (${sub.slug}) status=${sub.status}  ✓`);

    const [prod] = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        status: products.status,
        featured: products.featured,
        price: products.price,
        currency: products.currency,
        sku: products.sku,
        returnEnabled: products.returnEnabled,
        attributes: products.attributes,
        categoryId: products.categoryId,
        subcategoryId: products.subcategoryId,
      })
      .from(products).where(eq(products.slug, PRODUCT_SLUG)).limit(1);
    assert.ok(prod, "Product not found after insert");
    assert.equal(prod.status, "PUBLISHED");
    assert.equal(prod.featured, true);
    assert.equal(prod.price, "249.00");
    assert.equal(prod.currency, "INR");
    assert.equal(prod.sku, null, "Product-level SKU must be NULL");
    assert.equal(prod.returnEnabled, false);
    assert.deepEqual(prod.attributes, {}, "Product attributes must be {}");
    assert.equal(prod.categoryId, cat.id, "Product → category FK mismatch");
    assert.equal(prod.subcategoryId, sub.id, "Product → subcategory FK mismatch");
    console.log(`[3] product        : ${prod.name} (${prod.slug}) status=${prod.status} featured=${prod.featured} price=${prod.price} ${prod.currency}  ✓`);
    console.log(`    attributes     : ${JSON.stringify(prod.attributes)} (product-level)  ✓`);
    console.log(`    product sku    : ${prod.sku ?? "NULL"}  ✓`);
    console.log(`    returnEnabled  : ${prod.returnEnabled}  ✓`);
    console.log(`    category FK    : ${prod.categoryId === cat.id ? "MATCH" : "MISMATCH"}  ✓`);
    console.log(`    subcategory FK : ${prod.subcategoryId === sub.id ? "MATCH" : "MISMATCH"}  ✓`);

    const variantRows = await db
      .select({ id: productVariants.id, sku: productVariants.sku, title: productVariants.title, price: productVariants.price, attributes: productVariants.attributes, status: productVariants.status })
      .from(productVariants).where(eq(productVariants.productId, prod.id));
    assert.equal(variantRows.length, 2, "Expected exactly 2 variants");
    const varM = variantRows.find((v) => v.sku === SKU_M);
    const varL = variantRows.find((v) => v.sku === SKU_L);
    assert.ok(varM, "Variant M not found");
    assert.ok(varL, "Variant L not found");
    assert.deepEqual(varM.attributes, { size: "M" });
    assert.deepEqual(varL.attributes, { size: "L" });
    assert.equal(varM.status, "ACTIVE");
    assert.equal(varL.status, "ACTIVE");
    console.log(`[4] variant M      : sku=${varM.sku} title=${varM.title} price=${varM.price} attrs=${JSON.stringify(varM.attributes)} status=${varM.status}  ✓`);
    console.log(`[5] variant L      : sku=${varL.sku} title=${varL.title} price=${varL.price} attrs=${JSON.stringify(varL.attributes)} status=${varL.status}  ✓`);

    const invRows = await db
      .select({ variantId: inventories.variantId, qty: inventories.availableQuantity, version: inventories.version })
      .from(inventories).where(eq(inventories.productId, prod.id));
    assert.equal(invRows.length, 2, "Expected exactly 2 inventory rows");
    const invM = invRows.find((i) => i.variantId === varM.id);
    const invL = invRows.find((i) => i.variantId === varL.id);
    assert.ok(invM && invL, "Inventory rows not found for both variants");
    assert.equal(invM!.qty, 1);
    assert.equal(invL!.qty, 1);
    console.log(`[6] inventory M    : variantId=${invM!.variantId} qty=${invM!.qty}  ✓`);
    console.log(`[7] inventory L    : variantId=${invL!.variantId} qty=${invL!.qty}  ✓`);

    const [img] = await db
      .select({ objectKey: productImages.objectKey, altText: productImages.altText, variantId: productImages.variantId })
      .from(productImages).where(eq(productImages.productId, prod.id)).limit(1);
    assert.ok(img, "Image row not found");
    assert.ok(img.objectKey.startsWith(`products/${prod.id}/`), "Image objectKey prefix wrong");
    assert.equal(img.variantId, null, "Image must be product-level, not variant-level");
    console.log(`[8] image metadata : objectKey=${img.objectKey}  ✓`);
    console.log(`    (placeholder — no actual file in R2 yet)`);

    console.log(`
════════════════════════════════════════════════════════════════
IDs
════════════════════════════════════════════════════════════════`);
    console.log(JSON.stringify({
      userId: SEED_USER_ID,
      adminId,
      categoryId: cat.id,
      subcategoryId: sub.id,
      productId: prod.id,
      variantMId: varM.id,
      variantLId: varL.id,
      imageObjectKey: img.objectKey,
    }, null, 2));
    console.log(`\nTo remove: npx tsx scripts/seed-tees-demo.ts --cleanup`);
  } finally {
    await client.end({ timeout: 2 });
  }
}

main().catch((err: unknown) => {
  console.error("\nSeed FAILED:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
