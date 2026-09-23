# Free-Tier and Cost Plan — Current Reality

## Goal

Use free/low-cost services during development and early operation while keeping the architecture easy to upgrade.

No provider can guarantee that a free tier will remain unchanged forever. Treat free-tier details as current published limits, not permanent promises.

## Aiven PostgreSQL

Aiven currently documents a Free PostgreSQL service at $0/month with:

- 1 CPU
- 1 GB RAM
- 1 GB disk
- single node
- monitoring/metrics/logs
- backups
- maximum 20 connections
- no built-in connection pooling
- no 99.99% SLA
- possible inactivity shutdown

Use Hyperdrive for the Worker → Aiven connection path.

## Cloudflare R2

R2 is the project media store. Current published pricing includes monthly free usage and no egress bandwidth charge, with storage/operation charges above included usage.

## Cloudflare Pages / Workers

Use Pages for the current static public site and Workers for the backend API. Monitor request usage rather than treating free service quotas as unlimited.

## Resend

Use for transactional/customer email. Verify a sender domain before production. Respect customer communication preferences.

## Cashfree

Sandbox is for development. Production payment/payout activity can incur provider charges.

## Cost-control rules

- Compress images.
- Avoid duplicate R2 objects.
- Store metadata in PostgreSQL, binaries in R2.
- Paginate large lists.
- Add indexes based on real queries.
- Avoid N+1 queries.
- Batch/debounce SEO rebuild triggers.
- Do not rebuild Pages for internal-only changes.
- Use Hyperdrive pooling.
- Do not add expensive infrastructure before measured need.

## Upgrade signals

Upgrade when actual metrics show:

- Aiven storage approaching 1 GB.
- Connection/latency pressure.
- Frequent inactivity shutdown is unacceptable.
- Production workload requires SLA/HA.
- Pages build time becomes operationally painful.
- Worker/database usage exceeds the chosen free limits.

The architecture intentionally keeps provider-specific logic isolated so these upgrades can happen without rewriting order/auth business rules.


## Upstash Redis

Current selected Redis provider for the free/early stage: **Upstash Redis**.

Current published Free limits:

- 256 MB data size
- 10 GB monthly bandwidth
- 500K monthly commands
- $0/month

Use Redis for small, controlled cache/rate-limit/temporary-state workloads only. Do not treat the free tier as a guarantee for long-term production traffic.

## Cache cost-control rules

- Cloudflare edge cache is the first choice for public cache-safe HTTP responses.
- Do not duplicate every response into Redis.
- Use Redis only for measurable hot paths or utility features.
- Keep TTLs short for derived data.
- Invalidate cache after product/category changes.
- Keep PostgreSQL as the authority so cache loss never causes data loss.
