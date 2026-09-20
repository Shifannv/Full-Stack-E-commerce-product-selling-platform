# Ecommerce Platform — Project Context & Architecture Guide

> **Purpose of this document**
>
> This file is the project context for the developer/Codex. Read this before creating or changing application code. It explains what this ecommerce platform is, who uses it, what each page/module does, how data moves, and the current business rules.
>
> **Current source of truth:** this document reflects the latest project decisions made for the current build. Do not reintroduce older ideas such as marketplace tenants, Cashfree Easy Split, COD, offline orders, draft orders, direct Admin withdrawals, platform/market/marketing fees, or public Admin registration unless the project owner explicitly changes the plan.

---

# 1. Project Overview

## 1.1 What are we building?

A **single-tenant full-stack ecommerce platform** built as one Next.js application.

The platform has three user areas:

```text
CUSTOMER
   ↓
Normal ecommerce website

ADMIN
   ↓
Internal seller / store operator

SUPER ADMIN
   ↓
Platform owner / controller
```

One project, one website, different paths:

```text
Customer      → /
Admin         → /admin
Super Admin   → /super-admin
```

## 1.2 Main technology stack

- Next.js (App Router)
- TypeScript
- PostgreSQL
- Drizzle ORM
- Better Auth
- Cashfree Payment Gateway
- Cashfree Payouts / approved manual payment workflow
- Resend
- Cloudinary / GCS
- Tailwind CSS
- shadcn/ui

## 1.3 Main business model

- Single-tenant ecommerce platform.
- Super Admin owns and controls platform.
- Admins are internal sellers/store operators.
- Customers buy products online.
- Customer payment goes to Super Admin's Cashfree Payment Gateway account.
- Admin does not own a Cashfree merchant account.
- Admin does not directly receive customer payment.
- Admin cannot directly withdraw money.
- Admin can request payout.
- Super Admin manually processes Admin payment and records proof/reference/time/status.
- Admin sees earnings and settlement history.
- Super Admin earns the configured **Commission** from Admin sales.
- **Payment Gateway Fee** is configured by Super Admin and shown to Admin as a deduction.
- **Refund Adjustment** may reduce Admin payable revenue when applicable.
- COD is disabled.
- Offline Purchase / Draft Order is removed from the project.
- There is no Cashfree Easy Split in the current plan.
- Admin UI is controlled by Roles & Permissions.
- Super Admin can enter an Admin dashboard using controlled Admin Access / Impersonation, after recording a reason/notification, and all actions must be audited.

---

# 2. Core Roles

## 2.1 Customer

Customer is the buyer.

Customer can:

- Browse products
- Search products
- Filter and sort products
- View product details
- Add products to cart
- Manage wishlist
- Checkout
- Pay online through Cashfree
- View own orders
- Track orders
- Cancel/return/refund when eligible
- View invoice
- Write reviews
- Receive notifications
- Contact support
- Manage profile and addresses
- Request account deletion

Customer must only access their own account and their own orders.

---

## 2.2 Admin

Admin is an **internal seller/store operator**.

Admin can:

- Manage assigned products
- Manage assigned inventory
- Manage online orders related to assigned products
- Manage reviews for assigned products
- View sales and analytics
- View earnings
- View deductions
- View Net Payable
- Request payout
- View payout/settlement status
- View payment proof/reference after Super Admin marks payment as paid
- Use support
- View their recent activity
- Request account deletion

Admin cannot:

- Create a Cashfree merchant account
- Receive customer payments directly
- Withdraw money directly
- Execute payout directly
- Change Commission
- Change Payment Gateway Fee
- Access other Admin data unless explicitly granted by platform permissions/access
- Create offline orders
- Create draft orders

---

## 2.3 Super Admin

Super Admin is the **platform owner/controller**.

Super Admin does not work as a daily seller.

Super Admin can:

- Create and manage Admin accounts
- Send Admin account setup email
- Manage Admin status
- Create roles
- Create/manage permissions
- Assign roles/permissions to Admins
- Control which Admin UI/modules are visible
- Enter Admin page using controlled Admin Access / Impersonation
- Edit/update Admin-side data with elevated authority when needed
- Manage Commission
- Manage Payment Gateway Fee
- Review Admin payout requests
- Manually pay Admin
- Record payment proof, reference, date/time, and status
- Manage platform finance
- Review platform-wide analytics
- Manage platform payment configuration
- Manage platform settings
- Manage refunds/disputes/exceptions
- Manage account recovery/deletion approvals
- View audit/activity logs
- Manage platform content/notifications

