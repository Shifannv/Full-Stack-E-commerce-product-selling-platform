"use client";

import { useEffect, useState } from "react";
import { superAdminApi, type AdminRow, type AdminsResponse } from "@/lib/api/super-admin";
import { ApiError } from "@/lib/api";
import { OperatorGate } from "@/components/layout/operator-workspace";
import { ProvisionSeller, SellerReview } from "@/components/layout/seller-review";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "PENDING_SUPER_ADMIN_APPROVAL", label: "Pending approval" },
  { value: "CHANGES_REQUIRED", label: "Changes required" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Rejected" },
];

const PAGE_LIMIT = 20;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE": return "badge-green";
    case "PENDING_SUPER_ADMIN_APPROVAL":
    case "PENDING": return "badge-yellow";
    case "SUSPENDED":
    case "REJECTED": return "badge-red";
    default: return "badge-neutral";
  }
}

function AdminsTable({ data, onReview }: { data: AdminsResponse; onReview: (id: string) => void }) {
  if (!data.admins.length) {
    return (
      <p className="px-7 py-10 text-sm text-muted-foreground">
        No admin accounts match the current filters.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border overflow-x-auto">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-7">
        <span>Name / Email</span>
        <span>Account ID</span>
        <span>Status</span>
      </div>
      {data.admins.map((admin: AdminRow) => (
        <div
          key={admin.id}
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-4 px-5 py-4 text-sm sm:items-center sm:px-7"
        >
          <div className="min-w-0">
            <button className="truncate font-medium text-primary underline underline-offset-4" onClick={() => onReview(admin.id)} aria-label={`Review ${admin.userName ?? admin.userEmail}`}>{admin.userName ?? "(no name)"}</button>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{admin.userEmail}</p>
          </div>
          <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">{admin.id}</p>
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(admin.status)}`}>
            {admin.status.replaceAll("_", " ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function AdminsPageContent() {
  const [data, setData] = useState<AdminsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) { setLoading(true); setError(null); }
      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(offset) });
        if (status) params.set("status", status);
        if (q.trim()) params.set("q", q.trim());
        const result = await superAdminApi.admins(params);
        if (active) setData(result);
      } catch (reason) {
        if (!active) return;
        const msg =
          reason instanceof ApiError
            ? reason.status === 401
              ? "Sign in with a Super Admin account to view admins."
              : reason.status === 403
              ? "Forbidden — Super Admin access required."
              : reason.message
            : reason instanceof Error
            ? reason.message
            : "Failed to load admin accounts.";
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

  function handleStatusChange(value: string) {
    setStatus(value);
    setOffset(0);
  }

  const hasPrev = offset > 0;
  const hasNext = data ? data.admins.length >= PAGE_LIMIT : false;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Admin accounts</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Seller Admins</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Provision internal sellers and review their applications.
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Live data
        </span>
      </section>

      <ProvisionSeller onCreated={(id) => { setRetry((v) => v + 1); setSelected(id); }} />
      {selected && <SellerReview key={selected} adminId={selected} onClose={() => setSelected(null)} onUpdated={() => setRetry((v) => v + 1)} />}
      {/* Filters */}
      <section className="flex flex-wrap gap-3" aria-label="Filters">
        <form onSubmit={applySearch} className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search name or email…"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Search admins"
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
          onChange={(e) => handleStatusChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </section>

      {/* Table */}
      <section className="rounded-xl border border-border bg-card" aria-label="Admin accounts">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <h2 className="text-base font-semibold">Accounts</h2>
          {loading && (
            <span role="status" className="text-xs text-muted-foreground">Loading…</span>
          )}
        </div>

        {error && (
          <div role="alert" className="p-6">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((r) => r + 1)}
              className="mt-3 text-sm font-medium text-primary underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && data && <AdminsTable data={data} onReview={setSelected} />}

        {!loading && !error && !data && (
          <p className="px-7 py-10 text-sm text-muted-foreground">No data loaded.</p>
        )}

        {/* Pagination */}
        {data && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground">
              {data.admins.length ? `Showing ${offset + 1}–${offset + data.admins.length}` : "No matching accounts"}
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

export default function AdminsPage() {
  return (
    <OperatorGate role="super-admin">
      <AdminsPageContent />
    </OperatorGate>
  );
}
