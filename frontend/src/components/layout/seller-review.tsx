"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { sellerLifecycle, type SellerApplication, type BankDetails } from "@/lib/api/seller-lifecycle";

const message = (error: unknown) => error instanceof Error ? error.message : "The operation failed. Please try again.";
export function ProvisionSeller({ onCreated }: { onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const entries = new FormData(form);
    const input = {
      name: String(entries.get("name") ?? ""),
      email: String(entries.get("email") ?? ""),
      temporaryPassword: String(entries.get("temporaryPassword") ?? ""),
    };
    if (!window.confirm(`Create an internal seller account for ${input.email}? The seller must replace the temporary password before onboarding.`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const created = await sellerLifecycle.provision(input);
      form.reset(); setSuccess(`Account created for ${created.email}. Share the temporary password privately. The seller must replace it at first sign-in.`);
      onCreated(created.adminId);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return <details className="commerce-panel"><summary className="cursor-pointer text-lg font-semibold">Create seller account</summary>
    <p className="mt-4 max-w-prose text-sm text-muted-foreground">Create an internal seller account. The seller chooses their permanent password and submits onboarding before they can sell.</p>
    <form onSubmit={submit} className="workflow-form max-w-xl"><fieldset className="grid gap-4" disabled={busy}>
      <label>Seller name<input name="name" required maxLength={200} autoComplete="off" /></label>
      <label>Seller email<input name="email" type="email" required maxLength={320} autoComplete="off" /></label>
      <label>Temporary password<PasswordInput name="temporaryPassword" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
      <p className="text-sm text-muted-foreground">Use 12–128 characters. Keep it only long enough to share securely with the seller.</p>
      <Button type="submit">{busy ? "Creating account…" : "Create seller account"}</Button>
    </fieldset>{error && <p role="alert" className="text-destructive">{error}</p>}{success && <p role="status">{success}</p>}</form>
  </details>;
}

export function SellerReview({ adminId, onClose, onUpdated }: { adminId: string; onClose: () => void; onUpdated: () => void }) {
  const [data, setData] = useState<SellerApplication | null>(null);
  const [privateBank, setPrivateBank] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    Promise.all([sellerLifecycle.review(adminId), sellerLifecycle.publishedCategories()]).then(([result, catalog]) => {
      if (active) { setData(result); setCategoryNames(Object.fromEntries(catalog.categories.map((category) => [category.id, category.name]))); setError(null); }
    }).catch((reason) => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, [adminId, revision]);
  async function run(action: () => Promise<unknown>, result: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); setPrivateBank(null); setData(await sellerLifecycle.review(adminId)); setNotice(result); onUpdated(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function reveal() {
    setBusy(true); setError(null);
    try { setPrivateBank(await sellerLifecycle.revealBank(adminId)); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  function bankDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    // The backend binds the decision to the revision under review and rejects a mismatch,
    // so there is nothing safe to send when no revision is loaded.
    const revisionUnderReview = privateBank?.revision ?? data?.bank?.revision;
    if (!revisionUnderReview) { setError("Reload the application before saving a bank decision."); return; }
    const decisionValue = String(form.get("decision") ?? "");
    if (decisionValue !== "VERIFIED" && decisionValue !== "CHANGES_REQUIRED") { setError("Choose a bank decision."); return; }
    void run(() => sellerLifecycle.verifyBank(adminId, {
      revision: revisionUnderReview,
      decision: decisionValue,
      notes: String(form.get("notes") ?? ""),
    }), "Bank review saved.");
  }
  function decision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const decisionValue = String(form.get("decision") ?? "");
    if (decisionValue !== "APPROVED" && decisionValue !== "CHANGES_REQUIRED" && decisionValue !== "REJECTED") { setError("Choose a decision."); return; }
    if (!window.confirm(`Save the ${decisionValue.replaceAll("_", " ").toLowerCase()} decision for this seller application?`)) return;
    void run(() => sellerLifecycle.decision(adminId, decisionValue, String(form.get("notes") ?? "")), "Application decision saved.");
  }
  async function documentDownload(documentId: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/review/${encodeURIComponent(adminId)}/documents/${encodeURIComponent(documentId)}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Document unavailable. Please retry.");
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a");
      link.href = url; link.download = "seller-evidence"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  return <section className="commerce-panel space-y-7" aria-label="Seller review">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">Seller application</h2><Button variant="outline" onClick={onClose}>Close review</Button></div>
    {error && <p role="alert" className="text-destructive">{error} <button className="underline" onClick={() => setRevision((v) => v + 1)}>Reload application</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading application…</p>}
    {data && <>
      <p className="font-medium">Status: {data.profile.status.replaceAll("_", " ").toLowerCase()}</p>
      <div className="grid gap-8 lg:grid-cols-2"><section><h3 className="text-lg font-semibold">Business and identity</h3>
        {data.application ? <dl className="mt-4 space-y-2 text-sm"><div><dt className="text-muted-foreground">Legal name</dt><dd>{data.application.legalName}</dd></div><div><dt className="text-muted-foreground">Business type</dt><dd>{data.application.businessType}</dd></div><div><dt className="text-muted-foreground">Contact phone</dt><dd>{data.application.contactPhone}</dd></div></dl> : <p className="mt-4 text-sm text-muted-foreground">The seller has not saved their business details.</p>}
        <ul className="mt-4 space-y-2">{data.documents.map((document) => <li key={document.id}><Button variant="outline" disabled={busy} onClick={() => void documentDownload(document.id)}>Download {document.documentType}</Button></li>)}</ul>
      </section><section><h3 className="text-lg font-semibold">Shipping and returns</h3>{data.addresses.filter((a) => a.isActive).map((address) => <div key={address.addressType} className="mt-4 text-sm"><h4 className="font-medium">{address.addressType === "RETURN" ? "Return address" : "Shipping origin"}</h4><p>{address.contactName} · {address.phone}</p><p>{[address.line1, address.line2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")}</p></div>)}{!data.addresses.length && <p className="mt-4 text-sm text-muted-foreground">No operational addresses saved.</p>}</section></div>
      <section className="border-t border-border pt-6"><h3 className="text-lg font-semibold">Selling scope</h3><p className="mt-2 text-sm">{data.categories.filter((c) => c.status === "REQUESTED").length} requested categories · {data.categories.filter((c) => c.status === "ACTIVE").length} active categories</p><ul className="mt-3 space-y-2 text-sm">{data.categories.map((category) => <li key={category.categoryId}>{categoryNames[category.categoryId] ?? "Unavailable category"} · {category.status.toLowerCase()}</li>)}</ul><p className="mt-2 text-sm text-muted-foreground">Approval activates the requested categories. Review category assignments in the seller workflows when a scope correction is needed.</p></section>
      <section className="border-t border-border pt-6"><h3 className="text-lg font-semibold">Bank verification</h3>{data.bank ? <>
        <p className="mt-3 text-sm">Account ending {data.bank.accountLast4} · {data.bank.status.replaceAll("_", " ").toLowerCase()}</p>
        {data.bank.reviewNotes && <p className="mt-2 text-sm">{data.bank.reviewNotes}</p>}
        <Button className="mt-4" variant="outline" disabled={busy} onClick={() => privateBank ? setPrivateBank(null) : void reveal()}>{privateBank ? "Hide bank details" : "View private bank details"}</Button>
        {privateBank && <dl className="mt-4 space-y-2 text-sm"><div><dt>Account holder</dt><dd>{privateBank.accountHolder}</dd></div><div><dt>Bank</dt><dd>{privateBank.bankName}</dd></div><div><dt>Account number</dt><dd className="break-all">{privateBank.accountNumber}</dd></div><div><dt>IFSC</dt><dd>{privateBank.ifsc}</dd></div></dl>}
        {!(data.profile.status === "ACTIVE" && data.bank.status === "VERIFIED") && <form onSubmit={bankDecision} className="workflow-form max-w-xl"><fieldset disabled={busy} className="grid gap-4"><label>Bank decision<select aria-label="Bank decision" name="decision" required defaultValue=""><option value="" disabled>Choose a decision</option><option value="VERIFIED" disabled={!privateBank}>Verified for manual payout</option><option value="CHANGES_REQUIRED">Changes required</option></select></label><label>Bank verification notes<textarea name="notes" required maxLength={1000} /></label><Button type="submit">Save bank review</Button></fieldset><p className="text-sm text-muted-foreground">View the private details and verify the account before confirming it.</p></form>}
      </> : <p className="mt-3 text-sm text-muted-foreground">The seller has not provided bank details. Approval is unavailable.</p>}</section>
      {data.application?.reviewNotes && <p className="text-sm">Previous review: {data.application.reviewNotes}</p>}
      {data.profile.status === "PENDING_SUPER_ADMIN_APPROVAL" && <form onSubmit={decision} className="workflow-form max-w-xl border-t border-border pt-6"><h3 className="text-lg font-semibold">Application decision</h3><fieldset disabled={busy} className="grid gap-4"><label>Decision<select aria-label="Decision" name="decision" required defaultValue=""><option value="" disabled>Choose a decision</option><option value="APPROVED" disabled={data.bank?.status !== "VERIFIED"}>Approve seller</option><option value="CHANGES_REQUIRED">Request changes</option><option value="REJECTED">Reject application</option></select></label><label>Review notes<textarea name="notes" required maxLength={1000} /></label><Button type="submit">Save application decision</Button></fieldset></form>}
    </>}
  </section>;
}
