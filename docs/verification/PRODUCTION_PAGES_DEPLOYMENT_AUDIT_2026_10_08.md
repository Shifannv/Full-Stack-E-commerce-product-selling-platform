# Production read-only Pages deployment audit ? 2026-10-08

**Audit completed. Previous authenticated E2E remains PARTIALLY VERIFIED.** No remediation was performed. Findings below concern the deployment actually served, not an inferred deployment of local HEAD.

## 1. Production deployment evidence

Direct Cloudflare Pages API metadata was captured at 2026-10-07 19:53:53 UTC (2026-10-08 01:23:53 IST). Public document/asset probes and anonymous Chrome observations were captured later in the same audit.

| Setting | Observed value |
| --- | --- |
| Project | ownline-ecommerce |
| Project ID | 4ef2d157-6e7c-4110-ba88-6fa4746a5043 |
| Canonical production deployment | dabe2d07-817b-4aef-8bee-e7efb1283367 |
| Created | 2026-10-03 08:26:53.074735 UTC / 13:56:53.074735 IST |
| Deployment completed | 2026-10-03 08:26:54.659150 UTC |
| Production branch / deployment branch | main / main |
| Production domain | https://ownline-ecommerce.pages.dev |
| Deployment URL | https://dabe2d07.ownline-ecommerce.pages.dev |
| Deployment status | deploy: success |
| Cloudflare build status | build: idle, no start/end timestamps; not a successful Cloudflare build |
| Trigger | ad_hoc, commit_dirty=true |
| Build command | null in deployment metadata |
| Output directory | out |
| Root directory | null in deployment metadata |
| Framework preset / Git source integration | Not supplied in returned metadata |
| Functions | uses_functions=true |

