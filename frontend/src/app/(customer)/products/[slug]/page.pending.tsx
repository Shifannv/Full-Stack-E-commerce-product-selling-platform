// Activate as page.tsx when the build catalog has at least one real published product slug.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RatingDisplay } from "@/components/catalog/rating-display";
import { ProductActions } from "@/components/storefront/product-actions";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { getPublicProduct, getPublicReviews, getPublishedProductSlugs } from "@/lib/public-catalog";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export async function generateStaticParams() { return getPublishedProductSlugs(); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try { const product = await getPublicProduct(slug); return { title: product.name, description: product.description?.slice(0, 160) ?? `Explore ${product.name} at Ownline Dropship.`, alternates: { canonical: `/products/${encodeURIComponent(slug)}` } }; }
  catch { return { title: "Product unavailable", robots: { index: false } }; }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getPublicProduct(slug).catch(() => notFound());
  const reviews = await getPublicReviews(product.id);
  return <div className="site-container section-space">
    <div className="grid gap-10 md:grid-cols-2 md:gap-16"><ProductGallery images={product.images} name={product.name} /><div><h1 className="type-page">{product.name}</h1><div className="mt-5"><RatingDisplay rating={product.rating} count={product.reviewCount} /></div><ProductActions product={product} /><div className="mt-10 space-y-4 border-t border-border pt-8 text-sm text-muted-foreground"><p>{product.returnEnabled ? "This product may be eligible for a return under the published policy." : "Returns are not enabled for this product."}</p><p>Shipping availability and timing are confirmed by the store during fulfillment.</p></div></div></div>
    {product.description && <section className="mt-20 border-t border-border pt-12"><h2 className="type-section">About this product</h2><p className="mt-5 max-w-3xl whitespace-pre-line text-muted-foreground">{product.description}</p></section>}
    {Object.keys(product.attributes).length > 0 && <section className="mt-16"><h2 className="type-section">Details</h2><dl className="mt-6 grid max-w-2xl gap-4">{Object.entries(product.attributes).map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-4 border-b border-border pb-3"><dt className="capitalize text-muted-foreground">{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl></section>}
    <section className="mt-20 border-t border-border pt-12"><h2 className="type-section">Customer reviews</h2>{reviews.length ? <div className="mt-8 grid gap-5 md:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-lg border border-border bg-card p-6"><RatingDisplay rating={review.rating} /><h3 className="mt-3 font-semibold">{review.title}</h3><p className="mt-2 text-sm text-muted-foreground">{review.body}</p></article>)}</div> : <p className="mt-5 text-muted-foreground">No published reviews yet.</p>}</section>
  </div>;
}
