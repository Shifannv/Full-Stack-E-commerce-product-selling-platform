# Ownline Dropship — Current Status

**Last reconciled:** 2026-10-06 (Admin + Super Admin UI redesign — all purpose-built screens implemented)
**Purpose:** Single source of truth for the current implementation state. Historical checkpoints in `PROJECT_CONTEXT.md`, `verification/*` and the historical part of `api/FRONTEND_API_MAP.md` are evidence only; where they disagree with this file, this file wins.

Labels: IMPLEMENTED, REFACTORED, TESTED, VERIFIED, BLOCKED, NOT VERIFIED, NOT TOUCHED, PRODUCTION VERIFIED.

---

## Headline

**Admin + Super Admin UI redesign — IMPLEMENTED, 2026-10-06.** All purpose-built operator screens built and connected to real backend APIs. Super Admin: reconciliation page rewired with real resolve/escalate mutations (replaced stub "use Workflows" section), new `/super-admin/reviews` page with pending review moderation + refund authorization. Admin: six new screens — `/admin/onboarding` (seller profile status, KYC, documents, addresses, bank, categories), `/admin/products` (list + detail panel with status transitions), `/admin/inventory` (product-scoped inventory with optimistic concurrency: `expectedVersion` sent, 409 INVENTORY_VERSION_STALE auto-refreshes), `/admin/orders` (all orders + per-order detail with shipment tracking), `/admin/returns` (paginated queue + received/decide/QC workflow inline), `/admin/finance` (available balance, settlements with exact Gross Product Sales/Commission/Gateway Fee/Refund Adjustment/Net Payable labels, payout request button, refund obligations). All screens use react-query, shared operator components (DataTable, StatusBadge, Panel, etc.), real API types, and proper error handling. Frontend TypeScript: PASS (0 errors). Three backend endpoints added in prior session (GET /api/admin/returns, GET /api/super-admin/settlements, GET /api/admin/products/:productId). Awaiting: authenticated browser E2E verification across all new screens, customer regression.

**Admin browser E2E lifecycle verification — VERIFIED, 2026-10-06.** Real Playwright Chromium sessions against `ownline_checkout_test` confirmed the complete Admin lifecycle across 9 phases: Super Admin browser provisioning + review workflow (--super-admin mode: masked bank reveal, CHANGES_REQUIRED, resubmission, APPROVED, 6 operator routes, desktop+mobile overflow); Admin login with temporary password + forced password change (--admin mode: old password rejected, session invalidated, sign-in with permanent password); role isolation (Admin blocked from Super Admin dashboard); full onboarding via UI (KYC details, KYC document upload via `setInputFiles`, SHIPPING_ORIGIN address, RETURN address after form remount, category request, bank details with masked response verified, application submit); PENDING_SUPER_ADMIN_APPROVAL confirmed in UI and database; pre-approval product creation blocked by API + error displayed; programmatic approval (bank VERIFIED → application APPROVED, DB status ACTIVE); active Admin dashboard (all 5 workspace groups, Finance balance load, Account lifecycle load, 6-viewport responsive overflow at 1440/1280/1024/768/390/375, screenshots saved); logout; password recovery (enumerate-safe forgot-password always returns "Check your email", no-token URL shows "No reset token was provided", raw token via `initiatePasswordReset` bypass, valid-token form renders, new password set, old password rejected, new password accepted, single-use enforcement: second use shows "invalid or has already expired"). All cleanup passed; protected Super Admin (`shifan.coding@gmail.com`) untouched. Full regression: 84/84 unit PASS, 349/349 PG PASS, backend TS PASS, frontend TS PASS, frontend lint PASS, frontend production build (real catalog from test DB via in-process bridge) PASS (6 category + 2 product static pages generated). No Aiven, no production, no Resend email, no Cashfree, no Shiprocket. Evidence: `docs/verification/ADMIN_BROWSER_E2E.md`.

**Admin UI frontend completion — IMPLEMENTED, 2026-10-06.** Three missing operator workflows added to `frontend/src/lib/api/operator-workflows.ts`: (1) Admin bank details (`PUT /api/admin/onboarding/bank` — account holder, bank name, account number, IFSC); (2) Super Admin provision (`POST /api/admin/review/provision` — name, email, temporary password); (3) Super Admin bank reveal (`POST /api/admin/review/:adminId/bank/reveal`); (4) Super Admin bank decision (`POST /api/admin/review/:adminId/bank/decision` — revision, decision, notes). Account page email display fixed (was showing userId UUID labeled "Email"; now shows "Account ID" in monospace). Frontend TypeScript: PASS. Frontend lint: PASS. Frontend production build with real catalog from `ownline_checkout_test` via in-process stub server: PASS (exit 0). Backend TypeScript: PASS. 84/84 unit tests: PASS. 349/349 PostgreSQL suite: PASS. Existing Super Admin account and customer storefront untouched. No backend changes. No migration. No production access. Admin browser E2E verification remains open (requires browser session with provisioned Admin account).

