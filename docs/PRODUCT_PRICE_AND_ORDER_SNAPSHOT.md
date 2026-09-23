# Product Price and Historical Order Snapshot Rules

## Problem this solves

A product price can change at any time:

```text
₹1,999 → ₹1,499
```

The old order must remain:

```text
Customer paid ₹1,999
```

The new product page can show:

```text
Current price ₹1,499
```

These are two different facts.

## 1. Two price concepts

### Current catalog price

Stored on `products` / `product_variants`.

Used for:

- Product cards
- Product details
- Search results
- Current checkout validation
- New orders

### Historical purchase price

Stored on `order_items`.

Used for:

- Order history
- Order detail
- Invoice
- Refund calculations
- Admin order records
- Customer support
- Financial reports for that sale

## 2. Never do this

```text
UPDATE products SET price = 999;

then

UPDATE order_items SET unit_price = 999;
```

This is prohibited.

## 3. Customer page behavior

### Product page

Show current product price.

### Old order page

Show stored order item price.

### Delivered order

Show stored order item price.

### Active/pending order

Show stored order item price for that order.

### Reordering

Re-check today's current product price and stock. Do not copy the old order price into the new order.

## 4. Checkout stale-price handling

Example:

```text
10:00
Customer opens product page
Price = ₹999

10:05
Admin changes current price
Price = ₹799

10:07
Customer presses Buy Now
```

Backend does:

```text
Read current product price = ₹799
Compare with submitted client price
↓
Detect stale price
↓
Return a price-changed response
↓
Refresh checkout total
↓
Customer confirms ₹799
↓
Create order snapshot at ₹799
↓
Create Cashfree payment for ₹799
```

The browser is never allowed to force ₹999.

## 5. Payment-session rule

Once a pending order/payment attempt is created:

```text
order_items.unit_price = locked
order.total_amount = locked
payment.amount = locked
```

If the payment expires/fails, do not rewrite the same order to a new price. Expire/cancel it and let the customer create a fresh checkout.

## 6. Inventory relation

Price locking and stock reservation happen in the same controlled checkout workflow.

Use a database transaction for:

```text
validate current product/variant
→ verify stock
→ create order
→ write order-item snapshots
→ reserve stock
```

Do not reserve stock based on client-side quantity without server validation.

## 7. Refund rule

Refunds are calculated from the actual order/payment facts.

Do not calculate a refund from today's product price.

## 8. Admin price update

When Admin changes a product price:

```text
Current product price changes
↓
Future checkouts use new price
↓
Existing orders remain unchanged
↓
Past invoices remain unchanged
↓
Past earnings remain based on original order values
```

## 9. SEO/static HTML interaction

Static HTML may become stale until the next build.

That does not affect payment correctness because checkout uses the backend's current price.

After a public product/category change, the system may trigger a Cloudflare Pages rebuild so the SEO HTML catches up.

## 10. Test cases

The test suite must include:

1. Price changed before checkout.
2. Price changed while checkout page is open.
3. Price changed after Pending Order creation.
4. Payment succeeds after a price change in the catalog.
5. Old paid order remains unchanged.
6. Delivered order remains unchanged.
7. Refund uses historical amount.
8. Reorder uses current amount.
9. Two customers buy the same product before/after a price update.
10. Concurrent checkout cannot oversell stock.
