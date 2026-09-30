# Phase 11b API mapping — current checkpoint and historical evidence

## CURRENT CHECKPOINT — Phase 11b-3B authenticated continuation — 2026-09-29

**Authenticated customer browser mapping remains BLOCKED.** The operator reports successful Google login in Chrome, and read-only database counts show 1 Google account and 1 unexpired CUSTOMER session. The isolated Chrome profile accessible on debugging port 9222 remained signed out: Better Auth returned no session, `/api/me` returned 401, and account UI showed the sign-in gate. The signed-in operator profile could not be attached. Signed-out wishlist, cart, addresses, quote, Admin, and Super Admin API reads returned 401. Static export scanning found no embedded local Google, Better Auth, Cashfree, database, Resend, or Redis secrets. No authenticated wishlist/cart/address/quote or customer UI behavior, refresh, or logout is claimed. No frontend API source changed. See `docs/BACKEND_VERIFICATION.md` for exact next task and test results.

## CURRENT CHECKPOINT — Phase 11b-3B — 2026-09-29

**Google customer OAuth: BLOCKED before authenticated consent/callback.** Real Chrome clicked the storefront's **Continue with Google** button and reached Google's rendered account-entry page without `redirect_uri_mismatch`. The generated redirect URI is exactly `http://127.0.0.1:8787/api/auth/callback/google`; provider `google`, `response_type=code`, `email profile openid` scopes, and `state` were observed. Frontend `signIn.social` uses `/account` as the return page; browser API requests include credentials and the Worker permits the exact `http://127.0.0.1:3000` origin. The intended Test user and registered redirect URI require Google Cloud Console confirmation. No Google account was entered, so authenticated `/api/me`, customer wishlist/cart/address/quote mapping, session persistence and logout remain unverified. Signed-out `/api/me` returned 401. No frontend API or auth code changed in 11b-3B. See `docs/BACKEND_VERIFICATION.md` for checks and the next task.

## CURRENT CHECKPOINT — Phase 11b-3A — 2026-09-29

**Phase 11b: OPEN. NOT DEPLOYED. NOT SAFE TO DEPLOY.** These statements describe the current local changes; earlier Worker deployment evidence is historical. This checkpoint supersedes all older status, “current”, “latest”, and next-task statements below. Retained historical evidence is not a claim about today's environment.

- Architecture remains Next.js 16.3.6 / React 19 / TypeScript / Tailwind 4 / shadcn/ui with `output: "export"`; Cloudflare Workers / Hono / Better Auth / Drizzle; Aiven PostgreSQL through Hyperdrive. No schema or migration change in 11b-3A.
- Development origins: frontend `http://127.0.0.1:3000`, API `http://127.0.0.1:8787`. Earlier localhost/8788 evidence is historical. Public environment examples now use these IPv4 origins; R2 stays blank in the example.
- Retained development data: **1 active Admin, 1 Super Admin, 0 customers, 1 category, 1 product**. Product is **published, featured=true, inventory=12**. Category: `phase11b2-accessories-730d72e64790`; product: `phase11b2-cotton-tote-730d72e64790`.
- **R2: real development image uploaded; HTTPS r2.dev retrieval verified; Chrome rendering verified. Production custom domain NOT configured.** The existing authorized Admin upload endpoint and existing `shop-product-images` bucket were used. No second bucket. Ignored `frontend/.env.local` sets `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-568301fa6e09442d9faf61b0274abb0c.r2.dev`; application source resolves it only through `src/lib/images.ts`.
- Retained object key: `products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png`. Prior HTTPS response: 200, image/png, 68 bytes. Prior Chrome verified direct URL, home product card and detail gallery; no R2 credentials appeared in public product JSON or image request URL. This phase reuses that object.
- **Google: External audience; browser still fails `redirect_uri_mismatch`; CUSTOMER session NOT VERIFIED.** Known callback: `http://127.0.0.1:8787/api/auth/callback/google`. No Google success is claimed or retested in this reconciliation.
- **Cashfree: PARKED.** No credentials, endpoint, adapter, payment flow, or Razorpay change.
- Minimal public/static `/admin/setup` uses existing `POST /api/admin/activate`. Email URL construction accepts HTTPS, plus only the exact local HTTP origin above. Token is removed from the browser URL, kept in memory only, submitted with no referrer, and consumed by the existing hashed-token/expiry/password activation flow. Activation leaves seller approval separate; no Admin dashboard or RBAC bypass was added. Real email delivery remains unverified.
- Static home and public category/product slug routes remain active. Private `/orders/[id]` and `/orders/[id]/tracking` remain inactive; fixed `/orders` retains inline details/tracking.
- **Exact next task:** Google browser OAuth verification → authenticated CUSTOMER session → wishlist/cart/address/checkout quote verification. Do not start Phase 11c Admin UI.

