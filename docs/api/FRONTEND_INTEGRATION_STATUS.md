# Frontend integration status — 2026-10-06

Current local implementation; no deployment or production data changes. This report covers customer pages, Admin and Super Admin, as requested. Provider readiness is separate from a connected screen.

## What changed (2026-10-06 update)

- **Admin UI missing workflows wired:** `PUT /api/admin/onboarding/bank` (bank details — account holder, bank name, account number, IFSC) added to Admin Seller Profile operator workflows. `POST /api/admin/review/provision` (Super Admin provisioning with temporary password), `POST /api/admin/review/:adminId/bank/reveal` (audited full bank reveal), and `POST /api/admin/review/:adminId/bank/decision` (bank verification decision with revision) added to Super Admin Sellers workflows.
- **Account page fix:** Admin account page now shows "Account ID" (monospace UUID) instead of the user's UUID mislabeled as "Email". The `/api/me` endpoint does not return email, so showing the role and internal ID is the correct display.
- **Stub catalog build script added:** `backend/scripts/stub-catalog-server.ts` — in-process server serving real `ownline_checkout_test` catalog data for frontend build verification. Use `CATALOG_BUILD_API_URL=http://127.0.0.1:8797` during builds when the main Worker is not running against the test database.

## What changed (2026-10-04 update)

- Customer account, addresses, search, collections, cart, checkout, orders and favourites share the homepage's cream/forest palette, Instrument Serif headings, DM Sans controls and restrained borders. Product detail retains its shopping layout. The homepage intro, video handoff and static product grids remain in place.
- The shared footer now has a Dress entry, collection/account navigation, returns access and back-to-top. All links resolve to existing shopping routes; no unconfigured newsletter or invented policy links were added. Tablet navigation collapses before the desktop links become crowded.
- Both dashboards use the same brand typography and palette with practical navigation, forms and records. The intro stays on the storefront. Sign-in, role checks, sign-out, errors and a review-before-confirm step surround management actions.
- Delivered-order items now offer review submission and return requests. Unpaid orders offer confirmed cancellation. `/returns?id=…` retrieves an owned return by reference and displays a return address only when supplied by the approved-return response.

## API connections

| Surface | Connected behavior | Current limit |
|---|---|---|
| Public shopping | Categories, product search/filter/pagination, details and published reviews | Static category/product slugs must be rebuilt after publication; current release requires real catalog input |
| Customer account | Session/profile, addresses, cart, favourites, checkout quote, orders/detail/tracking, cancellation, review submission, return creation/status | Real customer Google OAuth and new authenticated mutation paths still need end-to-end verification |
| Admin | Dashboard summary; assigned catalog, product/subcategory/variant creation, product edits, image upload/attachment/list, inventory read/write; onboarding/KYC/documents/addresses/category requests; order/tracking/returns decisions and inspection; finance/payout requests; lifecycle actions | Manual references and task forms rather than complete record editors; archived recovery entry still needs dedicated auth handling |
| Super Admin | Summary; seller inspection/approval/KYC/address/category/status management; catalog publication/featured/fields; review moderation/refund authorization; seller finance/settings/settlement/payout decisions and recording; reconciliation; shipping records/evidence/pickup mappings; lifecycle decisions | Some collections have no list/detail endpoint; provider-triggering operations remain gated |

The operator registry has **76 tasks: 69 active and 7 gated**. [Machine-readable route coverage](../verification/FRONTEND_CONNECTION_AUDIT.json) is generated from actual Worker registrations and checked against registry paths and serialization. `UI_CONNECTED` means source wiring, not a claim that every workflow has passed a live authenticated transaction.

The audit enumerates 108 distinct handlers: 92 UI-connected, 9 gated (including checkout/payment-session), 2 webhook handlers, 2 diagnostics, 1 media handler, 1 retired handler and 1 optional activation preflight without UI.

The only registered application route without an active UI or explicit gate is `GET /api/admin/activate`, an optional token preflight. The existing setup page submits `POST /api/admin/activate`. `/api/admin/review/provision` is retired (410); health, media and webhooks have their own non-form roles. Better Auth wildcard handlers are outside this route-count audit.

### Contract corrections

