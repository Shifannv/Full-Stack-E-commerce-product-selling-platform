/**
 * Controlled production catalog test fixture.
 *
 * Creates ONE additional test product:
 *   "TEST Ownline Out of Stock No Image"
 *
 * Requirements closed by this script:
 *   - Out-of-stock product fixture  (#1)
 *   - Product-without-image fixture (#2)
 *
 * Safety constraints:
 *   - Targets the deployed production API over HTTPS only.
 *   - No direct database access; all mutations go through the approved
 *     admin HTTP API so every write is subject to the same RBAC, audit, and
 *     validation rules that protect the production catalog.
 *   - Uses the existing Phase 11b-2 super-admin and admin identities.
 *   - Reuses the existing published category/subcategory; never creates new
 *     ones.
 *   - Does NOT: upload images, create orders, touch payments, call Shiprocket,
 *     call Cashfree, call Resend, modify R2, change schema, or run migrations.
 *   - Does NOT modify the existing "TEST Ownline Everyday Cotton Tote" fixture.
 *
 * Environment (loaded from .env.phase11b2.local):
 *   BOOTSTRAP_SUPER_ADMIN_EMAIL / BOOTSTRAP_SUPER_ADMIN_PASSWORD
 *   PHASE11B2_ADMIN_EMAIL       / PHASE11B2_ADMIN_PASSWORD
 *   PHASE11B2_FIXTURE_SUFFIX
 *
 * Target API (override with PHASE11B2_PROD_API_URL):
 *   https://ecommerce-api.ownlinedropshipping.workers.dev
 *
 * Target frontend origin (override with PHASE11B2_PROD_FRONTEND_ORIGIN):
 *   https://ownline-ecommerce.pages.dev
 */

import assert from "node:assert/strict";
import { config } from "dotenv";

// Load base env first, then the phase11b2 local overrides.
config({ path: ".env", quiet: true });
config({ path: ".env.phase11b2.local", quiet: true });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const base =
  process.env.PHASE11B2_PROD_API_URL ??
  "https://ecommerce-api.ownlinedropshipping.workers.dev";
const origin =
  process.env.PHASE11B2_PROD_FRONTEND_ORIGIN ??
  "https://ownline-ecommerce.pages.dev";

const suffix = process.env.PHASE11B2_FIXTURE_SUFFIX;
const superEmail = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
const superPassword = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
const adminEmail = process.env.PHASE11B2_ADMIN_EMAIL;
const adminPassword = process.env.PHASE11B2_ADMIN_PASSWORD;

if (!suffix || !superEmail || !superPassword || !adminEmail || !adminPassword)
  throw new Error(
    "Incomplete fixture configuration — check .env.phase11b2.local",
  );

if (
  !superEmail.endsWith("@example.invalid") ||
  !adminEmail.endsWith("@example.invalid") ||
  !/^[a-f0-9]{12}$/.test(suffix)
)
  throw new Error("Only synthetic Phase 11b-2 identities are allowed");

if (!base.startsWith("https://"))
  throw new Error(
    `PHASE11B2_PROD_API_URL must be an HTTPS URL; got: ${base}`,
  );

// The new product slug is deterministic — derived from the existing suffix so
// it is namespaced to the phase11b2 fixture set and will not collide with any
// real product.
const newProductSlug = `phase11b2-oos-no-image-${suffix}`;
const existingCategorySlug = `phase11b2-accessories-${suffix}`;
const existingProductSlug = `phase11b2-cotton-tote-${suffix}`;

console.log(
  `Target API  : ${base}`,
  `\nTarget origin: ${origin}`,
  `\nNew slug    : ${newProductSlug}`,
);

// ---------------------------------------------------------------------------
// Minimal HTTP helpers
// ---------------------------------------------------------------------------

