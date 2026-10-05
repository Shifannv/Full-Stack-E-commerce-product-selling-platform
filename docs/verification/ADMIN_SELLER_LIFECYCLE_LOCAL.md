# Admin seller lifecycle — local implementation and verification

Date: 2026-10-05. Contract: [Admin seller lifecycle](../architecture/ADMIN_SELLER_LIFECYCLE.md).

## Implemented

- Atomic, Super Admin-only provisioning through `POST /api/admin/review/provision`: new ACTIVE authentication account, ADMIN role, DRAFT seller and hashed temporary credential. Existing accounts are refused, including case-insensitive duplicate checks. Concurrent requests create one account. No password is returned or audited.
- Seller-only persisted forced-password-change state. Before replacement, onboarding and seller APIs are denied; the actor endpoint and dedicated first-password-change endpoint remain accessible. Ordinary Better Auth mutations cannot bypass the requirement. Permanent password replacement revokes the seller's sessions, and the old password no longer authenticates.
- Mandatory bank details for every new onboarding submission. AES-GCM encrypts private account details using the dedicated `ADMIN_BANK_ENCRYPTION_KEY`. Ordinary responses return last four digits and review state. Full details require an authenticated, audited, no-store Super Admin POST. Verification is bound to the current bank revision; resaving clears verification.
- Application approval requires bank verification. Existing KYC, operational addresses, requested category scope, CHANGES_REQUIRED/resubmission and terminal rejection are retained. APPROVED activates the seller and requested scope atomically.
- Manual payout approval and recording payment require verified bank details. Existing active sellers can provide missing bank details without resetting their account; changes to verified active bank details are outside onboarding.
- New invitations are disabled in favor of provisioning; outstanding invitation activation and reissue remain compatible. Existing local reset scripts and Better Auth configuration are unchanged.
- Super Admin seller UI: account creation confirmation, private temporary-password entry cleared after success, seller review, private KYC download, operational addresses, category names, masked bank state, audited reveal/hide, bank review, and confirmed approval/changes/rejection. Successful decisions refresh real API state before displaying success. Existing operator pages and customer visual design are preserved.

## Verification evidence

| Check | Result |
|---|---|
| Backend TypeScript | PASS |
| Existing unit suite | 84/84 PASS |
| Full isolated PostgreSQL suite | 325/325 PASS |
| New credential/bank lifecycle integration test | 1/1 PASS, separately; subsequently added to the PG suite command |
| Frontend TypeScript | PASS |
| Frontend lint | PASS after excluding generated verification output |
| Impeccable detector, changed seller UI targets | No findings |
| Super Admin authenticated browser gate | PASS |
| Isolated production build | PASS; 29 static pages |

The new PG integration test verifies credential hashing, duplicate and concurrent provisioning protection, unauthenticated denial, forced-change API denial, ordinary-auth password-change bypass denial, invalid/current-password checks, session invalidation, old-password rejection, permanent login, Admin denial of Super Admin data, encrypted bank storage, masked projection, non-reviewer reveal denial, stale bank revision denial, submission and approval gates, corrections/resubmission, and ACTIVE approval. Audit output is checked for absence of both test passwords.

Browser command: `node --import tsx scripts/verify-seller-lifecycle-browser.ts --build`, from `backend/`. It serves the actual Worker route code over a local HTTP bridge, with real PostgreSQL and Better Auth sessions. A memory-only KYC bucket is used; there is no external R2/provider traffic. A unique reviewer and seller fixture are created only in `postgres@127.0.0.1:5432/ownline_checkout_test` and removed by this run's exact identities. No established Super Admin credential is requested, read, reset or used.

Browser checks cover actual UI provisioning, cleared password input, masked/private bank viewing, verification, changes required, API resubmission, approval, persisted database state, refresh, logout, all six other Super Admin routes, page runtime errors and horizontal overflow at 1440×960 and 390×844. The six other operator routes were authenticated rendering checks; exhaustive mutations on those pages are not claimed. API-level application preparation/resubmission is deliberate because the Admin UI gate is still pending. Browser screenshots are local artifacts in `../../.tmp-seller-lifecycle/` and contain only test data.

The developer's existing dev server remains running. Verification uses ports 3011/8791 and `.next-seller-verification` / `.next-seller-build`. Export output is a local verification artifact, not a deployment-ready release with production API configuration.

## Remaining dependency gate

The project requirements added during the task in [Forgot_Password_workflow.md](../architecture/Forgot_Password_workflow.md) require Admin/Customer email password recovery, excluding Super Admin. This is not implemented. Automatic approval review rejected the proposed implementation because sensitive reset tokens would be sent through Resend and credentials/sessions would be changed without sufficiently explicit trusted chat authorization. An approval question is pending. No rejected reset code was applied and no email was sent.

| Phase | Current gate |
|---|---|
| 1 — reconciliation | Completed; password-recovery requirement and authorization gap recorded |
| 2 — backend | Provisioning, first-password change, onboarding bank and approval contracts implemented; email password recovery pending authorization |
| 3 — backend verification | Passed for implemented contracts; recovery verification cannot be claimed |
| 4 — Super Admin UI | Seller creation/review implemented; existing operator surfaces retained |
| 5 — Super Admin browser | Passed for the scopes described above |
| 6 — Admin UI | Not started in this task; backend recovery gate remains open |
| 7 — Admin browser | Not started |
| 8 — customer regression | Not started; customer storefront source/design unchanged |

Before using these new APIs in another environment, apply migrations `0017_admin_initial_credentials` and `0018_admin_bank_verification` and configure the dedicated bank encryption key. Both migrations were applied only to the isolated test database. The first generated migration includes equivalent shipping foreign-key name normalization; it does not change the relationship or any account data. No production/Aiven migration, deployment or real email delivery occurred.
