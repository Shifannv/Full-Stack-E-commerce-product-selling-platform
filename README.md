# Ecommerce Docs Update — 2026-09-22
those  platform i was created for real time products of dropshipping and thrift cloth selling ,..allover selling platform 


It contains a `docs/` folder with the updated source-of-truth architecture, stack, security, SEO/SSG, database, deployment, environment-variable and AI coding rules.

Important stack changes recorded:

- PostgreSQL provider → Neon PostgreSQL
- Image/media storage → Cloudflare R2
- Remove Cloudinary/GCS
- Hosting → Cloudflare Pages static Next.js export
- Backend runtime → Cloudflare Pages Functions
- Customer auth → Google OAuth via Better Auth
- Admin/Super Admin auth → email/password via Better Auth
- Passwords → hashed (Better Auth scrypt), never reversible encryption
- Backend DB driver → `@neondatabase/serverless`
- SEO → build-time HTML + Product structured data in initial HTML
- Catalog/CMS changes → Cloudflare Pages Deploy Hook rebuild strategy

This package is intended to be copied into the project's `docs/` folder and used as the coding-agent source of truth.
