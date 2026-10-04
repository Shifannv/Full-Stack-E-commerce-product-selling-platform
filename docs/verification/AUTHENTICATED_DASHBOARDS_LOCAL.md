# Authenticated dashboard verification — local only

Completed 2026-10-03. **AUTHENTICATED FRONTEND VERIFICATION: PASS**

## Environment and method

- One intended Wrangler dev instance at `http://127.0.0.1:8787`, explicitly connected to `127.0.0.1:5432/ownline_checkout_test`. Both R2 bindings were local. Wrangler's auxiliary runtime is part of the same dev instance.
- Next.js dev frontend at `http://127.0.0.1:3000` during browser checks. Final production static build also used the local test Worker.
- Headless Chrome with separate browser contexts for Admin, Super Admin, and the signed-out customer regression. Browser network routing allowed only `127.0.0.1`; it did not replace or mock any response.
- Better Auth's existing `/api/auth/sign-in/email` endpoint created real cookie sessions. `/api/auth/get-session` and `/api/me` verified each identity and role. No session token was injected or authentication bypassed.
- Admin: existing `tees-demo-seed-user` fixture and its existing credential account.
- Super Admin: no existing Super Admin was present in this test database. A temporary account was created through `provisionCredentialUser`, the service used by the existing bootstrap script. Its random password remained in memory and was passed to the browser process through stdin.

## Results

| Check | Admin | Super Admin |
| --- | --- | --- |
| Credential authentication and actual Better Auth session | PASS | PASS |
| `/api/me` role | `ADMIN`, approved; no Super Admin role | `SUPER_ADMIN` |
| Dashboard summary API | 200 | 200 |
| Dashboard records API | `/api/admin/products?limit=5`: 200 | `/api/super-admin/admins?limit=5`: 200 |
| Four displayed metrics exactly match captured API response | PASS | PASS |
| Displayed records match captured API response | PASS | PASS |
| Desktop and 390 px mobile rendering; no horizontal overflow | PASS | PASS |
| Session and dashboard survive refresh | PASS | PASS |
| Normal authenticated console errors, runtime errors, failed requests, HTTP errors | None | None |
| Logout, followed by `/api/me` returning 401 | PASS | PASS |

The Admin received the expected **403** from `/api/super-admin/summary` and `/api/super-admin/admins`. Opening `/super-admin` rendered the static public shell and access error; protected metric/record content did not render. This is expected authorization behavior for the existing static-export architecture. No frontend mapping or backend authorization defect was found.

Customer regression passed: homepage and `/products/tees` rendered, API price was `249.00`, API variants were M/L, both variant buttons selected correctly, and the actual uploaded JPEG decoded successfully. No customer runtime errors occurred. Next.js emitted an informational development warning about eager loading of the homepage LCP image; it did not prevent rendering.

**Two-image hover:** IMPLEMENTED BUT NOT VISUALLY EXERCISED BECAUSE CURRENT TEST PRODUCT HAS ONE IMAGE. No additional catalog/media fixture was created.

## Checks and cleanup

- Frontend TypeScript: PASS (`tsc --noEmit --incremental false`, also checked by the final build).
- Backend TypeScript, including the guarded verification runner: PASS.
- Frontend lint: PASS, zero errors; four existing warnings in generated `.wrangler/tmp` files.
- Production static build: PASS, 20 pages generated, including both dashboards and `/products/tees`.
- Both browser sessions were signed out. The temporary Super Admin and its account, role assignment, and sessions were removed. User/account/role counts matched the baseline afterward. The existing Tees Admin was retained; only sessions created by this verification were eligible for cleanup.
- No application/business-logic or authorization changes were needed. Added only verification scripts and evidence documentation for this task.
- No Aiven connection, production mutation, Worker deployment, or Pages deployment occurred. `.env.dev.local` was not changed; the test Worker received an explicit process-local connection override.

Machine-readable browser evidence: [AUTHENTICATED_DASHBOARDS_LOCAL.json](AUTHENTICATED_DASHBOARDS_LOCAL.json).
Screenshots: workspace `.tmp-redesign-auth/` (Admin and Super Admin, desktop and mobile).

Reproduction: run `node --import tsx scripts/verify-dashboard-local.ts --worker` from `backend/`, start the frontend at the origin above, then run the same script with `--verify`. The runner refuses remote/non-test databases and refuses to replace an existing Super Admin. Browser tooling is resolved through `PLAYWRIGHT_MODULE_PATH` or the installed local Playwright package fallback. Credentials are never saved in the evidence file.

**Remaining blocker: none for authenticated local dashboard verification.**
