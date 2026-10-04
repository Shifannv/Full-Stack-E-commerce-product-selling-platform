# Business Completion Checklist

Frontend handoff updated 2026-10-04: customer and both operator themes/API task connections are implemented locally. See [frontend integration status](../api/FRONTEND_INTEGRATION_STATUS.md) for remaining provider/catalog gates and missing API proposals. This does not complete any owner-input cells below.

Status: Business-input preparation only. This checklist does not authorize an import, publication, deployment, provider call, media upload, fixture retirement, or any other production mutation.

Complete the `Owner input/reference` cells without inventing placeholder catalog data. Detailed rows belong in the [Real Catalog Intake Template](./REAL_CATALOG_INTAKE.md). After completion, run the document review in [Real Catalog Validation](./REAL_CATALOG_VALIDATION.md).

## Classification key

- **REQUIRED BY APPLICATION**: the current schema or service flow requires this value or state for creation, public availability, purchase, seller approval, or fulfillment.
- **CONDITIONAL**: required only when the stated product, category, variant, return, or fulfillment condition applies.
- **OPTIONAL**: supported by the current application but not required by it.
- **BUSINESS DECISION REQUIRED**: the application does not choose the policy or real-world value. The business/catalog owner must decide it.

## 1. Taxonomy

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Final main-category taxonomy | BUSINESS DECISION REQUIRED | `<APPROVED_TAXONOMY_REFERENCE>` | The application does not define the real categories. |
| Main category name | REQUIRED BY APPLICATION | `<MAIN_CATEGORY_NAME>` | Nonempty; maximum 200 characters through the service validator. |
| Main category slug | REQUIRED BY APPLICATION | `<category-slug>` | Globally unique; maximum 100 characters; lowercase letters/numbers with single hyphens. |
| Main category description | OPTIONAL | `<DESCRIPTION_OR_BLANK>` | Maximum 2,000 characters when supplied. |
| Main category sort order | OPTIONAL | `<INTEGER_OR_DEFAULT_0>` | Defaults to `0`. |
| Main category publication decision | BUSINESS DECISION REQUIRED | `<DRAFT_OR_PUBLISHED_TARGET>` | A category must be `PUBLISHED` for public/category-scoped catalog use. |
| Subcategory name | REQUIRED BY APPLICATION | `<SUBCATEGORY_NAME>` | Nonempty. |
| Subcategory slug | REQUIRED BY APPLICATION | `<subcategory-slug>` | Unique within its parent; same slug format as categories. |
| Subcategory parent category | REQUIRED BY APPLICATION | `<MAIN_CATEGORY_REFERENCE>` | A product's subcategory must belong to its selected main category. |
| Subcategory sort order | OPTIONAL | `<INTEGER_OR_DEFAULT_0>` | Defaults to `0`. |
| Subcategory publication decision | BUSINESS DECISION REQUIRED | `<DRAFT_OR_PUBLISHED_TARGET>` | A subcategory must be `PUBLISHED` before product creation against it. |
| Whether a category needs custom product fields | BUSINESS DECISION REQUIRED | `<YES_OR_NO_PER_CATEGORY>` | The application does not choose category attributes. |
| Category field key | CONDITIONAL | `<field_key>` | Required for each configured field; maximum 80 characters; lowercase letter first, then lowercase letters, numbers, or underscores. |
| Category field label | CONDITIONAL | `<FIELD_LABEL>` | Required for each configured field; maximum 200 characters. |
| Category field input type | CONDITIONAL | `<TEXT_NUMBER_SELECT_OR_BOOLEAN>` | Required for each configured field. |
| Category field required/optional decision | BUSINESS DECISION REQUIRED | `<YES_OR_NO_PER_FIELD>` | The business decides whether each configured attribute must be present on products. |
| Category field options | CONDITIONAL | `<OPTION_LIST>` | Required only for `SELECT`; 1–50 nonempty options, each at most 100 characters. |
| Category field sort order | OPTIONAL | `<INTEGER_OR_DEFAULT_0>` | Defaults to `0`. |

## 2. Real products and commercial data

