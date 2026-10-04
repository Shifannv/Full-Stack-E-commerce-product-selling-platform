# Storefront campaign and performance

The homepage follows the video-led, minimal storefront composition of https://usul.kr/ while keeping Ownline branding, real product data and customer routes. Shared navigation, type, spacing, touch targets and footer apply to all customer pages. The 2026-10-04 continuation extends the same brand palette/typography to both dashboards in their utility layouts. The forest footer, customer order actions and three-role API connections are documented in [FRONTEND_INTEGRATION_STATUS](../api/FRONTEND_INTEGRATION_STATUS.md).

## Cinematic intro and Dress-first discovery (2026-10-04)

Continues the supplied Claude plan, using [Ka-Lo Hané](https://kalohane.com/) as the requested intro reference and [Schlosshotel Kitzbühel](https://www.schlosshotel-kitzbuehel.com/en) as the section-reveal reference. Ownline retains its Instrument Serif / DM Sans typography and cream / forest shopping surfaces; the intro uses near-black with cream brand lettering and a sand tagline.

The intro reveals "Ownline Dropship" and "Considered finds for the everyday." word by word at 90ms intervals. It holds for at least 2.4 seconds, waits for the poster or video to be ready, then lifts over 800ms while hero copy enters. A 4-second readiness cap prevents failed media from blocking shopping. Every full load and refresh replays it; client navigation back home skips it. Native scrolling and Lenis are locked through the exit and restored afterward, including unmount cleanup. Reduced motion skips the intro; without JavaScript the curtain stays hidden and the page remains readable.

Homepage order: film, collection ribbon, Dress preview, editorial story, other published categories, category index, closing. Dress combines published clothing categories, sorts newest first, and displays at most nine products: three columns from 768px and two on mobile. Fewer published items produce fewer cards, with an honest empty state when none exist. "See more Dress" opens `/clothing`, whose primary filters are Everyone / Gents / Ladies and All clothing / Shirts / Pants / T-shirts. Filters and sorting persist in the URL; other published collections link below the clothing grid.

Section headings, editorial image/text, category-index links, closing and See more links reveal once on entry. The image uses a clipped reveal and gentle scale settling. Product grids/cards are outside reveal wrappers and stay static during scrolling, including live catalog refresh. Reveals enhance visible server HTML after hydration; reduced motion, preference changes, keyboard focus and component cleanup restore the final visible state. No parallax dependency or per-card entrance animations were added.

Catalog follow-up: Super Admin must publish real clothing products and appropriately named categories/subcategories. Audience/type filtering currently uses the existing name/slug matcher; this task does not seed or mutate the catalog. Existing films and generated campaign images are retained.

## Replace the demo video

Replace `frontend/public/videos/ownline-campaign-desktop.mp4` and `ownline-campaign-mobile.mp4`, or set `NEXT_PUBLIC_CAMPAIGN_VIDEO_DESKTOP` and `NEXT_PUBLIC_CAMPAIGN_VIDEO_MOBILE` before building. These public environment variables are embedded in the static export, so rebuild after changing them. Prefer same-origin files or an owned CDN with HTTPS, byte-range requests and cache headers.

Current desktop: 1920 × 1080, 25 fps, 20 seconds, H.264, no audio, approximately 6.3 MB. Current mobile: 720 × 1366, 25 fps, 20 seconds, H.264, no audio, approximately 3.7 MB. Both have MP4 fast-start headers for progressive playback. Use short loops; a very large 4K file will not make mobile loading faster. The default URLs include a revision query to avoid retaining the previous footage in browser caches.

Replace `frontend/public/images/ownline-campaign-poster.webp` alongside the footage. The preloaded poster remains visible until playback starts, including on autoplay rejection. Reduced motion, data saving and 2G connections skip automatic video loading. The film automatically loops while visible, with no visible playback control or bottom discovery overlay, as requested. Video pauses outside the viewport and in hidden tabs. Touch scrolling stays native; Lenis enhances wheel scrolling unless reduced motion is enabled.

## Media provenance

Desktop and mobile demo: cottonbro studio, [Model Wearing Sweater Posing at the Camera](https://www.pexels.com/video/model-wearing-sweater-posing-at-the-camera-7760067/). Downloaded October 4, 2026 under the [Pexels license](https://www.pexels.com/license/). The model wears an opaque high-neck sweater and jeans throughout. The complete 15.72-second source is slowed slightly to a 20-second sequence, compressed, and cropped for desktop with framing that follows the subject. This replaces the earlier crop-top footage. This is illustrative demo campaign footage, not an endorsement or footage of exact stocked products.

Poster and editorial image: generated with the built-in Imagegen tool for this project. Exact generation prompt is retained in adjacent image JSON sidecars. Images are converted to compact WebP; source generation remains outside the shipped public assets.

## Catalog loading

Homepage sections and the unfiltered shop start with build-time public catalog data. TanStack Query refreshes stale data immediately after hydration, caches public queries for ten minutes, treats results as fresh for thirty seconds and refreshes active product lists every minute and on window focus. Filter results and pagination use distinct keys and cancellation signals. Cached products stay visible if refresh fails, with a retry action. The API remains authoritative for cart mutations and checkout stock validation; this is not realtime inventory.

Product list responses carry their primary images. Grids no longer wait for one detail fetch per card to obtain optional hover images. The first two images per visible grid load eagerly; the remaining images use native lazy loading and fixed aspect ratios. Existing static export uses unoptimized Next images; TanStack Query improves data fetching, not image byte size. Product uploads still need appropriately sized assets.

## Verification limits

October 4, 2026 cinematic continuation: TypeScript, ESLint, design detector (no findings) and `git diff --check` passed. A fresh synthetic-catalog static export generated 84 routes. Chrome at 1440×900 and 390×844 verified ordered word delays, active intro/native/Lenis scroll lock, completed handoff, autoplay, nine cards in three desktop/two mobile columns, zero scroll animations on product grids, See more navigation, combined Ladies + Shirts filtering, client return skip and refresh replay. Reduced motion, Save-Data, blocked media and JavaScript-disabled readability passed. Desktop/mobile intro, home, Dress, story and clothing screenshots were inspected. Local evidence: workspace `.impeccable/review/intro/checks.json` and adjacent PNGs; runner: `.tmp-redesign/verify-intro.mjs`. Product imagery in this verification is an explicitly synthetic repeated campaign image, not a changed business catalog. The old Next fetch cache was preserved in `.tmp-redesign/fetch-cache-before-intro` before the fresh export. One initial build worker exit was transient; subsequent builds passed. No deployment or authenticated commerce revalidation. Do not deploy this synthetic `out/` build.

October 4, 2026 follow-up: replaced both renditions with fully covered knitwear footage, extended the loop from 12 to 20 seconds, and removed the pause and discovery overlays. TypeScript (without incremental output) and ESLint passed. Chrome confirmed desktop/mobile autoplay, end-of-film looping, hidden controls, correct rendition dimensions, reduced-motion fallback, and no horizontal overflow across home, shop, cart and account. Desktop/mobile homepage screenshots were visually inspected. This follow-up was verified locally; it has not been deployed.

October 4, 2026: frontend TypeScript and ESLint passed; production static export passed with 28 routes against the isolated synthetic catalog. Chrome checked homepage, shop, signed-out cart and account at 1440×900 and 390×844 with no horizontal overflow. Correct HD rendition, autoplay, pause/play, mobile account navigation, reduced motion, data-saving poster, failed-video poster, sorting, pagination, cached navigation and absence of per-card detail requests passed. Independent visual review found one film text contrast issue; localized scrims corrected it and the reviewer scored the fix resolved. Authenticated customer flows and production loading performance were not revalidated.

The existing local dev server initially blocked the `127.0.0.1` hot-reload origin. `allowedDevOrigins: ["127.0.0.1"]` fixes that development-only issue; real local homepage playback and Lenis initialization were then checked successfully.

The configured local API currently has an empty catalog, which cannot generate static category/product slug routes. Use a populated published catalog for a release build. Isolated synthetic catalog data is used only for build/browser verification and is never written to a database or committed as business data. Do not deploy the synthetic `out/` build.
