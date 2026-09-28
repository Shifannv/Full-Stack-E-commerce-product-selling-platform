import assert from "node:assert/strict";
import test from "node:test";
import { createForwardShipment } from "./shipping.service";
import type { ShippingProvider } from "./shipping-provider";

const packageMeasurements = { weightKg: 1, lengthCm: 20, breadthCm: 20, heightCm: 10 };
const address = { contactName: "Buyer", phone: "9999999999", line1: "Test Road", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" };

function fakeDb(rows: unknown[][]) {
  let reads = 0;
  let reservations = 0;
  const db = {
    select: () => ({ from: () => ({ where: () => {
      const result = rows[reads++] ?? [];
      return { limit: async () => result, then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve) };
    } }) }),
    transaction: async () => { reservations++; throw new Error("Unexpected reservation"); },
  };
  return { db: db as unknown as Parameters<typeof createForwardShipment>[0], reads: () => reads, reservations: () => reservations };
}

test("shipment creation stops before provider calls for disabled or unapproved sellers", async () => {
  let providerCalls = 0;
  const provider = { key: "shiprocket", getServiceability: async () => { providerCalls++; return { available: true, courierCount: 1 }; } } as unknown as ShippingProvider;
  const disabled = fakeDb([[{ enabled: false }]]);
  await assert.rejects(createForwardShipment(disabled.db, provider, "order-a", "admin-a", packageMeasurements), /provider is disabled/);
  const unapproved = fakeDb([[{ enabled: true }], [{ status: "PENDING_SUPER_ADMIN_APPROVAL" }]]);
  await assert.rejects(createForwardShipment(unapproved.db, provider, "order-a", "admin-a", packageMeasurements), /Admin approval required/);
  assert.equal(providerCalls, 0);
  assert.equal(disabled.reservations() + unapproved.reservations(), 0);
});

test("shipment creation requires both operational addresses", async () => {
  const provider = { key: "shiprocket" } as unknown as ShippingProvider;
  const missingReturn = fakeDb([[{ enabled: true }], [{ status: "ACTIVE" }], [{ ...address, id: "origin", addressType: "SHIPPING_ORIGIN", isActive: true }]]);
  await assert.rejects(createForwardShipment(missingReturn.db, provider, "order-a", "admin-a", packageMeasurements), /Shipping origin and return addresses are required/);
  assert.equal(missingReturn.reservations(), 0);
});

test("unserviceable routes never reserve order items or create a shipment", async () => {
  let calls = 0;
  const provider = { key: "shiprocket", getServiceability: async () => { calls++; return { available: false, courierCount: 0 }; } } as unknown as ShippingProvider;
  const db = fakeDb([
    [{ enabled: true }], [{ status: "ACTIVE" }],
    [{ ...address, id: "origin", addressType: "SHIPPING_ORIGIN" }, { ...address, id: "return", addressType: "RETURN" }],
    [{ locationName: "Warehouse" }],
    [{ id: "order-a", customerId: "customer-a", paymentStatus: "PAID", shippingAddressSnapshot: address }],
    [{ id: "payment-a" }],
    [{ id: "item-a", orderId: "order-a", adminId: "admin-a", quantity: 1, skuSnapshot: "SKU", weightKgSnapshot: "0.5", lengthCmSnapshot: "10", breadthCmSnapshot: "10", heightCmSnapshot: "5" }],
    [], [{ email: "buyer@example.com" }],
  ]);
  await assert.rejects(createForwardShipment(db.db, provider, "order-a", "admin-a", packageMeasurements), /No courier is available/);
  assert.equal(calls, 1);
  assert.equal(db.reservations(), 0);
});
