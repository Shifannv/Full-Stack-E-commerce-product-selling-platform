# Backend Error Handling — Comprehensive Audit

**Audit date:** 2026-10-01
**Scope:** All backend source under `ecommerce/backend/src/`
**Constraint:** Read-only audit. No code modifications were made.

> **Path note (2026-10-01):** this audit was done before the structure refactor. References to `index.ts:<line>` and route files refer to the pre-refactor layout: the auth handler is now `routes/auth/auth.routes.ts`, health is `routes/health.ts`, and the `scheduled` handler is `scheduler.ts`. Route files moved under `routes/{customer,admin,super-admin,webhooks}/` (code moved verbatim; findings unchanged). Line numbers are historical.

---

## 1. Architecture Summary

| Layer | Technology | Error Surface |
|---|---|---|
| Router | Hono | Per-sub-app `onError` handlers |
| Auth | Better Auth + custom middleware | `authenticate` in `authorization.ts` |
| RBAC | Custom middleware | `requireAuth`, `hasPermission` |
| ORM | Drizzle | PostgreSQL errors via `pg` driver |
| Background jobs | Worker `scheduled` handler | `index.ts` scheduled event |
| Payment provider | Cashfree HTTP adapter | `cashfree-payment.adapter.ts` |
| Shipping provider | Shiprocket HTTP adapter | `shiprocket.adapter.ts` |
| Email provider | Resend HTTP | `invitation-email.service.ts` |
| Webhook ingestion | Cashfree, Shiprocket | Signature/token verification routes |

---

## 2. Global Error Handling Pattern

### 2.1 `DomainError` — The Canonical Business Error

All expected business failures are signaled via `DomainError` (defined in `admin.service.ts`):

```typescript
class DomainError extends Error { constructor(message: string, public status: number) }
```

Every route sub-app has an `onError` handler that:
1. Returns `DomainError` as `{ error: message }` with the specified HTTP status
2. Logs non-DomainError exceptions with **safe diagnostics only** (`error.name`, `error.code`)
3. Returns a generic `503` with a domain-specific message (e.g., `"Order operation unavailable"`)

**Verdict: CORRECT.** No raw database errors, no stack traces, no internal state leaks to clients.

### 2.2 Route-level `onError` Handlers — Complete Inventory

| Sub-app | File | Fallback message | Status |
|---|---|---|---|
| `adminRoutes` | `admin.ts:102` | `"Admin API failed"` → 503 | ✅ |
| `orderRoutes` | `orders.ts:12` | `"Order operation unavailable"` → 503 | ✅ |
| `paymentRoutes` | `payments.ts:17-23` | `"Payment operation unavailable"` → 503 | ✅ |
| `paymentWebhookRoutes` | `payments.ts:23` | Shared with above | ✅ |
| `shippingRoutes` | `shipping.ts:36-41` | `"Shipping operation unavailable"` → 503 | ✅ |
| `webhookRoutes` (shipping) | `shipping.ts:42` | Shared with above | ✅ |
| `returnRoutes` | `returns.ts:26` | `"Return operation unavailable"` → 503 | ✅ |
| `financeRoutes` | `finance.ts:11` | `"Finance operation unavailable"` → 503 | ✅ |
| `customerRoutes` | `customer.ts:12` | `"Customer operation unavailable"` → 503 | ✅ |
| `publicCatalogRoutes` | `customer.ts:13` | Shared with above | ✅ |
| `reviewRoutes` | `reviews.ts:11` | `"Review operation unavailable"` → 503 | ✅ |
| `publicReviewRoutes` | `reviews.ts:12` | Shared with above | ✅ |
| `superAdminDashboardRoutes` | `super-admin-dashboard.ts:12` | `"Super Admin dashboard unavailable"` → 503 | ✅ |
| `reconciliationRoutes` | `reconciliation.ts:33` | `"Reconciliation operation unavailable"` → 503 | ✅ |
| Activation (pre-auth) | `admin.ts:71` | `"Activation unavailable"` → 503 | ✅ |

**Verdict: COMPLETE.** Every route sub-app has a consistent `onError` handler. No route group is missing error handling.

### 2.3 Error Response Format — Consistency

All error responses use the same shape: `{ error: string }`. No sub-app invents a second format. Webhook routes additionally return `{ ok: true, ...result }` on success, which is correct for provider acknowledgment.

**Verdict: CONSISTENT.** No format divergence found.

---

## 3. `console.error` Usage Audit

All `console.error` calls log **only safe diagnostic fields**:

