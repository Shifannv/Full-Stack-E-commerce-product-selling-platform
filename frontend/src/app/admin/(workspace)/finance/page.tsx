"use client";

import { Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, StatStrip } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel, ErrorPanel } from "@/components/operator/states";
import { StatusBadge } from "@/components/operator/status-badge";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { money, date } from "@/components/operator/money";
import { Button } from "@/components/ui/button";
import { useOperatorActor } from "@/components/operator/operator-actor";
import { ApiError } from "@/lib/api/client";
import type { Settlement, PayoutRequest, RefundObligation } from "@/lib/api/types";

function FinancePageContent() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const actor = useOperatorActor();
  const canRequestPayout = actor.permissions.includes("payouts.request");

  const finance = useQuery({
    queryKey: operatorKeys.adminFinance(),
    queryFn: () => adminApi.finance(),
  });

  const payoutMut = useMutation({
    mutationFn: () => adminApi.requestPayout(),
    onSuccess: () => {
      toast.success("Payout requested successfully.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "finance"] });
    },
    onError: (error) => {
      const described = describeApiError(error, "mutation");
      toast.error(error instanceof ApiError && error.status === 409 ? error.message : described.message);
    },
  });

  if (finance.isLoading) return <LoadingPanel label="Loading finance" />;
  if (finance.isError) return <ErrorPanel error={finance.error} onRetry={() => void finance.refetch()} />;
  if (!finance.data) return null;

  const { availableBalance, settlements, payouts, refundObligations } = finance.data;

  const settlementColumns: Column<Settlement>[] = [
    {
      key: "order",
      header: "Order",
      primary: true,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.orderId.slice(0, 8)}…</span>
      ),
    },
    {
      key: "gross",
      header: "Gross Product Sales",
      className: "tabular-nums text-right text-sm",
      cell: (row) => money(row.grossAmount),
    },
    {
      key: "commission",
      header: "Commission",
      className: "tabular-nums text-right text-sm text-(--tone-bad-fg)",
      cell: (row) => `−${money(row.commissionAmount)}`,
    },
    {
      key: "gateway",
      header: "Payment Gateway Fee",
      hideOnCard: true,
      className: "tabular-nums text-right text-sm text-(--tone-bad-fg)",
      cell: (row) => `−${money(row.gatewayFeeAmount)}`,
    },
    {
      key: "refund",
      header: "Refund Adjustment",
      hideOnCard: true,
      className: "tabular-nums text-right text-sm text-(--tone-bad-fg)",
      cell: (row) => row.refundAdjustmentAmount !== "0" ? `−${money(row.refundAdjustmentAmount)}` : "—",
    },
    {
      key: "net",
      header: "Net Payable",
      className: "tabular-nums text-right text-sm font-semibold",
      cell: (row) => money(row.netPayable),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "date",
      header: "Date",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => date(row.createdAt),
    },
  ];

  const payoutColumns: Column<PayoutRequest>[] = [
    {
      key: "amount",
      header: "Amount",
      primary: true,
      className: "tabular-nums font-semibold",
      cell: (row) => money(row.amount),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "requested",
      header: "Requested",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => date(row.requestedAt),
    },
    {
      key: "notes",
      header: "Review notes",
      cell: (row) => row.reviewNotes ? (
        <span className="text-xs text-muted-foreground">{row.reviewNotes}</span>
      ) : null,
    },
  ];

  const refundColumns: Column<RefundObligation>[] = [
    {
      key: "order",
      header: "Order",
      primary: true,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.orderId.slice(0, 8)}…</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "tabular-nums text-right text-sm font-medium",
      cell: (row) => money(row.amount),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Finance" description="Your earnings, settlement history, and payout requests." />

      <StatStrip
        stats={[
          {
            label: "Available balance",
            value: money(availableBalance),
            note: canRequestPayout ? "Ready to request" : "View only",
          },
          { label: "Settlements", value: settlements.length, note: "All time" },
          { label: "Payout requests", value: payouts.length },
          { label: "Refund obligations", value: refundObligations.length },
        ]}
      />

      <Panel
        title="Request payout"
        actions={
          canRequestPayout ? (
            <Button
              size="sm"
              disabled={payoutMut.isPending}
              onClick={() => payoutMut.mutate()}
            >
              {payoutMut.isPending ? "Requesting…" : "Request payout"}
            </Button>
          ) : undefined
        }
      >
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {canRequestPayout
            ? `Requests your available balance (${money(availableBalance)}) as a payout.`
            : "You have view access. Payout requests require the payouts.request permission."}
        </p>
      </Panel>

      <Panel title="Settlements">
        <DataTable
          caption="Settlements"
          columns={settlementColumns}
          rows={settlements}
          rowKey={(row) => row.id}
          loading={false}
          empty={<EmptyPanel title="No settlements yet." />}
        />
      </Panel>

      <Panel title="Payout requests">
        <DataTable
          caption="Payout requests"
          columns={payoutColumns}
          rows={payouts}
          rowKey={(row) => row.id}
          loading={false}
          empty={<EmptyPanel title="No payout requests." />}
        />
      </Panel>

      {refundObligations.length > 0 && (
        <Panel title="Refund obligations">
          <DataTable
            caption="Refund obligations"
            columns={refundColumns}
            rows={refundObligations}
            rowKey={(row) => row.refundId}
            loading={false}
            empty={<EmptyPanel title="No refund obligations." />}
          />
        </Panel>
      )}
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <FinancePageContent />
    </Suspense>
  );
}