The deployment list returned three records; none was newer than the canonical October 3 production deployment. Across all 24 tested document paths, production and deployment-specific URLs returned identical status codes and identical SHA-256 document hashes. This directly ties the observed production behavior to that deployment. Direct upload uses prebuilt assets; deploy success alone does not verify that a newer local source tree was built. See [Cloudflare Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Evidence: [Cloudflare metadata](pages-audit-20261008/cloudflare-pages.json), [HTTP documents and chunks](pages-audit-20261008/deployed-routes-and-assets.json).

## 2. Deployed commit/revision

Cloudflare explicitly records **417d3b8fab197eb916279a80fc730327700e4efc**. This was obtained from deployment metadata, not local HEAD. However, **commit_dirty=true means this SHA does not identify the complete uploaded source tree**. The metadata message also differs from that Git commit's local subject. An exact clean-source reconstruction of the upload is unavailable.

That recorded commit lacks OperatorGate, BrandIntro, /returns, and all twelve workflow page sources. The served HTML, referenced JavaScript, and fresh anonymous Chrome inspection likewise lack the newer login/intro implementations and workflow documents. These observations establish an older frontend feature snapshot even though the dirty upload cannot be attributed byte-for-byte to the recorded commit.

One concrete dirty-tree warning: served publicImageUrl code permits 127.0.0.1, while the recorded commit's helper permits only localhost. Therefore this report does not equate the upload with the exact committed tree.

## 3. Local repository revision

Current branch: **main**. Current HEAD: **f4a9e1114663e32f9df4152346adca08d0b512d3**, committed October 7 at 15:10:54 IST. HEAD is **12 commits ahead** of the recorded Pages SHA.

Feature history:

- BrandIntro and /returns: introduced in 6427a4a3d436847336b145498183b050dbad38b4, October 4 at 14:50:14 IST.
- OperatorGate: introduced in 4f90ed02020f3a2984c5d215c8438647d9098438, October 6 at 12:35:38 IST.
- Admin onboarding and Super Admin reviews: added in current HEAD on October 7.
- Media URL resolution already existed in the recorded deployed commit. Its empty-base guard remains in current source. A later development-loopback validation change does not explain missing production images.

Existing frontend/out files were generated October 7 around 12:37 IST, before the current HEAD commit and the subsequent uncommitted price-filter UI changes. They contain newer routes and login/intro chunks, but their exact source provenance is not established. They are **existing local artifacts**, not a fresh build of current HEAD. The .next export-detail reports success for a different output path (.next-build-verify), so it does not independently authenticate frontend/out provenance. No build was run during this audit.

Pre-existing source/config modifications were preserved. Evidence: [repository, source presence and manifests](pages-audit-20261008/local-repository.json).

## 4. Route comparison

?Recorded commit? means source presence in the metadata SHA; it does not reconstruct the dirty upload. ?Local export? means HTML file present in existing frontend/out. Dynamic routes below use concrete existing production slugs.

| Route | Current source | Recorded commit source | Existing local export | Production GET | Deployment GET |
| --- | --- | --- | --- | --- | --- |
| / | Yes | Yes | Yes | 200 | 200 |
| /search | Yes | Yes | Yes | 200 | 200 |
| /categories/phase11b2-accessories-730d72e64790 | Yes | Yes | No | 200 | 200 |
| /products/phase11b2-cotton-tote-730d72e64790 | Yes | Yes | No | 200 | 200 |
| /account | Yes | Yes | Yes | 200 | 200 |
| /orders | Yes | Yes | Yes | 200 | 200 |
| /wishlist | Yes | Yes | Yes | 200 | 200 |
| /cart | Yes | Yes | Yes | 200 | 200 |
| /account/addresses | Yes | Yes | Yes | 200 | 200 |
| /returns | Yes | No | Yes | 404 | 404 |
| /admin | Yes | Yes | Yes | 200 | 200 |
| /admin/onboarding | Yes | No | Yes | 404 | 404 |
| /admin/products | Yes | No | Yes | 404 | 404 |
| /admin/inventory | Yes | No | Yes | 404 | 404 |
| /admin/orders | Yes | No | Yes | 404 | 404 |
| /admin/returns | Yes | No | Yes | 404 | 404 |
| /admin/finance | Yes | No | Yes | 404 | 404 |
| /super-admin | Yes | Yes | Yes | 200 | 200 |
| /super-admin/admins | Yes | No | Yes | 404 | 404 |
| /super-admin/products | Yes | No | Yes | 404 | 404 |
| /super-admin/roles | Yes | No | Yes | 404 | 404 |
| /super-admin/reconciliation | Yes | No | Yes | 404 | 404 |
| /super-admin/reviews | Yes | No | Yes | 404 | 404 |
| /super-admin/payouts | Yes | No | Yes | 404 | 404 |

All thirteen missing document paths also return 404 when requested as their explicit .html paths on the deployment URL. Both /admin and /super-admin root documents return 200. The missing pages are absent from the **served static artifact**. A complete remote upload file manifest was not obtained, so physical absence from its internal file inventory is not independently certified. Public documents and their referenced JS chunks were downloaded and hashed.

Current Next configuration uses output: export and images.unoptimized=true. Existing local _routes.json sends only /api/* to Pages Functions; other paths resolve as static assets. This is local configuration evidence, not a claim that the remote routing manifest was retrieved. Successful unrelated static routes, matching deployment URL results, source chronology, and explicit .html 404s support revision mismatch over a general routing failure.

The existing local export does not contain the two tested production category/product slugs. Its dynamic HTML files are categories/mens-clothing.html and products/tees.html instead. This indicates different catalog build inputs and is another reason the existing local export cannot be treated as a production-ready artifact. The thirteen missing fixed pages are nevertheless all present locally.

These are direct document GET results, not __next.*.txt prefetch results. Existing local export contains all thirteen missing documents, so the current configuration demonstrably can export them. No present-day build/export omission was established.

Evidence: [route comparison](pages-audit-20261008/route-comparison.json).

## 5. Operator login comparison

Current admin/(workspace)/layout.tsx and super-admin/(workspace)/layout.tsx wrap workspaces in OperatorGate. Source includes Seller sign-in / Platform sign-in forms, role checks, and the Admin mustChangePassword branch to InitialPasswordChange. Backend authorization remains the boundary.

Existing local export JS contains both sign-in labels and the must-change-password state/branch. This demonstrates inclusion in that local artifact, not proof of a fresh current-HEAD production build.

Deployed root documents and the 21 downloaded referenced chunks lack the sign-in labels/gate markers examined. Anonymous Chrome sees zero forms and zero password inputs on both operator roots, displaying Dashboard unavailable instead. The new sign-in and forced password-change flows are not reachable from those deployed roots. No sign-in or password change was attempted in this read-only audit.

Classification: **DEPLOYMENT REVISION MISMATCH**. Current source implements the flow; served production contains an older UI snapshot.

## 6. /returns comparison

Current source: frontend/src/app/(customer)/returns/page.tsx. This is a fixed page with CustomerGate, Suspense and ReturnLookup; no dynamic segment is required. Existing local export: returns.html present; local route/prerender evidence includes /returns. Recorded deployed commit: source absent. Served production: /returns and deployment /returns.html both document 404.

No current static-export exclusion was found. Classification: **DEPLOYMENT REVISION MISMATCH**.

## 7. Intro comparison

Current homepage imports CampaignHero, which renders BrandIntro alongside the campaign poster/video. Existing local JS includes brand-intro. BrandIntro has reduced-motion/session behavior, so merely failing to observe an animation would not establish a deployment defect.

Here, deployed home HTML has no brand-intro, campaign-hero or video; downloaded referenced chunks lack the intro marker. Fresh Chrome with no-preference motion sees the older ?A little more you, every day.? hero and no intro, campaign or video nodes. Combined with deployment/source chronology, this supports an older homepage implementation rather than diagnosing an intro animation bug.

Classification: **DEPLOYMENT REVISION MISMATCH**.

Evidence for sections 5?7: [artifact features](pages-audit-20261008/artifact-feature-comparison.json), [anonymous Chrome](pages-audit-20261008/anonymous-browser.json), saved deployed HTML/JS in the evidence directory.

## 8. Product media configuration

Existing product: c549089e-32fb-4217-96d7-35dc5a40eb70. Both public product API origins return HTTP 200, identical response hashes, and the image record with key:

products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png

The customer product HTML serializes that same objectKey. This is a relative **storage reference**, not an absolute media URL and not itself a browser img src. It contains no development origin or unavailable custom domain.

Cloudflare production deployment environment:

| Variable | Value |
| --- | --- |
| CATALOG_BUILD_API_URL | https://ecommerce-api.ownlinedropshipping.workers.dev |
| NEXT_PUBLIC_API_URL | https://ownline-ecommerce.pages.dev |
| NEXT_PUBLIC_SITE_URL | https://ownline-ecommerce.pages.dev |
| PUBLIC_WORKER_URL | https://ecommerce-api.ownlinedropshipping.workers.dev |
| NEXT_PUBLIC_R2_PUBLIC_BASE_URL | Empty string |

Direct compiled-code evidence in deployed-0-z3kvk3jkzbf.js (and two product-card chunks): publicImageUrl starts with let t="".trim(); if(!t||!e)return null;. Product gallery/card code renders ?Image coming soon? when this helper returns null. Consequently **no actual image URL is emitted** for this key. Chrome confirms the placeholder and no matching product img URL.

Current frontend/src/lib/images.ts still requires this configured base. Current frontend/scripts/build-cloudflare-production.mjs pins it to an empty string deliberately pending an owned R2 custom domain; frontend/wrangler.toml also has the empty production value. The local .env.local uses http://127.0.0.1:8787/api/images for development only. No development URL is baked into the observed production media helper. Rebuilding newer source with the existing production wrapper would preserve this media failure.

Diagnostic public object GETs both succeed:

- Pages: https://ownline-ecommerce.pages.dev/api/images/products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png
- Worker: https://ecommerce-api.ownlinedropshipping.workers.dev/api/images/products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png

Both return **200, image/png, 68 bytes**, identical SHA-256 36301ece93d96811008b89131c3a6c26cb223801c0da1761fc81838de9341c4d. These are available diagnostic API URLs, not URLs currently emitted by the frontend. Their success proves object readability through the Worker/proxy; it does not establish direct R2 public-domain configuration or image suitability as a catalog photograph.

Current R2 managed/custom-domain API reads and deployment log reads returned HTTP 401, Authentication error (10000), after the initial successful Pages metadata reads. Those settings/logs remain unverified; no credential refresh or configuration change was attempted. Historical R2 reports are not used as current settings evidence.

Classification: **WRONG DEPLOYED CONFIGURATION**. The directly evidenced cause is the empty compiled public media base; missing resolved URL is its consequence. Object absence or direct R2 public access failure is not evidenced as the rendering cause.

Evidence: [public product/object reads](pages-audit-20261008/product-media.json), [unavailable settings/log reads](pages-audit-20261008/cloudflare-media-and-logs.json), downloaded public chunks and serialized product HTML.

## 9. Root causes

| Finding | Required classification | Evidence and confidence |
| --- | --- | --- |
| A. Operator routes | DEPLOYMENT REVISION MISMATCH | High: older recorded revision, source history, thirteen document/.html failures, newer existing local export |
| B. Operator login UI | DEPLOYMENT REVISION MISMATCH | High: source/local artifact gates present, served roots/chunks/browser gates absent |
| C. /returns | DEPLOYMENT REVISION MISMATCH | High: post-deployment source, local HTML present, deployment document absent |
| D. Cinematic intro | DEPLOYMENT REVISION MISMATCH | High: newer source/local artifact versus older served home implementation |
| E. Product media | WRONG DEPLOYED CONFIGURATION | Direct: empty Cloudflare value and compiled empty-base guard; object endpoints readable |

The recorded SHA is exact metadata evidence, but exact uploaded source provenance remains unknown because the upload was dirty. No full remote artifact inventory, Cloudflare build log or current R2 public-domain settings were available. Those limits do not remove the directly observed route/UI/media findings.

## 10. What is definitely NOT the root cause

- The known Windows static-export __next.*.txt prefetch issue does not explain these direct document 404s.
- Lack of current source implementations is not the cause: all expected page sources and the new gates/intro exist.
- A missing product image record or unreadable object through the Worker/proxy is not the reason the frontend emits no image: the record exists and both object GETs succeed.
- A development media URL accidentally emitted in production is not observed: the helper has an empty base and emits no URL.
- Reduced-motion/session animation suppression cannot explain the missing deployed intro implementation itself.

Not ruled out globally: unrelated source bugs, exact historical export/upload omissions, direct R2-domain accessibility, or future fresh-build failures. Neither build success nor routing correctness for every possible route was claimed.

## 11. Recommended remediation order ? future task only

1. Establish a reviewable source revision and build provenance, preserving existing local changes; record the intended commit and all build-time public variables.
2. Select and validate the intended production media base. The two tested /api/images endpoints are readable options to evaluate alongside an owned public R2 domain. Set the chosen build-time value in the future build workflow; changing runtime Pages metadata alone cannot alter the already compiled empty helper.
3. Produce a fresh static export using the intended production catalog inputs and check the existing production product/category slugs as well as all expected fixed HTML files, sign-in/gate/password-change chunks, intro assets, and resolved product URLs before upload. Recheck actual artifacts rather than trusting deploy success.
4. In the separately authorized deployment task, publish that reviewed artifact, then verify canonical deployment metadata/domain association.
5. Repeat production document, anonymous/authenticated operator, customer intro, and image checks. Keep the prior E2E at PARTIALLY VERIFIED until the remaining checks are completed.

No deployment, settings/secrets changes, source edits, builds, migrations, provider calls, business writes or R2 writes were performed. Audit activity used read-only API/public GETs, local reads and isolated anonymous Chrome with non-GET/HEAD methods blocked (none attempted); only audit report/evidence files were created.
