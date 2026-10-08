# B. PARTIALLY VERIFIED

Verification date: 2026-10-08, Asia/Calcutta.

Production: https://ownline-ecommerce.pages.dev

Target frontend commit: `9b92a4ad3e7c4c97179b64632147faabaa1a0de5`.
Target deployment supplied for this verification: `5762b6a5-5de3-450d-a535-8da77faaeb10`.
No deployment or Cloudflare configuration operation occurred during this run.

Customer authentication, Admin authentication, Super Admin login, role isolation, the requested documents, product mapping, and media transport were verified against production in real Edge browser contexts. The authenticated application gate remains open: normal Super Admin workspaces expose no sign-out action, and intermittent HTTP 503 responses affected authenticated reads and an attempted sign-out. Targeted follow-up requests recovered, but the failures are retained as production evidence rather than converted into a clean pass.

## 1. Customer authentication — VERIFIED

The human signed in with an existing Google CUSTOMER account in an isolated visible browser. Automation did not enter Google credentials or alter OAuth settings.

- Same-origin `/api/me`: HTTP 200, role CUSTOMER.
- Existing identity: `EnvlbnlnSoUCsGRvO5MF8xn8kF6GZG7C`.
- Hard refresh retained HTTP 200 and that same identity.
- `/account` → `/` → `/search` → `/orders` → `/account` retained HTTP 200 CUSTOMER authentication and the same identity.
- Existing cart, wishlist, address and order read endpoints returned HTTP 200.
- Account UI Sign out: HTTP 200.
- `/api/me` after logout: HTTP 401.
- Account hard refresh after logout: HTTP 401 and “Sign in to continue.”

The first automated logout probe checked for the button before the account content settled. That probe's “UI sign-out missing” result was superseded by the successful settled-account UI test, not treated as a customer UI defect.

Evidence: [customer.json](production-auth-9b92a4a-20261008/customer.json), [customer-logout.json](production-auth-9b92a4a-20261008/customer-logout.json), [authenticated account](production-auth-9b92a4a-20261008/customer-authenticated-account.png), [signed-out account](production-auth-9b92a4a-20261008/customer-signed-out-account.png).

## 2. Admin authentication — VERIFIED, with intermittent API failures

Used the existing production Admin credential pair from the existing private local file. Credentials, request bodies, cookies and auth response tokens were not printed or saved in the evidence.

- Deployed `/admin` email/password form sign-in: HTTP 200.
- `/api/me`: HTTP 200, role ADMIN.
- Hard refresh retained ADMIN authentication.
- Settled `/admin/account` UI Sign out: HTTP 200.
- Subsequent `/api/me`: HTTP 401; hard refresh remained signed out and restored the operator login form.

Later content checks encountered temporary HTTP 503 responses from `/api/me`, `/api/admin/returns?limit=20&offset=0`, and `/api/auth/sign-out`. The final focused Admin check loaded returns, finance, product detail and inventory with HTTP 200, then completed UI logout successfully. This recovery does not establish the cause or eliminate the observed reliability issue.

Evidence: [admin.json](production-auth-9b92a4a-20261008/admin.json), [operator-logout.json](production-auth-9b92a4a-20261008/operator-logout.json), [failure-preserving content run](production-auth-9b92a4a-20261008/admin-content.json), [recovered targeted content run](production-auth-9b92a4a-20261008/admin-focus-content.json).

## 3. Super Admin authentication — LOGIN VERIFIED; UI LOGOUT GAP

- Existing production credential pair authenticated through the deployed `/super-admin` form: HTTP 200.
- `/api/me`: HTTP 200, role SUPER_ADMIN.
- Hard refresh retained SUPER_ADMIN authentication.
- Authenticated normal dashboard and `/super-admin/advanced` contained **zero Sign out/Log out buttons**. The workspace navigation offers no normal sign-out action.
- A same-origin browser POST to the existing `/api/auth/sign-out` endpoint returned HTTP 200.
- After that API logout, `/api/me` returned HTTP 401; hard refresh remained signed out and restored the login UI.