### Targeted corrections

| Boundary | Current contract |
| --- | --- |
| Admin products | `adminApi.products()` uses distinct `AdminProductSummary[]` plus limit/offset. It matches the existing Admin endpoint; no public Product coercion. |
| Customer orders | Explicit whitelist: customer order ID/number, order/payment status, created/delivered timestamps, currency/totals, contact/address snapshot, and item ID/product/variant/name/title/quantity/historical unit price/total. No Admin/customer foreign key, operational snapshots or finance internals. |
| Customer tracking | Shipment ID, carrier, AWB, public tracking URL, normalized status, estimated/delivered dates, events (status/location/description/eventTime). No Admin ID, provider status/payload or provider operational IDs. Ownership is checked before reading shipments; operator responses are unchanged. |
| R2 request boundary | Actual streamed bytes capped at 5,500,000 before multipart parsing, even without a usable Content-Length; oversized declared requests rejected immediately. Parsed file maximum remains 5,000,000 bytes. MIME/magic bytes, authorization, ownership/category scope, generated keys and R2 cleanup on DB failure retained. |
| Browser verification | Read-only storefront script imports the actual image helper and reads the public environment base; checks real image DOM/decoding and HTTPS 200 image response. Existing upload script is explicitly marked MUTATING; not rerun here. |

### Phase 11b-3A verification

Backend unit tests: **64/64 PASS**, including auth/security, customer projection/ownership and upload limits. Backend TypeScript: PASS. Frontend lint and production static export: PASS. Static build includes `/`, both retained fixture slug pages and `/admin/setup`.

Invitation integration: **PASS in real headless Chrome**, generated invitation link → static setup page → existing activation API → ACTIVE account; verified stored password hash, hashed token, expiry/reissue/reuse rejection and audit events. Temporary unique Aiven invitation records were cleaned. Desktop 1440×900 and mobile 390×844 reviewed, no horizontal overflow; mismatch recovery and token removal passed. No real email sent.

Final checks: backend `npm run typecheck`, `npm test` (**64/64**), `npx drizzle-kit check`; frontend `npm run typecheck`, `npm run lint`, `npm run build`; and `git diff --check` **PASS**. Read-only Aiven readiness after invitation cleanup confirms ADMIN=1 (ACTIVE), SUPER_ADMIN=1, CUSTOMER=0, categories=1, products=1.

Updated `node scripts/verify-phase11b3-browser.mjs`: **PASS** for all ten storefront routes, exact-origin browser API reads, signed-out protection, real home-card/detail image, centralized helper URL and HTTPS 200. Existing `verify-phase11b3-r2-browser.mjs`: **PASS** for direct image URL opening, image rendering and no R2 credential-like fields in public product JSON or credentials in the browser image request URL. These checks do not establish authenticated customer behavior.

The first static export reused a legacy catalog fetch-cache entry containing an empty image array. That specific build-cache directory was preserved under `.next/cache/fetch-cache-before-phase11b3a` and a fresh build passed with the real image. A retry hit a Chrome profile lock inside the frontend scan; the task-created profile was moved outside the frontend and the build then passed. When catalog/media changes, build from fresh catalog data and rerun the image assertion; a successful compilation alone does not prove a fresh export. No pre-existing Wrangler sidecars were removed or reset.

No unexplained current-state contradictions remain in these reconciled checkpoints. Older contradictory evidence is explicitly historical. Remaining gates: Google consent/callback/session and authenticated customer flows, production R2 custom domain, real invitation email delivery and production host/cookie verification. Cashfree stays PARKED. No deployment, staging or commit.

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b-3 R2 development-media verification — 2026-09-29

