/**
 * In-process API verification for the Tees demo fixture.
 *
 * Calls app.fetch() directly with a mock Hyperdrive env pointing at the
 * test database. No wrangler, no network, no Cloudflare required.
 *
 * Run:  npx tsx scripts/verify-tees-demo-api.ts  (from ecommerce/backend/)
 */

import assert from "node:assert/strict";
import { config } from "dotenv";
import { app } from "../src/app.js";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

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
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL must point to 127.0.0.1:5432/ownline_checkout_test");
  process.exit(1);
}
if (process.env.DATABASE_URL) {
  const shared = new URL(process.env.DATABASE_URL);
  if (parsedUrl.host === shared.host && parsedUrl.pathname === shared.pathname) {
    console.error("ABORT: CHECKOUT_TEST_DATABASE_URL and DATABASE_URL point to the same database");
    process.exit(1);
  }
}

// Mock Cloudflare Worker env with HYPERDRIVE pointing at the test DB
const mockEnv = {
  HYPERDRIVE: { connectionString: testUrl },
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  // Other bindings the catalog routes don't need for read-only public catalog calls
};
const mockCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

async function apiGet(path: string): Promise<{ status: number; body: unknown }> {
  const req = new Request(`http://127.0.0.1:8787${path}`);
  const res = await app.fetch(req, mockEnv, mockCtx);
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  console.log(`\nVerifying Tees demo via in-process app.fetch() → ownline_checkout_test\n`);

  // ── A. Categories ──────────────────────────────────────────────────────────
  const { status: catStatus, body: catBody } = await apiGet("/api/categories");
  assert.equal(catStatus, 200, `GET /api/categories returned HTTP ${catStatus}`);
  const catData = catBody as { categories: { id: string; slug: string; name: string }[] };
  const category = catData.categories.find((c) => c.slug === "mens-clothing");
  assert.ok(category, 'Category slug "mens-clothing" not found in GET /api/categories');
  console.log(`[A] GET /api/categories → HTTP 200, "mens-clothing" present (${catData.categories.length} categories total)  ✓`);

  // ── B. Product list ────────────────────────────────────────────────────────
  const { status: listStatus, body: listBody } = await apiGet("/api/products?limit=50&offset=0");
  assert.equal(listStatus, 200, `GET /api/products returned HTTP ${listStatus}`);
  const listData = listBody as { products: { id: string; slug: string; name: string; featured: boolean; available: boolean; price: string }[] };
  const listedTees = listData.products.find((p) => p.slug === "tees");
  assert.ok(listedTees, 'Product slug "tees" not found in GET /api/products');
  assert.equal(listedTees.featured, true, "Tees must be featured=true");
  assert.equal(listedTees.available, true, "Tees must be available=true (has inventory)");
  console.log(`[B] GET /api/products → HTTP 200, "tees" present (${listData.products.length} products total)  ✓`);
  console.log(`    featured=${listedTees.featured} available=${listedTees.available} price=${listedTees.price}  ✓`);

  // ── C. Featured filter ─────────────────────────────────────────────────────
  const { status: featStatus, body: featBody } = await apiGet("/api/products?featured=true&limit=50");
  assert.equal(featStatus, 200, `GET /api/products?featured=true returned HTTP ${featStatus}`);
  const featData = featBody as { products: { slug: string }[] };
  const featuredTees = featData.products.find((p) => p.slug === "tees");
  assert.ok(featuredTees, '"tees" not found in featured=true filter');
  console.log(`[C] GET /api/products?featured=true → HTTP 200, "tees" in featured list  ✓`);

  // ── D. Product detail ──────────────────────────────────────────────────────
  const { status: detailStatus, body: detailBody } = await apiGet("/api/products/tees");
  assert.equal(detailStatus, 200, `GET /api/products/tees returned HTTP ${detailStatus}`);
  const detail = detailBody as {
    id: string;
    name: string;
    slug: string;
    price: string;
    currency: string;
    available: boolean;
    returnEnabled: boolean;
    attributes: Record<string, unknown>;
    categoryId: string;
    subcategoryId: string;
    variants: { id: string; sku: string; title: string; price: string; attributes: Record<string, unknown> }[];
    images: { objectKey: string }[];
  };
  assert.equal(detail.slug, "tees");
  assert.equal(detail.name, "Tees");
  assert.equal(detail.price, "249.00");
  assert.equal(detail.currency, "INR");
  assert.equal(detail.available, true, "Detail must show available=true");
  assert.equal(detail.returnEnabled, false);
  assert.deepEqual(detail.attributes, {}, "Product-level attributes must be {}");
  assert.equal(detail.categoryId, category.id, "Detail categoryId must match seeded category");
  console.log(`[D] GET /api/products/tees → HTTP 200`);
  console.log(`    name=${detail.name} price=${detail.price} ${detail.currency} available=${detail.available}  ✓`);
  console.log(`    attributes=${JSON.stringify(detail.attributes)} (product-level)  ✓`);
  console.log(`    returnEnabled=${detail.returnEnabled}  ✓`);
  console.log(`    categoryId=${detail.categoryId} (matches seeded category)  ✓`);

  // ── E. Variant verification ────────────────────────────────────────────────
  assert.equal(detail.variants.length, 2, `Expected 2 variants, got ${detail.variants.length}`);
  const varM = detail.variants.find((v) => v.sku === "MTC-TEE-001-M");
  const varL = detail.variants.find((v) => v.sku === "MTC-TEE-001-L");
  assert.ok(varM, "Variant M (MTC-TEE-001-M) not found in detail response");
  assert.ok(varL, "Variant L (MTC-TEE-001-L) not found in detail response");
  assert.equal(varM.title, "M");
  assert.equal(varL.title, "L");
  assert.deepEqual(varM.attributes, { size: "M" });
  assert.deepEqual(varL.attributes, { size: "L" });
  console.log(`[E] variants (2):`);
  console.log(`    M: sku=${varM.sku} title=${varM.title} price=${varM.price} attrs=${JSON.stringify(varM.attributes)}  ✓`);
  console.log(`    L: sku=${varL.sku} title=${varL.title} price=${varL.price} attrs=${JSON.stringify(varL.attributes)}  ✓`);

  // ── F. Image metadata in detail ────────────────────────────────────────────
  assert.equal(detail.images.length, 1, `Expected 1 image row, got ${detail.images.length}`);
  assert.ok(
    detail.images[0].objectKey.startsWith(`products/${detail.id}/`),
    `Image objectKey prefix wrong: ${detail.images[0].objectKey}`,
  );
  console.log(`[F] image metadata: objectKey=${detail.images[0].objectKey} (placeholder, no R2 file yet)  ✓`);

  // ── G. Category-scoped product list (by slug) ─────────────────────────────
  const { status: catProdStatus, body: catProdBody } = await apiGet(`/api/products?category=mens-clothing&limit=50`);
  assert.equal(catProdStatus, 200);
  const catProdData = catProdBody as { products: { slug: string }[] };
  const catTees = catProdData.products.find((p) => p.slug === "tees");
  assert.ok(catTees, '"tees" not found when filtering by category slug');
  console.log(`[G] GET /api/products?category=mens-clothing → "tees" present  ✓`);

  // ── H. Non-existent product returns 404 ───────────────────────────────────
  const { status: notFoundStatus } = await apiGet("/api/products/does-not-exist");
  assert.equal(notFoundStatus, 404, `Expected 404 for unknown slug, got ${notFoundStatus}`);
  console.log(`[H] GET /api/products/does-not-exist → HTTP 404  ✓`);

  console.log(`
════════════════════════════════════════════════════════════════
API VERIFICATION COMPLETE — all 8 checks PASS
════════════════════════════════════════════════════════════════`);
}

main().catch((err: unknown) => {
  console.error("\nAPI verification FAILED:", err instanceof Error ? err.message : String(err));
  if (err instanceof assert.AssertionError) {
    console.error("  expected:", err.expected);
    console.error("  actual  :", err.actual);
  }
  process.exitCode = 1;
});
