# Frontend Structure

`frontend/src/` — Next.js 16 App Router, static export (`output: "export"`), Tailwind 4, shadcn/ui.

```
app/
  (customer)/   storefront: home, categories/[slug], products/[slug], search, cart, checkout, orders, account, wishlist
  admin/        seller dashboard shell, setup
  super-admin/  operator dashboard shell
components/     auth, catalog, layout, states, storefront, ui (shadcn) contain files;
                admin/, customer/, shared/, super-admin/ exist but are EMPTY
constants/ features/ hooks/ types/ validators/   exist but are EMPTY (no files)
lib/
  api/          the browser -> Worker boundary (below)
  public-catalog.ts   build-time public GETs for static generation (no credentials;
                      CATALOG_BUILD_API_URL or NEXT_PUBLIC_API_URL)
  auth-client.ts, use-customer-session.ts, images.ts
```

## `lib/api/`

| File | Contents |
|---|---|
| `client.ts` | `api()` (base URL from `NEXT_PUBLIC_API_URL`, `credentials: "include"`, `cache: "no-store"`, JSON content-type unless FormData), `ApiError`, `id()`, `json()` |
| `types.ts` | Browser-facing response types |
| `auth.ts`, `customer.ts`, `admin.ts`, `super-admin.ts` | `authApi`, `customerApi`, `adminApi`, `superAdminApi` |
| `index.ts` | Re-exports (`api`, `ApiError`, types, the four API objects) so `@/lib/api` imports are unchanged |

Rules: no `fetch` outside `lib/api/client.ts` and `lib/public-catalog.ts`; no eligibility/amount/permission logic in the browser. URL/method/payload mapping: [FRONTEND_API_MAP](../api/FRONTEND_API_MAP.md).