`NEXT_PUBLIC_R2_PUBLIC_BASE_URL` is configured in the ignored local frontend environment and remains the only source for the public image origin. `src/lib/images.ts` safely joins the configured HTTPS origin to a database `objectKey`; no origin is hardcoded in application source. The authorized Admin upload produced `products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png` for the retained fixture product. Its HTTPS public URL returned `200 image/png`, and headless Chrome loaded it directly plus in the home product card and product-detail gallery. Browser inspection found no R2 credential-like value in public product JSON and no credential or query parameter in the image request URL. This public `r2.dev` base is development-only and does not replace the future production custom-domain gate. No deployment occurred.

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b-3 browser and media checkpoint — 2026-09-29

The public image helper still reads only `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`; it remains unset. The existing `shop-product-images` bucket has a new backend `PRODUCT_IMAGES_BUCKET` binding and approved Admin upload API, but no controlled image was uploaded into Aiven because a real HTTPS public custom domain has not been confirmed. The product card and detail still show “Image coming soon”; public HTTPS image retrieval is **NOT VERIFIED**. Cloudflare custom-domain configuration is an operator gate. Do not use `r2.dev` as the production image base.

Local ignored frontend and Worker settings now use the same `127.0.0.1` host on ports 3000 and 8787. This avoids an unrelated IPv6 `localhost:8787` listener. Exact-origin CORS allows credentials from the frontend and rejects a foreign origin; browser `fetch(..., { credentials: "include" })` reached the public API and received 401 from logged-out protected customer endpoints. The Better Auth client also opts into credentialed requests. Google sign-in was attempted in real Chrome and stopped at Google's **Error 400: redirect_uri_mismatch** page. No consent, callback, CUSTOMER identity, persisted session, or logged-out-after-Google proof exists. The OAuth client must authorize the exact local callback `http://127.0.0.1:8787/api/auth/callback/google`; then a real permitted test user can complete the browser flow.

Real headless Chrome rendered `/`, `/search`, `/categories/phase11b2-accessories-730d72e64790`, `/products/phase11b2-cotton-tote-730d72e64790`, `/wishlist`, `/cart`, `/account`, `/account/addresses`, `/orders`, and `/checkout`. Home, category, and product pages contained the retained fixture; the product image fallback rendered. Private pages were checked only in their signed-out state. Authenticated wishlist persistence, cart quantity/subtotal, address CRUD and ownership, and checkout quote remain **NOT VERIFIED** until Google customer sign-in works. The quote implementation remains read-only; no order, stock reservation, payment, Cashfree, or Razorpay action was attempted.

`output: "export"` remains enabled. The production build generated static category and product HTML for the real slugs. `src/lib/public-catalog.ts` now uses Next's default fetch mode: development reads current API data, while `next build` prerenders the current catalog once. Explicit `force-cache` had reused an obsolete empty catalog and made a local export fail; removing it restored a successful build. Private order detail URLs remain unresolved; the fixed `/orders` route is unchanged. No frontend deployment occurred. **Phase 11b remains OPEN / NOT SAFE TO DEPLOY.**

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b-2 controlled catalog checkpoint — 2026-09-29

The existing private `backend/scripts/bootstrap-super-admin.ts` mechanism was used; no new privilege bootstrap, registration endpoint, or migration was added. One controlled test Super Admin exists. One controlled test Admin completed the existing invitation service, one-time activation API, test seller profile and private KYC upload, shipping-origin and return addresses, selling-category request, and Super Admin approval. The invitation token was reissued and consumed in-process for the synthetic `.invalid` identity; no Resend email delivery or real-person KYC review is claimed. The Admin is ACTIVE with one active category assignment. No customer was created because public credential signup is disabled and Google browser OAuth is not verified.

The retained development fixture is identified by the `phase11b2-` slug prefix and `TEST` display names: category `phase11b2-accessories-730d72e64790`, subcategory `cotton-bags`, product `phase11b2-cotton-tote-730d72e64790`. It remains in Aiven for storefront iteration. The product was created through authenticated Admin APIs, has inventory 12, and was published and marked featured through Super Admin APIs. It has no image object key because the Worker has no public product-image upload binding or API. The unconfigured R2 public base keeps the “Image coming soon” fallback visible.

