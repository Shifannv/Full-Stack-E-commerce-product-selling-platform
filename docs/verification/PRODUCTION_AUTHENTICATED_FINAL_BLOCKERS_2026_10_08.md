# Production authenticated final blocker investigation — 8 October 2026

## 1. VERIFIED

Production frontend: https://ownline-ecommerce.pages.dev. Backend: https://ecommerce-api.ownlinedropshipping.workers.dev.

Existing Admin and Super Admin accounts successfully signed in through production UI. Both roles' controlled read matrices returned 200 before and after deployment. Admin accessing Super Admin summary returned 403. Anonymous `/api/me`, customer addresses, Admin summary and Super Admin summary returned 401. `/returns` and all 15 operator documents in the matrix returned 200 in both passes.

The two bounded passes ran at **14:58:54–14:59:50 IST** and **15:01:42–15:02:31 IST**. Each recorded 23 API requests and 16 document requests, including timestamps, role, endpoint, HTTP status, response shape and Cloudflare ray where available. No 503 occurred. No page runtime errors or attempted forbidden mutations were recorded. Successful payloads retain only structural metadata; credentials, cookies and personal account data are excluded.

Admin reads: `/api/me`, `/api/admin/summary`, products, target product inventory, orders, returns, finance and onboarding. Super Admin reads: `/api/me`, `/api/super-admin/summary`, products, admins, pending reviews, reconciliation, payouts and roles.

Evidence: [before](final-auth-gate-20261008/before.json), [after](final-auth-gate-20261008/after.json), [production logout lifecycle](final-auth-gate-20261008/production-logout-final.json).

## 2. FIXED

The active `components/operator/operator-gate.tsx` returned the authenticated child workspace without a sign-out control. Its existing logout handler was reachable only in denied/error or password-change states. The older `components/layout/operator-workspace.tsx` had a visible authenticated control, but the current Super Admin layout did not use that gate. Admin already exposes its existing implementation through `/admin/account`.

Three frontend files changed: the active gate supplies a logout control through its existing render callback; DashboardShell accepts an optional header action; the Super Admin workspace supplies that action. The control calls the existing `authApi.signOut()` mechanism. It disables while pending. On success the gate clears the actor and unmounts the workspace. On failure it displays an error and retains authenticated state, avoiding a false signed-out claim. No backend or shared API contract changed.

Deployed to production `main`: **f314b743-4c2f-46cf-bf58-2e50bdd33567**, https://f314b743.ownline-ecommerce.pages.dev. Wrangler's production deployment list confirms this environment and branch. Build metadata references base commit `9b92a4a`; the deployment was explicitly marked dirty because it includes the local three-file fix. No new source commit or Git push was performed.

Production desktop/mobile captures show a visible header Sign out control at 1440 and 375 pixels. Super Admin UI logout returned 200, immediately displayed the login form, returned 401 from `/api/me` and protected summary, remained signed out after hard refresh, and denied direct `/super-admin/products` access. Admin's existing account control returned 200, navigated to `/admin`, invalidated the session, returned protected 401, and showed sign-in after hard refresh/direct protected access. Admin's pre-existing gate can retain its mounted state during same-layout navigation; this task did not change that behavior or claim an immediate gate reset for Admin.

An early verification runner checked control visibility before hydration; its `after.json` false visibility findings are superseded by the readiness-aware final logout evidence. A separate early lifecycle run expected Admin to use Super Admin's immediate gate behavior and timed out after a successful Admin API logout. That artifact is preserved as `production-logout.json`; the final run tests Admin's actual navigation behavior and passes all 18 checks.

## 3. STILL BLOCKED

Fresh CUSTOMER authenticated regression could not run: the existing isolated customer browser returned 401 from `/api/me` in both passes. The user was asked to sign in there; no customer credential was invented, account created, or Google login assumed. Previous customer login/persistence/logout evidence remains historical evidence and does not prove the new deployment's authenticated customer regression. Customer catalog/media reads and anonymous denial were checked in this run.

Historical 503 origin is unresolved. Real catalog photography is absent from the specified object. Cashfree, Shiprocket, Resend/domain and remaining infrastructure readiness remain separate, unverified gates.

## 4. 503 ROOT CAUSE

**INTERMITTENT / NOT REPRODUCED. Root cause NOT ESTABLISHED.**

Exact previous endpoint evidence:

| Prior role | Endpoint | Finding |
|---|---|---|
| Admin | `/api/admin/returns?limit=20&offset=0` | 503, including the query client's subsequent attempt |
| Admin | `/api/me` | 503 on several workspace checks |
| Admin | `/api/auth/sign-out` | 503 on one logout attempt |
| Super Admin | `/api/me` | 503 in the original authenticated run |

Sources are the preserved `production-auth-9b92a4a-20261008/admin-content.json` and `super-admin.json`. Old artifacts do not retain per-failure response bodies, exact request timestamps/rays, or matching Worker log events. Later focused historical reads/logouts succeeded, but that is not a correlated same-request proof or a diagnosis. Effects on CUSTOMER cannot be established from the available failures.