**Admin + Customer password recovery backend contract — IMPLEMENTED, locally verified, 2026-10-06.** Three anonymous endpoints (`POST /api/password-reset/forgot-password`, `GET /api/password-reset/validate`, `POST /api/password-reset/reset-password`) implement the full password-reset flow for CUSTOMER and ADMIN roles. Super Admin is explicitly excluded at every layer. 48-byte CSPRNG raw token; only SHA-256 hash stored in existing `verifications` table (no schema migration); 1-hour TTL; single-use delete on consumption; all sessions invalidated on success; rate-limited by CF edge IP (5 per 600 s). Reset email via existing Resend integration. No production email sent. Backend TypeScript: PASS. 23/23 focused password-reset PG tests: PASS. 84/84 unit tests: PASS. 349/349 full PostgreSQL suite: PASS. Drizzle check: clean. `git diff --check`: clean (pre-existing CRLF warnings only). Existing Super Admin account untouched. Existing Admin lifecycle unaffected. No migration required. Evidence below and in `docs/architecture/Forgot_Password_workflow.md`.

**Admin seller lifecycle continuation — PARTIAL, locally verified, 2026-10-05.** Temporary-password provisioning, server-enforced first-password change, encrypted mandatory bank details, Super Admin bank verification and approval/manual-payout gates are implemented. Backend TypeScript, 84 unit tests, 325 existing PG tests plus the new lifecycle integration test, frontend TypeScript/lint, authenticated Super Admin browser checks and a 29-page isolated build passed. The existing Super Admin account and customer storefront design were untouched. Admin UI, Admin browser verification and customer regression remain gated; the full master task is not complete. Evidence and limits: [ADMIN_SELLER_LIFECYCLE_LOCAL](verification/ADMIN_SELLER_LIFECYCLE_LOCAL.md). Authoritative business/API contract: [ADMIN_SELLER_LIFECYCLE](architecture/ADMIN_SELLER_LIFECYCLE.md).

**Authenticated CUSTOMER mutation verification completed locally, 2026-10-05: PASS.** Order cancellation, review submission and return-request submission passed through the exported frontend, real local Worker/API code, Better Auth sessions and `ownline_checkout_test`. Ownership, unauthenticated denial, eligibility, five-day delivered-at return deadline, replay/concurrency, cross-customer denial, database transitions and refreshed UI state were checked. Temporary `mut-e2e-` records were removed and a broad residue sweep returned zero. Frontend TypeScript/lint/build, backend TypeScript, 84/84 unit tests, 287/287 isolated PostgreSQL tests and `git diff --check` passed. No Aiven/production/provider/R2/deployment/migration operation occurred. Evidence: [CUSTOMER_MUTATIONS_LOCAL](verification/CUSTOMER_MUTATIONS_LOCAL.md).

**Customer, Admin and Super Admin frontend continuation IMPLEMENTED locally, 2026-10-04.** Shared cream/forest typography, customer page headings and redesigned footer; authenticated operator task workspace (76 tasks, 69 active, 7 gated); customer reviews, returns/status and unpaid-order cancellation. Checkout quote/idempotency and inventory version contracts corrected; added owner/category-scoped inventory GET with no migration. Frontend typecheck/lint, 85-route fixture export, 41 browser evidence entries, backend typecheck/83 unit tests and targeted local PG inventory test passed. Browser mutation checks use mocks; exhaustive live workflow verification and provider readiness are not claimed. Payment, invitations and courier gates stay paused; cron and production media/catalog gates remain. No deployment. Full connections, missing API proposals and verification limits: [FRONTEND_INTEGRATION_STATUS](api/FRONTEND_INTEGRATION_STATUS.md).

Storefront cinematic continuation **IMPLEMENTED and VERIFIED locally, 2026-10-04**: completed the partial Claude intro work and wired poster/video readiness, word-by-word Ownline branding, bounded curtain exit, hero-copy handoff and native/Lenis scroll locking. Dress leads with up to nine published products in a three-column desktop/tablet preview; See more opens the existing audience/type clothing browser. Editorial framing and category links reveal once while product grids stay static. TypeScript, lint, design detector, static export against the isolated synthetic catalog (84 routes), desktop/mobile Chrome checks and reduced-motion/data-saving/failed-media/no-JavaScript fallbacks passed. No deployment, backend, database or media-asset change. Implementation and validation details: [catalog/STOREFRONT_CAMPAIGN.md](catalog/STOREFRONT_CAMPAIGN.md).

