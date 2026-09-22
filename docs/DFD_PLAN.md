# DFD / Data Flow Plan

## Level meanings

### Level 0

Whole platform context.

```text
Customer
Admin
Super Admin
   ↓
Ecommerce Platform
   ↓
Neon / Cashfree / R2 / Resend / Google
```

### Level 1

Whole major business journey.

Audience: Product Manager, HR, business stakeholder, developer planning.

### Level 2

One Level-1 module broken into major sub-processes.

Audience: developers.

### Level 3

One Level-2 process broken into technical internals.

Audience: backend/integration developers.

## Customer DFDs

### Customer L1

```text
Home
 ↓
Search / Browse
 ↓
Product Details
 ↓
Wishlist / Cart
 ↓
Checkout
 ↓
Payment
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
Return / Refund / Review
```

External systems:

```text
Google Auth
Cashfree
Neon
R2
Resend
```

### Customer L2 — Checkout + Payment

```text
Cart
 ↓
Validate user/session
 ↓
Validate product + stock
 ↓
Apply coupon
 ↓
Calculate server-side total
 ↓
Create order/payment attempt
 ↓
Cashfree
 ↓
Return payment context
 ↓
Webhook
 ↓
Verify payment
 ↓
Mark order paid
```

### Customer L3 — Payment Verification

Focus only on:

```text
Cashfree event
 ↓
Read raw webhook
 ↓
Verify authenticity
 ↓
Check event ID
 ↓
Check order/payment mapping
 ↓
Read provider payment status
 ↓
Update payment_attempts
 ↓
Update payments
 ↓
Update orders
 ↓
Emit notification/event
```

## Admin DFDs

### Admin L1

```text
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
Customer Management
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
Paid Settlement
```

### Admin L2 — Customer Management

```text
Customer List
 ↓
Search/Filter
 ↓
Customer Details
 ↓
Order Metrics
 ↓
Order History
 ↓
Communication Permission Check
 ↓
Send Email Message/Offer
 ↓
Audit
```

### Admin L3 — Payout Request Processing

```text
Admin earnings
 ↓
Gross Product Sales
 ↓
Commission
 ↓
Payment Gateway Fee
 ↓
Refund Adjustment
 ↓
Net Payable
 ↓
Payout Request
 ↓
Super Admin Review
 ↓
Payment
 ↓
Reference / Proof / Time
 ↓
PAID
```

## Super Admin DFDs

### Super Admin L1

```text
Login
 ↓
Dashboard
 ↓
Admin Management
 ↓
Roles/Permissions
 ↓
Customer Management
 ↓
Admin Access
 ↓
Products/Orders Oversight
 ↓
Commission
 ↓
Payout Management
 ↓
Platform Finance
 ↓
Analytics
 ↓
Audit
 ↓
Recovery
 ↓
Settings/CMS
```

### Super Admin L2 — Admin Management + Access

```text
Create Admin
 ↓
Assign Role/Permissions
 ↓
Send Setup Email
 ↓
Admin Uses /admin
 ↓
Super Admin Selects Admin
 ↓
Reason + Notification
 ↓
Temporary Access Session
 ↓
Admin Interface with Elevated Mode
```

### Super Admin L3 — Impersonation / Controlled Admin Access

```text
Select target Admin
 ↓
Check Super Admin permission
 ↓
Require reason
 ↓
Create admin_access_sessions record
 ↓
Create temporary access context
 ↓
Admin page shows SUPER ADMIN MODE
 ↓
Every mutation records actor=Super Admin
 ↓
End session
 ↓
Write audit completion event
```

## Diagram quality rule

Do not make Level 3 a wider version of Level 1.

A true Level 3 diagram must zoom into one Level 2 process.
