# Ownline Dropship frontend foundation — Phase 11a

## Phase 11b-1 catalog API checkpoint — 2026-09-28

The public product cards now consume their image, availability, and published rating directly from `GET /api/products`; the search browser exposes server-backed sort and in-stock filters. Checkout review consumes the new read-only quote and shows its server total and validation problems. TypeScript, lint, and static build against the local Worker pass. The local catalog and operator-user tables remain empty, so category/product detail routes are still pending. Public R2 media and Google browser OAuth remain unverified. See `FRONTEND_API_MAPPING.md`.

## Phase 11b storefront checkpoint — 2026-09-28

The current working tree now includes a real API-backed home page, a backend-powered search and price-filter browser, and fixed customer routes for wishlist, cart, profile, addresses, checkout review, and orders with inline tracking. Category and product detail implementations are prepared but not active routes because the local catalog has zero published slugs and Next.js static export requires at least one generated route for each dynamic segment. See `FRONTEND_API_MAPPING.md` for exact endpoints and missing fields. Cashfree and Google browser verification remain external gates; Phase 11b is **PARTIAL / NOT COMPLETE** and deployment is **NOT SAFE**. Phase 11b checks passed: frontend typecheck, lint, static build against the local Worker, fixed-route HTTP smoke checks, and `git diff --check`.

The route foundation table and Phase 11a verification below describe the earlier foundation checkpoint. `/checkout` and `/account/addresses` are now implemented fixed routes; `/search`, `/wishlist`, `/cart`, `/orders`, and `/account` now contain API-connected UI. Dynamic catalog routes remain pending.

## Architecture and deployment boundary

`frontend/` is an isolated npm package using Next.js 16.3.6 App Router, React 19, TypeScript, Tailwind CSS 4, and source-owned shadcn/ui components. `src/app` holds routes, `src/components/ui` holds shadcn primitives, `src/components/layout` holds shells, `src/components/catalog` holds reusable display components, `src/components/states` holds empty/loading/error states, and `src/lib` holds the centralized API contracts and image URL helper. Server Components are the default; the customer header is client-side only because its mobile sheet is interactive.

The current `output: "export"` emits `out/` for the approved Cloudflare Pages static deployment path. The three existing foundation pages are statically prerendered. Public catalog detail pages will need a build-time slug list (`generateStaticParams`) or another SEO-compatible deployment plan. Private URLs such as `/orders/[id]` and `/admin/orders/[id]` have unpredictable IDs and cannot be emitted as static files at build time. Phase 11b–11d must resolve those routes without quietly turning the public storefront into a client-only SPA. No dynamic route files are created in this phase. No frontend deployment was performed.

## Route foundation

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
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin and metadata base; local example `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Worker API origin; local example `http://localhost:8787` |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | Public custom-domain base for product media; blank until configured |

`src/lib/api.ts` is the only API origin resolver and preserves the existing browser-facing Worker contracts. `src/lib/images.ts` converts a database `objectKey` into a URL on the configured public R2 domain; an unset or invalid base returns no image. Product and category cards show a neutral missing-image state until the API supplies object keys and the public domain is configured. No R2 credential, Cashfree credential, or other backend secret belongs in `NEXT_PUBLIC_*`.

The existing `frontend/.env.local`, route stubs, API helper, and Next config were preserved and adapted. The original no-op `middleware.ts` was removed because static export cannot use middleware. The development server generated `AGENTS.md` and `CLAUDE.md` containing Next.js version guidance.

## Verification

`npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed. The build produced static `/`, `/search`, `/wishlist`, `/cart`, `/orders`, `/account`, `/admin`, `/super-admin`, and 404 pages. The development server returned HTTP 200 for the three main foundation routes. Phase 11a does not include storefront data, real auth flows, dashboard KPIs, payment, or deployment. **Next task: Phase 11b Customer Storefront.**
