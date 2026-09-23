# Latest Decisions — 2026-09-23

This file is a quick delta summary for AI coding agents. `PROJECT_CONTEXT.md` remains the detailed source of truth.

## Infrastructure

```text
Frontend: Next.js App Router + TypeScript
SEO hosting target: Cloudflare Pages static export / SSG
Backend: Cloudflare Worker + Hono
DB: Aiven PostgreSQL
DB edge/pooling: Cloudflare Hyperdrive
Images/files: Cloudflare R2
Email: Resend
Payments: Cashfree
Auth: Better Auth
Customer auth provider: Google OAuth
Admin/Super Admin auth: Better Auth email/password
Application cache/utility: Upstash Redis (controlled use)
```

## No Collections

Do not create a Collection entity, table, route, module, or Collection SEO page.

```text
Main Category → one-level Subcategory → Product
```

Customer Home may show feature cards, category cards, banners, offers, and product sections without a Collection entity.

## Client state and cache

```text
localStorage
→ non-sensitive guest/UI state only

Cloudflare cache
→ public cache-safe responses/assets

Upstash Redis
→ selected hot/derived cache + rate limits/temporary state

Aiven PostgreSQL
→ authoritative source of truth
```

Do not describe the caches as a synchronized database. Cache invalidation is explicit.

## LocalStorage rule

Never store passwords, Better Auth session secrets, OAuth secrets, Cashfree secrets, payout secrets, or sensitive account data in localStorage.

Guest cart can be stored locally. After login it must be merged into the server cart; the server becomes authoritative.

## Auth rule

Better Auth is the only authentication framework.

```text
Customer → Google OAuth through Better Auth
Admin → Email/password through Better Auth
Super Admin → Email/password through Better Auth
```

Passwords are hashed, not reversibly encrypted.

## Price/history rule

```text
products.base_price = current live price
order_items.unit_price = immutable historical purchase price
```

If an Admin changes a product from ₹1,999 to ₹1,499:

- the current product/catalog becomes ₹1,499 after authoritative write and cache/SSG refresh;
- old orders remain ₹1,999;
- checkout revalidates current price on the server;
- a stale browser/cache value must never determine the payment amount.

## AI rule

Use the simplest implementation that satisfies the requirement. Do not build microservices, queues, deep taxonomy, Elasticsearch, or custom cache synchronization infrastructure for version 1.
