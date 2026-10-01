"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { PriceDisplay } from "@/components/catalog/price-display";
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
      .then((result) => {
        if (active) setProducts(result.products);
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
        <div className="divide-y divide-border border-y border-border">
          {products.map((product) => (
            <div
              key={product.productId}
              className="flex flex-wrap items-center justify-between gap-4 py-5"
            >
              <div>
                <Link
                  href={`/products/${encodeURIComponent(product.slug)}`}
                  className="font-medium hover:underline"
                >
                  {product.name}
                </Link>
                <p className="mt-1">
                  <PriceDisplay
                    amount={product.price}
                    currency={product.currency}
                  />
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === product.productId}
                onClick={() => void remove(product.productId)}
              >
                Remove
              </Button>
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
      <h1 className="type-page mb-10">Wishlist</h1>
      <CustomerGate>
        <WishlistContent />
      </CustomerGate>
    </div>
  );
}
