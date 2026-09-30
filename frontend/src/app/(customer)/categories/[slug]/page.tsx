import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/storefront/catalog-browser";
import { LoadingState } from "@/components/states/loading-state";
import { catalogQuery, getPublicCategories, getPublicProducts, withFirstImage } from "@/lib/public-catalog";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;

export async function generateStaticParams() { return (await getPublicCategories()).map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getPublicCategories()).find((item) => item.slug === slug);
  if (!category) return { title: "Category unavailable", robots: { index: false } };
  return { title: category.name, description: category.description ?? `Explore ${category.name} at Ownline Dropship.`, alternates: { canonical: `/categories/${encodeURIComponent(slug)}` } };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = (await getPublicCategories()).find((item) => item.slug === slug);
  if (!category) notFound();
  const initialProducts = await withFirstImage(await getPublicProducts(catalogQuery({ category: slug, limit: 12 })));
  return <div className="site-container section-space"><div className="mb-12 max-w-3xl"><p className="type-meta mb-4 text-primary">Collection</p><h1 className="type-page">{category.name}</h1>{category.description && <p className="mt-5 text-lg text-muted-foreground">{category.description}</p>}</div><Suspense fallback={<LoadingState />}><CatalogBrowser categorySlug={slug} subcategories={category.subcategories} initialProducts={initialProducts} /></Suspense></div>;
}
