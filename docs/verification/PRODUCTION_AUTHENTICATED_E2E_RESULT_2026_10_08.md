# PRODUCTION AUTHENTICATED E2E PARTIALLY VERIFIED

Date: 2026-10-08 (Asia/Calcutta). Production application: https://ownline-ecommerce.pages.dev. Production API requests observed in Chrome use this application's same-origin `/api/*` endpoints. The previous blocked reports remain historical attempts and are not reclassified as passes.

The manually authenticated existing Google CUSTOMER session, customer refresh/navigation/logout, existing Admin and Super Admin API authentication, backend role isolation, public catalog reads, and business-data preservation passed. Required operator browser pages are missing from the deployed application, and the existing product image does not render. The complete authenticated E2E gate has not passed.

## A–L results

| Item | Result | Direct evidence / limit |
|---|---|---|
| A. Customer production browser | PARTIALLY VERIFIED | Home, search/shop, category, product detail, account, orders, wishlist, cart, and addresses return document 200. Ownline branding/theme renders. `/returns` returns document 404. No captured pageerror events. Fresh Home immediately displays the storefront; no video or intro dialog was observed, so the repository's cinematic intro cannot be called production verified. |
| B. Customer authentication | VERIFIED after manual login | Existing Google CUSTOMER user `EnvlbnlnSoUCsGRvO5MF8xn8kF6GZG7C`; `/api/me` 200 with roles `["CUSTOMER"]`. Profile renders. `/account` → `/` → `/orders` → `/account` retains the same authenticated identity. Cache-disabled reload retains CUSTOMER authentication. UI sign-out 200; subsequent `/api/me` 401; account shows “Sign in to continue”; reload remains signed out. The human completed Google sign-in; automated OAuth consent/password entry was not tested. |
| C. Super Admin authentication | API VERIFIED; login UI NOT VERIFIED | Existing account `phase11b2-superadmin-730d72e64790@example.invalid` authenticates using the approved local credential file through the production auth API from an isolated Chrome context. Sign-in 200; `/api/me` 200 with SUPER_ADMIN. Loaded root dashboard displays live counts. No deployed operator sign-in form exists. Logout 200 followed by `/api/me` 401. |
| D. Admin authentication | API VERIFIED; workspace PARTIAL | Existing account `phase11b2-admin-730d72e64790@example.invalid` authenticates through the production auth API from a separate isolated Chrome context. Sign-in 200; `/api/me` 200 with ADMIN, `adminApproved=true`, `mustChangePassword=false`. Root dashboard loads real product/order/finance data. Required workspace subpages return 404. Logout 200 followed by `/api/me` 401. |
| E. Admin authorization | Backend VERIFIED; browser gate PARTIAL | Granted permissions include `products.view` and `inventory.view`; scoped product and inventory GETs return 200. Admin GETs to Super Admin summary, roles, and products return 403. The Super Admin static shell itself returns 200, then shows “Dashboard unavailable”; no privileged data is displayed. An explicit role-gate redirect is not present. |
| F. Super Admin authorization | Read-only APIs VERIFIED; browser surfaces NOT VERIFIED | Summary, Admin list, product list, roles, review queue, reconciliation, payouts, settlements, finance settings, and existing Admin review GETs return 200. Three roles and sixteen permissions are represented. Six required browser subpages return 404. No moderation, reconciliation resolution, approval, payout, or permission mutation was tested. |
| G. Admin product visibility | API/database VERIFIED; dedicated page NOT VERIFIED | Admin detail and inventory reads expose the existing tote. Product/category/subcategory are PUBLISHED; ownership is ACTIVE; category assignment is ACTIVE; relationships match; inventory is 12 available, 0 reserved. `/admin/products` is a missing deployed page. |
| H. Admin product → Customer API data flow | Payload comparison VERIFIED; full rendered flow PARTIAL | The same stable product ID and specified fields match Admin response, direct Aiven rows, public API, and product data serialized into the deployed customer HTML. The matching image record is not rendered as an image. No fully rendered end-to-end data-flow pass is claimed. |
| I. Customer product rendering | PARTIALLY VERIFIED | Name, slug URL, ₹349.00 INR price, availability, lack of variants, and featured catalog badge match. Category/subcategory are represented in category/catalog data. Product image remains “Image coming soon,” with zero product `img` elements despite one API/database image record. |
| J. Responsive verification | Layout checks VERIFIED for available pages; unavailable workflows NOT VERIFIED | Six customer routes and both fully loaded root dashboards were inspected at all six requested sizes; measured document width shows no horizontal overflow. Screenshot contact sheets were visually reviewed. Customer and operator mobile navigation opens. Mobile search, price range, stock filter, and sort controls function. Missing operator subpage forms/tables cannot be assessed. Product purchase controls fit the mobile viewport but measure 36px high. |
| K. Production data safety | VERIFIED for checked state | Before/after counts and aggregate fingerprints match for eighteen checked tables/projections. Inventory rows, quantities, versions, publication, user roles, Admin status, and category assignments are unchanged. Orders/payments/payouts/shipments remain zero. Authentication session operations are documented below. |
| L. Known defects/blockers | OPEN | Missing operator login UI and twelve required operator subpages; missing `/returns`; product image placeholder; cinematic intro not observed. No application changes or deployment were performed. |

