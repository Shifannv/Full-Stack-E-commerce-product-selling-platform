"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, DetailList } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel, ErrorPanel } from "@/components/operator/states";
import { OffsetPagination } from "@/components/operator/pagination";
import { StatusBadge } from "@/components/operator/status-badge";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { money, dateTime, date } from "@/components/operator/money";
import { Button } from "@/components/ui/button";
import { useOperatorActor } from "@/components/operator/operator-actor";
import type { AdminReturnRow } from "@/lib/api/types";

const PAGE_LIMIT = 20;
const STATUS_OPTIONS = [
  "REQUESTED",
  "APPROVED",
  "RETURN_PENDING",
  "RECEIVED",
  "QC_IN_PROGRESS",
  "QC_APPROVED",
  "QC_REJECTED",
  "REFUND_PROCESSING",
  "REFUNDED",
  "RETURN_ISSUE",
  "REJECTED",
] as const;

function ReturnDetailPanel({ returnId, onClose }: { returnId: string; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const actor = useOperatorActor();
  const canUpdateReturns = actor.permissions.includes("orders.update");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [qcNotes, setQcNotes] = useState("");

  const detail = useQuery({
    queryKey: operatorKeys.adminReturn(returnId),
    queryFn: () => adminApi.returnStatus(returnId),
  });

  const receivedMut = useMutation({
    mutationFn: () => adminApi.receivedReturn(returnId),
    onSuccess: () => {
      toast.success("Return marked as received.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  const inspectMut = useMutation({
    mutationFn: (decision: "APPROVED" | "REJECTED") =>
      adminApi.inspectReturn(returnId, decision, decision === "APPROVED" ? "PASS" : "FAIL", qcNotes),
    onSuccess: (_, decision) => {
      toast.success(decision === "APPROVED" ? "QC approved." : "QC rejected.");
      setQcNotes("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  const decideMut = useMutation({
    mutationFn: (approve: boolean) => adminApi.decideReturn(returnId, approve, decisionNotes),
    onSuccess: (_, approve) => {
      toast.success(approve ? "Return approved." : "Return rejected.");
      setDecisionNotes("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  if (detail.isLoading) return <LoadingPanel label="Loading return" />;
  if (detail.isError) return <ErrorPanel error={detail.error} context="record" />;
  const r = detail.data;
  if (!r) return null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="op-section-title">Return {r.id.slice(0, 8)}…</h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          <button type="button" className="op-link text-xs" onClick={onClose}>Close</button>
        </div>
      </div>

      <DetailList items={[
        { label: "Order", value: r.orderId.slice(0, 8) + "…" },
        { label: "Gross refund", value: r.grossRefundAmount ? money(r.grossRefundAmount) : "—" },
        { label: "Net refund", value: r.netRefundAmount ? money(r.netRefundAmount) : "—" },
      ]} />

      {/* Actions by state */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {!canUpdateReturns && (
          <p className="text-xs text-muted-foreground">
            You have view access. Return updates require the orders.update permission.
          </p>
        )}
        {canUpdateReturns && r.status === "APPROVED" && (
          <Button size="sm" disabled={receivedMut.isPending} onClick={() => receivedMut.mutate()}>
            Mark received
          </Button>
        )}
        {canUpdateReturns && r.status === "REQUESTED" && (
          <div className="grid w-full gap-2">
            <label className="grid gap-1 text-xs">
              Decision notes
              <textarea
                value={decisionNotes}
                onChange={(event) => setDecisionNotes(event.target.value)}
                required
                maxLength={1000}
                className="min-h-16"
                placeholder="Explain the approval or rejection…"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!decisionNotes.trim() || decideMut.isPending}
                onClick={() => decideMut.mutate(true)}
              >
                Approve return
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!decisionNotes.trim() || decideMut.isPending}
                onClick={() => decideMut.mutate(false)}
              >
                Reject return
              </Button>
            </div>
          </div>
        )}
        {canUpdateReturns && r.status === "RECEIVED" && (
          <div className="grid w-full gap-2">
            <label className="grid gap-1 text-xs">
              QC notes
              <textarea
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                required
                maxLength={2000}
                className="min-h-16"
                placeholder="Describe the condition…"
              />
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!qcNotes.trim() || inspectMut.isPending}
                onClick={() => inspectMut.mutate("APPROVED")}
              >
                QC pass
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!qcNotes.trim() || inspectMut.isPending}
                onClick={() => inspectMut.mutate("REJECTED")}
              >
                QC fail
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReturnsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const status = searchParams.get("status") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0") || 0;

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "offset") next.delete("offset");
    router.replace(`/admin/returns?${next.toString()}`);
  }

  const queryStr = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    ...(status ? { status } : {}),
  }).toString();

  const list = useQuery({
    queryKey: operatorKeys.adminReturns(queryStr),
    queryFn: () => adminApi.returns(new URLSearchParams(queryStr)),
  });

  const columns: Column<AdminReturnRow>[] = [
    {
      key: "return",
      header: "Return",
      primary: true,
      cell: (row) => (
        <button type="button" className="min-w-0 text-left" onClick={() => setParam("id", row.id)}>
          <p className="op-link font-mono text-xs">{row.id.slice(0, 8)}…</p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[20ch]">{row.reason}</p>
          {row.returnWindowEndsAt && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Window ends {date(row.returnWindowEndsAt)}
            </p>
          )}
        </button>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "refund",
      header: "Refund",
      className: "tabular-nums text-right text-sm",
      cell: (row) => row.netRefundAmount ? money(row.netRefundAmount) : "—",
    },
    {
      key: "requested",
      header: "Requested",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => dateTime(row.requestedAt),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Returns" description="Customer return requests for your products." />

      {selectedId && (
        <Panel>
          <div className="p-4">
            <ReturnDetailPanel returnId={selectedId} onClose={() => setParam("id", null)} />
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <select
            value={status}
            onChange={(e) => setParam("status", e.target.value || null)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <DataTable
          caption="Returns"
          columns={columns}
          rows={list.data?.returns ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={<EmptyPanel title="No returns match these filters." />}
        />
        <OffsetPagination
          offset={offset}
          limit={PAGE_LIMIT}
          rowCount={list.data?.returns.length ?? 0}
          disabled={list.isFetching}
          onChange={(nextOffset) => setParam("offset", String(nextOffset))}
        />
      </Panel>
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <ReturnsPageContent />
    </Suspense>
  );
}
