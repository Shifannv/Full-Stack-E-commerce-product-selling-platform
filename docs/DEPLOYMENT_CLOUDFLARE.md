# Cloudflare Deployment Plan

## Target

```text
GitHub
  ↓
Cloudflare Pages
  ├── Next.js static build → out/
  └── Pages Functions → backend APIs

Neon PostgreSQL
R2
Resend
Cashfree
Google OAuth
```

## Pages build settings

Current Cloudflare Pages documentation for Next.js static export uses:

```text
Framework preset: Next.js (Static HTML Export)
Build command: npx next build
Build directory: out
```

## Next.js config

Expected:

```ts
const nextConfig = {
  output: "export",
};

export default nextConfig;
```

Do not add server-only Next.js features that require a Next.js server runtime to public export pages.

## Backend functions

Use Cloudflare Pages Functions for server-side API/auth/webhook behavior.

Possible structure:

```text
functions/
├── api/
│   ├── auth/
│   ├── customer/
│   ├── admin/
│   ├── super-admin/
│   └── webhooks/
└── _middleware.ts
```

If a function framework/router is used, keep it behind this Cloudflare Functions boundary.

## Local development

Recommended two-process development:

Terminal 1:

```bash
npm run dev
```

Terminal 2 for Cloudflare Functions/runtime testing:

```bash
npx wrangler pages dev out
```

Exact local command may evolve with the chosen Wrangler/Pages configuration.

## Pages Functions free limit

Cloudflare documents that Pages Functions requests count toward the Workers Free plan. Current free usage is 100,000 requests/day. Static asset requests remain free/unlimited.

This means:

- normal SEO page delivery should stay static whenever possible;
- API/auth requests consume function quota.

## `_routes.json`

When Pages Functions exist, use route exclusions so static asset requests do not invoke functions unnecessarily.

Goal:

```text
/static page → static asset path
/api/*       → function
```

## Deploy Hook for SEO rebuilds

Create a Cloudflare Pages Deploy Hook.

Store the URL as a server secret:

```env
CLOUDFLARE_PAGES_DEPLOY_HOOK_URL=
```

Backend/catalog events can trigger a rebuild for:

- product create/update/delete
- category changes
- collection changes
- major CMS changes

Do not trigger a build for:

- every cart update
- every order
- every login
- every payment webhook

Batch content rebuild triggers where possible.

## Custom domain

Recommended eventual domain structure:

```text
https://www.example.com        → storefront
https://api.example.com        → backend API if a separate API origin is used
https://media.example.com      → R2 public media/custom domain if desired
```

Same-origin `/api/*` routing is also possible with Cloudflare routing patterns, but keep the first implementation simple.

## Cloudflare R2

Use R2 for:

```text
products/
reviews/
proofs/
avatars/
content/
```

Public product images may use a public R2 bucket/custom domain.

Private files such as payment proof should not be publicly readable.

## Deployment safety

Before production:

- Add production environment variables.
- Confirm Google OAuth production redirect URL.
- Confirm Cashfree production credentials.
- Confirm Resend sending domain.
- Confirm R2 bucket and media URL.
- Confirm Neon production branch.
- Confirm database migrations.
- Confirm webhook URLs.
- Confirm domain DNS.
- Run SEO checks.
- Run auth/security checks.
- Test rollback.

## Sources

- Cloudflare Next.js static export: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- Pages Functions: https://developers.cloudflare.com/pages/functions/
- Pages Functions pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Pages routing: https://developers.cloudflare.com/pages/functions/routing/
- Pages Deploy Hooks: https://developers.cloudflare.com/pages/configuration/deploy-hooks/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
