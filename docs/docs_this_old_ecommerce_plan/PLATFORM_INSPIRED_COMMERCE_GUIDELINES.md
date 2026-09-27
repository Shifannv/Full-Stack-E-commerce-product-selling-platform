# Platform-Inspired Commerce Guidelines — 2026-09-24

## Purpose

This document converts useful, publicly documented practices from Shopify, Amazon, and Airbnb into **project requirements and design principles** for this ecommerce platform.

IMPORTANT:

- Do not copy their Terms of Service, Privacy Policy, community rules, copyrighted wording, branding, or proprietary business logic.
- These platforms are reference sources only.
- Our legal policies must be written for this business, its market, and its actual practices.
- Legal/compliance text should be reviewed by an appropriate legal professional before production launch.

This document is primarily an **engineering/product guideline**, not legal advice.

---

# 1. Shopify-inspired commerce practices

Shopify's current help documentation emphasizes that a merchant's refund policy should be current, accurate, public-facing, and easy to access. It also supports separate policies such as return, privacy, terms of service, and shipping, and encourages making them visible in store navigation/footer.

### Project requirements derived from that principle

Our storefront should have clear public policy pages:

```text
/privacy-policy
/terms
/shipping-policy
/return-policy
/refund-policy
```

The project may combine or split pages depending on the final legal/business policy, but the customer must be able to find the relevant rule before and after checkout.

Policies should explain, where applicable:

- return eligibility
- return window
- who pays return shipping
- refund method
- expected refund timing
- shipping regions
- shipping charges
- order cancellation rules
- customer support contact
- privacy/data handling

Do not hide important purchase conditions in inaccessible UI.

### Product and variant management

Shopify's current product/variant workflow allows variant-specific pricing, inventory, images, and shipping details and supports bulk editing.

Project requirement:

- Product variants must have clear identity.
- Price/inventory changes must be explicit.
- Variant inventory is managed at the variant level when applicable.
- Admin UI should make current price and current stock obvious.
- Bulk editing can be added only when there is a real operational need.

### Analytics principle

Shopify's commerce analytics model treats sales, orders, customers, inventory, payments, and profitability as separate measurable datasets.

Project requirement:

Keep analytics queries domain-aware instead of mixing all data into one giant dashboard query.

Examples:

```text
sales metrics
order metrics
customer metrics
inventory metrics
payment metrics
Admin revenue metrics
```

Use pagination, indexes, and bounded reporting windows.

---

# 2. Amazon-inspired commerce practices

Amazon's publicly documented seller/community materials emphasize accurate product-detail information, controlled product listing changes, and authentic customer reviews. Amazon also distinguishes product reviews from seller feedback and has policies against review manipulation.

### Product detail accuracy

Project requirement:

Admin product information must be accurate and should not intentionally mislead customers.

The UI should support structured fields for:

- product name
- SKU
- category/subcategory
- variant
- images
- specifications
- price
- availability
- shipping information
- return information where relevant

Do not allow a generic free-text description to become the only source of critical product facts.

### Historical price/order accuracy

Project rule:

```text
products.current_price
        !=
order_items.unit_price_snapshot
```

Changing the current product price must never rewrite historical orders.

This project requirement is independent of any one platform's implementation and is a core accounting/order-integrity rule.

### Price transparency

When showing promotional/reference pricing, do not create fake savings or misleading reference prices.

Promotions should have:

- clear eligibility
- clear start/end time where applicable
- clear discount calculation
- clear final payable amount

The checkout total must be server-calculated.

### Review authenticity

Project requirement:

- Reviews must represent a customer's product experience.
- Do not reward or pressure customers to create positive reviews.
- Do not require a positive rating in exchange for a benefit.
- Do not delete legitimate negative reviews merely because they are negative.
- Provide reporting/moderation for policy violations.
- Keep an audit trail for moderation actions.

Recommended project rule:

```text
Only customers with an eligible completed/received order can create a product review.
```

The application can optionally label such reviews as a verified purchase.

### Review content scope

Reviews should focus on the product, not unrelated seller/service disputes.

Order/shipping problems should use:

```text
Support / Order issue
```

instead of forcing them into product reviews.

---

# 3. Airbnb-inspired trust and policy structure

Airbnb is not an ecommerce store, so its product model is different. The useful ideas for this project are the **layered policy model, trust, authentic reviews, user communication, dispute handling, and clear rules around user-generated content**.

