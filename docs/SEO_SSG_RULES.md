# SEO and Static Export Rules

## 1. SEO goal

Customer public pages should produce real crawlable HTML for:

```text
Home
Main category pages
Subcategory pages
Product pages
Useful public content pages
```

## 2. No Collections for SEO

Do not generate:

```text
/collections/[slug]
```

SEO structure is:

```text
/category/[slug]
/category/[categorySlug]/[subcategorySlug]
/product/[slug]
```

Exact route naming may differ in implementation, but the content model is fixed.

## 3. Product page requirements

Each public product page should have:

- unique title
- meta description
- canonical URL
- Open Graph metadata
- indexability rules
- Product structured data when eligible
- stable product slug
- product image with useful alt text
- current price/availability
- breadcrumb structure where useful

## 4. Static export

Current target:

```text
next build
↓
out/
↓
Cloudflare Pages
```

Cloudflare's current Pages guide uses `npx next build` and `out` for Next.js Static HTML Export.

## 5. Dynamic data warning

Static HTML is a snapshot created during a build.

It is not the financial source of truth.

```text
SEO HTML
= presentation/discovery

Worker API + Aiven DB
= authoritative current state
```

## 6. Product price change

When the Admin changes a current product price:

```text
Aiven products.price changes
↓
New checkout uses new price
↓
Existing orders stay unchanged
```

SEO HTML may continue showing the old price until the next rebuild.

Therefore, the checkout API must always query the current authoritative price.

## 7. Rebuild strategy

For the current Pages architecture, public catalog/content changes should be able to trigger a new Pages deployment through a controlled deploy hook.

Potential triggers:

- product published/updated
- product deactivated
- category updated
- subcategory updated
- public CMS/banner change

Do not trigger a build for every internal activity. Debounce/aggregate changes when appropriate.

## 8. Large-catalog guardrail

Pure SSG means product pages must be generated at build time.

Do not use an unlimited catalog build strategy without checking build time.

If the catalog becomes large enough that builds become slow/unreliable, migrate the public site to Cloudflare Workers/Next.js ISR instead of building a custom ad-hoc cache system.

## 9. Client-only data

Personal data must not be baked into public HTML:

- cart
- account information
- orders
- private notifications
- payout data
- customer-specific offers

These use API calls after authentication.

## 10. SEO safety checklist

Before release:

```text
[ ] HTML contains meaningful content without JS-only rendering
[ ] title is unique
[ ] description is unique
[ ] canonical is correct
[ ] robots rules are correct
[ ] sitemap contains only intended public URLs
[ ] product structured data is valid
[ ] category/subcategory pages are indexable when intended
[ ] admin pages are not indexable
[ ] account/order pages are not indexable
[ ] no collection routes exist
[ ] no accidental duplicate slugs
```


## 11. Cache and SSG relationship

SSG, Cloudflare edge cache, Redis, and PostgreSQL have different responsibilities:

```text
Aiven PostgreSQL
= authoritative current catalog data

SSG HTML
= build-time SEO snapshot

Cloudflare cache
= public response/asset acceleration

Redis
= optional server-side derived/hot cache
```

Do not use a cached page to decide the amount to charge.

When a public product/category/subcategory changes:

```text
DB write
→ invalidate affected Redis keys (if used)
→ purge/revalidate public Cloudflare cache entries
→ trigger/batch Pages rebuild when SSG HTML must change
```

A product price can therefore change in PostgreSQL immediately while an old static HTML copy exists briefly until the next rebuild. The checkout API must always read and validate the current database price.
