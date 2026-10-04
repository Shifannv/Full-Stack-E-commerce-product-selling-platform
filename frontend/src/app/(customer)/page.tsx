import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { CampaignHero } from "@/components/storefront/campaign-hero";
import { HomeProductEdit } from "@/components/storefront/home-product-edit";
import { ScrollReveal } from "@/components/storefront/scroll-reveal";
import { clothingCategory } from "@/lib/clothing";
import { catalogQuery, getPublicCategories, getPublicProducts } from "@/lib/public-catalog";

export const metadata: Metadata = {
  title: "Ownline Dropship",
  description: "Considered finds for the everyday. Explore the latest Ownline collection.",
  alternates: { canonical: "/" },
};

export default async function CustomerHomePage() {
  const categories = await getPublicCategories();
  const sections = await Promise.all(categories.map(async category => ({ category,
    products: await getPublicProducts(catalogQuery({ category: category.slug, limit: 9 })),
  })));
  const dressCategories = categories.filter(clothingCategory);
  const clothing = sections.filter(({ category }) => clothingCategory(category)).flatMap(({ products }) => products)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 9);
  const otherSections = sections.filter(({ category }) => !clothingCategory(category));
  return <>
    <CampaignHero />
    <div className="collection-ribbon"><span>Considered finds for the everyday</span><span aria-hidden="true">Discover your Ownline</span><span aria-hidden="true">Considered finds for the everyday</span></div>
    <section id="selected-edit" className="site-container section-space collection-section" aria-labelledby="dress-heading">
      <ScrollReveal><div className="collection-heading"><h2 id="dress-heading" className="type-section">The Dress edit</h2><Link href="/clothing">Explore all clothing <ArrowRight aria-hidden="true" size={17} /></Link></div></ScrollReveal>
      <HomeProductEdit initialProducts={clothing} categorySlugs={dressCategories.map(category => category.slug)} clothing />
      <ScrollReveal className="collection-more"><Link href="/clothing" className="editorial-link">See more Dress <ArrowUpRight aria-hidden="true" size={18} /></Link></ScrollReveal>
    </section>
    <section className="collection-story" aria-labelledby="story-heading">
      <ScrollReveal image className="story-image"><Image src="/images/ownline-editorial.webp" alt="Relaxed clothing and natural textures in the Ownline campaign" fill sizes="(max-width: 767px) 100vw, 50vw" className="object-cover" /></ScrollReveal>
      <ScrollReveal className="story-copy"><h2 id="story-heading" className="type-page">Small details.<br /><em>Everyday feeling.</em></h2><p>Pieces to wear. Things to carry. Finds to make your own. Explore the collection and find what feels like you.</p><Link href="/search" className="editorial-link">Find your everyday <ArrowUpRight aria-hidden="true" size={18} /></Link></ScrollReveal>
    </section>
    {otherSections.length ? otherSections.map(({ category, products }) => <section key={category.id} className="site-container section-space collection-section catalog-category-section" aria-labelledby={`category-${category.slug}`}>
      <ScrollReveal><div className="collection-heading"><h2 id={`category-${category.slug}`} className="type-section">{category.name}</h2><Link href={`/categories/${encodeURIComponent(category.slug)}`}>Explore {category.name.toLowerCase()} <ArrowRight aria-hidden="true" size={17} /></Link></div></ScrollReveal>
      <HomeProductEdit initialProducts={products} categorySlugs={[category.slug]} />
      <ScrollReveal className="collection-more"><Link href={`/categories/${encodeURIComponent(category.slug)}`} className="editorial-link">See more <ArrowUpRight aria-hidden="true" size={18} /></Link></ScrollReveal>
    </section>) : <section className="site-container section-space collection-section"><ScrollReveal><div className="collection-heading"><h2 className="type-section">More everyday finds</h2><Link href="/search">Explore all products <ArrowRight aria-hidden="true" size={17} /></Link></div></ScrollReveal><p className="text-sm text-muted-foreground">More products will appear here when published.</p></section>}
    <section className="category-index" aria-labelledby="category-heading">
      <div className="site-container category-layout"><ScrollReveal><h2 id="category-heading" className="type-page">Find your<br /><em>own way.</em></h2><p>Explore the current collection by category.</p></ScrollReveal><nav aria-label="Shop by category">{categories.length ? categories.map(category => <ScrollReveal key={category.id}><Link href={`/categories/${encodeURIComponent(category.slug)}`}><span>{category.name}</span><ArrowUpRight aria-hidden="true" size={24} /></Link></ScrollReveal>) : <ScrollReveal><Link href="/search"><span>Explore all products</span><ArrowUpRight aria-hidden="true" size={24} /></Link></ScrollReveal>}</nav></div>
    </section>
    <section className="site-container"><ScrollReveal className="store-closing"><h2 className="type-section">Good things are worth finding.</h2><Link href="/wishlist">Keep your favourites close <ArrowUpRight aria-hidden="true" size={18} /></Link></ScrollReveal></section>
  </>;
}
