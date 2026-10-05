"use client";

import { useEffect, useState } from "react";
import { superAdminApi, type SuperAdminProduct, type ProductsResponse } from "@/lib/api/super-admin";
import { ApiError } from "@/lib/api";
import { OperatorGate } from "@/components/layout/operator-workspace";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const PAGE_LIMIT = 20;

function money(value: string) {
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
    : "—";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "PUBLISHED": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "DRAFT": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "ARCHIVED": return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400";
    default: return "bg-zinc-500/15 text-zinc-600";
  }
}

function ProductsTable({ data }: { data: ProductsResponse }) {
  if (!data.products.length) {
    return (
      <p className="px-7 py-10 text-sm text-muted-foreground">
        No products found for the current filters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-3 text-left sm:px-7">Product</th>
            <th className="px-3 py-3 text-left">Category</th>
            <th className="px-3 py-3 text-left">Status</th>
            <th className="px-3 py-3 text-right">Price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.products.map((p: SuperAdminProduct) => (
            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-5 py-4 sm:px-7">
                <p className="font-medium">{p.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}…</p>
              </td>
              <td className="px-3 py-4">
                <p>{p.category}</p>
                <p className="text-xs text-muted-foreground">{p.subcategory}</p>
              </td>
              <td className="px-3 py-4">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                  {p.status}
                </span>
                {p.featured && (
                  <span className="ml-1 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    FEATURED
                  </span>
                )}
              </td>
              <td className="px-3 py-4 text-right tabular-nums">{money(p.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductsPageContent() {
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) { setLoading(true); setError(null); }
      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(offset) });
        if (status) params.set("status", status);
        if (q.trim()) params.set("q", q.trim());
        const result = await superAdminApi.products(params);
        if (active) setData(result);
      } catch (reason) {
        if (!active) return;
        const msg =
          reason instanceof ApiError
            ? reason.status === 401
              ? "Sign in with a Super Admin account to view products."
              : reason.status === 403
              ? "Forbidden — Super Admin access required."
              : reason.message
            : reason instanceof Error
            ? reason.message
            : "Failed to load products.";
        setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [status, q, offset, retry]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(draftQ);
    setOffset(0);
  }

  const hasPrev = offset > 0;
  const hasNext = data ? data.products.length >= PAGE_LIMIT : false;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Catalog oversight</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">All Products</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every product across all sellers — including drafts and archived items.
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Live data
        </span>
      </section>

      {/* Filters */}
      <section className="flex flex-wrap gap-3" aria-label="Filters">
        <form onSubmit={applySearch} className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search by name…"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Search products"
          />
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Search
          </button>
        </form>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </section>

      {/* Table */}
      <section className="rounded-xl border border-border bg-card" aria-label="Products">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <h2 className="text-base font-semibold">Products</h2>
          {loading && <span role="status" className="text-xs text-muted-foreground">Loading…</span>}
        </div>

        {error && (
          <div role="alert" className="p-6">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="mt-3 text-sm font-medium text-primary underline">
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data && <ProductsTable data={data} />}

        {!loading && !error && !data && (
          <p className="px-7 py-10 text-sm text-muted-foreground">No data loaded.</p>
        )}

        {data && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground">
              Showing {offset + 1}–{offset + data.products.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                disabled={!hasPrev || loading}
                className="h-8 rounded-md border border-border px-3 text-xs disabled:opacity-40 hover:bg-muted transition-colors"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE_LIMIT)}
                disabled={!hasNext || loading}
                className="h-8 rounded-md border border-border px-3 text-xs disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <OperatorGate role="super-admin">
      <ProductsPageContent />
    </OperatorGate>
  );
}