## Browser verified

Evidence: [customer browser/API captures](production-e2e-20261008/browser-customer.json), [additional customer checks](production-e2e-20261008/extra-customer.json), [logout](production-e2e-20261008/browser-customer-logout.json), [loaded operator dashboards](production-e2e-20261008/extra-operators.json), and [product/landing observations](production-e2e-20261008/product-provenance.json).

Available customer document routes: `/`, `/search`, `/categories/phase11b2-accessories-730d72e64790`, `/products/phase11b2-cotton-tote-730d72e64790`, `/account`, `/orders`, `/wishlist`, `/cart`, `/account/addresses` — HTTP 200. Wishlist and cart show their actual empty states; orders show “No orders yet”. Existing addresses were read without adding or changing an address. `/returns` — document HTTP 404.

Authenticated root dashboards: `/admin` and `/super-admin` — document HTTP 200, successful dashboard data fetches, and populated UI after loading settles. Admin shows 2 products, 0 orders, ₹0 available balance; Super Admin shows 1 active Admin, 2 published products, and 0 orders. Initial short observations captured loading placeholders; the supplemental dashboard evidence waits for actual summary responses and loaded content and supersedes those incomplete loading observations.

The following are actual **document** HTTP 404s:

| Admin | Super Admin |
|---|---|
| `/admin/onboarding` | `/super-admin/admins` |
| `/admin/products` | `/super-admin/products` |
| `/admin/inventory` | `/super-admin/roles` |
| `/admin/orders` | `/super-admin/reconciliation` |
| `/admin/returns` | `/super-admin/reviews` |
| `/admin/finance` | `/super-admin/payouts` |

Unauthenticated operator root pages show the workspace shell plus “Dashboard unavailable” and “Sign in with an authorized account, then try again,” but no sign-in form. Production credential validity was therefore verified through a real in-browser call to the production auth API; this does not verify a browser login form that is absent.

No captured JavaScript pageerror events occurred in the main customer/operator captures. Console/network errors include expected 401/403 responses during deliberate authorization checks and numerous Next.js `__next.*.txt` prefetch 404s. Working customer navigation was tested separately; these prefetch failures are not treated as document-route failures. Successfully observed scripts, stylesheets, and fonts returned 200. Media rendering did not pass: no product image request/image element was created for the tote.

Fresh anonymous Home returned 200 and immediately displayed the storefront; after four seconds it still had zero video elements and zero dialog elements. This establishes the observed deployed landing behavior only, not preservation of the newer repository cinematic intro.

## HTTP/API verified

All endpoints below were exercised against `https://ownline-ecommerce.pages.dev` using browser-managed credentials. No cookies, session tokens, password hashes, or provider credentials were extracted. Auth response bodies/headers were not recorded; status and `/api/me` role evidence were recorded separately.

| Actor | Read-only endpoint(s) | HTTP result / response shape |
|---|---|---|
| Public/customer | `/api/products`, filtered `/api/products?q=…` | 200; `{ products: [...] }` |
| Public/customer | `/api/categories` | 200; `{ categories: [...] }`, including the existing subcategory |
| Public/customer | `/api/products/phase11b2-cotton-tote-730d72e64790` | 200; product object with id, categoryId, subcategoryId, name, slug, price, currency, images, variants, available |
| Public/customer | `/api/products/c549089e-32fb-4217-96d7-35dc5a40eb70/reviews` | 200; `{ reviews: [] }` |
| CUSTOMER | `/api/customer/wishlist`, `/api/customer/cart`, `/api/customer/addresses`, `/api/orders` | 200; products, items/subtotal, addresses, orders respectively |
| CUSTOMER | `/api/admin/summary`, `/api/admin/products`, `/api/super-admin/summary`, `/api/super-admin/roles` | 403; `{ error: ... }` |
| ADMIN | `/api/admin/summary`, `/api/admin/onboarding`, `/api/admin/categories`, `/api/admin/products`, `/api/admin/orders`, `/api/admin/returns`, `/api/admin/finance` | 200; scoped summary/onboarding/categories/products/orders/returns/finance |
| ADMIN | `/api/admin/products/:existingProductId`, `/api/admin/products/:existingProductId/inventory` | 200 for both existing products; product object and `{ inventories: [...] }` |
| ADMIN | `/api/super-admin/summary`, `/api/super-admin/roles`, `/api/super-admin/products` | 403 |
| SUPER_ADMIN | `/api/super-admin/summary`, `/api/super-admin/admins`, `/api/super-admin/products`, `/api/super-admin/roles` | 200; summary, Admin list, product list, roles/permissions |
| SUPER_ADMIN | `/api/super-admin/reviews/pending`, `/api/super-admin/reconciliation`, `/api/super-admin/payouts`, `/api/super-admin/settlements`, `/api/super-admin/finance-settings` | 200; actual production queue/list/settings responses |
| SUPER_ADMIN | `/api/admin/review/f7f5e3e3-685a-4bfc-b4dd-084c6c115851` | 200; profile/application/documents/addresses/categories/audit/bank |
| Anonymous after logout | `/api/me`, `/api/admin/summary`, `/api/admin/products`, `/api/super-admin/summary`, `/api/super-admin/admins` | 401 |