Complete one set for every real product.

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Responsible Admin/seller | REQUIRED BY APPLICATION | `<ADMIN_IDENTITY>` | Becomes `createdByAdminId` and the product's sale owner. |
| Product name | REQUIRED BY APPLICATION | `<PRODUCT_NAME>` | Nonempty; maximum 200 characters. |
| Product slug | REQUIRED BY APPLICATION | `<product-slug>` | Globally unique; maximum 100 characters; required slug format. |
| Product description | OPTIONAL | `<DESCRIPTION_OR_BLANK>` | Maximum 5,000 characters when supplied. |
| Main category | REQUIRED BY APPLICATION | `<MAIN_CATEGORY>` | Must be published and within the Admin's active category scope. |
| Subcategory | REQUIRED BY APPLICATION | `<SUBCATEGORY>` | Must be published and belong to the selected main category. |
| SKU for each purchasable unit | REQUIRED BY APPLICATION | `<PRODUCT_OR_VARIANT_SKU>` | Nonempty for purchase; unique and at most 100 characters. A simple product uses its product SKU; a selected variant uses its variant SKU. |
| SKU convention | BUSINESS DECISION REQUIRED | `<APPROVED_SKU_POLICY>` | The application enforces presence/uniqueness/length but does not define the naming convention. |
| Product price | REQUIRED BY APPLICATION | `<INR_DECIMAL>` | Decimal string with up to 10 integer digits and 2 decimal places; cannot be negative. |
| Whether zero-price real products are allowed | BUSINESS DECISION REQUIRED | `<YES_OR_NO>` | Zero passes current technical validation; commercial acceptance is undefined. |
| INR confirmation | REQUIRED BY APPLICATION | `<CONFIRMED_INR>` | Purchase eligibility requires currency exactly `INR`; it is the product default. |
| Weight in kilograms | REQUIRED BY APPLICATION | `<POSITIVE_WEIGHT>` | Required and positive for a launch-ready purchasable product; drafts may temporarily omit it. |
| Length in centimeters | REQUIRED BY APPLICATION | `<POSITIVE_LENGTH>` | Required and positive for purchase. |
| Breadth in centimeters | REQUIRED BY APPLICATION | `<POSITIVE_BREADTH>` | Required and positive for purchase. |
| Height in centimeters | REQUIRED BY APPLICATION | `<POSITIVE_HEIGHT>` | Required and positive for purchase. |
| Category attributes object | REQUIRED BY APPLICATION | `<CATEGORY_ATTRIBUTES_JSON_OR_EMPTY_OBJECT>` | Product creation expects an object; unknown keys are rejected. |
| Values for required category attributes | CONDITIONAL | `<ATTRIBUTE_VALUES>` | Required only where the category field definition marks them required. |
| Desired public status | BUSINESS DECISION REQUIRED | `<DRAFT_OR_PUBLISHED_LAUNCH_TARGET>` | Creation starts as `DRAFT`; Super Admin controls publication. |
| Featured decision | BUSINESS DECISION REQUIRED | `<YES_OR_NO>` | Defaults to `false`; Super Admin controls the flag. |

## 3. Variants and inventory

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Whether each product needs variants | BUSINESS DECISION REQUIRED | `<YES_OR_NO_PER_PRODUCT>` | The application supports variants but does not decide when they are needed. |
| Variant title | CONDITIONAL | `<VARIANT_TITLE>` | Required for every variant; maximum 200 characters. |
| Variant SKU | CONDITIONAL | `<UNIQUE_VARIANT_SKU>` | Required and unique for every variant; maximum 100 characters. |
| Variant price | CONDITIONAL | `<INR_DECIMAL>` | Required by the create-variant API; same price format. |
| Variant attributes | CONDITIONAL | `<VARIANT_ATTRIBUTES_JSON>` | Object accepted for variants; required keys/vocabulary are not established by the application. |
| Variant attribute rules | BUSINESS DECISION REQUIRED | `<APPROVED_VARIANT_ATTRIBUTE_POLICY>` | Business must define option names and allowed values. |
| Variant active decision | CONDITIONAL | `<ACTIVE_OR_INACTIVE>` | Sellable variants must be `ACTIVE`. |
| Initial inventory quantity | REQUIRED BY APPLICATION | `<NONNEGATIVE_INTEGER_PER_PURCHASABLE_UNIT>` | Provide an explicit launch quantity from 0 through 10,000,000. Purchase requires an inventory row with enough available quantity. |
| Base or variant inventory assignment | CONDITIONAL | `<BASE_OR_VARIANT_REFERENCE>` | Simple products use base inventory; variant products use inventory for each offered variant. |
| Reserved quantity | REQUIRED BY APPLICATION | `<SYSTEM_DEFAULT_0_ACKNOWLEDGED>` | Begins at `0` and is system-managed; the business must not supply a manual reserved value. |
| Inventory version handling | REQUIRED BY APPLICATION | `<INITIAL_VERSION_0_ACKNOWLEDGED>` | Initial write uses `expectedVersion=0`; later writes use the current version. |

## 4. Product media

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Whether a product launches with media | OPTIONAL | `<YES_OR_NO>` | The application supports a no-image state and enforces no minimum count. |
| Minimum product/variant image policy | BUSINESS DECISION REQUIRED | `<APPROVED_MINIMUM_IMAGE_POLICY>` | No minimum is established by current code. |
| Image quality policy | BUSINESS DECISION REQUIRED | `<APPROVED_IMAGE_QUALITY_POLICY>` | Dimensions, resolution, aspect ratio, crop, background, and photography rules are not established. |
| Approved image file | CONDITIONAL | `<FILE_REFERENCE>` | Required only when media will be attached; PNG, JPEG, or WebP; no larger than 5,000,000 bytes; MIME and signature must match. |
| Product association | CONDITIONAL | `<PRODUCT_REFERENCE>` | Required for each supplied image. |
| Variant association | CONDITIONAL | `<VARIANT_REFERENCE_OR_NONE>` | Optional per image; if supplied, the variant must belong to the product. |
| Display order | CONDITIONAL | `<INTEGER_0_TO_1000>` | Required for each intake media row; application default is `0`. |
| Alt text | OPTIONAL | `<ALT_TEXT_OR_BLANK>` | Maximum 300 characters. |
| Production media approval | CONDITIONAL | `<APPROVAL_REFERENCE>` | Intake governance requirement when media is supplied. |

