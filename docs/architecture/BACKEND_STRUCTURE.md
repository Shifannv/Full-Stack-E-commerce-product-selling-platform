# Backend Structure

`backend/src/` after the 2026-10-01 refactor (no behavior change; verified by an identical route table).

```
index.ts                  Worker entry: { fetch, scheduled }; re-exports app
app.ts                    new Hono; CORS + mutationOrigin on /api/*; registerRoutes(app)
app-env.ts                AppEnv / App types
scheduler.ts              scheduled(): Promise.allSettled of 3 batches, then client.end
routes/
  index.ts                registerRoutes(): auth, health, /api/me, then 16 `app.route` mounts in the pre-refactor order
  health.ts               GET /health, GET /health/db
  auth/auth.routes.ts     ALL /api/auth/* (Better Auth), GET /api/me
  customer/               customer.ts (public catalog + /api/customer/*), orders.ts (customer + admin orders),
                          reviews.ts (public + customer + super-admin moderation), payments.ts (payment session),
                          returns.ts (customer, admin, super-admin return/refund)
  admin/                  index.ts (adminRoutes: requireAuth + onError + register* in original order),
                          activation.ts (unauthenticated, rate-limited), onboarding.ts, review.ts, products.ts,
                          catalog.ts, shipping.ts (provider config), shared.ts (helpers), admin-lifecycle.ts
  super-admin/            dashboard.ts, reconciliation.ts, finance.ts (admin + super-admin finance),
                          shipping.ts (operator + seller shipping)
  webhooks/               shipping.webhook.ts, payments.webhook.ts (+ shipping.test.ts)
middleware/ services/ db/ lib/ scripts/   not restructured
```

Also present: `security.pg.test.ts` (Worker-level security tests). `src/scripts/` holds only `local-db-guard.test.ts`. There is no `modules/`, `admin/`, `super-admin/`, `validators/` or `types/` directory under `backend/src/`.

## Rules for routes

- Parse/validate input, establish actor, authorize, call a service, map the response.
- Mixed-audience routers (orders, returns, finance, reviews, shipping) are filed under their primary domain and are **not** split: they share one `use("*", requireAuth)` and one error handler. Splitting would register middleware more than once or change ordering.
- `admin/index.ts` uses `register*(adminRoutes)` functions so the single `adminRoutes` router, its `requireAuth` and its `onError` stay unique.
- Webhook routers keep their own `onError` and are mounted at `/webhooks` after the same routers as before.

Full HTTP surface: [API_ROUTE_MAP](../api/API_ROUTE_MAP.md).

Removed 2026-10-01: `routes/admin/invitations.ts` (deprecated empty router; no routes, no importers besides `routes/index.ts`, route table unchanged by its removal). Invitation/activation endpoints are `GET/POST /api/admin/activate` and `/api/admin/review/invite|reinvite` in `routes/admin/`.
