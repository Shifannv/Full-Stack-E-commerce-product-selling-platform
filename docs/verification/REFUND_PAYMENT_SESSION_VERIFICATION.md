# Refund result and payment session verification

Date: 2026-09-30

Status: **VERIFIED INTERNALLY** for refund result finality and payment session eligibility. Cashfree live behavior remains unverified.

## Refund result finality

Current refund states used by the return flow are `PENDING_PROVIDER`, `PROCESSING`, `SUCCESS` and `FAILED`. `SUCCESS` and `FAILED` are terminal. A delayed `PROCESSING` result cannot overwrite either. A delayed `SUCCESS` after local `FAILED` raises a manual-review conflict; this code does not silently reverse a terminal failure. Duplicate `SUCCESS` returns the original record without another provider call or timestamp change. Repeated `PROCESSING` with the same provider reference is idempotent.

The Cashfree adapter parses refund ID, order ID, amount, currency, provider payment ID, status and provider refund reference. The service compares these with the authorized local refund, return, payment and provider order. A conflicting provider refund reference is rejected. A terminal response lacking a provider refund reference cannot finalize the refund. The provider's documented create and get responses expose these fields; the precise live account behavior still needs sandbox verification.

Provider I/O occurs outside the database transaction. After receiving a result, the service locks order -> payment -> return -> refund, rechecks associations and terminal state, then changes refund and return together. A database rollback leaves both unchanged. Duplicate requests use the merchant refund ID as the Cashfree idempotency key.

Timeouts, network failures, lost or malformed responses, and unattributable results retain `PROCESSING` with the authorized merchant refund ID and provider order ID. They are **unknown**, not `FAILED`. The next submission performs GET by those references. The existing schema provides the pending state and references; no new event table or migration was necessary. The raw untrusted response is not persisted as authoritative evidence.

## Payment session eligibility and provider boundary

The session service locks the owning order, then its Cashfree payment. It requires `CREATED`, `RESERVED`, pending order and payment status, resolution `NONE`, no expired/cancelled timestamps, matching order/payment amount and currency, the deterministic provider order ID, and a non-null deadline strictly later than PostgreSQL `clock_timestamp()`. At the exact deadline, creation fails. Invalid orders make no provider call.

The service keeps the order/payment lock through session creation and the conditional payment update, preventing expiry, cancellation and verified payment from changing eligibility before the provider call. Cashfree calls have a 15-second abort signal to bound this lock. It checks the provider order ID and verifies that exactly one payment row was updated. If the deadline passes during the provider call, it commits the deterministic provider reference but does not return the session. Checkout already persists `payments.provider_order_id = orders.id`; this makes a lost response or local update failure traceable by stable order ID. No full provider lookup/retry workflow was introduced.

## Verification and invariants

- PostgreSQL commerce suite: **152 passed, 0 failed, 0 skipped** (119 prior + 33 new refund/payment cases).
- Backend regression suite: **67 passed, 0 failed, 0 skipped**.
- TypeScript: PASS.
- Drizzle migration validation: PASS.
- `git diff --check`: PASS, with preexisting line-ending warnings.

PostgreSQL cases cover success/failed terminal results, duplicate and concurrent success, delayed processing, failed-versus-success review, processing idempotency, identity/order/amount/currency/payment mismatches, conflicting provider reference, unknown and timeout recovery via GET, rollback, and absence of refund-row locks during provider I/O. Payment cases cover the valid window; expired, cancelled, released, consumed, paid, failed and refund-required states; elapsed and exact deadlines; ownership; wrong references/amount/currency; expiry and cancellation races on independent connections; provider order mismatch; and zero-row conditional update. The existing lifecycle suite also asserts no stock or order resurrection, nonnegative stock, fulfillment/settlement blocks for released and refund-required orders, and refund/return association constraints.

The isolated PostgreSQL suite requires CHECKOUT_TEST_DATABASE_URL to target `postgres@127.0.0.1:5432/ownline_checkout_test`, rejects a match with DATABASE_URL, and reports zero skipped tests. Provider adapters use in-memory test responses; no Cashfree network call was made.

No migration was required or applied. Aiven/shared database untouched. No deployment. Checkout reservation, finance formulas, payout allocation, Shiprocket and frontend were not changed.

Remaining release blockers include sandbox verification of the exact Cashfree response contract and API version, operator reconciliation of persistent unknown outcomes, historical migration/data review, and the security/operability items from the final backend audit.