Raw sanitized endpoint results: [Admin](production-e2e-20261008/browser-admin.json), [Super Admin](production-e2e-20261008/browser-super-admin.json), and the customer captures above. Browser network evidence identifies same-origin production `/api/*` calls; no separate claim about Worker deployment/configuration was inferred from repository files.

## Database verified and product comparison

[Before](production-e2e-20261008/database-before.json) and [after](production-e2e-20261008/database-after.json) evidence came directly from the configured Aiven database in explicit READ ONLY transactions. [Machine comparison](production-e2e-20261008/comparison.json) compares actual fields, not visually similar names.

Stable identifier chain:

```text
Admin product API: c549089e-32fb-4217-96d7-35dc5a40eb70
        ↓
Aiven products.id: c549089e-32fb-4217-96d7-35dc5a40eb70
        ↓
Public API id:     c549089e-32fb-4217-96d7-35dc5a40eb70
        ↓
Customer page:     c549089e-32fb-4217-96d7-35dc5a40eb70
```

The customer-page identifier and fields were parsed from the deployed document's Next.js serialized product props. Its image reference was resolved to the actual serialized image array. No product/cart/wishlist mutation was needed to prove the identifier.

| Field | Admin/database/public API/deployed page evidence | Result |
|---|---|---|
| Name | `TEST Ownline Everyday Cotton Tote` | Exact match; rendered h1 also matches |
| Slug | `phase11b2-cotton-tote-730d72e64790` | Exact match and actual customer URL |
| Price | `349.00` | Exact match; UI `₹349.00` |
| Currency | `INR` | Exact match; rupee rendering |
| Category ID | `f22ccfec-a2ba-42d1-a3b5-5f6f7868b299` | Exact match; published `TEST Ownline Everyday Accessories` |
| Subcategory ID | `ba53ebdc-5fe7-40f6-8bc1-3eba76bad403` | Exact match; published `TEST Cotton Bags`; linked to the same category |
| Variants | `[]`; zero database variant rows | Exact match; no variant selection expected |
| Image record | ID `12bd210a-f195-4554-a8cd-97a7d706db41`; key `products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png`; matching alt text and sort order | Exact payload match across all four layers; **rendering fails**: placeholder and zero product img elements |
| Availability | Admin inventory and DB: 12 available, 0 reserved, version 0; public/page payload `available=true`; UI “Available” | Match |
| Featured | Admin, DB, public listing `true`; customer catalog displays FEATURED | Match; detail endpoint does not expose a featured field |

Product ownership is Admin `f7f5e3e3-685a-4bfc-b4dd-084c6c115851`, ACTIVE. Product/category/subcategory are PUBLISHED; the subcategory category ID is valid; Super Admin review returns an ACTIVE assignment for the same category.

**ADMIN → DATABASE → PUBLIC API → CUSTOMER payload identity and fields match. The fully rendered end-to-end flow remains PARTIALLY VERIFIED because the matching image record does not become a rendered product image.** No complete data-flow gate pass is claimed.

The detail page is a static exported document with serialized product data. Matching fields demonstrate consistency with current production API/database state; this test does not prove automatic refresh of that static snapshot after future catalog changes. Dynamic search used real production API/network reads; no frontend mock, injected response, or fabricated product was supplied.

The second existing product is PUBLISHED, priced `1.00 INR`, unfeatured, without images/variants, and has zero available inventory. Its customer catalog card correctly shows SOLD OUT; it was not purchased or modified.

## Super Admin → Admin review

The existing Admin appears in the Super Admin API and loaded root dashboard. Review response and Admin onboarding response report ACTIVE profile and APPROVED application; review returns one document, two addresses, and one ACTIVE category assignment. `bank` is null, consistent with zero production `admin_bank_accounts` rows. No bank VERIFIED state is claimed. The dedicated review/onboarding browser pages are absent, so full browser representation of KYC/bank/category state is NOT VERIFIED. No private document or unmasked bank reveal was requested.

