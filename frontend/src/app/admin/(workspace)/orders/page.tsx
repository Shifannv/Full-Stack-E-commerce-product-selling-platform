"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, DetailList } from "@/components/operator/page-header";
import { DataTable, type Column } from "@/components/operator/data-table";
import { EmptyPanel, LoadingPanel, ErrorPanel } from "@/components/operator/states";
import { StatusBadge } from "@/components/operator/status-badge";
import { money, dateTime } from "@/components/operator/money";
import type { AdminOrder } from "@/lib/api/types";

// ─── order detail panel ───────────────────────────────────────────────────────

function OrderDetailPanel({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const order = useQuery({
    queryKey: operatorKeys.adminOrder(orderId),
    queryFn: () => adminApi.order(orderId),
  });

  const tracking = useQuery({
    queryKey: ["admin", "orders", "tracking", orderId],
    queryFn: () => adminApi.tracking(orderId),
    enabled: !!order.data,
  });

  if (order.isLoading) return <LoadingPanel label="Loading order" />;
  if (order.isError)
    return <ErrorPanel error={order.error} onRetry={() => void order.refetch()} context="record" />;

  const o = order.data;
  if (!o) return null;

  const { shippingAddress: addr } = o;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="op-section-title">Order #{o.orderNumber}</h2>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{o.id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <StatusBadge status={o.paymentStatus} />
          <button type="button" className="op-link text-xs" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DetailList
          items={[
            { label: "Order total (your share)", value: money(o.adminSubtotal) },
            { label: "Currency", value: o.currency },
            { label: "Placed", value: o.placedAt ? dateTime(o.placedAt) : "Not placed" },
          ]}
        />
        <DetailList
          items={[
            { label: "Ship to", value: addr.contactName },
            { label: "Phone", value: addr.phone },
            {
              label: "Address",
              value: [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode]
                .filter(Boolean)
                .join(", "),
            },
          ]}
        />
      </div>

      {/* Items */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Items ({o.items.length})
        </p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {o.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.productNameSnapshot}</p>
                {item.variantTitleSnapshot && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.variantTitleSnapshot}</p>
                )}
                {item.skuSnapshot && (
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">SKU: {item.skuSnapshot}</p>
                )}
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                <span className="font-medium tabular-nums">{money(item.totalAmount)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Tracking */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Shipments
        </p>
        {tracking.isLoading && <LoadingPanel label="Loading shipment tracking" />}
        {tracking.isError && (
          <ErrorPanel
            error={tracking.error}
            onRetry={() => void tracking.refetch()}
            context="record"
          />
        )}
        {!tracking.isError && tracking.data?.shipments.length === 0 && (
          <EmptyPanel title="No shipment tracking yet.">
            Shipment and tracking details will appear here when available.
          </EmptyPanel>
        )}
        {tracking.data && tracking.data.shipments.length > 0 && (
          <div className="grid gap-3">
          {tracking.data.shipments.map((shipment) => (
            <DetailList
              key={shipment.id}
              items={[
                { label: "Carrier", value: shipment.carrierName ?? "—" },
                { label: "AWB", value: shipment.awbNumber ?? "—" },
                { label: "Status", value: shipment.status },
                { label: "Est. delivery", value: shipment.estimatedDeliveryDate ?? "—" },
              ]}
            />
          ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── page content ─────────────────────────────────────────────────────────────

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  function setParam(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value); else next.delete(name);
    router.replace(`/admin/orders?${next.toString()}`);
  }

  const list = useQuery({
    queryKey: operatorKeys.adminOrders(),
    queryFn: () => adminApi.orders(),
  });

  const columns: Column<AdminOrder>[] = [
    {
      key: "order",
      header: "Order",
      primary: true,
      cell: (row) => (
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => setParam("id", row.id)}
        >
          <p className="op-link font-medium">#{row.orderNumber}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.items.length} item{row.items.length !== 1 ? "s" : ""}</p>
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={row.status} />
          <StatusBadge status={row.paymentStatus} />
        </div>
      ),
    },
    {
      key: "subtotal",
      header: "Your share",
      className: "tabular-nums text-right text-sm font-medium",
      cell: (row) => money(row.adminSubtotal),
    },
    {
      key: "placed",
      header: "Placed",
      hideOnCard: true,
      className: "whitespace-nowrap text-xs text-muted-foreground",
      cell: (row) => (row.placedAt ? dateTime(row.placedAt) : "—"),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Orders"
        description="All orders containing your products. The order total shown is your seller share only."
      />

      {selectedId && (
        <Panel>
          <div className="p-4">
            <OrderDetailPanel orderId={selectedId} onClose={() => setParam("id", null)} />
          </div>
        </Panel>
      )}

      <Panel>
        <DataTable
          caption="Orders"
          columns={columns}
          rows={list.data?.orders ?? null}
          rowKey={(row) => row.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={<EmptyPanel title="No orders yet." />}
        />
        {list.data && (
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {list.data.orders.length} order{list.data.orders.length !== 1 ? "s" : ""} total · This endpoint returns all orders without pagination.
          </p>
        )}
      </Panel>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <OrdersPageContent />
    </Suspense>
  );
}
