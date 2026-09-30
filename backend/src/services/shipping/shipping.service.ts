import { and, eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminAddresses } from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import { orderItems, orders, payments, type AddressSnapshot } from "../../db/schema/orders";
import { shipmentEvents, shipmentItems, shipments, shippingProviderConfigs, shippingProviderLocations } from "../../db/schema/shipping";
import { admins } from "../../db/schema/rbac";
import type { Actor } from "../../middleware/authorization";
import { DomainError } from "../admin/admin.service";
import { requireFulfillmentEligible } from "../order-eligibility";
import { withTransitionRetry } from "../reservation.service";
import { normalizeShiprocketStatus, parseShiprocketTime } from "./status";
import type { ProviderShipment, ShippingProvider, ShipmentStatus } from "./shipping-provider";

type Db = ReturnType<typeof createDb>["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const string = (value: unknown): string | undefined => typeof value === "string" || typeof value === "number" ? String(value) : undefined;
const statusId = (value: unknown): number | undefined => value === undefined || value === null || value === "" ? undefined : Number(value);

const snapshot = (value: typeof adminAddresses.$inferSelect): AddressSnapshot => ({
  contactName: value.contactName, phone: value.phone, line1: value.line1, line2: value.line2,
  city: value.city, state: value.state, postalCode: value.postalCode, country: value.country,
  businessName: value.businessName,
});

export async function createForwardShipment(db: Db, provider: ShippingProvider, orderId: string, adminId: string, pkg: { weightKg: number; lengthCm: number; breadthCm: number; heightCm: number }) {
  if (Object.values(pkg).some((value) => !Number.isFinite(value) || value <= 0)) throw new DomainError("Valid package measurements are required", 422);
  const [config] = await db.select().from(shippingProviderConfigs).where(eq(shippingProviderConfigs.providerKey, provider.key)).limit(1);
  if (!config?.enabled) throw new DomainError("Shipping provider is disabled", 409);
  const [admin] = await db.select({ status: admins.status }).from(admins).where(eq(admins.id, adminId)).limit(1);
  if (admin?.status !== "ACTIVE") throw new DomainError("Admin approval required", 403);
  const addresses = await db.select().from(adminAddresses).where(and(eq(adminAddresses.adminId, adminId), eq(adminAddresses.isActive, true)));
  const origin = addresses.find((address) => address.addressType === "SHIPPING_ORIGIN");
  if (!origin || !addresses.some((address) => address.addressType === "RETURN")) throw new DomainError("Shipping origin and return addresses are required", 422);
  const [location] = await db.select().from(shippingProviderLocations).where(and(eq(shippingProviderLocations.adminAddressId, origin.id), eq(shippingProviderLocations.providerKey, provider.key), eq(shippingProviderLocations.status, "ACTIVE"))).limit(1);
  if (!location) throw new DomainError("Provider pickup location mapping is required", 422);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [payment] = await db.select({ status: payments.status, resolutionStatus: payments.resolutionStatus }).from(payments).where(eq(payments.orderId, orderId)).limit(1);
  requireFulfillmentEligible(order, payment);
  const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.adminId, adminId)));
  if (!items.length) throw new DomainError("No order items for this Admin", 404);
  const existingItems = await db.select({ orderItemId: shipmentItems.orderItemId }).from(shipmentItems)
    .where(eq(shipmentItems.orderId, orderId));
  if (items.some((item) => existingItems.some((existing) => existing.orderItemId === item.id))) throw new DomainError("One or more order items are already reserved for shipment", 409);
  if (items.some((item) => !item.skuSnapshot || !item.weightKgSnapshot || !item.lengthCmSnapshot || !item.breadthCmSnapshot || !item.heightCmSnapshot)) throw new DomainError("Order items need package snapshots and SKUs", 422);
  const minimumWeight = items.reduce((total, item) => total + Number(item.weightKgSnapshot) * item.quantity, 0);
  if (pkg.weightKg < minimumWeight || pkg.lengthCm < Math.max(...items.map((item) => Number(item.lengthCmSnapshot))) || pkg.breadthCm < Math.max(...items.map((item) => Number(item.breadthCmSnapshot))) || pkg.heightCm < Math.max(...items.map((item) => Number(item.heightCmSnapshot)))) throw new DomainError("Package is smaller than the order item measurements", 422);
  const [customer] = await db.select({ email: users.email }).from(users).where(eq(users.id, order.customerId)).limit(1);
  if (!customer) throw new DomainError("Customer unavailable", 404);
  if (!/^\d{6}$/.test(origin.postalCode) || !/^\d{6}$/.test(order.shippingAddressSnapshot.postalCode)) throw new DomainError("Valid pickup and delivery pincodes are required", 422);
  const serviceability = await provider.getServiceability(origin.postalCode, order.shippingAddressSnapshot.postalCode, pkg.weightKg);
  if (!serviceability.available) throw new DomainError("No courier is available for this route and package", 422);
  const [shipment] = await db.transaction(async (tx) => {
    const [lockedOrder] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
    const [lockedPayment] = await tx.select({ status: payments.status, resolutionStatus: payments.resolutionStatus }).from(payments).where(eq(payments.orderId, orderId)).limit(1).for("update");
    requireFulfillmentEligible(lockedOrder, lockedPayment);
    const [reserved] = await tx.insert(shipments).values({ orderId, adminId, providerKey: provider.key, originAddressSnapshot: snapshot(origin), destinationAddressSnapshot: order.shippingAddressSnapshot }).returning();
    await tx.insert(shipmentItems).values(items.map((item) => ({ shipmentId: reserved.id, orderItemId: item.id, orderId, adminId })));
    return [reserved];
  });
  // A failed provider request leaves this reservation for operator reconciliation; repeating it could create a second real shipment.
  const created = await provider.createShipment({
    externalOrderId: shipment.id,
    orderDate: order.placedAt ?? order.createdAt,
    pickupLocation: location.locationName,
    destination: order.shippingAddressSnapshot,
    customerEmail: customer.email,
    items: items.map((item) => ({ name: item.productNameSnapshot, sku: item.skuSnapshot!, quantity: item.quantity, unitPrice: item.unitPrice, discount: (Number(item.discountAmount) / item.quantity).toFixed(2) })),
    subtotal: items.reduce((total, item) => total + Number(item.totalAmount), 0).toFixed(2),
    ...pkg,
  });
  return recordKnownProviderShipment(db, shipment.id, provider.key, { externalOrderId: shipment.id, ...created });
}

