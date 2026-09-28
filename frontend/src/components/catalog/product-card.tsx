import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { publicImageUrl } from "@/lib/images";
import { PriceDisplay } from "./price-display";
import { RatingDisplay } from "./rating-display";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price: string;
  currency?: string;
  category?: string;
  featured?: boolean;
  image?: { objectKey: string; altText?: string | null } | null;
  available?: boolean;
  rating?: number | null;
  reviewCount?: number;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const imageUrl = publicImageUrl(product.image?.objectKey);
  return <article className="group min-w-0">
    <Link href={`/products/${encodeURIComponent(product.slug)}`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-secondary">
        {imageUrl ? <Image src={imageUrl} alt={product.image?.altText || product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.025]" /> : <span className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">Image coming soon</span>}
        {product.featured && <Badge className="absolute top-3 left-3">Featured</Badge>}
        {product.available === false && <Badge variant="secondary" className="absolute right-3 bottom-3">Out of stock</Badge>}
      </div>
      <div className="pt-4">
        {product.category && <p className="type-meta text-muted-foreground">{product.category}</p>}
        <h3 className="mt-1 text-base font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{product.name}</h3>
        {product.rating !== null && product.rating !== undefined && <div className="mt-2"><RatingDisplay rating={product.rating} count={product.reviewCount} /></div>}
        <p className="mt-2"><PriceDisplay amount={product.price} currency={product.currency} /></p>
      </div>
    </Link>
  </article>;
}
