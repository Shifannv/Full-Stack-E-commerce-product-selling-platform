# Settlement and payout foundation verification

Date: 2026-09-30

Status: **VERIFIED INTERNALLY** for settlement eligibility, return/finance serialization, exact payout allocation, ownership validation and refund interaction. This is not production rollout or live-provider clearance.

## Eligibility and persisted evidence

`requireSettlementEligible` is the shared transaction rule used by settlement creation and payout allocation. It requires a DELIVERED order with `delivered_at`, CONSUMED stock, PAID order and payment, payment resolution NONE, and PostgreSQL time strictly later than `delivered_at + 5 days`.

Return creation retains the inclusive fifth-day endpoint. Both services evaluate the deadline in PostgreSQL after acquiring the order lock, retaining timestamp precision. Dress/return_enabled, historical purchase amount, approved QC and customer-paid return courier rules remain unchanged.

An active return or unresolved refund blocks its own order item. A rejected/QC-rejected return must have no refund obligation. A refunded return must have one SUCCESS refund associated with the correct payment/order/currency. V1 single-item return attribution is checked; ambiguous historical multi-item refunds require review rather than charging each item the full refund. Order-level refund obligations block settlement of that payment. Unrelated items, including another item in the same order, remain independently eligible.

Premature settlement creation is rejected without creating an AVAILABLE record. Persisted order delivery timestamps, historical order-item prices and ownership, returns, inspections and refunds provide eligibility evidence. Existing HELD is used to quarantine ineligible historical settlements encountered at payout and to release rejected payout allocations for revalidation. Subsequent payout requests recheck HELD rows. Missing Refund Adjustment or corrupt relationships remain held; amounts are not silently rewritten.

## Transaction protocol

Settlement creation locks order -> payment -> order item -> associated returns (ID order) -> refunds (ID order), retaining locks through insertion.

Payout freezes candidate settlement IDs ordered by order/item/settlement ID, then acquires all candidate order locks in ascending order ID order. For each candidate it validates historical item scope, acquires payment/item/return/refund dependency locks, then locks the settlement. It checks that the locked row still has the validated ownership and amounts, checks existing allocations, and retains locks until commit. Concurrent requests read current state after waiting and cannot allocate the same sale twice.

Return creation holds the order lock across policy checks, duplicate lookup and insertion. A return accepted first blocks settlement; a settlement accepted first proves the deadline closed, and a waiting return rechecks after acquiring its lock. QC only locks its return and never acquires an order afterward. Refund authorization already uses order -> payment -> return. Refund-result persistence now uses order -> payment -> return -> refund, with bounded transaction retries and SUCCESS finality. Provider calls stay outside these locks and are not repeated by transaction retries. A delayed PROCESSING result cannot reopen an obligation already used by finance. This does not verify live refund submission.

## Exact allocation, arithmetic and ownership

Payout totals, links and state updates use exactly the selected, locked, revalidated IDs. Updates are constrained by IDs, Admin ownership and eligible status; the returned row count must match. A settlement committed after selection remains AVAILABLE and unallocated. Invalid candidates become HELD without preventing allocation of unrelated eligible sales. With no positive balance, no payout is inserted; quarantine changes can still commit.

The formula is unchanged:

Gross Product Sales - Commission - Payment Gateway Fee - Refund Adjustment = Admin Net Payable.

Recorded successful refunds establish the minimum Refund Adjustment; payout does not subtract them again. Existing explicitly supplied adjustments retain their previous semantics. Customer-paid return courier is not deducted. Payout rechecks stored arithmetic and historical gross. Full refunds/fees that would produce negative net remain rejected by the existing formula; no new fee policy is introduced.

Sale ownership uses the checkout snapshot in `order_items.admin_id`, derived from `products.created_by_admin_id`. Management-only `product_admins` never supplies finance ownership.

## Constraints and migration decision

No schema change or migration was required. Existing unique settlement-per-order-item and allocation-per-settlement constraints prevent duplicate effects. Return-item composite foreign keys and refund/payment/order foreign keys support association validation. Finance scope and arithmetic are revalidated transactionally before allocation. This is an application-write guarantee, not a claim that arbitrary privileged SQL cannot insert inconsistent data.

Historical AVAILABLE/HELD rows are defensively rechecked. Existing PAYOUT_PENDING/PAID records from older code need production preflight and operator review; this task did not inspect, repair or approve shared data. Migrations 0009-0011 still require their separate historical review before promotion.

## Verification

- PostgreSQL commerce suite: **119 passed, 0 failed, 0 skipped** (93 existing + 26 finance cases).
- Backend regression suite: **67 passed, 0 failed, 0 skipped**.
- TypeScript: PASS.
- Drizzle migration metadata validation: PASS.
- `git diff --check`: PASS (existing line-ending warnings only).

The PostgreSQL suite validates the exact local target `postgres@127.0.0.1:5432/ownline_checkout_test` from CHECKOUT_TEST_DATABASE_URL and refuses a match with DATABASE_URL. Race tests use independent connections, transaction latches, observed database lock waits and an advisory-lock trigger around payout insertion. They use no sleeps and call production services. An injected error after allocation insertion proves rollback removes payout and links. Refund adapters use in-memory responses; no provider network call occurs.

Coverage includes delivery/timestamp/window gates; active returns; refund-required/expired/cancelled/released-stock rejection; both return-versus-settlement orderings; QC/refund authorization races; both refund-result/payout orderings; stale result finality; concurrent payouts; exact selection despite a concurrent insert; payout totals; allocation uniqueness; historical prices; one-time Refund Adjustment; insufficient-adjustment quarantine; rollback; item-scoped holds within one order; wrong-owner quarantine; management-only Admin exclusion; zero balance and rejected-payout revalidation.

Assertions cover AVAILABLE eligibility through the canonical rule, exact allocation links, payout sums, no duplicate allocation, no unallocated PAYOUT_PENDING row, historical Admin/item/order scope, refund adjustment persistence, nonnegative inventory, reservation consistency and existing lifecycle invariants.

## Boundaries and remaining work

Aiven/shared data untouched. No migration applied. No deployment. No frontend, checkout implementation, shipping implementation or provider adapter changes. No Cashfree or Shiprocket calls.

Remaining production blockers include historical data/migration preflight, persistent Commission/Payment Gateway Fee configuration, audited operator recovery for held legacy records, broader security/administrative concurrency work, and live payment/refund/shipping verification from the final audit. External refund response identity validation and provider unknown-outcome recovery remain outside this internal finance milestone.