export async function recordKnownProviderShipment(db: Db, shipmentId: string, providerKey: string, evidence: ProviderShipment & { externalOrderId: string }) {
  if (evidence.externalOrderId !== shipmentId || !evidence.providerOrderId?.trim() || !evidence.providerShipmentId?.trim()) throw new DomainError("Provider shipment evidence is invalid", 422);
  return withTransitionRetry(db, async (tx) => {
    const [current] = await tx.select().from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.providerKey, providerKey))).limit(1).for("update");
    if (!current) throw new DomainError("Shipment unavailable for provider evidence", 404);
    if (current.providerShipmentId && current.providerShipmentId !== evidence.providerShipmentId || current.providerOrderId && current.providerOrderId !== evidence.providerOrderId) throw new DomainError("Conflicting provider shipment reference", 409);
    if (current.providerShipmentId === evidence.providerShipmentId && current.providerOrderId === evidence.providerOrderId) return current;
    const [updated] = await tx.update(shipments).set({ providerOrderId: evidence.providerOrderId, providerShipmentId: evidence.providerShipmentId,
      status: current.status === "CREATED" ? "CONFIRMED" : current.status, updatedAt: new Date() }).where(eq(shipments.id, current.id)).returning();
    return updated;
  });
}

export async function assignShipmentAwb(db: Db, provider: ShippingProvider, shipmentId: string, adminId: string) {
  const [shipment] = await db.select().from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.adminId, adminId), eq(shipments.providerKey, provider.key))).limit(1);
  if (!shipment?.providerShipmentId) throw new DomainError("Provider shipment unavailable", 404);
  if (shipment.awbNumber) return shipment;
  const awb = await provider.assignAwb(shipment.providerShipmentId);
  return withTransitionRetry(db, async (tx) => {
    const [current] = await tx.select().from(shipments).where(eq(shipments.id, shipment.id)).limit(1).for("update");
    if (!current) throw new DomainError("Shipment unavailable", 404);
    if (current.awbNumber) return current;
    const status = ["CREATED", "CONFIRMED", "PACKED"].includes(current.status) ? "PACKED" : current.status;
    const [updated] = await tx.update(shipments).set({ awbNumber: awb.awbNumber, carrierName: awb.carrierName ?? current.carrierName, status, updatedAt: new Date() }).where(eq(shipments.id, shipment.id)).returning();
    return updated;
  });
}

