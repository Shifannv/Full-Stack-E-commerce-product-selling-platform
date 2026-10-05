# FRONTEND → BACKEND API GAP AUDIT

Audit date: **2026-10-04**, with the three CUSTOMER mutation entries updated from authenticated local E2E verification on **2026-10-05**. Project: **OWNLINE DROPSHIP**. Scope: current local working tree, including uncommitted frontend redesign and backend changes. This is not production verification.

## Summary

- Total frontend API calls: **106 distinct method/path contracts** (including parked wrappers, four Better Auth calls and conditional Worker media).
- FULLY MATCHED: **65**
- FRONTEND MAPPING BUG: **2**
- RESPONSE CONTRACT MISMATCH: **3**
- AUTHORIZATION/ROLE GAP: **2**
- DATA GAP: **4**
- MISSING BACKEND API: **0**
- EXTERNAL DEPENDENCY BLOCK: **17**
- FRONTEND-ONLY: **0**
- MOCKED / NOT ACTUALLY VERIFIED: **13**

**Counting:** a call is a distinct HTTP method plus normalized route template. Repeated components, build/runtime versions, wrapper/registry duplicates and retries count once; POST and PUT address saves count separately. Parked checkout/provider call specifications count because they exist in source, but are identified as inactive. Better Auth's four frontend operations count individually, though Hono registers them through one wildcard. Conditional `/api/images/*` is included as a media request. OAuth callbacks, webhooks, diagnostics and an unused activation preflight are not frontend calls.

**Do not mistake zero F calls for complete feature coverage.** Every currently declared frontend request has a registered backend destination. Missing capabilities have no current caller and are listed separately below; adding them to the call denominator would invent frontend requests. The feature coverage section identifies **14 missing capability groups**, including three explicitly requested but absent UI areas. Data and authorization problems can also occur despite a registered route.

**Classification rule:** each call has exactly one primary A–I status. A is a source contract match, not live verification. A known B/C/D/E defect takes precedence over a mock; G takes precedence where external readiness is the blocker; I identifies otherwise compatible calls whose latest reported browser/API success came from a mock or synthetic server. Other A calls were not exercised by that browser script and are explicitly source-only here. Shared endpoint classifications apply to every listed caller. Additional feature gaps do not reclassify or double-count the call.

The 76 operator task definitions resolve to 69 active and 7 gated forms. Direct registration inspection confirms **108 distinct explicit Worker handlers**, excluding middleware/Better Auth ALL. The original source audit did not execute handlers; the three CUSTOMER mutations above were subsequently exercised against the isolated local test database and authenticated browser. No provider, deployment or production operation was performed.

## CUSTOMER

| Feature | Frontend route | Backend route | Status | Required backend change |
|---|---|---|---|---|
| API-001 Published categories | /; /search; /clothing; /categories/[slug]; /super-admin; /super-admin / OperatorWorkspace | `GET /api/categories` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-002 Catalog, home grids, filters and pagination | /; /search; /clothing; /categories/[slug] | `GET /api/products` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-003 Product detail and variants | /products/[slug]; /wishlist | `GET /api/products/:slug` | E. DATA GAP | Expose eligibility/availability projection (P1). |
| API-004 Published reviews | /products/[slug] | `GET /api/products/:productId/reviews` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-005 Cart read | /cart; /checkout | `GET /api/customer/cart` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-006 Add/change cart line | /products/[slug]; /cart | `PUT /api/customer/cart/items/:productId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-007 Remove cart line | /cart | `DELETE /api/customer/cart/items/:itemId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-008 Wishlist read | /wishlist; /products/[slug] | `GET /api/customer/wishlist` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-009 Wishlist toggle | /wishlist; /products/[slug]; ProductCard/WishlistButton | `PUT /api/customer/wishlist/:productId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-010 Address list | /account/addresses; /checkout | `GET /api/customer/addresses` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-011 Create address | /account/addresses | `POST /api/customer/addresses` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-012 Edit address | /account/addresses | `PUT /api/customer/addresses/:addressId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-013 Delete address | /account/addresses | `DELETE /api/customer/addresses/:addressId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-014 Checkout quote | /checkout | `GET /api/customer/checkout/quote` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-015 Checkout creation (parked wrapper) | /checkout (button disabled; no active call site) | `POST /api/checkout` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-016 Payment session (parked wrapper) | /checkout (no active call site) | `POST /api/orders/:orderId/payment-session` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-017 Orders and item actions | /orders | `GET /api/orders` | E. DATA GAP | Expose eligibility/availability projection (P1). |
| API-018 Order detail wrapper | No active detail fetch; /orders renders list-provided items | `GET /api/orders/:orderId` | E. DATA GAP | Expose eligibility/availability projection (P1). |
| API-019 Cancel unpaid order | /orders / CancelOrder | `POST /api/orders/:orderId/cancel` | A. FULLY MATCHED; local E2E PASS | None established for this call; see contract notes. |
| API-020 Tracking | /orders / Tracking | `GET /api/orders/:orderId/tracking` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-021 Submit review | /orders / OrderItemActions | `POST /api/reviews` | A. FULLY MATCHED; local E2E PASS | None established for this call; see contract notes. |
| API-022 Request return | /orders / OrderItemActions | `POST /api/returns` | A. FULLY MATCHED; local E2E PASS | None established for this call; see contract notes. |
| API-023 Return status | /returns?id=… / ReturnLookup | `GET /api/returns/:returnId` | C. RESPONSE CONTRACT MISMATCH | Optional normalize absent refund to null; frontend optional type also resolves. |

## ADMIN

| Feature | Frontend route | Backend route | Status | Required backend change |
|---|---|---|---|---|
| API-029 Invitation activation | /admin/setup / InvitationSetup | `POST /api/admin/activate` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-030 Dashboard cards | /admin / RoleDashboard | `GET /api/admin/summary` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-032 Browse products | /admin / OperatorWorkspace; /admin / RoleDashboard (limit=5) | `GET /api/admin/products` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-033 Assigned categories & fields | /admin / OperatorWorkspace | `GET /api/admin/categories` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-034 Create a product | /admin / OperatorWorkspace | `POST /api/admin/products` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-035 Edit a product | /admin / OperatorWorkspace | `PATCH /api/admin/products/:productId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-036 Create a subcategory | /admin / OperatorWorkspace | `POST /api/admin/subcategories` | B. FRONTEND MAPPING BUG | None established for this call; see contract notes. |
| API-037 Add a product variant | /admin / OperatorWorkspace | `POST /api/admin/products/:productId/variants` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-038 Read inventory & current versions | /admin / OperatorWorkspace | `GET /api/admin/products/:productId/inventory` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-039 Set available inventory | /admin / OperatorWorkspace | `PUT /api/admin/products/:productId/inventory` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-040 Upload a product image | /admin / OperatorWorkspace | `POST /api/admin/products/:productId/images/upload` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-041 Attach an existing uploaded image | /admin / OperatorWorkspace | `POST /api/admin/products/:productId/images` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-042 Seller application | /admin / OperatorWorkspace | `GET /api/admin/onboarding` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-043 Save seller details | /admin / OperatorWorkspace | `PUT /api/admin/onboarding/kyc` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-044 Upload verification document | /admin / OperatorWorkspace | `POST /api/admin/onboarding/kyc/documents` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-045 Save operational address | /admin / OperatorWorkspace | `PUT /api/admin/onboarding/addresses/:type` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-046 Request a category assignment | /admin / OperatorWorkspace | `POST /api/admin/onboarding/categories/:categoryId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-047 Submit application for review | /admin / OperatorWorkspace | `POST /api/admin/onboarding/submit` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-048 Your orders | /admin / OperatorWorkspace | `GET /api/admin/orders` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-049 Inspect an order | /admin / OperatorWorkspace | `GET /api/admin/orders/:orderId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-050 Shipment tracking | /admin / OperatorWorkspace | `GET /api/admin/orders/:orderId/tracking` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-051 Inspect a return | /admin / OperatorWorkspace; /super-admin / OperatorWorkspace | `GET /api/admin/returns/:returnId` | C. RESPONSE CONTRACT MISMATCH | Optional normalize absent refund to null; frontend optional type also resolves. |
| API-052 Approve or decline a return | /admin / OperatorWorkspace | `POST /api/admin/returns/:returnId/decision` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-053 Record a returned item received | /admin / OperatorWorkspace | `POST /api/admin/returns/:returnId/received` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-054 Record quality inspection | /admin / OperatorWorkspace | `POST /api/admin/returns/:returnId/inspection` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-055 Balance, settlements & payouts | /admin / OperatorWorkspace | `GET /api/admin/finance` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-056 Request available payout | /admin / OperatorWorkspace | `POST /api/admin/payouts` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-057 Create shipment | /admin / OperatorWorkspace | `POST /api/admin/orders/:orderId/shipments` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-058 Assign courier tracking number | /admin / OperatorWorkspace | `POST /api/admin/shipments/:shipmentId/awb` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-059 Request courier pickup | /admin / OperatorWorkspace | `POST /api/admin/shipments/:shipmentId/pickup` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-062 Account lifecycle | /admin / OperatorWorkspace | `GET /api/admin/account/lifecycle` | D. AUTHORIZATION/ROLE GAP | None established for this call; see contract notes. |
| API-063 Request account deletion | /admin / OperatorWorkspace | `POST /api/admin/account/deletion-requests` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-064 Verify deletion request | /admin / OperatorWorkspace | `POST /api/admin/account/deletion-requests/:requestId/verify` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-065 Request account recovery | /admin / OperatorWorkspace | `POST /api/admin/account/recovery-requests` | D. AUTHORIZATION/ROLE GAP | None established for this call; see contract notes. |

## SUPER ADMIN

