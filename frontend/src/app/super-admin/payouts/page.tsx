"use client";

import { useEffect, useState } from "react";
import { superAdminApi, type SuperAdminPayout, type PayoutsResponse } from "@/lib/api/super-admin";
import { ApiError } from "@/lib/api";
import { OperatorGate } from "@/components/layout/operator-workspace";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "REQUESTED", label: "Requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PAID", label: "Paid" },
];

const PAGE_LIMIT = 20;

function money(value: string) {
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n)
    : "—";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "APPROVED":
    case "PAID": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "REQUESTED": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "REJECTED": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "bg-zinc-500/15 text-zinc-600";
  }
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function PayoutsTable({ data }: { data: PayoutsResponse }) {
  if (!data.payouts.length) {
    return (
      <p className="px-7 py-10 text-sm text-muted-foreground">
        No payout requests match the current filters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-3 text-left sm:px-7">Payout ID</th>
            <th className="px-3 py-3 text-left">Admin ID</th>
            <th className="px-3 py-3 text-left">Status</th>
            <th className="px-3 py-3 text-right">Amount</th>
            <th className="px-3 py-3 text-left">Requested</th>
            <th className="px-3 py-3 text-left">Reviewed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.payouts.map((p: SuperAdminPayout) => (
            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-5 py-4 sm:px-7">
                <p className="font-mono text-xs">{p.id.slice(0, 8)}…</p>
              </td>
              <td className="px-3 py-4">
                <p className="font-mono text-xs text-muted-foreground">{p.adminId.slice(0, 8)}…</p>
              </td>
              <td className="px-3 py-4">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                  {p.status}
                </span>
              </td>
              <td className="px-3 py-4 text-right tabular-nums font-medium">{money(p.amount)}</td>
              <td className="px-3 py-4 text-xs text-muted-foreground">{fmt(p.requestedAt)}</td>
              <td className="px-3 py-4">
                {p.reviewedAt ? (
                  <div>
                    <p className="text-xs text-muted-foreground">{fmt(p.reviewedAt)}</p>
                    {p.reviewNotes && (
                      <p className="mt-0.5 max-w-[16rem] truncate text-xs text-muted-foreground" title={p.reviewNotes}>
                        {p.reviewNotes}
                      </p>
                    )}
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsPageContent() {
  const [data, setData] = useState<PayoutsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) { setLoading(true); setError(null); }
      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(offset) });
        if (status) params.set("status", status);
        const result = await superAdminApi.payouts(params);
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
            : "Failed to load payouts.";
        setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [status, offset, retry]);

  const hasPrev = offset > 0;
  const hasNext = data ? data.payouts.length >= PAGE_LIMIT : false;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Finance</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Payout Queue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            All seller payout requests. Finance amounts are read from stored backend rows.
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Live data
        </span>
      </section>

      <section className="flex flex-wrap gap-3" aria-label="Filters">
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

      <section className="rounded-xl border border-border bg-card" aria-label="Payout requests">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-base font-semibold">Payout requests</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the Workflows section below to approve, reject, or record completed payouts.
            </p>
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

        {!loading && !error && data && <PayoutsTable data={data} />}

        {!loading && !error && !data && (
          <p className="px-7 py-10 text-sm text-muted-foreground">No data loaded.</p>
        )}

        {data && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground">
              Showing {offset + 1}–{offset + data.payouts.length}
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

export default function PayoutsPage() {
  return (
    <OperatorGate role="super-admin">
      <PayoutsPageContent />
    </OperatorGate>
  );
}
