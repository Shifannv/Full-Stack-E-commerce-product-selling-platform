"use client";

import { useEffect, useState } from "react";
import { superAdminApi, type LifecycleRequest, type LifecycleResponse } from "@/lib/api/super-admin";
import { ApiError } from "@/lib/api";
import { OperatorGate } from "@/components/layout/operator-workspace";

type RequestType = "DELETION" | "RECOVERY";

const TYPE_OPTIONS: { value: RequestType; label: string }[] = [
  { value: "DELETION", label: "Deletion requests" },
  { value: "RECOVERY", label: "Recovery requests" },
];

const DELETION_STATUSES = ["", "REQUESTED", "PENDING", "APPROVED", "REJECTED"];
const RECOVERY_STATUSES = ["", "PENDING", "APPROVED", "REJECTED"];

const PAGE_LIMIT = 20;

function statusBadgeClass(status: string): string {
  switch (status) {
    case "APPROVED": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "REQUESTED":
    case "PENDING": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "REJECTED": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "bg-zinc-500/15 text-zinc-600";
  }
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LifecycleTable({ requests }: { requests: LifecycleRequest[] }) {
  if (!requests.length) {
    return (
      <p className="px-7 py-10 text-sm text-muted-foreground">
        No lifecycle requests match the current filters.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border overflow-x-auto">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:px-7">
        <span>Admin</span>
        <span>Type</span>
        <span>Status</span>
        <span>Requested</span>
      </div>
      {requests.map((req) => (
        <div
          key={req.id}
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-5 py-4 text-sm sm:items-center sm:px-7"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{req.userName ?? "(no name)"}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{req.userEmail}</p>
            {req.reason && (
              <p className="mt-1 truncate text-xs text-muted-foreground" title={req.reason}>
                Reason: {req.reason}
              </p>
            )}
          </div>
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${req.type === "DELETION" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400"}`}>
            {req.type}
          </span>
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(req.status)}`}>
            {req.status}
          </span>
          <span className="text-xs text-muted-foreground">{fmt(req.requestedAt)}</span>
        </div>
      ))}
    </div>
  );
}

function LifecyclePageContent() {
  const [data, setData] = useState<LifecycleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestType, setRequestType] = useState<RequestType>("DELETION");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);

  const statusOptions = requestType === "DELETION" ? DELETION_STATUSES : RECOVERY_STATUSES;

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) { setLoading(true); setError(null); }
      try {
        const params = new URLSearchParams({
          type: requestType,
          limit: String(PAGE_LIMIT),
          offset: String(offset),
        });
        if (status) params.set("status", status);
        const result = await superAdminApi.lifecycleRequests(params);
        if (active) setData(result);
      } catch (reason) {
        if (!active) return;
        const msg =
          reason instanceof ApiError
            ? reason.status === 401
              ? "Sign in with a Super Admin account."
              : reason.status === 403
              ? "Forbidden — Super Admin access required."
              : reason.status === 422
              ? `Validation error: ${reason.message}`
              : reason.message
            : reason instanceof Error
            ? reason.message
            : "Failed to load lifecycle requests.";
        setError(msg);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [requestType, status, offset, retry]);

  function handleTypeChange(type: RequestType) {
    setRequestType(type);
    setStatus(""); // Reset status when type changes
    setOffset(0);
  }

  const hasPrev = offset > 0;
  const hasNext = data ? data.requests.length >= PAGE_LIMIT : false;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Account lifecycle</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Lifecycle Requests</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Platform-wide seller account deletion and recovery requests. Use Workflows below for decisions.
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Live data
        </span>
      </section>

      {/* Type tabs */}
      <div className="flex gap-2" role="group" aria-label="Request type">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleTypeChange(opt.value)}
            className={`h-9 rounded-md px-4 text-sm font-medium transition-colors ${
              requestType === opt.value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <section className="flex flex-wrap gap-3" aria-label="Status filter">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Filter by status"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s === "" ? "All statuses" : s}</option>
          ))}
        </select>
      </section>

      <section className="rounded-xl border border-border bg-card" aria-label="Lifecycle requests">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <h2 className="text-base font-semibold">
            {requestType === "DELETION" ? "Deletion" : "Recovery"} Requests
          </h2>
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

        {!loading && !error && data && <LifecycleTable requests={data.requests} />}

        {!loading && !error && !data && (
          <p className="px-7 py-10 text-sm text-muted-foreground">No data loaded.</p>
        )}

        {data && (
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-7">
            <p className="text-xs text-muted-foreground">
              Showing {offset + 1}–{offset + data.requests.length}
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

export default function LifecyclePage() {
  return (
    <OperatorGate role="super-admin">
      <LifecyclePageContent />
    </OperatorGate>
  );
}