| Feature | Frontend route | Backend route | Status | Required backend change |
|---|---|---|---|---|
| API-031 Dashboard cards | /super-admin / RoleDashboard | `GET /api/super-admin/summary` | C. RESPONSE CONTRACT MISMATCH | Correct pending-approval metric semantics or bind UI to pendingKycApplications (C2). |
| API-060 Provider pickup locations | /super-admin / OperatorWorkspace | `GET /api/admin/shipping/provider-pickups` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-061 Check courier serviceability | /super-admin / OperatorWorkspace | `GET /api/admin/shipping/serviceability` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-066 Browse seller accounts | /super-admin / OperatorWorkspace; /super-admin / RoleDashboard (limit=5) | `GET /api/super-admin/admins` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-067 Inspect seller application | /super-admin / OperatorWorkspace | `GET /api/admin/review/:adminId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-068 Decide seller application | /super-admin / OperatorWorkspace | `POST /api/admin/review/:adminId/decision` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-069 Invite a seller | /super-admin / OperatorWorkspace | `POST /api/admin/review/invite` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-070 Resend seller invitation | /super-admin / OperatorWorkspace | `POST /api/admin/review/reinvite` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-071 Download verification document | /super-admin / OperatorWorkspace | `GET /api/admin/review/:adminId/documents/:documentId` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-072 Correct seller details | /super-admin / OperatorWorkspace | `PATCH /api/admin/review/:adminId/kyc` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-073 Correct seller address | /super-admin / OperatorWorkspace | `PUT /api/admin/review/:adminId/addresses/:type` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-074 Suspend or recover a seller | /super-admin / OperatorWorkspace | `POST /api/admin/review/:adminId/status` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-075 Change category assignment | /super-admin / OperatorWorkspace | `PUT /api/admin/review/:adminId/categories/:categoryId` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-076 Create a category | /super-admin / OperatorWorkspace | `POST /api/admin/catalog/categories` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-077 Create a subcategory | /super-admin / OperatorWorkspace | `POST /api/admin/catalog/subcategories` | B. FRONTEND MAPPING BUG | None established for this call; see contract notes. |
| API-078 Change categories publication | /super-admin / OperatorWorkspace | `PATCH /api/admin/catalog/categories/:categoryId/status` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-079 Change subcategories publication | /super-admin / OperatorWorkspace | `PATCH /api/admin/catalog/subcategories/:subcategoryId/status` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-080 Change products publication | /super-admin / OperatorWorkspace | `PATCH /api/admin/catalog/products/:productId/status` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-081 Change product featuring | /super-admin / OperatorWorkspace | `PATCH /api/admin/catalog/products/:productId/featured` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-082 Configure category product field | /super-admin / OperatorWorkspace | `PUT /api/admin/catalog/fields` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-083 Reviews awaiting moderation | /super-admin / OperatorWorkspace | `GET /api/super-admin/reviews/pending` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-084 Moderate a review | /super-admin / OperatorWorkspace | `POST /api/super-admin/reviews/:reviewId/moderate` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-085 Authorize inspected refund | /super-admin / OperatorWorkspace | `POST /api/super-admin/returns/:returnId/refund/authorize` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-086 Submit refund to payment provider | /super-admin / OperatorWorkspace | `POST /api/super-admin/returns/:returnId/refund/submit` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-087 Commission & gateway fee settings | /super-admin / OperatorWorkspace | `GET /api/super-admin/finance-settings` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-088 Set commission | /super-admin / OperatorWorkspace | `PUT /api/super-admin/finance-settings/commission` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-089 Set payment gateway fee | /super-admin / OperatorWorkspace | `PUT /api/super-admin/finance-settings/payment-gateway-fee` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-090 Create eligible settlement | /super-admin / OperatorWorkspace | `POST /api/super-admin/settlements` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-091 Approve or decline payout | /super-admin / OperatorWorkspace | `POST /api/super-admin/payouts/:payoutId/decision` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-092 Record completed external payout | /super-admin / OperatorWorkspace | `POST /api/super-admin/payouts/:payoutId/paid` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-093 Unresolved reconciliation items | /super-admin / OperatorWorkspace | `GET /api/super-admin/reconciliation` | E. DATA GAP | Align reconciliation cursor filtering with ordering (E3). |
| API-094 Inspect reconciliation item | /super-admin / OperatorWorkspace | `GET /api/super-admin/reconciliation/:id` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-095 Resolve reconciliation item | /super-admin / OperatorWorkspace | `POST /api/super-admin/reconciliation/:id/resolve` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-096 Escalate reconciliation item | /super-admin / OperatorWorkspace | `POST /api/super-admin/reconciliation/:id/escalate` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-097 Enable or disable Shiprocket | /super-admin / OperatorWorkspace | `PUT /api/admin/shipping/providers/shiprocket` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-098 Map seller pickup location | /super-admin / OperatorWorkspace | `PUT /api/admin/shipping/pickup-locations` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-099 Inspect shipping operations | /super-admin / OperatorWorkspace | `GET /api/super-admin/shipping/operations` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-100 Reconcile shipping records | /super-admin / OperatorWorkspace | `POST /api/super-admin/shipping/reconcile` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-101 Retry shipping reconciliation | /super-admin / OperatorWorkspace | `POST /api/super-admin/shipping/operations/:id/retry` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-102 Record verified shipping evidence | /super-admin / OperatorWorkspace | `POST /api/super-admin/shipping/operations/:id/evidence` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-103 Inspect seller lifecycle | /super-admin / OperatorWorkspace | `GET /api/admin/review/:adminId/lifecycle` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-104 Decide deletion request | /super-admin / OperatorWorkspace | `POST /api/admin/review/:adminId/deletion-requests/:requestId/decision` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-105 Decide recovery request | /super-admin / OperatorWorkspace | `POST /api/admin/review/:adminId/recovery-requests/:requestId/decision` | A. FULLY MATCHED | None established for this call; see contract notes. |

## Shared authentication and media

| Feature | Frontend route | Backend route | Status | Required backend change |
|---|---|---|---|---|
| API-024 Current actor | CustomerGate/useCustomerSession; /admin; /super-admin / OperatorGate | `GET /api/me` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-025 Session/profile | /account; CustomerGate; product actions | `GET /api/auth/*` | I. MOCKED / NOT ACTUALLY VERIFIED | None established for this call; see contract notes. |
| API-026 Operator sign-in | /admin; /super-admin / OperatorGate | `POST /api/auth/*` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-027 Sign-out | /account; /admin; /super-admin | `POST /api/auth/*` | A. FULLY MATCHED | None established for this call; see contract notes. |
| API-028 Google sign-in | CustomerGate / account | `POST /api/auth/*` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |
| API-106 Product media (conditional Worker URL) | ProductGallery; ProductCard; wishlist | `GET /api/images/*` | G. EXTERNAL DEPENDENCY BLOCK | None established for this call; see contract notes. |

## Feature coverage and findings

| Feature | Frontend route | Backend route | Status | Required backend change |
|---|---|---|---|---|
| Customer return history/list | `/returns` currently requires a saved reference | Only `GET /api/returns/:returnId` | F. MISSING BACKEND API | F1: owner-scoped list; existing return creation/status remain usable |
| Admin return queue | `/admin`, manual reference forms | Only return detail/decision/received/inspection | F. MISSING BACKEND API | F2: seller-scoped queue |
| Private Admin product editor discovery, variants and images | `/admin`, manual product/variant references | Summary list and inventory GET exist; no private product-detail or image-list GET | F. MISSING BACKEND API | F3: private product detail including variant/image data |
| Super Admin draft catalog/category/subcategory discovery | `/super-admin`, publication forms | Public categories hide drafts; seller product list requires approved ADMIN and own scope | F. MISSING BACKEND API | F4: privileged catalog list/detail; do not repurpose public API or loosen seller scope |
| Platform payout queue/detail | `/super-admin`, reference-based decision/paid forms | Writes exist; seller finance is own ADMIN only | F. MISSING BACKEND API | F5: queue/detail with seller/status filters |
| Platform settlements and eligible-item discovery | `/super-admin`, settlement by orderItemId | Settlement POST exists; no platform settlement list or eligible-item list | F. MISSING BACKEND API | F6: read-side discovery; reuse eligibility logic |
| Super Admin per-seller finance inspection | Described by integration report, absent from registry | `GET /api/admin/finance` requires approved ADMIN and derives own adminId | F. MISSING BACKEND API | F7: explicit SUPER_ADMIN seller-finance read |
| Super Admin return/refund discovery | `/super-admin`, inspect/authorize by reference | Return detail and refund writes exist; no platform return/refund queue | F. MISSING BACKEND API | F8: queue of returns/refund states |
| Runtime capabilities/readiness | `/checkout`, both workspaces use hardcoded gate strings | No safe application-readiness endpoint | F. MISSING BACKEND API | F9: booleans/reason codes; health endpoints are not business readiness |
| Dashboard time series | Both dashboards explicitly defer the chart | Aggregate summaries only | F. MISSING BACKEND API | F10: optional analytics series if chart is to be completed |
| Lifecycle queue discovery | `/super-admin`, seller/request references | Per-seller lifecycle GET exists, but no global pending deletion/recovery queue | F. MISSING BACKEND API | F11: global queue. Existing per-seller workflow works without this enhancement |
| Customer notifications | No notification component, hook or call found | No notification route/service/schema found | F. MISSING BACKEND API | F12: future feature, not a broken current request; persistence design needed |
| Super Admin customers | No current customer-management component/call | No customer list/detail administration route/service | F. MISSING BACKEND API | F13: future read-side customer management; do not invent customer mutation policy |
| Permission administration | `/api/me` reads effective grants; no grant editor | RBAC tables/middleware exist; no permission-management API | F. MISSING BACKEND API | F14: future inspection API; permission writes require a separately defined policy |
| Item action eligibility | `/orders` | Customer order responses omit item delivery, existing review, return window/remaining quantity and cancellation eligibility | E. DATA GAP | E1: safe derived projection; keep mutation-time validation |
| Selected variant availability | `/products/[slug]` | Product detail returns variants and only aggregate availability | E. DATA GAP | E2: per-variant availability; no need to expose private inventory quantities |
| Super Admin configurable field readback | `/super-admin`, configure-field form | PUT exists; public categories omit fields; seller category config is ADMIN-only | E. DATA GAP | Include fields in F4 private catalog detail; do not authorize Super Admin through a seller identity |
| Archived seller recovery entry | `/admin` | Recovery/status endpoints use archive-aware auth | D. AUTHORIZATION/ROLE GAP | Frontend admission/routing fix; backend already supports intended restricted use |
| Task visibility for pending/unapproved Admin or missing permissions | `/admin` | Actor has approval/permissions and routes enforce them | H. FRONTEND-ONLY | Use actor grants to hide/disable unavailable tasks and explain onboarding. No blanket RBAC bypass |
| Subcategory description form | Both workspaces | Both create-subcategory handlers reuse service without description persistence | B. FRONTEND MAPPING BUG | Remove unsupported frontend field. Adding persistence would be a separate requirement/schema change |
| Return `refund` absence | `/returns`; typed Admin wrapper | `getReturn` emits `undefined` when no refund row | C. RESPONSE CONTRACT MISMATCH | Normalize to null or make frontend field optional; current UI truthiness check is safe |
| Explicit clearing and prefilled edits | `/admin` edit-product | PATCH already accepts empty/null for supported optional fields | H. FRONTEND-ONLY | Serializer omits blank optional fields, so cannot express clearing; add explicit UI intent |
| Product/category static URLs and published reviews | Static export routes | Public catalog/reviews routes exist | H. FRONTEND-ONLY | Rebuild for new slugs and refresh/rebuild stale details/reviews; no new slug-enumeration route needed |
| Clothing audience/type filters | `/clothing` | Existing public product category/subcategory data | H. FRONTEND-ONLY | Current filters infer from names/slugs locally; no nonexistent audience query is sent. Structured taxonomy is a separate product decision |
| Product cards without media, missing catalog content | Storefront | Product-image upload/metadata and catalog endpoints exist | G. EXTERNAL DEPENDENCY BLOCK | Real authorized catalog/media and production domain verification; do not seed guesses |
| Account profile | `/account` | Better Auth session user and `/api/me` | I. MOCKED / NOT ACTUALLY VERIFIED | Current page is read-only; no profile-edit request exists, so no invented profile-update gap |
| General platform settings / payout bank forms | No general settings/bank form in current UI | Finance settings and shipping-provider configuration exist | H. FRONTEND-ONLY | No further current contract to satisfy; define requirements before proposing arbitrary settings or bank storage |
| Other dashboard cards, records and attention counts | `/admin`, `/super-admin` | Real summary/list handlers | I. MOCKED / NOT ACTUALLY VERIFIED | Existing data fields match; exception: pending-approval semantics described below (C2) |
| Reconciliation pagination | `/super-admin`, after_id form field | GET `/api/super-admin/reconciliation` | E. DATA GAP | Cursor filters UUID alone while sort uses createdAt then UUID; align them to avoid omissions/repeats (E3) |

### What the latest redesign actually introduced

The new dashboard cards read existing summary fields, but the Super Admin pending-approval card has a semantic defect: `admins.pending` counts `PENDING` accounts while submitted applications transition to `PENDING_SUPER_ADMIN_APPROVAL`. The actual submitted-review queue can therefore be nonempty while that card shows zero. `onboarding.pendingKycApplications` already counts the submitted KYC state correctly. `RoleDashboard` has no invented revenue chart: it explicitly says a time-series API is needed. Product/admin preview lists use real APIs; `Promise.all` means one failed request hides the combined dashboard. The workspace renders generic task responses, rather than full domain editors. Having a working POST by manually typed UUID does not create a discoverable queue.

`OperatorGate` checks role but not `adminApproved` or individual permissions. That permits onboarding for unapproved Admins, which is useful, but also exposes operational tasks that the backend correctly denies. The latest mock actor has **no permissions** yet mock inventory/dashboard calls succeed; the real handlers would deny those calls. This is a frontend permission-presentation and test-evidence gap, not a reason to weaken authorization.

Customer item actions are shown only when **the whole order** is `DELIVERED`. Review validation uses delivered shipment items; returns require delivered shipment and order timestamps, the current product Dress/returnEnabled settings, quantity bounds, no prior return for the item, and the five-day window measured from order delivery. Mixed deliveries, existing reviews and expired/disabled returns are not represented in the response. This is a real read-contract gap. Cancellation also needs more than `CREATED/PENDING`: the backend checks reservation state and payment deadline. Mock success cannot establish eligibility.

### Documentation discrepancies

- `API_ROUTE_MAP.md` lists **GET `/api/admin/products/:productId/images`**, but no such explicit handler appears in current `products.ts`, service exports, or `app.routes`. The registry has upload/attach, not image-list. Public product detail provides images only for published, publicly eligible products. This is a missing private discovery capability, not an existing frontend call returning 404.
- `FRONTEND_INTEGRATION_STATUS.md` claims Super Admin seller-finance connections. The current registry has global finance settings, settlements and payout writes, but no per-seller finance read. `/api/admin/finance` requires ADMIN + approval + `payouts.view` and always derives the current user's adminId.
- The integration report says retired `/api/admin/review/provision` returns **410**. Current implementation throws `DomainError(..., 422)` after SUPER_ADMIN authorization. No frontend caller exists.
- `GET /api/super-admin/admins` accepts `PENDING` but rejects the real submission state `PENDING_SUPER_ADMIN_APPROVAL` as a filter. The current workspace only exposes pagination, so its request succeeds and still lists submitted accounts when unfiltered; completing a pending-approval filter needs backend validation alignment. This is an additional data/workflow gap, not a currently sent bad parameter.
- The 108-handler count and 76/69/7 task counts do match current source. `UI_CONNECTED` in the prior JSON is route/serialization coverage, not response, permission or live-business proof.

## MOCKED API CHECKS

Primary evidence: [browser script](../../frontend/scripts/verify-storefront-integration.mjs), local `.impeccable/review/integration/checks.json`, `.tmp-redesign/intro-catalog.mjs`, `.tmp-redesign/preview-server.mjs`, `.tmp-redesign/verify-cache.mjs`. These local fixture files were inspected, not run.

| Mock / check | Returned fixture / behavior | Real backend endpoint? | What remains unverified |
|---|---|---|---|
| `GET /api/auth/get-session` | Fake session and fixture user | Yes, Better Auth wildcard | Google callback, cookies, expiry, refresh, real identity |
| `GET /api/me` | Chosen role, `permissions:[]`, `adminApproved:true` | Yes | DB roles, permissions, account eligibility; mock permits impossible approved-operation combinations |
| Any path ending `/summary` | Hardcoded Admin/Super Admin metrics | Yes for both actual summary callers | Real aggregates and permission enforcement. Broad mock would also accept a nonexistent summary path |
| `GET /api/admin/products` | Empty products, limit 5, offset 0 | Yes | Nonempty data, ownership/category visibility, paging and permission failures |
| `GET /api/super-admin/admins` | Empty admins, limit 5, offset 0 | Yes | Nonempty seller records, filters and KYC relationships |
| `GET /api/orders` | One delivered/paid and one created/unpaid order | Yes | Real projection, mixed deliveries, deadlines, ownership, nonfixture data |
| Any path ending `/cancel` | Synthesized cancelled state | Yes for `/api/orders/:orderId/cancel` | Reservation release, expiry, payment races, idempotency, cross-owner denial |
| `POST /api/reviews` | `{status:'PENDING'}`, 201 | Yes | Actual owned delivered item, duplicate prevention, persistence; fixture item ID is not a real UUID |
| `POST /api/returns` | Fixed return reference/status, 201 | Yes | Dress policy, current returnEnabled flag, five-day window, returned quantities, ownership |
| `GET /api/returns/:id` | Status toggled by local `approved` boolean; address supplied afterward; `refund:null` | Yes | Backend approval/state transitions and disclosure; absent-refund JSON differs |
| `GET /api/customer/cart` | Empty cart | Yes | Populated lines, subtotal, cart changes and quote prerequisites |
| `GET /api/customer/wishlist` | Empty wishlist | Yes | Persistence and per-product hydration |
| `GET /api/customer/addresses` | Empty addresses | Yes | Create/edit/delete/default address, owned selection |
| Generic mutation fallback | Every other non-GET returns `{status:'COMPLETED',version:2}` | **No route check is made by this fallback** | Accepts even unknown paths, invalid payloads or missing permissions |
| Fallback exercised: `PUT /api/admin/products/fixture-product/inventory` | Generic success; request asserted `{quantity:5,expectedVersion:1}` | Yes, real templated endpoint | Real UUID, ownership/category, permission, version conflict, stock reservation. Separate documented local PG inventory test exists |
| Fallback exercised: `POST /api/super-admin/reviews/fixture-review/moderate` | Generic success | Yes, real templated endpoint | Pending review existence and real persisted moderation |
| Provider-disabled controls | Assert no submission control for shipment/refund | Yes, shipment/refund routes exist | Verifies UI gate only; no provider request occurred |
| Customer role denied Super Admin UI | Fake `/api/me` role stops workspace rendering | Yes, `/api/me` and protected routes | Verifies frontend gate only; no direct unauthorized backend access attempted |
| Synthetic `GET /api/categories` | Preview category or Dress/Home fixture categories | Yes | Real published catalog and export inputs |
| Synthetic `GET /api/products` | 14 preview or 68 intro fixture products | Yes | Real sorting, publication, seller eligibility, inventory and filter semantics |
| Synthetic `GET /api/products/:slug` | Fixture product, empty variants, local image | Yes | Real variants, relationships and per-variant inventory |
| Synthetic product reviews | Every pathname ending `/reviews` returns empty reviews | Yes for public product reviews | Nonempty published reviews; broad fixture pattern does not enforce actual route validity |
| Synthetic other `/api/*` | Generic 401 | Depends on actual route; fixture does not inspect registration | Does not prove real route protection or even endpoint existence |
| Synthetic image serving | Local editorial WebP under `images/...`, not real `products/<uuid>/...` object | R2 media flow exists, but fixture path is not a valid Worker product-image key | R2 objects, public custom domain and private upload/download behavior |
| Cache/pagination/sort tests | Fixture request log `/verification/requests`, offset 12 and cached product counts | Product API exists; **`/verification/requests` is fixture-only** | Proves client caching with synthetic server, not Worker query correctness |

The integration script records **41 evidence entries**: 36 customer page/device visits, one grouped customer-mutation check and four operator/device checks. These are **not 41 real API checks**. Role-denial assertion is additional and is not pushed into that evidence array. It asserts absence of checkout/payment requests. Empty cart/addresses mean quote is not exercised. It does not click tracking, wishlist mutations, address mutations, uploads, lifecycle, finance or most operator tasks.

`intro-catalog.mjs` filters products by category/offset/limit but ignores search, price, featured, availability and sort. `preview-server.mjs` implements only a subset of the real filters. Neither exercises real variants. Unhandled GETs in the browser interception use `route.continue()`, which can still reach the synthetic catalog server. Therefore “not intercepted by Playwright” does not imply a real Worker response.

Earlier real local dashboard and selected backend/PG evidence is recorded in [AUTHENTICATED_DASHBOARDS_LOCAL.md](../verification/AUTHENTICATED_DASHBOARDS_LOCAL.md) and [CURRENT_STATUS.md](../CURRENT_STATUS.md). It is separate evidence, not superseded by a claim that everything was always mocked. No historical test was rerun here.

## REQUIRED BACKEND WORK

All routes below are **proposed contracts**, unless explicitly marked existing. No implementation is authorized by this report. “No schema change” means the existing logical tables support the read; it is not a production migration/drift verification. New indexes may later be justified by measured query performance.

### P0 — required before real frontend integration

**No missing backend route blocks dispatch of the currently declared calls.** The priority is real contract verification and frontend correction: remove subcategory descriptions, expose archive-aware recovery entry, reflect existing permissions/approval, distinguish parked workflows, and stop treating mocked success as evidence. Preserve auth, Cashfree, Shiprocket and R2 behavior.

| Work | Route / method | Auth / permission | Request | Response | Tables | Existing service to reuse | Schema change? |
|---|---|---|---|---|---|---|---|
| C1 optional response normalization | Existing GET `/api/returns/:returnId` and GET `/api/admin/returns/:returnId` | Session; owner / approved ADMIN + orders.view + ownership, or SUPER_ADMIN | returnId | Existing projection, consistently `refund:null` if none | returns, refunds | `getReturn` | No. Alternatively fix frontend type to `refund?`; current display is safe |
| C2 pending-approval semantic correction | Existing GET `/api/super-admin/summary`; GET `/api/super-admin/admins` filter | Session; SUPER_ADMIN | Summary: none; list: status query | Count submitted `PENDING_SUPER_ADMIN_APPROVAL` accounts under an explicit pending-review metric; accept the actual submission status in list filter | admins, admin_kyc_submissions | `getSuperAdminSummary`, `listAdmins`, existing submission status definition | No. For the card alone, frontend can use existing `onboarding.pendingKycApplications`; list filter validation remains backend work |

C1 is contract hygiene, not a launch-stopping runtime failure. No backend change is required for B subcategory forms or D recovery admission. No live verification was attempted because this audit forbids mutations and provider changes; the existing browser script itself supplies no such verification.

### P1 — required for complete dashboard workflows

These additions complete discovery and accurate UI decisions; reference-based existing operations can still function without all of them.

| ID / work | Proposed route / method | Auth / permission | Request | Proposed response | Database tables used | Existing service / rule to reuse | Schema change? |
|---|---|---|---|---|---|---|---|
| F1 Customer return history | GET `/api/returns` | CUSTOMER session; owner scope | status?, limit, cursor | `{returns:[{id,orderId,orderItemId,quantity,status,requestedAt}],nextCursor}` | returns, return_items, orders, order_items | Ownership/projection rules from `getReturn`; new list query | No |
| F2 Seller return queue | GET `/api/admin/returns` | Approved ADMIN; orders.view; own adminId | status?, limit, cursor | `{returns:[{id,orderId,orderItemId,quantity,status,requestedAt}],nextCursor}` | returns, return_items, order_items, admins | `getReturn`, `getAdminId`; new scoped list query | No |
| F3 Private seller product details/images | GET `/api/admin/products/:productId` (optionally separate GET `.../images`) | Approved ADMIN; products.view; management/ownership and active category scope | productId | `{product,variants,images,inventories}` with supported editable fields and versions | products, product_variants, product_images, inventories, product_admins, admin_category_assignments, categories | `assertProductAdmin`, `getProductInventory`, `listAdminProducts`; private projection | No |
| F4 Super Admin catalog and field discovery | GET `/api/super-admin/catalog/products`, GET `/api/super-admin/catalog/products/:productId`, GET `/api/super-admin/catalog/categories` | SUPER_ADMIN session | seller/status/category/q filters, limit/cursor; productId | Lists/detail including draft/archived status, variants, images, inventory, categories/subcategories and field definitions | products, categories, subcategories, category_product_fields, product_variants, product_images, inventories, admins | Existing catalog queries/field shape; create new privileged read projection, not a call to seller-only scope | No |
| F5 Platform payout queue/detail | GET `/api/super-admin/payouts`, GET `/api/super-admin/payouts/:payoutId` | SUPER_ADMIN session | adminId?, status?, limit/cursor; payoutId | `{payouts,nextCursor}` / `{payout,settlements}` | payout_requests, payout_settlement_items, admin_settlements, admins | `getAdminFinance` projection; `reviewPayout`, `markPayoutPaid` stay write authority | No |
| F6 Settlement and eligible-item discovery | GET `/api/super-admin/settlements`, GET `/api/super-admin/settlement-candidates` | SUPER_ADMIN session | adminId?, status?, orderId?, limit/cursor | `{settlements,nextCursor}` / `{items:[{orderItemId,eligible,reasonCodes}],nextCursor}` | admin_settlements, order_items, orders, payments, shipment_items, shipments, returns, return_items, refunds, payout_settlement_items | `createSettlement`, settlement/order eligibility rules; read-only evaluation only | No |
| F7 Per-seller finance | GET `/api/super-admin/admins/:adminId/finance` | SUPER_ADMIN session | adminId | Existing finance shape: balance, settlements, payouts, refund obligations; paginate lists if large | admin_settlements, payout_requests, refunds, return_items, admins | `getAdminFinance(db, adminId)` after explicit privileged authorization | No |
| F8 Return/refund queue | GET `/api/super-admin/returns` | SUPER_ADMIN session | adminId?, status?, refundStatus?, limit/cursor | `{returns:[{id,orderId,adminId,status,qcStatus,refundStatus}],nextCursor}` | returns, return_items, refunds, return_inspections, admins | `getReturn`, `authorizeRefund` eligibility; no provider submission on GET | No |
| E1 Order/item action eligibility | Extend existing GET `/api/orders` and `/api/orders/:orderId` | CUSTOMER session; owner | Existing request | Add item delivery time, review state, returnEligible/reasons/deadline/remainingQuantity; order cancellationEligible/reasons/deadline | orders, order_items, reviews, shipments, shipment_items, returns, return_items, payments | `customerOrderResponse`, `createReview`, `requestReturn`, return-window and reservation eligibility rules; derive without invoking mutations | No |
| E3 Reconciliation cursor consistency | Existing GET `/api/super-admin/reconciliation` | SUPER_ADMIN session | domain?, after_id?, limit | Existing `{items,count}` with deterministic traversal; align sort with UUID cursor or introduce a validated compound cursor | reconciliation_items | `listUnresolvedItems` | No logical schema change |
| E2 Variant availability | Extend existing GET `/api/products/:slug` | Public; existing publication/seller gates | slug | Add `variants[].available`; optionally base-line availability | products, product_variants, inventories; existing seller/category scope tables | `getPublicProduct`, purchase-eligibility rules | No |
| F9 Safe capabilities/readiness | GET `/api/capabilities`; optional privileged GET `/api/super-admin/readiness` | Public safe subset; operator details require SUPER_ADMIN. Seller readiness could instead extend onboarding | No secrets or provider calls in request | Feature booleans + stable reason codes for checkout/invitations/shipping/media; seller onboarding can derive missing prerequisites | shipping_provider_configs, shipping_provider_locations, admins, admin_kyc_submissions, admin_addresses, admin_category_assignments; environment presence/policy gates | Existing provider guards and onboarding checks; new aggregation only | No; provider configuration presence must not be reported as successful verification |
| F10 Optional time series | GET `/api/admin/analytics/series`, GET `/api/super-admin/analytics/series` | Approved ADMIN + analytics.view/earnings.view and own scope; SUPER_ADMIN for platform | from,to,interval | `{points:[{period,grossSettledSales,orderCount}],basis:'settled'}` | admin_settlements, orders, order_items | Summary service aggregate definitions | No; define date/metric semantics before implementation |
| F11 Optional lifecycle queue | GET `/api/super-admin/lifecycle-requests` | SUPER_ADMIN session | type?,status?,adminId?,limit/cursor | `{requests:[{id,adminId,type,status,createdAt}],nextCursor}` | admin_deletion_requests, admin_recovery_requests, admin_archives, admins | `getAdminLifecycle`; decisions retain current lifecycle services | No |

The following requested areas are absent from both the current UI and its call sites. They are **new feature work**, not prerequisites to connect existing forms:

| ID / work | Proposed route / method | Auth / permission | Request | Proposed response | Tables | Existing service to reuse | Schema change? |
|---|---|---|---|---|---|---|---|
| F12 Notification inbox | GET `/api/customer/notifications`; PATCH `/api/customer/notifications/:id/read` | CUSTOMER; ownership | cursor/limit; notification id | `{notifications,nextCursor,unreadCount}` / `{id,readAt}` | No notification table exists; future persisted notification/read state, references to orders/returns as needed | No notification service; existing order/return state is source material only | Yes for a persisted inbox/read state; requires separate design |
| F13 Customer inspection | GET `/api/super-admin/customers`; GET `/api/super-admin/customers/:userId` | SUPER_ADMIN; safe customer-only projection | q/status/limit/cursor; userId | `{customers,nextCursor}` / safe identity and aggregate order summary | users, user_roles, roles, orders | Existing role queries and summary projection patterns; new customer query | No for read-only inspection; mutations unspecified |
| F14 Permission inspection | GET `/api/super-admin/permissions`; GET `/api/super-admin/roles/:roleId/permissions` | SUPER_ADMIN | roleId | Permission definitions/effective role grants, no credentials | permissions, roles, role_permissions | Existing actor grant query; no management service exists | No for reads. No grant mutation proposed without explicit policy; no authentication change in this task |

### P2 — external-provider-dependent

These are **existing routes needing provider/environment evidence**, not proposed replacement APIs. Any later code fix must follow an observed failure; no speculative adapter changes are justified here.

| Existing route / method | Auth / permission | Request | Response | Tables / storage | Existing service | Schema change? |
|---|---|---|---|---|---|---|
| POST `/api/auth/sign-in/social`, provider callback `/api/auth/callback/google` | Public OAuth initiation; state/callback validation | provider=google, callbackURL; callback code/state | Redirect/session/user | users, sessions, accounts, user_roles, roles, verifications | Better Auth `createAuth` | No identified change; verify real browser lifecycle |
| POST `/api/checkout`; POST `/api/orders/:orderId/payment-session` | CUSTOMER owner; idempotent checkout | addressId/cartVersion/lineFingerprint + Idempotency-Key; orderId | CheckoutResult; `{orderId,paymentSessionId}` | carts, cart_items, customer_addresses, products, variants, inventories, orders, order_items, payments, finance settings | `checkoutCart`, `createPaymentSession`, CashfreePaymentAdapter | No identified change |
| POST `/api/super-admin/returns/:returnId/refund/submit` | SUPER_ADMIN; authorized refund state | returnId, `{}` | Refund row | returns, return_items, refunds, payments, orders, reconciliation/audit records | `submitRefund`, CashfreeRefundAdapter | No identified change |
| POST `/api/admin/orders/:orderId/shipments`; POST `/api/admin/shipments/:shipmentId/awb`; POST `.../pickup` | Approved ADMIN; orders.update; owned seller order/shipment | orderId + positive numeric dimensions/weight; shipmentId | Shipment/AWB/pickup envelopes in ledger | orders, order_items, shipments, shipment_items, shipping_operations, provider config/location tables | `createForwardShipment`, `assignShipmentAwb`, `requestShipmentPickup`, Shiprocket adapter | No identified change |
| GET `/api/admin/shipping/provider-pickups`; GET `.../serviceability`; PUT `.../providers/shiprocket` | SUPER_ADMIN, despite `/admin` prefix | None; pickupPostcode/deliveryPostcode/weightKg query; enabled:boolean | locations; serviceability; providerKey/enabled | Provider read plus shipping_provider_configs for enablement | Shiprocket adapter; existing route guard | No identified change |
| POST `/api/admin/review/invite`; POST `.../reinvite` | SUPER_ADMIN | name/email; email | adminId/expiresAt/emailDelivered/emailNote | users, accounts/admin invitation and RBAC records; Resend | Invitation service and invitation email service | No identified change; sender/setup URL/delivery verification |
| POST `/api/admin/products/:productId/images/upload`; POST `.../images`; GET `/api/images/*` or public R2 URL | Approved ADMIN products.update + scope for writes; public published-media delivery | Multipart file/metadata; existing objectKey/metadata; object key GET | Product-image row; bytes | product_images, products, product_admins/category scope; PRODUCT_IMAGES_BUCKET | Product image upload helpers, `saveProductImageMetadata` | No identified change; production domain/real object verification |
| POST `/api/admin/onboarding/kyc/documents`; GET `/api/admin/review/:adminId/documents/:documentId` | ADMIN own onboarding; SUPER_ADMIN download | Multipart documentType/file; adminId/documentId | `{id,documentType}`; private binary | admin_kyc_submissions/documents/audit, KYC_BUCKET | Existing bounded upload/download handlers | No identified change |

Provider webhooks are already registered separately and need later provider verification; they are not frontend calls. Recording an externally paid payout is a database operation with an external payment reference, not an automatic bank transfer API. Reading stored tracking does not require a live Shiprocket lookup. Reconciliation reads/local evidence handling likewise do not inherently require provider availability.

## DO NOT IMPLEMENT

Only this audit report and its machine-readable companion were created. No application source, backend route, business logic, schema, migration, seed, authentication, Cashfree, Shiprocket, R2 configuration, deployment or production data was changed.

**Which frontend problems are actually backend problems?** The incorrect pending-approval metric/status filter, inconsistent reconciliation pagination, missing private discovery/queues, platform seller-finance reads, safe readiness aggregation, and item/variant eligibility projections. Notification/customer/permission-management areas are absent features, not failed existing integrations. Absent refund normalization is a small contract inconsistency with a frontend-only alternative.

**Which frontend problems only look like backend problems because mocks were used?** Existing catalog, cart, wishlist, addresses, quote, order/cancellation/review/return writes, KPI summaries, inventory and review moderation all have real handlers. Mocked PASS does not establish data, permissions, ownership, eligibility, persistence, provider configuration or actual response fidelity. Recovery admission, unsupported subcategory description, permission-aware task presentation, blank-field clearing and static-export freshness are frontend work. Creating duplicate routes or weakening existing checks would not solve them.

## Evidence and verification method

- Read the requested integration status, API route/frontend maps, current status, data-flow document and project instructions/context; treated historical checkpoints as historical.
- Searched all frontend API clients, build-time fetchers, auth SDK use, hooks, direct fetch/api calls, pages and task definitions.
- Inspected complete route registration, all application route modules, relevant service authorization/validation/projections, schema declarations, and mock/fixture scripts.
- Imported the current Worker app **without dispatching a request** to enumerate registrations; compared every ledger method/path. Duplicate middleware registrations were collapsed.
- Final artifact integrity check **PASS**: 106 unique call contracts and appendix entries, all 76 workflow definitions covered, 108 registered handlers reconciled, classification totals consistent, all required ledger fields present, 32 expanded row schemas, zero live API requests.
- Read existing browser evidence; did not run the mock suite as a substitute for real verification. Did not run mutation/PG/provider tests or builds.
- [Machine-readable per-call ledger](../verification/FRONTEND_BACKEND_API_GAP_AUDIT.json) contains the same classifications, requests, response expectations and actual route matches. The appendix below records all requested fields for every call.


## Complete per-call contract ledger

Each entry records all eleven requested audit fields. Expected shapes are the consumer contract; extra backend fields alone are not mismatches. `Row(table)` means the full camelCase Drizzle row selected/returned by the named implementation; see the schema dictionary below. All dates cross JSON as strings, numeric money columns as strings. `Same` means the preceding expected shape, allowing unconsumed extra fields. Every path was matched against current in-memory `app.routes`, not just documentation.

### API-001 — Published categories

| Audit field | Finding |
|---|---|
| Frontend page/component | /; /search; /clothing; /categories/[slug]; /super-admin; /super-admin / OperatorWorkspace |
| Frontend function/hook | getPublicCategories; workflow public-categories; runOperatorWorkflow[public-categories] |
| HTTP method | GET |
| Requested route | /api/categories |
| Authentication / required role and permission | Public |
| Request body/query/params | None |
| Expected response | {categories:[{id,name,slug,description,subcategories:[{id,name,slug}]}]} |
| Actual backend route | GET /api/categories |
| Actual response shape | Same |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Both synthetic catalog servers substitute this response; real route and projection exist. |

### API-002 — Catalog, home grids, filters and pagination

| Audit field | Finding |
|---|---|
| Frontend page/component | /; /search; /clothing; /categories/[slug] |
| Frontend function/hook | customerApi.products; getPublicProducts; getPublishedProductSlugs; CatalogBrowser; ClothingBrowser; HomeProductEdit |
| HTTP method | GET |
| Requested route | /api/products |
| Authentication / required role and permission | Public |
| Request body/query/params | Query q,category,subcategory,minPrice,maxPrice,featured,sort,available/inStock,limit,offset |
| Expected response | {products:Product[]} |
| Actual backend route | GET /api/products |
| Actual response shape | {products:[Product{id,name,slug,description,price:string,currency,returnEnabled,featured,createdAt,category,categorySlug,subcategory,subcategorySlug,image:{objectKey,altText} / null,available:boolean,rating:number / null,reviewCount:number}]} |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Synthetic catalog checks; real filters exist. API caps limit at 50. No total is expected by current load-more UI. |

### API-003 — Product detail and variants

| Audit field | Finding |
|---|---|
| Frontend page/component | /products/[slug]; /wishlist |
| Frontend function/hook | getPublicProduct; customerApi.product; WishlistContent |
| HTTP method | GET |
| Requested route | /api/products/:slug |
| Authentication / required role and permission | Public |
| Request body/query/params | Path slug |
| Expected response | PublicProductDetail / ProductDetail (fields consumed match) |
| Actual backend route | GET /api/products/:slug |
| Actual response shape | Product detail{id,categoryId,subcategoryId,name,slug,description,price,currency,attributes,returnEnabled,createdAt,images:[{id,objectKey,altText,sortOrder}],variants:[{id,sku,title,price,attributes}],available,rating,reviewCount} |
| Status | E. DATA GAP |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Only aggregate product availability is exposed; selected-variant availability is absent. Static product details also require rebuild/refresh; that freshness issue is frontend-owned. |

### API-004 — Published reviews

| Audit field | Finding |
|---|---|
| Frontend page/component | /products/[slug] |
| Frontend function/hook | getPublicReviews; customerApi.reviews (wrapper currently unused) |
| HTTP method | GET |
| Requested route | /api/products/:productId/reviews |
| Authentication / required role and permission | Public |
| Request body/query/params | Path product UUID |
| Expected response | {reviews:[{id,rating,title,body,createdAt}]} |
| Actual backend route | GET /api/products/:productId/reviews |
| Actual response shape | Same |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/reviews.ts → services/customer/review.service.ts |
| Finding / required change | Synthetic servers always return an empty list; real published-review projection exists. Static reviews require rebuild. |

### API-005 — Cart read

| Audit field | Finding |
|---|---|
| Frontend page/component | /cart; /checkout |
| Frontend function/hook | customerApi.cart |
| HTTP method | GET |
| Requested route | /api/customer/cart |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | None |
| Expected response | Cart{items:[{id,productId,variantId,name,slug,variantTitle,price,currency,quantity}],subtotal:string} |
| Actual backend route | GET /api/customer/cart |
| Actual response shape | Same |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Latest browser checks return an empty cart; do not exercise a populated checkout. |

### API-006 — Add/change cart line

| Audit field | Finding |
|---|---|
| Frontend page/component | /products/[slug]; /cart |
| Frontend function/hook | customerApi.setCartItem |
| HTTP method | PUT |
| Requested route | /api/customer/cart/items/:productId |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path productId; JSON {quantity:number,variantId?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/customer/cart/items/:productId |
| Actual response shape | cartItems row |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Quantity/variant mapping matches; real mutation not run. |

### API-007 — Remove cart line

| Audit field | Finding |
|---|---|
| Frontend page/component | /cart |
| Frontend function/hook | customerApi.removeCartItem |
| HTTP method | DELETE |
| Requested route | /api/customer/cart/items/:itemId |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path itemId |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | DELETE /api/customer/cart/items/:itemId |
| Actual response shape | {id} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Owned cart-item deletion exists. |

### API-008 — Wishlist read

| Audit field | Finding |
|---|---|
| Frontend page/component | /wishlist; /products/[slug] |
| Frontend function/hook | customerApi.wishlist |
| HTTP method | GET |
| Requested route | /api/customer/wishlist |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | None |
| Expected response | {products:[{productId,name,slug,price,currency}]} |
| Actual backend route | GET /api/customer/wishlist |
| Actual response shape | Same |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Empty list mocked; wishlist page hydrates each saved entry using existing product detail. |

### API-009 — Wishlist toggle

| Audit field | Finding |
|---|---|
| Frontend page/component | /wishlist; /products/[slug]; ProductCard/WishlistButton |
| Frontend function/hook | customerApi.setWishlist |
| HTTP method | PUT |
| Requested route | /api/customer/wishlist/:productId |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path productId; JSON {enabled:boolean} |
| Expected response | {productId,enabled} |
| Actual backend route | PUT /api/customer/wishlist/:productId |
| Actual response shape | Same |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Server-backed toggle exists; latest browser script does not click it. |

### API-010 — Address list

| Audit field | Finding |
|---|---|
| Frontend page/component | /account/addresses; /checkout |
| Frontend function/hook | customerApi.addresses |
| HTTP method | GET |
| Requested route | /api/customer/addresses |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | None |
| Expected response | {addresses:[CustomerAddress{id,label,contactName,phone,line1,line2,city,state,postalCode,country,isDefault}]} |
| Actual backend route | GET /api/customer/addresses |
| Actual response shape | {addresses:[customerAddresses row]} |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Latest browser checks return no addresses. |

### API-011 — Create address

| Audit field | Finding |
|---|---|
| Frontend page/component | /account/addresses |
| Frontend function/hook | customerApi.saveAddress |
| HTTP method | POST |
| Requested route | /api/customer/addresses |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path addressId for PUT; JSON {label,contactName,phone,line1,line2:null / string,city,state,postalCode,country,isDefault:boolean} |
| Expected response | CustomerAddress{id,label,contactName,phone,line1,line2,city,state,postalCode,country,isDefault} |
| Actual backend route | POST /api/customer/addresses |
| Actual response shape | customerAddresses row |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Returned extra ownership/timestamp fields are not required by UI; postal code must be 6 digits. |

### API-012 — Edit address

| Audit field | Finding |
|---|---|
| Frontend page/component | /account/addresses |
| Frontend function/hook | customerApi.saveAddress |
| HTTP method | PUT |
| Requested route | /api/customer/addresses/:addressId |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path addressId for PUT; JSON {label,contactName,phone,line1,line2:null / string,city,state,postalCode,country,isDefault:boolean} |
| Expected response | CustomerAddress{id,label,contactName,phone,line1,line2,city,state,postalCode,country,isDefault} |
| Actual backend route | PUT /api/customer/addresses/:addressId |
| Actual response shape | customerAddresses row |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Returned extra ownership/timestamp fields are not required by UI; postal code must be 6 digits. |

### API-013 — Delete address

| Audit field | Finding |
|---|---|
| Frontend page/component | /account/addresses |
| Frontend function/hook | customerApi.deleteAddress |
| HTTP method | DELETE |
| Requested route | /api/customer/addresses/:addressId |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path addressId |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | DELETE /api/customer/addresses/:addressId |
| Actual response shape | {id} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/customer.service.ts |
| Finding / required change | Owner-scoped deletion exists. |

### API-014 — Checkout quote

| Audit field | Finding |
|---|---|
| Frontend page/component | /checkout |
| Frontend function/hook | customerApi.checkoutQuote |
| HTTP method | GET |
| Requested route | /api/customer/checkout/quote |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Query addressId |
| Expected response | CheckoutQuote{cartVersion:number,lineFingerprint,items:[{productId,variantId,name,variantTitle,quantity,unitPrice,lineTotal,available}],subtotal,discountAmount,shippingAmount,totalAmount:string / null,currency,valid,problems:string[]} |
| Actual backend route | GET /api/customer/checkout/quote |
| Actual response shape | Same |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/customer.ts → services/customer/order.service.ts |
| Finding / required change | Source matches; empty mocked cart/address prevents latest browser test from exercising quote. Zero shipping/discount reflects existing business logic. |

### API-015 — Checkout creation (parked wrapper)

| Audit field | Finding |
|---|---|
| Frontend page/component | /checkout (button disabled; no active call site) |
| Frontend function/hook | customerApi.checkout |
| HTTP method | POST |
| Requested route | /api/checkout |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | JSON {addressId,cartVersion:number,lineFingerprint:64-hex}; Idempotency-Key UUID |
| Expected response | CheckoutResult{orderId,status,paymentStatus,stockState,totalAmount,currency,paymentDeadline,replayed} |
| Actual backend route | POST /api/checkout |
| Actual response shape | Same |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/customer/orders.ts → services/customer/order.service.ts |
| Finding / required change | Route reserves inventory without calling Cashfree; UI is gated by payment readiness. No missing checkout API. |

### API-016 — Payment session (parked wrapper)

| Audit field | Finding |
|---|---|
| Frontend page/component | /checkout (no active call site) |
| Frontend function/hook | customerApi.paymentSession |
| HTTP method | POST |
| Requested route | /api/orders/:orderId/payment-session |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path orderId; JSON {} |
| Expected response | {orderId,paymentSessionId} |
| Actual backend route | POST /api/orders/:orderId/payment-session |
| Actual response shape | Same |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/customer/payments.ts → services/payment.service.ts |
| Finding / required change | Cashfree credentials and provider verification gate. |

### API-017 — Orders and item actions

| Audit field | Finding |
|---|---|
| Frontend page/component | /orders |
| Frontend function/hook | customerApi.orders |
| HTTP method | GET |
| Requested route | /api/orders |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | None |
| Expected response | {orders:Order[]} |
| Actual backend route | GET /api/orders |
| Actual response shape | {orders:[Order{id,orderNumber,status,paymentStatus,deliveredAt,createdAt,currency,subtotal,shippingAmount,discountAmount,totalAmount,shippingAddressSnapshot,items:[{id,productId,variantId,productNameSnapshot,variantTitleSnapshot,quantity,unitPrice,totalAmount}]}]} |
| Status | E. DATA GAP |
| Evidence / implementation | backend/src/routes/customer/orders.ts → services/customer/order.service.ts |
| Finding / required change | Displayed fields match, but item delivery/review/return eligibility and cancellation deadline/stock state are absent. UI gates actions by whole-order status. Mocked delivered order hides this. |

### API-018 — Order detail wrapper

| Audit field | Finding |
|---|---|
| Frontend page/component | No active detail fetch; /orders renders list-provided items |
| Frontend function/hook | customerApi.order |
| HTTP method | GET |
| Requested route | /api/orders/:orderId |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path orderId |
| Expected response | Order |
| Actual backend route | GET /api/orders/:orderId |
| Actual response shape | Order{id,orderNumber,status,paymentStatus,deliveredAt,createdAt,currency,subtotal,shippingAmount,discountAmount,totalAmount,shippingAddressSnapshot,items:[{id,productId,variantId,productNameSnapshot,variantTitleSnapshot,quantity,unitPrice,totalAmount}]} |
| Status | E. DATA GAP |
| Evidence / implementation | backend/src/routes/customer/orders.ts → services/customer/order.service.ts |
| Finding / required change | Same eligibility data gap as list; wrapper is unused. GET can recover expired unpaid order state, so not called during this audit. |

### API-019 — Cancel unpaid order

| Audit field | Finding |
|---|---|
| Frontend page/component | /orders / CancelOrder |
| Frontend function/hook | customerApi.cancelOrder |
| HTTP method | POST |
| Requested route | /api/orders/:orderId/cancel |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | Path orderId UUID; JSON {} |
| Expected response | {orderId,status,paymentStatus} |
| Actual backend route | POST /api/orders/:orderId/cancel |
| Actual response shape | {orderId,status,paymentStatus,stockState,cancelledAt,replayed} |
| Status | A. FULLY MATCHED — authenticated local E2E verified 2026-10-05 |
| Evidence / implementation | backend/src/routes/customer/orders.ts → services/reservation.service.ts |
| Finding / required change | Real exported-frontend/API verification passed: owner cancellation returned CANCELLED, released inventory once, set cancelledAt, preserved the unpaid payment state, wrote one audit event, replayed safely, denied cross-customer access and persisted after reload. |

### API-020 — Tracking

| Audit field | Finding |
|---|---|
| Frontend page/component | /orders / Tracking |
| Frontend function/hook | customerApi.tracking |
| HTTP method | GET |
| Requested route | /api/orders/:orderId/tracking |
| Authentication / required role and permission | Session; order owner (handler/service checks ownership) |
| Request body/query/params | Path orderId |
| Expected response | {shipments:Shipment[]} |
| Actual backend route | GET /api/orders/:orderId/tracking |
| Actual response shape | {shipments:[{id,carrierName,awbNumber,trackingUrl,status,estimatedDeliveryDate,deliveredAt,events:[{status,location,description,eventTime}]}]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → services/shipping/shipping.service.ts |
| Finding / required change | Reads persisted normalized tracking; no provider call required for GET. Latest script does not click Show tracking. |

### API-021 — Submit review

| Audit field | Finding |
|---|---|
| Frontend page/component | /orders / OrderItemActions |
| Frontend function/hook | customerApi.review |
| HTTP method | POST |
| Requested route | /api/reviews |
| Authentication / required role and permission | Session; CUSTOMER; owned resources |
| Request body/query/params | JSON {orderItemId,rating:number,title,body} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/reviews |
| Actual response shape | reviews row (201) |
| Status | A. FULLY MATCHED — authenticated local E2E verified 2026-10-05 |
| Evidence / implementation | backend/src/routes/customer/reviews.ts → services/customer/review.service.ts |
| Finding / required change | Real exported-frontend/API verification passed: an owned delivered item created one PENDING review; duplicate, cross-customer and ineligible submissions were rejected; pending state persisted after reload and remained absent from public published reviews. |

### API-022 — Request return

| Audit field | Finding |
|---|---|
| Frontend page/component | /orders / OrderItemActions |
| Frontend function/hook | customerApi.requestReturn |
| HTTP method | POST |
| Requested route | /api/returns |
| Authentication / required role and permission | Session; owned order item (no explicit CUSTOMER role check here) |
| Request body/query/params | JSON {orderItemId,quantity:number,reason,customerNotes?} |
| Expected response | {id,status} |
| Actual backend route | POST /api/returns |
| Actual response shape | Same (201) |
| Status | A. FULLY MATCHED — authenticated local E2E verified 2026-10-05 |
| Evidence / implementation | backend/src/routes/customer/returns.ts → services/returns/return.service.ts |
| Finding / required change | Real exported-frontend/API verification passed: an eligible delivered Dress item created one REQUESTED return; five-day deliveredAt deadline, returnEnabled/category, delivery and quantity rules were enforced; replay/concurrency and cross-customer checks were safe; /orders and /returns reflected the state. |

### API-023 — Return status

| Audit field | Finding |
|---|---|
| Frontend page/component | /returns?id=… / ReturnLookup |
| Frontend function/hook | customerApi.returnStatus |
| HTTP method | GET |
| Requested route | /api/returns/:returnId |
| Authentication / required role and permission | Session; return owner |
| Request body/query/params | Path returnId |
| Expected response | ReturnStatus with required refund:{status,amount} / null |
| Actual backend route | GET /api/returns/:returnId |
| Actual response shape | ReturnStatus{id,orderId,status,reason,customerNotes,requestedAt,approvedAt,receivedAt,qcStatus,qcNotes,grossRefundAmount,deductionAmount,netRefundAmount,returnAddress:address / null,refund?:{status,amount,providerReference}} |
| Status | C. RESPONSE CONTRACT MISMATCH |
| Evidence / implementation | backend/src/routes/customer/returns.ts → services/returns/return.service.ts |
| Finding / required change | No refund row produces undefined, so JSON omits refund instead of null. UI guards it safely, but declared contract and mock refund:null differ. |

### API-024 — Current actor

| Audit field | Finding |
|---|---|
| Frontend page/component | CustomerGate/useCustomerSession; /admin; /super-admin / OperatorGate |
| Frontend function/hook | authApi.me |
| HTTP method | GET |
| Requested route | /api/me |
| Authentication / required role and permission | Session; ACTIVE nondeleted user |
| Request body/query/params | None |
| Expected response | Actor{userId,roles:string[],permissions:string[],adminApproved:boolean} |
| Actual backend route | GET /api/me |
| Actual response shape | Same |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/auth/auth.routes.ts → middleware/authorization.ts |
| Finding / required change | Mock supplies permissions:[] and adminApproved:true; real operator endpoints still enforce specific permissions. |

### API-025 — Session/profile

| Audit field | Finding |
|---|---|
| Frontend page/component | /account; CustomerGate; product actions |
| Frontend function/hook | authClient.useSession / useCustomerSession |
| HTTP method | GET |
| Requested route | /api/auth/get-session |
| Authentication / required role and permission | Session cookie; signed-out result may be null |
| Request body/query/params | None |
| Expected response | {session,user} / null |
| Actual backend route | GET /api/auth/* |
| Actual response shape | Better Auth session/user response or null |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/auth/auth.routes.ts → lib/auth/auth.ts; installed better-auth |
| Finding / required change | Fake user/session bypasses Google/session/cookie verification. |

### API-026 — Operator sign-in

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin; /super-admin / OperatorGate |
| Frontend function/hook | authApi.signIn |
| HTTP method | POST |
| Requested route | /api/auth/sign-in/email |
| Authentication / required role and permission | Public credential entry; email/password, account eligibility |
| Request body/query/params | JSON {email,password} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/auth/* |
| Actual response shape | Better Auth credential sign-in response; Set-Cookie on success |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/auth/auth.routes.ts → lib/auth/options.ts |
| Finding / required change | Existing enabled email/password handler; historical real dashboard evidence exists. Latest script starts already signed in. |

### API-027 — Sign-out

| Audit field | Finding |
|---|---|
| Frontend page/component | /account; /admin; /super-admin |
| Frontend function/hook | authApi.signOut; authClient.signOut |
| HTTP method | POST |
| Requested route | /api/auth/sign-out |
| Authentication / required role and permission | Session context |
| Request body/query/params | JSON {} |
| Expected response | authApi:unknown; authClient success/error envelope |
| Actual backend route | POST /api/auth/* |
| Actual response shape | Better Auth {success:boolean} or error |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/auth/auth.routes.ts → lib/auth/auth.ts; installed better-auth |
| Finding / required change | Handler exists; latest script does not test logout. |

### API-028 — Google sign-in

| Audit field | Finding |
|---|---|
| Frontend page/component | CustomerGate / account |
| Frontend function/hook | authClient.signIn.social |
| HTTP method | POST |
| Requested route | /api/auth/sign-in/social |
| Authentication / required role and permission | Public OAuth initiation; Google callback creates session |
| Request body/query/params | JSON {provider:google,callbackURL:<frontend>/account} |
| Expected response | SDK data/error; redirect URL |
| Actual backend route | POST /api/auth/* |
| Actual response shape | Better Auth OAuth redirect initiation |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/auth/auth.routes.ts → lib/auth/auth.ts |
| Finding / required change | Google consent/callback/current browser session still unverified. Callback is provider-driven, not an additional frontend API call. |

### API-029 — Invitation activation

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin/setup / InvitationSetup |
| Frontend function/hook | direct api() |
| HTTP method | POST |
| Requested route | /api/admin/activate |
| Authentication / required role and permission | Public; valid unexpired one-use invitation token |
| Request body/query/params | JSON {token,password} |
| Expected response | unknown JSON; UI checks success |
| Actual backend route | POST /api/admin/activate |
| Actual response shape | {userId,email,adminId} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/activation.ts → services/admin/invitation.service.ts |
| Finding / required change | Token activation exists independently of invitation delivery. Historical local activation test is documented. |

### API-030 — Dashboard cards

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / RoleDashboard |
| Frontend function/hook | adminApi.summary |
| HTTP method | GET |
| Requested route | /api/admin/summary |
| Authentication / required role and permission | Session; approved ADMIN; analytics.view + earnings.view |
| Request body/query/params | None |
| Expected response | {products:{total},orders:{total,confirmedPaid},finance:{availableBalance,grossSettledSales,pendingPayoutRequests}} |
| Actual backend route | GET /api/admin/summary |
| Actual response shape | {products:{total},orders:{total,confirmedPaid},finance:{availableBalance,grossSettledSales,pendingPayoutRequests}} |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/admin/products.ts → services/admin/summary.service.ts |
| Finding / required change | All rendered metrics exist. Latest browser response mocked; historical 2026-10-03 real dashboard checks are separate evidence. |

### API-031 — Dashboard cards

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / RoleDashboard |
| Frontend function/hook | superAdminApi.summary |
| HTTP method | GET |
| Requested route | /api/super-admin/summary |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | None |
| Expected response | {admins:{active,pending,total},catalog:{publishedProducts},orders:{total},finance:{grossSettledSales,pendingPayoutRequests},onboarding:{pendingKycApplications}}; admins.pending means submitted applications awaiting approval in UI |
| Actual backend route | GET /api/super-admin/summary |
| Actual response shape | {admins:{active,pending,total},catalog:{publishedProducts},orders:{total},finance:{grossSettledSales,pendingPayoutRequests},onboarding:{pendingKycApplications}} |
| Status | C. RESPONSE CONTRACT MISMATCH |
| Evidence / implementation | backend/src/routes/super-admin/dashboard.ts → services/admin/summary.service.ts |
| Finding / required change | Semantic mismatch: UI labels admins.pending as Admins pending approval, but getSuperAdminSummary counts status PENDING; submitApplication transitions to PENDING_SUPER_ADMIN_APPROVAL. Submitted applications are excluded from that metric. Mock pending:0 does not reveal this. Shape itself matches. |

### API-032 — Browse products

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace; /admin / RoleDashboard (limit=5) |
| Frontend function/hook | runOperatorWorkflow[products]; adminApi.products |
| HTTP method | GET |
| Requested route | /api/admin/products |
| Authentication / required role and permission | Session; approved ADMIN; products.view; ownership/category scope where applicable |
| Request body/query/params | Query {limit?:number, offset?:number, status?:DRAFT/PUBLISHED/ARCHIVED} |
| Expected response | adminApi: {products:AdminProductSummary[],limit,offset}; workspace: unknown |
| Actual backend route | GET /api/admin/products |
| Actual response shape | {products:AdminProductSummary[],limit,offset} |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Latest browser check substitutes this response. Real handler exists; permissions, record existence and business validation are bypassed by mock. |

### API-033 — Assigned categories & fields

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[categories]; adminApi.categories |
| HTTP method | GET |
| Requested route | /api/admin/categories |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/categories |
| Actual response shape | {categories:[{id,name,slug,status,subcategories:[{id,name,slug}],fields:[{key,label,inputType,required,options,sortOrder}]}]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-034 — Create a product

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[create-product]; adminApi.createProduct |
| HTTP method | POST |
| Requested route | /api/admin/products |
| Authentication / required role and permission | Session; approved ADMIN; products.create; ownership/category scope where applicable |
| Request body/query/params | JSON {categoryId:string, subcategoryId:string, name:string, slug:string, description?:string, sku?:string, price:string, attributes?:scalar object, returnEnabled:boolean, weightKg?:decimal string, lengthCm?:decimal string, breadthCm?:decimal string, heightCm?:decimal string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/products |
| Actual response shape | Row(products) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-035 — Edit a product

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[edit-product]; adminApi.updateProduct |
| HTTP method | PATCH |
| Requested route | /api/admin/products/:productId |
| Authentication / required role and permission | Session; approved ADMIN; products.update; ownership/category scope where applicable |
| Request body/query/params | Path productId; JSON {name?:string, slug?:string, description?:string, sku?:string, price?:string, attributes?:scalar object, returnEnabled?:boolean, weightKg?:decimal string, lengthCm?:decimal string, breadthCm?:decimal string, heightCm?:decimal string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PATCH /api/admin/products/:productId |
| Actual response shape | Row(products) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-036 — Create a subcategory

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[subcategory] |
| HTTP method | POST |
| Requested route | /api/admin/subcategories |
| Authentication / required role and permission | Session; approved ADMIN; products.create; ownership/category scope where applicable |
| Request body/query/params | JSON {categoryId:string, name:string, slug:string, description?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/subcategories |
| Actual response shape | Row(subcategories); no description field |
| Status | B. FRONTEND MAPPING BUG |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Form submits optional description; createSubcategory ignores it and subcategories has no description column. Remove unsupported frontend field; no backend change needed for current contract. |

### API-037 — Add a product variant

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[variant] |
| HTTP method | POST |
| Requested route | /api/admin/products/:productId/variants |
| Authentication / required role and permission | Session; approved ADMIN; products.update; ownership/category scope where applicable |
| Request body/query/params | Path productId; JSON {title:string, sku:string, price:string, attributes?:scalar object} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/products/:productId/variants |
| Actual response shape | Row(productVariants) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-038 — Read inventory & current versions

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[inventory-read] |
| HTTP method | GET |
| Requested route | /api/admin/products/:productId/inventory |
| Authentication / required role and permission | Session; approved ADMIN; products.view; ownership/category scope where applicable |
| Request body/query/params | Path productId; Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/products/:productId/inventory |
| Actual response shape | {inventories:[{id,productId,variantId,availableQuantity,reservedQuantity,version,updatedAt}]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-039 — Set available inventory

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[inventory]; adminApi.inventory |
| HTTP method | PUT |
| Requested route | /api/admin/products/:productId/inventory |
| Authentication / required role and permission | Session; approved ADMIN; inventory.update; ownership/category scope where applicable |
| Request body/query/params | Path productId; JSON {variantId?:string, quantity:number, expectedVersion:number} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/products/:productId/inventory |
| Actual response shape | Row(inventories) |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Latest browser check substitutes this response. Real handler exists; permissions, record existence and business validation are bypassed by mock. |

### API-040 — Upload a product image

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[image-upload] |
| HTTP method | POST |
| Requested route | /api/admin/products/:productId/images/upload |
| Authentication / required role and permission | Session; approved ADMIN; products.update; ownership/category scope where applicable |
| Request body/query/params | Path productId; Multipart {file:File, altText?:string, sortOrder?:number, variantId?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/products/:productId/images/upload |
| Actual response shape | Row(productImages) |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Existing endpoint depends on Shiprocket or R2; storage/provider interaction not verified by latest browser check. |

### API-041 — Attach an existing uploaded image

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[image-metadata] |
| HTTP method | POST |
| Requested route | /api/admin/products/:productId/images |
| Authentication / required role and permission | Session; approved ADMIN; products.update; ownership/category scope where applicable |
| Request body/query/params | Path productId; JSON {objectKey:string, altText?:string, sortOrder?:number, variantId?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/products/:productId/images |
| Actual response shape | Row(productImages) |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/products.ts → catalog.service.ts |
| Finding / required change | Existing endpoint depends on Shiprocket or R2; storage/provider interaction not verified by latest browser check. |

### API-042 — Seller application

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[onboarding]; adminApi.onboarding |
| HTTP method | GET |
| Requested route | /api/admin/onboarding |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/onboarding |
| Actual response shape | {profile:Row(admins),application?:Row(adminKycSubmissions),documents:[{id,documentType,createdAt}],addresses:Row(adminAddresses)[],categories:Row(adminCategoryAssignments)[]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/onboarding.ts → admin.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-043 — Save seller details

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[kyc] |
| HTTP method | PUT |
| Requested route | /api/admin/onboarding/kyc |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | JSON {legalName:string, businessType:string, contactPhone:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/onboarding/kyc |
| Actual response shape | Row(adminKycSubmissions) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/onboarding.ts → admin.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-044 — Upload verification document

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[kyc-document] |
| HTTP method | POST |
| Requested route | /api/admin/onboarding/kyc/documents |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | Multipart {documentType:string, file:File} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/onboarding/kyc/documents |
| Actual response shape | {id,documentType} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/onboarding.ts → admin.service.ts |
| Finding / required change | Existing endpoint depends on Shiprocket or R2; storage/provider interaction not verified by latest browser check. |

### API-045 — Save operational address

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[address] |
| HTTP method | PUT |
| Requested route | /api/admin/onboarding/addresses/:type |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | Path type; JSON {contactName:string, phone:string, businessName?:string, line1:string, line2?:string, city:string, state:string, postalCode:string, country:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/onboarding/addresses/:type |
| Actual response shape | Row(adminAddresses) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/onboarding.ts → admin.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-046 — Request a category assignment

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[request-category] |
| HTTP method | POST |
| Requested route | /api/admin/onboarding/categories/:categoryId |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | Path categoryId; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/onboarding/categories/:categoryId |
| Actual response shape | Row(adminCategoryAssignments) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/onboarding.ts → admin.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-047 — Submit application for review

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[submit-application] |
| HTTP method | POST |
| Requested route | /api/admin/onboarding/submit |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/onboarding/submit |
| Actual response shape | Row(adminKycSubmissions) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/onboarding.ts → admin.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-048 — Your orders

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[orders]; adminApi.orders |
| HTTP method | GET |
| Requested route | /api/admin/orders |
| Authentication / required role and permission | Session; approved ADMIN; orders.view; ownership/category scope where applicable |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/orders |
| Actual response shape | {orders:[{id,orderNumber,status,currency,paymentStatus,shippingAddress,placedAt,createdAt,adminSubtotal,items:Row(orderItems)[]}]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/orders.ts → order.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-049 — Inspect an order

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[order] |
| HTTP method | GET |
| Requested route | /api/admin/orders/:orderId |
| Authentication / required role and permission | Session; approved ADMIN; orders.view; ownership/category scope where applicable |
| Request body/query/params | Path orderId; Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/orders/:orderId |
| Actual response shape | {id,orderNumber,status,currency,paymentStatus,shippingAddress,placedAt,createdAt,adminSubtotal,items:Row(orderItems)[]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/orders.ts → order.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-050 — Shipment tracking

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[tracking]; adminApi.tracking |
| HTTP method | GET |
| Requested route | /api/admin/orders/:orderId/tracking |
| Authentication / required role and permission | Session; approved ADMIN; orders.view; ownership/category scope where applicable |
| Request body/query/params | Path orderId; Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/orders/:orderId/tracking |
| Actual response shape | {shipments:[{id,carrierName,awbNumber,trackingUrl,status,estimatedDeliveryDate,shippedAt,pickedUpAt,outForDeliveryAt,deliveredAt,lastEventAt,events:[{status,providerStatus,location,description,eventTime}]}]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → order.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-051 — Inspect a return

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace; /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[return]; adminApi.returnStatus; runOperatorWorkflow[inspect-return] |
| HTTP method | GET |
| Requested route | /api/admin/returns/:returnId |
| Authentication / required role and permission | Session; approved ADMIN + orders.view + return ownership, or SUPER_ADMIN |
| Request body/query/params | Path returnId; Query none |
| Expected response | adminApi: ReturnStatus with required nullable refund; workspace: unknown |
| Actual backend route | GET /api/admin/returns/:returnId |
| Actual response shape | ReturnStatus{id,orderId,status,reason,customerNotes,requestedAt,approvedAt,receivedAt,qcStatus,qcNotes,grossRefundAmount,deductionAmount,netRefundAmount,returnAddress:address / null,refund?:{status,amount,providerReference}} |
| Status | C. RESPONSE CONTRACT MISMATCH |
| Evidence / implementation | backend/src/routes/customer/returns.ts → order.service.ts / return.service.ts |
| Finding / required change | adminApi.returnStatus requires refund:null when absent; actual JSON omits refund. Workspace uses unknown and does not crash. |

### API-052 — Approve or decline a return

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[return-decision]; adminApi.decideReturn |
| HTTP method | POST |
| Requested route | /api/admin/returns/:returnId/decision |
| Authentication / required role and permission | Session; approved ADMIN; orders.update; ownership/category scope where applicable |
| Request body/query/params | Path returnId; JSON {approve:boolean, notes:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/returns/:returnId/decision |
| Actual response shape | Row(returns) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/returns.ts → order.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-053 — Record a returned item received

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[return-received]; adminApi.receivedReturn |
| HTTP method | POST |
| Requested route | /api/admin/returns/:returnId/received |
| Authentication / required role and permission | Session; approved ADMIN; orders.update; ownership/category scope where applicable |
| Request body/query/params | Path returnId; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/returns/:returnId/received |
| Actual response shape | Row(returns) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/returns.ts → order.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-054 — Record quality inspection

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[return-inspect]; adminApi.inspectReturn |
| HTTP method | POST |
| Requested route | /api/admin/returns/:returnId/inspection |
| Authentication / required role and permission | Session; approved ADMIN; orders.update; ownership/category scope where applicable |
| Request body/query/params | Path returnId; JSON {decision:APPROVED/REJECTED, conditionStatus:string, notes:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/returns/:returnId/inspection |
| Actual response shape | Row(returnInspections) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/returns.ts → order.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-055 — Balance, settlements & payouts

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[finance]; adminApi.finance |
| HTTP method | GET |
| Requested route | /api/admin/finance |
| Authentication / required role and permission | Session; approved ADMIN; payouts.view; ownership/category scope where applicable |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/finance |
| Actual response shape | {availableBalance,settlements:Row(adminSettlements)[],payouts:Row(payoutRequests)[],refundObligations:[{refundId,orderId,orderItemId,amount,currency,status}]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-056 — Request available payout

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[payout]; adminApi.requestPayout |
| HTTP method | POST |
| Requested route | /api/admin/payouts |
| Authentication / required role and permission | Session; approved ADMIN; payouts.view + payouts.request; ownership/category scope where applicable |
| Request body/query/params | JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/payouts |
| Actual response shape | Row(payoutRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-057 — Create shipment

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[shipment] |
| HTTP method | POST |
| Requested route | /api/admin/orders/:orderId/shipments |
| Authentication / required role and permission | Session; approved ADMIN; orders.update; ownership/category scope where applicable |
| Request body/query/params | Path orderId; JSON {weightKg:number, lengthCm:number, breadthCm:number, heightCm:number} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/orders/:orderId/shipments |
| Actual response shape | {shipmentId,status,providerShipmentId} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Shipment creation, AWB assignment and pickup are paused until the Shiprocket provider and webhook checks are completed. |

### API-058 — Assign courier tracking number

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[awb] |
| HTTP method | POST |
| Requested route | /api/admin/shipments/:shipmentId/awb |
| Authentication / required role and permission | Session; approved ADMIN; orders.update; ownership/category scope where applicable |
| Request body/query/params | Path shipmentId; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/shipments/:shipmentId/awb |
| Actual response shape | {shipmentId,awbNumber,carrierName,status} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Shipment creation, AWB assignment and pickup are paused until the Shiprocket provider and webhook checks are completed. |

### API-059 — Request courier pickup

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[pickup] |
| HTTP method | POST |
| Requested route | /api/admin/shipments/:shipmentId/pickup |
| Authentication / required role and permission | Session; approved ADMIN; orders.update; ownership/category scope where applicable |
| Request body/query/params | Path shipmentId; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/shipments/:shipmentId/pickup |
| Actual response shape | {shipmentId,pickupRequestedAt} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Shipment creation, AWB assignment and pickup are paused until the Shiprocket provider and webhook checks are completed. |

### API-060 — Provider pickup locations

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[provider-pickups] |
| HTTP method | GET |
| Requested route | /api/admin/shipping/provider-pickups |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/shipping/provider-pickups |
| Actual response shape | {locations:provider pickup locations[]} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/shipping.ts → shipping.service.ts |
| Finding / required change | Existing endpoint depends on Shiprocket or R2; storage/provider interaction not verified by latest browser check. |

### API-061 — Check courier serviceability

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[serviceability] |
| HTTP method | GET |
| Requested route | /api/admin/shipping/serviceability |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query {pickupPostcode:string, deliveryPostcode:string, weightKg:number} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/shipping/serviceability |
| Actual response shape | {serviceability:provider serviceability result} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/shipping.ts → shipping.service.ts |
| Finding / required change | Existing endpoint depends on Shiprocket or R2; storage/provider interaction not verified by latest browser check. |

### API-062 — Account lifecycle

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[lifecycle] |
| HTTP method | GET |
| Requested route | /api/admin/account/lifecycle |
| Authentication / required role and permission | Recovery session; archived own ADMIN permitted by requireArchiveRecoveryAuth |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/account/lifecycle |
| Actual response shape | {deletionRequests:Row(adminDeletionRequests)[],recoveryRequests:Row(adminRecoveryRequests)[],archives:Row(adminArchives)[]} |
| Status | D. AUTHORIZATION/ROLE GAP |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Recovery-capable backend exists, but OperatorGate requires active /api/me first, so archived users cannot reach task. Fix frontend recovery admission, preserve backend auth. |

### API-063 — Request account deletion

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[delete-request] |
| HTTP method | POST |
| Requested route | /api/admin/account/deletion-requests |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | JSON {reason:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/account/deletion-requests |
| Actual response shape | Row(adminDeletionRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-064 — Verify deletion request

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[delete-verify] |
| HTTP method | POST |
| Requested route | /api/admin/account/deletion-requests/:requestId/verify |
| Authentication / required role and permission | Session; ADMIN; own seller account |
| Request body/query/params | Path requestId; JSON {password:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/account/deletion-requests/:requestId/verify |
| Actual response shape | Row(adminDeletionRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-065 — Request account recovery

| Audit field | Finding |
|---|---|
| Frontend page/component | /admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[recover] |
| HTTP method | POST |
| Requested route | /api/admin/account/recovery-requests |
| Authentication / required role and permission | Recovery session; archived own ADMIN permitted by requireArchiveRecoveryAuth |
| Request body/query/params | JSON {reason:string, password:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/account/recovery-requests |
| Actual response shape | Row(adminRecoveryRequests) |
| Status | D. AUTHORIZATION/ROLE GAP |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Recovery-capable backend exists, but OperatorGate requires active /api/me first, so archived users cannot reach task. Fix frontend recovery admission, preserve backend auth. |

### API-066 — Browse seller accounts

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace; /super-admin / RoleDashboard (limit=5) |
| Frontend function/hook | runOperatorWorkflow[admins]; superAdminApi.admins |
| HTTP method | GET |
| Requested route | /api/super-admin/admins |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query {limit?:number, offset?:number} |
| Expected response | RoleDashboard: {admins:[{id,userName,userEmail,status}]}; workspace: unknown |
| Actual backend route | GET /api/super-admin/admins |
| Actual response shape | {admins:[{id,userId,status,createdAt,updatedAt,userName,userEmail,kycStatus,kycSubmittedAt,kycReviewedAt}],limit,offset} |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/super-admin/dashboard.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Latest browser check substitutes this response. Real handler exists; permissions, record existence and business validation are bypassed by mock. |

### API-067 — Inspect seller application

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[review-admin]; superAdminApi.reviewAdmin |
| HTTP method | GET |
| Requested route | /api/admin/review/:adminId |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId; Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/review/:adminId |
| Actual response shape | {profile:Row(admins),application?:Row(adminKycSubmissions),documents:[{id,documentType,createdAt}],addresses:Row(adminAddresses)[],categories:Row(adminCategoryAssignments)[],audit:Row(adminAuditEvents)[]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-068 — Decide seller application

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[decide-admin]; superAdminApi.decideAdmin |
| HTTP method | POST |
| Requested route | /api/admin/review/:adminId/decision |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId; JSON {decision:APPROVED/CHANGES_REQUIRED/REJECTED, notes:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/review/:adminId/decision |
| Actual response shape | Row(adminKycSubmissions) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-069 — Invite a seller

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[invite] |
| HTTP method | POST |
| Requested route | /api/admin/review/invite |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {name:string, email:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/review/invite |
| Actual response shape | {adminId,expiresAt,emailDelivered,emailNote?} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Seller invitation delivery is paused until the sender domain and production setup URL are verified. |

### API-070 — Resend seller invitation

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[reinvite] |
| HTTP method | POST |
| Requested route | /api/admin/review/reinvite |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {email:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/review/reinvite |
| Actual response shape | {adminId,expiresAt,emailDelivered,emailNote?} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Invitation delivery requires verified email configuration. |

### API-071 — Download verification document

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[review-document] |
| HTTP method | GET |
| Requested route | /api/admin/review/:adminId/documents/:documentId |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId, documentId; Query none |
| Expected response | Authenticated Blob attachment |
| Actual backend route | GET /api/admin/review/:adminId/documents/:documentId |
| Actual response shape | Binary attachment; private/no-store |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Existing endpoint depends on Shiprocket or R2; storage/provider interaction not verified by latest browser check. |

### API-072 — Correct seller details

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[correct-kyc] |
| HTTP method | PATCH |
| Requested route | /api/admin/review/:adminId/kyc |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId; JSON {legalName?:string, businessType?:string, contactPhone?:string, reason:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PATCH /api/admin/review/:adminId/kyc |
| Actual response shape | Row(adminKycSubmissions) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-073 — Correct seller address

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[correct-address] |
| HTTP method | PUT |
| Requested route | /api/admin/review/:adminId/addresses/:type |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId, type; JSON {contactName:string, phone:string, businessName?:string, line1:string, line2?:string, city:string, state:string, postalCode:string, country:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/review/:adminId/addresses/:type |
| Actual response shape | Row(adminAddresses) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-074 — Suspend or recover a seller

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[seller-status] |
| HTTP method | POST |
| Requested route | /api/admin/review/:adminId/status |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId; JSON {action:SUSPEND/RECOVER, reason:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/review/:adminId/status |
| Actual response shape | Row(admins) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-075 — Change category assignment

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[assign-category] |
| HTTP method | PUT |
| Requested route | /api/admin/review/:adminId/categories/:categoryId |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId, categoryId; JSON {active:boolean, reason:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/review/:adminId/categories/:categoryId |
| Actual response shape | Row(adminCategoryAssignments) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/review.ts → admin.service.ts / invitation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-076 — Create a category

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[create-category] |
| HTTP method | POST |
| Requested route | /api/admin/catalog/categories |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {name:string, slug:string, description?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/catalog/categories |
| Actual response shape | Row(categories) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-077 — Create a subcategory

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[create-subcategory] |
| HTTP method | POST |
| Requested route | /api/admin/catalog/subcategories |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {categoryId:string, name:string, slug:string, description?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/catalog/subcategories |
| Actual response shape | Row(subcategories); no description field |
| Status | B. FRONTEND MAPPING BUG |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Form submits optional description; createSubcategory ignores it and subcategories has no description column. Remove unsupported frontend field; no backend change needed for current contract. |

### API-078 — Change categories publication

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[publish-categories] |
| HTTP method | PATCH |
| Requested route | /api/admin/catalog/categories/:categoryId/status |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path categoryId; JSON {status:DRAFT/PUBLISHED/ARCHIVED} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PATCH /api/admin/catalog/categories/:categoryId/status |
| Actual response shape | Row(categories) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-079 — Change subcategories publication

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[publish-subcategories] |
| HTTP method | PATCH |
| Requested route | /api/admin/catalog/subcategories/:subcategoryId/status |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path subcategoryId; JSON {status:DRAFT/PUBLISHED/ARCHIVED} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PATCH /api/admin/catalog/subcategories/:subcategoryId/status |
| Actual response shape | Row(subcategories) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-080 — Change products publication

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[publish-products] |
| HTTP method | PATCH |
| Requested route | /api/admin/catalog/products/:productId/status |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path productId; JSON {status:DRAFT/PUBLISHED/ARCHIVED} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PATCH /api/admin/catalog/products/:productId/status |
| Actual response shape | Row(products) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-081 — Change product featuring

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[featured] |
| HTTP method | PATCH |
| Requested route | /api/admin/catalog/products/:productId/featured |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path productId; JSON {featured:boolean} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PATCH /api/admin/catalog/products/:productId/featured |
| Actual response shape | {id,featured} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-082 — Configure category product field

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[fields] |
| HTTP method | PUT |
| Requested route | /api/admin/catalog/fields |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {categoryId:string, key:string, label:string, inputType:TEXT/NUMBER/SELECT/BOOLEAN, required:boolean, options?:string[]} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/catalog/fields |
| Actual response shape | Row(categoryProductFields) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/catalog.ts → catalog.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-083 — Reviews awaiting moderation

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[pending-reviews] |
| HTTP method | GET |
| Requested route | /api/super-admin/reviews/pending |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/super-admin/reviews/pending |
| Actual response shape | {reviews:Row(reviews)[]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/reviews.ts → review.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-084 — Moderate a review

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[moderate]; superAdminApi.moderateReview |
| HTTP method | POST |
| Requested route | /api/super-admin/reviews/:reviewId/moderate |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path reviewId; JSON {decision:PUBLISHED/REJECTED, notes:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/reviews/:reviewId/moderate |
| Actual response shape | Row(reviews) |
| Status | I. MOCKED / NOT ACTUALLY VERIFIED |
| Evidence / implementation | backend/src/routes/customer/reviews.ts → review.service.ts / return.service.ts |
| Finding / required change | Latest browser check substitutes this response. Real handler exists; permissions, record existence and business validation are bypassed by mock. |

### API-085 — Authorize inspected refund

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[authorize-refund]; superAdminApi.authorizeRefund |
| HTTP method | POST |
| Requested route | /api/super-admin/returns/:returnId/refund/authorize |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path returnId; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/returns/:returnId/refund/authorize |
| Actual response shape | Row(refunds) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/customer/returns.ts → review.service.ts / return.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-086 — Submit refund to payment provider

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[submit-refund] |
| HTTP method | POST |
| Requested route | /api/super-admin/returns/:returnId/refund/submit |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path returnId; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/returns/:returnId/refund/submit |
| Actual response shape | Row(refunds) |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/customer/returns.ts → review.service.ts / return.service.ts |
| Finding / required change | Cashfree sandbox authentication and refund verification must pass before provider refunds are enabled. |

### API-087 — Commission & gateway fee settings

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[settings] |
| HTTP method | GET |
| Requested route | /api/super-admin/finance-settings |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/super-admin/finance-settings |
| Actual response shape | {commissionBps:number,gatewayFeeBps:number} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-088 — Set commission

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[commission] |
| HTTP method | PUT |
| Requested route | /api/super-admin/finance-settings/commission |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {basisPoints:number} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/super-admin/finance-settings/commission |
| Actual response shape | Row(platformFinanceSettings) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-089 — Set payment gateway fee

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[payment-gateway-fee] |
| HTTP method | PUT |
| Requested route | /api/super-admin/finance-settings/payment-gateway-fee |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {basisPoints:number} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/super-admin/finance-settings/payment-gateway-fee |
| Actual response shape | Row(platformFinanceSettings) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-090 — Create eligible settlement

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[settlement] |
| HTTP method | POST |
| Requested route | /api/super-admin/settlements |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {orderItemId:string, refundAdjustment?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/settlements |
| Actual response shape | Row(adminSettlements) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-091 — Approve or decline payout

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[payout-decision] |
| HTTP method | POST |
| Requested route | /api/super-admin/payouts/:payoutId/decision |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path payoutId; JSON {decision:APPROVED/REJECTED, notes:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/payouts/:payoutId/decision |
| Actual response shape | Row(payoutRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-092 — Record completed external payout

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[payout-paid] |
| HTTP method | POST |
| Requested route | /api/super-admin/payouts/:payoutId/paid |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path payoutId; JSON {paymentReference:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/payouts/:payoutId/paid |
| Actual response shape | Row(payoutRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/finance.ts → finance.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-093 — Unresolved reconciliation items

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[reconciliation] |
| HTTP method | GET |
| Requested route | /api/super-admin/reconciliation |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query {domain?:PAYMENT/REFUND/FINANCE, after_id?:string, limit?:number} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/super-admin/reconciliation |
| Actual response shape | {items:Row(reconciliationItems)[],count:number} |
| Status | E. DATA GAP |
| Evidence / implementation | backend/src/routes/super-admin/reconciliation.ts → reconciliation.service.ts |
| Finding / required change | Cursor defect: listUnresolvedItems filters id > after_id but orders by createdAt,id. UUID order can disagree with time order, causing omissions or repeated records across pages. Align cursor and ordering; source request mapping itself matches. |

### API-094 — Inspect reconciliation item

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[reconciliation-detail] |
| HTTP method | GET |
| Requested route | /api/super-admin/reconciliation/:id |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path id; Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/super-admin/reconciliation/:id |
| Actual response shape | {item:Row(reconciliationItems)} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/reconciliation.ts → reconciliation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-095 — Resolve reconciliation item

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[resolve] |
| HTTP method | POST |
| Requested route | /api/super-admin/reconciliation/:id/resolve |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path id; JSON {note:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/reconciliation/:id/resolve |
| Actual response shape | {item:Row(reconciliationItems)} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/reconciliation.ts → reconciliation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-096 — Escalate reconciliation item

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[escalate] |
| HTTP method | POST |
| Requested route | /api/super-admin/reconciliation/:id/escalate |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path id; JSON {note:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/reconciliation/:id/escalate |
| Actual response shape | {item:Row(reconciliationItems)} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/reconciliation.ts → reconciliation.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-097 — Enable or disable Shiprocket

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[shipping-provider] |
| HTTP method | PUT |
| Requested route | /api/admin/shipping/providers/shiprocket |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {enabled:boolean} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/shipping/providers/shiprocket |
| Actual response shape | {providerKey,enabled} |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/admin/shipping.ts → shipping.service.ts |
| Finding / required change | Provider activation requires verified Shiprocket credentials and webhook setup. |

### API-098 — Map seller pickup location

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[pickup-location] |
| HTTP method | PUT |
| Requested route | /api/admin/shipping/pickup-locations |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {adminId:string, adminAddressId:string, providerLocationRef:string, locationName:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | PUT /api/admin/shipping/pickup-locations |
| Actual response shape | Row(shippingProviderLocations) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/shipping.ts → shipping.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-099 — Inspect shipping operations

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[shipping-operations] |
| HTTP method | GET |
| Requested route | /api/super-admin/shipping/operations |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Query {after?:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/super-admin/shipping/operations |
| Actual response shape | {operations:Row(shippingOperations)[]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-100 — Reconcile shipping records

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[shipping-reconcile] |
| HTTP method | POST |
| Requested route | /api/super-admin/shipping/reconcile |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/shipping/reconcile |
| Actual response shape | {processed:number,resolved:number,unresolved:number} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-101 — Retry shipping reconciliation

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[shipping-retry] |
| HTTP method | POST |
| Requested route | /api/super-admin/shipping/operations/:id/retry |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path id; JSON {} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/shipping/operations/:id/retry |
| Actual response shape | {operation:Row(shippingOperations)} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-102 — Record verified shipping evidence

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[shipping-evidence] |
| HTTP method | POST |
| Requested route | /api/super-admin/shipping/operations/:id/evidence |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path id; JSON {providerReference:string, evidence:scalar object} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/super-admin/shipping/operations/:id/evidence |
| Actual response shape | {operation:Row(shippingOperations)} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/super-admin/shipping.ts → shipping.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-103 — Inspect seller lifecycle

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[seller-lifecycle] |
| HTTP method | GET |
| Requested route | /api/admin/review/:adminId/lifecycle |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId; Query none |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | GET /api/admin/review/:adminId/lifecycle |
| Actual response shape | {deletionRequests:Row(adminDeletionRequests)[],recoveryRequests:Row(adminRecoveryRequests)[],archives:Row(adminArchives)[]} |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-104 — Decide deletion request

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[deletion-decision] |
| HTTP method | POST |
| Requested route | /api/admin/review/:adminId/deletion-requests/:requestId/decision |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId, requestId; JSON {decision:APPROVED/REJECTED, reason:string} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/review/:adminId/deletion-requests/:requestId/decision |
| Actual response shape | Row(adminDeletionRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-105 — Decide recovery request

| Audit field | Finding |
|---|---|
| Frontend page/component | /super-admin / OperatorWorkspace |
| Frontend function/hook | runOperatorWorkflow[recovery-decision] |
| HTTP method | POST |
| Requested route | /api/admin/review/:adminId/recovery-requests/:requestId/decision |
| Authentication / required role and permission | Session; SUPER_ADMIN |
| Request body/query/params | Path adminId, requestId; JSON {decision:APPROVED/REJECTED, reason:string, kycSubmissionId?:string, kycRevision?:string, categoryIds?:string[]} |
| Expected response | unknown JSON; success/error rendering only (no typed domain contract) |
| Actual backend route | POST /api/admin/review/:adminId/recovery-requests/:requestId/decision |
| Actual response shape | Row(adminRecoveryRequests) |
| Status | A. FULLY MATCHED |
| Evidence / implementation | backend/src/routes/admin/admin-lifecycle.ts → account-lifecycle.service.ts |
| Finding / required change | Source request matches. Generic record renderer accepts actual response; no live workflow run in this audit. |

### API-106 — Product media (conditional Worker URL)

| Audit field | Finding |
|---|---|
| Frontend page/component | ProductGallery; ProductCard; wishlist |
| Frontend function/hook | publicImageUrl → browser img |
| HTTP method | GET |
| Requested route | /api/images/* |
| Authentication / required role and permission | Public |
| Request body/query/params | Object key products/<uuid>/<filename> |
| Expected response | Image bytes |
| Actual backend route | GET /api/images/* |
| Actual response shape | R2 object bytes; MIME allowlist; 404 missing binding/object |
| Status | G. EXTERNAL DEPENDENCY BLOCK |
| Evidence / implementation | backend/src/routes/customer/customer.ts; frontend/src/lib/images.ts |
| Finding / required change | Production normally loads NEXT_PUBLIC_R2_PUBLIC_BASE_URL directly. Synthetic assets do not verify production R2/domain. |

## Schema dictionary for row responses

These are response-shape source references, not proposals to change tables. `Row(...)` above follows the exact exported schema declaration and its complete selected/returned fields.

- [catalog.ts](../../backend/src/db/schema/catalog.ts): categories, subcategories, products, productVariants, productImages, inventories, categoryProductFields.
- [customer.ts](../../backend/src/db/schema/customer.ts): customerAddresses, carts, cartItems, wishlistItems.
- [admin.ts](../../backend/src/db/schema/admin.ts): adminKycSubmissions, adminKycDocuments, adminAddresses, adminCategoryAssignments, adminAuditEvents.
- [rbac.ts](../../backend/src/db/schema/rbac.ts): admins, roles, permissions, rolePermissions, userRoles.
- [orders.ts](../../backend/src/db/schema/orders.ts): orders, orderItems.
- [returns.ts](../../backend/src/db/schema/returns.ts): returns, returnItems, returnInspections, refunds.
- [reviews.ts](../../backend/src/db/schema/reviews.ts): reviews.
- [finance.ts](../../backend/src/db/schema/finance.ts): adminSettlements, payoutRequests, payoutSettlementItems, platformFinanceSettings.
- [admin-lifecycle.ts](../../backend/src/db/schema/admin-lifecycle.ts): adminDeletionRequests, adminRecoveryRequests, adminArchives.
- [shipping.ts](../../backend/src/db/schema/shipping.ts): shippingOperations, shippingProviderLocations, shipments, shipmentItems, shipmentEvents.
- [reconciliation.ts](../../backend/src/db/schema/reconciliation.ts): reconciliationItems.

## Expanded row response shapes

Extracted from current Drizzle schema metadata without opening a database connection. These expand every `Row(table)` used above. Nullable fields are marked `| null`; JSON object internals follow the named service/schema types. These schemas describe existing responses and are not a recommendation to expose every field in new endpoints.

### categories

```text
id: string
name: string
slug: string
description: string | null
status: string
sortOrder: number
createdAt: ISO date string
updatedAt: ISO date string
```

### subcategories

```text
id: string
categoryId: string
name: string
slug: string
customizedByAdminId: string | null
status: string
sortOrder: number
createdAt: ISO date string
updatedAt: ISO date string
```

### products

```text
id: string
categoryId: string
subcategoryId: string
name: string
slug: string
description: string | null
sku: string | null
price: string
weightKg: string | null
lengthCm: string | null
breadthCm: string | null
heightCm: string | null
currency: string
status: string
attributes: JSON
returnEnabled: boolean
featured: boolean
createdByAdminId: string
createdAt: ISO date string
updatedAt: ISO date string
```

### productVariants

```text
id: string
productId: string
sku: string
title: string
price: string | null
attributes: JSON
status: string
createdAt: ISO date string
updatedAt: ISO date string
```

### productImages

```text
id: string
productId: string
variantId: string | null
objectKey: string
altText: string | null
sortOrder: number
createdAt: ISO date string
```

### inventories

```text
id: string
productId: string
variantId: string | null
availableQuantity: number
reservedQuantity: number
version: number
updatedAt: ISO date string
```

### categoryProductFields

```text
id: string
categoryId: string
key: string
label: string
inputType: string
required: boolean
options: JSON | null
sortOrder: number
createdAt: ISO date string
updatedAt: ISO date string
```

### customerAddresses

```text
id: string
customerId: string
label: string
contactName: string
phone: string
line1: string
line2: string | null
city: string
state: string
postalCode: string
country: string
isDefault: boolean
createdAt: ISO date string
updatedAt: ISO date string
```

### cartItems

```text
id: string
cartId: string
productId: string
variantId: string | null
quantity: number
createdAt: ISO date string
updatedAt: ISO date string
```

### adminKycSubmissions

```text
id: string
adminId: string
status: string
legalName: string | null
businessType: string | null
contactPhone: string | null
submittedAt: ISO date string | null
reviewedByUserId: string | null
reviewedAt: ISO date string | null
reviewNotes: string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### adminKycDocuments

```text
id: string
submissionId: string
documentType: string
privateObjectKey: string
createdAt: ISO date string
```

### adminAddresses

```text
id: string
adminId: string
addressType: string
businessName: string | null
contactName: string
phone: string
line1: string
line2: string | null
city: string
state: string
postalCode: string
country: string
isActive: boolean
createdAt: ISO date string
updatedAt: ISO date string
```

### adminCategoryAssignments

```text
id: string
adminId: string
categoryId: string
status: string
assignedByUserId: string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### adminAuditEvents

```text
id: string
adminId: string | null
actorUserId: string
action: string
entityType: string
entityId: string
metadata: JSON
changedFields: JSON
reason: string | null
createdAt: ISO date string
```

### admins

```text
id: string
userId: string
status: string
createdAt: ISO date string
updatedAt: ISO date string
deletedAt: ISO date string | null
```

### orders

```text
id: string
orderNumber: string
customerId: string
checkoutKey: string | null
checkoutRequestHash: string | null
paymentExpiresAt: ISO date string | null
expiredAt: ISO date string | null
cancelledAt: ISO date string | null
stockState: string
status: string
currency: string
subtotal: string
shippingAmount: string
discountAmount: string
totalAmount: string
shippingAddressSnapshot: JSON
paymentStatus: string
placedAt: ISO date string | null
deliveredAt: ISO date string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### orderItems

```text
id: string
orderId: string
adminId: string
productId: string
variantId: string | null
productNameSnapshot: string
variantTitleSnapshot: string | null
skuSnapshot: string | null
unitPrice: string
weightKgSnapshot: string | null
lengthCmSnapshot: string | null
breadthCmSnapshot: string | null
heightCmSnapshot: string | null
quantity: number
subtotal: string
discountAmount: string
totalAmount: string
createdAt: ISO date string
```

### returns

```text
id: string
orderId: string
customerId: string
adminId: string
status: string
reason: string
customerNotes: string | null
returnAddressSnapshot: JSON | null
approvedAt: ISO date string | null
receivedAt: ISO date string | null
qcStatus: string | null
qcNotes: string | null
grossRefundAmount: string | null
deductionAmount: string | null
netRefundAmount: string | null
deductionBreakdown: JSON | null
requestedAt: ISO date string
updatedAt: ISO date string
```

### returnItems

```text
id: string
returnId: string
orderItemId: string
orderId: string
adminId: string
quantity: number
reason: string | null
createdAt: ISO date string
```

### returnInspections

```text
id: string
returnId: string
inspectedByAdminId: string
conditionStatus: string
packagingStatus: string | null
notes: string | null
decision: string
inspectedAt: ISO date string
createdAt: ISO date string
```

### refunds

```text
id: string
returnId: string | null
orderId: string
paymentId: string
amount: string
currency: string
reason: string
status: string
providerReference: string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### reviews

```text
id: string
productId: string
orderItemId: string
customerId: string
rating: number
title: string
body: string
status: string
moderatedByUserId: string | null
moderationNotes: string | null
moderatedAt: ISO date string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### adminSettlements

```text
id: string
adminId: string
orderId: string
orderItemId: string
grossAmount: string
commissionAmount: string
gatewayFeeAmount: string
refundAdjustmentAmount: string
netPayable: string
status: string
createdAt: ISO date string
updatedAt: ISO date string
```

### payoutRequests

```text
id: string
adminId: string
amount: string
status: string
requestedAt: ISO date string
reviewedByUserId: string | null
reviewNotes: string | null
reviewedAt: ISO date string | null
paidAt: ISO date string | null
paymentReference: string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### payoutSettlementItems

```text
id: string
payoutRequestId: string
settlementId: string
createdAt: ISO date string
```

### platformFinanceSettings

```text
settingKey: string
basisPoints: string
updatedByUserId: string | null
updatedAt: ISO date string
```

### adminDeletionRequests

```text
id: string
adminId: string
status: string
reason: string
requestedAt: ISO date string
verifiedAt: ISO date string | null
reviewedByUserId: string | null
reviewedAt: ISO date string | null
reviewNotes: string | null
completedAt: ISO date string | null
```

### adminRecoveryRequests

```text
id: string
archiveId: string
adminId: string
status: string
reason: string
requestedAt: ISO date string
reviewedByUserId: string | null
reviewedAt: ISO date string | null
reviewNotes: string | null
```

### adminArchives

```text
id: string
adminId: string
deletionRequestId: string
categoryManifest: JSON
createdAt: ISO date string
restoredAt: ISO date string | null
restoredByUserId: string | null
```

### shippingOperations

```text
id: string
operationKey: string
shipmentId: string | null
providerKey: string
providerReference: string
kind: string
state: string
actor: string
evidence: JSON | null
retryCount: number
lastError: string | null
lastAttemptedAt: ISO date string | null
nextRetryAt: ISO date string | null
resolvedAt: ISO date string | null
createdAt: ISO date string
updatedAt: ISO date string
```

### shippingProviderLocations

```text
id: string
adminId: string
adminAddressId: string
addressType: string
providerKey: string
providerLocationRef: string
locationName: string
status: string
createdAt: ISO date string
updatedAt: ISO date string
```

### reconciliationItems

```text
id: string
itemKey: string
domain: string
type: string
entityId: string
providerReference: string | null
state: string
retryCount: number
nextRetryAt: ISO date string | null
lastAttemptedAt: ISO date string | null
lastError: string | null
evidence: JSON | null
resolvedAt: ISO date string | null
resolvedByUserId: string | null
resolutionNote: string | null
createdAt: ISO date string
updatedAt: ISO date string
```
