# AI / Codex Coding Rules — Must Read Before Code

> **Updated 2026-09-24:** shadcn-first UI and platform-inspired commerce guidelines are mandatory context for new UI/commerce work.

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

## 21. shadcn-first UI rule

When implementing frontend UI:

```text
read docs
→ check official shadcn component/block
→ add only what is needed
→ customize the project-owned source
→ compose before inventing a primitive
```

Never generate a custom Button/Card/Dialog/Table/Form/Sidebar equivalent when an appropriate official shadcn primitive already exists.

Do not add another full UI library without explicit approval.

## 22. Platform-inspired commerce rule

For product, policy, review, customer-support, pricing, order and communication features, consult:

- `PLATFORM_INSPIRED_COMMERCE_GUIDELINES.md`
- `LEGAL_POLICY_BLUEPRINT.md`

Use the documented principles as product requirements. Do not copy or reproduce another company's legal text.

## 23. Policy visibility rule

Important purchase rules such as returns, refunds, shipping, terms, and privacy must be easy to find and must describe the system's actual behavior. Never create policy copy that claims a feature the backend does not implement.

## 24. Review integrity rule

Product reviews are customer-generated product content. Do not build flows that reward, pressure, or selectively suppress positive/negative reviews. Provide validation, moderation/reporting, and auditability.

# Latest Product/Catalog Coding Rules — 2026-09-25

Before changing product/catalog code, read:

- `PRODUCT_CATALOG_SCHEMA.md`
- `ADMIN_PRODUCT_ADD_SPEC.md`
- `CUSTOMER_PRODUCT_PAGE_SPEC.md`
- `CATEGORY_SUBCATEGORY_RULES.md`
- `PRODUCT_PRICE_AND_ORDER_SNAPSHOT.md`

Non-negotiable:

1. Main Category → Subcategory → Product.
2. Optional Product Variants come under the Product.
3. No Collections.
4. Do not create a generic attribute/variant engine unless the current feature needs it.
5. Keep core filterable relational data normalized; use flexible JSON only for truly flexible specifications/variant combinations.
6. Current price and historical order price are separate.
7. Checkout calculates the effective price server-side.
8. Product images go to R2, not PostgreSQL.
9. Inventory authority is backend/database, not browser/cache.
10. Use shadcn/ui components for the Admin form and Customer product UI before creating custom UI.
11. Do not build machine-learning recommendations in V1; start with simple catalog-based suggestions.
12. Do not expose internal Admin/finance/audit fields on public product pages.
