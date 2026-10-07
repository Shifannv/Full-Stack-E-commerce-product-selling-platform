"use client";

import { Suspense } from "react";
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
import { money, date } from "@/components/operator/money";
import { Button } from "@/components/ui/button";
import { useOperatorActor } from "@/components/operator/operator-actor";
import type { AdminProductSummary, AdminProductDetail } from "@/lib/api/types";

const PAGE_LIMIT = 20;
const STATUS_OPTIONS = ["DRAFT", "PUBLISHED", "ARCHIVED"];

// ─── product detail panel ─────────────────────────────────────────────────────

function ProductDetailPanel({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const actor = useOperatorActor();
  const canUpdateProduct = actor.permissions.includes("products.update");

  const detail = useQuery({
    queryKey: operatorKeys.adminProduct(productId),
    queryFn: () => adminApi.product(productId),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
      adminApi.updateProduct(productId, { status }),
    onSuccess: () => {
      toast.success("Product status updated.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      void queryClient.invalidateQueries({ queryKey: operatorKeys.adminProduct(productId) });
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  if (detail.isLoading) return <LoadingPanel label="Loading product" />;
  if (detail.isError)
    return <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} context="record" />;

  const p = detail.data as AdminProductDetail;
  if (!p) return null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="op-section-title">{p.name}</h2>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{p.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>

      <DetailList
        items={[
          { label: "Price", value: money(p.price) },
          { label: "Currency", value: p.currency },
          { label: "SKU", value: p.sku ?? "—" },
          { label: "Return enabled", value: p.returnEnabled ? "Yes" : "No" },
          { label: "Featured", value: p.featured ? "Yes" : "No" },
          { label: "Weight (kg)", value: p.weightKg ?? "—" },
          { label: "Created", value: date(p.createdAt) },
        ]}
      />

      {p.description && (
        <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">{p.description}</div>
      )}

      {p.variants && p.variants.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Variants ({p.variants.length})
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {p.variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div>
                  <span className="font-medium">{v.title}</span>
                  {v.sku && <span className="ml-2 text-xs text-muted-foreground">SKU: {v.sku}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {v.price && <span className="text-xs">{money(v.price)}</span>}
                  <StatusBadge status={v.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status transitions */}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {!canUpdateProduct && (
          <p className="text-xs text-muted-foreground">
            You have view access. Status changes require the products.update permission.
          </p>
        )}
        {canUpdateProduct && STATUS_OPTIONS.filter((s) => s !== p.status).map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            disabled={statusMutation.isPending}
            onClick={() => statusMutation.mutate(s as "DRAFT" | "PUBLISHED" | "ARCHIVED")}
          >
            Move to {s.toLowerCase()}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── page content ─────────────────────────────────────────────────────────────

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedId = searchParams.get("id");
  const status = searchParams.get("status") ?? "";
  const offset = Number(searchParams.get("offset") ?? "0") || 0;

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "offset") next.delete("offset");
    router.replace(`/admin/products?${next.toString()}`);
  }

  const queryStr = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    ...(status ? { status } : {}),
  }).toString();

  const list = useQuery({
    queryKey: operatorKeys.adminProducts(queryStr),
    queryFn: () => adminApi.products(new URLSearchParams(queryStr)),
  });

  const columns: Column<AdminProductSummary>[] = [
    {
      key: "name",
      header: "Product",
      primary: true,
      cell: (row) => (
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => setParam("id", row.id)}
        >
          <p className="op-link truncate font-medium">{row.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.slug}</p>
        </button>
      ),
    },
    {
      key: "price",
      header: "Price",
      className: "tabular-nums text-right text-sm",
      cell: (row) => money(row.price),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "created",
      header: "Created",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => date(row.createdAt),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Products"
        description="Your product catalog — published, draft and archived listings."
      />

      {selectedId && (
        <Panel>
          <div className="p-4">
            <ProductDetailPanel
              productId={selectedId}
              onClose={() => setParam("id", null)}
            />
          </div>
        </Panel>
      )}

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <select
            value={status}
            onChange={(event) => setParam("status", event.target.value || null)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("id"); next.delete("q"); next.delete("status"); next.delete("offset");
              router.replace(`/admin/products?${next.toString()}`);
            }}
          >
            Clear
          </Button>
        </div>

        <DataTable
          caption="Products"
          columns={columns}
          rows={list.data?.products ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={
            <EmptyPanel title="No products match these filters">
              {status ? "Try clearing the status filter." : "You have no products yet. Use Advanced tools → Products to create one."}
            </EmptyPanel>
          }
        />

        <OffsetPagination
          offset={offset}
          limit={PAGE_LIMIT}
          rowCount={list.data?.products.length ?? 0}
          disabled={list.isFetching}
          onChange={(nextOffset) => setParam("offset", String(nextOffset))}
        />
      </Panel>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <ProductsPageContent />
    </Suspense>
  );
}
