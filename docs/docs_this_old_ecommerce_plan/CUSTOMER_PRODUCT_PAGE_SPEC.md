# Customer Product Page & Catalog Display Specification

> **Latest update:** 2026-09-25
>
> This document defines what the customer sees from the product data created by Admin and controlled by platform rules.

## 1. Product page route

```text
/products/[slug]
```

The page is a public SEO-focused storefront page.

## 2. Product page layout

The page should generally contain:

```text
Breadcrumbs

Image Gallery           Product Information
                         ├── Brand (if available)
                         ├── Product Name
                         ├── Rating / Review Count
                         ├── Current Price
                         ├── Compare-at Price (if valid)
                         ├── Availability
                         ├── Variant Selectors
                         ├── Quantity
                         ├── Add to Cart
                         ├── Buy Now / Checkout CTA
                         └── Wishlist

Highlights
Description
Specifications
Shipping / Return information
Reviews
Related / Suggested products
```

The exact visual layout can use shadcn/ui components and project design patterns.

## 3. Image gallery

Customer sees:

- primary image
- thumbnail gallery
- zoom/view interaction where appropriate
- variant image when a selected variant has its own image

Use `alt_text` for accessible and useful image descriptions.

## 4. Product title

Show the Admin-entered customer-facing product name.

Do not expose internal IDs unless useful for a support/admin experience.

## 5. Brand

Show brand only if the product has an applicable brand.

Do not invent brand information.

## 6. Price display

Customer sees the CURRENT effective price.

For a non-variant product:

```text
products.base_price
```

For a variant product:

```text
variant.price_override
    OR
product.base_price
```

Do not show an old cached price as the payment authority.

## 7. Old order display

A previous customer order uses the historical snapshot in `order_items`.

Example:

```text
Current product:
₹1,499

Old order:
Paid ₹1,999
```

The two values must remain different when the product price changed.

## 8. Compare-at price

If present and valid, show:

```text
₹1,499   ₹1,999
```

Do not display a fake comparison price.

The backend should validate the relationship between current and compare-at price according to the configured business rules.

## 9. Availability

The product page may show states such as:

```text
In Stock
Low Stock
Out of Stock
Unavailable
```

This is informational.

The final stock authority is the backend/database during cart/checkout operations.

## 10. Variant selection

If variants exist, the customer selects the required options.

Example:

```text
Color:
[Black] [White]

Size:
[S] [M] [L] [XL]
```

The UI should update:

- effective price
- selected image when available
- availability
- SKU only when customer-facing use is appropriate

Invalid/unavailable combinations must be disabled or rejected by the backend.

## 11. Quantity

Customer can choose quantity within server-enforced limits.

The frontend quantity selector is not the authority.

## 12. Add to Cart

Customer selects:

- variant if required
- quantity

Then:

```text
Browser
 ↓
Backend validation
 ↓
Cart
```

Never store final cart price as a trusted frontend value.

## 13. Buy Now / checkout

The customer may use a direct checkout action.

Before payment/order creation:

```text
Current product/variant
 ↓
Current price
 ↓
Current stock
 ↓
Coupon validation
 ↓
Shipping calculation
 ↓
Final server amount
```

## 14. Highlights

Show a short list of important product benefits/features.

Example:

```text
100% Cotton
Regular Fit
Machine Washable
```

Keep highlights concise.

## 15. Description

Show the full Admin-created description in a readable format.

Use headings/bullets where appropriate rather than one huge text block.

## 16. Specifications

Where available, show structured product specifications.

Example:

| Specification | Value |
|---|---|
| Material | Cotton |
| Fit | Regular |
| Sleeve | Full Sleeve |

For electronics:

| Specification | Value |
|---|---|
| RAM | 16 GB |
| Storage | 512 GB |
| Display | 15.6 inch |

Do not show empty specification rows.

## 17. Shipping / return information

The product page can show concise policy information or links to the platform's full policies.

Do not let Admin overwrite platform-wide legal policies from the product form.

## 18. Reviews

Customer can see:

- average rating
- review count
- review list
- verified-purchase indicators when the system supports them

Customers should only be allowed to submit reviews according to purchase/eligibility rules.

## 19. Related / suggested products

Suggestions may be generated from safe catalog signals such as:

- same category
- same subcategory
- same brand
- similar product attributes
- browsing behavior
- purchase behavior

Start simple. Do not build a machine-learning recommendation engine in V1.

## 20. SEO requirements

Product page should provide:

- stable SEO-friendly slug
- title
- meta description
- canonical URL
- Open Graph data
- Product structured data where applicable
- product image metadata
- crawlable HTML content
- internal links to category/subcategory

The page uses Next.js SSG/static export for public delivery.

## 21. Customer display vs internal fields

### Customer should see

- product name
- images
- current price
- valid compare-at price
- availability
- variant options
- product highlights
- description
- specifications
- reviews
- shipping/return information
- add to cart / buy action

### Customer should normally NOT see

- internal Admin user ID
- internal audit data
- commission data
- payout data
- internal inventory notes
- internal cost data
- private supplier data
- internal database IDs

## 22. Product page failure states

The page must support:

- product not found
- inactive product
- archived product
- unavailable variant
- temporary API failure
- image loading failure
- out-of-stock state

Do not show misleading purchase controls when a product is unavailable.
