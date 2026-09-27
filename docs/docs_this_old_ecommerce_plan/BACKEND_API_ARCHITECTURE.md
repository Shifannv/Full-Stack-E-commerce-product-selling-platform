# Backend API Architecture — Cloudflare Worker + Hono — 2026-09-24

## 1. Runtime

Backend runtime:

```text
Cloudflare Workers
```

Framework:

```text
Hono
```

Database path:

```text
Worker
↓
Cloudflare Hyperdrive
↓
Aiven PostgreSQL
```

## 2. Repository location

Backend code belongs under:

```text
backend/
```

Do not put runtime backend API logic inside the Next.js static export.

## 3. API areas

```text
/api/auth/*
/api/customer/*
/api/admin/*
/api/super-admin/*
/api/webhooks/cashfree/*
/api/health
```

Hono route files belong in:

```text
backend/src/routes/
```

## 4. Module structure

```text
backend/src/
├── index.ts
├── routes/
├── modules/
├── admin/
├── super-admin/
├── db/
├── middleware/
├── validators/
├── services/
├── lib/
├── types/
├── constants/
└── utils/
```

One Worker, domain modules. No microservices.

## 5. Request lifecycle

```text
HTTP request
↓
Hono route
↓
Auth/session check when required
↓
RBAC permission check
↓
Zod validation
↓
Business service/use-case
↓
Drizzle query/transaction
↓
External service if needed
↓
Audit record when required
↓
Response
```

## 6. Cache-aware reads

Where caching is justified:

```text
Worker route
↓
Cloudflare cache for safe public response where applicable
↓
Upstash Redis for selected hot/derived data
↓
Hyperdrive
↓
Aiven PostgreSQL
```

The cache is never the business authority.

## 7. Security

Never trust the client for:

- price
- stock
- discount
- coupon result
- order ownership
- payment status
- payout status
- role
- permission
- admin_id

## 8. Idempotency

Implement idempotency for operations that can be repeated due to retries, especially:

- payment webhook handling
- order confirmation
- refund creation
- payout recording where applicable

## 9. Error handling

Use predictable API errors with:

- machine-readable error code
- safe human-readable message
- request/correlation ID where useful

Do not expose database/provider secrets in errors.

## 10. Business logic boundaries

Pricing, inventory, payment, order state, payout and authorization logic must live in backend business modules rather than generic UI/API route files.

## 11. Product/order price rule

The current product price can change.

The historical order item price cannot be rewritten.

Checkout must calculate the current server-side amount before creating a payment.
