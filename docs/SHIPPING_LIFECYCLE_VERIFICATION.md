# Internal shipping lifecycle verification

Verified on the isolated `CHECKOUT_TEST_DATABASE_URL` PostgreSQL database. Tests use mocked shipping providers and stored events. No live Shiprocket request, Aiven/shared database change, migration, frontend change, or deployment was performed.

## State and evidence

The existing shipment statuses remain authoritative. Local creation records `CREATED` before the provider call; a confirmed provider response records the provider references and moves it to `CONFIRMED`. AWB assignment can move `CREATED` or `CONFIRMED` to `PACKED`. Webhook events advance `SHIPPED`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, and `DELIVERY_FAILED`; a later recovery event can resume from `DELIVERY_FAILED`. `DELIVERED`, `RTO`, and `CANCELLED` are terminal for state progression. A stale or conflicting event stays in `shipment_events` for audit but does not move a terminal shipment backward. The existing unique `(shipment_id, event_key)` constraint makes replays harmless.

Webhook delivery locks the order row, then the shipment row. The event, shipment status and milestone, and final order `DELIVERED`/`delivered_at` update share one transaction. Final order delivery requires every order item to have a delivered shipment and the shared fulfillment eligibility guard. Replays keep the original timestamps. Shipment creation rechecks order and payment eligibility under the order lock before reserving items; the existing unique order-item shipment constraint stops concurrent duplicate reservations before a second provider call.

The internal reconciliation service lists reserved shipments with unknown provider outcomes, locally stale confirmed references, missing delivery milestones, AWB pending, and conflicting terminal events. `reconcileShipment` repairs state only from stored references and shipment events. `recordKnownProviderShipment` can persist a known response after a local save failure using the deterministic internal shipment ID passed to the provider as its external order ID. It validates the ID and rejects conflicting references. Neither path calls Shiprocket or fabricates an event.

The historical `orders.shipping_address_snapshot` supplies the provider destination and stored shipment destination. The current adapter does not return a tracking URL; `tracking_url` remains nullable.

## Results

All 93 PostgreSQL checkout/lifecycle/refund/return/shipping tests passed, with no failures or skips. All 67 backend regression tests passed. TypeScript, Drizzle validation, and `git diff --check` passed. The new PostgreSQL cases cover creation and address snapshots; eligibility failures; concurrent duplicate creation; concurrent and repeated delivery; stale events; failed-delivery recovery and terminal RTO; rollback; known-event reconciliation; provider timeout and definitive rejection; local persistence failure with known-response repair; and webhook delivery before the create response is saved. Stock invariants are checked in the relevant fixture paths.

## Operational boundaries

- A provider timeout or failed local save with no retained provider response remains `CREATED` and appears as `PROVIDER_OUTCOME_UNKNOWN`. The deterministic external order ID supports operator/provider lookup. The service does not retry creation automatically because that could create a second real shipment.
- The adapter currently exposes provider errors as ordinary exceptions, so an HTTP rejection and an uncertain timeout both retain the reservation for review. Automatic classification and release of definitively failed provider attempts need a separate provider contract and an audited retry policy.
- Tracking URL population depends on a genuine provider value. No URL is synthesized.
- Reconciliation is an internal service path; there is no scheduled provider polling or public repair endpoint in this change.