export async function requestShipmentPickup(db: Db, provider: ShippingProvider, shipmentId: string, adminId: string) {
  const [shipment] = await db.select().from(shipments).where(and(eq(shipments.id, shipmentId), eq(shipments.adminId, adminId), eq(shipments.providerKey, provider.key))).limit(1);
  if (!shipment?.providerShipmentId || !shipment.awbNumber) throw new DomainError("AWB assignment required", 422);
  if (shipment.pickupRequestedAt) return shipment;
  await provider.requestPickup(shipment.providerShipmentId);
  const [updated] = await db.update(shipments).set({ pickupRequestedAt: new Date(), updatedAt: new Date() }).where(eq(shipments.id, shipment.id)).returning();
  return updated;
}

async function eventKey(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u0000"));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const progress: Record<ShipmentStatus, number> = {
  CREATED: 0, CONFIRMED: 1, PACKED: 2, SHIPPED: 3, PICKED_UP: 4,
  IN_TRANSIT: 5, OUT_FOR_DELIVERY: 6, DELIVERY_FAILED: 6,
  DELIVERED: 7, RTO: 7, CANCELLED: 7,
};
const terminal = new Set<ShipmentStatus>(["DELIVERED", "RTO", "CANCELLED"]);

// Callers lock the order first, then this shipment. Persisted events provide
// the evidence for repair without consulting or changing provider state.
async function reconcileLockedShipment(tx: Tx, shipment: typeof shipments.$inferSelect) {
  const events = await tx.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment.id))
    .orderBy(shipmentEvents.eventTime, shipmentEvents.createdAt, shipmentEvents.id);
  let status = shipment.status as ShipmentStatus;
  if (status === "CREATED" && shipment.providerShipmentId) status = "CONFIRMED";
  let shippedAt = shipment.shippedAt, pickedUpAt = shipment.pickedUpAt;
  let outForDeliveryAt = shipment.outForDeliveryAt, deliveredAt = shipment.deliveredAt;
  let lastEventAt = shipment.lastEventAt;
  for (const event of events) {
    const next = event.normalizedStatus as ShipmentStatus;
    if (next in progress && !terminal.has(status)
      && (progress[next] >= progress[status] || status === "DELIVERY_FAILED" && ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(next))) status = next;
    if (next === "SHIPPED") shippedAt ??= event.eventTime;
    if (next === "PICKED_UP") pickedUpAt ??= event.eventTime;
    if (next === "OUT_FOR_DELIVERY") outForDeliveryAt ??= event.eventTime;
    if (next === "DELIVERED" && status === "DELIVERED") deliveredAt ??= event.eventTime;
    if (!lastEventAt || event.eventTime > lastEventAt) lastEventAt = event.eventTime;
  }
  const changed = status !== shipment.status || shippedAt !== shipment.shippedAt || pickedUpAt !== shipment.pickedUpAt
    || outForDeliveryAt !== shipment.outForDeliveryAt || deliveredAt !== shipment.deliveredAt || lastEventAt !== shipment.lastEventAt;
  if (changed) await tx.update(shipments).set({ status, shippedAt, pickedUpAt, outForDeliveryAt, deliveredAt, lastEventAt, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(shipments.id, shipment.id));
  if (status === "DELIVERED" && deliveredAt) {
    const items = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, shipment.orderId));
    const deliveredItems = await tx.select({ id: shipmentItems.orderItemId, deliveredAt: shipments.deliveredAt }).from(shipmentItems)
      .innerJoin(shipments, eq(shipmentItems.shipmentId, shipments.id))
      .where(and(eq(shipmentItems.orderId, shipment.orderId), eq(shipments.status, "DELIVERED")));
    if (items.length && items.every((item) => deliveredItems.some((delivery) => delivery.id === item.id && delivery.deliveredAt))) {
      const [order] = await tx.select().from(orders).where(eq(orders.id, shipment.orderId)).limit(1);
      const [payment] = await tx.select({ status: payments.status, resolutionStatus: payments.resolutionStatus }).from(payments).where(eq(payments.orderId, shipment.orderId)).limit(1);
      requireFulfillmentEligible(order, payment, true);
      if (order.status === "CONFIRMED" || !order.deliveredAt) {
        const completedAt = new Date(Math.max(...deliveredItems.map((item) => item.deliveredAt!.getTime())));
        await tx.update(orders).set({ status: "DELIVERED", deliveredAt: order.deliveredAt ?? completedAt, updatedAt: new Date() }).where(eq(orders.id, shipment.orderId));
      }
    }
  }
  return { status, deliveredAt };
}