Storefront homepage redesign implemented locally **2026-10-04**: USUL-inspired video-first layout, optimized desktop/mobile demo films, generated campaign poster/editorial image, mobile navigation improvements, Lenis and TanStack Query public catalog caching. TypeScript/lint and isolated synthetic-catalog static build passed; desktop/mobile browser playback, responsiveness, reduced motion, pagination and cache checks passed. Film text contrast finding corrected and independently reviewed. Configured local catalog is currently empty, so release export still requires real published category/product slugs. No deployment or database change in this task. Details and replacement instructions: [catalog/STOREFRONT_CAMPAIGN.md](catalog/STOREFRONT_CAMPAIGN.md).

Cloudflare infrastructure baseline deployed **2026-10-03**: current Worker, explicit production origins, both existing R2 bindings, and Pages static export/Function configuration. Cron remains disabled. Production media custom domain remains unresolved (no account zones returned); this is not a commerce launch approval. See [verification/CLOUDFLARE_BASELINE.md](verification/CLOUDFLARE_BASELINE.md). No production database writes or provider configuration were performed.

Authenticated local Admin/Super Admin frontend verification completed **2026-10-03: PASS**. Real Better Auth sessions, role recognition, API-to-UI metric/record matching, refresh/logout, and Admin denial of Super Admin data passed on `ownline_checkout_test`. Customer Tees regression and final frontend build passed. Temporary Super Admin removed; no production access or deployment. See [verification/AUTHENTICATED_DASHBOARDS_LOCAL.md](verification/AUTHENTICATED_DASHBOARDS_LOCAL.md) for evidence and limits.

| Item | Status |
|---|---|
| Backend structure refactor | **REFACTORED, VERIFIED** |
| Frontend API refactor (`lib/api/`) | **REFACTORED, VERIFIED** |
| Documentation restructuring + reconciliation | **COMPLETE** |
| Production infrastructure deployment | **DEPLOYED** (2026-10-03); production R2 custom domain unresolved; commerce launch gates remain separate |
| Real-catalog static export | **VERIFIED** (2026-10-01, synthetic realistic fixture in the isolated test DB; not production data) |
| Tees demo catalog seed + image upload | **VERIFIED** (2026-10-02, local `ownline_checkout_test` only, local R2 mock; not production data) |
| Tees demo frontend rendering | **VERIFIED** (2026-10-02, product page + image + variants + homepage featured; see below) |

## Verification results (2026-10-01, current code)

| Check | Result | Notes |
|---|---|---|
| Backend unit suite (`npm test`) | **84/84 PASS** | Re-run after the last backend change |
| Isolated PostgreSQL suite (`npm run test:checkout:pg`) | **349/349 PASS** | Local `ownline_checkout_test` only (guarded; never Aiven). Includes 23 new password-reset integration tests. |
| Password-reset focused suite (`npm run test:password-reset:pg`) | **23/23 PASS** | |
| Scheduler tests, repeated | **10/10 runs PASS** | 19 scheduler-named tests per run (190 passes, 0 failures) |
| Backend TypeScript (`npm run typecheck`) | **PASS** | |
| Frontend TypeScript (`npm run typecheck`) | **PASS** | |
| Frontend lint (`npm run lint`) | **PASS** | |
| Frontend production build, controlled stub catalog | **PASS** | Stub API serving 1 category + 1 product; 15 static pages generated |
| Frontend production build, real catalog | **VERIFIED** | See "Real-catalog static export" below |
| Route table (`app.routes`) before/after refactor | **IDENTICAL** | 139 entries, method + path + order; also identical after removing the empty invitations router |
| Drizzle (`drizzle-kit check`) | **PASS (limited)** | Offline; validates migration snapshot consistency, not drift against `src/db/schema`. The refactor edited no schema or migration file |
| `git diff --check` | **PASS** | |

Isolated test database: 17 migrations (`0000`–`0016`) applied. Aiven migration state is not covered by local verification.

## Scheduler / customer-cancellation race — RESOLVED, VERIFIED

- **History:** one earlier full run (277/278) failed a scheduler/cancellation test (an earlier report, `verification/ADMIN_CONCURRENCY_VERIFICATION.md`, also records an intermittent scheduler-batch failure whose cause was not established then).
- **Fix now in the code (commit 94d1d37):** `unpaid-expiry.service.ts` first selects the due order with `FOR UPDATE SKIP LOCKED`; if that finds nothing it takes a bounded wait (`lock_timeout` 2s, `CONTENDED_LOCK_WAIT`) on the contended row so an order held by a transaction that later rolls back is not skipped and left `CREATED` with its reservation held. Lock order (orders -> payments -> inventories) is unchanged. `checkout.pg.test.ts` gained tests for this (scheduler 1–9 including races with verified payment, customer cancellation and request recovery).
- **Evidence:** full PG suite 281/281 (run twice on 2026-10-01) and 10 consecutive repeats of the 19 scheduler tests with no failure.
- **Limits:** repetition shows current stability, not a proof against arbitrary database contents. Reopen if the failure recurs. Historical failure evidence stays in `verification/`.

