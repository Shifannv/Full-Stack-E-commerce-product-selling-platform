"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { ProductGrid } from "@/components/catalog/product-grid";
import type { ProductCardData } from "@/components/catalog/product-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { customerApi } from "@/lib/api";
import type { PublicSubcategory } from "@/lib/public-catalog";

const PAGE_SIZE = 12;

type FilterControlsProps = {
  minPrice: string;
  maxPrice: string;
  available: boolean;
  setAvailable: (value: boolean) => void;
  setMinPrice: (value: string) => void;
  setMaxPrice: (value: string) => void;
  apply: (updates: Record<string, string>) => void;
};

function FilterControls({ minPrice, maxPrice, available, setAvailable, setMinPrice, setMaxPrice, apply }: FilterControlsProps) {
  return (
    <form className="catalog-filter-form" onSubmit={(event) => { event.preventDefault(); apply({ minPrice, maxPrice, available: available ? "true" : "" }); }}>
      <div className="catalog-filter-section">
        <h3>Availability</h3>
        <label className="catalog-check">
          <input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />
          <span>In stock</span>
        </label>
      </div>
      <div className="catalog-filter-section">
        <h3>Price range</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Minimum<Input inputMode="decimal" type="number" min="0" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="₹0" /></label>
          <label className="text-xs text-muted-foreground">Maximum<Input inputMode="decimal" type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any" /></label>
        </div>
      </div>
      <Button type="submit" className="w-full">Apply filters</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => { setMinPrice(""); setMaxPrice(""); setAvailable(false); apply({ minPrice: "", maxPrice: "", available: "" }); }}>Clear filters</Button>
    </form>
  );
}

export function CatalogBrowser({
  categorySlug,
  subcategories = [],
  initialProducts = [],
  searchMode = false,
}: {
  categorySlug?: string;
  subcategories?: PublicSubcategory[];
  initialProducts?: ProductCardData[];
  searchMode?: boolean;
}) {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  return (
    <CatalogBrowserContent
      key={queryKey}
      queryKey={queryKey}
      categorySlug={categorySlug}
      subcategories={subcategories}
      initialProducts={initialProducts}
      searchMode={searchMode}
    />
  );
}

function CatalogBrowserContent({
  queryKey,
  categorySlug,
  subcategories,
  initialProducts,
  searchMode,
}: {
  queryKey: string;
  categorySlug?: string;
  subcategories: PublicSubcategory[];
  initialProducts: ProductCardData[];
  searchMode: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const catalog = useInfiniteQuery({
    queryKey: ["public-products", "browse", categorySlug ?? "all", queryKey],
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams(queryKey);
      if (categorySlug) query.set("category", categorySlug);
      query.set("limit", String(PAGE_SIZE));
      query.set("offset", String(pageParam));
      return (await customerApi.products(query, signal)).products;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.length === PAGE_SIZE ? pages.reduce((count, page) => count + page.length, 0) : undefined,
    initialData: !queryKey ? { pages: [initialProducts], pageParams: [0] } : undefined,
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
  });
  const products = catalog.data?.pages.flat() ?? [];
  const loading = catalog.isPending || catalog.isFetchingNextPage;
  const error = catalog.error?.message;
  const hasMore = catalog.hasNextPage;
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const [available, setAvailable] = useState(searchParams.get("available") === "true");

  const setQuery = (updates: Record<string, string>) => {
    const next = new URLSearchParams(queryKey);
    for (const [key, value] of Object.entries(updates))
      if (value.trim()) next.set(key, value.trim());
      else next.delete(key);
    router.push(`${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };

  const loadMore = () => void catalog.fetchNextPage();

  return (
    <div>
      {searchMode && (
        <form
          className="mb-8 flex max-w-2xl gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery({ q: searchText });
          }}
        >
          <label htmlFor="catalog-search" className="sr-only">
            Search products
          </label>
          <Input
            id="catalog-search"
            name="q"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search the collection"
            autoComplete="off"
          />
          <Button type="submit">
            <Search aria-hidden="true" className="size-4" /> Search
          </Button>
        </form>
      )}
      {subcategories.length > 0 && (
        <nav aria-label="Subcategories" className="mb-8 flex flex-wrap gap-2">
          <Button
            variant={!searchParams.get("subcategory") ? "default" : "outline"}
            size="sm"
            onClick={() => setQuery({ subcategory: "" })}
          >
            All
          </Button>
          {subcategories.map((item) => (
            <Button
              key={item.id}
              variant={
                searchParams.get("subcategory") === item.slug
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => setQuery({ subcategory: item.slug })}
            >
              {item.name}
            </Button>
          ))}
        </nav>
      )}
      <div className="catalog-toolbar">
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" className="lg:hidden"><SlidersHorizontal aria-hidden="true" /> Filters</Button></SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto bg-background" data-lenis-prevent>
            <SheetHeader><SheetTitle className="type-section">Refine the edit</SheetTitle><SheetDescription>Use the filters supported by the current catalog.</SheetDescription></SheetHeader>
            <div className="px-4"><FilterControls minPrice={minPrice} maxPrice={maxPrice} available={available} setAvailable={setAvailable} setMinPrice={setMinPrice} setMaxPrice={setMaxPrice} apply={setQuery} /></div>
            <SheetFooter><SheetClose asChild><Button variant="outline">View products</Button></SheetClose></SheetFooter>
          </SheetContent>
        </Sheet>
        <p className="text-sm text-muted-foreground">{products.length} {products.length === 1 ? "piece" : "pieces"}</p>
        <div className="ml-auto">
          <label
            htmlFor="catalog-sort"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Sort by
          </label>
          <select
            id="catalog-sort"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={searchParams.get("sort") ?? "newest"}
            onChange={(event) =>
              setQuery({
                sort: event.target.value === "newest" ? "" : event.target.value,
              })
            }
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-filter-sidebar" aria-label="Product filters">
          <div className="mb-6 flex items-center gap-2"><Filter aria-hidden="true" className="size-4" /><h2 className="font-semibold">Filter</h2></div>
          <FilterControls minPrice={minPrice} maxPrice={maxPrice} available={available} setAvailable={setAvailable} setMinPrice={setMinPrice} setMaxPrice={setMaxPrice} apply={setQuery} />
        </aside>
        <div className="min-w-0">
      {error && !products.length ? (
        <><ErrorState description={error} /><Button variant="outline" onClick={() => void catalog.refetch()}>Try again</Button></>
      ) : loading && !products.length ? (
        <LoadingState />
      ) : products.length ? (
        <ProductGrid products={products} eagerCount={2} />
      ) : (
        <EmptyState
          title={
            searchMode && !searchParams.get("q")
              ? "The collection is coming together"
              : "No products found"
          }
          description={
            searchMode && !searchParams.get("q")
              ? "Products will appear here when published."
              : "Try another search or adjust your price range."
          }
        />
      )}
      {error && products.length > 0 && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {hasMore && (
        <div className="mt-12 text-center">
          <Button variant="outline" disabled={loading} onClick={loadMore}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