## Responsive and UI findings

Viewports: 1440x960, 1280x800, 1024x768, 768x1024, 390x844, 375x812.

Each size covers Home, search, category, product detail, account, settled Orders empty state, and both fully loaded operator dashboards. Document-level overflow measurements are false throughout. Screenshots were reviewed together in [customer contact sheet](production-e2e-20261008/customer-responsive-contact-sheet.png) and [operator contact sheet](production-e2e-20261008/operators-responsive-contact-sheet.png), with individual desktop/mobile product, search, menu, and dashboard views inspected at larger size. Customer mobile navigation opens and closes; Admin/Super Admin navigation drawers open. Mobile price range 100–400, available-only filter, and price-ascending sorting update the search URL and retain the existing tote result.

- **P0 — Missing deployed operator workflow pages and login forms.** Twelve required operator documents return 404 and root workspaces do not offer browser sign-in. Backend API success does not satisfy these browser workflows. The route-set gap needs a separate deployment investigation; no deployment or fix was made here.
- **P1 — Existing product media not rendered.** The same real image record exists in Admin/DB/public/deployed props, but Home/catalog/detail display placeholders. The public media base/resolution path needs separate verification; no root cause is claimed from local environment values.
- **P1 — Customer returns document absent.** `/returns` returns 404; no replacement return data was created.
- **P2 — Mobile purchase touch targets.** Add to cart, Buy now, and wishlist controls are 36px high; quantity input is 40px. They fit the viewport and were not activated. This is below the commonly recommended 44px touch target, not a claimed measured WCAG failure.
- **NOT VERIFIED — Cinematic intro.** No video/dialog intro was observed on fresh production Home; the repository's newer intro cannot be inferred as deployed.

Initial customer screenshots timed out while the visible Chrome window was minimized. Restoring the window resolved capture; final matrix screenshots and contact sheets are available. A stock-checkbox automation assertion also raced frontend navigation; a bounded follow-up confirmed the checked state and `available=true` URL. These tooling/transient observations are not classified as production application failures. No full accessibility/performance audit score is assigned from this scoped workflow verification.

## Repository/test-only evidence

Current source defines operator sign-in gates and the missing workspace pages, and uses public API reads for exported product data. This helps identify a deployed route-set discrepancy but does not prove which frontend revision is deployed. No repository tests, local build, source change, or fix is called production verification. The Impeccable audit skill guided the responsive review; its broader redesign/fix workflow was outside the requested scope.

## Production safety

All eighteen checked before/after counts and fingerprints match: users, user_roles, admins, categories, subcategories, products, product_variants, product_images, inventories, orders, order_items, payments, payout_requests, admin_settlements, shipments, admin_category_assignments, admin_credentials, and a non-secret admin_bank_accounts projection. Auth accounts/password hashes/tokens were not queried. Bank ciphertext was excluded. This is preservation evidence for these checked tables/projections, not a whole-database audit.

Retained totals: 5 users (1 Admin, 1 Super Admin, 3 customers), 2 products, 2 inventory rows, 12 available, 0 reserved. Orders, payments, payout requests, settlements, and shipments remain zero. Inventory version values, product publication, category/subcategory publication, Admin lifecycle status, and role/category assignments are unchanged.

Authentication is the only intentional production state operation: two existing-account sign-ins and two sign-outs for each operator role (main checks plus the bounded settled-dashboard follow-up), and one CUSTOMER UI sign-out. The human's Google login preceded the verification baseline. These operations create/invalidate authentication sessions through the existing auth system; no session rows/tokens/cookies were extracted or manually edited.

No accounts, products, orders, payments, payouts, or shipments were created; no inventory/product/permission/account lifecycle/password reset/schema/migration/secret/deployment/cron action occurred. Cashfree and Shiprocket were not called. Mutation guards allowed only the authorized auth sign-in/sign-out endpoints during the main browser verification. Only local verification helpers, evidence files, screenshots, and reports were written; application code was not changed.

## Not verified, blockers, and next task

Full operator browser sign-in and the twelve missing workflow pages remain NOT VERIFIED; customer returns and real product image rendering fail. Cinematic intro, mutation-dependent moderation/lifecycle/finance behavior, cross-customer ownership isolation, and future static catalog refresh are not verified in this run. No real commerce or provider processing was attempted.

One dependency-safe next task: **perform a read-only audit of the current Pages deployment artifact/revision, exported route set, and public media configuration to explain the missing pages/login/intro and image placeholders.** Prepare the concrete remediation separately; deploying or changing production remains outside this verification authorization.

The authenticated E2E gate has not passed. Cashfree payments, Cashfree payouts, Shiprocket shipments, production media, email delivery, and remaining infrastructure requirements remain separate gates. No production commerce readiness claim is made.
