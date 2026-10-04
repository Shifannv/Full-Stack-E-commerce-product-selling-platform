import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ScrollReveal } from "@/components/storefront/scroll-reveal";
import { ClothingBrowser } from "@/components/storefront/clothing-browser";
import { clothingCategory } from "@/lib/clothing";
import { catalogQuery, getPublicCategories, getPublicProducts } from "@/lib/public-catalog";

export const metadata: Metadata = { title: "Clothing", description: "Explore the Ownline clothing collection: shirts, pants and T-shirts.", alternates: { canonical: "/clothing" } };

export default async function ClothingPage() {
  const allCategories = await getPublicCategories();
  const categories = allCategories.filter(clothingCategory);
  const batches = await Promise.all(categories.map(async category => ({ slug: category.slug,
    products: await getPublicProducts(catalogQuery({ category: category.slug, limit: 50 })),
  })));
  return <div className="site-container section-space">
    <div className="clothing-page-heading"><h1 className="type-page">Clothing,<br /><em>your way.</em></h1><p>Find your everyday fit. Explore shirts, pants and T-shirts for gents and ladies.</p></div>
    <Suspense fallback={<p>Loading the clothing collection…</p>}><ClothingBrowser categorySlugs={categories.map(category => category.slug)} initialBatches={batches} /></Suspense>
    <nav aria-label="Explore other collections" className="clothing-other-collections">
      {allCategories.filter(category => !clothingCategory(category)).map(category => <ScrollReveal key={category.id}><Link href={`/categories/${encodeURIComponent(category.slug)}`} className="editorial-link">Explore {category.name} <ArrowUpRight aria-hidden="true" size={18} /></Link></ScrollReveal>)}
    </nav>
  </div>;
}
