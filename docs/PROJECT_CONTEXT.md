# Ecommerce Platform — Project Context & Architecture Guide

> **Source of truth — updated 2026-09-22**
>
> Read this file before creating or changing application code. New implementation must follow this document unless the project owner explicitly changes a decision.

## 1. Product

A **single-tenant full-stack ecommerce platform** with three user areas:

```text
CUSTOMER
  ↓
Storefront

ADMIN
  ↓
Internal seller / store operator

SUPER ADMIN
  ↓
Platform owner / controller
```

Routes:

```text
Customer      → /
Admin         → /admin
Super Admin   → /super-admin
```

There is one codebase/repository, but deployment is intentionally split inside the same project boundary:

```text
Next.js static storefront
        ↓
Cloudflare Pages

Cloudflare Pages Functions
        ↓
Backend API + Auth + Webhooks
        ↓
Neon PostgreSQL
```

## 2. Locked business decisions

- Single-tenant ecommerce.
- One Super Admin platform owner.
- Admins are internal sellers/store operators.
- No public Admin registration.
- Customer online payment only.
- COD disabled.
- Customer payment uses **Cashfree Payment Gateway**.
- Admins do not own Cashfree merchant accounts.
- No Cashfree Easy Split.
- Admins cannot directly withdraw customer money.
- Admins can submit payout requests only.
- Super Admin reviews and pays Admins, using Cashfree Payouts or an approved manual payment process.
- Super Admin records payout reference, method, amount, proof, date/time and status.
- Super Admin revenue term is **Commission**.
- Do not use `Platform Fee`, `Market Fee`, `Marketing Fee`, or `Approved Fee`.
- `Payment Gateway Fee` is a configurable deduction controlled by Super Admin.
- `Refund Adjustment` can reduce Admin payable revenue.
- Admin UI is permission-driven.
- Backend APIs enforce the same permissions; hiding a UI control is never security.
- Super Admin can enter an Admin page through controlled Admin Access / Impersonation.
- Impersonation has a reason, temporary session, visible mode indicator and audit trail. Actions must record the real actor as Super Admin.
- Admin deletion requires verification and Super Admin approval.
- Deleted Admin public products are hidden from the storefront; required financial/order history is retained/archived.
- Recovery requires Super Admin approval.
- Customer Management is available to Admin and Super Admin, with different permission scope.
- Admin may view permitted customer details/order metrics and send customer messages/offers only when the permission exists.
- Super Admin has platform-wide customer visibility and management.

## 3. Final technology stack

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zod
- React Hook Form
- Zustand only where client state is actually needed

### Static hosting / SEO

- **Cloudflare Pages** for the Next.js static export.
- Next.js uses `output: "export"`.
- Static output directory: `out`.
- Public, crawlable pages are pre-rendered to HTML.
- Customer private pages and Admin/Super Admin dashboards are not SEO targets.

### Backend runtime

- **Cloudflare Pages Functions** for `/api/*` and server-side work.
- Hono is allowed for routing.
- Better Auth runs in the backend runtime.
- Cashfree webhooks run in the backend runtime.
- R2 upload/signing/protected media logic runs server-side.
- Never put secrets in Next.js client code.

### Database

- **Neon PostgreSQL**.
- Drizzle ORM.
- `@neondatabase/serverless` for Cloudflare/serverless compatibility.
- Do not use the Node `pg` driver in the deployed Cloudflare runtime.

### Authentication

- Better Auth.
- Customer: **Google OAuth** as the primary requested login method. Email/password can remain available only if explicitly enabled later.
- Admin: email + password, invitation/setup flow.
- Super Admin: email + password; add stronger controls such as 2FA before production.
- Passwords are **hashed, not encrypted**. Better Auth currently uses `scrypt` by default. Do not implement plaintext or reversible password storage.

### Media

- **Cloudflare R2** for product images, review images, proof files and other media.
- Cloudinary is removed from the stack.
- Do not store image binaries in PostgreSQL.
- Store R2 object keys and metadata in PostgreSQL.

### Email

- **Resend** for transactional email.
- Use it for admin invitations, verification, password reset, customer messages/offers, order notifications, payout notifications and system alerts.

### Payments

- Cashfree Payment Gateway for customer collection.
- Cashfree Payouts may be used by Super Admin for Admin settlement.

### Source control / deployment

- GitHub.
- Cloudflare Pages connected to GitHub.
- Production branch: `main`.
- Preview deployments from feature/PR branches.

## 4. IMPORTANT architecture correction: SSG is not the backend

Do **not** build the backend so that it "creates SEO HTML".

Correct model:

```text
Backend API / Neon
      ↓
Next.js build-time data fetch
      ↓
Next.js generates HTML
      ↓
Cloudflare Pages serves HTML
```

The backend remains responsible for data, auth, business rules, payments and writes. Next.js is responsible for rendering the public storefront HTML.

A pure static export has an important limitation: product pages are generated from the data available at build time. A price/availability/catalog change does not magically rewrite already-generated HTML. Therefore the system must have a rebuild strategy.

