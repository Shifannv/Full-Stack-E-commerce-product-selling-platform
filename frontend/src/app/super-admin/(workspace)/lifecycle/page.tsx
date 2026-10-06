"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi, type LifecycleRequest } from "@/lib/api/super-admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel } from "@/components/operator/states";
import { OffsetPagination } from "@/components/operator/pagination";
import { StatusBadge, statusLabel } from "@/components/operator/status-badge";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { date } from "@/components/operator/money";
import { Button } from "@/components/ui/button";

type RequestType = "DELETION" | "RECOVERY";
const DELETION_STATUSES = ["REQUESTED", "PENDING", "APPROVED", "REJECTED"];
const RECOVERY_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const PAGE_LIMIT = 20;

function DecisionRow({ request, onDone }: { request: LifecycleRequest; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [kycSubmissionId, setKycSubmissionId] = useState("");
  const [kycRevision, setKycRevision] = useState("");
  const [categoryIds, setCategoryIds] = useState("");

  const mutation = useMutation({
    mutationFn: (decision: "APPROVED" | "REJECTED") =>
      superAdminApi.lifecycleDecision(
        request.adminId,
        request.id,
        request.type === "DELETION" ? "deletion" : "recovery",
        decision,
        reason,
        request.type === "RECOVERY" && decision === "APPROVED"
          ? {
              kycSubmissionId: kycSubmissionId.trim(),
              kycRevision: kycRevision.trim(),
              categoryIds: categoryIds
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : undefined,
      ),
    onSuccess: (_, decision) => {
      toast.success(decision === "APPROVED" ? "Request approved." : "Request rejected.");
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  const pending =
    (request.type === "DELETION" && (request.status === "REQUESTED" || request.status === "PENDING")) ||
    (request.type === "RECOVERY" && request.status === "PENDING");

  if (!pending) return null;

  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Decide
      </Button>
    );

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3">
      <label className="grid gap-1 text-xs">
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          required
          className="min-h-16"
        />
      </label>
      {request.type === "RECOVERY" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs">
            KYC submission ID
            <input value={kycSubmissionId} onChange={(event) => setKycSubmissionId(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs">
            KYC revision
            <input value={kycRevision} onChange={(event) => setKycRevision(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs">
            Category IDs (comma-separated)
            <input value={categoryIds} onChange={(event) => setCategoryIds(event.target.value)} />
          </label>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {request.type === "RECOVERY"
          ? "KYC and category fields are required only when approving."
          : "Rejection is final for this request."}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!reason.trim() || mutation.isPending}
          onClick={() => mutation.mutate("APPROVED")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!reason.trim() || mutation.isPending}
          onClick={() => mutation.mutate("REJECTED")}
        >
          Reject
        </Button>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LifecyclePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const type: RequestType = searchParams.get("type") === "RECOVERY" ? "RECOVERY" : "DELETION";
  const status = searchParams.get("status") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0") || 0;
  const statusOptions = type === "DELETION" ? DELETION_STATUSES : RECOVERY_STATUSES;

  const queryString = new URLSearchParams({
    type,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    ...(status ? { status } : {}),
  }).toString();

  const list = useQuery({
    queryKey: operatorKeys.superLifecycle(queryString),
    queryFn: () => superAdminApi.lifecycleRequests(new URLSearchParams(queryString)),
  });

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("offset");
    router.replace(`/super-admin/lifecycle?${next.toString()}`);
  }

  const columns: Column<LifecycleRequest>[] = [
    {
      key: "admin",
      header: "Seller",
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.userName ?? "(no name)"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.userEmail}</p>
          {row.reason && (
            <p className="mt-1 truncate text-xs text-muted-foreground" title={row.reason}>
              {row.reason}
            </p>
          )}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "requested",
      header: "Requested",
      hideOnCard: true,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (row) => date(row.requestedAt),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (row) => (
        <DecisionRow
          request={row}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["super-admin", "lifecycle"] })}
        />
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Lifecycle requests"
        description="Seller account deletion and recovery requests across the platform."
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div role="group" aria-label="Request type" className="flex gap-2">
            {(["DELETION", "RECOVERY"] as const).map((value) => (
              <Button
                key={value}
                variant={type === value ? "default" : "outline"}
                size="sm"
                aria-pressed={type === value}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set("type", value);
                  next.delete("status");
                  next.delete("offset");
                  router.replace(`/super-admin/lifecycle?${next.toString()}`);
                }}
              >
                {value === "DELETION" ? "Deletion requests" : "Recovery requests"}
              </Button>
            ))}
          </div>
          <select
            value={status}
            onChange={(event) => setParam("status", event.target.value || null)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <DataTable
          caption="Lifecycle requests"
          columns={columns}
          rows={list.data?.requests ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={<EmptyPanel title="No lifecycle requests match these filters" />}
        />
        <OffsetPagination
          offset={offset}
          limit={PAGE_LIMIT}
          rowCount={list.data?.requests.length ?? 0}
          disabled={list.isFetching}
          onChange={(nextOffset) => setParam("offset", String(nextOffset))}
        />
      </Panel>
    </div>
  );
}

export default function LifecyclePage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <LifecyclePageContent />
    </Suspense>
  );
}
