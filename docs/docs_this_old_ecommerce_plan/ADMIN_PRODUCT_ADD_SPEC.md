# Admin Product Creation & Management Specification

> **Latest update:** 2026-09-25
>
> This defines exactly what an Admin can enter when creating a product, what is controlled by Super Admin, and what the Customer eventually sees. It is a business/UI specification, not implementation code.

## 1. Admin product creation flow

```text
Admin
 ↓
Products
 ↓
Add Product
 ↓
Select Main Category
 ↓
Select Existing Subcategory
        OR
Create Permitted Subcategory
 ↓
Enter Product Information
 ↓
Add Images
 ↓
Choose Variants if needed
 ↓
Set Pricing
 ↓
Set Inventory
 ↓
Set Delivery/Product details where supported
 ↓
Preview
 ↓
Save Draft / Publish
```

Admin only sees actions allowed by RBAC.

## 2. Category selection

### Main Category

The Admin chooses from existing Super Admin-managed main categories.

Admin does not create a main category unless a specific permission is granted.

### Subcategory

After choosing a main category:

```text
Main Category
    ↓
Existing Subcategories shown
```

Admin can select an existing subcategory.

If the role has the required permission, Admin can create a custom subcategory under the selected main category.

The Admin cannot create a subcategory unrelated to the selected main category.

## 3. Basic product information

Admin form should include:

### Product name

Customer-facing name.

Example:

```text
Men's Regular Fit Cotton T-Shirt
```

### Short description

One or two short lines used near the product title and for quick scanning.

### Full description

Detailed customer-facing description.

### Brand

Optional depending on catalog rules.

### SKU

Required at the appropriate product/variant level.

### Product status

```text
Draft
Active
Inactive
Archived
```

## 4. Images

Admin can add:

- primary image
- additional gallery images
- variant-specific images when required

Recommended image inputs:

```text
Image
Alt text
Sort order
Primary image
Variant association (optional)
```

Images are uploaded to R2.

Admin should see upload progress, preview, remove/reorder controls, and validation for supported file types/size.

## 5. Pricing

Admin enters:

```text
Current Price
Compare-at Price (optional)
Currency
```

If variants have different prices:

```text
Base Product Price
        ↓
Variant Override (optional)
```

The form must clearly show the effective current price for each variant.

Admin does NOT edit the historical price of an existing order.

## 6. Variant creation

Admin sees a simple variant builder only when variants are needed.

### Step A — Define options

Example:

```text
Option: Color
Values:
Black
White
Blue
```

```text
Option: Size
Values:
S
M
L
XL
```

### Step B — Generate combinations

The system can generate:

```text
Black / S
Black / M
Black / L
Black / XL
White / S
White / M
...
```

### Step C — Configure each variant

Each variant can have:

- SKU
- barcode (optional)
- price override (optional)
- compare-at price (optional)
- stock quantity
- low-stock threshold
- weight (optional)
- status
- variant image(s)

## 7. Example clothing product

```text
Product:
Men's Regular Fit Cotton T-Shirt

Category:
Fashion

Subcategory:
Men's T-Shirts

Options:
Color → Black, White
Size → S, M, L, XL

Variants:
Black/S
Black/M
Black/L
Black/XL
White/S
White/M
White/L
White/XL

Price:
₹799
```

The customer selects the combination before adding to cart.

## 8. Example electronics product

```text
Product:
Laptop Model X

Category:
Electronics

Subcategory:
Laptops

Options:
RAM → 8 GB, 16 GB
Storage → 512 GB, 1 TB

Variants:
8 GB / 512 GB
16 GB / 512 GB
16 GB / 1 TB
```

Each variant may have a different price and SKU.

## 9. Inventory settings

Admin should be able to manage:

```text
Stock quantity
Low-stock threshold
Stock status
```

For variant products, inventory is managed per variant.

For non-variant products, use the product/default-variant inventory model chosen by the backend implementation.

Stock must be checked server-side during checkout.

## 10. Optional product logistics fields

Only include fields that the current business actually needs, such as:

- weight
- package dimensions
- shipping class
- delivery information

Do not build a complex shipping-rule engine inside the product form.

## 11. Product SEO settings

Admin may have optional:

- SEO title
- SEO description
- slug preview

Do not force Admin to manually create technical structured data. The application generates structured data from product data.

## 12. Merchandising flags

Simple flags may be provided:

- Featured
- New
- Trending

These are storefront presentation flags.

They are NOT Collections.

## 13. What Admin should NOT control

Admin cannot directly change:

- Super Admin permissions
- platform Commission
- Payment Gateway Fee
- other Admin financial data
- other Admin products unless authorized
- Cashfree merchant ownership
- platform-wide customer security settings

## 14. Publish validation

Before publishing, backend should validate:

- category exists
- subcategory belongs to category
- product name valid
- SKU uniqueness where required
- price valid
- compare-at price valid
- variant combinations unique
- variant SKU uniqueness
- required image rules
- stock values valid
- product ownership/assignment allowed

Do not rely only on frontend form validation.

## 15. Save draft vs publish

A product may be saved as `DRAFT` if the business wants staged creation.

Publishing should transition it to `ACTIVE` only after required validation succeeds.

Do not add a separate "draft order" concept. Product drafts are different from customer orders.
