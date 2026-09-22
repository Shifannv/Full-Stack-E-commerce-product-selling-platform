# Free-Tier / Low-Cost Plan

## Principle

Target maximum use of free/open-source tiers during development and low traffic, while accepting that commercial payment processing and domain registration may still cost money.

No provider's free tier should be treated as a permanent contractual guarantee.

## Current service plan

| Service | Current choice | Free/low-cost note | Risk to plan |
|---|---|---|---|
| Next.js | Open source | Free | Low |
| TypeScript | Open source | Free | Low |
| Tailwind | Open source | Free | Low |
| shadcn/ui | Open source | Free | Low |
| Drizzle | Open source | Free | Low |
| Better Auth | Open source | Free | Low |
| Cloudflare Pages | Free tier | Static assets free/unlimited | Quotas/features can change |
| Pages Functions | Cloudflare Free | Shares Workers free request quota | 100k requests/day current documented limit |
| Neon PostgreSQL | Free tier | Current documented free plan available | Database quota limits |
| R2 | Free tier | Current documented 10 GB-month + operation allowance | Overages after free quota |
| Resend | Free tier | 3,000 emails/month; 100/day current | Email quota |
| Google OAuth | Google Cloud | OAuth setup does not require a paid runtime service | Provider policy can change |
| Cashfree | Payment service | Payment processing fees are separate | Not a free payment rail |
| GitHub | Free | Git hosting | Account/repo limits/policy can change |

## Current Cloudflare Pages facts

- Static asset requests are free and unlimited on Pages.
- Pages site file count on Free is currently capped at 20,000 files.
- Individual Pages asset size is currently capped at 25 MiB.
- Pages Functions requests count toward Workers free usage.

## Current Neon facts

Neon's current Free plan documentation lists:

- 100 projects
- 100 CU-hours/project/month
- 0.5 GB database storage/project
- 10 branches/project
- 5 GB public network transfer/project/month
- scale-to-zero after inactivity

For this ecommerce project, keep media out of Neon because R2 is the object store.

## Current R2 facts

R2 Standard currently includes monthly:

- 10 GB-month storage
- 1 million Class A operations
- 10 million Class B operations
- no internet egress charge

## Current Resend facts

Free plan currently includes:

- 3,000 emails/month
- 100 emails/day
- 3 domains

## Avoid free-tier abuse

Do not:

- create many fake accounts to bypass quotas;
- store large files repeatedly;
- trigger full static rebuilds after every small change;
- send promotional mail without user preferences/controls;
- use production as a testing database;
- create unlimited preview branches and keep them forever.

## Cost-control rules

1. Store images in R2, not Neon.
2. Keep static pages static so normal page delivery does not consume function quota.
3. Make auth/API endpoints efficient.
4. Cache public catalog queries where safe.
5. Batch rebuild triggers.
6. Delete abandoned R2 uploads.
7. Delete stale Neon preview branches.
8. Keep Resend messages transactional and permissioned.
9. Use Cashfree sandbox during development.
10. Monitor actual usage before adding paid services.

## Sources

- Cloudflare Pages Functions pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Neon Free limits: https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md
- Resend pricing: https://resend.com/pricing
