"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, StatStrip } from "./page-header";
import { LoadingPanel, ErrorPanel } from "./states";
import { StatusBadge } from "./status-badge";
import { money } from "./money";

/**
 * Seller dashboard. Every figure is read from `GET /api/admin/summary` and `GET /api/admin/finance`
 * — no derived or invented metric. The backend has no time-series endpoint yet, so the
 * "performance over time" a dashboard would usually show is reported as a gap, not faked.
 */
export function AdminOverview() {
  const summary = useQuery({
    queryKey: operatorKeys.adminSummary(),
    queryFn: () => adminApi.summary(),
  });
  const onboarding = useQuery({
    queryKey: operatorKeys.onboarding(),
    queryFn: () => adminApi.onboarding(),
  });
  const returns = useQuery({
    queryKey: operatorKeys.adminReturns("status=REQUESTED&limit=5"),
    queryFn: () =>
      adminApi.returns(new URLSearchParams({ status: "REQUESTED", limit: "5" })),
  });

  const profile = onboarding.data?.profile;
  const needsAction =
    profile?.status === "CHANGES_REQUIRED" || profile?.status === "DRAFT";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Your workspace"
        description="A clear view of your catalog, orders and payouts."
      />

      {profile && profile.status !== "ACTIVE" && (
        <Panel className="border-(--tone-warn-fg)/30 bg-(--tone-warn-bg)">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-(--tone-warn-fg)">
                Seller profile: <StatusBadge status={profile.status} />
              </p>
              {onboarding.data?.application?.reviewNotes && (
                <p className="mt-1 max-w-prose text-sm text-(--tone-warn-fg)">
                  {onboarding.data.application.reviewNotes}
                </p>
              )}
            </div>
            <Link href="/admin/onboarding" className="op-link text-sm font-medium">
              {needsAction ? "Finish onboarding" : "Review onboarding"}
            </Link>
          </div>
        </Panel>
      )}

      {summary.isLoading && <Panel><LoadingPanel label="Loading dashboard" /></Panel>}
      {summary.isError && (
        <Panel>
          <ErrorPanel error={summary.error} onRetry={() => void summary.refetch()} />
        </Panel>
      )}

      {summary.data && (
        <>
          <StatStrip
            stats={[
              {
                label: "Available balance",
                value: money(summary.data.finance.availableBalance),
                note: "From settlements",
                href: "/admin/finance",
              },
              {
                label: "Gross settled sales",
                value: money(summary.data.finance.grossSettledSales),
                note: "Lifetime settled",
              },
              {
                label: "Products",
                value: summary.data.products.total,
                note: "Your assigned catalog",
                href: "/admin/products",
              },
              {
                label: "Orders",
                value: summary.data.orders.total,
                note: `${summary.data.orders.confirmedPaid} paid & confirmed`,
                href: "/admin/orders",
              },
              {
                label: "Pending payouts",
                value: summary.data.finance.pendingPayoutRequests,
                note: "Awaiting Super Admin",
                href: "/admin/finance",
              },
            ]}
          />

          <Panel
            title="Returns needing attention"
            actions={
              <Link href="/admin/returns" className="op-link text-sm">
                Open returns
              </Link>
            }
          >
            {returns.isLoading && <LoadingPanel label="Loading returns" />}
            {returns.isError && <ErrorPanel error={returns.error} />}
            {returns.data && returns.data.returns.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No return requests are waiting on you right now.
              </p>
            )}
            {returns.data && returns.data.returns.length > 0 && (
              <ul className="divide-y divide-border">
                {returns.data.returns.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      Order {row.orderNumber ?? row.orderId.slice(0, 8)} · {row.reason}
                    </span>
                    <StatusBadge status={row.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-xs text-muted-foreground">
            A sales-over-time chart will appear once the backend exposes a time-series endpoint.
          </p>
        </>
      )}
    </div>
  );
}
