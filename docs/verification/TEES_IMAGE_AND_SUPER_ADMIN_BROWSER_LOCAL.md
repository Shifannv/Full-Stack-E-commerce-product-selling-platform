# OWNLINE DROPSHIP — Verification Report (2026-10-07, local only)

## TASK 1 — Tees product image source

**Result: RESOLVED. Not an application-code defect. No code changed.**

Pipeline traced (running Worker 127.0.0.1:8787 uses DB `ownline_dev`):
| Step | Finding |
|---|---|
| DB product | `tees` id `a1b2c3d4-0003-0001-0001-000000000001`, PUBLISHED, created 2026-10-07 06:40Z (reseeded) |
| Image metadata | 1 row, objectKey `products/a1b2c3d4-.../c8cde9f1-ad56-4ae8-99bf-2a3f511c23fc.jpg` (valid `products/{uuid}/{file}`) |
| Local R2 object | Exists in local Miniflare bucket `shop-product-images`, 776005 B, `image/jpeg`, uploaded 2026-10-07 07:20Z |
| Image API | `GET /api/images/<key>` → 200, `image/jpeg`, Content-Length 776005, `nosniff`, Content-Disposition inline |
| Public URL | `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=http://127.0.0.1:8787/api/images` + key (correct for local) |
| Frontend | `<img src>` = exact API URL, loads 1080×1376 |

**Root cause:** local fixture/environment mismatch. `seed-tees-demo.ts` creates a new random placeholder objectKey every run ("actual file needs R2 upload later"). After `ownline_dev` was reseeded (new product id), the DB pointed at a key with no local R2 object (the only objects were for the old `cc2c96f0-...` product), so the image 404'd and the UI correctly showed "Image coming soon". The object was then restored at that exact key with the existing guarded upload mechanism (`upload-tees-demo-image.ts`). Application code, key validation, MIME allowlist, nosniff and Content-Disposition are untouched.

Browser (Playwright Chrome, real requests, desktop 1440 + mobile 390):
- Product detail `/products/tees`: image loads (200), no fallback
- Home, category `/categories/mens-clothing`, search listing: ProductCard image loads (200)
- Forced 404 on `/api/images/*`: "Image coming soon" fallback shown, 0 broken images
- No horizontal overflow on any page/viewport

Note: 2 orphan local R2 objects remain for the old `cc2c96f0-...` product (still used by `ownline_checkout_test`). They are harmless and were left in place.

**Production impact:** none from this issue. The production blocker is unchanged: the R2 production custom domain is still unresolved, and the r2.dev URL is development-only. The production media base stays blank, which gives an honest missing-image state.

## TASK 2 — Temporary Super Admin browser verification

**Setup verified**
- `ownline_dev` already has the protected Super Admin (ACTIVE). The guarded bootstrap enforces one Super Admin, so it returns 409 there. The protected account was **not** touched.
- So the existing isolated pattern was used (same as `verify-seller-lifecycle-browser.ts` / AUTHENTICATED_DASHBOARDS_LOCAL): DB `ownline_checkout_test` (127.0.0.1, asserted local, 0 Super Admins), real Worker `app` served in-process on 127.0.0.1:8792, separate `next dev` on 127.0.0.1:3012. The user's running 3000/8787 servers and `ownline_dev` were not changed.
- Provisioned with the existing guarded script `scripts/bootstrap-super-admin.ts` (`assertLocalOrOptedIn` + `provisionCredentialUser`). Email `test-superadmin@example.invalid`, random 24-char password (in memory only). DB check: role `SUPER_ADMIN`, status `ACTIVE`.

**Browser verified** (Chrome headless, real login form, no cookie injection)
- UI sign-in → `POST /api/auth/sign-in/email` 200 → `/api/me` 200, roles `[SUPER_ADMIN]`
- `/super-admin`: HTTP 200, heading "Platform overview", no alerts, no API errors
- `/super-admin/reconciliation`: 200, "Reconciliation", no alerts, no API errors
- `/super-admin/reviews`: 200, "Review moderation", no alerts, no API errors
- Desktop 1440 + mobile 390: no horizontal overflow; 0 page JS errors
- Sign-out via `/api/auth/sign-out` 200, then the sign-in form shows again

**Finding (not fixed, UI out of scope):** the redesigned Super Admin `DashboardShell` has **no visible Sign out button** (0 found). Sign-out works only through the API. Only the Admin account page and the operator gate states have one. Recommend adding a Sign out control to the shell in a future UI task.

**Automated tests**
- Backend TypeScript: PASS
- Backend unit `npm test`: 84/84 PASS (includes image-upload + customer route tests)
- PG `provisioning.pg.test.ts` + `security.pg.test.ts`: 51/51 PASS
- Frontend TypeScript: PASS
- Frontend lint: 0 errors (2 pre-existing warnings)
- Frontend production build: PASS (`/products/tees`, `/super-admin/reconciliation`, `/super-admin/reviews` exported)

**Remaining blockers:** none for this task. Open item: Super Admin shell Sign out button (UI gap).

**Production safety:** local 127.0.0.1 only. No Aiven, production, Cashfree, Shiprocket, Resend, R2 production or deployment. Protected account `shifan.coding@gmail.com` fingerprint (status, updatedAt, password-hash prefix) identical before/after.

**Cleanup status:** temporary user, account, role and sessions deleted. Test DB counts restored to baseline (users 13, accounts 1, user_roles 1). Temp account remaining: 0. Temporary script, verification dist dirs and the `tsconfig.json` include lines auto-added by Next were removed or reverted. Working tree clean.

## Side note
The browser CORS error on `http://localhost:3000` is expected: the local Worker trusts only `http://127.0.0.1:3000` (FRONTEND_ORIGIN). Use 127.0.0.1. "Google sign-in is unavailable" locally is expected because Google OAuth is BLOCKED.
