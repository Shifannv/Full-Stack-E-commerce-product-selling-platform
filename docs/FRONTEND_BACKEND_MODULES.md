# Frontend + Backend Module Map

## Frontend routes

```text
src/app/
├── (customer)/
│   ├── page.tsx
│   ├── products/
│   │   ├── page.tsx
│   │   └── [slug]/page.tsx
│   ├── categories/[slug]/page.tsx
│   ├── collections/[slug]/page.tsx
│   ├── search/page.tsx
│   ├── cart/page.tsx
│   ├── checkout/page.tsx
│   ├── payment/
│   ├── orders/
│   ├── account/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   ├── reset-password/page.tsx
│   ├── contact/page.tsx
│   ├── faq/page.tsx
│   ├── about/page.tsx
│   └── policies/
│
├── admin/
│   ├── page.tsx
│   ├── products/
│   ├── inventory/
│   ├── orders/
│   ├── customers/
│   ├── reviews/
│   ├── analytics/
│   ├── earnings/
│   ├── payout-requests/
│   ├── notifications/
│   ├── support/
│   ├── activity/
│   └── account/
│
└── super-admin/
    ├── page.tsx
    ├── admins/
    ├── customers/
    ├── roles/
    ├── permissions/
    ├── admin-access/
    ├── finance/
    ├── commissions/
    ├── payment-settings/
    ├── payouts/
    ├── orders/
    ├── products/
    ├── analytics/
    ├── refunds/
    ├── activity-logs/
    ├── notifications/
    ├── content/
    ├── recovery/
    └── settings/
```

## Shared backend domains

```text
src/modules/
├── auth/
├── customer/
├── catalog/
├── categories/
├── brands/
├── search/
├── inventory/
├── cart/
├── checkout/
├── shipping/
├── coupons/
├── orders/
├── payments/
├── refunds/
├── reviews/
├── notifications/
├── support/
├── media/
├── cms/
├── analytics/
└── audit/
```

## Admin-specific domains

```text
src/modules/admin/
├── account/
├── customer-management/
├── revenue/
├── payout-requests/
├── recovery/
└── activity/
```

## Super Admin-specific domains

```text
src/modules/super-admin/
├── admin-management/
├── customer-management/
├── roles-permissions/
├── admin-access/
├── commission/
├── payment-settings/
├── payout-management/
├── finance/
├── recovery/
└── settings/
```

## Customer business modules

```text
Auth
Catalog
Search
Cart
Checkout
Shipping
Coupons
Orders
Payments
Refunds/Returns
Reviews
Notifications
Support
Account
```

## Admin business modules

```text
Products
Inventory
Online Orders
Customer Management
Reviews
Analytics
Earnings
Payout Requests
Notifications
Support
Activity
Account
```

## Super Admin business modules

```text
Admin Management
Customer Management
Roles/Permissions
Admin Access
Products/Orders oversight
Commission
Payment Gateway settings
Payout Management
Platform Finance
Refunds
Analytics
Content
Audit
Recovery
Settings
```

## Module rule

A feature belongs to the **domain module** first and to a role UI second.

Bad:

```text
admin/orders/service.ts
super-admin/orders/service.ts
customer/orders/service.ts
```

Preferred:

```text
modules/orders/service.ts
```

with authorization at the API/use-case boundary.
