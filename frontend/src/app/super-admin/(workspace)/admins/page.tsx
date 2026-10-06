"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi, type AdminRow } from "@/lib/api/super-admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { ProvisionSeller, SellerReview } from "@/components/layout/seller-review";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel } from "@/components/operator/states";
import { FilterBar } from "@/components/operator/filter-bar";
import { OffsetPagination } from "@/components/operator/pagination";
import { StatusBadge, statusLabel } from "@/components/operator/status-badge";
import { date } from "@/components/operator/money";

const STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_SUPER_ADMIN_APPROVAL",
  "CHANGES_REQUIRED",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
];

const PAGE_LIMIT = 20;

function buildColumns(onReview: (adminId: string) => void): Column<AdminRow>[] {
  return [
    {
      key: "name",
      header: "Seller",
      primary: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => onReview(row.id)}
          className="min-w-0 text-left"
        >
          <p className="truncate font-medium op-link">{row.userName ?? "(no name)"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.userEmail}</p>
        </button>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "created",
      header: "Created",
      hideOnCard: true,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (row) => date(row.createdAt),
    },
  ];
}

function AdminsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const status = searchParams.get("status") ?? "";
  const q = searchParams.get("q") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0") || 0;
  const selected = searchParams.get("id");

  const queryString = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
  }).toString();

  const list = useQuery({
    queryKey: operatorKeys.superAdmins(queryString),
    queryFn: () => superAdminApi.admins(new URLSearchParams(queryString)),
  });

  function openReview(adminId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (adminId) next.set("id", adminId);
    else next.delete("id");
    router.push(`/super-admin/admins?${next.toString()}`);
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "admins"] });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sellers"
        description="Provision internal seller accounts and review their onboarding applications."
      />

      <ProvisionSeller
        onCreated={(id) => {
          invalidate();
          openReview(id);
        }}
      />

      {selected && (
        <SellerReview
          key={selected}
          adminId={selected}
          onClose={() => openReview(null)}
          onUpdated={invalidate}
        />
      )}

      <Panel>
        <FilterBar
          searchPlaceholder="Search name or email…"
          selects={[
            {
              name: "status",
              label: "Status",
              options: STATUSES.map((value) => ({ value, label: statusLabel(value) })),
            },
          ]}
          cursorParam="offset"
        />
        <DataTable
          caption="Seller accounts"
          columns={buildColumns(openReview)}
          rows={list.data?.admins ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          selectedKey={selected}
          empty={
            <EmptyPanel title="No sellers match these filters">
              {status || q
                ? "Try a different search term or status."
                : "Provisioned sellers will appear here once created."}
            </EmptyPanel>
          }
        />
        <OffsetPagination
          offset={offset}
          limit={PAGE_LIMIT}
          rowCount={list.data?.admins.length ?? 0}
          disabled={list.isFetching}
          onChange={(nextOffset) => {
            const next = new URLSearchParams(searchParams);
            next.set("offset", String(nextOffset));
            router.replace(`/super-admin/admins?${next.toString()}`);
          }}
        />
      </Panel>
    </div>
  );
}

export default function AdminsPage() {
  return (
    <Suspense>
      <AdminsPageContent />
    </Suspense>
  );
}
