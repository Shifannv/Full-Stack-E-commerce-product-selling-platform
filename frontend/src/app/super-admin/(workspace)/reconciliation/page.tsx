"use client";

import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/super-admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/operator/states";
import { CursorPagination } from "@/components/operator/pagination";
import { StatusBadge } from "@/components/operator/status-badge";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { dateTime } from "@/components/operator/money";
import { Button } from "@/components/ui/button";

const PAGE_LIMIT = 50;
const DOMAIN_OPTIONS = ["PAYMENT", "REFUND", "FINANCE"] as const;

// ─── inline action row ───────────────────────────────────────────────────────

type ActionKind = "resolve" | "escalate";

function ActionRow({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: (kind: ActionKind) =>
      kind === "resolve"
        ? superAdminApi.resolveReconciliation(itemId, note)
        : superAdminApi.escalateReconciliation(itemId, note),
    onSuccess: (_, kind) => {
      toast.success(kind === "resolve" ? "Item marked resolved." : "Item escalated.");
      setOpen(null);
      setNote("");
      onDone();
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  if (!open)
    return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setOpen("resolve")}>
          Resolve
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen("escalate")}>
          Escalate
        </Button>
      </div>
    );

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3">
      <label className="grid gap-1 text-xs">
        {open === "resolve" ? "Resolution" : "Escalation"} note
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          required
          placeholder="Describe what was verified or what needs escalation…"
          className="min-h-[4.5rem]"
          autoFocus
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {open === "resolve"
          ? "Resolution is final — the item leaves the unresolved queue."
          : "Escalation routes the item for a second review."}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={open === "resolve" ? "default" : "destructive"}
          disabled={!note.trim() || mutation.isPending}
          onClick={() => mutation.mutate(open)}
        >
          {open === "resolve" ? "Mark resolved" : "Escalate"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => { setOpen(null); setNote(""); }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── page content ─────────────────────────────────────────────────────────────

function ReconciliationPageContent() {
  const queryClient = useQueryClient();

  const [domain, setDomain] = useState("");
  // Cursor-based pagination — preserve after_id UUID, do NOT convert to offset
  const [afterId, setAfterId] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]); // stack of previous after_id values

  function buildQuery() {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (domain) params.set("domain", domain);
    if (afterId) params.set("after_id", afterId);
    return params;
  }

  const queryStr = buildQuery().toString();

  const list = useQuery({
    queryKey: operatorKeys.superReconciliation(queryStr),
    queryFn: () => superAdminApi.reconciliation(buildQuery()),
  });

  function handleDomainChange(value: string) {
    setDomain(value);
    setAfterId(undefined);
    setHistory([]);
  }

  function handleNext() {
    if (!list.data?.items.length) return;
    const lastId = list.data.items[list.data.items.length - 1]?.id;
    if (!lastId) return;
    setHistory((prev) => [...prev, afterId ?? ""]);
    setAfterId(lastId);
  }

  function handleBack() {
    const prev = [...history];
    const prevId = prev.pop();
    setHistory(prev);
    setAfterId(prevId === "" ? undefined : prevId);
  }

  const hasPrev = history.length > 0;

  type ReconciliationItemRow = NonNullable<typeof list.data>["items"][number];

  const columns: Column<ReconciliationItemRow>[] = [
    {
      key: "item",
      header: "Item",
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {row.domain}
            </span>
            <span className="text-xs text-muted-foreground">{row.type}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground" title={row.entityId}>
            entity {row.entityId.slice(0, 8)}…
          </p>
          {row.lastError && (
            <p
              className="mt-1 max-w-[28ch] truncate text-[11px] text-muted-foreground"
              title={row.lastError}
            >
              {row.lastError}
            </p>
          )}
          {row.state === "REVIEW" && row.resolutionNote && (
            <p className="mt-2 max-w-prose break-words text-xs text-foreground">
              <span className="font-medium">Review note: </span>
              {row.resolutionNote}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1.5">
          <StatusBadge status={row.state} />
          {(row.state === "PENDING" || row.state === "RETRYABLE") && (
            <span className="text-[10px] text-muted-foreground">Automatic</span>
          )}
          {row.state === "REVIEW" && (
            <span className="text-[10px] font-medium text-(--tone-warn-fg)">Manual action needed</span>
          )}
        </div>
      ),
    },
    {
      key: "retries",
      header: "Retries",
      hideOnCard: true,
      className: "tabular-nums text-center text-sm",
      cell: (row) => (
        <span className={row.retryCount > 0 ? "text-(--tone-warn-fg) font-medium" : "text-muted-foreground"}>
          {row.retryCount}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => dateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      className: "min-w-[18rem]",
      cell: (row) =>
        row.state === "REVIEW" ? (
          <ActionRow
            itemId={row.id}
            onDone={() => void queryClient.invalidateQueries({ queryKey: ["super-admin", "reconciliation"] })}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Automatic</span>
        ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Reconciliation"
        description="Finance-integrity items that need attention. PENDING and RETRYABLE items retry automatically; REVIEW items require a manual decision."
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div role="group" aria-label="Domain filter" className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={domain === "" ? "default" : "outline"}
              aria-pressed={domain === ""}
              onClick={() => handleDomainChange("")}
            >
              All domains
            </Button>
            {DOMAIN_OPTIONS.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={domain === d ? "default" : "outline"}
                aria-pressed={domain === d}
                onClick={() => handleDomainChange(d)}
              >
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
          {list.data && (
            <p className="text-xs text-muted-foreground">
              {list.data.count} item{list.data.count !== 1 ? "s" : ""} on this page
            </p>
          )}
        </div>

        <DataTable
          caption="Reconciliation items"
          columns={columns}
          rows={list.data?.items ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={
            <EmptyPanel title="No unresolved reconciliation items">
              {domain ? "Try clearing the domain filter." : "The queue is clear."}
            </EmptyPanel>
          }
        />

        <CursorPagination
          canGoBack={hasPrev}
          rowCount={list.data?.items.length ?? 0}
          limit={PAGE_LIMIT}
          disabled={list.isFetching}
          onBack={handleBack}
          onNext={handleNext}
        />
      </Panel>

      {list.isError && (
        <ErrorPanel error={list.error} onRetry={() => void list.refetch()} />
      )}

      {!list.isLoading && !list.isError && !list.data && <LoadingPanel />}
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <ReconciliationPageContent />
    </Suspense>
  );
}
