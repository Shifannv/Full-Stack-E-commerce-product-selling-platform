# Authenticated customer mutations — local verification

**Date:** 2026-10-05  
**Result:** PASS  
**Environment:** `postgres@127.0.0.1:5432/ownline_checkout_test` through the real local Hono app/API, exported Next.js frontend and Better Auth credential sessions. No mock API responses were used.

## Results

| Workflow | API | Request | Authorization and preconditions | Database result | Frontend result | Replay / cross-customer | Status |
|---|---|---|---|---|---|---|---|
| Order cancellation | `POST /api/orders/:orderId/cancel` | Path owned order UUID; `{}` | Anonymous 401; owner CUSTOMER; `CREATED`/`PENDING`/`RESERVED`; live payment deadline | `CREATED → CANCELLED`; stock `RESERVED → RELEASED`; payment/order payment stayed `PENDING`; `cancelled_at` set; available 2→3, reserved 4→3, inventory version 0→1; one `ORDER_CANCELLED` audit | `CANCELLED` shown, cancellation controls removed, persisted after reload | Replay 200 with `replayed:true`, no second stock/audit change; concurrent pair 200/200 with one real transition; other customer 404 and no state change | PASS |
| Review submission | `POST /api/reviews` | `{orderItemId,rating:4,title,body}` | Anonymous 401; owner CUSTOMER; delivered purchased item | One review created with `PENDING`, rating 4 and authenticated customer ID; not exposed by public published-review read | `Review pending` shown, write button removed, persisted after reload | Duplicate 409 and original row unchanged; other customer 404; paid-undelivered, unpaid-undelivered and invalid rating rejected with no rows | PASS |
| Return request | `POST /api/returns`; resulting state also read by `GET /api/orders/:orderId` and `GET /api/returns/:returnId` | `{orderItemId,quantity:2,reason,customerNotes}` | Anonymous 401; owner CUSTOMER; delivered Dress item; `returnEnabled`; configured five-day window | One `REQUESTED` return and one return item quantity 2 created for the authenticated customer | Return reference shown, request action removed, already-requested state persisted after reload, `/returns` rendered status | Replay 409 with one row retained; concurrent pair 201/409 with one return; other customer create/read 404 | PASS |

Before each UI action, `/orders` showed the available cancellation, review or return control for the eligible order item. After the response, the corresponding terminal state appeared in the same browser session and persisted on a fresh `/orders` load. The return-status view also loaded the created return and displayed “Refund not initiated yet.”

## Eligibility and boundary evidence

The successful browser run used test prefix `mut-e2e-e50e8a82` and submitted requests through the frontend at `http://127.0.0.1:3000` to the local API at `http://127.0.0.1:8790` with credentialed Better Auth sessions:

- Cancellation: `POST /api/orders/3751ed0f-66d5-40bf-8168-f920e7591736/cancel` with `{}` returned HTTP 200 `{"status":"CANCELLED","paymentStatus":"PENDING","stockState":"RELEASED","cancelledAt":"2026-10-05T05:43:22.078Z","replayed":false}`. Repeating it returned HTTP 200 with the same timestamp and `"replayed":true`. The database went from `CREATED/PENDING/RESERVED` with `cancelled_at=null` to `CANCELLED/PENDING/RELEASED` with that timestamp. Inventory changed once (available 2→3, reserved 4→3, version 0→1); audit count was one before and after replay.
- Review: `POST /api/reviews` with `{"orderItemId":"9978d13a-f3de-484c-b036-5b9081bfd47e","rating":4,"title":"Mutation E2E review","body":"Verified locally through the real API."}` returned HTTP 201 with review ID `3182648d-bd97-4690-9e20-d4b070d1245a`, customer `mut-e2e-e50e8a82-customer` and `status:PENDING`. There was no review row before and exactly one matching `PENDING` row after. A second submission returned HTTP 409 `{"error":"This order item already has a review"}` without changing it.
- Return: `POST /api/returns` with `{"orderItemId":"2fdf1b74-8cfd-453d-969b-62a0f0a7830d","quantity":2,"reason":"Mutation E2E: does not fit","customerNotes":"local only"}` returned HTTP 201 `{"id":"d8ca4713-61af-42f3-bd39-777e9ee68e70","status":"REQUESTED"}`. There was no return row before; afterward there was one `REQUESTED` return for the owner and one item row of quantity 2. Order detail showed remaining returnable quantity 3 before and 0 after under the existing one-return-per-item rule. Replay returned HTTP 409 `{"error":"Order item already has a return"}` with one return row retained.

- Cancellation rejected an elapsed payment window (409), paid order (409) and invalid UUID (422).
- Return enforcement rejected delivery six days earlier, one minute beyond the five-day deadline, a non-return-enabled product, excess quantity, an undelivered order and invalid quantity. A delivery timestamp five minutes inside the five-day boundary succeeded.
- The existing backend rule allows one return record per order item; after a quantity-2 request against quantity 3, the order projection reports the item as no longer eligible rather than offering a second request.
- All three mutations denied unauthenticated requests with 401 and concealed another customer's resources with 404.

## Verification commands

- `npx tsx scripts/verify-customer-mutations-local.ts` — PASS; real build/browser/API/DB evidence and automatic cleanup.
- `npm run typecheck` (frontend) — PASS.
- `npm run lint` (frontend) — PASS.
- `npm run build` (inside the E2E harness) — PASS; 25 static pages generated for the temporary catalog.
- `npm run typecheck` (backend) — PASS.
- `npm test` (backend) — 84/84 PASS.
- `npm run test:checkout:pg` — 287/287 PASS against `ownline_checkout_test`.
- `git diff --check` — PASS.

## Cleanup and safety

The successful run used the prefix `mut-e2e-e50e8a82`. Its cleanup reported zero temporary users, orders, products, subcategories, shipping-provider configs, reviews/returns and audit rows. A final broad `--sweep=mut-e2e-` check also returned zero in every category.

The harness created three temporary credential users (one seller Admin and two Customers), two products with variants and inventory, ten orders with payment and item snapshots, delivery/shipment records for the delivered fixtures, one review, return records for the request/concurrency/deadline checks, and cancellation audit rows. It also created a scoped subcategory and provider config and created the `dress` category only if one was absent. All test-owned records were deleted. No application source, test source or migration was changed during this gate; this verification updated only this report, `CURRENT_STATUS.md`, and the two API gap audit artifacts. No tests were added or updated during this gate; the existing harness and regression suites were run.

No Aiven database mutation, production data change, Cashfree call, Shiprocket call, production R2 modification, deployment, secret change or migration occurred.

## Remaining limits

No targeted customer mutation remains mocked or unverified after this gate. The older source audit still marks some customer **reads** as mocked and lists a return-status response-shape mismatch and order/product projection data gaps; those entries were outside this mutation gate and retain their own status. Checkout creation and payment session are parked behind the payment/provider gate. Downstream operator return decision, receipt, QC, refund authorization/submission, review moderation, shipment-provider mutations, production OAuth/host behavior, invitation delivery, cron deployment and production media/catalog readiness were not exercised here.
