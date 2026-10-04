"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { customerApi } from "@/lib/api";

export function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (saved) return;
    setBusy(true);
    setMessage("");
    try {
      await customerApi.setWishlist(productId, true);
      setSaved(true);
      setMessage(`${productName} saved to your wishlist.`);
    } catch {
      setMessage("Sign in as a customer to save this product.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" onClick={() => void save()} disabled={busy || saved} aria-label={saved ? `${productName} saved to wishlist` : `Save ${productName} to wishlist`} className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-background/95 text-foreground shadow-sm transition-colors hover:bg-card disabled:opacity-75"><Heart aria-hidden="true" className={`size-4 ${saved ? "fill-current" : ""}`} /></button>
    {message && <span className="absolute right-3 top-14 z-10 max-w-[12rem] bg-card px-3 py-2 text-xs leading-snug shadow-sm" role="status">{message}</span>}
  </>;
}
