"use client";

import { useEffect, useState } from "react";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerApi, type CustomerAddress } from "@/lib/api";

type AddressInput = Omit<CustomerAddress, "id">;
const blank: AddressInput = { label: "Home", contactName: "", phone: "", line1: "", line2: null, city: "", state: "", postalCode: "", country: "IN", isDefault: false };

function AddressContent() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [form, setForm] = useState<AddressInput>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; customerApi.addresses().then((result) => { if (active) setAddresses(result.addresses); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Addresses unavailable"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const update = (key: keyof AddressInput, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(null); try { await customerApi.saveAddress(form, editingId ?? undefined); setAddresses((await customerApi.addresses()).addresses); setForm(blank); setEditingId(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save address"); } finally { setBusy(false); } }
  async function remove(id: string) { setBusy(true); setError(null); try { await customerApi.deleteAddress(id); setAddresses((await customerApi.addresses()).addresses); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete address"); } finally { setBusy(false); } }
  if (loading) return <LoadingState label="Loading addresses" />;
  if (error && !addresses.length && !form.contactName) return <ErrorState description={error} />;
  return <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]"><div><h2 className="text-xl font-semibold">Saved addresses</h2>{addresses.length ? <div className="mt-5 divide-y divide-border border-y border-border">{addresses.map((address) => <article key={address.id} className="flex flex-wrap justify-between gap-4 py-5"><div><p className="font-semibold">{address.label}{address.isDefault && <span className="ml-2 text-xs font-normal text-primary">Default</span>}</p><p className="mt-1 text-sm text-muted-foreground">{address.contactName} · {address.phone}</p><p className="text-sm text-muted-foreground">{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.postalCode}</p></div><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => { setForm({ ...address }); setEditingId(address.id); }}>Edit</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(address.id)}>Delete</Button></div></article>)}</div> : <div className="mt-5"><EmptyState title="No addresses yet" description="Add an address to prepare for checkout." /></div>}</div><form onSubmit={(event) => void save(event)} className="h-fit rounded-xl bg-card p-6"><h2 className="text-xl font-semibold">{editingId ? "Edit address" : "Add an address"}</h2>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}<div className="mt-5 grid gap-4">{([ ["label", "Label"], ["contactName", "Full name"], ["phone", "Phone"], ["line1", "Address line 1"], ["line2", "Address line 2"], ["city", "City"], ["state", "State"], ["postalCode", "Postal code"] ] as const).map(([key, label]) => <div key={key}><label htmlFor={`address-${key}`} className="mb-1 block text-sm font-medium">{label}</label><Input id={`address-${key}`} name={key} value={form[key] ?? ""} onChange={(event) => update(key, event.target.value)} required={key !== "line2"} maxLength={key === "postalCode" ? 6 : 300} pattern={key === "postalCode" ? "[0-9]{6}" : undefined} inputMode={key === "postalCode" ? "numeric" : undefined} /></div>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(event) => update("isDefault", event.target.checked)} /> Set as default</label><Button type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Save address"}</Button>{editingId && <Button type="button" variant="ghost" onClick={() => { setForm(blank); setEditingId(null); }}>Cancel edit</Button>}</div></form></div>;
}

export default function AddressesPage() { return <div className="site-container section-space"><h1 className="type-page mb-10">Addresses</h1><CustomerGate><AddressContent /></CustomerGate></div>; }
