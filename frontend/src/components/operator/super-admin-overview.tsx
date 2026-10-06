"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, StatStrip } from "./page-header";
import { LoadingPanel, ErrorPanel } from "./states";
import { money } from "./money";

type AlertTile = { label: string; value: number; href: string; note: string };

/**
 * Platform overview. Every number is read from `GET /api/super-admin/summary`; alert tiles deep
 * link straight to the already-filtered queue so "what needs me right now" is one click away.
 * The backend has no time-series endpoint, so trend reporting is a documented gap, not a guess.
 */
export function SuperAdminOverview() {
  const summary = useQuery({
    queryKey: operatorKeys.superSummary(),
    queryFn: () => superAdminApi.summary(),
  });

  const alerts: AlertTile[] | null = summary.data
    ? [
        {
          label: "Pending seller approvals",
          value: summary.data.admins.pending,
          href: "/super-admin/admins?status=PENDING_SUPER_ADMIN_APPROVAL",
          note: "Applications awaiting a decision",
        },
        {
          label: "Pending KYC",
          value: summary.data.onboarding.pendingKycApplications,
          href: "/super-admin/admins?status=PENDING_SUPER_ADMIN_APPROVAL",
          note: "Submitted identity documents to review",
        },
        {
          label: "Pending payouts",
          value: summary.data.finance.pendingPayoutRequests,
          href: "/super-admin/payouts?status=REQUESTED",
          note: "Seller payout requests to decide",
        },
      ]
    : null;

  return (
    <div className="grid gap-6">
      <PageHeader title="Platform overview" description="What is happening across Ownline Dropship right now." />

      {summary.isLoading && <Panel><LoadingPanel label="Loading platform overview" /></Panel>}
      {summary.isError && (
        <Panel>
          <ErrorPanel error={summary.error} onRetry={() => void summary.refetch()} />
        </Panel>
      )}

      {summary.data && (
        <>
          <StatStrip
            stats={[
              { label: "Active sellers", value: summary.data.admins.active, note: `${summary.data.admins.total} total` },
              { label: "Published products", value: summary.data.catalog.publishedProducts },
              { label: "Orders", value: summary.data.orders.total, note: "Platform total" },
              { label: "Gross settled sales", value: money(summary.data.finance.grossSettledSales) },
            ]}
          />

          {alerts && alerts.some((alert) => alert.value > 0) && (
            <Panel title="Needs your attention">
              <ul className="divide-y divide-border">
                {alerts
                  .filter((alert) => alert.value > 0)
                  .map((alert) => (
                    <li key={alert.label}>
                      <Link
                        href={alert.href}
                        className="flex items-center justify-between gap-4 px-4 py-3.5 text-sm hover:bg-[color-mix(in_srgb,var(--secondary)_35%,transparent)]"
                      >
                        <span>
                          <span className="font-medium">{alert.label}</span>
                          <span className="ml-2 text-muted-foreground">{alert.note}</span>
                        </span>
                        <span className="op-num rounded-full bg-(--tone-warn-bg) px-2.5 py-0.5 text-sm font-semibold text-(--tone-warn-fg)">
                          {alert.value}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Panel>
          )}
          {alerts && alerts.every((alert) => alert.value === 0) && (
            <Panel>
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nothing is waiting on a decision right now.
              </p>
            </Panel>
          )}

          <p className="text-xs text-muted-foreground">
            Reconciliation items needing review and open lifecycle requests are tracked on their
            own pages — see Reconciliation and Lifecycle requests in the sidebar.
          </p>
        </>
      )}
    </div>
  );
}
