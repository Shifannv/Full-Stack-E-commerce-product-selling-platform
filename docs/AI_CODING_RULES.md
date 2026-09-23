# AI / Codex Coding Rules — Must Read Before Code

## 1. Source of truth

Read:

```text
PROJECT_CONTEXT.md
STACK_DECISION_AND_CRITIQUE.md
DATABASE_PLAN.md
BACKEND_API_ARCHITECTURE.md
AUTH_SECURITY.md
SEO_SSG_RULES.md
PRODUCT_PRICE_AND_ORDER_SNAPSHOT.md
CATEGORY_SUBCATEGORY_RULES.md
```

before implementing major features.

## 2. Do not invent architecture

Never silently add:

- Collections
- Marketplace tenants
- COD
- Offline orders
- Draft orders
- Easy Split
- Cloudinary/GCS
- separate auth systems
- microservices
- Elasticsearch
- deep taxonomy

unless the project owner explicitly changes the source of truth.

## 3. Prefer simple domain modules

Use:

```text
route
→ validator
→ service/use-case
→ repository/query
→ database
```

Keep financial logic explicit.

## 4. Backend authority

Browser values are untrusted.

Always re-check:

- price
- stock
- discount
- coupon
- payment result
- customer ownership
- Admin ownership/scope
- role/permission

## 5. Price/history rule

Never update historical `order_items` when `products.price` changes.

Current product price and historical purchase price are different domains.

## 6. Checkout rule

Before creating payment:

```text
current price
+ current stock
+ current discounts/coupons
+ current shipping
= server final total
```

Then snapshot the values into the Pending Order.

## 7. Database/performance rule

For large lists:

- paginate
- index
- select required columns
- avoid N+1 queries
- avoid loading thousands of records into memory
- use transactions for money/inventory

## 8. API rule

All privileged routes require:

```text
session
↓
role/permission
↓
input validation
↓
business operation
```

## 9. Payment rule

Frontend success is not payment authority.

Only verified Cashfree events/backend checks can finalize the payment state.

## 10. R2 rule

Images/files belong in R2, not PostgreSQL.

Store metadata/object keys in the database.

## 11. SEO rule

Public content must be crawlable and semantic.

Check:

- title
- description
- canonical
- structured data
- sitemap
- robots
- status codes
- internal links
- image alt text

Do not create collection pages.

## 12. Build/deploy rule

Remember that Cloudflare Pages static export is not the backend runtime.

Backend code belongs in the Worker.

## 13. Coding style

Prefer readable, boring, explicit code over clever abstractions.

Do not create generic frameworks inside the project.

Do not add dependencies unless they solve a real project requirement.

## 14. Before merging

Verify:

```text
TypeScript passes
Lint passes
Tests pass
Database migration/schema is correct
No secrets committed
No old architecture reintroduced
Price-history rules preserved
Authorization enforced server-side
SEO output checked for public pages
```


## 15. Cache rules

Do not add cache layers blindly.

Before caching any value, identify:

```text
source of truth
cache key
scope (public/user/admin)
TTL
invalidation event
fallback behavior
```

Use:

```text
Cloudflare cache → public cache-safe responses
Upstash Redis → selected server-side hot/derived data and rate limiting
localStorage → non-sensitive client convenience state
Aiven PostgreSQL → authoritative application state
```

Never cache a payment, payout, inventory, permission, or order decision as authoritative state.

Do not put customer-specific responses in a shared public cache.

## 16. Client storage rules

Never store passwords, session tokens, OAuth secrets, payment secrets, or sensitive account data in localStorage.

Guest cart may live in localStorage temporarily. After login, merge it into the server cart and make the server cart authoritative.

The same logged-in user on another device must receive account/order/wishlist data from the server, not from localStorage.

## 17. Price/cache correctness

If product price changes:

```text
update PostgreSQL current price
→ invalidate public cache
→ rebuild/revalidate SEO output when required
→ checkout reads current PostgreSQL price
```

Never charge or display an order-history price from a stale current-product cache. Historical order-item snapshots are immutable.