Current sequential bounded read passes produced zero 503s, so the planned one delayed retry on a 503 was never triggered; retry success for an actual current failure is untested. Reads were not repeatedly hammered to manufacture a failure. The successful controlled Admin returns requests used the default list URL; exact-query reproduction of the historical paginated URL was not separately tested.

Wrangler live tail captured **121 events** on unchanged Worker version `db9144e2-c9bf-4685-913f-1b0251a8bd5e`: 119 `ok`, two `canceled`, no logged errors or exceptions. Canceled Super Admin summary invocations coincide with screenshot-pass page navigations at 15:02:25 and 15:02:26 IST; no corresponding 503 was recorded. Cancellation is not treated as a 503 diagnosis. [Sanitized log evidence](final-auth-gate-20261008/worker-logs.json) excludes headers/cookies and retains path, time, outcome and version. The tail was stopped; the temporary raw file was removed. The installed Wrangler interface provides live tailing, not a historical query command, so these logs cannot retrospectively correlate the earlier failures.

Source establishes possible failure origins, not the actual historical cause: authorization catches emit `{"error":"Authorization unavailable"}`/503; auth catches emit `{"error":"Authentication unavailable"}`/503; Admin catches emit `{"error":"Admin operation unavailable"}`/503. Auth uses the Hyperdrive connection string and PostgreSQL through the existing database client. The Pages proxy also has distinct configuration-error 503 responses and relays upstream responses. Since the prior bodies and correlated exceptions are unavailable, neither authentication/session failure, Worker→Hyperdrive→Aiven connectivity, nor Cloudflare transient behavior can be proved or excluded. **Application-level versus infrastructure-level origin remains undetermined.** No backend/infrastructure change was made on an unsupported hypothesis.

Frontend handling: the HTTP client raises ApiError and reads Retry-After; it has no automatic fetch retry. Operator TanStack queries retry network/5xx once, do not retry 4xx, and mutations do not retry. The gate offers manual Try again on a failed identity check. Logout uses an explicit error state and requires another user action after a failure. Existing handling can recover a transient read but does not demonstrate its harmlessness or resolve the cause.

## 5. MEDIA STATUS

**REAL CATALOG MEDIA = NOT VERIFIED.**

Product `c549089e-32fb-4217-96d7-35dc5a40eb70` API record identifies image `12bd210a-f195-4554-a8cd-97a7d706db41`, object key `products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png`, alt text **“Phase 11b-3 R2 verification image”**, sort order 0.

Both the Pages `/api/images/{key}` URL and direct Worker image URL returned **200, image/png, 68 bytes, 1×1 pixels**. The production product browser image decoded and was visible with natural dimensions 1×1. A direct `wrangler r2 object get --remote` read from `shop-product-images` confirms the stored object matches the public bytes, excluding a stale-proxy-only explanation. [R2 evidence](final-auth-gate-20261008/r2-verification.json).

SHA-256: `36301ece93d96811008b89131c3a6c26cb223801c0da1761fc81838de9341c4d`. This is a verification pixel, not real product photography. No media replacement, upload, deletion or catalog change occurred.

## 6. TEST RESULTS

| Check | Result |
|---|---|
| Frontend TypeScript | PASS (`tsc --noEmit --incremental false`; build TypeScript also passed) |
| Frontend lint | PASS, zero errors; two existing unused-import warnings in products page/invitation setup |
| Production build/static export | PASS, 36 pages; production-origin wrapper used |
| Existing production-media tests | PASS, 2/2 |
| Mocked browser logout regression | PASS, 4 cases: success and 503 failure at 1440/375 widths |
| Production operator logout lifecycle | PASS, 18/18 readiness-aware checks |
| Production read/document matrices | Expected 200/401/403; zero 503 in two passes |
| New Super Admin control | Visible and within viewport at 1440/375 widths |
| Fresh CUSTOMER authenticated lifecycle | NOT VERIFIED: no existing session |
| Backend TypeScript | Not required: no backend/shared API contracts changed |
| Source whitespace check | PASS |

[Local browser evidence](final-auth-gate-20261008/local-tests.json). The first npm invocation hit PowerShell execution policy and was corrected to npm.cmd. The initial incremental typecheck could not write its cache in the sandbox; the non-incremental check and production build completed successfully. These environment failures are not represented as passing tests.

## 7. PRODUCTION DATA SAFETY

Production business endpoints were GET-only. Browser guards allowed only requested authentication login/logout POST operations and blocked business mutations/provider calls. Existing operator credentials were loaded locally without output. No orders, payments, payouts or shipments were created; Cashfree/Shiprocket were not called. No migrations, Aiven business-data edits, R2 writes, production secrets/settings changes, cron changes, account creation/deletion, role changes or catalog edits occurred. Authentication operations inherently create/invalidate sessions; these were the only database-side session effects requested for verification.

The only application deployment was the authorized minimal frontend fix and its unchanged existing Pages API proxy bundle. Backend Worker version stayed unchanged. Infrastructure configuration was not edited. Previous evidence was preserved. Current evidence contains no passwords, session cookies or authorization headers.

## 8. FINAL GATE

**PARTIALLY VERIFIED**

The Super Admin sign-out blocker is fixed and production-verified. Historical 503 diagnosis, fresh authenticated customer regression and real catalog photography remain open. Full production readiness is not claimed.
