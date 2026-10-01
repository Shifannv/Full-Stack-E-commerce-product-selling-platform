import assert from "node:assert/strict";
import test from "node:test";
import { createForwardShipment, getOrderTracking } from "./shipping.service";
import type { ShippingProvider } from "./shipping-provider";

const packageMeasurements = {
  weightKg: 1,
  lengthCm: 20,
  breadthCm: 20,
  heightCm: 10,
};
const address = {
  contactName: "Buyer",
  phone: "9999999999",
  line1: "Test Road",
  city: "Delhi",
  state: "Delhi",
  postalCode: "110001",
  country: "IN",
};

test("customer tracking projects required fields and excludes operational identifiers", async () => {
  const rows: unknown[][] = [
    [{ id: "order", customerId: "customer-a" }],
    [
      {
        id: "shipment",
        adminId: "internal-admin",
        carrierName: "Carrier",
        awbNumber: "AWB",
        trackingUrl: "https://carrier.example/track",
        status: "SHIPPED",
        estimatedDeliveryDate: null,
        deliveredAt: null,
        providerOrderId: "private-id",
        lastEventAt: new Date(),
      },
    ],
    [
      {
        status: "SHIPPED",
        providerStatus: "provider-code",
        location: "City",
        description: "Shipped",
        eventTime: null,
        internalNotes: "secret",
      },
    ],
  ];
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          const result = rows.shift()!;
          return {
            limit: async () => result,
            orderBy: async () => result,
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve(result).then(resolve),
          };
        },
      }),
    }),
  };
  // Even a multi-role owner uses the customer projection on the customer endpoint.
  const shipments = await getOrderTracking(
    db as never,
    "order",
    {
      userId: "customer-a",
      roles: ["CUSTOMER", "SUPER_ADMIN"],
      permissions: [],
      adminApproved: false,
    },
    "customer",
  );
  assert.equal(shipments[0].awbNumber, "AWB");
  assert.equal(shipments[0].events[0].status, "SHIPPED");
  assert.doesNotMatch(
    JSON.stringify(shipments),
    /adminId|providerStatus|providerOrderId|internalNotes|lastEventAt/,
  );
});

test("customer cannot read tracking belonging to another customer", async () => {
  const scoped = fakeDb([[{ id: "order-a", customerId: "customer-a" }]]);
  await assert.rejects(
    getOrderTracking(
      scoped.db,
      "order-a",
      {
        userId: "customer-b",
        roles: ["CUSTOMER"],
        permissions: [],
        adminApproved: false,
      },
      "customer",
    ),
    { status: 404 },
  );
  assert.equal(
    scoped.reads(),
    1,
    "No shipment data may be read after ownership rejection",
  );
});

function fakeDb(rows: unknown[][]) {
  let reads = 0;
  let reservations = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          const result = rows[reads++] ?? [];
          return {
            limit: async () => result,
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve(result).then(resolve),
          };
        },
      }),
    }),
    transaction: async () => {
      reservations++;
      throw new Error("Unexpected reservation");
    },
  };
  return {
    db: db as unknown as Parameters<typeof createForwardShipment>[0],
    reads: () => reads,
    reservations: () => reservations,
  };
}

test("shipment creation stops before provider calls for disabled or unapproved sellers", async () => {
  let providerCalls = 0;
  const provider = {
    key: "shiprocket",
    getServiceability: async () => {
      providerCalls++;
      return { available: true, courierCount: 1 };
    },
  } as unknown as ShippingProvider;
  const disabled = fakeDb([[{ enabled: false }]]);
  await assert.rejects(
    createForwardShipment(
      disabled.db,
      provider,
      "order-a",
      "admin-a",
      packageMeasurements,
    ),
    /provider is disabled/,
  );
  const unapproved = fakeDb([
    [{ enabled: true }],
    [{ status: "PENDING_SUPER_ADMIN_APPROVAL" }],
  ]);
  await assert.rejects(
    createForwardShipment(
      unapproved.db,
      provider,
      "order-a",
      "admin-a",
      packageMeasurements,
    ),
    /Admin approval required/,
  );
  assert.equal(providerCalls, 0);
  assert.equal(disabled.reservations() + unapproved.reservations(), 0);
});

test("shipment creation requires both operational addresses", async () => {
  const provider = { key: "shiprocket" } as unknown as ShippingProvider;
  const missingReturn = fakeDb([
    [{ enabled: true }],
    [{ status: "ACTIVE" }],
    [
      {
        ...address,
        id: "origin",
        addressType: "SHIPPING_ORIGIN",
        isActive: true,
      },
    ],
  ]);
  await assert.rejects(
    createForwardShipment(
      missingReturn.db,
      provider,
      "order-a",
      "admin-a",
      packageMeasurements,
    ),
    /Shipping origin and return addresses are required/,
  );
  assert.equal(missingReturn.reservations(), 0);
});

test("unserviceable routes never reserve order items or create a shipment", async () => {
  let calls = 0;
  const provider = {
    key: "shiprocket",
    getServiceability: async () => {
      calls++;
      return { available: false, courierCount: 0 };
    },
  } as unknown as ShippingProvider;
  const db = fakeDb([
    [{ enabled: true }],
    [{ status: "ACTIVE" }],
    [
      { ...address, id: "origin", addressType: "SHIPPING_ORIGIN" },
      { ...address, id: "return", addressType: "RETURN" },
    ],
    [{ locationName: "Warehouse" }],
    [
      {
        id: "order-a",
        customerId: "customer-a",
        status: "CONFIRMED",
        stockState: "CONSUMED",
        paymentStatus: "PAID",
        shippingAddressSnapshot: address,
      },
    ],
    [{ status: "PAID", resolutionStatus: "NONE" }],
    [
      {
        id: "item-a",
        orderId: "order-a",
        adminId: "admin-a",
        quantity: 1,
        skuSnapshot: "SKU",
        weightKgSnapshot: "0.5",
        lengthCmSnapshot: "10",
        breadthCmSnapshot: "10",
        heightCmSnapshot: "5",
      },
    ],
    [],
    [{ email: "buyer@example.com" }],
  ]);
  await assert.rejects(
    createForwardShipment(
      db.db,
      provider,
      "order-a",
      "admin-a",
      packageMeasurements,
    ),
    /No courier is available/,
  );
  assert.equal(calls, 1);
  assert.equal(db.reservations(), 0);
});

test("late paid expired order cannot reach the shipping provider", async () => {
  let providerCalls = 0;
  const provider = {
    key: "shiprocket",
    getServiceability: async () => {
      providerCalls++;
      return { available: true };
    },
  } as unknown as ShippingProvider;
  const db = fakeDb([
    [{ enabled: true }],
    [{ status: "ACTIVE" }],
    [
      { ...address, id: "origin", addressType: "SHIPPING_ORIGIN" },
      { ...address, id: "return", addressType: "RETURN" },
    ],
    [{ locationName: "Warehouse" }],
    [
      {
        id: "order-a",
        customerId: "customer-a",
        status: "EXPIRED",
        stockState: "RELEASED",
        paymentStatus: "PAID",
        shippingAddressSnapshot: address,
      },
    ],
    [{ status: "PAID", resolutionStatus: "REFUND_REQUIRED" }],
  ]);
  await assert.rejects(
    createForwardShipment(
      db.db,
      provider,
      "order-a",
      "admin-a",
      packageMeasurements,
    ),
    /FULFILLMENT_ORDER_INELIGIBLE/,
  );
  assert.equal(providerCalls, 0);
  assert.equal(db.reservations(), 0);
});
