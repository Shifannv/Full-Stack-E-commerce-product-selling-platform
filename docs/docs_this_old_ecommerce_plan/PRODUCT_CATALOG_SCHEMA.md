# Product Catalog & Database Schema Specification

> **Latest update:** 2026-09-25
>
> This document defines the current product/catalog schema for the ecommerce platform. It is a design specification, not executable Drizzle code. The implementation must follow the relationships and business rules here without inventing a more complex catalog system.

## 1. Catalog hierarchy

```text
Main Category
    ↓
Subcategory
    ↓
Product
    ↓
Product Variant(s)
    ↓
Inventory / Media
```

There is **no Collections system**.

Do not create `collections`, `collection_products`, collection routes, or collection-specific product logic.

## 2. Product ownership

Products are managed by internal Admins. The existing product-assignment model controls which Admin can create/update/manage a product.

The customer storefront is a single store, so the product page must not present the product as a marketplace seller listing.

## 3. `products` table — planned fields

| Field | Purpose | Notes |
|---|---|---|
| `id` | Primary identifier | UUID preferred |
| `name` | Customer-facing product name | Required |
| `slug` | SEO URL identifier | Unique |
| `description` | Full product description | Customer-visible |
| `short_description` | Short summary | Customer-visible |
| `brand_id` | Optional brand | Nullable if store has unbranded products |
| `category_id` | Main category | Required |
| `subcategory_id` | Subcategory | Required |
| `sku` | Product-level SKU | Required when product has no variant SKU strategy; otherwise optional/parent SKU |
| `base_price` | Current base price | Server authority; never used for old-order history |
| `compare_at_price` | Optional crossed/reference price | Must be >= current price when present; business validation required |
| `currency` | Currency code | Example: `INR` |
| `status` | Product lifecycle | `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `is_featured` | Homepage feature flag | Optional simple merchandising flag |
| `is_new` | New-product flag | Optional simple merchandising flag |
| `is_trending` | Trending flag | Optional simple merchandising flag |
| `seo_title` | Optional SEO title override | Public page only |
| `seo_description` | Optional SEO description override | Public page only |
| `created_by` | Admin/user actor | Audit/reference |
| `updated_by` | Last modifying actor | Audit/reference |
| `created_at` | Creation timestamp | Server-generated |
| `updated_at` | Last update timestamp | Server-generated |

### Product fields deliberately not used

Do not add a `collection_id`.

Do not store historical order pricing in `products`.

Do not use a product's current `base_price` when displaying historical orders.

## 4. `product_variants` table — planned fields

Use variants when a product has selectable combinations such as:

- Size
- Color
- Storage
- RAM
- Capacity
- Material
- Model

| Field | Purpose | Notes |
|---|---|---|
| `id` | Variant identifier | UUID preferred |
| `product_id` | Parent product | Required |
| `sku` | Variant SKU | Unique |
| `barcode` | Optional barcode | Nullable |
| `option_values` | Selected option values | Structured JSON object is acceptable for the combination, e.g. `{ "Color": "Black", "Size": "M" }` |
| `price_override` | Optional current variant price | Null means use product `base_price` |
| `compare_at_price` | Optional current variant reference price | Nullable |
| `weight` | Optional shipping weight | Nullable |
| `status` | Variant lifecycle | `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `created_at` | Creation timestamp | Server-generated |
| `updated_at` | Last update timestamp | Server-generated |

### Variant rule

Do not create a separate table for every possible option type in V1.

Use a simple product-level option definition plus variant combinations when required. Do not build a fully generic marketplace-grade product configurator.

For queryable/filterable catalog dimensions, prefer normalized category/brand data and explicit searchable fields. Use JSON only for the variant combination or flexible product specifications that do not need frequent relational filtering.

## 5. `product_images` table — planned fields

| Field | Purpose |
|---|---|
| `id` | Image identifier |
| `product_id` | Parent product |
| `variant_id` | Optional specific variant |
| `storage_key` | R2 object key |
| `public_url` | Public/served image URL when applicable |
| `alt_text` | Accessibility + SEO text |
| `sort_order` | Gallery order |
| `is_primary` | Primary product image flag |
| `created_at` | Timestamp |

Store image binaries in Cloudflare R2, not PostgreSQL.

## 6. `product_option_types` / option strategy

V1 should stay simple.

A practical structure is:

```text
product
  ↓
option definitions
  ↓
variants
```

Example:

```text
Product: Classic T-Shirt

Options:
  Color: Black, White
  Size: S, M, L

Variants:
  Black / S
  Black / M
  Black / L
  White / S
  White / M
  White / L
```

If implementation uses dedicated tables for option types/values, keep them narrowly scoped to product options. Do not introduce a generalized attribute marketplace engine.

## 7. `inventory` strategy

Inventory should be variant-aware.

For a product with no variants, use one inventory record for the product or a single default variant. Prefer a single consistent approach rather than two radically different flows.

Minimum inventory concepts:

```text
stock_quantity
reserved_quantity
available_quantity
low_stock_threshold
```

The checkout path must calculate availability on the server.

Do not trust cached or frontend stock.

## 8. Product specifications

Products may need structured specifications such as:

```text
Material: Cotton
Screen Size: 15.6 inch
RAM: 16 GB
Battery: 5000 mAh
```

For V1, store flexible specifications as structured JSON/text metadata if they do not need relational filtering.

If a specification must power high-volume search/filtering later, it can be normalized later. Do not build a full attribute engine before that need exists.

## 9. Product lifecycle

```text
DRAFT
  ↓
ACTIVE
  ↓
INACTIVE
  ↓
ARCHIVED
```

`ARCHIVED` is for controlled historical/admin use. It should not automatically delete order history, reviews, or finance records.

## 10. Product price authority

Current product pricing:

```text
products.base_price
product_variants.price_override
```

Historical pricing:

```text
order_items.unit_price
```

At checkout, calculate the current effective price on the server:

```text
variant price override if present
        else
product base price
```

Then snapshot the amount into the order item.

## 11. Suggested indexes and constraints

The implementation should consider indexes for:

- `products.slug` unique
- `products.category_id`
- `products.subcategory_id`
- `products.status`
- `products.created_at`
- `product_variants.product_id`
- `product_variants.sku` unique
- `product_images.product_id`
- `product_images.sort_order`

Use foreign keys and uniqueness constraints where appropriate.

Do not add every conceivable index. Add indexes for actual query patterns.

## 12. Product schema relationship summary

```text
categories
   │
   └── subcategories
            │
            └── products
                   │
                   ├── product_variants
                   │       └── inventory
                   │
                   ├── product_images
                   │
                   └── reviews
```

Orders reference snapshots rather than live product values.
