# Admin Browser E2E Lifecycle Verification

**Date:** 2026-10-06  
**Environment:** Local only — `ownline_checkout_test` (127.0.0.1:5432), HTTP bridge on 127.0.0.1:8791, Next.js dev on 127.0.0.1:3011  
**Tool:** Playwright Chromium (ms-playwright-go 1.57.0) via `verify-seller-lifecycle-browser.ts`  
**Protected account:** `shifan.coding@gmail.com` — untouched throughout

---

## Phase 1 — Super Admin browser provisioning (--super-admin mode)

| Step | Result |
|---|---|
| Super Admin logs in via browser | PASS |
| "Create seller account" form — name, email, temporary password | PASS |
| Temporary password field cleared after submit | PASS |
| Seller Admin record created in DB | PASS |
| Application prepared programmatically (KYC, docs, addresses, category, bank, submit) | PASS |
| Masked bank account (last 4 digits only before reveal) | PASS |
| "View private bank details" decrypts full number | PASS |
| Bank review saved | PASS |
| Full account number hidden after bank review | PASS |
| CHANGES_REQUIRED decision saved — DB confirms | PASS |
| Application resubmitted programmatically | PASS |
| APPROVED decision saved — DB confirms ACTIVE | PASS |
| Desktop overflow (1440×960) | PASS |
| Mobile overflow (390×844) | PASS |
| 6 operator routes — no alerts, no sign-in redirect | PASS (`/super-admin`, `/super-admin/admins`, `/super-admin/products`, `/super-admin/payouts`, `/super-admin/roles`, `/super-admin/lifecycle`, `/super-admin/reconciliation`) |
| Logout → sign-in button appears | PASS |
| No unhandled JS runtime errors | PASS |

---

## Phase 2 — Admin login + forced password change (--admin mode)

| Step | Result |
|---|---|
| Admin navigates to `/admin` | PASS |
| Login with temporary password → forced-change form appears | PASS |
| Sign-in button hidden during forced change | PASS |
| Dashboard heading absent during forced change | PASS |
| Fills `currentPassword`, `newPassword`, `confirm` → "Set permanent password" | PASS |
| "Password updated" heading appears | PASS |
| "Continue to sign in" returns to sign-in | PASS |
| Temporary password rejected (alert shown) | PASS (Better Auth WARN: Invalid password in server log) |
| Permanent password accepted → "Sign out" button appears | PASS |
| "Your workspace" heading visible | PASS |

---

## Phase 3a — Role isolation

| Step | Result |
|---|---|
| Authenticated Admin navigates to `/super-admin` | PASS |
| "Platform at a glance" heading absent | PASS |
| Page shows sign-in or "needs another account" | PASS |
| Return to `/admin` → still authenticated | PASS |

---

## Phase 3b — Full Admin onboarding via UI

| Step | Result |
|---|---|
| "Seller profile" group opens nav | PASS |
| **KYC details**: Legal name, business type, phone → "Operation completed" | PASS |
| **KYC document**: document type + file upload (`setInputFiles`) → "Operation completed" | PASS |
| **SHIPPING_ORIGIN address**: all fields → "Operation completed" | PASS |
| Navigate away (form remount) | PASS |
| **RETURN address**: all fields → "Operation completed" | PASS |
| **Category request**: categoryId → "Operation completed" | PASS |
| **Bank details**: account holder, bank name, account number, IFSC → "Operation completed" | PASS |
| Full account number NOT visible in bank save response | PASS |
| **Submit application** → "Operation completed" | PASS |
| "Seller application" workflow shows `PENDING_SUPER_ADMIN_APPROVAL` | PASS |
| DB: `admins.status = PENDING_SUPER_ADMIN_APPROVAL` | PASS |

---

## Phase 4 — Pre-approval security check

