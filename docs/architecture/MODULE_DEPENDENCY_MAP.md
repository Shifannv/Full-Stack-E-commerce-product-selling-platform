# Module Dependency Map

Intended direction (no cycles): `index -> app -> routes -> middleware, services, lib -> db`.

| From | May import | Should not import |
|---|---|---|
| `index.ts` | `app`, `scheduler` | routes directly |
| `app.ts` | `routes/index`, `middleware/mutation-origin` | services |
| `routes/**` | `middleware`, `services`, `lib`, `db`, `app-env` types | other routes (except `admin/*` using `admin/shared`) |
| `scheduler.ts` | `db`, batch functions in `services` | routes |
| `services/**` | `db`, `lib`, other services, provider adapters | routes, middleware |
| `db/**` | drizzle | everything else |
| frontend `components`/`app` | `@/lib/api`, `@/lib/public-catalog`, `@/lib/auth-client` | `fetch` directly |
| frontend `lib/api/*` | each other (`client` <- `types`, `auth`, `customer`, `admin`, `super-admin`) | components |

Known exception: handlers in `routes/admin/*` (onboarding, review, products) and several other routers contain Drizzle queries or audit inserts that predate the refactor. They were moved verbatim; moving that logic into services is deferred because it risks behavior change. Tracked in [CURRENT_STATUS](../CURRENT_STATUS.md).
