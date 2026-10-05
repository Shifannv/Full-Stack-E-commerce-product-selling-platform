"use client";

import { useState } from "react";
import Link from "next/link";
import { customerApi, type Order, type OrderItem } from "@/lib/api";
import { Button } from "@/components/ui/button";

const eligibilityCopy: Record<string, string> = {
  ORDER_NOT_CREATED: "This order can no longer be cancelled.",
  PAYMENT_NOT_PENDING: "Cancellation is unavailable after payment changes state.",
  STOCK_NOT_RESERVED: "The reserved items have already been released or fulfilled.",
  PAYMENT_DEADLINE_MISSING: "This order has no active cancellation deadline.",
  PAYMENT_WINDOW_CLOSED: "The cancellation window has closed.",
  RETURN_POLICY_UNAVAILABLE: "Returns are temporarily unavailable for this item.",
  ORDER_NOT_PAID: "Returns become available after payment is confirmed.",
  ORDER_NOT_DELIVERED: "Returns become available after the order is delivered.",
  SHIPMENT_NOT_DELIVERED: "This item has not been marked as delivered.",
  PRODUCT_NOT_RETURNABLE: "This item is not covered by the return policy.",
  ALREADY_RETURNED: "A return has already been requested for this item.",
  RETURN_WINDOW_CLOSED: "The return window has closed.",
  ALREADY_REVIEWED: "A review has already been submitted for this item.",
};

function reasonText(reasons: string[]): string | null {
  const reason = reasons[0];
  if (!reason) return null;
  return eligibilityCopy[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}

function formatDeadline(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the stated deadline";
  return includeTime
    ? date.toLocaleString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

export function OrderItemActions({ item }: { item: OrderItem }) {
  const [mode, setMode] = useState<"review" | "return" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [submittedReview, setSubmittedReview] = useState(false);
  const reviewStatus = submittedReview ? "PENDING" : item.reviewStatus;
  const reviewUnavailable = reasonText(item.reviewEligibilityReasons);
  const returnUnavailable = reasonText(item.returnEligibilityReasons);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null); setMessage(null);
    try {
      if (mode === "review") {
        await customerApi.review(item.id, Number(form.get("rating")), String(form.get("title")), String(form.get("body")));
        setSubmittedReview(true);
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
    <div className="flex flex-wrap gap-2">
      {item.reviewEligible && !reviewStatus && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => { setMode("review"); setError(null); }}
        >
          Write a review
        </Button>
      )}
      {reviewStatus && (
        <span className="self-center text-xs text-muted-foreground">
          Review {reviewStatus.replaceAll("_", " ").toLowerCase()}
        </span>
      )}
      {item.returnEligible && !returnId && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => { setMode("return"); setError(null); }}
        >
          Request a return
        </Button>
      )}
    </div>
    {!item.reviewEligible && !reviewStatus && reviewUnavailable && (
      <p className="mt-2 text-xs text-muted-foreground">
        Review: {reviewUnavailable}
      </p>
    )}
    {!item.returnEligible && !returnId && returnUnavailable && (
      <p className="mt-2 text-xs text-muted-foreground">
        Return: {returnUnavailable}
      </p>
    )}
    {item.deliveredAt && (
      <p className="mt-2 text-xs text-muted-foreground">
        Delivered {formatDeadline(item.deliveredAt)}
      </p>
    )}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {returnId && <Link href={`/returns?id=${encodeURIComponent(returnId)}`} className="mt-2 inline-block break-all text-sm underline">View return {returnId}</Link>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {item.returnEligible && !returnId && item.returnWindowEndsAt && !mode && (
      <p className="mt-2 text-xs text-muted-foreground">
        Return window closes {formatDeadline(item.returnWindowEndsAt)}. {" "}
        {item.remainingReturnableQuantity} of {item.quantity} eligible.
      </p>
    )}
    {mode && <form onSubmit={event => void submit(event)} className="workflow-form">
      <h4 className="font-medium">{mode === "review" ? "Your review" : "Return request"} — {item.productNameSnapshot}</h4>
      {mode === "review"
        ? <><label>Rating<select name="rating" defaultValue="5">{[5,4,3,2,1].map(rating => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}</select></label><label>Review title<input name="title" required maxLength={150} /></label><label>Your experience<textarea name="body" required maxLength={5000} /></label></>
        : <><p className="text-sm text-muted-foreground">Eligibility is checked again when you submit this request.</p><label>Quantity<input name="quantity" type="number" min={1} max={item.remainingReturnableQuantity} step={1} defaultValue={1} required /></label><label>Reason<textarea name="reason" required maxLength={500} /></label><label>Additional notes (optional)<textarea name="notes" maxLength={2000} /></label></>}
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

  if (!order.cancellationEligible) {
    const reason = reasonText(order.cancellationEligibilityReasons);
    return reason ? (
      <p className="mt-5 text-xs text-muted-foreground">
        Cancellation: {reason}
      </p>
    ) : null;
  }

  return <div className="mt-5">
    {confirm
      ? <div className="space-y-3">
          <p className="text-sm">Cancel this unpaid order and release its reserved items?</p>
          {order.cancellationDeadline && (
            <p className="text-xs text-muted-foreground">
              Available until {formatDeadline(order.cancellationDeadline, true)}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Confirm cancellation"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Keep order</Button>
          </div>
        </div>
      : <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>Cancel unpaid order</Button>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>;
}
