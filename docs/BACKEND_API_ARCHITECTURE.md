# Backend API Architecture

## Runtime

Backend runs in **Cloudflare Pages Functions**.

Recommended routing library:

```text
Hono
```

Better Auth is mounted under:

```text
/api/auth/*
```

## API groups

```text
/api/auth/*
/api/customer/*
/api/admin/*
/api/super-admin/*
/api/webhooks/cashfree/*
```

## Backend layers

```text
Function / Route
   ↓
Authentication
   ↓
Authorization
   ↓
Validation
   ↓
Application Service
   ↓
Repository / Drizzle
   ↓
Neon PostgreSQL
```

External service boundary:

```text
Service
 ├── Cashfree adapter
 ├── Resend adapter
 ├── R2 adapter
 └── Google/Better Auth adapter
```

## Customer API domains

```text
GET    /api/customer/products
GET    /api/customer/products/:slug
GET    /api/customer/categories
GET    /api/customer/collections/:slug
POST   /api/customer/cart/items
PATCH  /api/customer/cart/items/:id
DELETE /api/customer/cart/items/:id
POST   /api/customer/checkout/validate
POST   /api/customer/orders
POST   /api/customer/payments/create
GET    /api/customer/orders
GET    /api/customer/orders/:id
POST   /api/customer/reviews
POST   /api/customer/support
```

Exact routes may be changed during implementation, but responsibility must remain the same.

## Admin API domains

```text
GET/PATCH/POST /api/admin/products/*
GET/PATCH       /api/admin/inventory/*
GET/PATCH       /api/admin/orders/*
GET             /api/admin/customers/*
POST            /api/admin/customers/:id/messages
GET             /api/admin/reviews/*
GET             /api/admin/analytics/*
GET             /api/admin/earnings/*
POST            /api/admin/payout-requests
GET             /api/admin/payout-requests/*
GET             /api/admin/activity
POST            /api/admin/account-deletion-request
```

## Super Admin API domains

```text
/api/super-admin/admins/*
/api/super-admin/roles/*
/api/super-admin/permissions/*
/api/super-admin/customers/*
/api/super-admin/admin-access/*
/api/super-admin/commission/*
/api/super-admin/payment-settings/*
/api/super-admin/payouts/*
/api/super-admin/finance/*
/api/super-admin/refunds/*
/api/super-admin/settings/*
/api/super-admin/audit/*
/api/super-admin/recovery/*
```

## Cashfree webhook

```text
POST /api/webhooks/cashfree/payment
POST /api/webhooks/cashfree/payout
```

Webhook rules:

1. Read raw body exactly as required by provider verification.
2. Verify authenticity.
3. Check event type.
4. Check idempotency/event ID.
5. Update payment/order state in one controlled transaction where possible.
6. Return success only after durable processing is complete.
7. Store original webhook metadata for troubleshooting.

## Idempotency

Client-side payment/order requests and webhook processing must be idempotent.

Use unique constraints such as:

```text
provider_payment_id
provider_order_id
provider_event_id
idempotency_key
```

## Error model

Return stable machine-readable errors:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found"
  }
}
```

Do not expose stack traces in production.

## Validation

Zod validation at API boundary:

```text
HTTP input
 ↓
Zod
 ↓
normalized data
 ↓
service
```

Business rules belong in services, not scattered across React components.

## Database access

Use Drizzle with Neon serverless driver.

Do not open a new traditional long-lived TCP pool inside Cloudflare Functions.

## Sources

- Better Auth Hono: https://better-auth.com/docs/integrations/hono
- Better Auth Cloudflare/Workers patterns: https://better-auth.com/docs/concepts/options
- Neon serverless driver: https://neon.com/blog/serverless-driver-for-postgres