| Location | Logged Fields | Sensitive Data? |
|---|---|---|
| `index.ts:39` (auth) | `name` | ❌ |
| `index.ts:70` (health) | `name` | ❌ |
| `authorization.ts:62` | `name`, `code` | ❌ |
| `admin.ts:73` (activation) | `name` | ❌ |
| `admin.ts:103` (admin API) | `name`, `code` | ❌ |
| `orders.ts:12` | `name`, `code` | ❌ |
| `payments.ts:19` | `name`, `code` | ❌ |
| `shipping.ts:38` | `name`, `code` | ❌ |
| `returns.ts:28` | `name`, `code` | ❌ |
| `finance.ts:11` | `name`, `code` | ❌ |
| `customer.ts:12` | `name`, `code` | ❌ |
| `reviews.ts:11` | `name`, `code` | ❌ |
| `super-admin-dashboard.ts:12` | `name`, `code` | ❌ |
| `reconciliation.ts:33` | `name` | ❌ |
| `invitation-email.service.ts:88` | `status` (HTTP code) | ❌ |
| `unpaid-expiry.service.ts:62-64` | Via `safeFailure()` | ❌ (see §3.1) |

### 3.1 `safeFailure()` in Unpaid Expiry

The `safeFailure()` function (in `unpaid-expiry.service.ts`) extracts only `name` and `code` from an error, explicitly excluding `message`, `stack`, and `cause`. This is the correct pattern for background job logging.

**No `console.log` calls exist in production source code.** Zero results from grep.

**Verdict: CLEAN.** No passwords, tokens, API secrets, database URLs, cookies, or authorization headers are logged.

---

## 4. Catch Block Audit — Complete Inventory

### 4.1 Legitimate Empty Catches (no error variable)

Each `catch { }` below is justified:

| File | Line | Purpose | Justified? |
|---|---|---|---|
| `shiprocket-auth.service.ts:9` | URL parse | Rethrows descriptive Error | ✅ |
| `shiprocket-auth.service.ts:22` | JWT decode | Returns `undefined` (fallback expiry) | ✅ |
| `shiprocket-auth.service.ts:61` | JSON parse | Rethrows descriptive Error | ✅ |
| `cashfree-payment.adapter.ts:37` | Base64 decode | Returns `null` (signature rejected) | ✅ |
| `invitation-email.service.ts:95` | JSON parse (response) | Returns `{ delivered: false }` result | ✅ |
| `invitation.service.ts:220,302` | JSON parse (payload) | Rethrows `DomainError("corrupt", 503)` | ✅ |
| `mutation-origin.ts:10` | URL parse | Returns `null` (origin rejected) | ✅ |
| `payments.ts:46` | JSON parse (webhook) | Rethrows `DomainError("Invalid JSON", 422)` | ✅ |
| `shipping.ts:62,112` | JSON parse (evidence/webhook) | Rethrows `DomainError("Invalid ...", 422)` | ✅ |
| `admin.ts:93` | URL validation | Rethrows `DomainError(409)` | ✅ |
| `reconciliation.service.ts:314` | attemptResolution catch | Returns `false` (non-resolvable) | ✅ |

### 4.2 Reconciliation `.catch(() => undefined)` Instances

| File | Line | Context | Justified? |
|---|---|---|---|
| `reconciliation.service.ts:465` | Diagnostic update in catch | Last-resort write; original error preserved | ✅ |
| `shipping.service.ts:308` | Diagnostic update in catch | Comment: "committed lease remains recoverable" | ✅ |

These `.catch(() => undefined)` calls suppress diagnostic-write failures only. The original error is already captured. The state machine is designed so the claimed row remains recoverable by the next batch.

### 4.3 Catches With Error Variables — All Classified

| File | Line | Action | Classified? |
|---|---|---|---|
| `reservation.service.ts:24` | `withTransitionRetry` | Retries `40P01`/`40001`; maps `23xxx` → `DomainError(409)`; rethrows else | ✅ |
| `order.service.ts:59` | `quoteCart` per-item | Catches `DomainError` → adds to `problems`; rethrows else | ✅ |
| `order.service.ts:116` | `checkoutCart` retry | Retries `40P01`/`40001`; rethrows else | ✅ |
| `review.service.ts:22` | Unique violation | Maps `23505` → `DomainError(409)`; rethrows else | ✅ |
| `finance.service.ts:79` | Unique violation | Maps `23505` → `DomainError(409)`; rethrows else | ✅ |
| `finance.service.ts:114` | Payout eligibility | Catches `DomainError` → holds settlement; rethrows else | ✅ |
| `product-image-upload.ts:28` | Stream read failure | Re-throws `DomainError`; maps else → `DomainError(422)` | ✅ |
| `return.service.ts:193` | Provider refund call | Finalizes as PROCESSING; re-throws for 502 | ✅ |
| `operations.ts:42` | Provider mutation | Classifies `ShippingProviderRejection` vs unknown; updates operation state | ✅ |
| `reconciliation.service.ts:447` | Batch per-record | Truncates error to 500 chars; updates item state; catches diagnostic write failure | ✅ |
| `shipping.service.ts:304` | Batch per-record | Updates operation state; catches diagnostic write failure | ✅ |
| `unpaid-expiry.service.ts:57` | Batch per-order | Logs via `safeFailure`; catches logging failure | ✅ |
| `invitation-email.service.ts:81` | Fetch network error | Returns `{ delivered: false }` | ✅ |
| `rate-limit.ts:52` | Rate-limit DB failure | Returns 503 with `Retry-After` | ✅ |
| `authorization.ts:61` | Auth middleware | Logs safe fields; returns 403 | ✅ |
| `index.ts:38` (auth) | Better Auth | Logs `name`; returns 503 | ✅ |
| `index.ts:68` (health) | DB health check | Logs `name`; returns 503 | ✅ |

