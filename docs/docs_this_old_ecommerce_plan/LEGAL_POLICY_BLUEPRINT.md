# Legal & Customer Policy Blueprint — 2026-09-24

## Important

This is an engineering/product blueprint, not legal advice and not copied legal text from another company.

The final legal documents must reflect the actual business, customer geography, payment/return practices, applicable law, and real operational capabilities.

Do not publish placeholder legal claims that the business cannot actually honor.

## Required policy areas

### Terms of Service

Should define, as applicable:

- who operates the store
- customer account responsibilities
- acceptable use
- product listing/availability conditions
- order acceptance
- pricing/error handling
- payment responsibilities
- cancellations
- returns/refunds reference
- intellectual property
- liability/limitations as legally appropriate
- dispute/contact process
- policy-change process

### Privacy Policy

Should explain:

- what customer data is collected
- why it is collected
- authentication data
- order/payment data
- shipping/address data
- analytics/technical data
- cookies/local storage where applicable
- third-party providers
- data retention
- data access/deletion rights as applicable
- security practices
- contact point

### Shipping Policy

Should explain:

- serviceable regions
- estimated dispatch/delivery ranges
- shipping charges
- carrier behavior where applicable
- address-change rules
- delayed/lost shipment process

### Return Policy

Should explain:

- eligible products
- non-returnable products
- return window
- product condition requirements
- return request process
- pickup/drop-off process
- inspection conditions
- replacement vs refund behavior

### Refund Policy

Should explain:

- when refunds are issued
- refund method
- refund timing expectations
- partial refund rules where applicable
- refund after cancellation/return
- payment-provider timing limitations

Shopify's current merchant guidance is a useful structural reference because it emphasizes current, accurate, public and easy-to-access refund information. See `PLATFORM_INSPIRED_COMMERCE_GUIDELINES.md`.

### Review Policy

Should define:

- who can submit reviews
- review eligibility
- prohibited review manipulation
- prohibited content
- moderation/reporting process
- when content may be removed
- how disputes are handled

### Customer Communication Policy

Should define:

- transactional messages
- promotional messages
- consent/communication preferences where applicable
- unsubscribe behavior for promotional email where applicable
- Admin/Super Admin messaging permissions
- audit logging of bulk/promotional messages

## Implementation rule

Legal policy text should be stored in CMS/content structures rather than hard-coded into arbitrary components when Admin/Super Admin needs to update it.

Suggested public routes:

```text
/terms
/privacy-policy
/shipping-policy
/return-policy
/refund-policy
/review-policy
```

Do not add a policy route unless there is actual content.

## Source principle

Shopify demonstrates a store-policy model with separate return, privacy, terms, shipping and legal pages.

Airbnb demonstrates a layered model where Terms, Payments Terms, Review Policy, Community Standards, Content Policy and other supplemental policies work together.

Amazon publishes Terms/Conditions and privacy information separately and maintains detailed seller/customer policies.

Our project should adopt the **structure and operational clarity**, not their wording or legal clauses.
