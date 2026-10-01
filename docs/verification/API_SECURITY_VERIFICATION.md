# Custom API security verification — 2026-09-30

**VERIFIED INTERNALLY.** Final isolated PostgreSQL run: **217 passed, 0 failed, 0 skipped** (187 existing cases plus 30 security cases). Backend regression: **67 passed, 0 failed, 0 skipped**. This is implementation/integration evidence, not deployment or live-provider verification.

## Mutation-origin policy and inventory

`src/middleware/mutation-origin.ts` runs before every custom `/api/*` POST, PUT, PATCH and DELETE. Require an exact HTTP(S) Origin matching the configured `FRONTEND_ORIGIN` or the origin of `BETTER_AUTH_URL`. If Origin is absent, require a Referer whose origin matches either configured origin. An invalid/present Origin cannot fall back to Referer. Missing both, `null`, foreign origins, alternate ports, origin suffixes and malformed origins receive 403. No wildcard subdomains or implicit localhost exemptions. Configured `http://127.0.0.1:3000` is accepted for local development; `localhost` is accepted only when explicitly configured. Cookie presence is not a bypass; even public activation POST follows this policy.

Protected route inventory (prefixes below include all registered mutation methods):

| Category | Custom route paths |
| --- | --- |
| Customer data | `/api/customer/addresses[/:addressId]`, `/api/customer/cart/items/:id`, `/api/customer/wishlist/:productId` |
| Checkout/payment | `/api/checkout`, `/api/orders/:orderId/payment-session` |
| Reviews | `/api/reviews`, `/api/super-admin/reviews/:reviewId/moderate` |
| Returns/refunds | `/api/returns`, `/api/admin/returns/:returnId/{decision,received,inspection}`, `/api/super-admin/returns/:returnId/refund/{authorize,submit}` |
| Finance | `/api/admin/payouts`, `/api/super-admin/settlements`, `/api/super-admin/payouts/:payoutId/{decision,paid}` |
| Seller onboarding | `/api/admin/onboarding/kyc[/documents]`, `/onboarding/addresses/:type`, `/onboarding/categories/:categoryId`, `/onboarding/submit` under `/api/admin` |
| Account/invitations | `/api/admin/activate`, `/api/admin/review/{provision,invite,reinvite}`, `/api/admin/review/:adminId/{kyc,addresses/:type,decision,status,categories/:categoryId}` |
| Deletion/recovery | `/api/admin/account/deletion-requests[/:requestId/verify]`, `/api/admin/account/recovery-requests`, `/api/admin/review/:adminId/{deletion-requests,recovery-requests}/:requestId/decision` |
| Seller catalog | `/api/admin/subcategories`, `/api/admin/products[/:productId]`, `/api/admin/products/:productId/{variants,images,images/upload,inventory}` |
| Privileged catalog/settings | `/api/admin/catalog/{categories,subcategories}`, `/api/admin/catalog/{categories/:categoryId,subcategories/:subcategoryId,products/:productId}/status`, `/api/admin/catalog/products/:productId/featured`, `/api/admin/catalog/fields`, `/api/admin/shipping/{providers/shiprocket,pickup-locations}` |
| Shipping operations | `/api/admin/orders/:orderId/shipments`, `/api/admin/shipments/:shipmentId/{awb,pickup}` |

GET/HEAD/OPTIONS are unaffected by the CSRF guard. `/api/auth/*` remains owned by Better Auth and its existing trusted-origin policy. `/webhooks/payments/cashfree` and `/webhooks/shipping/events` are exempt and require their existing provider signature/token. No custom HTTP cancellation route exists in the current router; the existing cancellation service is unchanged. The limiter's orders group covers any future mutation in that namespace.

## Bounded bodies

`src/lib/security/body.ts` rejects a declared Content-Length above the limit before pulling body chunks. It also counts actual bytes, independent of missing or false Content-Length, cancels at the first excess chunk, and only then decodes/parses the bounded buffer.

