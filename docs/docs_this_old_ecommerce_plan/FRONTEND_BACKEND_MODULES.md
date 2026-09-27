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
backend/src/modules/
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


## UI source rule

Frontend feature UI should use official shadcn/ui components/blocks first. Keep `components/ui/` for project-owned shadcn component source and keep business logic in feature/lib layers.

## Policy/trust modules

Customer-facing policy and trust behavior should be implemented where required by: pricing, orders, refunds, reviews, notifications, support, CMS/content, and customer communication modules. See `PLATFORM_INSPIRED_COMMERCE_GUIDELINES.md`.

# Latest Product UI/Data Contract Addendum — 2026-09-25

## Admin product form

The Admin Product module must support:

- Main Category selection
- Subcategory selection
- permitted custom Subcategory creation
- product name
- short description
- full description
- brand when available
- images
- SEO title/description
- current price
- compare-at price
- variant builder
- variant SKU
- optional barcode
- variant price override
- inventory/stock
- product status
- Featured/New/Trending merchandising flags

## Customer product page

The public page should display:

- image gallery
- product name
- brand when available
- current effective price
- valid compare-at price
- rating/review count
- availability
- variant selectors
- quantity
- Add to Cart
- Buy/checkout CTA
- wishlist
- highlights
- full description
- specifications
- shipping/return information
- reviews
- related/suggested products

See `ADMIN_PRODUCT_ADD_SPEC.md` and `CUSTOMER_PRODUCT_PAGE_SPEC.md`.
