# Database Plan — Aiven PostgreSQL + Drizzle

## 1. Database provider

Current provider: **Aiven PostgreSQL**.

Local development connects through `DATABASE_URL` directly to Aiven.

Cloudflare Worker production path:

```text
Worker → Hyperdrive → Aiven PostgreSQL
```

## 2. Domains

### Identity / Auth

```text
users
admins
roles
permissions
user_roles
role_permissions
account_verifications
```

Better Auth tables required by the selected adapter are authoritative for auth. Do not invent a second custom user/session system.

### Categories

```text
categories
subcategories
```

Rules:

- Categories are top-level/main categories.
- Subcategories are exactly one level below a category.
- No unlimited parent-child tree.
- Admin-created subcategories can be owned by that Admin.
- Super Admin has global control.

### Catalog

```text
products
product_admins
product_variants
product_images
```

Recommended product fields:

```text
id
name
slug
description
category_id
subcategory_id
status
base_price
compare_at_price
currency
sku
is_featured
is_new
is_active
seo_title
seo_description
created_at
updated_at
```

Never use one current product price as historical order data.

### Inventory

```text
inventory_items
inventory_movements
stock_reservations
```

Keep inventory simple and transactional.

### Customer / shopping

```text
addresses
wishlists
wishlist_items
carts
cart_items
coupons
coupon_usages
notifications
```

### Orders

```text
orders
order_items
returns
return_items
refunds
invoices
```

## 3. Order snapshot model

`order_items` should contain immutable historical data.

Required snapshot fields:

```text
order_id
product_id nullable
variant_id nullable
product_name_snapshot
sku_snapshot
unit_price
quantity
discount_amount
tax_amount
line_total
```

Optional but useful:

```text
product_image_snapshot
variant_name_snapshot
```

Use integer minor units for money where practical, e.g. paise for INR, rather than floating point.

## 4. Payment

```text
payments
payment_attempts
cashfree_webhook_events
```

Use idempotency keys and unique provider reference IDs.

Webhook processing must be idempotent: receiving the same webhook twice must not create a second payment or double-fulfill an order.

## 5. Admin revenue / payout

```text
admin_revenue
admin_bank_accounts
payout_beneficiaries
payout_requests
admin_payouts
commission_rules
```

Formula:

```text
Gross Product Sales
- Commission
- Payment Gateway Fee
- Refund Adjustment
= Net Payable
```

## 6. Customer messaging

```text
customer_email_messages
customer_communication_preferences
```

Admin messaging is permission-controlled; Super Admin has broader authority.

## 7. CMS / home page

```text
pages
page_sections
faqs
banners
```

No collection tables.

Home merchandising can use banners, home sections, category cards, product flags, and explicit product references.

## 8. Audit / access

```text
audit_logs
admin_access_sessions
admin_account_deletion_requests
admin_archives
```

## 9. Financial/history rule

Never use the current `products.base_price` to render the price paid in an old order.

```text
CURRENT PRODUCT
products.base_price
      ↓
used only for current catalog/checkout validation

HISTORICAL ORDER
order_items.unit_price
      ↓
used for order history/invoice/refund history
```

## 10. Required indexes

At minimum, plan indexes for:

```text
products(slug)
products(category_id, is_active)
products(subcategory_id, is_active)
products(status, created_at)
product_admins(admin_id, product_id)
order_items(order_id)
orders(customer_id, created_at)
orders(status, created_at)
payments(order_id)
payment_attempts(provider_reference)
cashfree_webhook_events(provider_event_id)
subcategories(category_id, is_active)
```

Add indexes based on real query patterns; do not index every column.

## 11. Scale rules

- Paginate every admin/customer/product/order table.
- Never load the full product table for an admin page.
- Never perform N+1 queries for product lists/order lists.
- Select only columns required by a page.
- Use transactions for checkout, inventory reservation, payout state changes, refund changes, and other financial operations.
- Use database constraints for uniqueness and important data integrity.
- Keep audit logs append-oriented.


## 12. Cache boundary

Aiven PostgreSQL remains the database of record.

```text
Cache miss → PostgreSQL
Cache hit  → response acceleration only
```

Cache entries must never be treated as authoritative for:

- payment status
- order ownership/status
- price charged
- inventory commit
- Admin earnings
- payout status
- permissions

Historical order values are stored in `order_items` and are never reconstructed from cached/current product data.