- Both webhook routes: maximum **65,536 bytes inclusive**, then provider verification/JSON handling as appropriate. Cashfree signs the unparsed text; no JSON reserialization occurs before signature verification. Oversize returns 413; malformed authenticated JSON returns 422.
- KYC: maximum **5,500,000 total bytes** before multipart parsing; existing **5,000,000 file-byte** maximum, required document type, PDF/JPEG/PNG signature checks, generated private keys, storage behavior and cleanup on failed database writes remain. Total excess returns 413; invalid/oversized parsed file returns 422. No evidence contents are logged.
- Streaming tests prove early Content-Length rejection reads zero chunks, actual overflow cancels without draining remaining input, and legitimate KYC storage still works.

## Rate limits

`src/middleware/rate-limit.ts` uses the existing PostgreSQL connection and a single `api_rate_limits` table. Counters increment atomically with `INSERT ... ON CONFLICT`; database `statement_timestamp()` defines the window. Keys are `v1:<class>:SHA256(identity)`, independent of entity IDs or URL variation. Counters saturate at limit+1, reset on expiration, and opportunistic cleanup removes at most 100 counters older than expiry+one day with `SKIP LOCKED`. Each HTTP request is counted once even when Hono's mounted authorization middleware runs repeatedly.

| Class | Identity | Limit/window | Routes |
| --- | --- | --- | --- |
| Activation | Cloudflare-set CF-Connecting-IP; shared `unknown` fallback locally | 10 / 600 seconds | GET and POST `/api/admin/activate` |
| Account verification/recovery | Authenticated user ID | 10 / 600 seconds | Account deletion/verification/recovery mutations |
| Invitations | Authenticated user ID | 10 / 600 seconds | Admin invite/reinvite/provision |
| Privileged mutations | Authenticated user ID | 60 / 60 seconds | Other `/api/admin/*` and `/api/super-admin/*` mutations, including refunds, payouts, settings and catalog |
| Commerce | Authenticated user ID | 20 / 60 seconds | Checkout, orders/payment-session and return mutations |

These shared classes limit credential attempts and costly/money-affecting operations while permitting ordinary interactive use; production traffic tuning was not measured. Excess returns 429 with Retry-After. Database failure fails closed with 503 and Retry-After: 5. There is no administrator/internal bypass. Provider webhooks, ordinary reads, customer cart/address/wishlist/review edits, and Better Auth endpoints do not consume these counters. Those low-impact edits retain session/ownership/origin checks. Better Auth's login handling is unchanged. CF-Connecting-IP trust assumes the deployed Worker edge; X-Forwarded-For is ignored.

Upstash configuration names exist in the repository, but no backend rate-limit client existed. Automatic approval review rejected transmitting hashed identity counters to Upstash. The implemented PostgreSQL alternative adds no external service call or infrastructure; no Upstash integration was installed or contacted.

## Account eligibility

`accountEligible` is the canonical normal-session and approved-Admin predicate: account exists, status ACTIVE, deletedAt null. Actual Better Auth sessions exercise active, suspended and ACTIVE-but-deleted users against the Worker. Archived recovery keeps its explicit special authentication mode, current archive/ownership/role/credential checks, and approval-time eligibility revalidation. Origin and account-class limits also protect recovery POSTs.

## Cashfree freshness and retries

The adapter requires a 13-digit millisecond timestamp, accepts signed timestamps at most **24 hours old** and at most **five minutes ahead**, and retains constant-time HMAC comparison. Both boundaries are inclusive. Fresh, 30-minute retry, stale, future-skewed, invalid-signature and exact-boundary cases are tested. A real Worker webhook retry produces one PostgreSQL event and no second stock movement. Existing event key `(event type, provider payment ID)` and payment-state idempotency remain unchanged.

