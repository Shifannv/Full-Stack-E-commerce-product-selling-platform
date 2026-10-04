# Real Catalog Validation and Import Checklist

Status: Pre-import validation only. This checklist does not authorize production mutations, deployment, provider calls, or fixture retirement.

The catalog owner should first complete the [Business Completion Checklist](./BUSINESS_COMPLETION_CHECKLIST.md) and [Real Catalog Intake Template](./REAL_CATALOG_INTAKE.md). Validate both before any production onboarding work begins.

## 1. Pre-import validation checklist

### Category hierarchy

- [ ] Every main category has a nonempty name and a globally unique slug.
- [ ] Every category slug is at most 100 characters and uses lowercase letters/numbers separated by single hyphens.
- [ ] Every subcategory has exactly one identified parent category.
- [ ] Every subcategory slug is unique within its parent category.
- [ ] Every product's selected subcategory belongs to its selected main category.
- [ ] Category and subcategory publish decisions are explicit.
- [ ] Categories and subcategories intended for public use are approved for `PUBLISHED` status.

### Category attributes

- [ ] Every custom field key begins with a lowercase letter and contains only lowercase letters, numbers, and underscores.
- [ ] Every field has an allowed input type: `TEXT`, `NUMBER`, `SELECT`, or `BOOLEAN`.
- [ ] Every `SELECT` field has its complete approved option list.
- [ ] Every product supplies all fields marked required for its category.
- [ ] Product attribute values have the configured type.
- [ ] No product contains unconfigured category attribute keys.

### Product identity, price, and package data

- [ ] Every product has a responsible Admin, name, unique slug, category, and subcategory.
- [ ] Product names are at most 200 characters.
- [ ] Product descriptions, when supplied, are at most 5,000 characters.
- [ ] Every purchasable unit has a nonempty unique SKU no longer than 100 characters.
- [ ] Each price is an INR decimal string with no more than 10 integer digits and 2 decimal places.
- [ ] No price is negative.
- [ ] Every launch-ready product has positive weight, length, breadth, and height.
- [ ] Desired product status and featured decision have been recorded.

The application accepts a zero price. Commercial acceptance of zero-price real products remains a business decision.

### Admin ownership and category assignment

- [ ] Responsible Admin identity maps to an existing approved account.
- [ ] Linked user and Admin accounts are active and not deleted.
- [ ] Admin KYC/onboarding is approved.
- [ ] Admin has an active assignment for every selected product category.
- [ ] Product creation will run as the responsible Admin so `createdByAdminId` records the intended sale owner.
- [ ] The creator's product-management relationship will be present.
- [ ] Required catalog and inventory permissions have been confirmed.

### Inventory

- [ ] Launch quantity is an integer from 0 through 10,000,000.
- [ ] Simple products use base inventory with no variant ID.
- [ ] Products with variants have inventory for every offered active variant.
- [ ] No variant inventory is assigned to a variant from another product.
- [ ] Initial inventory creation will use `expectedVersion=0`.
- [ ] Later updates will use the current inventory version.
- [ ] Reserved quantity is not included as business intake data and begins at `0`.
- [ ] Intended in-stock/out-of-stock presentation agrees with launch quantities.

### Variants

- [ ] The business has explicitly identified which products require variants.
- [ ] No unnecessary placeholder variants have been added.
- [ ] Every variant has a title, unique SKU, INR price, attributes object, launch quantity, and active decision.
- [ ] Every variant belongs to the identified product.
- [ ] Variant image associations, when supplied, refer to that same variant and product.
- [ ] Any required variant attribute vocabulary has been approved as a business rule.

### Images

- [ ] Every submitted file is PNG, JPEG, or WebP.
- [ ] Every file is no larger than 5,000,000 bytes.
- [ ] File extension, MIME type, and file signature agree.
- [ ] Display order is an integer from 0 through 1000.
- [ ] Alt text, when supplied, is at most 300 characters.
- [ ] Every media row has production approval.
- [ ] The business image-count and image-quality policy has been supplied, or the catalog owner has explicitly accepted the application's no-image behavior.

The current application does **not** establish a minimum product or variant image count.

### Returns

- [ ] Every Dress product has an explicit `YES` or `NO` return decision with a business approval/reference.
- [ ] `returnEnabled=true` is used only when the main-category slug is exactly `dress`.
- [ ] Every non-Dress product has `returnEnabled=false`.
- [ ] No category-level return flag has been introduced.

### Fulfillment readiness

