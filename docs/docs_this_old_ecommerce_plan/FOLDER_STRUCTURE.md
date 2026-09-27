# Final Folder Structure — 2026-09-24

## Root

```text
ecommerce/
├── docs/
├── frontend/
└── backend/
```

## Frontend

```text
frontend/
├── public/
└── src/
    ├── app/
    │   ├── (customer)/
    │   ├── admin/
    │   ├── super-admin/
    │   ├── sitemap.ts
    │   ├── robots.ts
    │   ├── layout.tsx
    │   └── globals.css
    ├── components/
    │   ├── ui/              # shadcn/ui project-owned components
    │   ├── shared/
    │   ├── customer/
    │   ├── admin/
    │   └── super-admin/
    ├── features/
    ├── lib/
    │   ├── api/
    │   ├── auth/
    │   ├── seo/
    │   ├── local-storage/
    │   └── utils/
    ├── hooks/
    ├── types/
    ├── constants/
    └── validators/
```

## Backend

```text
backend/
├── drizzle/
│   └── migrations/
└── src/
    ├── index.ts
    ├── routes/
    │   ├── auth/
    │   ├── customer/
    │   ├── admin/
    │   ├── super-admin/
    │   └── webhooks/
    ├── modules/
    ├── admin/
    ├── super-admin/
    ├── db/
    │   ├── schema/
    │   ├── index.ts
    │   └── client.ts
    ├── middleware/
    ├── validators/
    ├── services/
    │   ├── r2/
    │   ├── redis/
    │   ├── resend/
    │   ├── cashfree/
    │   └── pricing/
    ├── lib/
    ├── types/
    ├── constants/
    └── utils/
```

## Rules

- Do not keep the main backend API in `frontend/src/app/api/`.
- Backend API routes belong in `backend/src/routes/`.
- Shared business logic belongs in `backend/src/modules/`.
- UI primitives belong in `frontend/src/components/ui/` and should be shadcn-first.
- Do not create `packages/shared` yet.
- Do not create Collections folders/modules.
- Do not create microservices.

# Product Schema Documentation Files — 2026-09-25

The product/catalog design is documented in:

```text
PRODUCT_CATALOG_SCHEMA.md
ADMIN_PRODUCT_ADD_SPEC.md
CUSTOMER_PRODUCT_PAGE_SPEC.md
```

The future backend schema files remain under:

```text
backend/src/db/schema/
```

Expected product-related files include:

```text
categories.ts
subcategories.ts
products.ts
product-variants.ts
product-images.ts
inventory.ts
```

This is the target schema layout; do not generate schema implementation code during documentation-only tasks.