Super Admin should not be designed as a normal seller operator.

---

# 3. Route Architecture

```text
src/app/
│
├── (customer)/
│   └── ...
│
├── admin/
│   └── ...
│
├── super-admin/
│   └── ...
│
└── api/
    ├── customer/
    ├── admin/
    ├── super-admin/
    └── webhooks/
        └── cashfree/
```

The `(customer)` route group is organizational only, so:

```text
src/app/(customer)/page.tsx → /
src/app/(customer)/products → /products
```

There is no `/customer` URL.

---

# 4. Customer Frontend Pages / Modules

## 4.1 Home

Route:

```text
/
```

Shows:

- Header
- Search
- Categories
- Banners
- Collections
- Offers
- Featured/new/trending products
- Product suggestions
- Footer

## 4.2 Authentication

Routes:

```text
/login
/register
/forgot-password
/reset-password
/verify
```

Functions:

- Login
- Register
- Logout
- Session
- Password reset
- Verification

## 4.3 Product Discovery

Routes:

```text
/products
/categories/[slug]
/collections/[slug]
/search
```

Functions:

- Browse products
- Categories
- Brands
- Filters
- Sorting
- Pagination
- Search suggestions
- Related products

## 4.4 Product Details

Route:

```text
/products/[slug]
```

Shows:

- Product info
- Images
- Variants
- Price
- Availability
- Seller information
- Reviews
- Related products
- Add to cart
- Wishlist

## 4.5 Wishlist

Route:

```text
/account/wishlist
```

Functions:

- Add
- Remove
- View
- Move to cart

## 4.6 Cart

Route:

```text
/cart
```

Functions:

- Add item
- Update quantity
- Remove item
- Show subtotal
- Validate stock/price server-side
- Start checkout

## 4.7 Checkout

Route:

```text
/checkout
```

Functions:

- Customer details
- Address
- Shipping
- Coupon
- Order summary
- Final amount
- Start payment

## 4.8 Payment

Routes:

```text
/payment
/payment/success
/payment/failed
```

Rules:

- Cashfree Payment Gateway only for online customer payment
- COD disabled
- Backend verifies payment
- Frontend payment success is not the final authority

## 4.9 Orders

Routes:

```text
/orders
/orders/[id]
```

Customer can:

- View order
- View items
- See payment status
- Track shipment
- Cancel when eligible
- Return when eligible
- View refund status
- View invoice

## 4.10 Reviews

Customer can:

- View reviews
- Write review
- Upload review image
- Edit/delete review when allowed

Backend should verify purchase eligibility.

## 4.11 Notifications

Shows:

- Order updates
- Payment updates
- Shipping updates
- Delivery updates
- Refund updates
- Promotional/system notifications

## 4.12 Support

Routes/pages:

```text
/contact
/account/support
```

Functions:

- Contact message
- Support ticket
- Support messages
- FAQ/help

## 4.13 Account

Route:

```text
/account
```

Contains:

- Profile
- Addresses
- Wishlist
- Orders
- Notifications
- Security
- Delete account

## 4.14 Content / CMS pages

Examples:

```text
/about
/faq
/terms
/privacy-policy
/shipping-policy
/return-policy
```

---

# 5. Customer Backend Modules

```text
modules/
├── auth/
├── customer/
├── catalog/
├── categories/
├── brands/
├── search/
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
└── analytics/
```

## Customer request pattern

```text
Customer UI
   ↓
Next.js API
   ↓
Authentication / Authorization
   ↓
Business Service
   ↓
Drizzle ORM
   ↓
PostgreSQL
```

## Customer purchase flow

```text
Customer enters website
        ↓
Home / Discovery
        ↓
Search / Browse
        ↓
Product Details
        ↓
Cart
        ↓
Checkout
        ↓
Address / Shipping
        ↓
Coupon / Final Price
        ↓
Create Order
        ↓
Cashfree Payment Gateway
        ↓
Payment Webhook / Verification
        ↓
Order = PAID / CONFIRMED
        ↓
Processing
        ↓
Shipped
        ↓
Out for Delivery
        ↓
Delivered
        ↓
Track / Invoice / Return / Refund / Review
```