## Real-catalog static export — VERIFIED (2026-10-01)

- **Environment:** isolated local test database `ownline_checkout_test` (127.0.0.1, guarded; never Aiven/production), reached through the real Worker route code (`app` from `backend/src/index`) served in-process on a local port. No Cloudflare, Aiven or provider traffic. Frontend built from a cleaned `.next`/`out` (so no stale fetch cache) with `CATALOG_BUILD_API_URL`/`NEXT_PUBLIC_API_URL` pointing at that local server and a placeholder HTTPS media base for `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`.
- **Dataset:** temporary synthetic fixture created with Drizzle inserts mirroring the existing PG-test fixture pattern (no schema/business-rule change, no permanent seed code): 1 ACTIVE seller admin with ACTIVE category assignments, 2 PUBLISHED categories + 3 PUBLISHED subcategories, 6 PUBLISHED products (one featured, one with 2 variants, one with 2 images, one with no image, one out of stock, one with returns disabled, one long hyphenated slug), 5 image rows with `products/<uuid>/<uuid>.png` object keys, plus 1 DRAFT category and 1 DRAFT product. The DB also held 1 pre-existing published test category set (3 `admin-race-*` and 1 `checkout-*` categories, 1 product) that was included in the export as additional realistic data.
- **API check before building:** `/api/categories` returned 6 categories, `/api/products` (50-per-page loop used by `getPublishedProductSlugs`) returned 7 products; every product detail and review request succeeded; DRAFT items were absent; pagination (`limit=2&offset=2`) worked.
- **Build:** `next build` exit 0; Turbopack compile, TypeScript, and static generation 26/26 pages. `generateStaticParams` returned 6 category and 7 product params; no empty-catalog or relationship error.
- **Generated output inspected:** `out/categories/` has 6 pages and `out/products/` has 7 pages (all PUBLISHED fixture slugs present; DRAFT category/product pages and names absent from the whole export). Product pages contain name, price, variant titles, attributes and "No published reviews yet"; the out-of-stock product page shows "Currently out of stock"; home page lists fixture products including the out-of-stock badge; image URLs built from `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` + object key appear in the HTML for all 5 fixture images; the no-image product renders.
- **Behavior note (existing design, not a defect):** category-page product grids are client-rendered by `CatalogBrowser`; the static HTML holds a loading fallback and the seeded products are in the page payload.
- **Not exercised:** published product reviews with data (reviews need order/order-item rows; the fixture had none, so only the empty-reviews state was rendered); retrieval of real R2 objects (the media base URL was a placeholder, only URL construction was verified); browser/hydrated behavior; real production catalog data.
- **Cleanup:** fixture rows deleted by id; test-DB counts after cleanup (categories 4, subcategories 4, products 4, admins 5, users 12, product images 0, variants 0, inventories 4) equal the pre-test baseline; temporary scripts and local server removed. `frontend/out` and `.next` (gitignored) now contain this fixture build.
- **Source changes for this verification:** none.
- This verifies the frontend static export against a realistic catalog; it is **not** production frontend verification (no production data, deployment, OAuth or provider flows).

## Tees demo frontend verification — LOCAL DEV ONLY (2026-10-02)

**FRONTEND DEMO STATUS: PASS**

| Check | Result |
|---|---|
| Frontend URL | `http://127.0.0.1:3000` |
| Worker URL | `http://127.0.0.1:8787` (wrangler dev, `ownline_checkout_test`) |
| API URL used | `http://127.0.0.1:8787` (via `NEXT_PUBLIC_API_URL`) |
| Product page `/products/tees` | HTTP 200 |
| Product name | `Tees` ✓ |
| Price | `₹249` ✓ |
| Real image renders | `<img src="http://127.0.0.1:8787/api/images/products/cc2c96f0.../a58fca9f....jpg">` ✓ |
| Image bytes served | 776005 bytes, `image/jpeg` from local R2 mock ✓ |
| Variant M displayed | `aria-pressed="true"` (initially selected) ✓ |
| Variant L displayed | `aria-pressed="false"` ✓ |
| Variant selection maps to ID | ProductActions uses `variantId` (UUID) → `setCartItem(productId, qty, variantId)` ✓ |
| Available state | `"Available"` text shown ✓ |
| Return policy | `"Returns are not enabled for this product."` ✓ |
| Homepage featured product | Tees card with ₹249 and image URL present ✓ |
| Category page `/categories/mens-clothing` | HTTP 200, shows `t-shirts` subcategory ✓ |
| Frontend TypeScript | PASS ✓ |
| Frontend lint | 0 errors (4 warnings in auto-generated wrangler tmp files) ✓ |
| Production build | PASS — `/products/tees` in static output ✓ |
| Production safety | Local Worker + local R2 mock + `ownline_checkout_test`; Aiven/production NOT accessed ✓ |

