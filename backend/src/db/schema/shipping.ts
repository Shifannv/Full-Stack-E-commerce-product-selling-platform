import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminAddresses } from "./admin";
import { orders, orderItems, type AddressSnapshot } from "./orders";
import { admins } from "./rbac";

export const shippingProviderConfigs = pgTable("shipping_provider_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerKey: text("provider_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shippingProviderLocations = pgTable("shipping_provider_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  adminAddressId: uuid("admin_address_id").notNull(),
  addressType: text("address_type").notNull().default("SHIPPING_ORIGIN"),
  providerKey: text("provider_key").notNull().references(() => shippingProviderConfigs.providerKey),
  providerLocationRef: text("provider_location_ref").notNull(),
  locationName: text("location_name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.adminAddressId, table.adminId, table.addressType], foreignColumns: [adminAddresses.id, adminAddresses.adminId, adminAddresses.addressType], name: "shipping_locations_origin_fk" }),
  unique("shipping_locations_provider_address_unique").on(table.providerKey, table.adminAddressId),
  check("shipping_locations_type_check", sql`${table.addressType} = 'SHIPPING_ORIGIN'`),
  check("shipping_locations_status_check", sql`${table.status} in ('ACTIVE','INACTIVE')`),
]);

export const shipments = pgTable("shipments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  adminId: uuid("admin_id").notNull().references(() => admins.id),
  providerKey: text("provider_key").notNull().references(() => shippingProviderConfigs.providerKey),
  providerOrderId: text("provider_order_id"),
  providerShipmentId: text("provider_shipment_id"),
  awbNumber: text("awb_number"),
  carrierName: text("carrier_name"),
  trackingUrl: text("tracking_url"),
  status: text("status").notNull().default("CREATED"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date", { withTimezone: true }),
  originAddressSnapshot: jsonb("origin_address_snapshot").$type<AddressSnapshot>().notNull(),
  destinationAddressSnapshot: jsonb("destination_address_snapshot").$type<AddressSnapshot>().notNull(),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  pickupRequestedAt: timestamp("pickup_requested_at", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  outForDeliveryAt: timestamp("out_for_delivery_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("shipments_order_admin_idx").on(table.orderId, table.adminId),
  unique("shipments_id_order_admin_unique").on(table.id, table.orderId, table.adminId),
  uniqueIndex("shipments_provider_shipment_unique").on(table.providerKey, table.providerShipmentId).where(sql`${table.providerShipmentId} is not null`),
  uniqueIndex("shipments_provider_awb_unique").on(table.providerKey, table.awbNumber).where(sql`${table.awbNumber} is not null`),
  check("shipments_status_check", sql`${table.status} in ('CREATED','CONFIRMED','PACKED','SHIPPED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','RTO','CANCELLED')`),
]);

export const shipmentItems = pgTable("shipment_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  shipmentId: uuid("shipment_id").notNull().references(() => shipments.id),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  orderId: uuid("order_id").notNull(),
  adminId: uuid("admin_id").notNull(),
}, (table) => [
  foreignKey({ columns: [table.shipmentId, table.orderId, table.adminId], foreignColumns: [shipments.id, shipments.orderId, shipments.adminId], name: "shipment_items_shipment_scope_fk" }),
  foreignKey({ columns: [table.orderItemId, table.orderId, table.adminId], foreignColumns: [orderItems.id, orderItems.orderId, orderItems.adminId], name: "shipment_items_order_item_scope_fk" }),
  unique("shipment_items_order_item_unique").on(table.orderItemId),
  index("shipment_items_shipment_idx").on(table.shipmentId),
]);

export const shipmentEvents = pgTable("shipment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  shipmentId: uuid("shipment_id").notNull().references(() => shipments.id),
  eventKey: text("event_key").notNull(),
  providerStatus: text("provider_status"),
  normalizedStatus: text("normalized_status").notNull(),
  location: text("location"),
  description: text("description"),
  eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("shipment_events_shipment_key_unique").on(table.shipmentId, table.eventKey),
  index("shipment_events_shipment_time_idx").on(table.shipmentId, table.eventTime),
]);

// Unmatched events cannot use shipment_events, whose shipment FK is mandatory.
export const shippingOperations = pgTable("shipping_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationKey: text("operation_key").notNull().unique(),
  shipmentId: uuid("shipment_id").references(() => shipments.id, { onDelete: "cascade" }),
  providerKey: text("provider_key").notNull(),
  providerReference: text("provider_reference").notNull(),
  kind: text("kind").notNull(),
  state: text("state").notNull().default("IN_FLIGHT"),
  actor: text("actor").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>(),
  retryCount: integer("retry_count").notNull().default(0),
  lastError: text("last_error"),
  lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("shipping_operations_kind_check", sql`${table.kind} in ('CREATE','AWB','PICKUP','EVENT')`),
  check("shipping_operations_state_check", sql`${table.state} in ('IN_FLIGHT','UNKNOWN','SUCCEEDED','FAILED','REVIEW')`),
  check("shipping_operations_retry_check", sql`${table.retryCount} between 0 and 5`),
  check("shipping_operations_scope_check", sql`${table.kind} = 'EVENT' or ${table.shipmentId} is not null`),
  index("shipping_operations_due_idx").on(table.nextRetryAt, table.id).where(sql`${table.state} in ('IN_FLIGHT','UNKNOWN')`),
  index("shipping_operations_shipment_idx").on(table.shipmentId),
]);
