# Ownline-Full-Stack-Ecommerce — 2026

The master source of truth for architecture, business rules, and implementation status is [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

This platform sells dropshipping, thrift, and retail clothing products.

## Stack

```text

Next.js → Cloudflare Pages (static SEO target)
Hono → Cloudflare Worker (backend)
Hyperdrive → Aiven PostgreSQL
R2 → media
Better Auth → auth
Google OAuth → Customer login provider
Resend → email
Cashfree → payments/payouts
Upstash Redis → controlled application cache/utility layer
Cloudflare Cache → public edge cache
Drizzle → database ORM
```

## Critical business rules

- No Collections.
- Main Category → one-level Subcategory → Product.
- Admin can create/manage permitted custom subcategories under existing main categories.
- Better Auth is the single auth system.
- Google OAuth is only the Customer provider.
- Admin and Super Admin use email/password through Better Auth.
- Passwords are hashed, not reversibly encrypted.
- Product price is mutable.
- Order-item purchase price is immutable.
- Checkout revalidates price and stock server-side.
- Old orders/invoices/refunds use historical snapshots.
- No offline orders, draft orders, COD, Easy Split, marketplace tenant architecture, Cloudinary, or GCS.


## Cache and client-state rules

- Cloudflare cache is the first layer for public cache-safe content.
- Upstash Redis is optional/controlled and never replaces PostgreSQL.
- localStorage is only for non-sensitive client convenience state.
- Authenticated account/order/payment truth comes from the backend/database.
- Cache invalidation must follow authoritative catalog writes.
- Old order prices are immutable snapshots.
