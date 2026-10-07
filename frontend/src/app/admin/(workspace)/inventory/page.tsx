"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel, ErrorPanel } from "@/components/operator/states";
import { useToast } from "@/components/operator/toast";
import { describeApiError } from "@/lib/api/errors";
import { date } from "@/components/operator/money";
import { Button } from "@/components/ui/button";
import { useOperatorActor } from "@/components/operator/operator-actor";
import type { AdminProductSummary, InventoryRow } from "@/lib/api/types";

const PAGE_LIMIT = 20;

// ─── inventory editor ─────────────────────────────────────────────────────────

function InventoryEditor({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const actor = useOperatorActor();
  const canUpdateInventory = actor.permissions.includes("inventory.update");

  const inventory = useQuery({
    queryKey: operatorKeys.adminInventory(productId),
    queryFn: () => adminApi.inventoryRows(productId),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [available, setAvailable] = useState("");

  const mutation = useMutation({
    mutationFn: ({ variantId, version }: { variantId: string | null; version: number }) =>
      adminApi.inventory(
        productId,
        parseInt(available, 10),
        version,
        variantId ?? undefined,
      ),
    onSuccess: () => {
      toast.success("Inventory updated.");
      setEditingId(null);
      setAvailable("");
      void queryClient.invalidateQueries({ queryKey: operatorKeys.adminInventory(productId) });
    },
    onError: (error) => {
      const described = describeApiError(error, "mutation");
      // 409 INVENTORY_VERSION_STALE — surface the specific message and refresh
      if (described.kind === "conflict") {
        toast.error(described.message);
        void queryClient.invalidateQueries({ queryKey: operatorKeys.adminInventory(productId) });
      } else {
        toast.error(described.message);
      }
    },
  });

  if (inventory.isLoading) return <LoadingPanel label="Loading inventory" />;
  if (inventory.isError)
    return <ErrorPanel error={inventory.error} onRetry={() => void inventory.refetch()} context="record" />;

  const rows = inventory.data?.inventories ?? [];

  const columns: Column<InventoryRow>[] = [
    {
      key: "variant",
      header: "Variant",
      primary: true,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.variantId ? row.variantId.slice(0, 8) + "…" : "Base product"}
        </span>
      ),
    },
    {
      key: "available",
      header: "Available",
      className: "tabular-nums text-right text-sm font-medium",
      cell: (row) => row.availableQuantity,
    },
    {
      key: "reserved",
      header: "Reserved",
      className: "tabular-nums text-right text-sm text-muted-foreground",
      cell: (row) => row.reservedQuantity,
    },
    {
      key: "version",
      header: "Version",
      hideOnCard: true,
      className: "tabular-nums text-center text-xs text-muted-foreground",
      cell: (row) => row.version,
    },
    {
      key: "updated",
      header: "Updated",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => date(row.updatedAt),
    },
    {
      key: "actions",
      header: "Update",
      className: "min-w-[16rem]",
      cell: (row) =>
        !canUpdateInventory ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : editingId === row.id ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={available}
              onChange={(event) => setAvailable(event.target.value)}
              className="h-8 w-24 rounded-md border border-input bg-card px-2 text-sm tabular-nums"
              placeholder="Qty"
              autoFocus
            />
            <Button
              size="sm"
              disabled={!available || mutation.isPending}
              onClick={() => mutation.mutate({ variantId: row.variantId, version: row.version })}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => { setEditingId(null); setAvailable(""); }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingId(row.id);
              setAvailable(String(row.availableQuantity));
            }}
          >
            Update
          </Button>
        ),
    },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Inventory rows</p>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each save requires the current version — if another process updated inventory since you loaded this page, the save will fail with a version conflict and refresh automatically.
      </p>
      <DataTable
        caption="Inventory"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={false}
        empty={<EmptyPanel title="No inventory rows for this product." />}
      />
    </div>
  );
}

// ─── page content ─────────────────────────────────────────────────────────────

function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const offset = Number(searchParams.get("offset") ?? "0") || 0;

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "offset") next.delete("offset");
    router.replace(`/admin/inventory?${next.toString()}`);
  }

  const queryStr = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(offset),
    status: "PUBLISHED",
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
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.category} / {row.subcategory}</p>
        </button>
      ),
    },
    {
      key: "updated",
      header: "Last updated",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => date(row.updatedAt),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Inventory"
        description="Stock levels for your published products. Updates use optimistic concurrency — if two sessions edit the same row simultaneously, one will need to reload and retry."
      />

      {selectedId && (
        <Panel>
          <div className="p-4">
            <InventoryEditor productId={selectedId} onClose={() => setParam("id", null)} />
          </div>
        </Panel>
      )}

      <Panel>
        <DataTable
          caption="Products with inventory"
          columns={columns}
          rows={list.data?.products ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={
            <EmptyPanel title="No published products found.">
              Only published products appear here.
            </EmptyPanel>
          }
        />
      </Panel>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <InventoryPageContent />
    </Suspense>
  );
}
