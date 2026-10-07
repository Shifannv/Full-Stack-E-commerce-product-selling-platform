"use client";

import { useEffect, useState } from "react";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { PageHeading } from "@/components/storefront/page-heading";
import { ProductCard } from "@/components/catalog/product-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { customerApi } from "@/lib/api";

type SavedProduct = {
  productId: string;
  name: string;
  slug: string;
  price: string;
  currency: string;
  image?: { objectKey: string; altText: string | null } | null;
  secondImage?: { objectKey: string; altText: string | null } | null;
  available?: boolean;
  firstAvailableVariantId?: string;
};

function WishlistContent() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    customerApi
      .wishlist()
      .then(async (result) => {
        const enriched = await Promise.all(result.products.map(async (item) => {
          try {
            const detail = await customerApi.product(item.slug);
            return { ...item, image: detail.images[0] ?? null, secondImage: detail.images[1] ?? null, available: detail.available, firstAvailableVariantId: detail.variants.find((variant) => variant.available)?.id };
          } catch {
            return item;
          }
        }));
        if (active) setProducts(enriched);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Wishlist unavailable",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function remove(productId: string) {
    setBusyId(productId);
    setError(null);
    try {
      await customerApi.setWishlist(productId, false);
      setProducts((current) =>
        current.filter((item) => item.productId !== productId),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove product",
      );
    } finally {
      setBusyId(null);
    }
  }
  async function addToCart(product: SavedProduct) {
    setBusyId(product.productId);
    setError(null);
    try {
      await customerApi.setCartItem(product.productId, 1, product.firstAvailableVariantId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add product to cart");
    } finally {
      setBusyId(null);
    }
  }
  if (loading) return <LoadingState label="Loading wishlist" />;
  if (error && !products.length) return <ErrorState description={error} />;
  return (
    <>
      {error && (
        <p role="alert" className="mb-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {products.length ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8">
          {products.map((product) => (
            <div
              key={product.productId}
              className="min-w-0"
            >
              <ProductCard showWishlist={false} product={{ id: product.productId, slug: product.slug, name: product.name, price: product.price, currency: product.currency, image: product.image, secondImage: product.secondImage, available: product.available }} />
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" size="sm" disabled={busyId === product.productId || product.available === false} onClick={() => void addToCart(product)}>Add to cart</Button>
                <Button variant="ghost" size="sm" disabled={busyId === product.productId} onClick={() => void remove(product.productId)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Your wishlist is empty"
          description="Save products you want to revisit."
          action={{ label: "Explore products", href: "/search" }}
        />
      )}
    </>
  );
}

export default function WishlistPage() {
  return (
    <div className="site-container section-space">
      <PageHeading title="Your favourites" description="Keep the pieces that caught your eye, ready for another look." action={{ href: "/search", label: "Find something new" }} />
      <CustomerGate>
        <WishlistContent />
      </CustomerGate>
    </div>
  );
}
