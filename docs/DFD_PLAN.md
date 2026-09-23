# DFD Plan — Current Platform

## Level 0

Actors:

```text
Customer
Admin
Super Admin
```

External systems:

```text
Google OAuth
Cashfree
Resend
Cloudflare R2
Aiven PostgreSQL
```

Main platform:

```text
Ecommerce API + Storefront
```

## Customer DFD

### Level 1

```text
Home
→ Categories
→ Subcategories
→ Search
→ Product
→ Cart
→ Checkout
→ Cashfree
→ Confirmed Order
→ Processing
→ Shipped
→ Delivered
→ Review/Return/Refund
```

No Collection process.

### Level 2

Checkout + payment:

```text
Cart
→ Server price/stock validation
→ Pending order snapshot
→ Cashfree payment
→ Webhook
→ Payment verification
→ Order PAID
```

### Level 3

Payment verification:

```text
Webhook received
→ signature verification
→ idempotency check
→ provider/order amount validation
→ transaction update
→ audit/webhook record
```

## Admin DFD

### Level 1

```text
Login
→ Dashboard
→ Products
→ Category/Subcategory
→ Inventory
→ Orders
→ Customers
→ Reviews
→ Analytics
→ Earnings
→ Payout Request
```

### Level 2

Customer management or earnings/payout.

### Level 3

Payout processing or customer email-message authorization.

## Super Admin DFD

### Level 1

```text
Login
→ Dashboard
→ Admin Management
→ Roles/Permissions
→ Customer Management
→ Admin Access
→ Products/Categories Oversight
→ Orders
→ Finance
→ Payouts
→ Refunds
→ Audit
→ Content
→ Recovery
```

### Level 2

Admin management + roles + access.

### Level 3

Impersonation/access-session creation and audit trail.

## DFD rule

Level 3 must be a focused zoom-in of one Level 2 process. Never turn Level 3 into a full-system diagram.
