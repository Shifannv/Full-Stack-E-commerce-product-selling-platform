"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/catalog/price-display";
import { customerApi } from "@/lib/api";
import { useCustomerSession } from "@/lib/use-customer-session";
import type { PublicProductDetail } from "@/lib/public-catalog";

export function ProductActions({ product }: { product: PublicProductDetail }) {
  const router = useRouter();
  const { status } = useCustomerSession();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const variant = product.variants.find((item) => item.id === variantId);

  useEffect(() => {
    if (status !== "customer") return;
    let active = true;
    customerApi
      .wishlist()
      .then((result) => {
        if (active)
          setSaved(
            result.products.some((item) => item.productId === product.id),
          );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [product.id, status]);

  async function addToCart(goToCheckout: boolean) {
    if (status !== "customer") {
      setMessage("Sign in as a customer to add products to your cart.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.setCartItem(
        product.id,
        quantity,
        variantId || undefined,
      );
      if (goToCheckout) router.push("/checkout");
      else setMessage("Added to cart.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update cart.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleWishlist() {
    if (status !== "customer") {
      setMessage("Sign in as a customer to save this product.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.setWishlist(product.id, !saved);
      setSaved(!saved);
      setMessage(saved ? "Removed from wishlist." : "Saved to wishlist.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update wishlist.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-6">
      {product.variants.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">
            Choose a variant
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={item.id === variantId}
                onClick={() => setVariantId(item.id)}
                className="rounded-md border border-border px-4 py-2 text-sm aria-pressed:border-primary aria-pressed:bg-secondary"
              >
                {item.title}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <PriceDisplay
        amount={variant?.price ?? product.price}
        currency={product.currency}
        className="text-xl"
      />
      <p className="text-sm text-muted-foreground">
        {product.available ? "Available" : "Currently out of stock"}
      </p>
      <div>
        <label
          htmlFor="product-quantity"
          className="mb-2 block text-sm font-semibold"
        >
          Quantity
        </label>
        <input
          id="product-quantity"
          type="number"
          min="1"
          max="100"
          value={quantity}
          onChange={(event) =>
            setQuantity(
              Math.max(1, Math.min(100, Number(event.target.value) || 1)),
            )
          }
          className="h-10 w-24 rounded-md border border-input bg-background px-3"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !product.available}
          onClick={() => void addToCart(false)}
        >
          Add to cart
        </Button>
        <Button
          disabled={busy || !product.available}
          variant="outline"
          onClick={() => void addToCart(true)}
        >
          Buy now
        </Button>
        <Button
          disabled={busy}
          variant="ghost"
          size="icon"
          aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
          onClick={() => void toggleWishlist()}
        >
          <Heart aria-hidden="true" className={saved ? "fill-current" : ""} />
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
