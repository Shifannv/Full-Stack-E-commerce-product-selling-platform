# Ecommerce Platform — Project Context & Architecture Guide

> **Status:** Current source of truth — updated 2026-09-23.
>
> Read this file before creating, changing, refactoring, or reviewing code. If existing code conflicts with this file, do not silently invent a third architecture. Explain the conflict and implement the current decision.

## 1. Product

This is a **single-tenant ecommerce platform** with one Super Admin, multiple internal Admin sellers, and public Customers.

The application is one repository, but it has two runtime deliverables:

```text
PUBLIC WEB
Next.js App Router
→ static SEO HTML target
→ Cloudflare Pages

BACKEND API
Hono
→ Cloudflare Worker
→ Cloudflare Hyperdrive
→ Aiven PostgreSQL
```

Public routes:

```text
Customer      → /
Admin         → /admin
Super Admin   → /super-admin
```

The Customer storefront is SEO-first. The Admin and Super Admin areas are authenticated application UIs and are not treated as SEO pages.

## 2. Locked current stack

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- Zustand only where client state is actually needed

### Backend

- Cloudflare Workers
- Hono
- TypeScript
- Drizzle ORM
- Cloudflare Hyperdrive for the Worker → PostgreSQL connection/pooling layer

### Database

- Aiven for PostgreSQL
- Current development/initial deployment target: Aiven Free PostgreSQL
- `DATABASE_URL` is the Aiven PostgreSQL connection string for local tooling/migrations
- Production Worker database access should use Hyperdrive rather than opening many direct database connections

Aiven Free currently documents 1 CPU, 1 GB RAM, 1 GB disk, a 20-connection limit, no connection pooling, and possible inactivity shutdown. Treat it as a development/small-scale starting tier, not an unlimited production guarantee. See `FREE_TIER_AND_COST_PLAN.md`.

### Authentication

- **Better Auth is the authentication system for all roles.**
- Customer sign-in: Google OAuth through Better Auth.
- Admin sign-in: Better Auth email/password.
- Super Admin sign-in: Better Auth email/password.
- Do not build two separate authentication/session systems.
- Google is a login provider, not a second auth framework.

Passwords are **hashed**, not encrypted. The original password must never be recoverable from the database.

### Storage

- Cloudflare R2 for product images, variant images, review images, banners, and approved uploads.
- Do not use Cloudinary or GCS in the current architecture.

### Email

- Resend.

### Payments

- Cashfree Payment Gateway for Customer online payments.
- Cashfree Payouts may be used by Super Admin for Admin settlements.
- COD disabled.
- No Cashfree Easy Split.
- Admins do not have Cashfree merchant accounts.
- Admins cannot directly withdraw.
- Super Admin reviews and pays Admin payout requests.

## 3A. Cache and client-state architecture

The project now uses a layered cache strategy for performance while keeping Aiven PostgreSQL authoritative.

```text
Browser localStorage
    ↓
Cloudflare public cache / CDN
    ↓
Cloudflare Worker
    ↓
Upstash Redis (only selected hot/derived/rate-limit use cases)
    ↓
Cloudflare Hyperdrive
    ↓
Aiven PostgreSQL
```

### Browser localStorage

Allowed for non-sensitive client convenience state such as:

- guest cart before login
- recently viewed product IDs
- UI/filter/sort preferences

Never store passwords, Better Auth session tokens, OAuth secrets, payment secrets, payout secrets, or private account records as the authority.

When a guest logs in, merge the local cart into the server cart and then treat the server cart as authoritative.

A customer on a different device gets account/order/wishlist data from the backend, not from another device's localStorage.

### Cloudflare cache

Use Cloudflare's edge cache for public, cache-safe responses and assets. Do not make account, order, payment, payout, Admin, or Super Admin responses shared public cache entries.

### Upstash Redis

Upstash Redis is selected for the free/early stage as a **controlled application cache/utility layer**.

Use it only when there is a documented need, for example:

- expensive derived catalog query cache
- short-lived hot data
- rate limiting counters
- temporary non-authoritative state

Redis must never replace PostgreSQL as the source of truth.

### Cache invalidation

Caching is not automatic synchronization.

After a catalog write:

```text
Aiven PostgreSQL write
→ invalidate Redis key(s) if used
→ purge/revalidate public Cloudflare cache
→ rebuild/revalidate SSG HTML when public HTML must change
```

Payment/checkout/order decisions always re-read authoritative backend state.

### Current price vs historical order price

```text
products.base_price
= current public/checkout price

order_items.unit_price
= immutable price paid in that order
```

A product price change must not alter old order amounts.

## 3. Business model