**Changes made for this verification:**
1. `backend/src/lib/auth/auth.ts`: added `get` method to `PRODUCT_IMAGES_BUCKET` type (was missing; `put`/`head`/`delete` already existed)
2. `backend/src/routes/customer/customer.ts`: added `GET /api/images/*` to `publicCatalogRoutes` — reads from `PRODUCT_IMAGES_BUCKET` and serves bytes; local dev only (production uses R2 public domain directly). Security hardened post-verification: Content-Type pinned to allowlist (jpeg/png/webp/avif/gif → else `application/octet-stream`), `X-Content-Type-Options: nosniff`, `Content-Disposition` header, and object key validated against `products/{uuid}/{filename}` pattern before any R2 lookup.
3. `frontend/src/lib/images.ts`: `publicImageUrl` now allows `http://127.0.0.1` hostname in addition to `http://localhost`
4. `frontend/.env.local`: `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` changed from real r2.dev URL to `http://127.0.0.1:8787/api/images` for local dev
5. Script TypeScript fixes (`upload-tees-demo-image.ts` Buffer cast, `verify-tees-demo-api.ts` ExecutionContext cast) — pre-existing errors from last session

**Note on image serving:** In production, images are served directly from the R2 public domain (configured via `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` in the real deployment env). The Worker `/api/images/*` route is a local dev convenience only. Before deploying, restore `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` to the real production R2 URL.

**Note on search page:** `/search` renders `CatalogBrowser` which fetches products client-side. Server-rendered HTML shows a loading state; product cards appear only after hydration/fetch. Not a bug.

## Tees demo catalog — LOCAL DEV ONLY (2026-10-02)

**Purpose:** Minimal PUBLISHED product with 2 size variants (M/L) and a real JPEG image, for exercising the full admin image-upload flow locally.

**Scripts** (run from `ecommerce/backend/`):
| Script | npm alias | Purpose |
|---|---|---|
| `tsx scripts/seed-tees-demo.ts` | `npm run seed:tees-demo` | Seed user/admin/category/product/variants into `ownline_checkout_test` |
| `tsx scripts/seed-tees-demo.ts --cleanup` | `npm run seed:tees-demo:cleanup` | Remove all seeded rows by stable IDs |
| `tsx scripts/setup-tees-demo-auth.ts` | — | Add email+password credentials + ADMIN role to demo user |
| `tsx scripts/verify-tees-demo-api.ts` | `npm run verify:tees-demo` | In-process catalog API verification (no wrangler needed) |
| `tsx scripts/upload-tees-demo-image.ts <path>` | — | Upload JPEG via authenticated admin API (Worker must be running) |

**To re-run upload from scratch:**
1. Restore `.env.dev.local` `DATABASE_URL` to `ownline_checkout_test`
2. Start: `node scripts/dev.mjs` (uses `.env.dev.local`, sets correct Hyperdrive override)
3. Run: `tsx scripts/upload-tees-demo-image.ts <path/to/image.jpg>`
4. Restore `.env.dev.local` `DATABASE_URL` to `ownline_dev`