Airbnb currently references separate Terms, Payments Terms, Reviews Policy, Community Standards, Content Policy, and other supplemental policies rather than putting every rule into one giant paragraph.

### Project requirement: layered policies

Use separate policy domains rather than one massive Terms page:

```text
Terms of Service
Privacy Policy
Shipping Policy
Return Policy
Refund Policy
Payment Policy / payment information
Review Policy
Content / Community Guidelines
```

Only create pages that correspond to real features.

### Review/dispute principle

The project should provide:

```text
Customer submits review
        ↓
Validation/moderation rules
        ↓
Publish
        ↓
Report/dispute path if violation is claimed
```

Do not silently delete reviews because an Admin dislikes them.

### Promotional offer principle

Promotions/coupons should have explicit rules for:

- eligibility
- validity period
- usage limit
- product/category restrictions
- minimum order amount if applicable
- stacking rules
- refund/cancellation treatment

The final checkout should show the actual discount applied.

### Customer support/dispute principle

Orders should have a clear issue path:

```text
Order
  ↓
Issue / Return / Refund / Support
  ↓
Case/ticket
  ↓
Status history
  ↓
Resolution
```

Money-related decisions must have an audit trail.

---

# 4. Shared project guidelines derived from all three sources

## Product truth

Use structured, accurate product information.

## Policy visibility

Important purchasing rules must be easy to find.

## Historical integrity

Orders preserve what was true at the time of purchase.

## Review trust

Reviews are authentic user-generated content and must not be manipulated.

## Communication transparency

Marketing/customer messages must have clear purpose and respect communication preferences.

## Auditability

Admin/Super Admin changes affecting products, prices, refunds, payouts, permissions, and customer communication should be auditable.

## Customer support

Customers need a clear support/contact path.

## Dispute handling

Returns, refunds, payment disputes, and support issues must have status and history rather than being a single boolean field.

## Data minimization

Collect only data required for the ecommerce function and protect customer information.

---

# 5. Project-specific policies to implement

The current ecommerce project should support these policy/configuration areas:

```text
Privacy Policy
Terms of Service
Shipping Policy
Return Policy
Refund Policy
Review Policy
Content / Communication Guidelines
Cookie / consent behavior where applicable
```

The actual legal text is a separate business/legal deliverable.

Never copy Shopify/Amazon/Airbnb legal documents into this project.

---

# 6. Engineering checklist

Before shipping a customer feature, ask:

```text
[ ] Is the customer rule visible?
[ ] Is the rule enforced on the backend?
[ ] Is money calculated server-side?
[ ] Is historical data preserved?
[ ] Is customer data protected?
[ ] Is the action auditable if privileged?
[ ] Is there a support/dispute path when appropriate?
[ ] Are reviews protected from manipulation?
```

---

# 7. Sources studied

Shopify — Consumer protection / refund policy requirements:
https://help.shopify.com/en/manual/compliance/legal/consumer-protection

Shopify — Store policies:
https://help.shopify.com/en/manual/checkout-settings/refund-privacy-tos

Shopify — Product/variant editing:
https://help.shopify.com/en/manual/products/variants/edit-variants

Shopify — Commerce analytics / ShopifyQL:
https://shopify.dev/docs/api/shopifyql/latest

Amazon — Customer product review guidance and policy discussions:
https://sellercentral.amazon.in/seller-forums/discussions/t/d46e163e-6ecd-48f6-b7f3-125c38c6e37d

Amazon — Detail page information guidance:
https://sellercentral.amazon.in/seller-forums/discussions/t/aa997e7a-9d33-4d67-9ff6-d869476ebc90

Amazon — Reference pricing update:
https://sellercentral.amazon.in/seller-forums/discussions/t/f48a1fe5-aa8e-4806-b687-2d9aeec5c351

Amazon.in Privacy Notice:
https://blueprints.amazon.in/help/terms?page=privacy-notice

Airbnb — Reviews Policy:
https://www.airbnb.com/help/article/2673

Airbnb — Reviews for homes:
https://www.airbnb.com/help/article/13

Airbnb — Payments Terms:
https://www.airbnb.com/help/article/2909

Airbnb — Terms of Service (current referenced legal framework may vary by region):
https://assets.airbnb.com/help/June_2025_Terms_of_Service_for_Users_Outside_of_the_EEA_UK_and_Australia_-_English_Canada.pdf

These sources were reviewed for product/process inspiration and policy structure. They are not legal templates for this project.
