"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PriceDisplay } from "@/components/catalog/price-display";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { customerApi, type Cart } from "@/lib/api";

function CartContent() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    customerApi
      .cart()
      .then((result) => {
        if (active) setCart(result);
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
      setCart(await customerApi.cart());
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
      setCart(await customerApi.cart());
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
          <div className="divide-y divide-border border-y border-border">
            {cart.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-5 py-6"
              >
                <div>
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
                  <p className="mt-2">
                    <PriceDisplay
                      amount={item.price}
                      currency={item.currency}
                    />
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                    −
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
                    +
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => void remove(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <aside className="h-fit rounded-xl bg-card p-6">
            <h2 className="text-lg font-semibold">Cart summary</h2>
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
      <h1 className="type-page mb-10">Your cart</h1>
      <CustomerGate>
        <CartContent />
      </CustomerGate>
    </div>
  );
}
