# Environment Variables

## Local development

Use `.env.local`. Never commit secrets.

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Aiven PostgreSQL connection string
DATABASE_URL=

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:8787

# Customer Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Cashfree Payment Gateway
CASHFREE_CLIENT_ID=
CASHFREE_CLIENT_SECRET=
CASHFREE_ENVIRONMENT=SANDBOX

# Cashfree Payouts
PAYOUT_CLIENT_ID=
PAYOUT_CLIENT_SECRET=
PAYOUT_ENVIRONMENT=SANDBOX

# R2 S3-compatible API, only if generating signed URLs
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Upstash Redis (optional application cache/rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Cloudflare Worker production

Prefer Cloudflare bindings/secrets for Worker runtime values.

Hyperdrive provides the database connection path rather than exposing the raw production database credentials throughout application code.

Never expose these to the browser:

```text
DATABASE_URL
BETTER_AUTH_SECRET
GOOGLE_CLIENT_SECRET
RESEND_API_KEY
CASHFREE_CLIENT_SECRET
PAYOUT_CLIENT_SECRET
R2_SECRET_ACCESS_KEY
UPSTASH_REDIS_REST_TOKEN
```

## Frontend public values

Only explicitly public values may use `NEXT_PUBLIC_*`.

Do not put secrets in `NEXT_PUBLIC_*` variables.

## Deployment rule

Maintain `.env.example` with variable names and safe placeholders only.
