import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/storefront/catalog-browser";
import { LoadingState } from "@/components/states/loading-state";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};
export default function SearchPage() {
  return (
    <div className="site-container section-space">
      <div className="mb-10">
        <h1 className="type-page">Search the collection</h1>
        <p className="mt-4 text-muted-foreground">
          Find products by name or description.
        </p>
      </div>
      <Suspense fallback={<LoadingState />}>
        <CatalogBrowser searchMode />
      </Suspense>
    </div>
  );
}