---

# 6. Admin Frontend Pages / Modules

Admin route:

```text
/admin
```

The Admin UI is **permission-driven**.

## 6.1 Dashboard

Shows:

- Sales summary
- Recent orders
- Product summary
- Inventory alerts
- Earnings summary
- Quick actions
- Notifications

## 6.2 Products

Functions:

- View assigned products
- Add product
- Edit product
- Delete product
- Manage variants
- Manage images
- Set price/availability

## 6.3 Inventory

Functions:

- Update stock
- Stock history
- Low-stock alerts
- Variant stock
- Inventory status

## 6.4 Orders

Only **online orders**.

Functions:

- View assigned online orders
- View order details
- Update allowed order status
- Shipping/fulfillment
- Handle eligible cancellation/returns/refunds according to permission

**NO offline purchase module.**

**NO draft order module.**

## 6.5 Reviews

Functions:

- View reviews for assigned products
- Respond
- Moderate if permitted

## 6.6 Analytics

Shows Admin-only data:

- Sales
- Orders
- Product performance
- Revenue
- Product performance
- Reports

## 6.7 Earnings & Payments

Admin is view/request only for money.

Show:

```text
Gross Product Sales
- Commission
- Payment Gateway Fee
- Refund Adjustment
= Net Payable
```

Definitions:

### Commission

The configured amount retained by Super Admin from Admin sales.

### Payment Gateway Fee

Payment processing cost configured/updated by Super Admin; Admin can only view it.

### Refund Adjustment

Amount deducted when a refund affects the Admin's revenue.

### Net Payable

The amount the Admin is currently eligible to request as payout.

Admin cannot edit any of these deduction rules.

## 6.8 Payout Request

Admin can:

- View eligible amount
- Submit payout request
- Add optional note
- View request status
- View settlement history

Admin cannot:

- Withdraw directly
- Execute payout
- Mark payout paid

## 6.9 Notifications

Shows:

- Order updates
- Payment updates
- Payout updates
- System notifications

## 6.10 Support

- Support tickets
- Messages
- Contact platform support

## 6.11 Activity Logs

Admin can see own recent activity:

- Product changes
- Inventory changes
- Order changes
- Review actions
- Profile changes
- Payout requests

## 6.12 Account

Functions:

- Profile
- Password/security
- Settings
- Request account deletion
- Request recovery after deletion

---

# 7. Admin Backend Modules

```text
modules/admin/
├── admin-account/
├── admin-management/
├── admin-revenue/
├── payout-requests/
├── admin-recovery/
└── admin-activity/
```

Shared business modules used by Admin:

```text
modules/
├── catalog/
├── inventory/
├── orders/
├── reviews/
├── analytics/
├── notifications/
├── support/
├── media/
└── payments/
```

## Admin business flow

```text
Admin Login
     ↓
Authentication
     ↓
Role / Permission Check
     ↓
Admin Dashboard
     ↓
Products
     ↓
Inventory
     ↓
Online Orders
     ↓
Reviews
     ↓
Analytics
     ↓
Earnings
     ↓
Payout Request
     ↓
Super Admin Review
     ↓
Super Admin Payment
     ↓
Payment Proof + Reference + Time
     ↓
Admin sees PAID status
```

---

# 8. Admin Payment / Earnings Rules

## 8.1 Customer payment

```text
Customer
  ↓
Cashfree Payment Gateway
  ↓
Super Admin Cashfree merchant account
```

Admin does NOT receive this customer payment directly.

## 8.2 Earnings calculation

```text
Gross Product Sales
- Commission
- Payment Gateway Fee
- Refund Adjustment
= Net Payable
```

## 8.3 Payout process

```text
Admin requests payout
        ↓
Payout Request = PENDING
        ↓
Super Admin reviews
        ↓
Super Admin pays Admin
        ↓
Record amount/reference/method/date/time/proof
        ↓
Status = PAID
        ↓
Admin sees settlement
```

## 8.4 Admin payout statuses

Recommended business statuses:

