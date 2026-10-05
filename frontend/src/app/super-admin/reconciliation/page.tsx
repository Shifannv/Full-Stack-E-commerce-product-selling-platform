"use client";

import { useEffect, useState } from "react";
import { superAdminApi, type ReconciliationItem, type ReconciliationResponse } from "@/lib/api/super-admin";
import { ApiError } from "@/lib/api";
import { OperatorGate } from "@/components/layout/operator-workspace";

const DOMAIN_OPTIONS = [
  { value: "", label: "All domains" },
  { value: "PAYMENT", label: "Payment" },
  { value: "REFUND", label: "Refund" },
  { value: "FINANCE", label: "Finance" },
];

const PAGE_LIMIT = 50;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "RESOLVED": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "PENDING": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "RETRYABLE": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "REVIEW": return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    default: return "bg-zinc-500/15 text-zinc-600";
  }
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function ReconciliationTable({ items }: { items: ReconciliationItem[] }) {
  if (!items.length) {
    return (
      <p className="px-7 py-10 text-sm text-muted-foreground">
        No reconciliation items found. The queue is clear.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-3 text-left sm:px-7">Item ID</th>
            <th className="px-3 py-3 text-left">Domain</th>
            <th className="px-3 py-3 text-left">Entity</th>
            <th className="px-3 py-3 text-left">Status</th>
            <th className="px-3 py-3 text-left">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item: ReconciliationItem) => (
            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-5 py-4 sm:px-7">
                <p className="font-mono text-xs">{item.id.slice(0, 8)}…</p>
              </td>
              <td className="px-3 py-4">
                <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {item.domain}
                </span>
              </td>
              <td className="px-3 py-4">
                <p className="text-xs">{item.entityType}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.entityId.slice(0, 8)}…</p>
              </td>
              <td className="px-3 py-4">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}>
                  {item.status}
                </span>
              </td>
              <td className="px-3 py-4 text-xs text-muted-foreground">{fmt(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationPageContent() {
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  // Cursor-based pagination — preserve after_id UUID, do NOT convert to offset
  const [afterId, setAfterId] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]); // stack of previous after_id values
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) { setLoading(true); setError(null); }
      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (domain) params.set("domain", domain);
        if (afterId) params.set("after_id", afterId);
        const result = await superAdminApi.reconciliation(params);
        if (active) setData(result);
      } catch (reason) {
        if (!active) return;
        const msg =
          reason instanceof ApiError
            ? reason.status === 401
              ? "Sign in with a Super Admin account."
              : reason.status === 403
              ? "Forbidden — Super Admin access required."
              : reason.message
            : reason instanceof Error
            ? reason.message
            : "Failed to load reconciliation items.";
        setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [domain, afterId, retry]);

  function handleDomainChange(value: string) {
    setDomain(value);
    setAfterId(undefined);
    setHistory([]);
  }

  function handleNext() {
    if (!data || !data.items.length) return;
    const lastId = data.items[data.items.length - 1]?.id;
    if (!lastId) return;
    setHistory((prev) => [...prev, afterId ?? ""]);
    setAfterId(lastId);
  }

  function handlePrev() {
    const prev = [...history];
    const prevId = prev.pop();
    setHistory(prev);
    setAfterId(prevId === "" ? undefined : prevId);
  }

  const hasPrev = history.length > 0;
  const hasNext = data ? data.items.length >= PAGE_LIMIT : false;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Finance integrity</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Reconciliation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Unresolved reconciliation items. Paginated by cursor (<code className="rounded bg-muted px-1 text-xs">after_id</code>).
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Live data · Cursor pagination
        </span>
      </section>

      <section className="flex flex-wrap gap-3" aria-label="Filters">
        <select
          value={domain}
          onChange={(e) => handleDomainChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Filter by domain"
        >
          {DOMAIN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </section>

      <section className="rounded-xl border border-border bg-card" aria-label="Reconciliation items">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-base font-semibold">Items</h2>
            {data && (
              <p className="mt-1 text-xs text-muted-foreground">{data.count} item{data.count !== 1 ? "s" : ""} in this page</p>
            )}
          </div>
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

        {!loading && !error && data && <ReconciliationTable items={data.items} />}

        {!loading && !error && !data && (
          <p className="px-7 py-10 text-sm text-muted-foreground">No data loaded.</p>
        )}

        {data && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground">
              {afterId ? `After: ${afterId.slice(0, 8)}…` : "First page"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={!hasPrev || loading}
                className="h-8 rounded-md border border-border px-3 text-xs disabled:opacity-40 hover:bg-muted transition-colors"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!hasNext || loading}
                className="h-8 rounded-md border border-border px-3 text-xs disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Note about actions */}
      <section className="rounded-xl border border-border bg-card p-6 sm:p-7">
        <h2 className="text-base font-semibold">Resolve or Escalate Items</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          To resolve or escalate a reconciliation item, use the <strong>Workflows → Reconciliation</strong> section.
          Enter the reconciliation item ID and provide your evidence note.
        </p>
      </section>
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <OperatorGate role="super-admin">
      <ReconciliationPageContent />
    </OperatorGate>
  );
}
