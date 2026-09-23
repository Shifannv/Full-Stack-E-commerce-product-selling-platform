# References and Research Notes — 2026-09-23

## Cloudflare Pages + Next.js static export

https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/

Cloudflare documents Next.js Static HTML Export on Pages with `npx next build` and the `out` directory.

## Cloudflare Next.js / Workers

https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

Cloudflare currently recommends vinext for full-stack Next.js on Workers and documents static export/ISR support. This is the future migration path if pure static export becomes insufficient.

## Cloudflare Hyperdrive

https://developers.cloudflare.com/hyperdrive/

Hyperdrive supports PostgreSQL/MySQL and provides connection pooling close to Workers.

## Hyperdrive PostgreSQL

https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/

## Aiven PostgreSQL Free Tier

https://aiven.io/docs/products/postgresql/concepts/pg-free-tier

Current free-tier facts used in this project:

- 1 CPU
- 1 GB RAM
- 1 GB disk
- single node
- 20 max connections
- no connection pooling
- no 99.99% SLA
- possible inactivity power-off

## Aiven PostgreSQL pricing

https://aiven.io/postgresql

## Cloudflare R2

https://developers.cloudflare.com/r2/get-started/s3/
https://developers.cloudflare.com/r2/api/s3/api/

R2 supports an S3-compatible API and Worker bindings. The project can use presigned uploads or Worker bindings.

## Better Auth basic usage

https://better-auth.com/docs/basic-usage

Better Auth supports email/password and social providers including Google.

## Better Auth Hono integration

https://better-auth.com/docs/integrations/hono

Cloudflare Workers require the appropriate Node.js compatibility setting for the current Hono integration.

## Google OAuth reference

https://developers.google.com/identity/protocols/oauth2/web-server

Use the Google credentials already created by the project owner for Customer login.

## Payment

Cashfree official documentation should be used for current SDK/API/webhook details before implementation because provider APIs and signing requirements can change.

## Source-of-truth note

The URLs above are references for implementation details. Business rules in `PROJECT_CONTEXT.md` remain the project-specific source of truth.

## Cloudflare Workers Cache

https://developers.cloudflare.com/workers/runtime-apis/cache/

The Cache API provides programmatic cache control from Workers. Cache entries are not a globally synchronized database, and cache placement/behavior should be designed around public cache-safe responses.

## Cloudflare Workers Caching configuration

https://developers.cloudflare.com/workers/cache/configuration/

Workers caching can be controlled with cache configuration and cache headers. Requests/responses with authentication or private/no-store characteristics need explicit handling and should not become shared public customer data.

## Cloudflare Hyperdrive connection pooling

https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/

Hyperdrive maintains origin connection pools and is useful for protecting a small PostgreSQL service from excessive direct Worker connections.

## Upstash Redis pricing

https://upstash.com/pricing/redis

Current Free plan facts used in the cache plan:

- 256 MB data size
- 10 GB monthly bandwidth
- 500K monthly commands
- $0/month

These values can change; check the provider before deployment decisions.

## Better Auth cookies

https://better-auth.com/docs/concepts/cookies

Better Auth documents secure/httpOnly cookie handling for sessions. The application should not move privileged session secrets into localStorage.

## Better Auth session management

https://better-auth.com/docs/concepts/session-management

Better Auth documents cookie-based sessions and optional short-lived session cookie caching. This does not make localStorage the account authority.
