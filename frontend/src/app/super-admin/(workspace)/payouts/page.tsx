"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi, type SuperAdminPayout } from "@/lib/api/super-admin";
import type { Settlement } from "@/lib/api/types";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel } from "@/components/operator/states";
import { FilterBar } from "@/components/operator/filter-bar";
import { OffsetPagination } from "@/components/operator/pagination";
import { StatusBadge, statusLabel } from "@/components/operator/status-badge";
import { ConfirmDialog } from "@/components/operator/confirm-dialog";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { money, date } from "@/components/operator/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAYOUT_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "PAID"];
const SETTLEMENT_STATUSES = ["AVAILABLE", "PAYOUT_PENDING", "PAID", "HELD"];
const PAGE_LIMIT = 20;

type DecisionTarget = { payoutId: string; decision: "APPROVED" | "REJECTED" };

function PayoutsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [paidTarget, setPaidTarget] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState("");

  const status = searchParams.get("status") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0") || 0;
  const queryString = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    ...(status ? { status } : {}),
  }).toString();

  const list = useQuery({
    queryKey: operatorKeys.superPayouts(queryString),
    queryFn: () => superAdminApi.payouts(new URLSearchParams(queryString)),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "payouts"] });
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "settlements"] });
  }

  const decisionMutation = useMutation({
    mutationFn: ({ payoutId, decision }: DecisionTarget) =>
      superAdminApi.payoutDecision(payoutId, decision, decisionNotes),
    onSuccess: (_, { decision }) => {
      toast.success(decision === "APPROVED" ? "Payout approved." : "Payout rejected.");
      invalidate();
      setDecisionTarget(null);
      setDecisionNotes("");
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  const paidMutation = useMutation({
    mutationFn: (payoutId: string) => superAdminApi.payoutPaid(payoutId, paymentReference),
    onSuccess: () => {
      toast.success("Payout recorded as paid.");
      invalidate();
      setPaidTarget(null);
      setPaymentReference("");
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  const columns: Column<SuperAdminPayout>[] = [
    {
      key: "amount",
      header: "Amount",
      primary: true,
      cell: (row) => (
        <div>
          <p className="op-num font-medium">{money(row.amount)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Requested {date(row.requestedAt)}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "reference",
      header: "Payment reference",
      hideOnCard: true,
      cell: (row) => row.paymentReference ?? "—",
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {row.status === "REQUESTED" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDecisionTarget({ payoutId: row.id, decision: "APPROVED" })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDecisionTarget({ payoutId: row.id, decision: "REJECTED" })}
              >
                Reject
              </Button>
            </>
          )}
          {row.status === "APPROVED" && (
            <Button size="sm" onClick={() => setPaidTarget(row.id)}>
              Record paid
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Panel title="Payout requests">
      <FilterBar
        selects={[
          {
            name: "status",
            label: "Status",
            options: PAYOUT_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
          },
        ]}
        cursorParam="offset"
      />
      <DataTable
        caption="Payout requests"
        columns={columns}
        rows={list.data?.payouts ?? null}
        rowKey={(row) => row.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={
          <EmptyPanel title="No payout requests match these filters">
            {status ? "Try a different status." : "Seller payout requests will appear here."}
          </EmptyPanel>
        }
      />
      <OffsetPagination
        offset={offset}
        limit={PAGE_LIMIT}
        rowCount={list.data?.payouts.length ?? 0}
        disabled={list.isFetching}
        onChange={(nextOffset) => {
          const next = new URLSearchParams(searchParams);
          next.set("offset", String(nextOffset));
          router.replace(`/super-admin/payouts?${next.toString()}`);
        }}
      />

      <ConfirmDialog
        open={decisionTarget !== null}
        onOpenChange={(open) => !open && setDecisionTarget(null)}
        title={decisionTarget?.decision === "APPROVED" ? "Approve payout" : "Reject payout"}
        description="This decision is recorded against the payout request and cannot be withdrawn from here."
        confirmLabel={decisionTarget?.decision === "APPROVED" ? "Approve payout" : "Reject payout"}
        destructive={decisionTarget?.decision === "REJECTED"}
        busy={decisionMutation.isPending}
        onConfirm={() => decisionTarget && decisionMutation.mutate(decisionTarget)}
      >
        <label className="grid gap-1.5 text-sm">
          Notes
          <textarea
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            required
            maxLength={1000}
            placeholder="Reason for this decision"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={paidTarget !== null}
        onOpenChange={(open) => !open && setPaidTarget(null)}
        title="Record payout as paid"
        description="Record the reference for the manual transfer you already completed outside this platform. This does not move money."
        confirmLabel="Record as paid"
        busy={paidMutation.isPending}
        confirmDisabled={!paymentReference.trim()}
        onConfirm={() => paidTarget && paidMutation.mutate(paidTarget)}
      >
        <label className="grid gap-1.5 text-sm">
          Payment reference
          <Input
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value)}
            required
            maxLength={200}
            placeholder="Bank transfer UTR, cheque number, etc."
          />
        </label>
      </ConfirmDialog>
    </Panel>
  );
}

function SettlementsPanel() {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const queryString = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    ...(status ? { status } : {}),
  }).toString();

  const list = useQuery({
    queryKey: operatorKeys.superSettlements(queryString),
    queryFn: () => superAdminApi.settlements(new URLSearchParams(queryString)),
  });

  const columns: Column<Settlement>[] = [
    {
      key: "order",
      header: "Order item",
      primary: true,
      cell: (row) => (
        <p className="font-mono text-xs text-muted-foreground">{row.orderItemId.slice(0, 8)}…</p>
      ),
    },
    { key: "gross", header: "Gross Product Sales", className: "text-right", cell: (row) => money(row.grossAmount) },
    { key: "commission", header: "Commission", className: "text-right", cell: (row) => money(row.commissionAmount) },
    { key: "gateway", header: "Payment Gateway Fee", className: "text-right", cell: (row) => money(row.gatewayFeeAmount) },
    { key: "refund", header: "Refund Adjustment", className: "text-right", cell: (row) => money(row.refundAdjustmentAmount) },
    { key: "net", header: "Net Payable", className: "text-right font-medium", cell: (row) => money(row.netPayable) },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <Panel
      title="Settlement history"
      actions={
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setOffset(0);
          }}
          className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          aria-label="Settlement status"
        >
          <option value="">All statuses</option>
          {SETTLEMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      }
    >
      <DataTable
        caption="Settlement history"
        columns={columns}
        rows={list.data?.settlements ?? null}
        rowKey={(row) => row.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={<EmptyPanel title="No settlements recorded yet" />}
      />
      <OffsetPagination
        offset={offset}
        limit={PAGE_LIMIT}
        rowCount={list.data?.settlements.length ?? 0}
        disabled={list.isFetching}
        onChange={setOffset}
      />
    </Panel>
  );
}

function PayoutsPageContent() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Finance"
        description="Gross Product Sales, Commission, Payment Gateway Fee and Refund Adjustment combine into each seller's Net Payable. Payout requests are decided and recorded here."
      />
      <PayoutsPanel />
      <SettlementsPanel />
    </div>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <PayoutsPageContent />
    </Suspense>
  );
}
