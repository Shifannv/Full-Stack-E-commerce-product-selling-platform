# Internal refund/reconciliation verification

Verified against `ownline_checkout_test` as `postgres`, using only `CHECKOUT_TEST_DATABASE_URL` from the test configuration. No Aiven/shared database changes, deployment, or external provider calls were performed.

## Internal V1 meaning

Late received money remains `PAID` while the order stays `EXPIRED` or `CANCELLED` and its stock stays `RELEASED`. `REFUND_REQUIRED` is an enumerable obligation on the payment.

`markRefundResolved` now atomically creates one `refunds` record for the full payment amount with reason `LATE_PAYMENT`, status `INTERNAL_RECORDED`, no return ID, and no provider reference before changing payment resolution to `RESOLVED`. This means the obligation has been durably recorded internally. It does **not** mean the customer received a provider refund. Repeated resolution returns the existing result and requires a matching record. Neither resolution nor replay moves stock or enables fulfillment/settlement.

The existing physical-return path remains separate: customer request under the five-day Dress/return-enabled policy, seller approval, receipt, approved QC, then `PENDING_PROVIDER` authorization. Amounts use historical purchase totals and returned quantity; there are no configured V1 deductions and no second charge for customer-paid return courier. No `SUCCESS` or `REFUNDED` status is manufactured by internal reconciliation.

Refund authorization locks order, payment, and return before checking for an existing refund. Settlement creation uses the shared eligibility guard and cannot omit an already recorded non-failed refund from its adjustment. Commission and fee formulas are unchanged. Finance reads expose recorded refund obligations and their order-item associations.

## Schema

Migration `0011_redundant_sebastian_shaw.sql` and its Drizzle snapshot add payment/order and return/order association constraints, one late-payment record per payment, and checks separating physical returns from internal late-payment records. `refunds.return_id` becomes nullable for late payments only. No tables, columns, or business data are deleted. Referenced unique constraints are created before the composite foreign keys. Migration 0011 was applied only to the isolated test database.

## Results

All 77 PostgreSQL tests passed (53 checkout/lifecycle cases, 17 refund cases, and 7 return/QC concurrency cases), with zero failures/skips. All 67 backend regression tests passed. TypeScript, Drizzle validation, and diff checks passed.

| New PostgreSQL case | Result |
| --- | --- |
| Late expired payment requires refund | PASS |
| Late payment cannot confirm order | PASS |
| Late payment cannot consume released stock | PASS |
| Shipment entry point rejects late payment | PASS |
| Settlement rejects late payment before/after resolution | PASS |
| Duplicate late payment preserves one obligation | PASS |
| Resolution records full internal obligation | PASS |
| Duplicate resolution preserves record/timestamp | PASS |
| Historical purchase price survives catalog change | PASS |
| Return courier not deducted twice | PASS |
| Return/order/payment/finance associations and settlement adjustment | PASS |
| Repeated refund authorization produces one record | PASS |
| Resolution/replay never restores released stock | PASS |
| Transaction rollback removes record and resolution together | PASS |
| Independent concurrent resolution requests | PASS |
| Unresolved obligations enumerable; resolved record auditable | PASS |
| Delivered return receipt/QC gate and independent concurrent authorization | PASS |

Active fixture assertions cover unchanged historical price, stock disposition, duplicate effects, fulfillment/settlement rejection, and resolution atomicity. The final direct SQL audit reports zero negative inventory, reservation mismatches, duplicate checkout keys/payments/refund effects, terminal orders with consumed stock, or unsupported resolution records. Fixtures are removed after each test; the final test database is empty.

## Remaining boundaries

- Internal recording does not execute or verify an external refund. Provider credentials, calls, completion, and concurrent provider-result handling remain outside this verification.
- Refunds recorded after a settlement/payout already exists require operational reconciliation. This change exposes obligations and guards new settlements; it does not rewrite previously settled or paid balances.
- Seller decisions, receipt, and QC now lock the return row before validating and updating its state. Duplicate decisions return the original result without changing timestamps or notes; conflicting decisions return 409. Refund authorization locks order, payment, and return in the same transaction and uses the existing unique refund constraint. The independent-connection PostgreSQL races cover approval/rejection, duplicate approvals and rejections, conflicting and duplicate QC, QC/authorization overlap, and duplicate authorization. An outer transaction rollback restores the requested state. There is no customer return-cancellation endpoint to race against approval.
- The return/QC concurrency verification passed all 77 PostgreSQL cases, all 67 backend regression cases, TypeScript, Drizzle validation, and `git diff --check`. No new migration is required for these locking changes. The isolated checkout test database was the only database used; Aiven/shared database and deployment remain untouched.
- Shared-database migration rollout and deployment remain pending explicit authorization.
