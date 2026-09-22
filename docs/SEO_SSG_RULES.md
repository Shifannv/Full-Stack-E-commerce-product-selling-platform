# SEO + SSG Engineering Rules

## Goal

Public ecommerce pages must produce useful HTML before client-side JavaScript is required for the core content.

Google recommends putting Product structured data in the initial HTML for merchant/product experiences and warns that JavaScript-generated markup can be less reliable for fast-changing product price/availability. Product variant pages also need correct variant structure and crawlable URLs. 

## Indexable pages

```text
/
/products
/products/[slug]
/categories/[slug]
/collections/[slug]
/about
/faq
/terms
/privacy-policy
/shipping-policy
/return-policy
```

## Non-indexable pages

```text
/account/*
/cart
/checkout
/payment/*
/orders/*
/admin/*
/super-admin/*
```

## Metadata requirements

Every public page should define:

```text
<title>
meta description
canonical
Open Graph title/description/image
robots policy
```

Use page-specific metadata. Do not copy one generic title to every product page.

## Product page rules

Each product page must have:

1. Human-readable slug.
2. One canonical URL.
3. Product name in visible content.
4. Useful unique description.
5. Product image(s) with descriptive alt text.
6. Price and currency from build-time trusted data.
7. Availability from build-time trusted data.
8. Product JSON-LD in initial HTML.
9. Breadcrumb JSON-LD where applicable.
10. Internal links to category/collection/related products.
11. No accidental `noindex`.

JSON-LD concept:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "...",
  "image": ["..."],
  "description": "...",
  "sku": "...",
  "brand": {
    "@type": "Brand",
    "name": "..."
  },
  "offers": {
    "@type": "Offer",
    "url": "...",
    "priceCurrency": "INR",
    "price": "...",
    "availability": "https://schema.org/InStock"
  }
}
```

Use the actual product data. Never fabricate ratings or availability.

## Variant rules

For variant-heavy products such as clothing/electronics configurations:

- Use a stable parent product URL where appropriate.
- Give important variants crawlable URLs when the business model needs variant-level search visibility.
- Ensure the selected variant has matching image, price and availability.
- Use `ProductGroup`/variant structured data where the page architecture requires it.

## Sitemap

Generate a sitemap for:

- home
- product URLs
- category URLs
- collection URLs
- public CMS URLs

Do not put:

- cart
- checkout
- account pages
- orders
- admin
- super admin

in the sitemap.

## Robots

Default intent:

```text
Allow public storefront
Disallow private application areas
```

Verify actual URL rules after deployment.

## Build-time data flow

```text
Next.js build
  ↓
Fetch published catalog/CMS data from backend/database
  ↓
generateStaticParams / page generation
  ↓
HTML + metadata + JSON-LD
  ↓
out/
  ↓
Cloudflare Pages
```

## Rebuild strategy

Because pure SSG is build-time rendering:

```text
Catalog/CMS change
   ↓
Backend saves change
   ↓
Trigger Cloudflare Pages Deploy Hook
   ↓
Rebuild
   ↓
Updated HTML
```

Do not trigger a full SEO rebuild for every customer cart/order action.

## Live commerce safety

Even when HTML says:

```text
₹999
In Stock
```

checkout must call the backend again.

```text
Cart
 ↓
Backend re-fetches current product + stock
 ↓
Backend calculates final amount
 ↓
Coupon validation
 ↓
Order creation
 ↓
Cashfree
```

The browser never decides the payable amount.

## SEO validation checklist

Before production:

- View page source and confirm product content exists in HTML.
- Confirm JSON-LD exists in initial HTML.
- Run Google Rich Results Test.
- Use Search Console URL Inspection.
- Check canonical URL.
- Check robots.
- Check sitemap.
- Check broken links.
- Check mobile rendering.
- Check duplicate metadata.
- Check 404/redirect behavior.
- Check image alt text and image URLs.

## Sources

- Google product structured data: https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- Google merchant listings: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Google product variants: https://developers.google.com/search/docs/appearance/structured-data/product-variants
- Cloudflare static Next.js export: https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- Cloudflare Pages deploy hooks: https://developers.cloudflare.com/pages/configuration/deploy-hooks/