Backend logout/session invalidation passed. A normal Super Admin UI logout workflow could not be verified because its control is absent. No UI implementation change was made in this verification-only task.

Evidence: [super-admin.json](production-auth-9b92a4a-20261008/super-admin.json), [logout audit](production-auth-9b92a4a-20261008/super-admin-logout.json), [normal dashboard screenshot](production-auth-9b92a4a-20261008/super-admin-logout-control-audit.png).

## 4. Authorization — VERIFIED for the tested read contracts

| Context | Read contract | Result |
| --- | --- | --- |
| Anonymous | `/api/me`, `/api/admin/summary`, `/api/super-admin/summary` | HTTP 401 each |
| CUSTOMER | `/api/admin/summary`, `/api/super-admin/summary` | HTTP 403 each |
| CUSTOMER | `/admin`, `/super-admin` documents | HTTP 200 static documents; rendered “This workspace needs another account” |
| ADMIN | All seven requested Super Admin documents | HTTP 200 static documents; rendered denial instead of operator content |
| ADMIN | Super Admin summary, admins, products, roles, reconciliation, pending reviews, payouts APIs | HTTP 403 each |
| SUPER_ADMIN | Requested platform read endpoints | HTTP 200 |
| After tested logout | `/api/me` | HTTP 401, including after refresh |

A static document HTTP 200 does not imply authorization. UI denial plus HTTP 403 from its protected API is the existing contract. No role/permission changes or destructive authorization probes were performed.

## 5. Customer pages — VERIFIED for documents and the requested regression

Actual documents checked: `/`, `/search`, `/categories/phase11b2-accessories-730d72e64790`, `/products/phase11b2-cotton-tote-730d72e64790`, `/cart`, `/wishlist`, `/orders`, `/account`, `/account/addresses`, `/returns`.

Every requested customer document returned HTTP 200. The category/product entries above are the application's real catalog routes corresponding to the request's category/product shorthand. No literal `/category` or `/product` alias is claimed.

Customer checks recorded no pageerror events, HTTP 5xx responses, or horizontal overflow. Existing public product data and the product image loaded. No checkout, order, payment or shipment creation was attempted.

## 6. Operator pages — DOCUMENTS VERIFIED; CONTENT RECOVERED ON FOLLOW-UP

Admin: `/admin`, `/admin/onboarding`, `/admin/products`, `/admin/inventory`, `/admin/orders`, `/admin/returns`, `/admin/finance`.

Super Admin: `/super-admin`, `/super-admin/admins`, `/super-admin/products`, `/super-admin/roles`, `/super-admin/reconciliation`, `/super-admin/reviews`, `/super-admin/payouts`.

All fourteen actual documents returned HTTP 200. Settled browser checks confirmed API-backed content, including legitimate empty states, rather than document-only placeholders. Admin summary/profile/catalog/orders and platform sellers/products/roles/reconciliation/finance loaded with protected API HTTP 200. A focused follow-up confirmed Admin returns/finance/product detail/inventory and platform overview/pending reviews after loading finished, with their relevant API requests returning HTTP 200.

Earlier loading-state snapshots remain raw evidence; they do not establish settled content. The initial Admin content run's HTTP 503 failures remain a separate reliability finding. Next `__next.*.txt` prefetch failures were not used to classify actual document routes.

Evidence: [Admin content](production-auth-9b92a4a-20261008/admin-content.json), [Admin settled follow-up](production-auth-9b92a4a-20261008/admin-focus-content.json), [platform content](production-auth-9b92a4a-20261008/super-admin-content.json), [platform settled follow-up](production-auth-9b92a4a-20261008/super-admin-focus-content.json).

## 7. Product data flow — VERIFIED for the existing product

Product: `c549089e-32fb-4217-96d7-35dc5a40eb70`.

Admin UI/detail API → public list/detail API → customer detail page matched:

| Field | Observed value |
| --- | --- |
| Name | TEST Ownline Everyday Cotton Tote |
| Slug | `phase11b2-cotton-tote-730d72e64790` |
| Price/currency | `349.00` / INR; UI ₹349 |
| Publication | PUBLISHED on Admin side; present in public catalog |
| Category | TEST Ownline Everyday Accessories / `phase11b2-accessories-730d72e64790` |
| Subcategory | TEST Cotton Bags / `cotton-bags` |
| Variants | Empty on both Admin and public detail |
| Availability | Admin base inventory available quantity 12, reserved quantity 0; public `available=true`; customer “In stock” |
| Featured | `true` in Admin detail and public list; Admin UI “Yes” |
| Image record | ID `12bd210a-f195-4554-a8cd-97a7d706db41`; same object key, alt text and sort order in Admin/public detail |

All 20 field comparisons passed, and the settled Admin product panel displayed the same name/slug. Featured state and category names/slugs were compared through the public list because the existing public detail contract does not expose those fields. Admin-only image `variantId` is intentionally excluded from the public comparison. No API contract or product record was changed; no direct database query was performed.

Evidence: [product-comparison.json](production-auth-9b92a4a-20261008/product-comparison.json), [settled Admin product panel](production-auth-9b92a4a-20261008/admin-loaded--admin-products-id-c549089e-32fb-4217-96d7-35dc5a40eb70.png).

## 8. Media rendering — PIPELINE VERIFIED; REAL PHOTOGRAPHY NOT VERIFIED

Actual browser `<img>` source:

https://ownline-ecommerce.pages.dev/api/images/products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png

The public product API returns the existing image record. The customer page creates an actual image element, displays it without “Image coming soon,” and decodes it successfully. Natural dimensions: **1×1**. Browser image network response and explicit in-browser fetch: **HTTP 200, image/png, 68 bytes**.

This existing verification PNG establishes transport/rendering only. **A real catalog photograph is NOT VERIFIED.** No upload or R2 object modification occurred.

## 9. Responsive verification — VERIFIED for measured browser behavior

Checked all six requested sizes: **1440×960, 1280×800, 1024×768, 768×1024, 390×844, 375×812**.

- All ten customer routes were inspected at every size while authenticated: 60 route/viewport combinations.
- Both operator login forms and authenticated dashboards were inspected at every size.
- Customer navigation and operator sidebars were opened at the applicable narrow sizes and measured without horizontal overflow.
- No pageerror events or measured horizontal overflow were recorded in these checks.

The visible customer browser had screenshot timeouts on many attempts. DOM/viewport, HTTP and network evidence was retained for all combinations; representative foreground customer account captures and operator captures succeeded. Exhaustive screenshot coverage or a pixel-level visual audit is not claimed. Early network-idle waits were replaced with document/readiness checks because ongoing requests are not a document failure.

## 10. Remaining blockers and scope

1. **Super Admin normal UI has no sign-out action.** Backend logout works; an end-user sign-out workflow remains incomplete.
2. **Intermittent authenticated HTTP 503s** were observed on Admin returns, `/api/me`, and a sign-out attempt. Focused follow-ups recovered. Origin/cause and sustained reliability were not established by this browser-only task.
3. **Real catalog photography remains unverified.** The object tested is a 1×1 verification PNG, not a product photograph.

Frontend source and HEAD were left unchanged. Evidence was written locally into a new directory, preserving previous reports. Only reads and the explicitly requested authentication/session operations were permitted by the browser request guard; no attempted business mutation or provider call was recorded. Login/logout inherently create/invalidate authentication sessions; no direct production database access or business-data modification occurred.

No migration, deployment, Cloudflare/settings/secret change, R2 object change, role change, account creation, product change, checkout, order/payment/payout/shipment creation, Google OAuth change, or Resend change was performed.

Cashfree, Shiprocket and Resend remain separate production gates. Full production readiness is not claimed. The authenticated frontend gate is **not closed**; this run does not authorize frontend changes or another deployment.
