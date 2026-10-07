import Link from "next/link";
import { publicImageUrl } from "@/lib/images";
import { CatalogImage } from "@/components/storefront/catalog-image";
import { PriceDisplay } from "./price-display";
import { RatingDisplay } from "./rating-display";
import { WishlistButton } from "./wishlist-button";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price: string;
  currency?: string;
  category?: string;
  featured?: boolean;
  image?: { objectKey: string; altText?: string | null } | null;
  secondImage?: { objectKey: string; altText?: string | null } | null;
  available?: boolean;
  rating?: number | null;
  reviewCount?: number;
};

export function ProductCard({ product, showWishlist = true, eager = false }: { product: ProductCardData; showWishlist?: boolean; eager?: boolean }) {
  const imageUrl = publicImageUrl(product.image?.objectKey);
  const secondImageUrl = publicImageUrl(product.secondImage?.objectKey);
  return (
    <article className="group relative min-w-0">
      <Link
        href={`/products/${encodeURIComponent(product.slug)}`}
        className="block focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="product-image relative aspect-[4/5] overflow-hidden bg-secondary">
          <CatalogImage src={imageUrl} alt={product.image?.altText || product.name} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" priority={eager} className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]" />
          {secondImageUrl && (
            <CatalogImage src={secondImageUrl} alt={product.secondImage?.altText || product.name} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" fallback="none" className="product-image-secondary object-cover" />
          )}
          {product.featured && (
            <span className="absolute left-3 top-3 bg-background px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]">Featured</span>
          )}
          {product.available === false && (
            <span className="absolute bottom-3 right-3 bg-background px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]">Sold out</span>
          )}
        </div>
        <div className="pt-3.5">
          {product.category && (
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {product.category}
            </p>
          )}
          <h3 className="mt-1 text-sm font-medium leading-snug sm:text-base">
            {product.name}
          </h3>
          {product.rating !== null && product.rating !== undefined && (
            <div className="mt-2">
              <RatingDisplay
                rating={product.rating}
                count={product.reviewCount}
              />
            </div>
          )}
          <p className="mt-1.5">
            <PriceDisplay amount={product.price} currency={product.currency} />
          </p>
        </div>
      </Link>
      {showWishlist && <WishlistButton productId={product.id} productName={product.name} />}
    </article>
  );
}