```text
PENDING
UNDER_REVIEW
APPROVED
PAID
REJECTED
FAILED
CANCELLED
```

---

# 9. Super Admin Frontend Pages / Modules

Route:

```text
/super-admin
```

Super Admin is a **platform-control panel**, not a seller dashboard.

## 9.1 Dashboard

Shows:

- Total Admins
- Active Admins
- Pending Admin actions
- Platform sales
- Commission revenue
- Payment Gateway Fee information
- Pending payout requests
- Paid settlements
- Refunds
- Recent activity

## 9.2 Admin Management

This is the main Admin lifecycle area.

Functions:

- Admin list
- Add Admin
- Create Admin
- Edit Admin
- Activate
- Suspend
- Block
- View details
- Send account setup email
- View status

There is no public Admin registration.

## 9.3 Roles & Permissions

Super Admin controls:

- Roles
- Permissions
- Assign roles
- Assign permissions
- Admin access
- UI module visibility

### RBAC flow

```text
Super Admin
    ↓
Role
    ↓
Permissions
    ↓
Admin
    ↓
Effective Permissions
    ↓
Admin UI
```

Frontend:

- Hide modules not granted.

Backend:

- Enforce the same permissions on every protected API.

Never rely on UI hiding for security.

## 9.4 Admin Access / Impersonation

Super Admin can enter an Admin dashboard with elevated authority.

Flow:

```text
Select Admin
   ↓
Record reason / send notification
   ↓
Start temporary access session
   ↓
Enter /admin experience
   ↓
View/Edit/Update as authorized
   ↓
Exit
   ↓
Audit log
```

Every action must preserve the real actor:

```text
actor = Super Admin
acting_on_behalf_of = Admin
access_mode = IMPERSONATION
```

The Admin page should visibly indicate Super Admin mode.

## 9.5 Platform Finance

Shows:

- Platform revenue
- Commission revenue
- Payment Gateway Fee settings/info
- Refund adjustments
- Available platform balance
- Withdrawal history

## 9.6 Commission Management

Super Admin controls commission.

Use the term:

```text
Commission
```

Do NOT use:

```text
Platform Fee
Market Fee
Marketing Fee
Approved Fee
```

## 9.7 Admin Payout Management

Super Admin can:

- View pending requests
- Review Admin earnings
- Approve/reject request
- View payout destination
- Manually pay Admin
- Record payment reference
- Upload proof
- Record date/time
- Mark PAID
- View payout history

## 9.8 Payment Gateway Settings

Super Admin controls:

- Cashfree Payment Gateway settings
- Payment provider configuration
- Payment Gateway Fee rule/configuration
- Webhook monitoring
- Reconciliation

## 9.9 Analytics / Reports

Platform-wide:

- Sales
- Revenue
- Commission
- Admin performance
- Products
- Orders
- Payments
- Payouts
- Refunds

## 9.10 Platform Settings

- Payment settings
- Commission settings
- Payment Gateway Fee settings
- Shipping
- Tax
- Notifications
- Security
- Platform configuration

## 9.11 Activity Logs / Audit

Super Admin can see:

- Admin actions
- Super Admin actions
- Impersonation history
- Role/permission changes
- Payment actions
- Payout actions
- Refund actions
- Settings changes
- Security events

## 9.12 Notifications

- Admin notifications
- Payment alerts
- Payout alerts
- System alerts
- Announcements

## 9.13 Platform Content / CMS

- Homepage
- Banners
- Collections
- FAQ
- Policies
- Announcements

## 9.14 Admin Account Recovery

Deletion approval and recovery approval.

---

# 10. Super Admin Backend Modules

```text
modules/super-admin/
├── admin-management/
├── roles-permissions/
├── admin-access/
├── platform-finance/
├── commission/
├── payout-management/
├── platform-settings/
└── admin-recovery/
```

Shared modules:

```text
modules/
├── orders/
├── products/catalog/
├── payments/
├── refunds/
├── analytics/
├── notifications/
├── support/
├── cms/
└── audit/
```

---

# 11. Super Admin Admin-Access / Impersonation Rules

Super Admin can enter Admin page, but this is controlled access.

Flow:

```text
Super Admin
   ↓
Select Admin
   ↓
Send reason/notification
   ↓
Create temporary access session
   ↓
Admin page
   ↓
View/Edit/Update
   ↓
Every action → audit_logs
   ↓
Exit session
```

