# Ownline Dropship frontend design system

## Current continuation — 2026-10-04

Customer pages and both dashboards share the cream/forest identity and Instrument Serif/DM Sans typography. Reusable page headings, flat bordered commerce panels and a forest footer extend the homepage theme. Dashboard layouts remain practical, with sand Admin and forest Super Admin sidebars, responsive task navigation, labelled forms, accessible status/error states and review-before-confirm mutations. Cinematic intro/section reveals remain storefront-only. Tablet header switches to collapsed navigation below 1024px. All footer links target existing routes.

API integration and current verification are recorded in [FRONTEND_INTEGRATION_STATUS](../api/FRONTEND_INTEGRATION_STATUS.md). All older checkpoints below are historical; they do not supersede [CURRENT_STATUS](../CURRENT_STATUS.md).

## Storefront motion continuation — 2026-10-04

Customer-only addition: near-black Ownline intro, Instrument Serif brand text and DM Sans tagline; masked word reveals use 700ms exponential ease-out with a 90ms stagger. Minimum hold 2.4s, media-readiness cap 4s, curtain/hero handoff 800ms. Scroll locking coordinates native overflow and Lenis and cleans up on completion/unmount. Editorial section reveals use 650ms; image crop reveal uses 900ms with a 1100ms scale settling. Product grids remain outside reveal wrappers. Reduced motion skips the intro and reveals; server HTML is visible without JavaScript.

Dress preview uses at most nine real products, three columns from 768px and two on mobile. Audience/type buttons retain URL filtering, visible pressed states and 48px targets; other collection links follow the clothing browser. Existing campaign films/images and customer typography/palette are retained. Operators now share this brand palette in scoped utility layouts. See [campaign documentation](../catalog/STOREFRONT_CAMPAIGN.md) and [current status](../CURRENT_STATUS.md) for current verification; older checkpoint text below is historical.

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

The retained fixture now has one real product image supplied by the existing public image helper. In a real headless Chrome run, the image loaded on both the home product card and the product-detail gallery, and Chrome opened the HTTPS public object URL. The browser-facing product response contains the image object key and alt text only; no R2 credential-like fields appeared, and the image URL contains no credential or query parameter. The configured `r2.dev` base is local development configuration, not a production image-domain decision. No deployment occurred.

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b-3 browser checkpoint — 2026-09-29

Real headless Chrome rendered the home, search, published category/product, wishlist, cart, account, addresses, orders, and checkout routes. The published fixture appeared on public pages; the missing-image fallback remained because no public R2 custom domain was confirmed. Local frontend/API URLs were aligned to `127.0.0.1` and exact-origin credentialed browser requests passed. The Google button reached Google's **Error 400: redirect_uri_mismatch**, so authenticated customer pages and checkout review were not verified. Static export generated the public slug pages; fixed `/orders` remains the private order view. Phase 11b remains open and deployment unsafe. Earlier sections below are historical design checkpoints.

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b-1 catalog API checkpoint — 2026-09-28

The public product cards now consume their image, availability, and published rating directly from `GET /api/products`; the search browser exposes server-backed sort and in-stock filters. Checkout review consumes the new read-only quote and shows its server total and validation problems. TypeScript, lint, and static build against the local Worker pass. The local catalog and operator-user tables remain empty, so category/product detail routes are still pending. Public R2 media and Google browser OAuth remain unverified. See `FRONTEND_API_MAPPING.md`.

## HISTORICAL CHECKPOINT — SUPERSEDED: Phase 11b storefront checkpoint — 2026-09-28

The current working tree now includes a real API-backed home page, a backend-powered search and price-filter browser, and fixed customer routes for wishlist, cart, profile, addresses, checkout review, and orders with inline tracking. Category and product detail implementations are prepared but not active routes because the local catalog has zero published slugs and Next.js static export requires at least one generated route for each dynamic segment. See `FRONTEND_API_MAPPING.md` for exact endpoints and missing fields. Cashfree and Google browser verification remain external gates; Phase 11b is **PARTIAL / NOT COMPLETE** and deployment is **NOT SAFE**. Phase 11b checks passed: frontend typecheck, lint, static build against the local Worker, fixed-route HTTP smoke checks, and `git diff --check`.

The route foundation table and Phase 11a verification below describe the earlier foundation checkpoint. `/checkout` and `/account/addresses` are now implemented fixed routes; `/search`, `/wishlist`, `/cart`, `/orders`, and `/account` now contain API-connected UI. Dynamic catalog routes remain pending.

## HISTORICAL CHECKPOINT — SUPERSEDED: Architecture and deployment boundary

`frontend/` is an isolated npm package using Next.js 16.3.6 App Router, React 19, TypeScript, Tailwind CSS 4, and source-owned shadcn/ui components. `src/app` holds routes, `src/components/ui` holds shadcn primitives, `src/components/layout` holds shells, `src/components/catalog` holds reusable display components, `src/components/states` holds empty/loading/error states, and `src/lib` holds the centralized API contracts and image URL helper. Server Components are the default; the customer header is client-side only because its mobile sheet is interactive.

The current `output: "export"` emits `out/` for the approved Cloudflare Pages static deployment path. The three existing foundation pages are statically prerendered. Public catalog detail pages will need a build-time slug list (`generateStaticParams`) or another SEO-compatible deployment plan. Private URLs such as `/orders/[id]` and `/admin/orders/[id]` have unpredictable IDs and cannot be emitted as static files at build time. Phase 11b–11d must resolve those routes without quietly turning the public storefront into a client-only SPA. No dynamic route files are created in this phase. No frontend deployment was performed.

