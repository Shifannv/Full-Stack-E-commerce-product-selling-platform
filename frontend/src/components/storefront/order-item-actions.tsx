"use client";

import { useState } from "react";
import Link from "next/link";
import { customerApi, type Order } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function OrderItemActions({ item }: { item: NonNullable<Order["items"]>[number] }) {
  const [mode, setMode] = useState<"review" | "return" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null); setMessage(null);
    try {
      if (mode === "review") {
        await customerApi.review(item.id, Number(form.get("rating")), String(form.get("title")), String(form.get("body")));
        setMessage("Thank you. Your review has been submitted for moderation.");
      } else {
        const result = await customerApi.requestReturn(item.id, Number(form.get("quantity")), String(form.get("reason")), String(form.get("notes") ?? ""));
        setReturnId(result.id);
        setMessage("Your return request has been sent for approval. Keep the return reference below.");
      }
      setMode(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not submit this request. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 border-t border-border pt-3">
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setMode("review"); setError(null); }}>Write a review</Button><Button size="sm" variant="ghost" disabled={busy || !!returnId} onClick={() => { setMode("return"); setError(null); }}>Request a return</Button></div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {returnId && <Link href={`/returns?id=${encodeURIComponent(returnId)}`} className="mt-2 inline-block break-all text-sm underline">View return {returnId}</Link>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {mode && <form onSubmit={event => void submit(event)} className="workflow-form">
      <h4 className="font-medium">{mode === "review" ? "Your review" : "Return request"} — {item.productNameSnapshot}</h4>
      {mode === "review" ? <><label>Rating<select name="rating" defaultValue="5">{[5,4,3,2,1].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}</select></label><label>Review title<input name="title" required maxLength={150} /></label><label>Your experience<textarea name="body" required maxLength={5000} /></label></> : <><p className="text-sm text-muted-foreground">Eligible Dress products can be requested within five days of delivery. Approval is required before returning an item. The store checks eligibility when you submit.</p><label>Quantity<input name="quantity" type="number" min={1} max={item.quantity} step={1} defaultValue={1} required /></label><label>Reason<textarea name="reason" required maxLength={500} /></label><label>Additional notes (optional)<textarea name="notes" maxLength={2000} /></label></>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? "Submitting…" : mode === "review" ? "Submit review" : "Submit return request"}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</Button></div>
    </form>}
  </div>;
}

export function CancelOrder({ order, onCancelled }: { order: Order; onCancelled: (status: string, paymentStatus: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    setBusy(true); setError(null);
    try { const result = await customerApi.cancelOrder(order.id); onCancelled(result.status, result.paymentStatus); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Cancellation unavailable. Refresh your orders and try again."); }
    finally { setBusy(false); }
  }
  if (order.status !== "CREATED" || order.paymentStatus !== "PENDING") return null;
  return <div className="mt-5">
    {confirm ? <div className="space-y-3"><p className="text-sm">Cancel this unpaid order and release its reserved items?</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Confirm cancellation"}</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Keep order</Button></div></div> : <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>Cancel unpaid order</Button>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>;
}