**Verdict: No empty catch blocks without purpose. No swallowed errors. Every catch answers: what error, should it retry, should it convert, should it log, what safe response, and can state be partial.**

---

## 5. Transaction Boundary Audit

### 5.1 `withTransitionRetry` — Serializable Retry

Used by: `payment.service`, `reservation.service`, `shipping.service`, `reconciliation.service`, `finance.service`, `return.service`.

- Retries deadlocks (`40P01`) and serialization failures (`40001`) up to 3 attempts
- Maps PostgreSQL integrity violations (`23xxx`) to `DomainError(409)`
- After 3 failures → `DomainError("RETRYABLE_TRANSACTION", 503)`
- Non-retryable errors propagate immediately

**Verdict: CORRECT.** No infinite retry loops. No silent abandonment.

### 5.2 `checkoutCart` — Inline Retry

`order.service.ts:72-122` implements its own 3-attempt retry for `40P01`/`40001`, consistent with `withTransitionRetry` behavior.

**Verdict: CORRECT.** Same retry policy, inline for architectural reasons (cart ownership lock order).

### 5.3 Atomicity — No Partial Commits

All inventory/payment/order state changes happen inside single transactions:
- `createPaymentSession`: provider call inside transaction with pre/post deadline checks
- `recordVerifiedPayment`: order + payment + inventory in one transaction
- `expireUnpaidOrderInTransaction`: order + payment + inventory in one transaction
- `cancelUnpaidOrderInTransaction`: order + payment + inventory + audit in one transaction
- `checkoutCart`: reservation + order + items + payment + cart clear in one transaction
- `createSettlement`: settlement + audit in one transaction
- `requestPayout`: eligibility revalidation + allocation + payout in one transaction
- `authorizeRefund`: order lock + payment lock + refund insert + audit in one transaction

**Verdict: CORRECT.** No partial commits found in any state-changing path.

### 5.4 Provider Calls and Transaction Boundaries

| Service | Provider Call | Transaction Boundary | Correct? |
|---|---|---|---|
| `createPaymentSession` | Cashfree `createOrder` | **Inside** transaction (order locked first) | ✅ Design choice |
| `submitRefund` | Cashfree `createRefund`/`getRefund` | **Outside** transaction | ✅ |
| `createForwardShipment` | Shiprocket `createShipment` | **Outside** transaction (after reservation) | ✅ |
| `assignShipmentAwb` | Shiprocket `assignAwb` | **Outside** transaction (via `runShippingMutation`) | ✅ |
| `requestShipmentPickup` | Shiprocket `requestPickup` | **Outside** transaction (via `runShippingMutation`) | ✅ |
| `sendInvitationEmail` | Resend `POST /emails` | **Outside** transaction | ✅ |

---

## 6. Webhook Handler Audit

### 6.1 Cashfree Payment Webhook (`POST /webhooks/payments/cashfree`)

1. **Signature verification:** HMAC-SHA256 with constant-time comparison, timestamp freshness (24h/5min)
2. **Body parsing:** `readBoundedBody` limits to 64KB before JSON decode
3. **Payload validation:** `parseCashfreeWebhook` validates type, order fields, payment fields
4. **Idempotency:** `cashfreeWebhookEvents` table with `onConflictDoNothing`
5. **Amount/currency validation:** Cross-checked against persisted payment record
6. **State transition:** Only `PAYMENT_SUCCESS_WEBHOOK` with `SUCCESS` triggers `recordVerifiedPayment`

**Verdict: ROBUST.**

### 6.2 Shiprocket Shipping Webhook (`POST /webhooks/shipping/events`)

1. **Token verification:** Constant-time comparison of `x-api-key` header
2. **Content-Type check:** Rejects non-JSON before parsing
3. **Body parsing:** `readBoundedBody` limits to 64KB
4. **Event deduplication:** SHA-256 event keys with `onConflictDoNothing`
5. **Unmatched AWB:** Retained as bounded `shippingOperations` records

