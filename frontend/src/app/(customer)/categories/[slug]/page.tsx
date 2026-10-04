import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/storefront/catalog-browser";
import { PageHeading } from "@/components/storefront/page-heading";
import { LoadingState } from "@/components/states/loading-state";
import {
  catalogQuery,
  getPublicCategories,
  getPublicProducts,
  withFirstImage,
} from "@/lib/public-catalog";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getPublicCategories()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getPublicCategories()).find(
    (item) => item.slug === slug,
  );
  if (!category)
    return { title: "Category unavailable", robots: { index: false } };
  return {
    title: category.name,
    description:
      category.description ?? `Explore ${category.name} at Ownline Dropship.`,
    alternates: { canonical: `/categories/${encodeURIComponent(slug)}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = (await getPublicCategories()).find(
    (item) => item.slug === slug,
  );
  if (!category) notFound();
  const initialProducts = await withFirstImage(
    await getPublicProducts(catalogQuery({ category: slug, limit: 12 })),
  );
  return (
    <div className="site-container section-space">
      <PageHeading title={category.name} description={category.description ?? `Explore ${category.name.toLowerCase()} and find what feels like you.`} action={{ href: "/search", label: "All collections" }} />
      <Suspense fallback={<LoadingState />}>
        <CatalogBrowser
          categorySlug={slug}
          subcategories={category.subcategories}
          initialProducts={initialProducts}
        />
      </Suspense>
    </div>
  );
}
