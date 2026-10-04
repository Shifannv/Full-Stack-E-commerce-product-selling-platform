import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/storefront/catalog-browser";
import { PageHeading } from "@/components/storefront/page-heading";
import { LoadingState } from "@/components/states/loading-state";
import { catalogQuery, getPublicProducts } from "@/lib/public-catalog";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};
export default async function SearchPage() {
  const products = await getPublicProducts(catalogQuery({ limit: 12 }));
  return (
    <div className="site-container section-space">
      <PageHeading title="The collection" description="Find your everyday. Browse by name, price or the details that matter to you." action={{ href: "/clothing", label: "The Dress edit" }} />
      <Suspense fallback={<LoadingState />}>
        <CatalogBrowser searchMode initialProducts={products} />
      </Suspense>
    </div>
  );
}