Do not use the Admin's password.

Do not make the action appear as if Admin performed it.

---

# 12. Account Deletion and Recovery

## Admin deletion

```text
Admin
 ↓
Request deletion
 ↓
Verify account
 ↓
Pending Super Admin approval
 ↓
Super Admin approves
 ↓
Admin becomes inactive
 ↓
Products are hidden from customer website
 ↓
Required history retained
 ↓
Data archived
```

Recovery:

```text
Admin
 ↓
Recovery request
 ↓
Super Admin approval
 ↓
Restore archive
 ↓
Reactivate
```

If recovery is not approved:

```text
Fresh Admin account
```

Do not destroy required order/financial history blindly.

---

# 13. Payment Architecture — Current Source of Truth

## Customer collection

```text
Customer
   ↓
Checkout
   ↓
Cashfree Payment Gateway
   ↓
Super Admin Cashfree merchant account
   ↓
Payment webhook
   ↓
Backend verification
   ↓
Order = PAID
```

## Admin earnings

```text
Order / Sales
   ↓
Gross Product Sales
   ↓
- Commission
- Payment Gateway Fee
- Refund Adjustment
   ↓
Net Payable
```

## Admin payout

```text
Admin
   ↓
Payout Request
   ↓
Super Admin Review
   ↓
Manual Payment
   ↓
Payment Reference
+ Proof
+ Date/Time
+ Method
   ↓
Status = PAID
   ↓
Admin sees settlement
```

## Current payment rules

- Cashfree Payment Gateway for customer collection.
- Cashfree Payouts may be used by Super Admin for Admin payment, but Admin has no direct payout control.
- No Cashfree Easy Split.
- No COD.
- No Admin Cashfree merchant account.
- No direct Admin withdrawal.
- No offline purchase.
- No draft orders.
- No Platform Fee wording.
- No Market Fee wording.
- No Marketing Fee wording.
- Commission is the Super Admin revenue.
- Payment Gateway Fee is a configurable deduction controlled by Super Admin.

---

# 14. Customer Data Flow (Level 1)

```text
Customer
  ↓
Home / Discovery
  ↓
Search / Browse
  ↓
Product Details
  ↓
Cart
  ↓
Checkout
  ↓
Address / Shipping
  ↓
Coupon / Pricing
  ↓
Create Order
  ↓
Cashfree Payment
  ↓
Payment Verification
  ↓
Order Confirmed
  ↓
Processing
  ↓
Shipped
  ↓
Out for Delivery
  ↓
Delivered
  ↓
Track / Invoice / Return / Refund / Review
```

---

# 15. Admin Data Flow (Level 1)

```text
Admin
  ↓
Login
  ↓
Dashboard
  ↓
Products
  ↓
Inventory
  ↓
Online Orders
  ↓
Reviews
  ↓
Analytics
  ↓
Earnings
  ↓
Request Payout
  ↓
Super Admin Review
  ↓
Super Admin Payment
  ↓
Payment Proof / Reference / Time
  ↓
Admin sees PAID Settlement
```

---

# 16. Super Admin Data Flow (Level 1)

```text
Super Admin
  ↓
Login
  ↓
Dashboard
  ↓
Admin Management
  ↓
Roles & Permissions
  ↓
Admin Access / Impersonation
  ↓
Platform Finance
  ↓
Commission
  ↓
Admin Payout Requests
  ↓
Manual Admin Payment
  ↓
Analytics / Reports
  ↓
Platform Settings
  ↓
Audit Logs / Recovery
```

---

# 17. DFD Level Definitions

## Level 0

Whole system context.

```text
Customer / Admin / Super Admin
          ↓
   Ecommerce Platform
          ↓
Cashfree / Email / Media
```

Purpose: explain the platform at the highest business level.

## Level 1

Main business modules and journey.

Purpose: Product Manager, HR, business stakeholders, high-level technical planning.

## Level 2

Break one Level-1 module into major internal processes.

Examples:

- Customer Checkout & Payment
- Admin Earnings & Payout Request
- Super Admin Admin Management

## Level 3

Deep implementation/process detail.

Examples:

