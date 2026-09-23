# Implementation Plan — Current Architecture

## Phase 0 — Infrastructure

1. Aiven PostgreSQL created.
2. Aiven connection string added to local `.env.local`.
3. Cloudflare account created.
4. Worker project created.
5. Hyperdrive created for Aiven PostgreSQL.
6. R2 bucket created.
7. Resend account/sender configured.
8. Cashfree sandbox account/credentials configured.
9. Google OAuth already configured for Customer.

## Phase 1 — Database + Auth

1. Drizzle schema foundation.
2. Better Auth.
3. Google customer OAuth.
4. Admin email/password.
5. Super Admin email/password.
6. User/session/account verification flows.
7. RBAC.
8. Audit foundation.

## Phase 2 — Catalog structure

1. Main categories.
2. Admin-owned subcategories.
3. Product CRUD.
4. Product assignment to Admin.
5. Variants.
6. Product images through R2.
7. Current price/availability.
8. Search/filter indexes.

## Phase 3 — Inventory + customer discovery

1. Inventory.
2. Stock movements.
3. Stock reservations.
4. Product browse/search.
5. Category/subcategory pages.
6. No collections.

## Phase 4 — Cart + safe checkout

1. Cart.
2. Address.
3. Shipping calculation.
4. Coupon validation.
5. Server-side price revalidation.
6. Stock validation.
7. Pending order creation.
8. Immutable order-item snapshots.

## Phase 5 — Payments + orders

1. Cashfree order/payment creation.
2. Payment success/failure handling.
3. Webhook verification.
4. Idempotency.
5. Order state machine.
6. Inventory reservation release on failed/expired payment.
7. Invoice data.

## Phase 6 — Admin operations

1. Products.
2. Inventory.
3. Assigned orders.
4. Reviews.
5. Customer management (permission-controlled).
6. Analytics.
7. Earnings.
8. Payout requests.

## Phase 7 — Super Admin

1. Admin management.
2. Roles/permissions management.
3. Customer management.
4. Admin impersonation/access sessions.
5. Commission rules.
6. Payment Gateway Fee.
7. Payout processing.
8. Platform finance.
9. Refund oversight.
10. Audit.

## Phase 8 — Communication/media/cache

1. Resend transactional emails.
2. Customer messaging.
3. Communication preferences.
4. R2 image lifecycle.
5. Notifications.
6. Cloudflare public-cache policy.
7. Upstash Redis connection for documented hot/derived cache or rate limiting use cases.
8. Cache TTL + invalidation rules.
9. Cache fallback tests.

## Phase 9 — SEO/static deployment

1. Metadata.
2. Structured data.
3. Sitemaps.
4. Category/subcategory/product static pages.
5. Pages static export.
6. Deploy hook/rebuild workflow.
7. Search engine validation.

## Phase 10 — Security/performance

1. API authorization tests.
2. Payment webhook idempotency tests.
3. Price-change tests.
4. Inventory concurrency tests.
5. Pagination/performance.
6. Rate limits.
7. Secret scanning.
8. Production deployment.

## Explicitly defer

Do not build yet:

- recommendation ML
- advanced search engine
- queues/event bus
- microservices
- complex shipping integrations
- complex tax engines unless required
- multi-tenant marketplace features
- collections
