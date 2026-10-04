"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { customerApi } from "@/lib/api";
import type { Product } from "@/lib/api/types";
import { matchesClothing } from "@/lib/clothing";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";

type Batch = { slug: string; products: Product[] };
const audiences = [["all", "Everyone"], ["gents", "Gents"], ["ladies", "Ladies"]];
const kinds = [["all", "All clothing"], ["shirt", "Shirts"], ["pant", "Pants"], ["t-shirt", "T-shirts"]];

export function ClothingBrowser({ categorySlugs, initialBatches }: { categorySlugs: string[]; initialBatches: Batch[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const audience = params.get("audience") ?? "all";
  const kind = params.get("type") ?? "all";
  const catalog = useInfiniteQuery({
    queryKey: ["public-products", "clothing", categorySlugs],
    queryFn: async ({ pageParam, signal }): Promise<Batch[]> => Promise.all(pageParam.slugs.map(async slug => ({ slug,
      products: (await customerApi.products(new URLSearchParams({ category: slug, limit: "50", offset: String(pageParam.offset) }), signal)).products,
    }))),
    initialPageParam: { offset: 0, slugs: categorySlugs },
    initialData: { pages: [initialBatches], pageParams: [{ offset: 0, slugs: categorySlugs }] },
    initialDataUpdatedAt: 0,
    getNextPageParam: (last, pages) => {
      const slugs = last.filter(batch => batch.products.length === 50).map(batch => batch.slug);
      return slugs.length ? { offset: pages.length * 50, slugs } : undefined;
    },
    refetchInterval: 60_000,
  });
  const all = [...new Map(catalog.data.pages.flatMap(page => page.flatMap(batch => batch.products)).map(product => [product.id, product])).values()];
  const products = all.filter(product => matchesClothing(product, audience, kind)).sort((a, b) => {
    if (params.get("sort") === "price-asc") return Number(a.price) - Number(b.price);
    if (params.get("sort") === "price-desc") return Number(b.price) - Number(a.price);
    return b.createdAt.localeCompare(a.createdAt);
  });
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "all" || value === "newest") next.delete(key); else next.set(key, value);
    router.replace(`/clothing${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return <div aria-busy={catalog.isFetching}>
    <div className="clothing-filters">
      <div role="group" aria-label="Shop by audience">{audiences.map(([value, label]) => <button key={value} aria-pressed={audience === value} onClick={() => filter("audience", value)}>{label}</button>)}</div>
      <div role="group" aria-label="Clothing type">{kinds.map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => filter("type", value)}>{label}</button>)}</div>
      <label>Sort by <select value={params.get("sort") ?? "newest"} onChange={event => filter("sort", event.target.value)}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
    </div>
    <p className="clothing-count" role="status">{products.length} {products.length === 1 ? "piece" : "pieces"}{catalog.hasNextPage ? " loaded" : ""}</p>
    {products.length ? <ProductGrid products={products} eagerCount={2} threeColumns /> : <div className="clothing-empty"><h2 className="type-section">{all.length ? "No matching pieces yet" : "The clothing collection is coming together"}</h2><p>{all.length ? "Try Everyone or another clothing type." : "Published clothing will appear here."}</p>{all.length > 0 && <Button variant="outline" onClick={() => router.replace("/clothing", { scroll: false })}>Clear filters</Button>}</div>}
    {catalog.isError && <p role="alert" className="mt-6 text-sm">We couldn’t refresh the collection. <button className="underline" onClick={() => void catalog.refetch()}>Try again</button></p>}
    {catalog.hasNextPage && <div className="collection-more"><Button variant="outline" disabled={catalog.isFetching} onClick={() => void catalog.fetchNextPage()}>{catalog.isFetchingNextPage ? "Loading…" : "Load more clothing"}</Button></div>}
  </div>;
}
