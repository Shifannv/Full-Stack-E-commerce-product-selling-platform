"use client";

import { useQuery } from "@tanstack/react-query";
import { ProductGrid } from "@/components/catalog/product-grid";
import type { ProductCardData } from "@/components/catalog/product-card";
import { customerApi } from "@/lib/api";

export function HomeProductEdit({ initialProducts, categorySlugs, clothing = false }: { initialProducts: ProductCardData[]; categorySlugs: string[]; clothing?: boolean }) {
  const query = useQuery({
    queryKey: ["public-products", "home", categorySlugs, clothing],
    queryFn: async ({ signal }) => {
      const results = await Promise.all(categorySlugs.map(async category =>
        (await customerApi.products(new URLSearchParams({ category, limit: "9" }), signal)).products));
      return results.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 9);
    },
    initialData: initialProducts,
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
  });
  return <div aria-busy={query.isFetching}>
    {query.data.length ? <ProductGrid products={query.data.slice(0, 9)} eagerCount={2} threeColumns /> : <p className="py-10 text-sm text-muted-foreground">{clothing ? "Clothing will appear here when published." : "Products will appear here as the collection grows."}</p>}
    {query.isError && <p role="status" className="mt-4 text-sm text-muted-foreground">Live availability could not be refreshed. <button className="underline" onClick={() => void query.refetch()}>Try again</button></p>}
  </div>;
}
