"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search } from "lucide-react";
import { ProductGrid } from "@/components/catalog/product-grid";
import type { ProductCardData } from "@/components/catalog/product-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerApi } from "@/lib/api";
import type { PublicSubcategory } from "@/lib/public-catalog";

const PAGE_SIZE = 12;

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
      <form
        className="mb-9 flex flex-wrap items-end gap-3 border-y border-border py-5"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery({ minPrice, maxPrice });
        }}
      >
        <Filter
          aria-hidden="true"
          className="mb-2 hidden size-4 text-muted-foreground sm:block"
        />
        <div>
          <label
            htmlFor="min-price"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Minimum price (₹)
          </label>
          <Input
            id="min-price"
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="w-32"
          />
        </div>
        <div>
          <label
            htmlFor="max-price"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Maximum price (₹)
          </label>
          <Input
            id="max-price"
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="w-32"
          />
        </div>
        <Button type="submit" variant="outline">
          Apply price
        </Button>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <input
            type="checkbox"
            checked={searchParams.get("available") === "true"}
            onChange={(event) =>
              setQuery({ available: event.target.checked ? "true" : "" })
            }
          />{" "}
          In stock
        </label>
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
      </form>
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
  );
}
