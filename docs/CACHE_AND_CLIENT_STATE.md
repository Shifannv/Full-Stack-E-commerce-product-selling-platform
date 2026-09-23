# Cache, Client State, Redis, and Data Freshness — 2026-09-23

## Purpose

This project uses caching to reduce database reads and improve response time, but **cache is never the source of truth for orders, payments, inventory, permissions, or customer-owned records**.

The source of truth remains:

```text
Aiven PostgreSQL
```

The architecture uses separate layers for separate jobs.

## 1. Cache layers

```text
Layer 1 — Browser
    ↓
localStorage / in-memory client state
    ↓
Layer 2 — Cloudflare edge/cache
    ↓
public HTTP/SEO responses and assets
    ↓
Layer 3 — Upstash Redis
    ↓
short-lived server-side application cache / rate limits / derived data
    ↓
Layer 4 — Cloudflare Hyperdrive
    ↓
connection pooling + eligible DB read caching
    ↓
Layer 5 — Aiven PostgreSQL
    ↓
authoritative database
```

These layers are **not the same cache** and must not be treated as one synchronized database.

## 2. Cloudflare cache is the primary public-web cache

Use Cloudflare cache for public, cache-safe responses such as:

- published product pages
- published category pages
- published subcategory pages
- public product listing responses when the cache key is deterministic
- public CMS/SEO content
- static JavaScript/CSS/fonts/images
- public R2 media

Do not cache authenticated/customer-specific responses as public responses.

Examples that must not be publicly cached:

```text
/account/*
/orders/*
/admin/*
/super-admin/*
customer cart
customer wishlist
customer notifications
customer profile
payout data
payment status for a specific customer
```

Cloudflare Workers caching has bypass behavior for requests using `Authorization` and for responses with `Set-Cookie`, `private`, or `no-store`; still set explicit cache headers instead of relying on defaults. See the Cloudflare caching docs.

## 3. Upstash Redis decision

Redis is selected as an **optional application cache and utility layer**, using Upstash Redis during the free/early stage.

Current published Upstash Redis Free limits include:

- 256 MB data size
- 10 GB monthly bandwidth
- 500,000 monthly commands
- 1 free database
- $0/month

These are current published limits, not permanent guarantees.

### Redis may be used for

- short-lived cache of expensive public/derived database queries
- rate limiting counters
- temporary application state where a database row is unnecessary
- cache keys for expensive aggregates where a DB query is measurably expensive

### Redis must not become the primary database

Do not store authoritative:

- orders
- payments
- refunds
- inventory truth
- Admin earnings
- payout records
- customer authentication records
- permissions

in Redis.

## 4. Do not duplicate the same cache unnecessarily

A public product response should not automatically be stored in:

```text
Cloudflare cache + Redis + localStorage
```

all at once.

Choose the layer based on the use case.

Recommended default:

```text
Public HTTP response
→ Cloudflare cache

Expensive server-side computed data
→ Redis (only when needed)

Guest UI state
→ browser localStorage
```

If Redis is added for a particular query, document the exact key, TTL, invalidation event, and fallback query.

## 5. Cache invalidation rule

Cache is not automatically "synced" with PostgreSQL.

When authoritative data changes:

```text
Admin changes product
      ↓
Aiven PostgreSQL updated
      ↓
Invalidate affected Redis key(s), if Redis was used
      ↓
Purge/revalidate affected Cloudflare cached public response(s)
      ↓
Next request reads current PostgreSQL-backed data
      ↓
Fresh response becomes cacheable again
```

For public catalog changes, use targeted invalidation rather than clearing the entire cache.

Examples:

```text
product.updated
→ invalidate product:{slug}
→ invalidate category:{categorySlug}:products
→ trigger/revalidate SEO deployment when static HTML must change
```

The exact implementation can use Cloudflare cache tags/purge mechanisms and application cache keys; do not invent a custom global cache invalidation bus for version 1.

## 6. Product price changes and cache

Product price is current state:

```text
products.base_price
```

Order price is historical state:

```text
order_items.unit_price
```

When an Admin changes a product price:

```text
Aiven products.base_price = new price
```

Then:

1. invalidate the affected product/catalog cache entries;
2. update/rebuild public SEO HTML when required by the SSG workflow;
3. ensure checkout re-reads the current price from the backend;
4. never modify historical `order_items.unit_price`.

The cache must never allow an old public price to become the amount charged at checkout.

## 7. Browser localStorage rules

`localStorage` is a client convenience store, not an account database.

Allowed examples:

- guest cart before login
- recently viewed product IDs
- UI preferences
- non-sensitive filters/sort choices
- temporary checkout UI state that can safely be discarded

Do **not** store in localStorage:

- password
- Better Auth session token
- OAuth client secret
- Cashfree secret or payment credentials
- private customer orders
- payout information
- authorization/permission decisions as the source of truth
- sensitive personal data that the server already protects

Better Auth uses secure cookies for sessions; keep authentication authority on the server.

## 8. Guest cart → logged-in cart

Recommended flow:

```text
Guest
  ↓
localStorage cart
  ↓
Customer logs in
  ↓
Send guest cart items to backend
  ↓
Backend validates product/price/stock
  ↓
Merge into server cart
  ↓
Server cart becomes authoritative
  ↓
Clear/replace guest localStorage cart
```

The same customer using another device gets their server cart/order/wishlist/account data after authentication. The second device does not depend on the first device's localStorage.

## 9. Customer account data

For authenticated account data:

```text
Browser
  ↓
Better Auth session cookie
  ↓
Worker API
  ↓
Cache only when the response is safely user-scoped and correctly keyed
  ↓
Aiven PostgreSQL
```

For sensitive account/order/payment responses, prefer no-store or private caching unless a documented safe strategy exists.

Do not use a shared public CDN key for multiple users' account data.

## 10. Session performance

Better Auth provides its own cookie-based session management. If session cookie caching is enabled, keep it short-lived and understand that revocation on another device may not take effect until the cache expires. Do not add Redis just to duplicate session storage unless the project has a measured requirement.

## 11. Cache failure behavior

Cache failure must not break checkout or account correctness.

Examples:

```text
Redis unavailable
→ fall back to PostgreSQL

Cloudflare public cache miss
→ Worker/data source generates fresh response

Browser localStorage missing
→ load state from server/defaults
```

Never return stale payment status merely because a cache is unavailable or stale.

## 12. Performance strategy

Start simple:

```text
Aiven PostgreSQL
↑
Hyperdrive
↑
Worker
↑
Cloudflare edge cache for public GETs
```

Add Redis only for measured hot paths.

This prevents the project from becoming a multi-cache synchronization problem before it needs one.

## Sources

- Cloudflare Workers Cache: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Cloudflare Workers Caching configuration: https://developers.cloudflare.com/workers/cache/configuration/
- Cloudflare Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- Upstash Redis pricing: https://upstash.com/pricing/redis
- Better Auth cookies: https://better-auth.com/docs/concepts/cookies
- Better Auth session management: https://better-auth.com/docs/concepts/session-management
