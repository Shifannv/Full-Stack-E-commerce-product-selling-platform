"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { superAdminApi, type SuperAdminProduct } from "@/lib/api/super-admin";
import type { ProductStatus } from "@/lib/api/types";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, DetailList } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, ErrorPanel, LoadingPanel } from "@/components/operator/states";
import { FilterBar } from "@/components/operator/filter-bar";
import { OffsetPagination } from "@/components/operator/pagination";
import { StatusBadge, statusLabel } from "@/components/operator/status-badge";
import { ConfirmDialog } from "@/components/operator/confirm-dialog";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { money } from "@/components/operator/money";
import { Button } from "@/components/ui/button";

const STATUSES: ProductStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
const PAGE_LIMIT = 20;

const columns: Column<SuperAdminProduct>[] = [
  {
    key: "name",
    header: "Product",
    primary: true,
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.category} · {row.subcategory}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => (
      <span className="inline-flex items-center gap-1.5">
        <StatusBadge status={row.status} />
        {row.featured && <StatusBadge status="featured" tone="info" label="Featured" />}
      </span>
    ),
  },
  {
    key: "price",
    header: "Price",
    className: "text-right whitespace-nowrap",
    cell: (row) => money(row.price),
  },
];

function ProductDetailPanel({ productId, onClose }: { productId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [statusTarget, setStatusTarget] = useState<ProductStatus | null>(null);

  // No single-product detail endpoint exists for Super Admin (documented gap); the row cached
  // from whichever list query loaded it carries everything the publish/feature actions need.
  const cached = queryClient
    .getQueriesData<{ products: SuperAdminProduct[] }>({ queryKey: ["super-admin", "products"] })
    .flatMap(([, data]) => data?.products ?? [])
    .find((row) => row.id === productId);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["super-admin", "products"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: ProductStatus) => superAdminApi.setProductStatus(productId, status),
    onSuccess: (_, status) => {
      toast.success(`Product moved to ${statusLabel(status)}.`);
      invalidate();
      setStatusTarget(null);
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });
  const featuredMutation = useMutation({
    mutationFn: (featured: boolean) => superAdminApi.setProductFeatured(productId, featured),
    onSuccess: (_, featured) => {
      toast.success(featured ? "Marked as featured." : "Removed from featured.");
      invalidate();
    },
    onError: (error) => toast.error(describeApiError(error, "mutation").message),
  });

  if (!cached)
    return (
      <Panel title="Product">
        <p className="px-4 py-6 text-sm text-muted-foreground">
          This product is no longer on the loaded page. Close and reopen it from the list.
        </p>
      </Panel>
    );

  return (
    <Panel
      title={cached.name}
      actions={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid gap-5 p-4">
        <DetailList
          items={[
            { label: "Status", value: <StatusBadge status={cached.status} /> },
            { label: "Price", value: money(cached.price) },
            { label: "Category", value: `${cached.category} / ${cached.subcategory}` },
            { label: "Featured", value: cached.featured ? "Yes" : "No" },
            { label: "Returns", value: cached.returnEnabled ? "Enabled" : "Not enabled" },
          ]}
        />
        <div>
          <p className="text-xs font-medium text-muted-foreground">Publication</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <Button
                key={status}
                variant={status === cached.status ? "default" : "outline"}
                size="sm"
                disabled={status === cached.status || statusMutation.isPending}
                onClick={() => setStatusTarget(status)}
              >
                {statusLabel(status)}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Merchandising</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={featuredMutation.isPending}
            onClick={() => featuredMutation.mutate(!cached.featured)}
          >
            {cached.featured ? "Remove from featured" : "Mark as featured"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={`Move to ${statusTarget ? statusLabel(statusTarget) : ""}`}
        description={
          statusTarget === "PUBLISHED"
            ? "This product becomes visible to customers immediately."
            : statusTarget === "ARCHIVED"
              ? "This product is removed from the storefront. It can be republished later."
              : "This product is hidden from the storefront while it is edited."
        }
        confirmLabel="Confirm"
        busy={statusMutation.isPending}
        onConfirm={() => statusTarget && statusMutation.mutate(statusTarget)}
      />
    </Panel>
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
    queryKey: operatorKeys.superProducts(queryString),
    queryFn: () => superAdminApi.products(new URLSearchParams(queryString)),
  });

  function openProduct(id: string | null) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("id", id);
    else next.delete("id");
    router.push(`/super-admin/products?${next.toString()}`);
  }

  const withClick: Column<SuperAdminProduct>[] = columns.map((column) =>
    column.key === "name"
      ? {
          ...column,
          cell: (row) => (
            <button type="button" onClick={() => openProduct(row.id)} className="min-w-0 text-left">
              <p className="truncate font-medium op-link">{row.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {row.category} · {row.subcategory}
              </p>
            </button>
          ),
        }
      : column,
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Products"
        description="Every product across all sellers, including drafts and archived items."
      />

      {selected && <ProductDetailPanel productId={selected} onClose={() => openProduct(null)} />}

      <Panel>
        <FilterBar
          searchPlaceholder="Search by name…"
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
          caption="Products"
          columns={withClick}
          rows={list.data?.products ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          selectedKey={selected}
          empty={
            <EmptyPanel title="No products match these filters">
              {status || q ? "Try a different search term or status." : "Products will appear here once sellers publish their catalog."}
            </EmptyPanel>
          }
        />
        <OffsetPagination
          offset={offset}
          limit={PAGE_LIMIT}
          rowCount={list.data?.products.length ?? 0}
          disabled={list.isFetching}
          onChange={(nextOffset) => {
            const next = new URLSearchParams(searchParams);
            next.set("offset", String(nextOffset));
            router.replace(`/super-admin/products?${next.toString()}`);
          }}
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
