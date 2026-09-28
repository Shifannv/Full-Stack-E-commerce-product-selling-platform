# Phase 11b customer API mapping — 2026-09-28

This maps implemented frontend behavior to existing Worker contracts. The Worker remains authoritative for roles, prices, stock, checkout, orders, returns, and shipment status. Local Worker verification used the configured Aiven database; it currently contains zero public categories and products.

## Phase 11b-1 API checkpoint — 2026-09-28

`GET /api/products` now includes `image` (`objectKey`, `altText`), `available`, published `rating` and `reviewCount`, `createdAt`, and the existing price, featured, and category fields. It accepts whitelisted `sort=newest|price-asc|price-desc` and `available=true|false`; only `true` filters to in-stock rows. Public cards no longer fetch each product detail for its first image. `GET /api/products/:slug` now includes `available`, published rating/review count, and `createdAt`. No brand, compare-at price, shipping estimate, or stock quantity was invented.

`GET /api/customer/checkout/quote?addressId=...` requires a CUSTOMER session. It reads current cart/product/variant/stock and the selected owned address, returns line items, subtotal, `discountAmount`, `shippingAmount`, `totalAmount`, `valid`, and `problems`. The existing order transaction currently applies no coupon or shipping charge, so both amounts are `0.00`; a failed validation returns `totalAmount: null`. The quote does not insert an order, reserve stock, or touch payment. Actual checkout still rechecks values in its transaction.

`PATCH /api/admin/catalog/products/:productId/featured` is a Super Admin-only boolean curation endpoint. It enables the requested controlled featured fixture once an authorized operator account exists; it does not publish the product or change New Arrivals ordering.

The configured Aiven database has zero ADMIN, SUPER_ADMIN, and CUSTOMER users, zero categories, and zero products (`npm run verify:readiness`). No authorized Admin API session exists to create the requested controlled fixture. No database fixture was inserted. Consequently, `generateStaticParams()` still has no real slug; category and product routes remain `page.pending.tsx`. The route activation and real catalog HTML/metadata/404 checks are BLOCKED. Frontend deployment remains unsafe.

Read-only Wrangler checks confirm the `shop-product-images` R2 bucket exists, but it has no custom domain. The Worker has only the private `KYC_BUCKET` R2 binding; there is no product-image binding/upload API or configured `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`. Existing product image metadata accepts object keys but does not upload bytes. Category schema has no image field. A nullable `categories.image_object_key` column would be a minimal justified future addition once a public media upload/domain contract is set; no migration was made in this step.

Private order details/tracking stay on the fixed `/orders` route. This is the smallest working static-export boundary for unpredictable IDs; `/orders/[id]` is not claimed as a route. A distinct private URL would require a server-capable frontend runtime or an explicit fixed-route query approach. Google browser OAuth remains NOT VERIFIED because there is no local user and no browser consent/callback evidence.

