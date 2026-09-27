# Migration Notes — 2026-09-23

This update replaces the previous architecture decisions that are now obsolete.

## Removed

```text
Cloudinary
Google Cloud Storage
Neon PostgreSQL
Collections
Collection SEO pages
Collection backend module
Next.js runtime API as the primary backend
```

## Added/current

```text
Aiven PostgreSQL
Cloudflare Hyperdrive
Cloudflare R2
Cloudflare Worker + Hono backend
Better Auth for all roles
Google OAuth only as Customer provider
Category + one-level subcategory model
Immutable order-item price snapshots
Server-side price revalidation at checkout
```

## Important code migration rules

### Database

Replace Neon connection configuration with Aiven `DATABASE_URL`.

For Worker runtime, use Hyperdrive instead of opening many direct connections to Aiven.

### Images

Replace Cloudinary/GCS storage code with R2.

### Collections

Delete from current planning/code where safe:

```text
collections routes
collections services
collections tables
collection_products
collection SEO generation
```

Do not delete production data blindly if collection tables already exist; inspect the current database first and migrate safely.

### Authentication

Do not create a separate Google auth system beside Better Auth.

Configure Google as the Better Auth Customer social provider.

### Pricing

If existing order code reads `products.price` when rendering old orders, fix it.

Historical order amounts must come from `order_items` snapshots.

### Categories

Replace any old collection-first category architecture with:

```text
category
→ subcategory
→ product
```

### Backend

Runtime API logic must move to the Cloudflare Worker.

The static Next.js site must not be treated as the backend.
