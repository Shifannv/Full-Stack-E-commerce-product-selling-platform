# Ownline Dropship — Current Status

**Date:** 2026-10-01
**Purpose:** Single source of truth for the real current state of the project. Supersedes all historical checkpoint status claims in other documents.

---

## Test Suite Status

| Suite | Result | Notes |
|---|---|---|
| Isolated PostgreSQL (full, `test:checkout:pg`) | **281/281** (2026-10-01, after structure refactor) | Earlier run reported 277/278 with a scheduler/customer-cancellation race failure; that failure did not reproduce in this run. Not independently root-caused here; treat the race item below as still OPEN until its owner closes it |
| Backend regression | **82/82** | All pass |
| Finance tests | **7/7** | Previously reported as 7 failures — those were stale test expectations, not production defects |
| TypeScript (`npm run typecheck`) | **PASS** | |
| Drizzle validation (`drizzle-kit check`) | **PASS** | |
| `git diff --check` | **PASS** | |

## Verified Fixes

| Item | Status | Evidence |
|---|---|---|
| Cross-Admin product ownership leak | **E2E VERIFIED** | HTTP-level authenticated tests confirm no cross-admin data access |
| Finance test failures (7/7) | **RESOLVED** | Stale test expectations updated; not production defects |

## Known Open Issues

| Item | Status | Owner |
|---|---|---|
| Scheduler vs. customer-cancellation race condition | **IN PROGRESS** | Separate concurrent task; not part of this audit |

## External Services

| Service | Status |
|---|---|
| Aiven PostgreSQL | **NOT TOUCHED** by local verification |
| Cashfree (payment/refund) | **PARKED** — no live calls made |
| Shiprocket (shipping) | **PARKED** — no live calls made |
| Resend (email) | **PARKED** — no live calls made |
| Google OAuth | **BLOCKED** — authenticated consent/callback not completed |
| R2 (media storage) | Development image uploaded; production custom domain not configured |

## Error Handling Audit

**Audit completed: 2026-10-01.** See [ERROR_HANDLING.md](development/ERROR_HANDLING.md) for the full report.

Summary of findings:
- **Zero critical issues** found
- **Zero empty catch blocks** that silently swallow errors
- **Zero raw database/provider errors** exposed to clients
- **Zero inconsistent error response formats**
- **Zero `console.log` calls** in production code
- **Zero credentials/secrets** in any log statement
- **Zero unbounded request body parsing** paths
- **Zero partial-commit risk** in state-changing transactions
- **5 informational observations** (all are intentional design choices, not defects)

## Architecture Snapshot

- **Frontend:** Next.js 16.3.6 / React 19 / TypeScript / Tailwind 4 / shadcn/ui (`output: "export"`)
- **Backend:** Cloudflare Workers / Hono / Better Auth / Drizzle ORM
- **Database:** Aiven PostgreSQL via Hyperdrive
- **Migrations applied:** Through `0014` (on `CHECKOUT_TEST_DATABASE_URL` only)
- **Development origins:** Frontend `http://127.0.0.1:3000`, API `http://127.0.0.1:8787`

## Phase Status

- **Phase 11b:** OPEN, NOT DEPLOYED, NOT SAFE TO DEPLOY
- Google OAuth browser verification incomplete
- Authenticated customer session flows unverified
- Production HTTPS OAuth unverified
- Cashfree payment flow PARKED

## Documentation Status

| Document | Status | Notes |
|---|---|---|
| `development/ERROR_HANDLING.md` | **UPDATED 2026-10-01** | Complete audit with findings (moved from docs root) |
| `CURRENT_STATUS.md` | **CREATED 2026-10-01** | This document |
| `PROJECT_CONTEXT.md` | Needs reconciliation note | Historical checkpoints are retained but superseded by this status |
| `verification/BACKEND_VERIFICATION.md` | Historical | Contains layered checkpoint evidence; this status supersedes "current" claims |
| `verification/*` (all other reports) | Historical evidence | Moved from docs root on 2026-10-01; contents not rewritten; old paths in their text map per [README.md](README.md) |
| `api/FRONTEND_API_MAP.md` | Moved + note | Was `FRONTEND_API_MAPPING.md`; structure note added |
| `api/API_ROUTE_MAP.md` | **CREATED 2026-10-01** | Matches the Worker route table (103 handlers + auth/health/me) |
| `architecture/*`, `development/REFACTORING_GUIDE.md`, `README.md` | **CREATED 2026-10-01** | Written from the refactored code |
| `docs_this_old_ecommerce_plan/` | SUPERSEDED | README added; its `PROJECT_CONTEXT.md` (646 lines) conflicts with the canonical `PROJECT_CONTEXT.md` (4739 lines) and was not merged |

## Architecture Refactor — 2026-10-01

Behavior-preserving reorganization. No API, business-rule, schema, migration or provider change.

| Area | Status | Evidence |
|---|---|---|
| Backend `index.ts` split into `app.ts`, `scheduler.ts`, `routes/index.ts`, `routes/health.ts`, `routes/auth/` | **REFACTORED, VERIFIED** | Route table (`app.routes`, 139 entries, method+path+order) identical before/after |
| Route files grouped into `routes/{customer,admin,super-admin,webhooks}/`; `admin.ts` split into register-functions on one router; webhook routers extracted | **REFACTORED, VERIFIED** | typecheck clean; `npm test` 82/82; `test:security:pg` 28/28; `test:checkout:pg` 281/281 (isolated local DB only) |
| Frontend `lib/api.ts` split into `lib/api/{client,types,auth,customer,admin,super-admin,index}.ts` | **REFACTORED, VERIFIED** | Endpoint/method/credentials lines identical; typecheck + lint clean; production build passes |
| Drizzle | **VERIFIED (limited)** | `drizzle-kit check` passes (offline, dummy local URL). It validates migration snapshots, not drift against `src/db/schema`; no schema file was edited by the refactor (`schema/shipping.ts` carries earlier uncommitted work) |
| Production deployment | **BLOCKED (unchanged)** | Worker secrets unset; Hyperdrive-to-Aiven connection unverified; provider dashboard steps pending; Google OAuth browser verification incomplete |
| Aiven, migrations, Cashfree, Shiprocket, Resend | **NOT TOUCHED** | |

Unresolved / notes:
- Frontend build verification used a stub catalog API (1 category, 1 product) because the local dev database has no catalog data and Next's static export requires at least one generated route. A build against real catalog data is NOT VERIFIED. The build also overwrote the gitignored `frontend/out/` with that fixture output.
- Several route handlers still contain Drizzle queries/audit writes (for example `routes/admin/onboarding.ts`, `review.ts`, `products.ts`); they were moved verbatim, not pushed into services.
- `routes/admin/invitations.ts` is an intentionally empty deprecated router, kept mounted.
- `PROJECT_CONTEXT.md` still describes the pre-refactor flat layout in its historical sections; see `architecture/` for the current structure.
