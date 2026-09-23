# Category and Subcategory Rules

## Goal

The customer storefront should have understandable product navigation without adding a complicated collection/taxonomy system.

## Customer UI

Home page:

```text
Feature cards / banners
↓
Main Categories
↓
Subcategories
↓
Products
```

Example:

```text
Clothing
 ├── T-Shirts
 ├── Shirts
 ├── Pants
 └── Hoodies

Electronics
 ├── Mobile Accessories
 ├── Audio
 └── Computer Accessories
```

The exact names are data, not hard-coded business logic.

## Admin product creation

Admin opens Add Product:

```text
Category
↓
select an active main category
↓
Subcategory
↓
select an existing subcategory
or
create a new subcategory (only when permitted)
```

New Admin-created subcategories are limited to the selected main category.

## Ownership

Recommended rules:

```text
Super Admin
→ manage all categories/subcategories

Admin
→ view active main categories
→ manage own custom subcategories
→ use subcategories for assigned products
```

Do not allow an Admin to rename a global main category.

## Customer visibility

Customers can see:

- active main categories
- active subcategories
- products belonging to them

Do not expose Admin ownership as a public taxonomy unless the product UI explicitly needs it.

## SEO

SEO pages are based on:

```text
/category/[slug]
/category/[categorySlug]/[subcategorySlug]
/product/[slug]
```

Exact route names may differ from the codebase, but the concept must remain category/subcategory/product.

There is no:

```text
/collections/[slug]
```

## Database rule

Do not create deep recursive category relationships.

Keep:

```text
category → subcategory → product
```

This keeps filtering, URL generation, sitemap generation, admin forms, and database queries simple.