- [ ] Responsible Admin has one active `SHIPPING_ORIGIN` address.
- [ ] Responsible Admin has one active `RETURN` address.
- [ ] Both address records contain the required contact and location information.
- [ ] Pickup postal code is exactly six digits.
- [ ] The shipping-origin address has an active Shiprocket pickup-location mapping.
- [ ] Provider location reference and location name have been verified without copying provider secrets into intake documents.
- [ ] Product/variant SKU and package measurements are ready for fulfillment.
- [ ] Operational readiness is marked `READY`, or every blocker is documented.

### Publication approval

- [ ] Product drafts have passed catalog, ownership, inventory, media, return, and fulfillment validation.
- [ ] Super Admin publication decision is recorded.
- [ ] Featured decisions are recorded separately from publication.
- [ ] Public API verification is planned after publication.
- [ ] Static frontend build and Pages deployment occur only after published slugs are available.
- [ ] Production page verification occurs before fixture retirement is considered.
- [ ] Fixture retirement has separate explicit approval.

## 2. Business decisions still required

The following are **BUSINESS DECISION REQUIRED**, not technical requirements created by this checklist:

| Decision | Required business output |
|---|---|
| Real taxonomy | Approved category/subcategory names, slugs, hierarchy, order, and publication decisions |
| SKU convention | Naming, ownership, collision prevention, and lifecycle convention beyond technical uniqueness/length rules |
| Variant rules | Which merchandise needs variants and the allowed attribute names/options |
| Minimum image policy | Minimum product and variant image counts, including whether no-image launch is allowed |
| Image quality policy | Dimensions, resolution, aspect ratio, background, crop, photography, and accessibility standards |
| Dress return decisions | Explicit per-product `YES`/`NO` decisions for Dress products |
| KYC document requirements | Accepted legal evidence for each seller/business type beyond the technical upload types |
| Tax/GST/HSN requirements | Required registrations and per-product or seller tax data |
| Barcode requirements | Whether barcodes are required and which standard/source owns them |
| SEO requirements | Metadata, copy, canonical, and search-presentation policy |
| Permanent deletion policy | Whether real product records may ever be permanently deleted |
| Fixture retirement policy | Whether controlled test fixtures should be archived, retained privately, or removed through a future approved mechanism |

Do not convert these decisions into import requirements until the business owner approves them and the application contract supports any resulting new fields.

## 3. Safe import order

Follow this dependency order during a separately authorized onboarding task:

1. Categories.
2. Subcategories and verified parent relationships.
3. Category product-field definitions.
4. Admin account, KYC, category assignment, address, and pickup-mapping readiness.
5. Product drafts under the correct responsible Admin.
6. Variants only for products approved to use variants.
7. Product and variant media.
8. Base or variant inventory with optimistic version checks.
9. Complete pre-import and pre-publication validation.
10. Super Admin publication and featured decisions.
11. Public API verification.
12. Normal frontend production build after published slugs exist.
13. Cloudflare Pages deployment.
14. Deployed production verification of listing, detail, media, price, variant, stock, and purchase presentation.
15. Controlled fixture retirement only after explicit approval and successful real-catalog verification.

## 4. Import blockers

Stop before import or publication when any of these conditions exists:

- Unresolved category parentage or duplicate/invalid slugs.
- Missing required category attributes.
- Missing or invalid SKU, INR price, or package measurements.
- Unknown, inactive, deleted, or unapproved responsible Admin.
- Missing active category assignment or ownership relationship.
- Invalid base/variant inventory or missing inventory version.
- Variant data that cannot be tied unambiguously to its product.
- Media that fails technical validation or lacks required business approval.
- Inconsistent Dress/non-Dress return configuration.
- Missing active shipping-origin or return address.
- Missing active Shiprocket pickup-location mapping.
- Missing Super Admin publication approval.
- Any unresolved business policy that the catalog owner has classified as mandatory for launch.

## 5. Completion record

| Gate | Result | Reviewer/reference | Notes |
|---|---|---|---|
| Intake completeness | `<PASS_FAIL_OR_PENDING>` | `<REVIEWER>` | `<NOTES_OR_BLOCKER>` |
| Technical contract validation | `<PASS_FAIL_OR_PENDING>` | `<REVIEWER>` | `<NOTES_OR_BLOCKER>` |
| Seller/fulfillment readiness | `<PASS_FAIL_OR_PENDING>` | `<REVIEWER>` | `<NOTES_OR_BLOCKER>` |
| Business policy approval | `<PASS_FAIL_OR_PENDING>` | `<REVIEWER>` | `<NOTES_OR_BLOCKER>` |
| Super Admin publication approval | `<PASS_FAIL_OR_PENDING>` | `<REVIEWER>` | `<NOTES_OR_BLOCKER>` |

An all-pass record makes the package eligible for a separately authorized import. It does not itself modify production.
