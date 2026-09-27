# Implementation Plan — Current Architecture — 2026-09-24

## Phase 0 — Infrastructure and local setup

1. Aiven PostgreSQL available.
2. Aiven `DATABASE_URL` available for local tooling/migrations.
3. Cloudflare account and Wrangler access.
4. Cloudflare Worker project.
5. Hyperdrive configuration for Aiven.
6. Cloudflare R2 bucket.
7. Upstash Redis account/database for controlled cache use.
8. Google OAuth credentials already created for Customer auth.
9. Resend and Cashfree can remain deferred until their feature modules are ready.

## Phase 1 — Repository structure and frontend design system

1. Separate `frontend/` and `backend/` applications.
2. Frontend Next.js App Router foundation.
3. Backend Worker + Hono foundation.
4. Tailwind CSS.
5. Initialize shadcn/ui in the frontend.
6. Establish project theme/tokens.
7. Add only the first required shadcn components/blocks.
8. No custom UI primitives where shadcn already provides a suitable component.

## Phase 2 — Database + Auth foundation

1. Drizzle schema foundation.
2. Better Auth.
3. Google customer OAuth.
4. Admin email/password.
5. Super Admin email/password.
6. User/session/account verification flows.
7. RBAC.
8. Audit foundation.

## Phase 3 — Catalog structure

1. Main categories.
2. One-level subcategories.
3. Admin-permitted custom subcategories.
4. Product CRUD.
5. Product assignment to Admin.
6. Variants.
7. Product images through R2.
8. Current price/availability.
9. Search/filter indexes.
10. No Collections.

## Phase 4 — Customer discovery and inventory

1. Inventory.
2. Stock movements.
3. Safe stock reservation strategy.
4. Product browse/search.
5. Category/subcategory pages.
6. Product detail pages.
7. SEO metadata requirements.

## Phase 5 — Cart + safe checkout

1. Guest cart in localStorage only for non-sensitive convenience state.
2. Authenticated cart in backend/database.
3. Guest-cart merge on login.
4. Address.
5. Shipping calculation.
6. Coupon validation.
7. Server-side price revalidation.
8. Stock validation.
9. Pending order creation.
10. Immutable order-item snapshots.

## Phase 6 — Payments + orders

1. Configure Cashfree Sandbox when checkout foundation is ready.
2. Cashfree payment creation.
3. Payment success/failure handling.
4. Webhook verification.
5. Idempotency.
6. Order state machine.
7. Inventory reservation release on failed/expired payment.
8. Invoice data.

## Phase 7 — Admin operations

1. Products.
2. Inventory.
3. Assigned online orders.
4. Customer management with permissions.
5. Reviews.
6. Analytics.
7. Earnings.
8. Payout requests.

## Phase 8 — Super Admin

1. Admin management.
2. Roles/permissions management.
3. Customer management.
4. Admin access/impersonation sessions.
5. Commission rules.
6. Payment Gateway Fee configuration.
7. Payout processing.
8. Platform finance.
9. Refund oversight.
10. Audit.

## Phase 9 — Communication/media

1. Configure Resend when email feature implementation begins.
2. Transactional emails.
3. Customer messaging.
4. Communication preferences.
5. R2 media lifecycle.
6. Notifications.

## Phase 10 — Cache and performance

1. Establish database query/index correctness first.
2. Add Cloudflare public cache where safe.
3. Add Upstash Redis only for documented hot/derived/rate-limit use cases.
4. Define TTL and invalidation per cache key.
5. Test database fallback when cache is unavailable.
6. Never use cache as payment, order, permission or inventory authority.

## Phase 11 — SEO + static deployment

1. Public metadata.
2. Structured data.
3. Sitemaps.
4. Robots rules.
5. Category/subcategory/product static pages.
6. Next.js static export.
7. Cloudflare Pages deployment.
8. Controlled rebuild/deploy-hook workflow for public content changes.
9. Search engine validation.

## Phase 12 — Commerce policy and trust controls

1. Terms of Service page structure.
2. Privacy Policy structure.
3. Shipping Policy.
4. Return Policy.
5. Refund Policy.
6. Review Policy.
7. Customer communication preferences.
8. Support/dispute workflows.
9. Review moderation/reporting.
10. Admin/Super Admin audit coverage.

Policy requirements should be based on this project's actual behavior. See `PLATFORM_INSPIRED_COMMERCE_GUIDELINES.md` and `LEGAL_POLICY_BLUEPRINT.md`.

## Phase 13 — Security/performance/release

1. API authorization tests.
2. Payment webhook idempotency tests.
3. Price-change tests.
4. Inventory concurrency tests.
5. Pagination/performance tests.
6. Rate limits.
7. Secret scanning.
8. SEO output tests.
9. Production deployment checks.

## Explicitly defer

Do not build until a real requirement exists:

- recommendation ML
- advanced search engine
- queues/event bus
- microservices
- deep taxonomy
- Collections
- complex shipping integrations
- complex tax engines
- multi-tenant marketplace architecture
- second UI library

# Latest Product Build Sequence — 2026-09-25

When the catalog phase begins, build it in this order:

```text
1. Main Categories
        ↓
2. Subcategories
        ↓
3. Product core data
        ↓
4. Product images / R2
        ↓
5. Product variants
        ↓
6. Variant inventory
        ↓
7. Admin product form
        ↓
8. Customer category/subcategory pages
        ↓
9. Customer product details page
        ↓
10. Product search/filter
```

Do not start by building a fully generic variant/attribute engine.

Start with the business cases actually required by the store, then extend the model only when a real product category requires it.
