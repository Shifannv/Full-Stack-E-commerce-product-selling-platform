# References + Current Verification Notes

Research date: **2026-09-22**

## Cloudflare

### Next.js static export to Pages
https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/

Cloudflare's current guide specifically documents static Next.js export to Pages using `npx next build` and `out`.

### Pages Functions
https://developers.cloudflare.com/pages/functions/

Pages Functions provide server-side code for dynamic behavior without a dedicated server.

### Pages Functions pricing
https://developers.cloudflare.com/pages/functions/pricing/

Static asset requests remain free/unlimited; Pages Function requests count toward Workers plan quotas.

### Pages routing
https://developers.cloudflare.com/pages/functions/routing/

Use routing exclusions so static routes do not unnecessarily invoke Functions.

### Pages limits
https://developers.cloudflare.com/pages/platform/limits/

Current Free limits include a 20,000-file site limit and 25 MiB maximum asset size.

### R2 pricing
https://developers.cloudflare.com/r2/pricing/

Current Standard free tier includes 10 GB-month storage, 1M Class A operations, 10M Class B operations and free internet egress.

### Pages Deploy Hooks
https://developers.cloudflare.com/pages/configuration/deploy-hooks/

Deploy Hooks trigger new Pages builds by POSTing to a unique hook URL.

## Neon

### Free plan limits
https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md

Current documented Free plan: 100 projects, 100 CU-hours/project/month, 0.5 GB storage/project, 10 branches/project, 5 GB public network transfer/project/month. Compute scales to zero after inactivity.

### Serverless driver
https://neon.com/blog/serverless-driver-for-postgres

Neon documents its serverless driver for environments including Cloudflare Workers.

## Better Auth

### Email + password
https://better-auth.com/docs/authentication/email-password

Current docs: password credentials are stored in the account table and password hashing uses `scrypt` by default.

### Users/accounts
https://better-auth.com/docs/concepts/users-accounts

Covers password changes, account linking and account/session-related behavior.

### Drizzle adapter
https://better-auth.com/docs/adapters/drizzle

Official Drizzle integration.

### Hono integration
https://better-auth.com/docs/integrations/hono

Official Hono integration, including Cloudflare Workers compatibility guidance.

## Resend

https://resend.com/pricing

Current Free plan: 3,000 emails/month, 100 emails/day and 3 domains.

## Google Search

### Product structured data
https://developers.google.com/search/docs/appearance/structured-data/product-snippet

Google recommends Product structured data in initial HTML for merchant/product search experiences.

### Merchant listings
https://developers.google.com/search/docs/appearance/structured-data/merchant-listing

### Product variants
https://developers.google.com/search/docs/appearance/structured-data/product-variants

## Verification caution

Provider pricing, free quotas, framework support and platform limits can change. Treat current vendor documentation as authoritative at implementation/deployment time.
