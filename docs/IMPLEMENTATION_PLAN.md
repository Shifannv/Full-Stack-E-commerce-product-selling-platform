# Implementation Plan

## Phase 0 — Environment foundation

```text
Node.js
npm
Git
GitHub
Next.js
```

Tasks:

- confirm Node version supported by current Next.js project;
- configure `.env.local`;
- add `.env.example`;
- create docs source of truth;
- configure TypeScript strict mode;
- configure linting/formatting.

## Phase 1 — Neon + Drizzle

Tasks:

1. Create Neon project.
2. Create production/dev branches as needed.
3. Add `DATABASE_URL`.
4. Install `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`.
5. Create DB client.
6. Configure schema and migrations.
7. Test local query.
8. Create Better Auth tables through the Drizzle adapter.

Acceptance:

```text
App → Drizzle → Neon → successful query
```

## Phase 2 — Better Auth

Implement:

- Customer Google OAuth.
- Admin email/password.
- Super Admin email/password.
- Email verification as configured.
- Password reset.
- Session cookies.
- Session revocation.

Acceptance:

```text
Customer login works
Admin login works
Super Admin login works
```

## Phase 3 — RBAC

Build:

```text
roles
permissions
user_roles
role_permissions
```

Create permission constants in one place.

Test both:

```text
UI hides unavailable module
API rejects unavailable action
```

## Phase 4 — SEO static storefront

Configure:

```ts
output: "export"
```

Build:

- `/`
- `/products`
- `/products/[slug]`
- `/categories/[slug]`
- `/collections/[slug]`
- `/faq`
- policies
- metadata
- sitemap
- robots
- JSON-LD

Acceptance:

- View source contains product content.
- View source contains Product JSON-LD.
- Rich Results Test passes required fields.

## Phase 5 — Cloudflare Pages

Configure:

```text
Build command: npx next build
Output: out
```

Connect GitHub.

Deploy preview.

Verify:

- custom routes
- assets
- images
- 404 handling
- sitemap
- robots

## Phase 6 — Pages Functions backend

Create:

```text
/api/auth/*
/api/customer/*
/api/admin/*
/api/super-admin/*
/api/webhooks/cashfree/*
```

Add Hono if used.

Implement:

- auth middleware
- RBAC middleware
- request validation
- error handling
- rate limits
- database access

## Phase 7 — R2 media

Create R2 bucket.

Implement:

```text
server-authorized upload
object key creation
metadata record
safe delete
private/protected proof files
```

Product image URLs must be stable and crawlable.

## Phase 8 — Catalog + inventory

Build:

- category
- brand
- product
- variants
- images
- inventory
- Admin product assignment

Add product build/rebuild mechanism.

## Phase 9 — Cart + checkout

Build:

- cart
- cart items
- address
- shipping
- coupons
- final price calculation

Always revalidate server-side.

## Phase 10 — Cashfree

Implement:

- payment creation
- redirect/payment UI
- webhook verification
- payment attempts
- idempotency
- order payment state

Acceptance:

```text
Customer pays
 → Cashfree
 → webhook
 → backend verification
 → order paid
```

## Phase 11 — Orders/returns/refunds

Build:

- order lifecycle
- shipment status
- cancellation rules
- returns
- refunds
- invoice

## Phase 12 — Admin

Build:

- products
- inventory
- orders
- customer management
- reviews
- analytics
- earnings
- payout request
- activity
- account deletion request

## Phase 13 — Super Admin

Build:

- Admin management
- roles/permissions
- customer management
- Admin access/impersonation
- commission
- gateway fee
- payout management
- finance
- refunds
- audit
- recovery
- settings

## Phase 14 — Resend + notifications

Build:

- admin invitation
- email verification
- password reset
- order emails
- payment emails
- payout emails
- customer messages/offers

Add communication preference checks.

## Phase 15 — SEO rebuild automation

When a catalog/CMS change affects public HTML:

```text
write to Neon
 ↓
trigger Deploy Hook
 ↓
Cloudflare Pages build
 ↓
new static HTML
```

Avoid rebuild storms by batching.

## Phase 16 — Hardening

Test:

- auth
- authorization
- ownership
- rate limiting
- webhook duplication
- payment failure
- refund adjustment
- payout duplicate request
- R2 upload abuse
- account deletion
- impersonation audit trail
- SEO crawlability

## Phase 17 — Production readiness

Checklist:

```text
[ ] production Google OAuth configured
[ ] production Cashfree configured
[ ] Resend domain verified
[ ] Neon production branch selected
[ ] R2 production bucket selected
[ ] production secrets set
[ ] migrations applied
[ ] webhook URL verified
[ ] sitemap submitted
[ ] robots checked
[ ] Product JSON-LD validated
[ ] account deletion tested
[ ] Admin payout audit tested
[ ] Super Admin impersonation tested
[ ] rollback path tested
```
