# Refactoring Guide

## Hono ordering rule
Most routers call `router.use("*", requireAuth)` and are mounted at `/api`. Hono applies that middleware to every `/api/*` route registered **after** it. Therefore:
- Do not reorder mounts in `backend/src/routes/index.ts`.
- Do not split a router that has `use("*")` into several routers; use `register*(router)` functions on the same instance (see `routes/admin/index.ts`).
- Each router has its own `onError`; a moved handler must stay under the same error handler.

## Behavior-preservation check (route table)
Before and after a structural backend change, dump `app.routes` (`method path`, in order) and diff. A scratch script that imports `app` from `src/index` and prints `app.routes.map(r => r.method + " " + r.path)` is enough. The diff must be empty. Then run `npm run typecheck`, `npm test`, `npm run test:checkout:pg` (isolated local test DB only) and `drizzle-kit check` (with a dummy local `DATABASE_URL`; it does not connect).

## Frontend
Browser API calls go through `lib/api/`. Keep method, URL, body, credentials and error behavior identical when moving code. Verify with `npm run typecheck`, `npm run lint`, `npm run build`. The static export needs at least one published category and product from the catalog API it builds against.

## Living documentation rule
A coding task is not complete if code and docs disagree. When changing architecture, routes, APIs, frontend/backend relationships, business rules, implementation status, verification status or blockers, update `CURRENT_STATUS.md`, `architecture/*` and `api/*` (regenerate `API_ROUTE_MAP.md`). Never rewrite historical `verification/*` reports as if they were current; record corrections in `CURRENT_STATUS.md`. Never write secrets or secret values in docs.

## Safety
No migrations, schema or Aiven changes for code organization. No provider calls in refactor verification.