**Verdict: ROBUST.**

---

## 7. Background Job / Scheduler Audit

### 7.1 Scheduled Handler (`index.ts`)

- Per-batch isolation: one failure does not skip the other
- Errors are collected, logged, and never swallowed
- Database connection is closed in `waitUntil`, not abandoned

### 7.2 `runUnpaidExpiryBatch`

- `SELECT ... FOR UPDATE SKIP LOCKED`
- Per-order `try/catch` with `safeFailure` logging
- Nested catch for logging failures
- Results tracked: `{ processed, expired, skipped, failed }`

### 7.3 `runShippingReconciliationBatch`

- `SELECT ... FOR UPDATE SKIP LOCKED`
- 5-attempt retry limit → escalation to `REVIEW`
- Per-operation `try/catch`
- Secondary `.catch(() => undefined)` on diagnostic write — justified

### 7.4 `runReconciliationBatch`

- `SELECT ... FOR UPDATE SKIP LOCKED`
- 5-attempt retry limit → escalation to `REVIEW`
- Per-item `try/catch` with error message truncation (500 chars)
- Conditional updates prevent lost-update races

**Verdict for all: CORRECT.** Bounded retries, fault-isolated, observable.

---

## 8. Provider Adapter Audit

All provider adapters (Cashfree payment, Cashfree refund, Shiprocket, Resend):
- Use bounded timeouts (15 seconds or fetch defaults)
- Never expose raw provider errors to clients
- Never include credentials in error messages
- Invalid responses are classified as 502 or result objects

---

## 9. Authentication and Authorization Audit

- Better Auth session errors → 503 (not leaked)
- Custom auth middleware → 403 with safe logging only
- Mutation origin validation → 403 on untrusted origin
- Rate limiting → 429/503; **fails closed** on DB error

---

## 10. Findings Summary

### Zero Critical Issues

- **Zero empty catch blocks** that silently swallow errors
- **Zero raw database/provider errors** exposed to clients
- **Zero inconsistent error response formats**
- **Zero `console.log` calls** in production code
- **Zero credentials/tokens/secrets** in any log statement
- **Zero unbounded request body parsing** paths
- **Zero partial-commit risk** in state-changing transactions

### Observations (Not Defects)

| # | Observation | Severity |
|---|---|---|
| O-1 | `createPaymentSession` holds row lock during 15s provider timeout | Informational |
| O-2 | Two `.catch(() => undefined)` in reconciliation batch handlers | Informational |
| O-3 | `attemptAutomatedResolution` catches all errors (not just DomainError) | Informational |
| O-4 | `checkoutCart` duplicates the `withTransitionRetry` pattern inline | Informational |
| O-5 | Provider adapter errors use `Error` not `DomainError` (by design) | Informational |

---

## 11. Error Category Reference

| Category | HTTP Status | Example |
|---|---|---|
| Validation | 422 | `"Invalid return quantity"` |
| Authentication | 401 / 403 | Webhook signature failure |
| Authorization | 403 | `"Forbidden"` |
| Not Found | 404 | `"Order unavailable"` |
| Conflict | 409 | `"PAYMENT_SESSION_INELIGIBLE"` |
| Business Rule | 409 / 422 | `"Return window has closed"` |
| Rate Limit | 429 | `"Too many requests"` |
| Payload Too Large | 413 | `"Payload too large"` |
| Content Type | 415 | `"Content-Type must be application/json"` |
| Provider Failure | 502 | `"Payment provider rejected the order"` |
| Transient | 503 | `"RETRYABLE_TRANSACTION"` |

---

## 12. Catch-Block Requirements

Every catch block must answer:
- What error is this?
- Should it be retried?
- Should it be converted to a domain error?
- Should it be logged?
- What safe response reaches the client?
- Can the operation have partially changed state?

---

## 13. Rules

1. Never silently swallow errors.
2. Never use empty catch blocks without a defined purpose.
3. Never expose database/provider/internal errors directly to clients.
4. Preserve the original error for server-side diagnostics.
5. Known domain errors must map to intentional HTTP responses.
6. PostgreSQL transient errors must follow the existing retry policy.
7. Do not retry non-idempotent provider operations blindly.
8. Provider unknown outcomes must remain reconcilable.
9. Transactions must remain atomic.
10. Inventory/finance/payment state changes must not partially commit.
11. Logs must never contain passwords, tokens, API secrets, payment secrets,
    database URLs, cookies, or authorization headers.
12. New services must follow the existing error-handling pattern.
13. New routes must not invent a second error-response format.
14. Background jobs/schedulers must record failures without silently
    abandoning required state transitions.
15. Tests must cover important expected failure paths.