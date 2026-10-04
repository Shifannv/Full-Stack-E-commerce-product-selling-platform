"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PriceDisplay } from "@/components/catalog/price-display";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { PageHeading } from "@/components/storefront/page-heading";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import {
  customerApi,
  type Cart,
  type CheckoutQuote,
  type CustomerAddress,
} from "@/lib/api";

function CheckoutContent() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [quoteState, setQuoteState] = useState<{
    addressId: string;
    quote: CheckoutQuote | null;
    error: string | null;
  } | null>(null);
  const quote = quoteState?.addressId === addressId ? quoteState.quote : null;
  const quoteError =
    quoteState?.addressId === addressId ? quoteState.error : null;
  const quoteLoading = Boolean(
    addressId && quoteState?.addressId !== addressId,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([customerApi.cart(), customerApi.addresses()])
      .then(([cartResult, addressResult]) => {
        if (active) {
          setCart(cartResult);
          setAddresses(addressResult.addresses);
          setAddressId(
            addressResult.addresses.find((item) => item.isDefault)?.id ??
              addressResult.addresses[0]?.id ??
              "",
          );
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Checkout unavailable",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!addressId) return;
    let active = true;
    customerApi
      .checkoutQuote(addressId)
      .then((result) => {
        if (active) setQuoteState({ addressId, quote: result, error: null });
      })
      .catch((reason: unknown) => {
        if (active)
          setQuoteState({
            addressId,
            quote: null,
            error:
              reason instanceof Error ? reason.message : "Quote unavailable",
          });
      });
    return () => {
      active = false;
    };
  }, [addressId]);
  if (loading) return <LoadingState label="Loading checkout review" />;
  if (!cart)
    return <ErrorState description={error ?? "Checkout unavailable"} />;
  if (!cart.items.length)
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add products before reviewing checkout."
        action={{ label: "Explore products", href: "/search" }}
      />
    );
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <h2 className="text-xl font-semibold">Delivery address</h2>
        {addresses.length ? (
          <fieldset className="mt-5 space-y-3">
            <legend className="sr-only">Select a saved address</legend>
            {addresses.map((address) => (
              <label
                key={address.id}
                className="flex gap-3 rounded-lg border border-border bg-card p-4"
              >
                <input
                  type="radio"
                  name="address"
                  value={address.id}
                  checked={addressId === address.id}
                  onChange={() => setAddressId(address.id)}
                />
                <span className="text-sm">
                  <strong>{address.label}</strong>
                  <br />
                  {address.contactName}, {address.line1}, {address.city},{" "}
                  {address.state} {address.postalCode}
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="mt-4 text-muted-foreground">
            No saved address.{" "}
            <Link href="/account/addresses" className="underline">
              Add one
            </Link>{" "}
            before placing an order.
          </p>
        )}
        <h2 className="mt-10 text-xl font-semibold">Items for review</h2>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {(quote?.items ?? cart.items).map((item, index) => (
            <div
              key={`${item.productId}-${item.variantId}-${index}`}
              className="flex justify-between gap-4 py-4 text-sm"
            >
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-muted-foreground">
                  {item.variantTitle ? `${item.variantTitle} · ` : ""}Quantity{" "}
                  {item.quantity}
                </p>
              </div>
              <PriceDisplay
                amount={"lineTotal" in item ? item.lineTotal : item.price}
                currency={cart.items[0]?.currency}
              />
            </div>
          ))}
        </div>
      </div>
      <aside className="commerce-panel h-fit">
        <h2 className="text-lg font-semibold">Checkout review</h2>
        {quoteLoading && (
          <p className="mt-5 text-sm text-muted-foreground">
            Checking current prices and stock…
          </p>
        )}
        {quoteError && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {quoteError}
          </p>
        )}
        {quote && (
          <>
            <div className="mt-5 flex justify-between text-sm">
              <span>Subtotal</span>
              <PriceDisplay amount={quote.subtotal} currency={quote.currency} />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>Discount</span>
              <PriceDisplay
                amount={quote.discountAmount}
                currency={quote.currency}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>Shipping</span>
              <PriceDisplay
                amount={quote.shippingAmount}
                currency={quote.currency}
              />
            </div>
            {quote.totalAmount && (
              <div className="mt-4 flex justify-between border-t border-border pt-4 font-semibold">
                <span>Payable amount</span>
                <PriceDisplay
                  amount={quote.totalAmount}
                  currency={quote.currency}
                />
              </div>
            )}
            {quote.problems.length > 0 && (
              <ul
                role="alert"
                className="mt-4 list-disc pl-5 text-sm text-destructive"
              >
                {quote.problems.map((problem, index) => (
                  <li key={`${problem}-${index}`}>{problem}</li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              This quote does not reserve stock. Checkout rechecks the amount
              before creating an order.
            </p>
          </>
        )}
        <div className="mt-7 rounded-lg bg-secondary p-4">
          <p className="font-semibold">Payment is not available yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            You can review your items and delivery address. Order placement
            will be available when payments are ready.
          </p>
        </div>
        <Link
          href="/cart"
          className="mt-6 inline-block text-sm font-semibold underline"
        >
          Return to cart
        </Link>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="site-container section-space">
      <PageHeading title="Review your order" description="Choose your delivery address and check the latest prices and availability." action={{ href: "/cart", label: "Back to your bag" }} />
      <CustomerGate>
        <CheckoutContent />
      </CustomerGate>
    </div>
  );
}