## HISTORICAL CHECKPOINT — SUPERSEDED: Route foundation

| Area | Created now | Prepared for later phases |
| --- | --- | --- |
| Customer | `/`, `/search`, `/wishlist`, `/cart`, `/orders`, `/account`; shared customer layout with site header, mobile navigation, footer, container, section wrapper. Linked secondary routes contain no-data foundation placeholders. | `/categories/[slug]`, `/products/[slug]`, `/checkout`, `/orders/[id]`, `/orders/[id]/tracking`, `/account/addresses` |
| Admin | `/admin` and responsive dashboard shell | `/admin/products`, `/admin/products/[id]`, `/admin/orders`, `/admin/orders/[id]`, `/admin/inventory`, `/admin/customers`, `/admin/reviews`, `/admin/returns`, `/admin/finance`, `/admin/settings` |
| Super Admin | `/super-admin` and responsive platform shell | `/super-admin/admins`, `/super-admin/admins/[id]`, `/super-admin/products`, `/super-admin/orders`, `/super-admin/customers`, `/super-admin/reviews`, `/super-admin/returns`, `/super-admin/finance`, `/super-admin/payouts`, `/super-admin/roles`, `/super-admin/shipping`, `/super-admin/support`, `/super-admin/cms`, `/super-admin/audit-logs`, `/super-admin/settings` |

The foundation pages contain no product, metric, or category fixtures. Customer navigation links only to existing foundation routes. A placeholder route is not a completed customer flow. Authentication screens, role redirects, API data rendering, SEO detail pages, and dashboards belong to later phases.

## Visual system

The original Ownline direction is a warm editorial storefront with a quiet evergreen action color, off-white canvas, dark green-black text, and restrained sand accent. Product imagery should lead category and product surfaces when real assets exist. Customer compositions use open space and horizontal category presentation; operator shells use clear boundaries and compact utility typography.

The approved references are [USUL](https://usul.kr/) for spacious, image-led retail pacing and [Skanvi](https://skanvi.com/) for category/product navigation clarity. No logo, layout, copy, imagery, palette, or component design was copied from either site or from Dribbble.

Tokens live in `frontend/src/app/globals.css`:

| Token | Value / usage |
| --- | --- |
| Page width | `--page-max: 88rem`; `.site-container` |
| Horizontal gutter | `--page-gutter: clamp(1rem, 4vw, 4rem)` |
| Vertical section rhythm | `.section-space: clamp(3.5rem, 8vw, 8rem)` |
| Canvas / text | `#f8f6f1` / `#202820` |
| Primary / accent | `#254936` / `#d4b28e` |
| Muted / border | `#5c665f` / `#d8d8cf` |
| Radius / shadow | `0.75rem` / `0 12px 36px -26px rgb(21 39 27 / 24%)` |
| Display type | Instrument Serif, `.type-display`, `.type-page`, `.type-section` |
| Body / meta / price | DM Sans, `.type-body`, `.type-meta`, `.type-price` |

Next.js font loading supplies the two typefaces. Text, controls, and focus rings use semantic tokens. Inputs, buttons, cards, badges, separator, sheet, dialog, dropdown menu, and skeleton are source-owned shadcn/ui primitives under `src/components/ui`. Add other primitives only when a real page needs them. Customer components are `ProductCard`, `CategoryCard`, `ProductGrid`, `SectionHeading`, `PriceDisplay`, `RatingDisplay`, `EmptyState`, `LoadingState`, and `ErrorState`; all accept data as props and have no embedded business records.

Mobile navigation uses a keyboard-accessible Sheet; dashboards use a persistent desktop sidebar and a mobile Sheet. Components use semantic links/buttons, alt text for available images, visible focus, a skip link on the storefront, and reduced-motion handling. Customer layouts scale mobile → tablet → desktop; operator layouts are desktop-oriented but support narrow screens.

## Public configuration and media

`frontend/.env.example` contains only public variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin and metadata base; local example `http://127.0.0.1:3000` |
| `NEXT_PUBLIC_API_URL` | Worker API origin; local example `http://127.0.0.1:8787` |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | Environment-configured public media base; blank in example, development r2.dev configured locally; production custom domain pending |

`src/lib/api/` (`client.ts` resolves the API origin) is the only authenticated API boundary and preserves the existing browser-facing Worker contracts. `src/lib/images.ts` converts a database `objectKey` into a URL on the configured public R2 domain; an unset or invalid base returns no image. Product and category cards show a neutral missing-image state until the API supplies object keys and the public domain is configured. No R2 credential, Cashfree credential, or other backend secret belongs in `NEXT_PUBLIC_*`.

The existing `frontend/.env.local`, route stubs, API helper, and Next config were preserved and adapted. The original no-op `middleware.ts` was removed because static export cannot use middleware. The development server generated `AGENTS.md` and `CLAUDE.md` containing Next.js version guidance.

## HISTORICAL CHECKPOINT — SUPERSEDED: Verification

`npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed. The build produced static `/`, `/search`, `/wishlist`, `/cart`, `/orders`, `/account`, `/admin`, `/super-admin`, and 404 pages. The development server returned HTTP 200 for the three main foundation routes. Phase 11a does not include storefront data, real auth flows, dashboard KPIs, payment, or deployment. **Next task: Phase 11b Customer Storefront.**
