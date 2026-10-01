# Data Flow

## Request path
1. Browser calls `lib/api` -> `fetch(new URL(path, NEXT_PUBLIC_API_URL), { credentials: "include" })`.
2. Worker `/api/*`: CORS (exact `FRONTEND_ORIGIN`) -> `mutationOrigin` (rejects cross-origin mutations).
3. Router (mount order in `routes/index.ts`) -> `requireAuth` builds the `actor` (roles, permissions, adminApproved) -> handler authorizes.
4. Handler calls a service (short-lived Drizzle connection via Hyperdrive, closed in `finally`).
5. Errors: `DomainError` -> `{ error }` with its status; anything else -> generic unavailable message; only safe diagnostics are logged.

## Money / order flow (owned by services)
checkout (reserve inventory, snapshot prices) -> payment session (Cashfree) -> Cashfree webhook (`/webhooks/payments/cashfree`, signature-checked, idempotent) -> paid -> shipment (`/api/admin/orders/:orderId/shipments`, AWB, pickup via Shiprocket) -> Shiprocket webhook (`/webhooks/shipping/events`, token-checked) -> delivered -> returns/QC -> refund authorize/submit -> finance settlement/payouts.

## Scheduled work (every minute)
`scheduled()` runs `runDueOrderExpiryBatch`, `runShippingReconciliationBatch` and `runReconciliationBatch` with `Promise.allSettled`; any rejection is rethrown after all finish.

## Static pages
`next build` reads the public catalog (`/api/categories`, `/api/products`, `/api/products/:slug`, product reviews) through `lib/public-catalog.ts` without credentials. At least one category and one product must exist for the static export to succeed.