- Payment webhook verification
- Payout validation and manual payment record
- Role/permission evaluation
- Account deletion/recovery steps

Do not make Level 3 an entire-system overview. Level 3 should be a focused decomposition of one Level-2 process.

---

# 18. Core Authorization Architecture

All roles use the same auth foundation.

```text
Login
 ↓
Session
 ↓
User
 ↓
Role(s)
 ↓
Permission(s)
 ↓
Effective Permissions
 ↓
UI visibility
 ↓
Backend authorization
```

The frontend can hide unavailable modules, but the backend must enforce permissions.

Example:

```text
products.view
products.create
products.update
products.delete
inventory.view
inventory.update
orders.view
orders.update
payouts.view
payouts.request
```

Admin-specific permissions determine which modules are visible and which operations are allowed.

---

# 19. Suggested Core Data Model

The exact PostgreSQL schema is a separate implementation artifact, but these domains are expected.

## Identity / Access

```text
users
admins
roles
permissions
user_roles
role_permissions
user_permissions (optional if individual overrides are required)
```

## Catalog

```text
products
categories
brands
product_categories
product_images
product_variants
```

## Customer

```text
addresses
wishlists
wishlist_items
notifications
search_history
account_verifications
account_deletion_requests
```

## Shopping

```text
carts
cart_items
coupons
coupon_usages
```

## Orders

```text
orders
order_items
returns
return_items
refunds
invoices
```

## Payments

```text
payments
payment_attempts
cashfree_webhook_events
```

## Admin Revenue / Payout

```text
admin_revenue
admin_bank_accounts
payout_beneficiaries
payout_requests
admin_payouts
```

## Support / Content

```text
contact_messages
support_tickets
support_messages
pages
page_sections
faqs
banners
collections
collection_products
```

## Audit / Platform

```text
audit_logs
admin_access_sessions
platform_withdrawals
commission_rules
settings
```

---

# 20. Important Architecture Rules

## Rule 1 — Never trust browser values

Never trust frontend values for:

- Price
- Stock
- Discount
- Coupon result
- Payment status
- Order ownership
- Admin permissions
- Payout status

Backend validates everything important.

## Rule 2 — Customer isolation

Customer can only access their own:

- Profile
- Addresses
- Cart
- Wishlist
- Orders
- Notifications
- Support data

## Rule 3 — Admin isolation

Admin can only manage:

- Assigned products
- Assigned inventory
- Related orders
- Related reviews
- Own earnings/payout data

## Rule 4 — Super Admin authority

Super Admin has platform-level authority, but every privileged action must be auditable.

## Rule 5 — Shared business logic

Do not duplicate product/order/payment logic inside customer/admin/super-admin folders.

Use shared modules.

```text
Customer UI ──┐
Admin UI ──────┼──→ Shared Business Modules
Super Admin UI ┘
```

## Rule 6 — Page vs business logic

```text
app/        = routes/pages
modules/    = business logic
components/ = UI
lib/        = infrastructure
 db/        = PostgreSQL + Drizzle
validators/ = request/input validation
```

## Rule 7 — Payment authority

Customer browser is never the authority for payment success.

Cashfree webhook + backend verification control payment status.

## Rule 8 — Audit privileged actions

Especially:

- Role/permission changes
- Super Admin access to Admin page
- Commission changes
- Payment Gateway Fee changes
- Payout approval
- Manual Admin payment
- Refund actions
- Account deletion/recovery
- Platform settings changes

---

# 21. Coding Guidance for Codex

Before changing code:

1. Read this file.
2. Check the relevant module and route.
3. Reuse shared business logic before creating new services.
4. Follow the current role/permission model.
5. Preserve the payment architecture.
6. Preserve the no-offline-order rule.
7. Preserve the Admin payout-request-only rule.
8. Preserve Super Admin audit requirements.
9. Preserve server-side validation.
10. Do not silently reintroduce removed/old architecture.

When implementing a new feature, explain where it belongs:

```text
Page / Route
→ UI Component
→ API Route
→ Module / Service
→ Validation
→ Database
→ External Service (if required)
```

---

# 22. Feature Ownership Summary

