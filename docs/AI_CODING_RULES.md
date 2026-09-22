# AI / Codex Coding Rules — Read Before Writing Code

## Source of truth

Always read:

```text
docs/PROJECT_CONTEXT.md
docs/STACK_DECISION_AND_CRITIQUE.md
docs/AUTH_SECURITY.md
docs/SEO_SSG_RULES.md
```

before creating architecture-sensitive code.

## Never invent a different stack

Current locked choices:

```text
Next.js
TypeScript
Cloudflare Pages
Cloudflare Pages Functions
Neon PostgreSQL
Drizzle ORM
@neondatabase/serverless
Better Auth
Google OAuth for Customer
Email/password for Admin + Super Admin
Cloudflare R2
Resend
Cashfree
Tailwind
shadcn/ui
Zod
```

Do not replace them with:

```text
MongoDB
Firebase
Supabase
Prisma
Clerk
NextAuth/Auth.js
Cloudinary
Vercel
AWS S3
```

unless the project owner explicitly changes the architecture.

## Never reintroduce removed business features

Do not add:

- marketplace tenant architecture
- public seller registration
- Cashfree Easy Split
- COD
- offline orders
- draft orders
- direct Admin withdrawals
- Platform Fee
- Market Fee
- Marketing Fee
- Approved Fee

## Frontend rule

Next.js is the storefront rendering layer.

Public SEO pages should remain compatible with static export.

If a requested feature requires runtime server rendering, discuss the architectural impact before putting it into a static page.

## Backend rule

Business logic goes in modules/services, not React components.

Pattern:

```text
UI
 ↓
API
 ↓
Auth
 ↓
Permission
 ↓
Zod
 ↓
Service
 ↓
Drizzle
 ↓
Neon
```

## Security rule

Never trust:

- price from client
- stock from client
- coupon amount from client
- payment success from client
- customer ID from client
- Admin ID from client
- permission from client

## Password rule

Say:

```text
password hash
```

not:

```text
encrypted password
```

Do not write a custom password table unless required by Better Auth integration.

## SEO rule

Before finishing any public page, check:

```text
metadata
canonical
HTML content
JSON-LD
internal links
image alt text
robots
sitemap
```

For product pages, Product structured data must be in initial HTML.

## R2 rule

Frontend should never receive R2 secret keys.

Uploads are authorized server-side.

Database stores object keys, not binary files.

## API rule

Every protected mutation requires:

```text
session + permission + resource ownership + validation
```

## Payment rule

Cashfree webhook verification is the payment authority.

Do not create:

```text
setOrderPaid(true)
```

from a browser-only success callback.

## Idempotency rule

Every external event that can retry must be idempotent.

Examples:

- payment creation
- payment webhook
- refund webhook
- payout execution
- email event processing

## Change process

Before code:

1. Identify route/module.
2. Identify database tables.
3. Identify API contract.
4. Identify permissions.
5. Identify external service.
6. Identify SEO impact.
7. Implement smallest reusable change.
8. Test failure cases.
9. Update docs when architecture changes.

## Do not hide failures

If an external API is unavailable:

- return a controlled error;
- log an internal diagnostic;
- keep secrets out of logs;
- do not silently mark transactions successful.

## Final check after implementation

Ask:

```text
Does this still match PROJECT_CONTEXT.md?
Does static export still work?
Does backend still run in Cloudflare Functions?
Are secrets server-only?
Is Neon accessed through a serverless-compatible driver?
Is password storage hashed?
Is SEO HTML present before hydration?
Does backend authorization protect the route?
Can the operation be retried safely?
```
