# Latest Decisions — Current Source of Truth

> Updated 2026-09-24.

## 1. Final stack

```text
Frontend:
Next.js App Router + TypeScript
Tailwind CSS
shadcn/ui

Public hosting / SEO:
Cloudflare Pages
Next.js Static Export / SSG

Backend:
Cloudflare Workers
Hono

Database:
Aiven PostgreSQL
Drizzle ORM
Cloudflare Hyperdrive

Auth:
Better Auth
Customer → Google OAuth
Admin → Email + Password
Super Admin → Email + Password

Media:
Cloudflare R2

Cache:
Cloudflare Cache + Upstash Redis (controlled use)

Email:
Resend (deferred until email module)

Payments:
Cashfree Payment Gateway / Payouts (deferred until payment module)
```

## 2. Frontend/backend split

```text
frontend/
→ Next.js UI + SSG + SEO
→ Cloudflare Pages

backend/
→ Hono API + business logic
→ Cloudflare Worker
→ Hyperdrive → Aiven PostgreSQL
```

Do not put the main runtime backend API inside the static Next.js frontend.

## 3. shadcn-first UI

When building frontend UI:

```text
official shadcn component/block exists
        ↓
use/add shadcn source
        ↓
customize project-owned code
```

Do not rebuild common primitives from scratch when shadcn already provides them.

shadcn provides UI/component source and patterns; it does **not** provide the project's ecommerce business data. Product/customer/order data still comes from the backend API/database.

## 4. Categories — no Collections

```text
Main Category
    ↓
Subcategory
    ↓
Product
```

No Collection entity, table, module, route, or SEO page.

Admin may create/manage permitted custom subcategories under existing main categories.

## 5. Customer storefront

Customer Home may contain:

- feature cards
- main category cards
- subcategory navigation
- banners
- offers
- featured/new/trending product sections
- product suggestions

These are presentation/merchandising sections, not Collections.

## 6. Authentication

Better Auth is the single authentication framework.

```text
Customer
→ Google OAuth through Better Auth

Admin
→ Email + Password through Better Auth

Super Admin
→ Email + Password through Better Auth
```

Passwords are securely hashed, not reversibly encrypted.

## 7. Database source of truth

Aiven PostgreSQL is authoritative.

```text
Cache = optimization
PostgreSQL = truth
```

Cloudflare Hyperdrive is the Worker → PostgreSQL connection/pooling layer.

## 8. Cache

```text
Browser localStorage
→ non-sensitive guest/UI state

Cloudflare Cache
→ public cache-safe content/assets

Upstash Redis
→ selected hot/derived/rate-limit/temporary data

Aiven PostgreSQL
→ authoritative state
```

Do not attempt to synchronize these as independent databases.

## 9. Price and order history

```text
products.base_price
→ current price

order_items.unit_price
→ immutable historical purchase price
```

Changing a product price must never rewrite past orders.

Checkout always revalidates the current price and stock on the server before payment.

## 10. Payment

```text
Customer
→ backend checkout validation
→ Cashfree
→ verified webhook
→ PAID order
```

No COD.
No Cashfree Easy Split.
Admin does not own Cashfree merchant credentials.
Admin cannot directly withdraw.

## 11. Admin earnings

```text
Gross Product Sales
- Commission
- Payment Gateway Fee
- Refund Adjustment
= Net Payable
```

Admin can request payout.
Super Admin reviews and pays.

## 12. Trust/policy rules

The project uses operational principles inspired by public Shopify, Amazon, and Airbnb documentation:

- accurate product information
- visible and current policies
- transparent pricing/promotion behavior
- authentic reviews
- support/dispute paths
- auditable privileged changes
- privacy-aware customer communication

Do not copy their legal text or branding.

## 13. Free-first approach

Use free/low-cost infrastructure where practical, but do not assume any provider's free plan is permanent.

Do not sacrifice correctness/security simply to avoid a small infrastructure component when that component is genuinely required.

## 14. Current implementation priority

```text
Infrastructure
→ project structure
→ shadcn/UI foundation
→ database
→ backend Worker/Hono
→ Better Auth
→ RBAC
→ catalog
→ customer
→ cart/checkout
→ Cashfree
→ Admin
→ Super Admin
→ R2/Resend
→ cache
→ SEO/SSG deployment
→ security/performance tests
```

## 15. Explicitly removed

Do not reintroduce:

- marketplace tenants
- public Admin registration
- Collections
- collection_products
- COD
- offline orders
- draft orders
- Cashfree Easy Split
- Admin direct withdrawal
- Admin Cashfree merchant account
- Cloudinary
- GCS
- unnecessary microservices
- unnecessary queues
- unnecessary Elasticsearch
- second UI library

# Product Catalog Decisions — 2026-09-25

```text
NO COLLECTIONS

Main Category
    ↓
Subcategory
    ↓
Product
    ↓
Optional Variant(s)
    ↓
Inventory
```

Admin product form includes product content, media, pricing, variants, inventory, status, and limited merchandising/SEO fields.

Customer product page includes gallery, title, current effective price, availability, variants, description, highlights, specifications, reviews, policy information, and purchase controls.

Historical order prices remain snapshot values in `order_items.unit_price`.
