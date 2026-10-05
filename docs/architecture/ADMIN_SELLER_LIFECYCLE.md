# Admin seller lifecycle — authoritative reconciliation

Date: 2026-10-05. This contract supersedes invitation-only provisioning descriptions in older checkpoints. OWNLINE is single-tenant; ADMIN is an internal seller, provisioned only by SUPER_ADMIN. Public seller registration is prohibited.

## Protected boundaries

The established Super Admin account is outside all provisioning and password operations. Never replace, reset, rename, re-role or duplicate it. Its credentials, Better Auth configuration, sessions and local reset mechanism remain unchanged. Existing customer storefront design is outside this task. Preserve pre-existing uncommitted dashboard work.

## Required state machine

Provision with email, name and temporary password -> authenticated forced password change -> private permanent password -> DRAFT onboarding -> KYC evidence, shipping origin, return address, requested categories and required payout details -> PENDING_SUPER_ADMIN_APPROVAL -> ACTIVE, CHANGES_REQUIRED or REJECTED.

CHANGES_REQUIRED permits editing and resubmission. REJECTED is terminal for this application. Approval activates the requested category assignments in the same transaction; subsequent category changes remain explicit Super Admin actions.

Authentication account status and seller approval are separate. New provisioned users must be ACTIVE to authenticate while their seller profile remains DRAFT. Password-change state must be persisted and enforced by backend authorization, not a frontend redirect. Existing accounts must not be retroactively reset. Password replacement revokes the provisioned seller's sessions and requires login with the permanent password.

## Reconciliation findings

| Contract | Existing implementation | Required action |
|---|---|---|
| Provisioning | `POST /api/admin/review/provision` always rejects; invitation email is the only flow | Add atomic Super Admin provisioning with duplicate-account protection |
| Initial password | No persisted forced-change state | Add seller-only credential lifecycle and server enforcement |
| Onboarding | KYC, private documents, two addresses and category requests implemented | Reuse services and existing state transitions |
| Review | APPROVED / CHANGES_REQUIRED / REJECTED implemented | Preserve locking, audit and category scope |
| Payout identity | Reconciled with the operator: every seller supplies bank details; Super Admin verifies for manual payouts | Encrypted bank details, masked summary, audited reveal, revision-bound verification, submission/approval and payout gates implemented |

Bank details are mandatory for onboarding submission. Super Admin verification is mandatory for seller approval and manual payout approval/payment recording. Required details are account holder, bank name, account number and Indian IFSC. Storage uses AES-GCM and a dedicated `ADMIN_BANK_ENCRYPTION_KEY` (base64, 32 bytes); it is never derived from the protected account or its auth secret. Missing encryption configuration fails closed. Save replaces the bank revision and clears prior verification. Review must specify the current revision. Normal responses expose last four digits and review state only; full details require a separate authenticated, audited Super Admin POST. Existing active sellers may supply missing bank details without resetting their accounts. Verified active bank changes require a future separate change-review workflow and cannot use onboarding to bypass review.

New invitations are disabled in favor of provisioning. Previously issued invitations may still activate or be reissued. No existing credentials or roles are reset or backfilled by either additive migration.

## API contract

| Method and path | Authorization / payload / result |
|---|---|
| POST `/api/admin/review/provision` | Super Admin; `email`, `name`, `temporaryPassword` (12–128 characters); returns IDs and forced-change flag, never a password |
| GET `/api/me` | Session actor; Admin includes `mustChangePassword` |
| POST `/api/admin/account/initial-password` | Own provisioned Admin; `currentPassword`, distinct `newPassword`; revokes seller sessions, returns `signInRequired` |
| PUT `/api/admin/onboarding/bank` | Own Admin; bank fields above; returns masked summary |
| GET `/api/admin/onboarding` | Own Admin; includes masked `bank` alongside KYC/address/category state |
| GET `/api/admin/review/:adminId` | Super Admin; includes masked bank summary |
| POST `/api/admin/review/:adminId/bank/reveal` | Super Admin only; private no-store response, audited full details and revision |
| POST `/api/admin/review/:adminId/bank/decision` | Super Admin; `revision`, `decision` (`VERIFIED` or `CHANGES_REQUIRED`), `notes` |

Provisioning is atomic and refuses all existing accounts. Neither plaintext nor hashes appear in API responses or audit events. Until forced change completes, only actor lookup, initial-password change and auth login/logout are available; ordinary Better Auth mutations cannot bypass the requirement. Seller onboarding edits and approval use the existing Admin row-lock order.

## Dependency gates

1. Reconcile documentation and architecture.
2. Implement and reconcile backend lifecycle contracts, including the confirmed mandatory manual-bank verification rule.
3. Verify backend with isolated fixture accounts, never the protected account's credentials.
4. Complete Super Admin UI only after gates 2–3 pass.
5. Verify Super Admin in an authenticated browser.
6. Complete Admin UI.
7. Verify Admin in an authenticated browser.
8. Run customer regression only, preserving its design.

Historical verification does not close these new gates. Never claim browser completion from mocks, compilation or service tests.

## Password recovery gate — RESOLVED 2026-10-06

Password recovery for ADMIN and CUSTOMER is now IMPLEMENTED and locally verified. The [Forgot_Password_workflow.md](Forgot_Password_workflow.md) requirement has been fulfilled:

- Three anonymous endpoints at `/api/password-reset/` implement the full reset flow.
- Super Admin is explicitly excluded at the service layer — no reset token, no reset email.
- 48-byte CSPRNG raw token; only SHA-256 hash stored (no new schema migration required).
- 1-hour TTL, single-use, sessions invalidated on success.
- Rate-limited: 5 requests per 600 seconds per CF edge IP.
- 23/23 focused password-reset PG tests PASS (2026-10-06).
- Admin seller approval state, `mustChangePassword` flag and onboarding state are preserved through a reset — password recovery is orthogonal to the seller lifecycle.
- The existing Admin first-login forced-password-change flow is unaffected.
- The protected Super Admin account is untouched.

API contract additions (see [API_ROUTE_MAP](../api/API_ROUTE_MAP.md) for full table):

| Method and path | Authorization / payload / result |
|---|---|
| POST `/api/password-reset/forgot-password` | Anonymous; `{ email }`; always returns generic 200; rate-limited |
| GET `/api/password-reset/validate?token=<raw>` | Anonymous; returns `{ expiresAt, role }` or 422 |
| POST `/api/password-reset/reset-password` | Anonymous; `{ token, password }`; returns success or 422 |

Remaining open gates: Admin UI browser verification. The backend contract is complete.
