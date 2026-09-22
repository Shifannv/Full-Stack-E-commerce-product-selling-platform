# PostgreSQL + Drizzle Database Plan

## Database provider

**Neon PostgreSQL**

Current free plan documentation lists 100 CU-hours/project/month, 0.5 GB storage/project, 10 branches/project and 5 GB public network transfer/project/month. Free plan computes scale to zero after inactivity. Verify the current dashboard before production because provider limits can change.

## Driver

Use:

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

Do not use the Node `pg` package in the Cloudflare runtime.

## Connection

```env
DATABASE_URL=
```

Use the Neon connection string appropriate to the serverless driver.

Never expose `DATABASE_URL` through `NEXT_PUBLIC_*`.

## Schema organization

Recommended:

```text
src/db/
├── index.ts
├── schema/
│   ├── auth.ts
│   ├── users.ts
│   ├── rbac.ts
│   ├── catalog.ts
│   ├── customer.ts
│   ├── cart.ts
│   ├── orders.ts
│   ├── payments.ts
│   ├── refunds.ts
│   ├── admin-finance.ts
│   ├── support.ts
│   ├── cms.ts
│   └── audit.ts
└── migrations/
```

## Auth tables

Better Auth manages its required auth tables. Integrate them with the application's user identity model instead of creating a second competing password table.

Common Better Auth tables include:

```text
user
account
session
verification
```

## Business tables

```text
admins
roles
permissions
user_roles
role_permissions
user_permissions

products
categories
brands
product_categories
product_images
product_variants
product_admins

addresses
wishlists
wishlist_items
notifications
customer_communication_preferences
account_verifications
account_deletion_requests

carts
cart_items
coupons
coupon_usages

orders
order_items
returns
return_items
refunds
invoices

payments
payment_attempts
cashfree_webhook_events

admin_revenue
commission_rules
admin_bank_accounts
payout_beneficiaries
payout_requests
admin_payouts
platform_withdrawals

customer_email_messages
contact_messages
support_tickets
support_messages

pages
page_sections
faqs
banners
collections
collection_products

audit_logs
admin_access_sessions
settings
```

## Monetary values

Do not use floating-point JavaScript numbers as the database source of truth for money.

Prefer PostgreSQL `numeric` for currency amounts and a central money utility.

Concept:

```text
amount: numeric(12,2)
currency: char(3)
```

## Order invariants

- Order items must preserve purchased unit price at purchase time.
- Product current price can change later.
- Refunds must reference the affected order/item.
- Payment records must be distinct from order business state.
- Order payment status must be controlled by verified backend events.

## Inventory invariants

- Stock cannot go negative unless a business rule explicitly permits it.
- Checkout re-checks stock.
- Payment success alone does not guarantee stock was valid.
- Concurrent purchase paths require transaction/locking strategy appropriate to the chosen Neon/Postgres flow.

## Admin ownership

Current plan allows product assignment to Admins. Use:

```text
product_admins
```

when multiple Admin access to a product is required.

If business rules later guarantee one Admin per product, `products.admin_id` can simplify the relationship.

## Soft deletion

For business records that must remain for finance/order history, use state columns rather than physical deletion.

Examples:

```text
deleted_at
archived_at
status
```

## Audit records

Audit should capture:

```text
actor_user_id
actor_role
acting_on_behalf_of_user_id (nullable)
action
resource_type
resource_id
before_snapshot (when appropriate)
after_snapshot (when appropriate)
ip / request metadata where policy allows
created_at
```

## Migration rule

Use:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Do not manually edit production tables outside the migration process unless an emergency procedure explicitly requires it.

## Sources

- Neon free limits: https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md
- Neon serverless driver: https://neon.com/blog/serverless-driver-for-postgres
- Better Auth Drizzle: https://better-auth.com/docs/adapters/drizzle