**Known gotchas:**
- `.env.dev.local` must point to `ownline_checkout_test` when running the Worker for this demo (dev.mjs reads it and passes it as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`).
- Multiple previous wrangler dev instances (from prior sessions) can compete on port 8787 — kill all `workerd` processes and their parent node wrangler processes before starting a clean one.
- `emailVerified: true` is required for Better Auth credential sign-in. The seed scripts now set this automatically.
- `PRODUCT_IMAGES_BUCKET` in `wrangler.jsonc` has `"remote": true` commented out for local dev. Re-enable before deploying.

**Verification outcome (2026-10-02):**
- DB: `ownline_checkout_test` (local, 127.0.0.1:5432)
- Worker: `http://127.0.0.1:8787` (wrangler dev, local R2 mock)
- Uploaded key: `products/cc2c96f0-e1f0-4a53-8bf7-9e836a2e9c7a/a58fca9f-e130-4d3e-a521-28d5e8c9d3c0.jpg`
- All 9 checks PASS: health, image load, sign-in, actor, category scope, placeholder cleanup, upload HTTP 201, product detail (1 image, correct objectKey), variant regression (M+L, available=true).

## Error handling audit

Audit completed 2026-10-01: [development/ERROR_HANDLING.md](development/ERROR_HANDLING.md) (line references there predate the refactor). Zero critical findings; 5 informational observations (intentional design choices).

## Current architecture (actual source tree)

- Backend: `src/index.ts` (Worker export) -> `app.ts` (global middleware + `registerRoutes`) -> `routes/index.ts` (ordered mounts) -> `routes/{auth,customer,admin,super-admin,webhooks}/` + `routes/health.ts`; `scheduler.ts` (cron batches); business logic in `services/`. Details: [architecture/BACKEND_STRUCTURE.md](architecture/BACKEND_STRUCTURE.md). Mount order is behavior ([development/REFACTORING_GUIDE.md](development/REFACTORING_GUIDE.md)).
- Frontend: Next.js 16.3.6 / React 19 / TypeScript / Tailwind 4 / shadcn/ui, `output: "export"`; browser API boundary `src/lib/api/`; build-time public reads in `src/lib/public-catalog.ts`. Details: [architecture/FRONTEND_STRUCTURE.md](architecture/FRONTEND_STRUCTURE.md).
- API surface: [api/API_ROUTE_MAP.md](api/API_ROUTE_MAP.md) (103 handlers + auth/health/me, matches the route table) and [api/FRONTEND_API_MAP.md](api/FRONTEND_API_MAP.md) (all 44 `lib/api` functions matched to Worker routes).
- Database: Aiven PostgreSQL via Hyperdrive (production target); migrations `0000`–`0016` in `backend/drizzle/`.
- Development origins: frontend `http://127.0.0.1:3000`, API `http://127.0.0.1:8787`.

## Structure changes made (2026-10-01)

| Change | Status |
|---|---|
| `index.ts` split into `index.ts`, `app.ts`, `scheduler.ts`, `routes/index.ts`, `routes/health.ts`, `routes/auth/` | REFACTORED, VERIFIED |
| Routes grouped under `routes/{customer,admin,super-admin,webhooks}/`; `admin.ts` split into register-functions on one router; shipping/payment webhook routers extracted | REFACTORED, VERIFIED |
| `lib/api.ts` split into `lib/api/{client,types,auth,customer,admin,super-admin,index}.ts` | REFACTORED, VERIFIED |
| Deprecated empty `routes/admin/invitations.ts` removed | **REFACTORED, VERIFIED.** It registered no routes, was imported only by `routes/index.ts`, was not referenced by tests, frontend, scripts or docs, and the route table is identical without it |
| Docs reorganized into `architecture/ api/ development/ verification/`; old-plan folder marked SUPERSEDED | COMPLETE |

## Verified fixes and known open items

| Item | Status | Evidence |
|---|---|---|
| Cross-Admin product ownership leak | **E2E VERIFIED** | HTTP-level authenticated tests |
| Finance test failures (7/7) | **RESOLVED** | Stale test expectations updated; not production defects |
| Scheduler vs. customer-cancellation race | **RESOLVED, VERIFIED** | See above |
| Business logic inside some route handlers (Drizzle queries/audit writes in e.g. `routes/admin/onboarding.ts`, `review.ts`, `products.ts`) | **OPEN (design debt)** | Moved verbatim; moving to services deferred to avoid behavior change |
| `frontend/src` empty folders (`constants`, `features`, `hooks`, `types`, `validators`, `components/{admin,customer,shared,super-admin}`) | Observation | Exist locally, contain no files |
| `PROJECT_CONTEXT.md` §4/§26/§27/§31 describe planned layouts | Documented | Each carries a structure note pointing to `architecture/` |

## Production blockers

Production infrastructure has been deployed; **commerce launch remains blocked**:
- Existing Worker secret bindings were preserved. Presence does not verify provider credentials; missing provider setup stays outside this task.
- Hyperdrive-to-Aiven reach verified through deployed `GET /health/db` (`SELECT 1` only) and read-only public catalog APIs. No Aiven configuration, schema or data changes.
- Provider dashboard steps (Cashfree, Shiprocket, Resend, webhooks) are pending.
- Google OAuth browser verification is incomplete (authenticated consent/callback not verified; production HTTPS OAuth unverified).
- Authenticated customer browser flows (wishlist, cart, address, checkout quote) are NOT VERIFIED.
- R2: existing `shop-product-images` bucket is bound to the deployed Worker. Production custom domain is missing and no account DNS zones were returned. The enabled `r2.dev` URL remains development only. Production build media base stays blank (honest missing-image state). `remote: true` controls remote access during local development; it is not required for deployment. Tees image remains local only.
- Production cron remains disabled intentionally; enable it only in a separately authorized operational readiness task.
- ~~Cashfree payment return URL pointed to non-existent `/orders/<id>` route~~ — **RESOLVED 2026-10-01**: return URL changed to `/orders` (the existing valid route; static export cannot serve dynamic authenticated routes). See Cashfree payment return below.
- ~~Cross-site session cookies broken between `*.pages.dev` frontend and `*.workers.dev` Worker (Better Auth default `SameSite=Lax` not sent on cross-site `fetch`)~~ — **RESOLVED 2026-10-01**: same-origin Pages Function proxy added at `frontend/functions/api/[[path]].ts` so the browser only ever talks to the Pages origin; Better Auth cookies remain first-party `SameSite=Lax`. See Same-origin API proxy below.

## External services

| Service | Status |
|---|---|
| Aiven PostgreSQL | Read-only production catalog/health verification; no data, schema or configuration changes |
| Cashfree (payment/refund) | **PARKED** — no live calls made |
| Shiprocket (shipping) | **PARKED** — no live calls made |
| Resend (email) | **PARKED** — no live calls made |
| Google OAuth | **BLOCKED** |
| R2 | Production Worker binding and existing object read verified; production custom domain unresolved; private KYC public access disabled |

## Same-origin API proxy — IMPLEMENTED (2026-10-01)

- **Why:** The chosen production domains are `https://ownline-ecommerce.pages.dev` (frontend) and `https://ecommerce-api.ownlinedropshipping.workers.dev` (Worker). These sit on different registrable domains (both on the Public Suffix List), so every browser `fetch(..., {credentials: "include"})` from Pages to Worker is a cross-site subresource request. Better Auth v1.7.5 defaults the session cookie to `SameSite=Lax`, which browsers refuse to attach to cross-site subresource requests, so authenticated API calls would 401 even though CORS passes. A code audit of the installed Better Auth source confirmed the defaults: `sameSite: "lax"`, `httpOnly: true`, `secure` auto-enabled when `baseURL` is HTTPS, and no `Domain` attribute. Switching to `SameSite=None` is functionally broken on Safari (ITP) and Firefox (Total Cookie Protection), so same-origin is the only architecture that works across mainstream browsers.
- **Architecture:** The browser only ever talks to `https://ownline-ecommerce.pages.dev`. A Cloudflare Pages Function at `frontend/functions/api/[[path]].ts` proxies every `/api/*` request to the Worker's `PUBLIC_WORKER_URL`, forwarding method, path, query, body, cookies, and the `Origin` header verbatim, with `redirect: "manual"` so OAuth 302s reach the browser instead of being followed inside the Function. `Set-Cookie`, `Content-Type`, status and `Cache-Control` are relayed through. `frontend/public/_routes.json` pins `/api/*` to Functions; all other paths resolve to the Next.js static export. Webhooks (Cashfree, Shiprocket) are **not** proxied — they remain direct provider-to-Worker calls.
- **Overload split for `BETTER_AUTH_URL`:** `BETTER_AUTH_URL` previously drove three things — Better Auth's `baseURL` (cookie prefix + OAuth callback), the Cashfree `notify_url` base, and a trusted mutation origin. Under this architecture `BETTER_AUTH_URL` becomes the Pages origin, which is correct for Better Auth and `mutationOrigin`, but a Cashfree webhook POST to the Pages origin would 404 because `_routes.json` only sends `/api/*` to Functions. A new optional binding `PUBLIC_WORKER_URL` was added to `AuthBindings` and consulted by `routes/customer/payments.ts` for `notify_url` construction; it falls back to `BETTER_AUTH_URL` when unset, which keeps every unit test and dev loopback working unchanged.
- **Expected production environment variables:**
  - Worker: `BETTER_AUTH_URL=https://ownline-ecommerce.pages.dev`, `FRONTEND_ORIGIN=https://ownline-ecommerce.pages.dev`, `PUBLIC_WORKER_URL=https://ecommerce-api.ownlinedropshipping.workers.dev`, `ADMIN_SETUP_URL=https://ownline-ecommerce.pages.dev/admin/setup`. All other Worker secrets unchanged.
  - Pages (build env + Function env): `NEXT_PUBLIC_API_URL=https://ownline-ecommerce.pages.dev`, `NEXT_PUBLIC_SITE_URL=https://ownline-ecommerce.pages.dev`, `PUBLIC_WORKER_URL=https://ecommerce-api.ownlinedropshipping.workers.dev` (Function reads this from `ctx.env`), `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` read from the R2 dashboard for bucket `shop-product-images`.
- **URLs after the change:**
  - Google OAuth callback (must be registered in Google Cloud Console before production login works): `https://ownline-ecommerce.pages.dev/api/auth/callback/google`.
  - Cashfree return URL: `https://ownline-ecommerce.pages.dev/orders` (unchanged, matches the existing `/orders` static route).
  - Cashfree notify URL: `https://ecommerce-api.ownlinedropshipping.workers.dev/webhooks/payments/cashfree` (direct Worker — webhooks must not traverse the proxy).
  - Shiprocket webhook: `https://ecommerce-api.ownlinedropshipping.workers.dev/webhooks/shipping/events` (unchanged, provider-dashboard-registered).
- **Local verification (2026-10-01):** `wrangler pages dev out --port 8880` served the built `out/` plus the Function, pointed at an echo backend on `127.0.0.1:8898` via `PUBLIC_WORKER_URL`. Seven integration probes passed: GET `/api/me` forwards `Origin: https://ownline-ecommerce.pages.dev` verbatim; POST with JSON body preserves method, Content-Type and body length (30 bytes); `/api/auth/sign-in/social` 302 to `accounts.google.com` is relayed to the client without being followed; `/api/auth/callback/google` relays both `Location` and `Set-Cookie: __Secure-better-auth.session_token=...; Secure; HttpOnly; SameSite=Lax`; `/orders` resolves to the static export (not the Function); `?limit=50` query is forwarded intact; inbound `Cookie: __Secure-better-auth.session_token=...` reaches the upstream request. Full Better Auth login + Google OAuth was NOT exercised locally — that requires real OAuth credentials and a deployed Worker.
- **Regression gates (2026-10-01):** backend `npm run typecheck` PASS; backend `npm test` 82/82 PASS; frontend `npm run typecheck` PASS; frontend `npm run lint` PASS; frontend `npm run build` PASS (15 static pages generated with `NEXT_PUBLIC_API_URL=https://ownline-ecommerce.pages.dev`; `out/api/` not emitted; `out/_routes.json`, `out/orders.html`, `out/admin/setup.html` all present); `drizzle-kit check` PASS; `git diff --check` clean. Isolated PG suite was not re-run (no schema or query behavior changed).
- **What is NOT verified:** real deployed browser authentication; full Google OAuth round-trip; Cashfree sandbox POST to the webhook from the production domain; Hyperdrive-to-Aiven reach from a deployed Worker; the R2 public URL for the production bucket.

## Cashfree payment return URL — RESOLVED (2026-10-01)

- **Root cause:** `routes/customer/payments.ts` constructed the Cashfree `return_url` as `{FRONTEND_ORIGIN}/orders/{orderId}`. No `/orders/[orderId]` route exists in the frontend and none can be served from a `output: "export"` static build (per-user order IDs cannot be pre-generated via `generateStaticParams`; `dynamicParams = true` is incompatible with static export; CDN rewrites are a separate infrastructure concern not in scope here).
- **Fix:** changed `return_url` to `{FRONTEND_ORIGIN}/orders` — the existing authenticated order list page. After payment, Cashfree redirects the customer to their full order list, where the just-completed order appears.
- **Note on `customerApi.order(orderId)`:** this function is defined in `lib/api/customer.ts` but is not called anywhere in the UI. It exists for future use if a per-order detail page is added. No per-order detail page is currently implemented or blocked by this fix.
- **Cashfree `notify_url`:** `{BETTER_AUTH_URL}/webhooks/payments/cashfree` — present, correct, and passed per-order in `order_meta.notify_url`. No code change required for the webhook URL.

## Documentation map

| Document | Status |
|---|---|
| `PROJECT_CONTEXT.md` | Permanent rules; old "CURRENT CHECKPOINT" blocks relabelled HISTORICAL; structure sections annotated |
| `CURRENT_STATUS.md` | This file; the only current-status authority |
| `README.md` | Docs index and old-path -> new-path mapping |
| `architecture/*` | Written from the current code |
| `api/API_ROUTE_MAP.md` | Verified against the route table |
| `api/FRONTEND_API_MAP.md` | Current contract table verified against `lib/api`; Phase 11b checkpoints below it are historical |
| `development/*` | REFACTORING_GUIDE, ERROR_HANDLING (path note added), FRONTEND_DESIGN_SYSTEM |
| `verification/*` | Historical evidence; not rewritten |
| `docs_this_old_ecommerce_plan/` | SUPERSEDED; its `PROJECT_CONTEXT.md` (646 lines) conflicts with the canonical one (4739+ lines) and was not merged |


## Important: don't run the old task

Your previous task was essentially:

> **Connect Super Admin UI to the existing APIs.**

**Stop that task for now.**

The new task supersedes it because the Admin lifecycle has now been clarified.

The correct chain is:

```text
                    CURRENT
                       │
                       ▼
             Super Admin account
                  ✅ established
                       │
                       ▼
        Backend contract reconciliation
                  ✅ mostly done
                       │
                       ▼
        ADMIN LIFECYCLE RECONCILIATION
              ← NEW TASK NOW
                       │
                       ▼
        Password + onboarding + approval
                       │
                       ▼
          Backend tests / verification
                       │
                       ▼
             Super Admin UI
                       │
                       ▼
          Super Admin browser E2E
                       │
                       ▼
                Admin UI
                       │
                       ▼
             Admin browser E2E
                       │
                       ▼
             Customer regression