- One platform owner = Super Admin.
- Admins are internal sellers/store operators.
- Products can be assigned to Admins.
- Customers buy online only.
- Customer money first reaches the Super Admin Cashfree merchant account.
- Backend calculates Admin revenue.
- Super Admin revenue is **Commission**.
- Payment Gateway Fee is a configurable deduction controlled by Super Admin.
- Refund Adjustment can reduce Admin Net Payable.

Formula:

```text
Gross Product Sales
- Commission
- Payment Gateway Fee
- Refund Adjustment
= Net Payable
```

Admin can view earnings and request payout. Super Admin processes payout and records reference/proof/date/method/status.

## 4. Product organisation — NO collections

The platform does **not** use a Collection module.

Remove from current design:

```text
/collections/[slug]
collections table
collection_products table
collections backend module
collection SEO pages
```

Customer Home uses:

```text
Feature cards / banners
Main categories
Subcategories
Featured/new/trending products
Product suggestions
Offers
```

This is merchandising through home sections/banners/flags, not through a Collection entity.

### Category rules

- Super Admin manages the main/global categories.
- Example main categories may be Clothing, Gadgets, Accessories, Electronics.
- Admin product creation shows only the current active main categories they are allowed to use.
- An Admin may create a custom **subcategory** under an existing main category for their own assigned products, when the permission `categories.subcategories.manage` is granted.
- An Admin can manage only the subcategories they own/created unless Super Admin grants broader access.
- Super Admin can manage every category and subcategory.
- Customers can browse/filter by main category and subcategory.
- Do not create a deep unlimited category tree. Keep one main category → one subcategory level.

Recommended model:

```text
categories
  id
  name
  slug
  is_active
  sort_order

subcategories
  id
  category_id
  admin_id nullable
  name
  slug
  is_active
  sort_order
```

Product should reference:

```text
category_id
subcategory_id nullable
```

Do not add category trees, nested collections, tagging systems, or arbitrary taxonomies unless the project owner explicitly changes the plan.

## 5. Critical pricing/order rule

**Product price is mutable. Order price is immutable.**

`products.price` is the current live selling price.

When an order is created, the backend copies the relevant purchase facts into `order_items`.

At minimum:

```text
product_id
variant_id nullable
product_name_snapshot
sku_snapshot
unit_price
quantity
discount_amount
tax_amount
line_total
```

These order-item values are historical snapshots.

Changing the product price later must NOT update:

```text
old orders
paid orders
shipped orders
delivered orders
refund calculations based on the original purchase
invoices
```

A customer looking at an old order sees the amount actually paid/charged at that purchase time, not the current product price.

The link from an old order to the product may show the current product page, but the order detail itself uses the immutable snapshot.

## 6. Safe checkout price-change workflow

Never trust the price shown in the browser.

Use this flow:

```text
Customer Cart
    ↓
Checkout request
    ↓
Backend reads CURRENT product price + stock + active discounts/coupon
    ↓
Compare against cart/client values
    ↓
If mismatch → return PRICE_CHANGED / refreshed totals
    ↓
Customer reviews new total
    ↓
Backend creates Pending Order with price snapshots
    ↓
Backend creates Cashfree payment for that exact order amount
    ↓
Customer pays
    ↓
Cashfree webhook + backend verification
    ↓
Order becomes PAID
```

Do not create a payment session using an old browser price.

If price changes while a customer is sitting on the checkout page, the server re-validates and forces the checkout total to refresh before payment.

Once a Pending Order has been created for a payment attempt, its order-item price snapshot is fixed. If the payment expires/fails, the order is not silently rewritten to a different price; it is cancelled/expired and the customer starts a fresh checkout.

## 7. Stock safety

Initial implementation should use a simple, reliable reservation workflow. Do not build a complex distributed inventory system.

Recommended flow:

```text
Checkout validated
→ create pending order
→ reserve/reduce available stock atomically
→ create payment
→ payment success → PAID
→ payment failure/expiry/cancel → release reservation
```

All stock updates must be transactional and protected against overselling.

## 8. Customer historical-data rules

### Product page

Shows current active product data.

### Cart

May contain stale display data. Backend re-checks current price/stock at checkout.

### Checkout

Uses only server-revalidated values.

### Paid order

Uses immutable order snapshots.

### Delivered order

Still uses immutable historical snapshots.

### Refund

Uses the stored order/payment facts, not today's product price.

This separation prevents price edits from corrupting historical customer data.

## 9. Authentication rules

Customer:

```text
Google OAuth
↓
Better Auth
↓
Customer user/session
```

Admin:

```text
Email + password
↓
Better Auth
↓
Role + permissions
```

Super Admin:

```text
Email + password
↓
Better Auth
↓
Super Admin authorization
```

No public Admin registration.

Super Admin creates Admin accounts and can send a setup/invitation email through Resend.

## 10. Authorization

Use RBAC.

```text
User
 ↓
Role(s)
 ↓
Permissions
 ↓
Effective permissions
 ↓
Backend authorization
 ↓
UI visibility
```

Frontend hiding is for UX only. Every protected Worker API must enforce authorization.

Examples:

```text
products.view
products.create
products.update
products.delete
inventory.view
inventory.update
orders.view
orders.update
customers.view
customers.message
categories.subcategories.create
categories.subcategories.update
payouts.view
payouts.request
```

## 11. Super Admin Admin-access / impersonation

Super Admin can enter an Admin experience through a temporary, audited access session.

Do not use the Admin password.

Every action preserves:

```text
actor = Super Admin
acting_on_behalf_of = Admin
access_mode = IMPERSONATION
reason = recorded reason
session_id = access session
```

The Admin UI must show a clear Super Admin mode indicator.

## 12. Account deletion

Customer account deletion must not blindly destroy financial/order history.

Admin deletion requires verification + Super Admin approval.

On approved Admin deletion:

- Admin becomes inactive.
- Customer-visible assigned products are hidden/unavailable according to business rules.
- Financial/order history is retained where required.
- Required data is archived for controlled recovery.

## 13. No unnecessary complexity

Do NOT introduce these unless explicitly requested later:

- Microservices
- Redis
- Kafka
- Elasticsearch/OpenSearch
- Separate catalog service
- Separate payment service
- Separate inventory service
- Marketplace tenant isolation
- Cashfree Easy Split
- COD
- Offline orders
- Draft orders
- Collection module
- Deep category trees
- Event-sourcing
- Complex recommendation ML

Start with one backend Worker, one Aiven PostgreSQL database, one R2 bucket, Better Auth, Resend, and Cashfree.

## 14. High-level request flow

```text
Browser
   ↓
Cloudflare Pages (Customer static HTML/assets)
   ↓
API calls
   ↓
Cloudflare Worker + Hono
   ↓
Authentication / Authorization
   ↓
Business module
   ↓
Drizzle ORM
   ↓
Cloudflare Hyperdrive
   ↓
Aiven PostgreSQL
```

External services:

```text
Worker → R2
Worker → Resend
Worker → Cashfree
Worker → Google OAuth through Better Auth
```

## 15. Current implementation order

```text
1. Aiven PostgreSQL
2. Drizzle schema foundation
3. Cloudflare Worker + Hono
4. Hyperdrive → Aiven
5. Better Auth
6. RBAC
7. Category/Subcategory
8. Catalog/Product
9. Inventory
10. Cart/Checkout
11. Cashfree payment + webhook
12. Orders + historical snapshots
13. Admin earnings/payouts
14. Customer management
15. R2 media
16. Resend notifications/email
17. Cloudflare public cache rules
18. Upstash Redis for measured hot/derived cache or rate limiting
19. Cache invalidation/fallback tests
20. SEO + static export
21. Cloudflare Pages deployment
22. Testing/security/performance
```

## 16. Non-negotiable decisions

```text
1. Single-tenant ecommerce.
2. One Super Admin platform owner.
3. Admins are internal sellers.
4. Customer = /
5. Admin = /admin
6. Super Admin = /super-admin
7. No marketplace tenant architecture.
8. No Collection entity/module/pages.
9. No offline purchase module.
10. No draft order module.
11. COD disabled.
12. Online customer payment only.
13. Cashfree Payment Gateway for customer collection.
14. No Cashfree Easy Split.
15. Admin does not own Cashfree merchant account.
16. Admin cannot directly withdraw.
17. Admin requests payout only.
18. Super Admin processes Admin payout.
19. Commission is Super Admin revenue.
20. Payment Gateway Fee is Super Admin-controlled deduction.
21. Refund Adjustment can reduce Admin Net Payable.
22. Better Auth is the single auth system.
23. Google OAuth is Customer login provider.
24. Admin/Super Admin use email/password.
25. Passwords are hashed, never reversibly encrypted.
26. Aiven PostgreSQL is the database.
27. Cloudflare Hyperdrive sits between Worker and PostgreSQL.
28. Cloudflare R2 is the media store.
29. Customer page is SEO-first.
30. Product/category SEO does not depend on Collections.
31. Product price can change.
32. Order item price snapshot never changes.
33. Checkout always re-validates current price/stock server-side.
34. Old orders use historical snapshots.
35. Backend APIs are authoritative.
36. Role/permission checks are server-side.
37. Privileged actions are audited.