| Screen / component | Existing Worker API | Auth | Current status |
| --- | --- | --- | --- |
| Home | `GET /api/categories`, `GET /api/products?featured=true&limit=8`, `GET /api/products?limit=8` | Public | Static build-time data fetch; verified empty catalog state |
| Category detail | `GET /api/categories`, `GET /api/products?category=:slug` | Public | Source prepared as `page.pending.tsx`; cannot activate while published slug list is empty under static export |
| Product detail | `GET /api/products/:slug`, `GET /api/products/:id/reviews` | Public | Source prepared as `page.pending.tsx`; cannot activate while published slug list is empty under static export |
| Search and filtered listing | `GET /api/products?q=&minPrice=&maxPrice=&category=&subcategory=&sort=&available=&limit=&offset=` | Public | Client interaction on fixed `/search` route; backend performs search, sorting, availability and price filtering, and pagination |
| Product actions | `PUT /api/customer/cart/items/:productId`, `GET /api/customer/wishlist`, `PUT /api/customer/wishlist/:productId` | Customer | UI prepared; requires product route and verified Google customer session |
| Wishlist | `GET /api/customer/wishlist`, `PUT /api/customer/wishlist/:productId` | Customer | Implemented; unauthenticated 401 verified locally; authenticated flow NOT VERIFIED |
| Cart | `GET /api/customer/cart`, `PUT /api/customer/cart/items/:productId`, `DELETE /api/customer/cart/items/:itemId` | Customer | Implemented with server subtotal and server-confirmed mutations; authenticated flow NOT VERIFIED |
| Session / profile | Better Auth Google `signIn.social`, `useSession`, sign out, `GET /api/me` for CUSTOMER role | Customer | Client integrated; Google consent/callback/session NOT VERIFIED |
| Addresses | `GET/POST /api/customer/addresses`, `PUT/DELETE /api/customer/addresses/:id` | Customer | List/add/edit/delete UI; authenticated flow NOT VERIFIED |
| Checkout review | `GET /api/customer/cart`, `GET /api/customer/addresses`, `GET /api/customer/checkout/quote?addressId=` | Customer | Server quote rendered when an address is selected; no order/payment request is sent while Cashfree is parked |
| Orders | `GET /api/orders` | Customer | Inline order summary/detail uses real order and snapshot fields; authenticated flow NOT VERIFIED |
| Tracking | `GET /api/orders/:orderId/tracking` | Customer | Normalized tracking panel within `/orders`; provider events are never invented; authenticated flow NOT VERIFIED |

## Missing or insufficient contracts

- `GET /api/products` still lacks a total count or next-page cursor. The list now supplies the card fields without detail reads and supports three whitelisted sorts and an in-stock filter.
- `GET /api/products/:slug` still lacks brand, compare-at price, exact stock quantity, and shipping estimate. These fields are omitted. Availability and published review summary are now provided by the backend.
- `GET /api/categories` does not return category image object keys. Category cards show the existing missing-image state until a real public media contract and R2 custom-domain base are configured.
- `POST /api/checkout` creates an unpaid order and reserves inventory. The new read-only quote reports the current amount under existing order rules; coupon and shipping pricing are not implemented by the order service, so no future promotion/shipping amount is implied.
- No product-slug enumeration endpoint exists. The prepared static route generator pages through `GET /api/products?limit=50&offset=…`; this can enumerate current published products but requires a build whenever a new slug is published. The local list is empty.
- No related-products endpoint or public return-policy detail endpoint exists; those sections are omitted rather than guessed.

## Static export boundary

`output: "export"` remains enabled. Next.js 16.3.6 rejects `generateStaticParams()` returning an empty array for a dynamic route in export mode. Because the local catalog has no published categories/products, the prepared category and product route files are named `page.pending.tsx` and are not active pages. No fake slugs were added. When real published catalog data exists, rename them to `page.tsx`, rebuild against the local Worker, and verify actual generated pages and metadata before deployment.

Private `/orders/[id]` and `/orders/[id]/tracking` paths cannot be enumerated at build time. This phase implements order detail and tracking panels on the fixed `/orders` page while preserving the public site as static HTML. The exact private dynamic URL strategy still requires a deployment/routing decision. Do not claim those two pathnames exist.

The current deployed Worker has not received the Phase 11e-pre backend route update. Build-time catalog validation in this phase used `CATALOG_BUILD_API_URL=http://127.0.0.1:8787` against the local Worker. Do not deploy the storefront until the backend/frontend API versions and catalog route availability are aligned.

## External gates

Google browser OAuth remains NOT VERIFIED; the existing OAuth audience/test-user and callback setup must be completed. Cashfree sandbox authentication remains parked; no payment session, payment, refund, or browser-side paid-state update was attempted. `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` is not configured in the local environment; image cards correctly show the missing-image state. Production cross-domain session cookies still need browser verification with the final frontend and API hostnames.
