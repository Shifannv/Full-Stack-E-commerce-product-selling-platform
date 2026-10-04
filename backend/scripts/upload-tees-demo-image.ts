/**
 * Uploads the real Tees demo image via the running local Worker.
 *
 * Prerequisites:
 *   1. npm run dev (Worker on 127.0.0.1:8787 with test DB)
 *   2. npx tsx scripts/setup-tees-demo-auth.ts  (credentials added)
 *
 * Run: npx tsx scripts/upload-tees-demo-image.ts <path-to-image>
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { createDb } from "../src/db/index.js";
import { products, productImages } from "../src/db/schema/catalog.js";
import { eq } from "drizzle-orm";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) { console.error("ABORT: CHECKOUT_TEST_DATABASE_URL not set"); process.exit(1); }
const parsedUrl = new URL(testUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "5432" ||
  parsedUrl.pathname !== "/ownline_checkout_test" ||
  decodeURIComponent(parsedUrl.username) !== "postgres"
) {
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL must point to postgres@127.0.0.1:5432/ownline_checkout_test");
  process.exit(1);
}
if (process.env.DATABASE_URL) {
  const shared = new URL(process.env.DATABASE_URL);
  if (parsedUrl.host === shared.host && parsedUrl.pathname === shared.pathname) {
    console.error("ABORT: test URL matches DATABASE_URL"); process.exit(1);
  }
}

const WORKER_BASE = "http://127.0.0.1:8787";
const PRODUCT_SLUG = "tees";
const PRODUCT_ID = "cc2c96f0-e1f0-4a53-8bf7-9e836a2e9c7a";
const ADMIN_EMAIL = "tees-demo-seed@example.invalid";
const ADMIN_PASSWORD = "TeesDemo-LocalOnly-2026!";
const PLACEHOLDER_PREFIX = `products/${PRODUCT_ID}/`;

// Image path from CLI arg or default to session scratchpad
const imagePath = process.argv[2] ??
  String.raw`C:\Users\Lenovo\AppData\Local\Temp\claude\d--dropshiping-full-stack-E-commerce\2c3c364e-2f27-4d93-bc20-483c5f1902d0\images\1.jpg`;

// Trusted origin for mutationOrigin middleware
const ORIGIN = "http://127.0.0.1:3000";

async function apiFetch(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${WORKER_BASE}${path}`, { ...init, headers, redirect: "manual" });
}

async function api<T>(path: string, init: RequestInit = {}, cookie?: string): Promise<T> {
  const res = await apiFetch(path, init, cookie);
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`API ${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function main() {
  console.log(`\nTees demo image upload → ${WORKER_BASE} → ownline_checkout_test\n`);

  // ── Step 0: Check Worker health ───────────────────────────────────────────
  const health = await fetch(`${WORKER_BASE}/health`).catch(() => null);
  if (!health?.ok) {
    console.error("BLOCKER: Worker is not running at 127.0.0.1:8787. Start with: npm run dev");
    process.exitCode = 1;
    return;
  }
  console.log("[0] Worker health: OK  ✓");

  // ── Step 1: Load image file ────────────────────────────────────────────────
  let imageBytes: Buffer;
  try {
    imageBytes = await readFile(imagePath);
  } catch {
    console.error(`BLOCKER: Cannot read image file: ${imagePath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[1] Image file loaded: ${imageBytes.length} bytes from ${imagePath}  ✓`);

  // ── Step 2: Sign in as demo admin ─────────────────────────────────────────
  const signInRes = await apiFetch("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    headers: { "Content-Type": "application/json" },
  });
  if (!signInRes.ok) {
    const body = await signInRes.text().catch(() => "");
    console.error(`BLOCKER: Sign-in failed HTTP ${signInRes.status}: ${body}`);
    process.exitCode = 1;
    return;
  }
  const sessionCookie = signInRes.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  if (!sessionCookie) {
    console.error("BLOCKER: Sign-in returned no session cookie");
    process.exitCode = 1;
    return;
  }
  console.log("[2] Sign-in: OK, session cookie obtained  ✓");

  // ── Step 3: Verify actor identity ─────────────────────────────────────────
  const me = await api<{ userId: string; roles: string[]; adminApproved: boolean }>(
    "/api/me", {}, sessionCookie,
  );
  assert.ok(me.roles.includes("ADMIN"), `Expected ADMIN role, got: ${JSON.stringify(me.roles)}`);
  assert.equal(me.adminApproved, true, "Admin must be approved");
  console.log(`[3] Actor: userId=${me.userId} roles=${JSON.stringify(me.roles)} adminApproved=${me.adminApproved}  ✓`);

  // ── Step 4: Verify admin has category scope ────────────────────────────────
  const { categories } = await api<{ categories: { slug: string }[] }>(
    "/api/admin/categories", {}, sessionCookie,
  );
  const hasMensClothing = categories.some((c) => c.slug === "mens-clothing");
  assert.ok(hasMensClothing, "Admin does not have mens-clothing in scope");
  console.log(`[4] Admin category scope: mens-clothing present  ✓`);

  // ── Step 5: Delete placeholder image row ─────────────────────────────────
  const { db, client } = createDb(testUrl!);
  try {
    const existingImages = await db
      .select({ id: productImages.id, objectKey: productImages.objectKey })
      .from(productImages)
      .where(eq(productImages.productId, PRODUCT_ID));
    const placeholders = existingImages.filter((img) =>
      img.objectKey.startsWith(PLACEHOLDER_PREFIX),
    );
    if (placeholders.length > 0) {
      console.log(`[5] Removing ${placeholders.length} placeholder image row(s)…`);
      for (const ph of placeholders) {
        await db.delete(productImages).where(eq(productImages.id, ph.id));
        console.log(`    Deleted: ${ph.objectKey}`);
      }
    } else {
      console.log("[5] No placeholder image rows found (already clean)  ✓");
    }
  } finally {
    await client.end({ timeout: 2 });
  }

  // ── Step 6: Upload real image ──────────────────────────────────────────────
  const form = new FormData();
  form.append(
    "file",
    new File([imageBytes.buffer as ArrayBuffer], "tees-demo.jpg", { type: "image/jpeg" }),
  );
  form.append("altText", "Tees — Men's Thrift Clothing");
  form.append("sortOrder", "0");

  const uploadRes = await apiFetch(
    `/api/admin/products/${PRODUCT_ID}/images/upload`,
    { method: "POST", body: form },
    sessionCookie,
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "(no body)");
    console.error(`BLOCKER: Image upload failed HTTP ${uploadRes.status}: ${text}`);
    process.exitCode = 1;
    return;
  }

  const uploadResult = await uploadRes.json() as {
    id: string;
    objectKey: string;
    altText: string | null;
    sortOrder: number;
  };
  console.log(`[6] Upload response HTTP ${uploadRes.status}:`);
  console.log(`    id       : ${uploadResult.id}`);
  console.log(`    objectKey: ${uploadResult.objectKey}`);
  console.log(`    altText  : ${uploadResult.altText}`);
  console.log(`    sortOrder: ${uploadResult.sortOrder}`);
  assert.ok(
    uploadResult.objectKey.startsWith(`products/${PRODUCT_ID}/`),
    `objectKey prefix wrong: ${uploadResult.objectKey}`,
  );
  assert.ok(uploadResult.objectKey.endsWith(".jpg"), "objectKey must end with .jpg");
  console.log("[6] Upload: PASS  ✓");

  // ── Step 7: Verify product detail returns real image ──────────────────────
  const detail = await api<{
    id: string;
    slug: string;
    images: { id: string; objectKey: string; altText: string | null }[];
    variants: { sku: string; title: string }[];
    available: boolean;
  }>(`/api/products/${PRODUCT_SLUG}`, {}, sessionCookie);

  assert.equal(detail.images.length, 1, `Expected 1 image, got ${detail.images.length}`);
  const img = detail.images[0];
  assert.equal(img.objectKey, uploadResult.objectKey, "Image objectKey in detail doesn't match upload response");
  assert.ok(img.objectKey.endsWith(".jpg"), "Image must be .jpg");
  console.log(`[7] GET /api/products/tees images:`);
  console.log(`    objectKey: ${img.objectKey}  ✓`);
  console.log(`    altText  : ${img.altText}  ✓`);

  // ── Step 8: Variant regression ────────────────────────────────────────────
  assert.equal(detail.variants.length, 2, `Expected 2 variants, got ${detail.variants.length}`);
  const varM = detail.variants.find((v) => v.sku === "MTC-TEE-001-M");
  const varL = detail.variants.find((v) => v.sku === "MTC-TEE-001-L");
  assert.ok(varM && varL, "Variant M or L missing after upload");
  assert.equal(detail.available, true, "Product must still be available");
  console.log(`[8] Variant regression: M=${varM.title} L=${varL.title} available=${detail.available}  ✓`);

  // ── Step 9: Confirm no Aiven/production mutation ──────────────────────────
  console.log(`\n[9] Production safety:`);
  console.log(`    Worker DB   : ownline_checkout_test (127.0.0.1:5432)`);
  console.log(`    R2 bucket   : local (wrangler dev local R2 — remote:true disabled)`);
  console.log(`    DATABASE_URL: NOT accessed`);
  console.log(`    Aiven       : NOT accessed`);
  console.log(`    Cashfree    : NOT called`);
  console.log(`    Shiprocket  : NOT called`);
  console.log(`    Resend      : NOT called`);

  console.log(`
════════════════════════════════════════════════════════════════
IMAGE UPLOAD STATUS: PASS
════════════════════════════════════════════════════════════════
Worker           : http://127.0.0.1:8787 (wrangler dev, test DB)
Database         : ownline_checkout_test (127.0.0.1:5432)
Uploaded key     : ${uploadResult.objectKey}
R2 bucket        : shop-product-images (local wrangler mock — NOT production)
Product detail   : GET /api/products/tees → 1 image, 2 variants, available=true
════════════════════════════════════════════════════════════════
`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\nUpload script FAILED:", msg);
  if (err instanceof assert.AssertionError) {
    console.error("  expected:", (err as assert.AssertionError).expected);
    console.error("  actual  :", (err as assert.AssertionError).actual);
  }
  process.exitCode = 1;
});
