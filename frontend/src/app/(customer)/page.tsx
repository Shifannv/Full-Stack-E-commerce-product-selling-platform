import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CategoryCard } from "@/components/catalog/category-card";
import { ProductGrid } from "@/components/catalog/product-grid";
import { SectionHeading } from "@/components/catalog/section-heading";
import { EmptyState } from "@/components/states/empty-state";
import {
  catalogQuery,
  getPublicCategories,
  getPublicProducts,
  withFirstImage,
} from "@/lib/public-catalog";

export const metadata: Metadata = {
  title: "Ownline Dropship",
  alternates: { canonical: "/" },
};

export default async function CustomerHomePage() {
  const [categories, featuredRows, newestRows] = await Promise.all([
    getPublicCategories(),
    getPublicProducts(catalogQuery({ featured: true, limit: 8 })),
    getPublicProducts(catalogQuery({ limit: 8 })),
  ]);
  const [featured, newest] = await Promise.all([
    withFirstImage(featuredRows),
    withFirstImage(newestRows),
  ]);

  return (
    <>
      <section className="border-b border-border bg-secondary">
        <div className="site-container grid min-h-[35rem] gap-12 py-16 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.6fr)] md:items-end md:py-24">
          <div>
            <h1 className="type-display max-w-[10ch]">
              A closer look at everyday finds.
            </h1>
            <p className="mt-8 max-w-lg text-lg text-muted-foreground">
              Discover the Ownline Dropship collection, one good find at a time.
            </p>
            <Link
              href="/search"
              className="mt-10 inline-flex items-center gap-3 border-b border-foreground pb-2 text-sm font-semibold hover:gap-4"
            >
              Explore the collection{" "}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="flex items-end justify-between border-t border-foreground/25 pt-4 text-sm text-muted-foreground md:border-t-0 md:border-l md:pl-8">
            <span>
              Browse by category
              <br />
              or discover what is new.
            </span>
            <ArrowDownRight
              aria-hidden="true"
              className="size-8 text-foreground"
            />
          </div>
        </div>
      </section>
      <section
        className="site-container section-space"
        aria-labelledby="category-heading"
      >
        <div id="category-heading">
          <SectionHeading
            title="Explore by category"
            description="Find your way through the current collection."
          />
        </div>
        {categories.length ? (
          <div className="-mx-1 flex snap-x gap-5 overflow-x-auto px-1 pb-4 sm:gap-7">
            {categories.map((category) => (
              <div
                key={category.id}
                className="w-[min(78vw,23rem)] shrink-0 snap-start"
              >
                <CategoryCard category={category} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Categories are on their way"
            description="The collection will appear here as soon as products are published."
          />
        )}
      </section>
      <section className="border-y border-border bg-card/70">
        <div className="site-container section-space">
          <SectionHeading
            title="Featured pieces"
            description="Selected products from the published collection."
            href="/search"
            linkLabel="Browse all"
          />
          {featured.length ? (
            <ProductGrid products={featured} />
          ) : (
            <EmptyState
              title="No featured pieces yet"
              description="There are no featured products in the published catalog right now."
            />
          )}
        </div>
      </section>
      <section className="site-container section-space">
        <SectionHeading
          title="Just arrived"
          description="The newest products in the published collection."
          href="/search"
          linkLabel="View collection"
        />
        {newest.length ? (
          <ProductGrid products={newest} />
        ) : (
          <EmptyState
            title="The collection is coming together"
            description="New arrivals will appear when products are published."
          />
        )}
      </section>
      <section className="border-t border-border bg-primary text-primary-foreground">
        <div className="site-container grid gap-8 py-16 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="type-section max-w-xl">
              Find what belongs in your day.
            </h2>
            <p className="mt-4 max-w-md text-primary-foreground/80">
              Browse the collection and save the products you want to come back
              to.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-3 self-start border-b border-primary-foreground pb-2 text-sm font-semibold"
          >
            Explore products{" "}
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