Local Worker checks passed for `GET /api/categories`, the default product list, `featured=true`, `sort=newest|price-asc|price-desc`, `inStock=true`, product detail, empty published reviews, and an unknown product slug returning 404. `inStock` is now accepted as an alias for the existing `available` filter; contradictory values return 422. With only one product, the checks exercise each sort endpoint but cannot prove relative ordering between different prices or creation dates. Publication gates remain enforced by the backend queries.

Both prepared route files are active `page.tsx` files with `generateStaticParams()` and `dynamicParams = false`; `output: "export"` is unchanged. A local build generated category and product HTML and metadata for the slugs above. Local HTTP checks returned 200 for both exported `.html` files and 404 for unknown `.html` slugs. The build used `CATALOG_BUILD_API_URL=http://127.0.0.1:8788`; the ignored local `NEXT_PUBLIC_API_URL` still targets port 8787, so browser-side catalog actions were not verified in this session and local runtime URLs must be aligned before that test. Google consent/callback/session/logout remains **NOT VERIFIED**; customer checkout and payment remain blocked. The public R2 custom domain could not be rechecked in this session because Wrangler had no Cloudflare API token; the prior check found none. No deployment was performed. **Phase 11b remains OPEN; deployment is NOT SAFE.**

The sections below record the historical Phase 11b-1 checkpoint. The Worker remains authoritative for roles, prices, stock, checkout, orders, returns, and shipment status. The zero-catalog and pending-route statements below describe that earlier checkpoint; the Phase 11b-2 section above is the current state.

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b-1 API checkpoint — 2026-09-28

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

## HISTORICAL CHECKPOINT — SUPERSEDED: Missing or insufficient contracts

- `GET /api/products` still lacks a total count or next-page cursor. The list now supplies the card fields without detail reads and supports three whitelisted sorts and an in-stock filter.
- `GET /api/products/:slug` still lacks brand, compare-at price, exact stock quantity, and shipping estimate. These fields are omitted. Availability and published review summary are now provided by the backend.
- `GET /api/categories` does not return category image object keys. Category cards show the existing missing-image state until a real public media contract and R2 custom-domain base are configured.
- `POST /api/checkout` creates an unpaid order and reserves inventory. The new read-only quote reports the current amount under existing order rules; coupon and shipping pricing are not implemented by the order service, so no future promotion/shipping amount is implied.
- No product-slug enumeration endpoint exists. The prepared static route generator pages through `GET /api/products?limit=50&offset=…`; this can enumerate current published products but requires a build whenever a new slug is published. The local list is empty.
- No related-products endpoint or public return-policy detail endpoint exists; those sections are omitted rather than guessed.

## HISTORICAL CHECKPOINT — SUPERSEDED: Static export boundary

`output: "export"` remains enabled. Next.js 16.3.6 rejects `generateStaticParams()` returning an empty array for a dynamic route in export mode. Because the local catalog has no published categories/products, the prepared category and product route files are named `page.pending.tsx` and are not active pages. No fake slugs were added. When real published catalog data exists, rename them to `page.tsx`, rebuild against the local Worker, and verify actual generated pages and metadata before deployment.

Private `/orders/[id]` and `/orders/[id]/tracking` paths cannot be enumerated at build time. This phase implements order detail and tracking panels on the fixed `/orders` page while preserving the public site as static HTML. The exact private dynamic URL strategy still requires a deployment/routing decision. Do not claim those two pathnames exist.

The current deployed Worker has not received the Phase 11e-pre backend route update. Build-time catalog validation in this phase used `CATALOG_BUILD_API_URL=http://127.0.0.1:8787` against the local Worker. Do not deploy the storefront until the backend/frontend API versions and catalog route availability are aligned.

## HISTORICAL CHECKPOINT — SUPERSEDED: External gates

Google browser OAuth remains NOT VERIFIED; the existing OAuth audience/test-user and callback setup must be completed. Cashfree sandbox authentication remains parked; no payment session, payment, refund, or browser-side paid-state update was attempted. `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` is not configured in the local environment; image cards correctly show the missing-image state. Production cross-domain session cookies still need browser verification with the final frontend and API hostnames.
