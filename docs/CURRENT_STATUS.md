# Ownline Dropship — Current Status

**Last reconciled:** 2026-10-01 (after the architecture refactor and documentation reconciliation)
**Purpose:** Single source of truth for the current implementation state. Historical checkpoints in `PROJECT_CONTEXT.md`, `verification/*` and the historical part of `api/FRONTEND_API_MAP.md` are evidence only; where they disagree with this file, this file wins.

Labels: IMPLEMENTED, REFACTORED, TESTED, VERIFIED, BLOCKED, NOT VERIFIED, NOT TOUCHED, PRODUCTION VERIFIED.

---

## Headline

| Item | Status |
|---|---|
| Backend structure refactor | **REFACTORED, VERIFIED** |
| Frontend API refactor (`lib/api/`) | **REFACTORED, VERIFIED** |
| Documentation restructuring + reconciliation | **COMPLETE** |
| Production deployment | **BLOCKED** (see Production blockers) |
| Real-catalog static export | **VERIFIED** (2026-10-01, synthetic realistic fixture in the isolated test DB; not production data) |

## Verification results (2026-10-01, current code)

| Check | Result | Notes |
|---|---|---|
| Backend unit suite (`npm test`) | **82/82 PASS** | Re-run after the last backend change |
| Isolated PostgreSQL suite (`npm run test:checkout:pg`) | **281/281 PASS** | Local `ownline_checkout_test` only (guarded; never Aiven). Includes 28 Worker-level security tests and the scheduler/cancellation race tests. Re-run after the last backend change |
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

Production deployment is **BLOCKED / NOT SAFE TO DEPLOY**:
- Worker secrets are not set (names only; values must never be recorded in docs).
- Hyperdrive-to-Aiven connection from the deployed Worker is NOT VERIFIED.
- Provider dashboard steps (Cashfree, Shiprocket, Resend, webhooks) are pending.
- Google OAuth browser verification is incomplete (authenticated consent/callback not verified; production HTTPS OAuth unverified).
- Authenticated customer browser flows (wishlist, cart, address, checkout quote) are NOT VERIFIED.
- R2: development image uploaded; production custom domain not configured.
- ~~Cashfree payment return URL pointed to non-existent `/orders/<id>` route~~ — **RESOLVED 2026-10-01**: return URL changed to `/orders` (the existing valid route; static export cannot serve dynamic authenticated routes). See Cashfree payment return below.

## External services

| Service | Status |
|---|---|
| Aiven PostgreSQL | **NOT TOUCHED** by this work |
| Cashfree (payment/refund) | **PARKED** — no live calls made |
| Shiprocket (shipping) | **PARKED** — no live calls made |
| Resend (email) | **PARKED** — no live calls made |
| Google OAuth | **BLOCKED** |
| R2 | Development only |

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
