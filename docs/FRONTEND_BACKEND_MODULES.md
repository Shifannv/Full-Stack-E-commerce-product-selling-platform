# Frontend and Backend Modules

## Customer frontend

```text
/
/products
/products/[slug]
/categories/[slug]
/categories/[category]/[subcategory]
/search
/cart
/checkout
/payment/success
/payment/failed
/orders
/orders/[id]
/account
/account/wishlist
/account/addresses
/account/support
/login
```

No collections routes.

## Admin frontend

```text
/admin
/admin/products
/admin/categories/subcategories
/admin/inventory
/admin/orders
/admin/customers
/admin/reviews
/admin/analytics
/admin/earnings
/admin/payout-requests
/admin/notifications
/admin/activity
/admin/account
```

Admin product creation:

```text
main category → existing/new permitted subcategory → product
```

## Super Admin frontend

```text
/super-admin
/super-admin/admins
/super-admin/roles
/super-admin/permissions
/super-admin/admin-access
/super-admin/customers
/super-admin/products
/super-admin/categories
/super-admin/orders
/super-admin/analytics
/super-admin/finance
/super-admin/commissions
/super-admin/payment-settings
/super-admin/payouts
/super-admin/refunds
/super-admin/activity
/super-admin/notifications
/super-admin/content
/super-admin/recovery
/super-admin/settings
```

## Shared backend modules

```text
worker/src/modules/
├── auth
├── users
├── categories
├── catalog
├── inventory
├── search
├── cart
├── checkout
├── shipping
├── coupons
├── orders
├── payments
├── refunds
├── reviews
├── notifications
├── customer-management
├── support
├── media
├── cms
├── analytics
├── admin-revenue
├── payouts
└── audit
```

## Ownership boundaries

### Customer

Own account/cart/wishlist/orders/support/reviews.

### Admin

Assigned products/inventory/orders/reviews, permitted customer visibility, earnings and payout requests, own activity/account.

### Super Admin

Platform-wide authority, Admin lifecycle, roles/permissions, customer management, payments, payouts, finance, audit, content, recovery.

## Collection removal

Do not add a `collections` module back into this structure.