Recommended rebuild flow:

```text
Super Admin edits product
        ↓
Backend writes Neon
        ↓
Backend triggers secure Cloudflare Pages Deploy Hook
        ↓
Next.js rebuild
        ↓
New product/category HTML generated
```

Use rebuilds for SEO/catalog/content changes, not for every order or stock change.

For rapidly changing fields such as exact live stock, checkout price and payment amount, the backend remains the source of truth. Never trust the static HTML value for transactional decisions.

## 5. SEO rules

Public SEO pages:

```text
/
/products
/products/[slug]
/categories/[slug]
/collections/[slug]
/search (indexability policy must be deliberate)
/about
/faq
/terms
/privacy-policy
/shipping-policy
/return-policy
```

Private/non-index pages:

```text
/account/*
/cart
/checkout
/payment/*
/orders/*
/admin/*
/super-admin/*
```

Every indexable page must have:

- Server-generated initial HTML.
- Unique `<title>`.
- Unique meta description where appropriate.
- Canonical URL.
- Correct heading structure.
- Open Graph/Twitter metadata where useful.
- Crawlable internal links.
- Descriptive image `alt` text.
- Valid sitemap.
- Valid robots policy.
- JSON-LD where relevant.
- Product structured data in the **initial HTML**, not only client-side after hydration.
- Product `name`, image, description, SKU/identifier when available, offers, price, currency and availability from trusted backend/build data.
- Product variants represented correctly.
- Breadcrumb structured data where useful.

Do not use:

- `noindex` accidentally on product/category pages.
- JS-only rendering for essential product content.
- Hidden keyword stuffing.
- Duplicate URLs with conflicting canonicals.
- Client-only product JSON-LD as the only source.

## 6. Customer authentication rule

Customer login:

```text
Customer
  ↓
Google OAuth
  ↓
Better Auth
  ↓
Session cookie
  ↓
Customer APIs
```

Do not expose Google client secret to the browser.

OAuth callback belongs to the backend auth endpoint.

## 7. Admin / Super Admin authentication rule

```text
Admin / Super Admin
      ↓
Email + Password
      ↓
Better Auth
      ↓
Password hash stored in DB account record
      ↓
Session
      ↓
RBAC
      ↓
Protected APIs
```

Passwords must never be:

- stored as plaintext,
- encrypted reversibly for later recovery,
- placed in logs,
- sent back to the frontend.

Better Auth stores credential passwords in its account table and currently hashes them with `scrypt` by default.

## 8. Core authorization flow

```text
Request
 ↓
Session
 ↓
User
 ↓
Role(s)
 ↓
Permission(s)
 ↓
Resource ownership/scope check
 ↓
Business rule check
 ↓
Controller/service
 ↓
Database
```

UI permission checks improve UX. Backend authorization is mandatory.

## 9. Payment authority

```text
Customer
  ↓
Checkout
  ↓
Backend creates/revalidates payment context
  ↓
Cashfree Payment Gateway
  ↓
Cashfree webhook
  ↓
Backend verifies webhook/payment status
  ↓
Order becomes PAID/CONFIRMED
```

Never mark an order paid because the browser says payment succeeded.

## 10. Admin earnings

```text
Gross Product Sales
- Commission
- Payment Gateway Fee
- Refund Adjustment
= Net Payable
```

Admin can view these values and request eligible payout.

## 11. Admin payout

```text
Admin payout request
        ↓
PENDING
        ↓
Super Admin review
        ↓
APPROVED / REJECTED
        ↓
Payment execution
        ↓
Reference + proof + method + date/time
        ↓
PAID / FAILED
```

Admin has no payout execution authority.

## 12. Super Admin Access / Impersonation

```text
Super Admin
  ↓
Select Admin
  ↓
Reason + notification
  ↓
Temporary access session
  ↓
Admin UI with visible SUPER ADMIN MODE
  ↓
Actions
  ↓
Audit: real actor = Super Admin
```

Never use the Admin password. Never log privileged actions as if the Admin performed them.

## 13. Account deletion

### Customer

- Verify identity.
- Request/confirm deletion.
- Remove personal data where legally/business-safe.
- Anonymize required order history instead of destroying financial records.
- Revoke sessions.

### Admin

- Request deletion.
- Verify account.
- Super Admin approves/rejects.
- Deactivate Admin.
- Hide public products if required.
- Archive recoverable Admin data.
- Preserve necessary order/financial records.

## 14. Main request architecture

### Public storefront

```text
Browser
 ↓
Cloudflare Pages static HTML
 ↓
Hydrated React UI
 ↓
Backend API only for dynamic actions/data
```

### Dynamic backend

```text
Browser / Webhook
 ↓
Cloudflare Pages Function
 ↓
Authentication / Authorization
 ↓
Zod validation
 ↓
Business module/service
 ↓
Drizzle
 ↓
Neon PostgreSQL
```

### Media