- Checkout creation now accepts the quote's `cartVersion` and `lineFingerprint` and sends `Idempotency-Key`. Its response type matches the order/status/amount/deadline response. The payment button remains paused; correcting a wrapper does not enable checkout.
- Inventory writes require `expectedVersion`. Added scoped `GET /api/admin/products/:productId/inventory` to retrieve rows and current versions; owner, category scope, approved Admin role and permission checks remain authoritative. No migration required.
- Courier provider pickup/serviceability reads are in Super Admin, matching backend permissions. Product weight/dimension fields serialize as decimal strings; quantities/versions are numbers and decisions are booleans. Dynamic attributes accept typed scalar values; quoted numeric-looking values stay strings.
- File uploads use multipart transport. Private KYC downloads use authenticated blob retrieval. Sensitive response keys are excluded from the generic record renderer.

## Not ready or not verified

| Area | Status / next requirement |
|---|---|
| Customer Google sign-in | Real current browser/session/refresh/logout flow still needs verification; historical partial evidence does not close this gate |
| Cashfree | Sandbox authentication/payment/refund verification incomplete; checkout, payment-session UI and provider refund submission remain paused |
| Shiprocket | Credentials, webhook and fulfillment verification incomplete; provider activation and seller shipment/AWB/pickup actions remain paused |
| Seller invitations | Delivery/configuration not verified; invite/reinvite controls remain paused; setup route already exists |
| Production catalog/media | Real published catalog, shipping/policy input and R2 custom domain still required; fixture export is for local checks only |
| Scheduled expiry/reconciliation | Production cron remains disabled; no production scheduling change made |
| New operator workflows | Registered-route/serialization audit and representative mocked browser writes passed; real authorized mutations, uploads and provider lookups were not exhaustively run |
| Archived seller recovery | Backend supports recovery-auth endpoints, but the workspace uses active `/api/me` admission. A dedicated archived-account recovery entry is still needed |
| Advanced editing | Many task forms use manually entered references. Optional empty fields are omitted; explicit clearing and record-prefilled editors need further UI work |

## Backend APIs still needed for complete screens

These are recommended additions, not implemented endpoints or new launch approvals. Preserve ownership/RBAC, pagination and safe public/private response fields.

1. **Customer return list** by authenticated owner, with order/item reference and status. Today the customer must retain a return reference; there is only a per-reference status route.
2. **Admin return queue** scoped to that seller, with pagination/status filters. Existing decision/inspection routes require a manually supplied reference.
3. **Super Admin catalog discovery/detail** covering draft products, variants and inventory. Public endpoints deliberately hide drafts; publication forms currently take references.
4. **Super Admin payout/settlement lists** with status/seller filters. Existing per-seller finance and reference-based decisions do not provide a complete queue.
5. **Safe capabilities/readiness response** for checkout, invitations and shipping. Current gates are explicit frontend policy; a public response should expose booleans/reason codes only, never credentials.
6. **Order-item action eligibility** with item delivery time, review state, return availability/window and remaining returnable quantity. Current controls use whole-order delivery and backend validation; mixed seller deliveries need item-level guidance.

## Verification and limits

- Frontend TypeScript and ESLint passed; static export passed with **85 generated routes** against an isolated synthetic catalog.
- Chrome UI/transport checks passed: **41 evidence entries**, customer routes at 1440/768/390px, both dashboards at desktop/mobile, footer links, no horizontal overflow or customer runtime errors, review/return/cancellation request bodies, confirmation boundaries, role denial and paused provider controls. API responses/mutations were mocked; no real provider or business mutation occurred.
- Backend typecheck and **83 unit tests** passed. The targeted guarded local PostgreSQL inventory test passed: own inventory/version read, versioned update, foreign-owner denial and revoked-category denial. The full PostgreSQL suite was not rerun in this task.
- Impeccable mechanical check reported no findings on the changed shared footer, workspace, headings, order actions, return lookup and CSS. Desktop/mobile screenshots were reviewed.

Local browser evidence: workspace `.impeccable/review/integration/checks.json` and screenshots. Reproduce with `frontend/scripts/verify-storefront-integration.mjs` against an isolated fixture export/preview, setting `STOREFRONT_URL` as needed. The script requires the local Playwright/Chrome installation. Source audit: from `backend`, `node --import tsx scripts/verify-frontend-workflows.ts`.
