# Backend API Architecture — Cloudflare Worker + Hono

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

## 2. API areas

```text
/api/auth/*
/api/customer/*
/api/admin/*
/api/super-admin/*
/api/webhooks/cashfree/*
/api/health
```

Do not put runtime backend API logic inside Next.js static-export routes.

The Next.js project is the public/UI build; the Worker is the backend runtime.

## 3. Worker modules

```text
worker/src/
├── index.ts
├── routes/
│   ├── auth/
│   ├── customer/
│   ├── admin/
│   ├── super-admin/
│   └── webhooks/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── categories/
│   ├── catalog/
│   ├── inventory/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   ├── payments/
│   ├── refunds/
│   ├── reviews/
│   ├── notifications/
│   ├── customer-management/
│   ├── admin-revenue/
│   ├── payouts/
│   ├── media/
│   ├── cms/
│   └── audit/
├── middleware/
├── validators/
├── db/
├── lib/
└── services/
```

One Worker, domain modules. No microservices.

## 4. Request lifecycle

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
Business service
↓
Drizzle query/transaction
↓
External service if needed
↓
Audit/event record when required
↓
Response
```

## 5. Security rules

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

## 6. Idempotency

Implement idempotency where duplicate requests can cause money/inventory problems.

Required examples:

- Checkout/order creation
- Cashfree payment webhook processing
- Refund creation
- Payout state transition
- Admin manual payment record

## 7. Pagination

Every potentially large list uses server-side pagination.

Examples:

```text
products
orders
customers
reviews
notifications
payout requests
activity logs
```

Use stable ordering and indexed cursors/offsets as appropriate.

## 8. Error model

Use predictable API errors, for example:

```json
{
  "success": false,
  "code": "PRICE_CHANGED",
  "message": "The product price changed. Please review your cart.",
  "data": {
    "currentTotal": 79900
  }
}
```

Do not expose database errors, provider secrets, stack traces, or internal SQL to clients.

## 9. Payment webhook rules

Treat Cashfree webhooks as untrusted input until verified.

Flow:

```text
Cashfree webhook
↓
Verify signature/event
↓
Check idempotency
↓
Load payment/order
↓
Validate amount/reference/order relation
↓
Update payment/order transactionally
↓
Record webhook event
```

The frontend success page does not mark an order paid.

## 10. Media upload flow

Preferred flow for product images:

```text
Admin browser
↓
Worker requests upload authorization
↓
Worker creates signed upload URL
↓
Browser uploads directly to R2
↓
Worker stores object key + metadata in PostgreSQL
```

Do not send large files through the database.


## 11. Cache policy

Public cache-safe GET responses may use Cloudflare caching.

Use Upstash Redis only when an endpoint has a documented application-cache need.

Every cache entry must define:

```text
key
scope
TTL
source of truth
invalidation event
fallback behavior
```

Never let cache decide:

```text
payment status
order ownership/status
inventory commit
payout status
permissions
amount charged
```

For user-specific data, never construct a shared public cache key that can mix customers.