| Feature | Customer | Admin | Super Admin |
|---|---|---|---|
| Browse products | View | Manage assigned | Oversight |
| Product management | — | Assigned products | Platform oversight |
| Inventory | View availability | Manage assigned | Oversight |
| Online orders | Own orders | Assigned orders | All/platform oversight |
| Offline orders | — | **No** | **No** |
| Reviews | Create/view own | Manage assigned reviews | Oversight |
| Cart | Own cart | — | — |
| Checkout | Use | — | — |
| Customer payment | Pay | View-related payment info | Owns payment gateway |
| Admin earnings | — | View | Manage rules/oversight |
| Commission | — | View deduction | Configure / receives |
| Payment Gateway Fee | — | View deduction | Configure |
| Admin payout | — | Request | Approve/process/pay |
| Direct Admin withdrawal | — | **No** | Controlled platform process |
| Admin roles/permissions | — | View own effective access | Manage |
| Admin dashboard access | Own customer area | Own Admin area | Can enter as Super Admin access |
| Account deletion | Own request | Request own deletion | Approve/reject/recover |
| Activity logs | Own relevant history | Own activity | Platform-wide audit |
| Platform settings | — | Limited own settings | Manage |
| Platform finance | — | — | Manage |

---

# 23. Non-Negotiable Current Decisions

These decisions are currently locked unless the project owner explicitly changes them:

```text
1. Single-tenant ecommerce.
2. One Super Admin platform owner.
3. Admins are internal sellers.
4. Customer storefront = /
5. Admin = /admin
6. Super Admin = /super-admin
7. No marketplace tenant architecture.
8. No offline purchase module.
9. No draft order module.
10. COD disabled.
11. Online customer payment only.
12. Cashfree Payment Gateway for customer collection.
13. No Cashfree Easy Split.
14. Admin does not own a Cashfree merchant account.
15. Admin cannot directly withdraw.
16. Admin can request payout only.
17. Super Admin manually pays Admin and records proof/reference/time/status.
18. Commission is Super Admin revenue.
19. Payment Gateway Fee is configured by Super Admin and shown to Admin.
20. Refund Adjustment can reduce Admin Net Payable.
21. Admin UI is controlled by Roles & Permissions.
22. Backend API permissions are mandatory.
23. Super Admin can enter Admin page with controlled access/impersonation.
24. Impersonation actions are audit logged.
25. Admin deletion requires verification + Super Admin approval.
26. Deleted Admin public products are hidden.
27. Deleted Admin data is archived for controlled recovery.
28. Recovery requires Super Admin approval.
```

---

# 24. Recommended Implementation Order

```text
Phase 1
Project setup
↓
PostgreSQL + Drizzle
↓
Auth foundation
↓
Roles + Permissions

Phase 2
Customer
→ Catalog
→ Search
→ Cart
→ Checkout
→ Cashfree Payment
→ Orders

Phase 3
Admin
→ Products
→ Inventory
→ Orders
→ Reviews
→ Analytics
→ Earnings
→ Payout Requests

Phase 4
Super Admin
→ Admin Management
→ Roles & Permissions
→ Admin Access
→ Commission
→ Payment Gateway Fee
→ Payout Management
→ Platform Finance
→ Audit

Phase 5
Account deletion/recovery
Notifications
Support
CMS
Analytics refinement
Testing
Security review
Deployment
```

---

# 25. Quick Project Mental Model

```text
                    ECOMMERCE PLATFORM
                           │
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
      CUSTOMER           ADMIN         SUPER ADMIN
          │                │                │
          │                │                │
       BUYERS        INTERNAL SELLER    PLATFORM OWNER
          │                │                │
          └────────────────┼────────────────┘
                           ↓
                  SHARED BUSINESS LOGIC
                           ↓
                    POSTGRESQL / DRIZZLE
```

Payment:

```text
Customer
   ↓
Cashfree Payment Gateway
   ↓
Super Admin Cashfree Account
   ↓
Backend
   ↓
Commission + Gateway Fee + Refund Adjustment
   ↓
Admin Net Payable
   ↓
Admin Payout Request
   ↓
Super Admin Manual Payment
   ↓
Admin Settlement History
```

Authorization:

```text
User
 ↓
Role
 ↓
Permissions
 ↓
UI Visibility
 ↓
Backend Authorization
```

This document should remain the project's high-level source of truth while the actual implementation is built underneath it.
