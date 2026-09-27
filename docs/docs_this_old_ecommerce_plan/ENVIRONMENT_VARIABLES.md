# Environment Variables — 2026-09-24

## 1. Two applications

The repository now contains two runtime applications:

```text
frontend/ → Next.js / Cloudflare Pages
backend/  → Cloudflare Worker / Hono
```

Do not share the backend secret environment with the browser-facing frontend.

## 2. Frontend local environment

File:

```text
frontend/.env.local
```

Only public values belong here:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8787
```

Never place database secrets or third-party secret keys in this file.

## 3. Backend local environment

File:

```text
backend/.dev.vars
```

Template:

```env
# Aiven PostgreSQL - local Drizzle migrations/tools
DATABASE_URL=

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:8787

# Customer Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Upstash Redis (controlled/optional)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Add only when payment development begins
CASHFREE_CLIENT_ID=
CASHFREE_CLIENT_SECRET=
CASHFREE_ENVIRONMENT=SANDBOX

PAYOUT_CLIENT_ID=
PAYOUT_CLIENT_SECRET=
PAYOUT_ENVIRONMENT=SANDBOX

# Add only when email development begins
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

For local Worker development, use `.dev.vars` or `.env` according to the current Wrangler configuration; do not maintain duplicate secret sources for the same environment.

## 4. Cloudflare bindings

Prefer Cloudflare Worker bindings for platform resources:

```text
HYPERDRIVE → Aiven PostgreSQL
R2 bucket  → product/media storage
```

Do not expose R2 access keys to the browser.

S3-compatible R2 credentials are only needed if a concrete S3 API workflow is chosen. Native Worker bindings are preferred for the first implementation.

## 5. Production secrets

Production backend secrets must be stored in Cloudflare Worker secrets/bindings, not committed to Git.

Never expose:

```text
DATABASE_URL
BETTER_AUTH_SECRET
GOOGLE_CLIENT_SECRET
RESEND_API_KEY
CASHFREE_CLIENT_SECRET
PAYOUT_CLIENT_SECRET
UPSTASH_REDIS_REST_TOKEN
R2 secret keys, if ever used
```

## 6. Public environment variable rule

Only explicitly browser-safe values can use:

```text
NEXT_PUBLIC_*
```

Do not prefix secrets with `NEXT_PUBLIC_`.

## 7. Resend and Cashfree timing

It is valid to leave these values empty while the feature is not being implemented.

Do not build email/payment code that silently assumes a missing credential is valid.

When the corresponding module is ready:

```text
feature ready
→ provider account configured
→ credential added
→ sandbox/test
→ integration tests
```

## 8. `.env.example`

Commit safe templates only:

```text
frontend/.env.example
backend/.env.example
```

Never commit:

```text
frontend/.env.local
backend/.dev.vars
```
