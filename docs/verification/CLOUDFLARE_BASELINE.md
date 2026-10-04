# Cloudflare production infrastructure baseline

Verified 2026-10-03. **Worker and Pages baseline: PASS. Production media domain: BLOCKED.**

This is an infrastructure deployment, not approval to launch commerce. The earlier local authenticated Admin/Super Admin verification remains complete and was not repeated.

## Deployments

| Resource | Current production deployment |
|---|---|
| Worker `ecommerce-api` | Version `24fef5d6-504f-4269-8e2f-da6a34040f2b`, 100% traffic |
| Pages `ownline-ecommerce` | `dabe2d07-817b-4aef-8bee-e7efb1283367`, production branch `main`, Functions enabled |
| Site | https://ownline-ecommerce.pages.dev |
| API | https://ecommerce-api.ownlinedropshipping.workers.dev |

Previous Worker version: `675e46a3-93b8-4290-802b-2fc268f6f0bc`. Previous Pages deployment: `887a0e3c-ed6f-4b6a-b87a-8077e4b349fa`. Deployment used the current working tree, including the previously verified redesign; no commit was created.

## Reconciliation

- Live inspection showed `PRODUCT_IMAGES_BUCKET` was already bound, contrary to older preflight notes. Both existing R2 bindings were preserved; no bucket or object was created or uploaded.
- Added `backend/wrangler.production.jsonc` with explicit production origins, the existing Hyperdrive ID, both R2 bindings, preserved existing variables/secrets, and **empty cron schedules**. The local development config is not the production deployment config.
- Added the missing Worker `ADMIN_SETUP_URL` pointing at the existing Pages setup route. This does not configure or invoke Resend.
- Downloaded the existing Pages config and reconciled `frontend/wrangler.toml`. Production `PUBLIC_WORKER_URL` is now an explicit plain URL rather than an opaque secret setting. Existing environment entries were retained, and preview was left unchanged. Added an explicitly empty production media base.
- Automatic approval initially rejected replacement of the Pages environment map because of possible unrelated-variable loss. A fresh inspection plus a guarded merge preserving every existing entry was approved and succeeded.
- Added `frontend/scripts/build-cloudflare-production.mjs` to pin production origins before Next loads `.env.local`. It reads the live production catalog via GET and explicitly clears the local media URL. Production build passed: 16 static pages. Export contained the two pre-existing production fixture slugs, with no local Tees page. Artifact scan found no local API/site URLs or development R2 domain.
- Corrected the `remote: true` comment: that setting permits remote R2 access during local development; it is not required for deployment. See [Cloudflare R2 binding documentation](https://developers.cloudflare.com/r2/get-started/workers-api/).

## Live verification

Evidence: [CLOUDFLARE_BASELINE.json](CLOUDFLARE_BASELINE.json). Reproducible read-only check: `backend/scripts/verify-cloudflare-baseline.mjs`.

| Check | Result |
|---|---|
| Worker `/health` | 200 |
| Worker `/health/db` | 200, connected; endpoint executes only `SELECT 1` |
| Products/categories directly and through Pages | 200; parsed response bodies match |
| Anonymous `/api/me`, Admin summary, Super Admin summary | Expected 401, both direct and through Pages |
| Anonymous auth session endpoint | 200, null session, both origins |
| Production bindings | Correct existing Hyperdrive and both R2 buckets |
| Existing Worker secrets | All seven previously listed secret bindings preserved; values never retrieved |
| Cron | Empty schedules confirmed after deployment |
| Existing product R2 object | Worker GET 200, image/png, 68 bytes |
| KYC bucket | Managed public access disabled; no custom public domains |
| Live browser | Home, existing product detail, Admin and Super Admin public shells returned 200 and rendered headings; no page runtime errors observed |
| Browser API origin | Observed requests use Pages origin; observed 401s are signed-out responses |

Browser verification used a fresh unauthenticated context and permitted only GET/HEAD on the Pages origin. It does **not** establish production login, session persistence, or OAuth success. Initial browser harness attempts stopped on a safe HEAD request and on a network-idle timeout; the final check used rendered-content readiness and passed. No application fix was required.

## Remaining infrastructure blocker

`shop-product-images` has **no custom domain**. The account-scoped zones query returned no accessible zones. Its enabled `pub-568301fa6e09442d9faf61b0274abb0c.r2.dev` URL remains designated for development and was not promoted to production.

Required input: the owned production media hostname and corresponding Cloudflare zone/account. Then attach and verify the R2 custom domain, set it in the Pages production media variable and production build script, rebuild, and deploy. Until then, production storefront images use the existing honest missing-image state. R2 object storage and the Worker binding are verified independently.

## Safety and scope

- Production Worker and Pages deployments **did occur**, as authorized by the latest task.
- No Aiven configuration, migrations, fixture creation, or production database writes were performed. Database access was limited to public catalog reads and `SELECT 1`.
- No Cashfree, Shiprocket, Resend, or Google Cloud Console configuration or provider calls. Existing Worker secrets remain unchanged.
- No production users/sessions were created, no login attempted, and no authorization rule or business logic changed.
- Cron remains disabled to avoid scheduled database/provider operations.
- Local authenticated testing was not repeated. Its TypeScript/lint results remain the prior verified results; the deployment-specific production build passed anew.
- Two-image hover remains implemented but not visually exercised; no second image was uploaded. It is not a production blocker.
- Provider/OAuth readiness and commerce launch gates remain separate. Existing production catalog fixtures were read unchanged, not replaced by local Tees data.

## Repeatable baseline commands

From `backend`:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.production.jsonc --keep-vars
```

From `frontend`:

```powershell
node scripts/build-cloudflare-production.mjs
node ../backend/node_modules/wrangler/bin/wrangler.js pages deploy out --project-name ownline-ecommerce --branch main --commit-dirty=true
```

For read-only infrastructure verification, from `backend`:

```powershell
node scripts/verify-cloudflare-baseline.mjs
```

The verifier uses the existing Wrangler login and installed local Playwright/Chrome; it records binding names and public URLs, never secret values.
