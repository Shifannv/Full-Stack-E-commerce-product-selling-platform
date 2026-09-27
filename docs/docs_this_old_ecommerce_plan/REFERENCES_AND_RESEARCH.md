# References and Research Notes — 2026-09-24

## shadcn/ui

Official introduction:
https://ui.shadcn.com/docs

Official installation:
https://ui.shadcn.com/docs/installation

Official CLI:
https://ui.shadcn.com/docs/cli

Official components:
https://ui.shadcn.com/docs/components

Official source/registry guidance:
https://ui.shadcn.com/docs/official

Research note: shadcn/ui describes itself as an open-code, composable component distribution system. Components are added as project-owned source code and can be customized. The official CLI can add individual components or blocks.

## Cloudflare Pages + Next.js static export

https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/

Cloudflare documents Next.js Static HTML Export on Pages with `npx next build` and the `out` directory.

## Cloudflare Workers / Next.js

https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/

Current Cloudflare guidance supports full-stack Next.js on Workers and provides a future migration path if pure static export becomes insufficient.

## Cloudflare Hyperdrive

https://developers.cloudflare.com/hyperdrive/
https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/

Hyperdrive supports PostgreSQL and provides a managed connection-pooling layer close to Workers.

## Aiven PostgreSQL

https://aiven.io/docs/products/postgresql/concepts/pg-free-tier
https://aiven.io/postgresql

Current free-tier facts used for the plan were checked on 2026-09-24. Treat free-tier limits as changeable.

## Cloudflare R2

https://developers.cloudflare.com/r2/get-started/s3/
https://developers.cloudflare.com/r2/api/s3/api/

R2 supports native Worker bindings and an S3-compatible API.

## Better Auth

https://better-auth.com/docs/basic-usage
https://better-auth.com/docs/adapters/drizzle
https://better-auth.com/docs/integrations/hono
https://better-auth.com/docs/concepts/cookies

Research note: Better Auth is the single authentication system. Google is only the Customer OAuth provider. Admin and Super Admin use email/password.

## Google OAuth

https://developers.google.com/identity/protocols/oauth2/web-server

## Upstash Redis

https://upstash.com/docs/redis/overall/getstarted
https://upstash.com/pricing/redis

Redis is treated as an optional/controlled application cache and utility layer, not as the source of truth.

## Resend

https://resend.com/docs
https://resend.com/docs/dashboard/domains/introduction

Production email should use a verified sending domain.

## Shopify research

Consumer protection / refund policy:
https://help.shopify.com/en/manual/compliance/legal/consumer-protection

Store policies:
https://help.shopify.com/en/manual/checkout-settings/refund-privacy-tos

Variant editing:
https://help.shopify.com/en/manual/products/variants/edit-variants

ShopifyQL / commerce analytics:
https://shopify.dev/docs/api/shopifyql/latest

Research note: the project adopts policy visibility, structured product/variant management, and domain-aware analytics as product/engineering principles. It does not copy Shopify legal text.

## Amazon research

Amazon customer review policy discussion/reference:
https://sellercentral.amazon.in/seller-forums/discussions/t/d46e163e-6ecd-48f6-b7f3-125c38c6e37d

Amazon detail-page guidance/reference:
https://sellercentral.amazon.in/seller-forums/discussions/t/aa997e7a-9d33-4d67-9ff6-d869476ebc90

Amazon reference-pricing update:
https://sellercentral.amazon.in/seller-forums/discussions/t/f48a1fe5-aa8e-4806-b687-2d9aeec5c351

Amazon.in Privacy Notice:
https://blueprints.amazon.in/help/terms?page=privacy-notice

Research note: the project adopts product-detail accuracy, pricing transparency, and review-authenticity principles. It does not copy Amazon policy/legal text.

## Airbnb research

Reviews Policy:
https://www.airbnb.com/help/article/2673

Reviews for homes:
https://www.airbnb.com/help/article/13

Payments Terms:
https://www.airbnb.com/help/article/2909

Terms of Service reference:
https://assets.airbnb.com/help/June_2025_Terms_of_Service_for_Users_Outside_of_the_EEA_UK_and_Australia_-_English_Canada.pdf

Research note: Airbnb is not an ecommerce store. Only its useful patterns for layered policies, review authenticity, dispute/resolution flows, user-generated content, and trust are adapted.

## Legal source-of-truth rule

The source platforms' legal documents are references, not templates. Final Terms of Service, Privacy Policy, Shipping Policy, Return/Refund Policy, and related legal notices must match the actual business and applicable law.
