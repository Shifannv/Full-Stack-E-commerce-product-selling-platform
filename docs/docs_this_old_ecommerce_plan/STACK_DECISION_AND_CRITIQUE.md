# Stack Decision and Critique — 2026-09-24

## Final stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui (shadcn-first) |
| SEO target | Static export / prebuilt HTML on Cloudflare Pages |
| Backend | Cloudflare Worker + Hono |
| DB | Aiven PostgreSQL |
| Worker DB access | Cloudflare Hyperdrive |
| ORM | Drizzle ORM |
| Auth | Better Auth |
| Customer login | Google OAuth through Better Auth |
| Admin login | Better Auth email/password |
| Super Admin login | Better Auth email/password |
| Images/files | Cloudflare R2 |
| Application cache | Upstash Redis (controlled/optional) |
| Email | Resend |
| Payment | Cashfree Payment Gateway |
| Admin settlements | Cashfree Payouts or controlled manual payment |
| Source control | GitHub |

## Critique

### 1. Aiven is acceptable, but its free tier is a starting tier

Aiven currently documents a Free PostgreSQL service with 1 CPU, 1 GB RAM, 1 GB disk, a maximum of 20 connections, no built-in connection pooling, and no SLA. It can power down after inactivity. This is useful for development and small-scale use, but the project should not assume that this tier can support high traffic or large catalogs forever.

Design the application so the database provider can be upgraded without rewriting business logic.

### 2. Hyperdrive is important for the Worker → Aiven path

Cloudflare Hyperdrive supports PostgreSQL and keeps a managed connection pool close to the Worker. That is especially useful because Aiven Free itself does not provide connection pooling and has a 20-connection limit.

Use Hyperdrive rather than opening a new database connection for every request.

### 3. Cloudflare Pages static export is good for the SEO-first storefront, but it has a scaling limitation

A pure static export means public pages are produced during a build. New products/categories and content changes require a new build to regenerate the affected HTML.

That is acceptable for the current plan, but the docs include a migration path to Cloudflare Workers/ISR if the catalog becomes large or updates become frequent. Do not prematurely build a complex ISR system.

### 4. Do not create a second authentication system

Google OAuth and Better Auth are not competing products in this design.

Better Auth owns users, sessions, account linking, authorization integration, and authentication flows. Google is simply the Customer OAuth provider.

### 5. Do not encrypt passwords

Passwords are hashed. Reversible encryption of user passwords creates unnecessary risk and is not the correct authentication storage model.

### 6. R2 replaces Cloudinary/GCS

R2 is the single file/image store. Store object keys/URLs in PostgreSQL; store binary media in R2.

### 7. Keep one backend Worker

Do not split the platform into many services. One Hono Worker with domain modules is easier to maintain and adequate for this application.

## Current deployment architecture

```text
                 CUSTOMER
                    │
                    ▼
          Cloudflare Pages
          Next.js static export
                    │
                    ▼
              API requests
                    │
                    ▼
        Cloudflare Worker + Hono
                    │
         ┌──────────┼───────────┬───────────┐
         ▼          ▼           ▼           ▼
   Better Auth    Hyperdrive   Upstash      R2
                    │           Redis
                    │

                    ▼
               Aiven Postgres

        Worker → Cashfree
        Worker → Resend
        Worker → Google OAuth
```

## Scale trigger

Start with Pages static export.

Plan a controlled migration to Next.js on Cloudflare Workers/ISR when one or more of these become true:

- Product count makes full builds slow.
- Category/product updates happen frequently enough that rebuild latency is unacceptable.
- The business needs server-rendered personalization on public pages.
- The storefront needs request-time data that cannot be represented in static HTML.

This is a planned upgrade, not a reason to over-engineer version 1.


### 8. Cache architecture is layered, not a second database

The current plan uses:

```text
Browser localStorage
→ only non-sensitive client state

Cloudflare cache
→ public HTTP/SEO/static responses

Upstash Redis
→ short-lived server-side cache/rate limits only when useful

Hyperdrive
→ PostgreSQL connection pooling + eligible read caching

Aiven PostgreSQL
→ source of truth
```

Do not cache customer-specific or financial data in a shared public cache. Do not make Redis a replacement for PostgreSQL. See `CACHE_AND_CLIENT_STATE.md`.

### 9. Free-tier critique of Redis

Upstash Redis Free is currently documented at 256 MB data, 10 GB monthly bandwidth, and 500K monthly commands. It can be useful as a small early-stage cache, but those limits are not large enough to justify putting the entire application's state into Redis. Use it selectively and keep PostgreSQL authoritative.


## 10. shadcn/ui is the default UI source, not a separate visual layer

The project should use the official shadcn/ui component system as the first source for reusable UI primitives and blocks. shadcn/ui distributes component source code into the application, which the project owns and can customize. Do not treat it as a locked black-box package.

Rules:

- Check the official shadcn/ui component catalog before writing a custom component.
- Use official blocks for larger patterns when they fit.
- Add only the components actually required.
- Prefer composition of existing shadcn components over new primitives.
- Keep business logic out of generic UI components.
- Do not add another complete UI library without an explicit architecture decision.
- Review third-party registry components before using them.

See `SHADCN_UI_BUILD_GUIDELINES.md`.

## 11. Platform-inspired product guidelines

The product workflow uses **documented principles** inspired by Shopify, Amazon, and Airbnb, not copied legal wording.

The implementation should emphasize:

- accurate product information
- clear public policies
- transparent pricing and promotion rules
- immutable historical order values
- authentic reviews and anti-manipulation controls
- clear support/dispute flows
- auditable privileged actions
- privacy-aware customer communication

See `PLATFORM_INSPIRED_COMMERCE_GUIDELINES.md` and `LEGAL_POLICY_BLUEPRINT.md`.

These are engineering/product requirements. Legal policy text must be written for this business and reviewed appropriately before production.