export async function reconcileShipment(db: Db, shipmentId: string) {
  return withTransitionRetry(db, async (tx) => {
    const [reference] = await tx.select({ orderId: shipments.orderId }).from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
    if (!reference) throw new DomainError("Shipment unavailable", 404);
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, reference.orderId)).limit(1).for("update");
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1).for("update");
    if (!shipment) throw new DomainError("Shipment unavailable", 404);
    return reconcileLockedShipment(tx, shipment);
  });
}

export async function listShipmentReconciliationCandidates(db: Db) {
  const rows = await db.select({ id: shipments.id, orderId: shipments.orderId, status: shipments.status,
    providerOrderId: shipments.providerOrderId, providerShipmentId: shipments.providerShipmentId,
    awbNumber: shipments.awbNumber, deliveredAt: shipments.deliveredAt, createdAt: shipments.createdAt })
    .from(shipments);
  const candidates = [];
  for (const shipment of rows) {
    const events = await db.select({ status: shipmentEvents.normalizedStatus }).from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment.id));
    const [order] = await db.select({ status: orders.status, deliveredAt: orders.deliveredAt }).from(orders).where(eq(orders.id, shipment.orderId)).limit(1);
    const reason = events.some((event) => event.status === "DELIVERED") && ["RTO", "CANCELLED"].includes(shipment.status) ? "CONFLICTING_TERMINAL_EVENT"
      : events.some((event) => event.status === "DELIVERED") && (!shipment.deliveredAt || !order?.deliveredAt) ? "DELIVERY_MILESTONE_MISSING"
      : shipment.status === "CREATED" && shipment.providerShipmentId ? "LOCAL_STATE_STALE"
      : shipment.status === "CREATED" ? "PROVIDER_OUTCOME_UNKNOWN"
      : shipment.providerShipmentId && !shipment.awbNumber ? "AWB_PENDING" : null;
    if (reason) candidates.push({ ...shipment, reason });
  }
  return candidates;
}

