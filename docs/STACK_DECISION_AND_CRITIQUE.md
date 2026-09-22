# Stack Decision + Critique

## Decision

The project can use the following stack:

```text
Frontend
  Next.js + TypeScript + Tailwind + shadcn/ui

Static hosting
  Cloudflare Pages

Backend
  Cloudflare Pages Functions
  Hono for routing (recommended)

Database
  Neon PostgreSQL
  Drizzle ORM
  @neondatabase/serverless

Auth
  Better Auth
  Customer → Google OAuth
  Admin → email/password
  Super Admin → email/password

Media
  Cloudflare R2

Email
  Resend

Payments
  Cashfree
```

## Critique 1 — Your SSG choice is valid, but pure SSG has a real ecommerce limitation

Cloudflare documents Next.js static export to Pages and uses `out` as the build directory. Static assets are served for free/unlimited requests on Pages. See official source in PROJECT_CONTEXT.md

The problem is data freshness.

Example:

```text
Product page HTML generated at 10:00
Price = ₹999

Admin changes price at 14:00
Price = ₹899
```

The old HTML remains until a new static build occurs.

Therefore:

- SSG is good for SEO/public storefront content.
- Backend must still be the authority for live prices, stock, coupons and payments.
- Product/category/CMS changes need a rebuild trigger.
- Use a Cloudflare Pages Deploy Hook after important content/catalog changes.

## Critique 2 — Do not make the backend responsible for SEO HTML

Wrong:

```text
Backend → creates HTML → frontend
```

Correct:

```text
Neon/backend data
      ↓
Next.js build
      ↓
HTML files
      ↓
Cloudflare Pages
```

Backend owns data and business logic. Next.js owns storefront rendering.

## Critique 3 — Do not put normal Next.js server API routes inside a pure static export

A static export is not the place for server-only application code.

Use:

```text
src/app/          → pages/UI
functions/        → backend runtime
```

This prevents deployment confusion where `src/app/api/*` expects a Node/Next server but the site is being deployed as static files.

## Critique 4 — Neon is a good match for Cloudflare serverless code

Use:

```text
@neondatabase/serverless
```

rather than relying on a normal persistent TCP PostgreSQL driver inside the Cloudflare runtime. Neon documents its serverless driver specifically for serverless environments including Cloudflare Workers. See official source in PROJECT_CONTEXT.md

## Critique 5 — R2 is the correct media direction for this plan

R2 has no internet-egress charge and currently includes a monthly free tier of 10 GB-month Standard storage, 1 million Class A operations and 10 million Class B operations. See official source in PROJECT_CONTEXT.md

Still:

- Free tier limits are not unlimited.
- Do not upload every original file forever.
- Validate file type and file size.
- Generate predictable object keys.
- Delete abandoned uploads.
- Keep private proof files private.

## Critique 6 — Password wording must change

Do not say:

> "Password should be encrypted in DB."

Correct security model:

```text
password
   ↓
slow password hash
   ↓
DB
```

Better Auth currently uses `scrypt` by default. Its documentation states that passwords are stored in the `account` table with `providerId = credential`. See official source in PROJECT_CONTEXT.md

The application never needs to decrypt a password because passwords should not be decryptable.

## Critique 7 — Free forever is not a guarantee

The architecture is intentionally designed around free/low-cost services, but no provider can guarantee that a free quota or product remains free forever.

Current documented examples:

- Cloudflare Pages static requests are unlimited/free; Pages Functions share the Workers Free request quota. See official source in PROJECT_CONTEXT.md
- Workers Free currently has a 100,000 requests/day limit. See official source in PROJECT_CONTEXT.md
- R2 currently has a free Standard tier of 10 GB-month + operation allowances. See official source in PROJECT_CONTEXT.md
- Neon Free currently provides 100 CU-hours/project/month, 0.5 GB storage/project, 10 branches/project and 5 GB public network transfer/project/month. See official Neon source in PROJECT_CONTEXT.md
- Resend Free currently provides 3,000 emails/month with a 100/day cap. See official source in PROJECT_CONTEXT.md

Cashfree transaction/payment costs are separate from hosting free tiers.

## Critique 8 — Keep build-time SEO and runtime commerce separate

Use build-time rendering for:

- product descriptions
- category copy
- collection pages
- static CMS pages
- structured data
- canonical metadata

Use runtime backend for:

- login/session
- cart changes
- checkout
- final price
- inventory check
- payment
- orders
- refunds
- admin actions
- payouts

This separation prevents SEO from becoming a security problem.

## Critique 9 — Use one repo, but two runtime responsibilities

Recommended repository boundary:

```text
ecommerce/
├── src/                 # Next.js UI
├── functions/           # Cloudflare backend
├── db/ / src/db/        # Drizzle schema
├── public/              # small static assets only
└── docs/
```

Do not create a second unrelated ecommerce project just to host the API.

## Final architecture judgment

The stack is internally coherent **when the project is treated as a static Next.js storefront plus Cloudflare serverless backend**.

The biggest mistake to avoid is treating `next export` as if it were a full backend runtime. It is not.