## 5. Dress return decisions

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Return decision for every Dress product | BUSINESS DECISION REQUIRED | `<YES_OR_NO_WITH_APPROVAL_REFERENCE>` | Only a product whose main-category slug is exactly `dress` may enable returns. |
| Non-Dress return setting | REQUIRED BY APPLICATION | `<CONFIRMED_FALSE>` | Must remain `returnEnabled=false`. |

No category-level return field exists. Do not add one to this intake.

## 6. Admin and seller readiness

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Admin account identity | REQUIRED BY APPLICATION | `<ADMIN_ID_OR_APPROVED_ACCOUNT_REFERENCE>` | Admin and linked user must be active and not deleted. |
| Legal name | REQUIRED BY APPLICATION | `<LEGAL_NAME>` | Required for KYC submission/approval. |
| Business type | REQUIRED BY APPLICATION | `<BUSINESS_TYPE>` | Required for KYC submission/approval. |
| Contact phone | REQUIRED BY APPLICATION | `<CONTACT_PHONE>` | Required for KYC submission/approval. |
| KYC evidence status/reference | REQUIRED BY APPLICATION | `<EVIDENCE_AND_CURRENT_STATUS_REFERENCE>` | At least one private KYC evidence document is required for approval. |
| Exact accepted KYC document policy by business type | BUSINESS DECISION REQUIRED | `<APPROVED_KYC_DOCUMENT_POLICY>` | Current code establishes upload types, not the legal evidence set for each business type. |
| Requested categories | REQUIRED BY APPLICATION | `<REQUESTED_CATEGORY_LIST>` | At least one requested category is required during onboarding. |
| Active approved category assignments | REQUIRED BY APPLICATION | `<ACTIVE_CATEGORY_LIST>` | Product creation, visibility, and purchase require active owner/category scope. |
| Product ownership/management confirmation | REQUIRED BY APPLICATION | `<OWNER_AND_MANAGEMENT_REFERENCE>` | Creator is the sale owner and must have the product-management relationship. |

## 7. Operational addresses and pickup mapping

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Active shipping-origin address | REQUIRED BY APPLICATION | `<COMPLETE_SHIPPING_ORIGIN_RECORD>` | Required for Admin approval and forward fulfillment. Include contact name/phone, line 1, city, state, postal code, and country; business name and line 2 are optional. |
| Active return address | REQUIRED BY APPLICATION | `<COMPLETE_RETURN_ADDRESS_RECORD>` | Required for Admin approval and approved-return handling; same required address components. |
| Shiprocket pickup-location reference | CONDITIONAL | `<PROVIDER_LOCATION_REFERENCE>` | Required before Shiprocket fulfillment for the Admin's active shipping-origin address. |
| Shiprocket pickup-location name | CONDITIONAL | `<PROVIDER_LOCATION_NAME>` | Required with the provider mapping. |
| Pickup postal-code confirmation | CONDITIONAL | `<SIX_DIGIT_POSTAL_CODE_CONFIRMED>` | Shiprocket fulfillment requires exactly six digits. |

Provider secrets are outside this intake and must not be supplied.

## 8. Compliance, discovery, and retirement policies

These policies are not implemented catalog fields in the current schema. Supply decisions before treating any of them as launch requirements.

| Information to provide | Classification | Owner input/reference | Current application rule |
|---|---|---|---|
| Tax/GST/HSN requirements | BUSINESS DECISION REQUIRED | `<APPROVED_TAX_POLICY>` | No corresponding current product intake contract is established. |
| Barcode requirements | BUSINESS DECISION REQUIRED | `<APPROVED_BARCODE_POLICY>` | No corresponding current product field is established. |
| SEO requirements | BUSINESS DECISION REQUIRED | `<APPROVED_SEO_POLICY>` | No dedicated current product SEO fields are established. |
| Permanent deletion policy | BUSINESS DECISION REQUIRED | `<APPROVED_DELETION_POLICY>` | Permanent catalog deletion rules are not established. |
| Fixture retirement policy | BUSINESS DECISION REQUIRED | `<APPROVED_FIXTURE_RETIREMENT_POLICY>` | Fixtures remain until real catalog verification succeeds and retirement receives explicit approval. |

## 9. Business-owner completion gate

- [ ] Every `REQUIRED BY APPLICATION` row has a value or verifiable existing-state reference.
- [ ] Every applicable `CONDITIONAL` row has a value.
- [ ] Every `BUSINESS DECISION REQUIRED` row has an approved decision/reference or is recorded as a launch blocker.
- [ ] Optional fields intentionally left blank are marked as such.
- [ ] Detailed category, product, variant, media, and seller rows are entered in the intake template.
- [ ] No provider secret or fabricated business value appears in the package.
- [ ] The completed package has passed the validation checklist.
- [ ] Production import remains unapproved until a separate explicit authorization is issued.
