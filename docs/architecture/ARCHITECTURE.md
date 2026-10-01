# Architecture Overview

Status: reflects the repository after the 2026-10-01 structure refactor. Business rules live in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md); implementation status lives in [CURRENT_STATUS.md](../CURRENT_STATUS.md).

## Shape

```
Browser (Next.js static export, output: "export")
   |  credentials: "include", JSON over HTTPS      frontend/src/lib/api/*
   v
Cloudflare Worker (Hono)                            backend/src/index.ts -> app.ts
   |  routes (HTTP only) -> services (business rules) -> Drizzle -> PostgreSQL (Hyperdrive)
   |- Better Auth (/api/auth/*)
   |- R2 buckets (KYC documents, product images)
   |- Providers: Cashfree (payments/refunds), Shiprocket (shipping), Resend (email)
   `- Cron (every minute) -> scheduler.ts
```

## Layers (backend)

| Layer | Location | Responsibility |
|---|---|---|
| Entry | `src/index.ts` | Worker export (`fetch`, `scheduled`); keeps the `app` export for tests |
| Composition | `src/app.ts`, `src/routes/index.ts` | Global middleware, then ordered route registration |
| Scheduler | `src/scheduler.ts` | Cron batches: unpaid-order expiry, shipping reconciliation, payment/refund reconciliation |
| Routes | `src/routes/**` | Method/path, request parsing, validation, auth context, authorization, service call, response mapping |
| Middleware | `src/middleware/` | `requireAuth` (actor), `mutationOrigin`, rate limit |
| Services | `src/services/**` | **Business authority**: checkout, inventory reservation, payments, refunds, returns/QC, finance, shipping, reconciliation, admin lifecycle |
| Data | `src/db/` | Drizzle schema and client; migrations in `backend/drizzle/` |

## Invariants that shape the structure

- Routes do not own business rules; services remain the authority.
- Router mount order is behavior (router-level `use("*", requireAuth)` applies to later `/api/*` registrations). See [REFACTORING_GUIDE](../development/REFACTORING_GUIDE.md).
- The frontend never decides eligibility, amounts, approvals or permissions; it renders what the Worker returns.
- Provider calls happen only in services/adapters; webhooks are authenticated by provider secret/signature and are idempotent.
