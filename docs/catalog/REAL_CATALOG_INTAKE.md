# Real Catalog Intake Template

Status: Preparation template only. Completing this document does not authorize a production import, publication, deployment, provider call, or retirement of test fixtures.

Start with the [Business Completion Checklist](./BUSINESS_COMPLETION_CHECKLIST.md), then enter the approved values in this template.

Use one placeholder row as a pattern and add rows as needed. Replace every `<PLACEHOLDER>` before validation. Do not enter provider credentials or secrets in this document.

## 1. Category intake

### Main categories

| Main Category Name | Category Slug | Description | Sort Order | Publish Decision |
|---|---|---|---:|---|
| `<MAIN_CATEGORY>` | `<category-slug>` | `<DESCRIPTION_OR_BLANK>` | `<INTEGER>` | `<DRAFT_OR_PUBLISHED>` |

### Subcategories

| Parent Category | Subcategory Name | Subcategory Slug | Sort Order | Publish Decision |
|---|---|---|---:|---|
| `<MAIN_CATEGORY>` | `<SUBCATEGORY>` | `<subcategory-slug>` | `<INTEGER>` | `<DRAFT_OR_PUBLISHED>` |

### Category product fields

Complete this table only for categories that need structured product attributes.

Allowed input types are `TEXT`, `NUMBER`, `SELECT`, and `BOOLEAN`. For `SELECT`, provide the complete approved option list. Use a JSON array or a clearly delimited list whose values are unambiguous.

| Main Category | Field Key | Label | Input Type | Required | Options | Sort Order |
|---|---|---|---|---|---|---:|
| `<MAIN_CATEGORY>` | `<field_key>` | `<FIELD_LABEL>` | `<TEXT_NUMBER_SELECT_OR_BOOLEAN>` | `<YES_OR_NO>` | `<OPTIONS_OR_NOT_APPLICABLE>` | `<INTEGER>` |

## 2. Product intake

Use one row per real product. `Category Attributes` must use only fields configured for the selected main category. JSON object format is preferred, represented here by `<CATEGORY_ATTRIBUTES_JSON>`; no example business values are supplied by this template.

| Responsible Admin | Product Name | Slug | Description | Main Category | Subcategory | SKU | Price INR | Weight Kg | Length Cm | Breadth Cm | Height Cm | Category Attributes | Featured? | Return Enabled? | Launch Inventory | Desired Status |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---|
| `<ADMIN_IDENTITY>` | `<PRODUCT_NAME>` | `<product-slug>` | `<DESCRIPTION_OR_BLANK>` | `<MAIN_CATEGORY>` | `<SUBCATEGORY>` | `<UNIQUE_SKU>` | `<INR_DECIMAL>` | `<POSITIVE_WEIGHT>` | `<POSITIVE_LENGTH>` | `<POSITIVE_BREADTH>` | `<POSITIVE_HEIGHT>` | `<CATEGORY_ATTRIBUTES_JSON>` | `<YES_OR_NO>` | `<YES_OR_NO>` | `<NONNEGATIVE_INTEGER>` | `<DRAFT_OR_PUBLISHED_LAUNCH_TARGET>` |

Notes:

- Product creation begins in `DRAFT`; publication and featured state require the appropriate Super Admin action.
- Currency is currently fixed to `INR` for purchase eligibility.
- A simple purchasable product needs its product SKU and base inventory.
- Package weight and all three dimensions are required before the product can be purchased, even though drafts may temporarily omit them.
- Only products in the main-category slug `dress` may set `Return Enabled?` to `YES`.

## 3. Variant intake

Complete this section only when the business has decided that a product needs variants. Do not add placeholder variants to a simple product.

| Product | Variant Title | Variant SKU | Variant Price | Variant Attributes | Launch Quantity | Active? | Image Association |
|---|---|---|---:|---|---:|---|---|
| `<PRODUCT_SLUG_OR_APPROVED_REFERENCE>` | `<VARIANT_TITLE>` | `<UNIQUE_VARIANT_SKU>` | `<INR_DECIMAL>` | `<VARIANT_ATTRIBUTES_JSON>` | `<NONNEGATIVE_INTEGER>` | `<YES_OR_NO>` | `<MEDIA_FILE_NAME_OR_NONE>` |