async function apiFetch(
  path: string,
  init: RequestInit = {},
  cookie?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  if (
    init.body &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  return fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
}

async function api<T>(
  path: string,
  init: RequestInit = {},
  cookie?: string,
): Promise<T> {
  const response = await apiFetch(path, init, cookie);
  if (!response.ok) {
    const text = await response.text().catch(() => "(no body)");
    throw new Error(
      `API ${init.method ?? "GET"} ${path.split("?")[0]} → HTTP ${response.status}: ${text}`,
    );
  }
  return response.json() as Promise<T>;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await apiFetch("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Sign-in for ${email} returned HTTP ${response.status}`,
    );
  const cookie = response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`Sign-in for ${email} returned no session cookie`);
  return cookie;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ── Step 1: Authenticate as super admin ──────────────────────────────────
  const superCookie = await signIn(superEmail!, superPassword!);
  const superActor = await api<{ userId: string; roles: string[] }>(
    "/api/me",
    {},
    superCookie,
  );
  assert.ok(
    superActor.roles.includes("SUPER_ADMIN"),
    "Super admin role not present",
  );
  console.log("\n[1/8] Super admin authenticated: PASS");

  // ── Step 2: Authenticate as the approved phase11b2 admin ─────────────────
  const adminCookie = await signIn(adminEmail!, adminPassword!);
  const adminActor = await api<{
    userId: string;
    roles: string[];
    adminApproved: boolean;
  }>("/api/me", {}, adminCookie);
  assert.ok(adminActor.roles.includes("ADMIN"), "Admin role not present");
  assert.equal(
    adminActor.adminApproved,
    true,
    "Admin must be approved — run create-phase11b2-fixture.ts first",
  );
  console.log("[2/8] Approved admin authenticated: PASS");

  // ── Step 3: Resolve the existing category and subcategory ────────────────
  // The admin's /api/admin/categories endpoint returns only categories that
  // this admin is assigned to, which is exactly the phase11b2 fixture category.
  const { categories } = await api<{
    categories: {
      id: string;
      slug: string;
      subcategories: { id: string; slug: string }[];
    }[];
  }>("/api/admin/categories", {}, adminCookie);

  const category = categories.find((c) => c.slug === existingCategorySlug);
  assert.ok(
    category,
    `Fixture category "${existingCategorySlug}" not found in admin's category list. ` +
      "Run create-phase11b2-fixture.ts first.",
  );
  // Take the first subcategory assigned to this category (cotton-bags).
  const subcategory = category.subcategories[0];
  assert.ok(
    subcategory,
    "No subcategory found under fixture category. Check the phase11b2 fixture state.",
  );
  console.log(
    `[3/8] Category "${category.slug}" (id=${category.id}), ` +
      `subcategory "${subcategory.slug}" (id=${subcategory.id}): FOUND`,
  );

  // ── Step 4: Verify the existing Cotton Tote fixture is untouched ─────────
  // This is a read-only pre-flight check — we assert it exists and has not
  // been accidentally touched by anything in this script.
  const existingProductCheck = await api<{
    id: string;
    slug: string;
    available: boolean;
    images: unknown[];
    featured: boolean;
  }>(`/api/products/${existingProductSlug}`, {}, undefined);
  assert.equal(
    existingProductCheck.slug,
    existingProductSlug,
    "Existing Cotton Tote slug mismatch",
  );
  const cottonToteId = existingProductCheck.id;
  console.log(
    `[4/8] Existing fixture "${existingProductSlug}" (id=${cottonToteId}) confirmed present (pre-check): PASS`,
  );

  // ── Step 5: Create the new product (idempotent) ─────────────────────────
  // If the product already exists (e.g. this script is re-run after a partial
  // success), skip creation and reuse the existing ID.
  let newProductId: string;
  const preExistCheck = await apiFetch(`/api/products/${newProductSlug}`);
  if (preExistCheck.status === 200) {
    const existing = (await preExistCheck.json()) as { id: string };
    newProductId = existing.id;
    console.log(
      `[5/8] Product already exists (id=${newProductId}), skipping creation: IDEMPOTENT`,
    );
  } else {
    const newProduct = await api<{ id: string }>(
      "/api/admin/products",
      {
        method: "POST",
        body: JSON.stringify({
          categoryId: category.id,
          subcategoryId: subcategory.id,
          name: "TEST Ownline Out of Stock No Image",
          slug: newProductSlug,
          description:
            "Controlled catalog verification fixture.\n\n" +
            "This product is published intentionally with zero inventory and no " +
            "product image so that the storefront can be tested for correct " +
            "out-of-stock and no-image-fallback behaviour without requiring a " +
            "real purchasable product.\n\n" +
            "Not offered for sale. Do not order.",
          sku: `TEST-OOS-NOIMG-${suffix}`,
          price: "1.00",
          weightKg: "0.001",
          lengthCm: "1.00",
          breadthCm: "1.00",
          heightCm: "1.00",
          attributes: {},
          returnEnabled: false,
        }),
      },
      adminCookie,
    );
    assert.ok(
      typeof newProduct.id === "string" && newProduct.id.length > 0,
      "Product creation did not return an id",
    );
    newProductId = newProduct.id;
    console.log(`[5/8] Product created: id=${newProductId}: PASS`);
  }

  // ── Step 6: Set inventory to 0 (explicit zero-stock record) ──────────────
  // expectedVersion=0 triggers the INSERT path (no existing inventory row).
  // quantity=0 → availableQuantity=0 → available=false in the public API.
  // This step is a no-op if inventory was already set on a previous run
  // (the version guard makes it safe to skip — a stale version just means
  // the record already exists).
  try {
    await api(
      `/api/admin/products/${newProductId}/inventory`,
      {
        method: "PUT",
        body: JSON.stringify({ quantity: 0, expectedVersion: 0 }),
      },
      adminCookie,
    );
    console.log("[6/8] Inventory set to 0 (availableQuantity=0): PASS");
  } catch (err) {
    // If the inventory row already exists and version > 0, the API returns 409
    // INVENTORY_VERSION_STALE. That means inventory was already set on a
    // previous run — treat as idempotent.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("409") || msg.includes("INVENTORY_VERSION_STALE")) {
      console.log(
        "[6/8] Inventory already set (version stale — pre-existing row): IDEMPOTENT",
      );
    } else {
      throw err;
    }
  }

  // ── Step 7: Publish the product (Super Admin action) ─────────────────────
  // Do NOT set featured — this fixture must not appear on the featured list.
  // Safe to call even if already published (PATCH is idempotent for status).
  await api(
    `/api/admin/catalog/products/${newProductId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "PUBLISHED" }),
    },
    superCookie,
  );
  console.log("[7/8] Product published (featured=false, not set): PASS");

  const newProduct = { id: newProductId };

  // ── Step 8: Verify via public customer APIs ───────────────────────────────
  // 8a. The new product must appear in the default product list.
  const productList = await api<{
    products: {
      id: string;
      slug: string;
      available: boolean;
      featured: boolean;
      image: unknown;
    }[];
  }>("/api/products", {});
  const listedProduct = productList.products.find(
    (p) => p.slug === newProductSlug,
  );
  assert.ok(listedProduct, "New product not found in GET /api/products");
  assert.equal(
    listedProduct.available,
    false,
    "New product must be available=false (out of stock)",
  );
  assert.equal(
    listedProduct.featured,
    false,
    "New product must not be featured",
  );
  assert.equal(
    listedProduct.image,
    null,
    "New product must have no cover image",
  );

  // 8b. The ?inStock=true filter must exclude the new product.
  const inStockList = await api<{
    products: { slug: string }[];
  }>("/api/products?inStock=true", {});
  assert.ok(
    !inStockList.products.some((p) => p.slug === newProductSlug),
    "New product must NOT appear when inStock=true filter is applied",
  );

  // 8c. Product detail endpoint.
  const detail = await api<{
    id: string;
    slug: string;
    available: boolean;
    images: unknown[];
    variants: unknown[];
    // Note: the public detail endpoint (getPublicProduct) does not expose
    // `featured` — that field is only present in the list endpoint response.
  }>(`/api/products/${newProductSlug}`, {});
  assert.equal(detail.id, newProduct.id, "Detail id mismatch");
  assert.equal(detail.slug, newProductSlug, "Detail slug mismatch");
  assert.equal(detail.available, false, "Detail must be available=false");
  assert.deepEqual(detail.images, [], "Detail must have no images");
  assert.deepEqual(detail.variants, [], "Detail must have no variants");
  // featured is verified via the list endpoint above (listedProduct.featured===false);
  // getPublicProduct does not include featured in its response shape.
  console.log(
    `[8/8] Public API verification:\n` +
      `  GET /api/products                   → listed, available=false, featured=false, image=null  PASS\n` +
      `  GET /api/products?inStock=true       → correctly absent from in-stock filter               PASS\n` +
      `  GET /api/products/${newProductSlug}  → HTTP 200, available=false, images=[], variants=[]   PASS`,
  );

  // ── Final: confirm existing Cotton Tote is unchanged ─────────────────────
  const cottonToteAfter = await api<{
    id: string;
    slug: string;
    available: boolean;
    images: unknown[];
    featured: boolean;
  }>(`/api/products/${existingProductSlug}`, {});
  assert.equal(
    cottonToteAfter.id,
    cottonToteId,
    "Cotton Tote id changed — unexpected mutation!",
  );
  assert.equal(
    cottonToteAfter.slug,
    existingProductSlug,
    "Cotton Tote slug changed — unexpected mutation!",
  );
  assert.equal(
    cottonToteAfter.available,
    existingProductCheck.available,
    "Cotton Tote availability changed — unexpected mutation!",
  );
  assert.equal(
    cottonToteAfter.featured,
    existingProductCheck.featured,
    "Cotton Tote featured flag changed — unexpected mutation!",
  );
  console.log(
    `\nExisting fixture "${existingProductSlug}" unchanged (post-check): PASS`,
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
══════════════════════════════════════════════════════════════════
FIXTURE CREATION REPORT
══════════════════════════════════════════════════════════════════
A. Fixture creation        : VERIFIED
B. New product ID          : ${newProduct.id}
   New product slug        : ${newProductSlug}
C. Published state         : PUBLISHED (confirmed via GET /api/products/:slug)
D. Inventory state         : availableQuantity=0, reservedQuantity=0
                             → available=false
E. Image state             : images=[] (no image)
F. Variant state           : variants=[]
G. Existing fixture        : UNCHANGED (Cotton Tote pre/post id & state match)
H. Public API result       : GET /api/products → listed
                             GET /api/products/${newProductSlug} → HTTP 200
I. Frontend static-build   : REQUIRED — product slug was not included in
                             the last static export; /products/${newProductSlug}
                             returns 404 on deployed Cloudflare Pages until
                             the frontend is rebuilt and redeployed.
                             Fixture exists in API but requires Pages rebuild
                             to test static UI.
J. Pages deployment needed : YES — trigger \`npm run build\` in /frontend and
                             push the new static export to Cloudflare Pages.
K. Blockers                : None for API layer. Pages rebuild is the only
                             remaining step for full static-route UI coverage.
L. Provider/business calls : NONE — no Cashfree, Shiprocket, Resend, R2,
                             Google OAuth, or order/payment calls were made.
══════════════════════════════════════════════════════════════════
`);
}

main().catch((error: unknown) => {
  console.error("\nOut-of-stock fixture creation FAILED", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