```text
Admin upload
 ↓
Authorized backend
 ↓
R2
 ↓
R2 object key saved in PostgreSQL
 ↓
Public/private media URL
```

## 15. Core data domains

### Identity / RBAC

```text
user
account
session
verification
users
admins
roles
permissions
user_roles
role_permissions
user_permissions (optional)
```

### Catalog

```text
products
categories
brands
product_categories
product_images
product_variants
```

### Customer

```text
addresses
wishlists
wishlist_items
notifications
account_verifications
account_deletion_requests
customer_communication_preferences
```

### Shopping

```text
carts
cart_items
coupons
coupon_usages
```

### Orders

```text
orders
order_items
returns
return_items
refunds
invoices
```

### Payments

```text
payments
payment_attempts
cashfree_webhook_events
```

### Admin finance

```text
admin_revenue
commission_rules
admin_bank_accounts
payout_beneficiaries
payout_requests
admin_payouts
platform_withdrawals
```

### Support / CMS / messaging

```text
contact_messages
support_tickets
support_messages
pages
page_sections
faqs
banners
collections
collection_products
customer_email_messages
```

### Audit

```text
audit_logs
admin_access_sessions
settings
```

## 16. Project structure rule

```text
src/app/                 → Next.js storefront/admin UI routes
src/components/          → UI
src/modules/             → reusable business/domain logic
src/lib/                 → infrastructure helpers
src/validators/          → Zod request schemas
src/db/schema/           → Drizzle schema
functions/                → Cloudflare Pages Functions backend
public/                   → static non-R2 public assets
```

Do not duplicate order/payment/product business logic in customer/admin/super-admin routes.

## 17. Non-negotiable implementation rules

1. Never trust browser price, stock, coupon result or payment status.
2. Never trust `userId`, `adminId` or order ID from the browser without ownership/permission checks.
3. Never put secrets in `NEXT_PUBLIC_*` variables.
4. Never store passwords as plaintext or reversible encryption.
5. Never expose Cashfree secrets to client code.
6. Never expose R2 secret credentials to client code.
7. Never expose Resend API key to client code.
8. Never use Cloudinary in this version.
9. Never reintroduce COD, offline orders, draft orders or Easy Split unless explicitly changed.
10. Never create direct Admin withdrawal code.
11. Never rely on frontend-only RBAC.
12. Never let a static SEO page become the source of truth for transaction values.
13. Audit privileged actions.
14. Use idempotency for payment/webhook/payout operations.
15. Use database transactions for order/stock/revenue state changes where supported by the chosen database path.

## 18. Implementation order

```text
Phase 1 — Foundation
→ project config
→ environment variables
→ Neon + Drizzle
→ Better Auth
→ Google OAuth
→ auth/session tests

Phase 2 — Core data + RBAC
→ users/accounts/sessions
→ roles/permissions
→ Admin/Super Admin authorization

Phase 3 — SEO storefront foundation
→ static export
→ metadata
→ sitemap/robots
→ JSON-LD
→ product/category build-time data
→ Cloudflare Pages deploy

Phase 4 — Catalog
→ categories
→ brands
→ products
→ variants
→ R2 media
→ search/filter

Phase 5 — Shopping
→ cart
→ checkout
→ shipping/address
→ coupon

Phase 6 — Payments/Orders
→ Cashfree order/payment creation
→ webhook verification
→ orders
→ payment attempts
→ refunds/returns

Phase 7 — Admin
→ product management
→ inventory
→ orders
→ customer management
→ analytics
→ earnings
→ payout requests

Phase 8 — Super Admin
→ Admin management
→ roles/permissions
→ customer management
→ Admin Access
→ commission
→ gateway fee
→ payout management
→ platform finance
→ audit
→ recovery

Phase 9 — Communication/content
→ Resend
→ notifications
→ support
→ CMS

Phase 10 — Hardening
→ rate limits
→ security headers
→ CSRF/cookie checks as applicable
→ abuse protection
→ webhook idempotency
→ tests
→ SEO validation
→ production deployment
```

## 19. Current source links

Verified against current vendor documentation on **2026-09-22**:

- Cloudflare Pages Next.js static export: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- Cloudflare Pages / Next.js overview: https://developers.cloudflare.com/pages/framework-guides/nextjs/
- Cloudflare Pages Functions: https://developers.cloudflare.com/pages/functions/
- Cloudflare Pages Functions pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare R2 pricing/free tier: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Pages Deploy Hooks: https://developers.cloudflare.com/pages/configuration/deploy-hooks/
- Neon Free plan limits: https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md
- Neon serverless Postgres driver: https://neon.com/blog/serverless-driver-for-postgres
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth users/accounts: https://better-auth.com/docs/concepts/users-accounts
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Better Auth Hono integration: https://better-auth.com/docs/integrations/hono
- Resend pricing: https://resend.com/pricing
- Google Search product structured data: https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- Google Search merchant listing structured data: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Google Search product variants: https://developers.google.com/search/docs/appearance/structured-data/product-variants