| Step | Result |
|---|---|
| "Catalog" group → "Create a product" | PASS |
| Fill product fields (categoryId, subcategoryId, name, slug, price, returnEnabled) | PASS |
| Confirm changes → error alert appears | PASS |
| Alert has non-empty text | PASS |

---

## Phase 5/6 — Super Admin review workflow

Covered fully in `--super-admin` mode above (CHANGES_REQUIRED + resubmission + APPROVED).

---

## Phase 7 — Programmatic approval

| Step | Result |
|---|---|
| `revealBankDetails` returns revision | PASS |
| `reviewBankDetails(VERIFIED)` succeeds | PASS |
| `reviewApplication(APPROVED)` sets status ACTIVE | PASS |
| DB: `admins.status = ACTIVE` | PASS |

---

## Phase 8 — Active Admin dashboard

| Step | Result |
|---|---|
| Reload `/admin` → "Sign out" still visible (session persists) | PASS |
| "Your workspace" heading | PASS |
| Group: Catalog — no alerts | PASS |
| Group: Seller profile — no alerts | PASS |
| Group: Orders & returns — no alerts | PASS |
| Group: Finance — no alerts | PASS |
| Group: Account lifecycle — no alerts | PASS |
| Finance → Balance, settlements & payouts → "Records" | PASS |
| Account lifecycle → Account lifecycle workflow → "Records" | PASS |
| **Responsive overflow** (desktop 1440×960) | PASS |
| **Responsive overflow** (tablet-lg 1280×800) | PASS |
| **Responsive overflow** (tablet 1024×768) | PASS |
| **Responsive overflow** (tablet-sm 768×1024) | PASS |
| **Responsive overflow** (mobile-lg 390×844) | PASS |
| **Responsive overflow** (mobile-sm 375×812) | PASS |
| Screenshots saved to `.tmp-seller-lifecycle/` | PASS |
| Sign out → sign-in button appears | PASS |

---

## Phase 9 — Password recovery

| Step | Result |
|---|---|
| `/admin/forgot-password` with non-existent email → "Check your email" (enumerate-safe) | PASS |
| `/admin/reset-password` (no token) → "No reset token was provided" | PASS |
| `initiatePasswordReset(db, sellerEmail)` returns raw token (test bypass) | PASS |
| `/admin/reset-password?token=<rawToken>` → "Set a new password" heading | PASS |
| Fill `password` + `confirm` → "Set new password" → "Password updated" | PASS |
| Old permanent password rejected after reset (sessions invalidated) | PASS (Better Auth WARN in server log) |
| New recovered password accepted | PASS |
| Second use of same token → "invalid or has already expired" | PASS (single-use enforcement) |
| Final sign-out | PASS |
| No unhandled JS runtime errors (hydration/act noise excluded) | PASS |

---

## Regression suite

| Check | Result |
|---|---|
| Backend TypeScript (`npx tsc --noEmit`) | **PASS** (no output = no errors) |
| Backend unit tests (`npm test`) | **84/84 PASS** |
| Backend PG integration tests (`npm run test:checkout:pg`) | **349/349 PASS** |
| Frontend TypeScript (`npx tsc --noEmit`) | **PASS** (no output = no errors) |
| Frontend lint (`npm run lint`) | **PASS** |
| Frontend production build (real catalog via in-process bridge, `--build` flag) | **PASS** (6 category + 2 product static pages generated) |

---

## Cleanup

| Item | Result |
|---|---|
| Fixture reviewer user deleted | PASS |
| Fixture seller Admin record + all onboarding data deleted | PASS |
| Test category deleted | PASS |
| KYC documents, addresses, bank accounts, audit events deleted | PASS |
| Sessions, accounts, user roles deleted | PASS |
| Protected `shifan.coding@gmail.com` account untouched | CONFIRMED |
| No Aiven access | CONFIRMED (127.0.0.1 guard enforced) |
| No production Resend email sent | CONFIRMED (direct service call bypasses email) |
| No Cashfree, Shiprocket, R2, or CF deployment | CONFIRMED |