Cashfree documents millisecond signature examples, at-least-once delivery, default retries at 2/10/30-minute intervals, and customizable retry schedules. The 24-hour window is our application policy, allowing ample room beyond those default retries; it is **not** a claimed provider guarantee or merchant-dashboard setting. We do not assume retries regenerate timestamps. [Cashfree webhook overview and retry policy](https://www.cashfree.com/docs/payments/online/webhooks/overview), [signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification).

An otherwise valid event carrying a timestamp older than the window is rejected, including an old duplicate; it cannot be treated as a new payment. Merchant retry/resend schedules exceeding this policy require explicit policy review and operational reconciliation before deployment. Live merchant settings were not inspected or changed.

## Audit coverage and transaction boundaries

Existing `admin_audit_events` now has required `entity_type`, `entity_id`, and structured safe metadata in addition to actor_user_id/action/changed_fields/reason. Nullable admin_id permits platform catalog/settings events without inventing a seller owner. Actor foreign keys remain required.

- Refund authorization and result persistence record REFUND entity IDs inside the corresponding business transaction. Submission intent is durably recorded before provider I/O, outside business locks; uncertain results remain reconcilable. Replayed terminal outcomes retain their original decision evidence.
- Settlement creation and payout request/review/paid transitions record SETTLEMENT/PAYOUT entity IDs inside their transactions. Actor arguments are mandatory for finance/refund administrative decisions; payout request identity derives from the authenticated seller's Admin owner.
- Admin onboarding, account/status decisions, provision, invitation/reissue/activation, category request/grant/revocation, seller catalog/inventory/images, deletion/archive/recovery retain their atomic audit writes and explicit entity IDs.
- Super Admin category/subcategory creation/status, product status/featured, category-field configuration, provider configuration and pickup-location writes use `auditedMutation`, atomically committing the business write and actor/entity audit.
- New metadata contains IDs, counts and status only. No credentials, raw invitation tokens, KYC contents, full bodies or payment secrets are logged. Existing free-form decision reasons remain as before.
- Tests force invalid audit actors and verify rollback removes category/settlement/refund changes, keeps a payout APPROVED rather than PAID, and leaves no partial audit. Existing lifecycle rollback/race tests also verify archive/recovery audit identity.

## Migration and historical impact

**Migration required: YES — `0013_api_security.sql`.** Applied successfully only through the guarded `drizzle.checkout-test.config.ts` to `CHECKOUT_TEST_DATABASE_URL` at `127.0.0.1:5432/ownline_checkout_test`.

The migration creates an empty rate-counter table and extends the existing audit table. Historical audit rows already have a required admin_id; entity_type is backfilled to ADMIN and entity_id to that known Admin identity before NOT NULL is enforced. Original actions, actors, changed fields, reasons and timestamps are retained. Historical finer-grained catalog entity attribution is not fabricated. No commerce, financial, identity, credential, stock or return history is rewritten. The audit backfill can require a migration lock; production sizing/execution remains an operator rollout task.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run test:checkout:pg` | **217 passed, 0 failed, 0 skipped** |
| Dedicated security file, included above | **26 passed**, real Worker sessions/routes and PostgreSQL limiter/audit tests |
| Additional commerce security cases, included above | **4 passed**: Cashfree retry, refund audit/rollback, settlement/payout audit/rollback, Shiprocket retry |
| `npm test` | **67 passed, 0 failed, 0 skipped** |
| `npm run typecheck` | PASS |
| `npx drizzle-kit check --config drizzle.checkout-test.config.ts` | PASS |
| `git diff --check` | PASS |
| Scheduler discovery test repetitions | **15/15 passed**, zero failures/skips |

Scheduler code and fixture policy were not changed by this task. The full scheduler/race/Worker-handler suite passes. Repetitions establish current stability; they are not a mathematical proof against arbitrary unrelated test-database contents.

**Aiven/shared database untouched. Live Cashfree/Shiprocket calls: NO. Deployment: NO. Frontend changes: NO.** Provider adapters use existing fake transports where exercised; webhook requests are local Worker calls. No real email or Upstash call was made.

No remaining implementation/test blocker for this scoped internal verification. Production rollout still requires separately authorized migration/deployment, correct trusted-origin configuration, review of actual Cashfree retry schedules against the 24-hour policy, and production operational validation. Earlier unrelated readiness blockers are not cleared by this checkpoint.
