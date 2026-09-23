# Cloudflare Deployment Architecture

## Current target

### Public web

```text
GitHub
↓
Cloudflare Pages
↓
Next.js Static HTML Export
↓
out/
```

### API

```text
GitHub
↓
Cloudflare Worker
↓
Hono
↓
Hyperdrive
↓
Aiven PostgreSQL
```

### Files

```text
Cloudflare Worker
↓
Cloudflare R2
```


## Cache architecture

```text
Browser localStorage
    ↓ (non-sensitive client state only)
Cloudflare Pages / edge cache
    ↓ (public cache-safe content)
Cloudflare Worker
    ├── Upstash Redis (optional hot/derived cache)
    ├── R2
    ├── Cashfree
    └── Resend
          ↓
      Hyperdrive
          ↓
     Aiven PostgreSQL
```

Cloudflare cache and Redis are not synchronized databases. PostgreSQL remains authoritative.

### Cache rules

- Public product/category/subcategory/catalog responses may be cached.
- Authenticated account/order/admin/super-admin responses are private and must not become shared public cache entries.
- Payment, payout, inventory and permission decisions always come from authoritative backend/database state.
- Cache invalidation must happen after authoritative writes for affected public data.
- Never use browser localStorage as the source of account/order truth.

### Redis

Use Upstash Redis only for documented cache/rate-limit/temporary-state use cases. Each Redis key must have a clear TTL, cache key scope, invalidation event, and PostgreSQL fallback.

Do not add Redis to every request path just because Redis exists.

## Aiven + Hyperdrive capacity note

Aiven Free currently allows 20 database connections and does not provide built-in connection pooling. Hyperdrive maintains a connection pool at the database origin; configure it conservatively for the Aiven Free service instead of creating many direct application connections.

## Cloudflare products used

```text
Pages
Workers
Hyperdrive
R2
DNS/custom domain
```

## Database path

Do not open many direct DB connections from a Worker.

Use:

```text
Worker → Hyperdrive → Aiven
```

Hyperdrive is specifically designed to pool connections to existing PostgreSQL databases and can be used with PostgreSQL-compatible providers.

## Worker bindings

Typical bindings:

```text
HYPERDRIVE
R2_MEDIA
```

Typical secrets:

```text
BETTER_AUTH_SECRET
GOOGLE_CLIENT_SECRET
RESEND_API_KEY
CASHFREE_CLIENT_SECRET
PAYOUT_CLIENT_SECRET
R2 secret values when S3 presigning is used
```

## Cloudflare Pages build

Current static target:

```text
Build command:
npx next build

Build output:
out
```

## Important Pages limitation

Static export does not run the Hono backend.

Do not put business APIs, payment webhooks, or privileged database logic in the static Pages deployment.

## GitHub deployment flow

```text
feature branch
↓
PR
↓
dev/test
↓
main
↓
Cloudflare deployment
```

## SEO rebuild trigger

Catalog/content changes that affect public HTML may call a protected Cloudflare Pages deploy hook.

The backend must authenticate/authorize any deployment trigger so arbitrary customers cannot start builds.

## Authentication domain rule

Prefer the same parent domain for the public site and API:

```text
www.example.com
api.example.com
```

Configure Better Auth trusted origins and cross-subdomain cookie settings for the exact production origins. Do not solve cross-domain auth by storing session secrets in localStorage.

## Production domains

Recommended conceptual domains:

```text
www.example.com        → Pages
api.example.com        → Worker
cdn.example.com        → R2 public media/custom domain
```

The exact domains are placeholders.

## Future scale migration

Cloudflare's current documentation recommends Workers/vinext for full-stack Next.js applications and supports ISR/static generation there. If the static-export catalog becomes too expensive to rebuild, migrate the public site to Workers/ISR without changing database/order/auth business rules.
