"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { PriceDisplay } from "@/components/catalog/price-display";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { PageHeading } from "@/components/storefront/page-heading";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { customerApi, type Cart } from "@/lib/api";
import { publicImageUrl } from "@/lib/images";

type CartProductMeta = Record<string, { imageUrl: string | null; altText: string; available: boolean }>;

async function loadCartView(): Promise<{ cart: Cart; meta: CartProductMeta }> {
  const cart = await customerApi.cart();
  const entries = await Promise.all(cart.items.map(async (item) => {
    try {
      const product = await customerApi.product(item.slug);
      return [item.productId, { imageUrl: publicImageUrl(product.images[0]?.objectKey), altText: product.images[0]?.altText || item.name, available: product.available }] as const;
    } catch {
      return [item.productId, { imageUrl: null, altText: item.name, available: true }] as const;
    }
  }));
  return { cart, meta: Object.fromEntries(entries) };
}

function CartContent() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [productMeta, setProductMeta] = useState<CartProductMeta>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadCartView()
      .then((result) => {
        if (active) { setCart(result.cart); setProductMeta(result.meta); }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Cart unavailable",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function update(
    productId: string,
    quantity: number,
    variantId?: string | null,
  ) {
    setBusyId(productId);
    setError(null);
    try {
      await customerApi.setCartItem(
        productId,
        quantity,
        variantId ?? undefined,
      );
      const result = await loadCartView();
      setCart(result.cart);
      setProductMeta(result.meta);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not update cart",
      );
    } finally {
      setBusyId(null);
    }
  }
  async function remove(itemId: string) {
    setBusyId(itemId);
    setError(null);
    try {
      await customerApi.removeCartItem(itemId);
      const result = await loadCartView();
      setCart(result.cart);
      setProductMeta(result.meta);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove item",
      );
    } finally {
      setBusyId(null);
    }
  }
  if (loading) return <LoadingState label="Loading cart" />;
  if (!cart) return <ErrorState description={error ?? "Cart unavailable"} />;
  return (
    <>
      {error && (
        <p role="alert" className="mb-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {cart.items.length ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="cart-lines divide-y divide-border border-y border-border">
            {cart.items.map((item) => (
              <div
                key={item.id}
                className="cart-line"
              >
                <Link href={`/products/${encodeURIComponent(item.slug)}`} className="cart-line-image" aria-label={`View ${item.name}`}>
                  {productMeta[item.productId]?.imageUrl ? (
                    <Image src={productMeta[item.productId].imageUrl!} alt={productMeta[item.productId].altText} fill sizes="(max-width: 640px) 96px, 144px" className="object-cover" />
                  ) : (
                    <span>Image coming soon</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${encodeURIComponent(item.slug)}`}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                  {item.variantTitle && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.variantTitle}
                    </p>
                  )}
                  {productMeta[item.productId]?.available === false && (
                    <p className="mt-2 text-sm text-destructive">Currently unavailable</p>
                  )}
                  <p className="mt-2">
                    <PriceDisplay
                      amount={item.price}
                      currency={item.currency}
                    />
                  </p>
                </div>
                <div className="cart-line-actions">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Decrease ${item.name} quantity`}
                    disabled={busyId !== null || item.quantity <= 1}
                    onClick={() =>
                      void update(
                        item.productId,
                        item.quantity - 1,
                        item.variantId,
                      )
                    }
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span
                    className="w-7 text-center tabular-nums"
                    aria-label={`Quantity ${item.quantity}`}
                  >
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Increase ${item.name} quantity`}
                    disabled={busyId !== null || item.quantity >= 100}
                    onClick={() =>
                      void update(
                        item.productId,
                        item.quantity + 1,
                        item.variantId,
                      )
                    }
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busyId !== null}
                    aria-label={`Remove ${item.name} from cart`}
                    onClick={() => void remove(item.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <aside className="commerce-panel cart-summary h-fit lg:sticky lg:top-8">
            <h2>Order summary</h2>
            <div className="mt-5 flex justify-between text-sm">
              <span>Subtotal</span>
              <PriceDisplay amount={cart.subtotal} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The store validates price and availability at checkout. This is
              not a final payable amount.
            </p>
            <Button asChild className="mt-6 w-full">
              <Link href="/checkout">Review checkout</Link>
            </Button>
          </aside>
        </div>
      ) : (
        <EmptyState
          title="Your cart is empty"
          description="Browse the collection to find something you like."
          action={{ label: "Explore products", href: "/search" }}
        />
      )}
    </>
  );
}

export default function CartPage() {
  return (
    <div className="site-container section-space">
      <PageHeading title="Your shopping bag" description="Review your pieces before moving to checkout." action={{ href: "/search", label: "Keep exploring" }} />
      <CustomerGate>
        <CartContent />
      </CustomerGate>
    </div>
  );
}
