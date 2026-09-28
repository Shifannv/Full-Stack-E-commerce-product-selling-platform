"use client";

import { useEffect, useState } from "react";
import { PriceDisplay } from "@/components/catalog/price-display";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { Button } from "@/components/ui/button";
import { customerApi, type Order, type Shipment } from "@/lib/api";

function safeTrackingUrl(value: string | null): string | null { if (!value) return null; try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }

function Tracking({ orderId }: { orderId: string }) {
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() { setLoading(true); setError(null); try { setShipments((await customerApi.tracking(orderId)).shipments); } catch (reason) { setError(reason instanceof Error ? reason.message : "Tracking unavailable"); } finally { setLoading(false); } }
  return <div className="mt-6 border-t border-border pt-5"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : shipments ? "Refresh tracking" : "Show tracking"}</Button>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}{shipments && (shipments.length ? <div className="mt-4 space-y-5">{shipments.map((shipment) => <div key={shipment.id} className="rounded-lg bg-secondary/60 p-4 text-sm"><p className="font-semibold">{shipment.carrierName || "Shipment"} · {shipment.status.replaceAll("_", " ")}</p>{shipment.awbNumber && <p className="mt-1 text-muted-foreground">Tracking number: {shipment.awbNumber}</p>}{shipment.estimatedDeliveryDate && <p className="mt-1 text-muted-foreground">Estimated delivery: {new Date(shipment.estimatedDeliveryDate).toLocaleDateString("en-IN")}</p>}{safeTrackingUrl(shipment.trackingUrl) && <a href={safeTrackingUrl(shipment.trackingUrl)!} target="_blank" rel="noreferrer" className="mt-2 inline-block underline">Carrier tracking</a>}{shipment.events.length > 0 && <ol className="mt-4 space-y-3 border-t border-border pt-4">{shipment.events.map((event, index) => <li key={`${event.status}-${index}`}><strong>{event.status.replaceAll("_", " ")}</strong>{event.eventTime && <span className="ml-2 text-muted-foreground">{new Date(event.eventTime).toLocaleString("en-IN")}</span>}{event.location && <p className="text-muted-foreground">{event.location}</p>}{event.description && <p className="text-muted-foreground">{event.description}</p>}</li>)}</ol>}</div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">No shipment has been recorded for this order yet.</p>)}</div>;
}

function OrdersContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; customerApi.orders().then((result) => { if (active) setOrders(result.orders); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Orders unavailable"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  if (loading) return <LoadingState label="Loading orders" />;
  if (error) return <ErrorState description={error} />;
  return orders.length ? <div className="space-y-5">{orders.map((order) => <article key={order.id} className="rounded-xl border border-border bg-card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{order.orderNumber}</h2><p className="mt-1 text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p></div><div className="text-right"><PriceDisplay amount={order.totalAmount} currency={order.currency} /><p className="mt-1 text-sm text-muted-foreground">{order.status.replaceAll("_", " ")} · Payment {order.paymentStatus.replaceAll("_", " ")}</p></div></div><details className="mt-6 border-t border-border pt-5"><summary className="cursor-pointer text-sm font-semibold">Order details</summary><div className="mt-5 grid gap-6 md:grid-cols-2"><div><h3 className="text-sm font-semibold">Items</h3><div className="mt-3 space-y-3">{order.items?.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><div><p>{item.productNameSnapshot}{item.variantTitleSnapshot ? ` · ${item.variantTitleSnapshot}` : ""}</p><p className="text-muted-foreground">Qty {item.quantity} × <PriceDisplay amount={item.unitPrice} currency={order.currency} /></p></div><PriceDisplay amount={item.totalAmount} currency={order.currency} /></div>)}</div></div><div><h3 className="text-sm font-semibold">Delivery address at purchase</h3><p className="mt-3 text-sm text-muted-foreground">{order.shippingAddressSnapshot.contactName}<br />{order.shippingAddressSnapshot.line1}{order.shippingAddressSnapshot.line2 ? `, ${order.shippingAddressSnapshot.line2}` : ""}<br />{order.shippingAddressSnapshot.city}, {order.shippingAddressSnapshot.state} {order.shippingAddressSnapshot.postalCode}</p></div></div><Tracking orderId={order.id} /></details></article>)}</div> : <EmptyState title="No orders yet" description="Your purchases will appear here after checkout is available." action={{ label: "Explore products", href: "/search" }} />;
}

export default function OrdersPage() { return <div className="site-container section-space"><h1 className="type-page mb-10">Orders</h1><CustomerGate><OrdersContent /></CustomerGate></div>; }