export async function ingestShiprocketWebhook(db: Db, payload: unknown): Promise<{ accepted: number; duplicates: number }> {
  const v = record(payload);
  const awb = string(v.awb);
  if (!awb || awb.length > 100) throw new DomainError("Invalid shipment reference", 422);
  const [shipment] = await db.select().from(shipments).where(and(eq(shipments.providerKey, "shiprocket"), eq(shipments.awbNumber, awb))).limit(1);
  if (!shipment) throw new DomainError("Shipment unavailable", 404);

  const incoming = [
    ...Array.isArray(v.scans) ? v.scans.map((item) => {
      const scan = record(item);
      return { providerStatus: string(scan["sr-status-label"] ?? scan.status ?? scan.activity), id: statusId(scan["sr-status"]), location: string(scan.location), description: string(scan.activity), time: parseShiprocketTime(scan.date) };
    }) : [],
    ...(v.current_status || v.shipment_status ? [{ providerStatus: string(v.current_status ?? v.shipment_status), id: statusId(v.current_status_id ?? v.shipment_status_id), location: undefined, description: undefined, time: parseShiprocketTime(v.current_timestamp) }] : []),
  ];
  if (!incoming.length || incoming.some((item) => !item.providerStatus || !item.time || !normalizeShiprocketStatus(item.providerStatus, item.id))) throw new DomainError("Invalid tracking event", 422);
  const events = await Promise.all(incoming.map(async (item) => ({
    shipmentId: shipment.id,
    eventKey: await eventKey([awb, item.providerStatus!, item.time!.toISOString(), item.location ?? "", item.description ?? ""]),
    providerStatus: item.providerStatus!,
    normalizedStatus: normalizeShiprocketStatus(item.providerStatus!, item.id)!,
    location: item.location?.slice(0, 250),
    description: item.description?.slice(0, 1000),
    eventTime: item.time!,
  })));
  const estimated = parseShiprocketTime(v.etd);
  return withTransitionRetry(db, async (tx) => {
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, shipment.orderId)).limit(1).for("update");
    const [locked] = await tx.select().from(shipments).where(eq(shipments.id, shipment.id)).limit(1).for("update");
    if (!locked || locked.awbNumber !== awb) throw new DomainError("Shipment unavailable", 404);
    let accepted = 0;
    for (const event of events) {
      const result = await tx.insert(shipmentEvents).values(event).onConflictDoNothing().returning({ id: shipmentEvents.id });
      accepted += result.length;
    }
    if (accepted && (estimated || v.courier_name)) await tx.update(shipments).set({
      estimatedDeliveryDate: estimated ?? locked.estimatedDeliveryDate,
      carrierName: string(v.courier_name)?.slice(0, 150) ?? locked.carrierName,
    }).where(eq(shipments.id, locked.id));
    await reconcileLockedShipment(tx, locked);
    return { accepted, duplicates: events.length - accepted };
  });
}

export async function getOrderTracking(db: Db, orderId: string, actor: Actor, view: "customer" | "admin") {
  const [order] = await db.select({ id: orders.id, customerId: orders.customerId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new DomainError("Order unavailable", 404);
  let adminId: string | undefined;
  if (view === "customer" && order.customerId !== actor.userId) throw new DomainError("Order unavailable", 404);
  if (view === "admin" && !actor.roles.includes("SUPER_ADMIN")) {
    if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("orders.view")) throw new DomainError("Order unavailable", 404);
    const [admin] = await db.select({ id: admins.id }).from(admins).where(eq(admins.userId, actor.userId)).limit(1);
    if (!admin) throw new DomainError("Order unavailable", 404);
    adminId = admin.id;
  }
  const rows = await db.select({
    id: shipments.id, adminId: shipments.adminId, carrierName: shipments.carrierName,
    awbNumber: shipments.awbNumber, trackingUrl: shipments.trackingUrl, status: shipments.status,
    estimatedDeliveryDate: shipments.estimatedDeliveryDate, shippedAt: shipments.shippedAt,
    pickedUpAt: shipments.pickedUpAt, outForDeliveryAt: shipments.outForDeliveryAt,
    deliveredAt: shipments.deliveredAt, lastEventAt: shipments.lastEventAt,
  }).from(shipments).where(adminId ? and(eq(shipments.orderId, orderId), eq(shipments.adminId, adminId)) : eq(shipments.orderId, orderId));
  if (adminId && !rows.length) throw new DomainError("Order unavailable", 404);
  return Promise.all(rows.map(async (shipment) => {
    const events = await db.select({ status: shipmentEvents.normalizedStatus, providerStatus: shipmentEvents.providerStatus, location: shipmentEvents.location, description: shipmentEvents.description, eventTime: shipmentEvents.eventTime })
      .from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment.id)).orderBy(shipmentEvents.eventTime);
    if (view === "customer") return {
      id: shipment.id, carrierName: shipment.carrierName, awbNumber: shipment.awbNumber,
      trackingUrl: shipment.trackingUrl, status: shipment.status, estimatedDeliveryDate: shipment.estimatedDeliveryDate,
      deliveredAt: shipment.deliveredAt,
      events: events.map((event) => ({ status: event.status, location: event.location, description: event.description, eventTime: event.eventTime })),
    };
    return { ...shipment, adminId: actor.roles.includes("SUPER_ADMIN") ? shipment.adminId : undefined, events };
  }));
}
