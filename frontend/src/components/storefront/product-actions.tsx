"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/catalog/price-display";
import { customerApi } from "@/lib/api";
import { useCustomerSession } from "@/lib/use-customer-session";
import type { PublicProductDetail } from "@/lib/public-catalog";

export function ProductActions({ product }: { product: PublicProductDetail }) {
  const router = useRouter();
  const { status } = useCustomerSession();
  const [variantId, setVariantId] = useState(
    product.variants.find((item) => item.available)?.id ??
      product.variants[0]?.id ??
      "",
  );
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const variant = product.variants.find((item) => item.id === variantId);
  const isAvailable = variant !== undefined ? variant.available : product.available;

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
    <div className="product-purchase mt-7 space-y-7">
      <div className="flex items-center justify-between gap-4 border-y border-border py-5">
        <PriceDisplay amount={variant?.price ?? product.price} currency={product.currency} className="text-xl" />
        <p className="text-sm text-muted-foreground">{isAvailable ? "In stock" : "Out of stock"}</p>
      </div>
      {product.variants.length > 0 && (
        <fieldset>
          <legend className="mb-3 flex w-full items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.12em]">
            <span>Choose an option</span>
            {variant && <span className="normal-case tracking-normal text-muted-foreground">{variant.title}</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={item.id === variantId}
                disabled={!item.available}
                onClick={() => setVariantId(item.id)}
                className="min-h-11 min-w-12 border border-border px-4 py-2.5 text-sm transition-colors aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span>{item.title}</span>
                {!item.available && (
                  <span className="ml-2 text-xs">Out of stock</span>
                )}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label
          htmlFor="product-quantity"
          className="mb-2 block text-sm font-semibold"
        >
          Quantity
        </label>
        <div className="quantity-stepper">
          <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
            <Minus aria-hidden="true" />
          </button>
          <input
            id="product-quantity"
            type="number"
            min="1"
            max="100"
            value={quantity}
            aria-label="Product quantity"
            onChange={(event) =>
              setQuantity(
                Math.max(1, Math.min(100, Number(event.target.value) || 1)),
              )
            }
          />
          <button type="button" aria-label="Increase quantity" disabled={quantity >= 100} onClick={() => setQuantity((value) => Math.min(100, value + 1))}>
            <Plus aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button
          className="col-start-1 row-start-1 w-full"
          disabled={busy || !isAvailable}
          onClick={() => void addToCart(false)}
        >
          Add to cart
        </Button>
        <Button
          className="col-span-2 w-full"
          disabled={busy || !isAvailable}
          variant="outline"
          onClick={() => void addToCart(true)}
        >
          Buy now
        </Button>
        <Button
          className="col-start-2 row-start-1"
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
