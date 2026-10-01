# Shipping operation control and recovery verification — 2026-09-30

## Result

Internal shipping operation control and reconciliation recovery are **VERIFIED INTERNALLY**. No live Shiprocket request or deployment was made. The existing shipment state machine and order/payment/refund/finance rules were preserved.

## External operation boundary

- Shipment creation reserves shipment and shipment-item rows plus a deterministic `CREATE` operation in one transaction before calling the provider. The shipment UUID is the external order reference. A duplicate order shipment is rejected by the locked item reservation.
- AWB and pickup requests insert a unique operation row (`shipment UUID:AWB` or `shipment UUID:PICKUP`) under order/payment/shipment locks, commit, then call the provider without PostgreSQL row locks held.
- A concurrent duplicate observes the durable operation and does not call the provider a second time. Existing successful shipment state is returned idempotently.
- AWB and pickup both use the persisted provider shipment reference. Cancellation is not currently exposed as a provider mutation. Tracking and serviceability are read operations; no tracking lookup is part of the reconciliation batch.
- Shiprocket explicit pickup rejection is recorded as `FAILED`. Transport failures and other unproven outcomes are `UNKNOWN`. Neither state permits automatic provider mutation replay.

## Recovery and operator visibility

The `shipping_operations` row retains the operation key, shipment link, provider key/reference, kind, state, actor/trigger, bounded evidence, retry count, last error, last-attempt timestamp, next retry timestamp, and resolution timestamp. Provider success evidence is committed before local shipment state is applied. If local persistence fails, the scheduled batch can apply the retained evidence without another provider mutation. If persisting the provider evidence itself fails, the original claim remains and is never replayed; an operator must verify provider-side evidence and record it.

The Worker scheduler processes at most 25 due operations by default (hard maximum 100), ordered by `next_retry_at` then ID, claiming rows with `FOR UPDATE SKIP LOCKED`. It applies only retained evidence or an unmatched event whose AWB is now locally matched. Each item is isolated so one failure does not stop the batch. At most five automated reconciliation attempts are made; unresolved records move to `REVIEW` with no next retry and remain visible in the Super Admin operations endpoint. Operator retry reopens a local reconciliation attempt, not a provider mutation. Evidence entry checks the exact provider reference and operation kind and is audited.

Unmatched webhook events are stored in the same operations table with a deterministic deduplication key, normalized event fields, timestamp, and AWB reference. Payload fields are bounded; credentials and arbitrary raw webhook bodies are not stored. Once the AWB is matched, reconciliation routes the retained event through normal event deduplication and state application.

Event reconciliation applies only recognized normalized statuses. Events are ordered by provider event time and stable tie-breakers. Older events cannot regress newer progress, terminal states do not regress, delivery duplicates are idempotent, and the existing `DELIVERY_FAILED` recovery to later in-transit/out-for-delivery progress is preserved. Order delivery and `delivered_at` are repaired from shipment evidence under the established order-before-shipment lock sequence.

`tracking_url` remains nullable. The adapter does not fabricate a URL; provider/live verification is needed before storing one.

## Migration review

Migration `0014_shipping_operations.sql` adds the isolated operational record, state/kind/retry checks, indexes, and optional shipment foreign key. Its backfill marks shipments with complete existing provider references as `SUCCEEDED`; incomplete legacy outcomes become `REVIEW` with `LEGACY_OUTCOME_UNVERIFIED`. It does not infer a failure or authorize replay. No table/column drops or changes to existing shipment constraints are included. It was applied only to the local `CHECKOUT_TEST_DATABASE_URL` target (`postgres@127.0.0.1:5432/ownline_checkout_test`), whose configuration rejects a matching `DATABASE_URL`. **Aiven/shared `DATABASE_URL` was not touched.**

## Verification

- Guarded test database migration: PASS.
- PostgreSQL suite: **240 passed, 0 failed, 0 skipped**.
- Scheduler cases: **15/15 passed** in the PostgreSQL suite.
- Shipping coverage includes concurrent independent AWB/pickup owners; provider call outside held PostgreSQL locks; timeout and definitive rejection classification; success followed by local persistence failure; retained-claim/evidence-write failure; same-reference recovery; stale terminal events; terminal duplicates; `DELIVERY_FAILED` recovery; unmatched AWB durability and deduplication; bounded batch continuation and `SKIP LOCKED`; retry limit/operator review; reconciliation idempotency; rollback; eligibility; historical address snapshots; no duplicate shipment creation; and concurrent delivery milestones.
- Backend regression: **67 passed, 0 failed, 0 skipped**.
- TypeScript: PASS. Drizzle validation: PASS. `git diff --check`: PASS.
- Live Shiprocket calls: **NO**. Deployment: **NO**.

## Remaining production blockers

The internal tests use provider mocks. Production operation still needs Shiprocket credential/account and webhook behavior verification. Provider-side records must be reviewed for ambiguous outcomes where neither persisted response evidence nor matched local tracking events exist; the safe automatic path never repeats AWB/pickup/create mutations. Tracking URL behavior remains unverified and nullable. This checkpoint does not claim live shipping readiness.