Each sellable variant needs its own unique SKU, price, active status, and variant-specific inventory row. The current API accepts variant attributes as an object but does not establish required variant attribute keys or option vocabularies.

## 4. Media intake

| Product | Variant if applicable | File Name | Format | Display Order | Alt Text | Approved for Production? |
|---|---|---|---|---:|---|---|
| `<PRODUCT_SLUG_OR_APPROVED_REFERENCE>` | `<VARIANT_SKU_OR_NOT_APPLICABLE>` | `<FILE_NAME>` | `<PNG_JPEG_OR_WEBP>` | `<INTEGER_0_TO_1000>` | `<ALT_TEXT_OR_BLANK>` | `<YES_OR_NO>` |

Technical acceptance:

- Accepted upload formats are PNG, JPEG, and WebP.
- Maximum file size is 5,000,000 bytes.
- File MIME type and file signature must match.
- Variant association, when supplied, must refer to a variant of the same product.
- Alt text is optional and limited to 300 characters.
- The current application does **not** establish a minimum image count. The business must approve a minimum image policy before missing images can be treated as an intake failure.

Do not store R2 credentials, access keys, Worker secrets, or public-provider credentials here.

## 5. Admin and seller intake

Use one record per responsible Admin/seller.

| Field | Business-supplied value |
|---|---|
| Admin identity | `<ADMIN_ID_OR_APPROVED_ACCOUNT_REFERENCE>` |
| Legal name | `<LEGAL_NAME>` |
| Business type | `<BUSINESS_TYPE>` |
| Contact phone | `<CONTACT_PHONE>` |
| KYC evidence status | `<NOT_SUBMITTED_SUBMITTED_APPROVED_CHANGES_REQUIRED_OR_REJECTED>` |
| Requested categories | `<REQUESTED_CATEGORY_LIST>` |
| Approved categories | `<ACTIVE_CATEGORY_ASSIGNMENT_LIST>` |
| Shipping-origin address | `<COMPLETE_SHIPPING_ORIGIN_ADDRESS_REFERENCE_OR_RECORD>` |
| Return address | `<COMPLETE_RETURN_ADDRESS_REFERENCE_OR_RECORD>` |
| Shiprocket pickup location reference | `<PROVIDER_LOCATION_REFERENCE>` |
| Shiprocket pickup location name | `<PROVIDER_LOCATION_NAME>` |
| Operational readiness status | `<NOT_READY_READY_OR_BLOCKED_WITH_REASON>` |

Each operational address record must contain:

- Contact name and phone.
- Optional business name.
- Address line 1 and optional address line 2.
- City, state, postal code, and country.
- Correct address type: `SHIPPING_ORIGIN` or `RETURN`.

The Shiprocket pickup postal code must be exactly six digits. The pickup reference maps the platform Admin's active shipping-origin address to the central platform Shiprocket account. Do not request or record a Shiprocket password, API-user password, token, webhook secret, or other provider secret in this intake.

## 6. Dress return decisions

Complete one row for every product whose selected main-category slug is `dress`.

| Product | Return Enabled? YES/NO | Business Approval/Reference |
|---|---|---|
| `<DRESS_PRODUCT_SLUG_OR_APPROVED_REFERENCE>` | `<YES_OR_NO>` | `<APPROVER_DECISION_OR_REFERENCE>` |

For every non-Dress product, use `returnEnabled=false`. This template adds no return rules beyond the current project rule.

## 7. Intake sign-off

| Review | Name/reference | Decision | Date | Notes |
|---|---|---|---|---|
| Business catalog owner | `<REVIEWER>` | `<APPROVED_CHANGES_REQUIRED_OR_PENDING>` | `<YYYY-MM-DD>` | `<NOTES_OR_BLANK>` |
| Responsible Admin/seller | `<REVIEWER>` | `<APPROVED_CHANGES_REQUIRED_OR_PENDING>` | `<YYYY-MM-DD>` | `<NOTES_OR_BLANK>` |
| Super Admin publication review | `<REVIEWER>` | `<APPROVED_CHANGES_REQUIRED_OR_PENDING>` | `<YYYY-MM-DD>` | `<NOTES_OR_BLANK>` |

Completion of sign-off records decisions; it does not execute the import or authorize fixture retirement.
