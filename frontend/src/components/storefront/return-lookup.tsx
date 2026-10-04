"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { customerApi, type ReturnStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/catalog/price-display";

export function ReturnLookup() {
  const params = useSearchParams();
  const [reference, setReference] = useState(params.get("id") ?? "");
  const [result, setResult] = useState<ReturnStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult(await customerApi.returnStatus(reference.trim())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Return status unavailable. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-10 md:grid-cols-2"><div><h2 className="type-section">Follow your return</h2><p className="mt-4 max-w-prose text-muted-foreground">Use the reference shown when you submitted your request. You can start a new return from a delivered purchase in Orders.</p><form onSubmit={event => void load(event)} className="workflow-form"><label>Return reference<input value={reference} onChange={event => setReference(event.target.value)} required maxLength={40} /></label><Button disabled={busy} type="submit">{busy ? "Checking…" : "Check return status"}</Button></form>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}</div>
    {result && <section className="commerce-panel" aria-live="polite"><h2>{result.status.replaceAll("_", " ")}</h2><p className="mt-4 break-all text-sm">Reference: {result.id}</p>{result.returnAddress ? <div className="mt-6"><h3 className="font-medium">Approved return address</h3><address className="mt-2 not-italic text-sm leading-relaxed">{Object.entries(result.returnAddress).filter(([,value]) => value).map(([key,value]) => <div key={key}>{value}</div>)}</address><p className="mt-4 text-sm text-muted-foreground">Send the item yourself and pay your courier directly. A courier reference or proof upload is not required. Refunds follow receipt and inspection.</p></div> : <p className="mt-5 text-sm text-muted-foreground">The return address appears after approval.</p>}{result.netRefundAmount && <p className="mt-6">Refund amount: <PriceDisplay amount={result.netRefundAmount} currency="INR" /></p>}{result.refund && <p className="mt-2 text-sm">Refund: {result.refund.status.replaceAll("_", " ")}</p>}</section>}
  </div>;
}
