import assert from "node:assert/strict";
import test from "node:test";
import { ShiprocketAdapter } from "./shiprocket.adapter";

test("Shiprocket adapter authenticates privately, retries an expired token, and sends prepaid serviceability", async () => {
  const calls: Array<{
    url: string;
    headers: Headers;
    body: string | undefined;
  }> = [];
  let logins = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (url.endsWith("/auth/login"))
      return Response.json({ token: `private-token-${++logins}` });
    if (logins === 1) return Response.json({}, { status: 401 });
    return Response.json({ data: { available_courier_companies: [] } });
  };
  const adapter = new ShiprocketAdapter(
    "api@example.com",
    "private-password",
    fetcher,
  );
  assert.deepEqual(await adapter.getServiceability("110001", "560001", 1.5), {
    available: false,
    courierCount: 0,
  });
  assert.equal(logins, 2);
  assert.equal(
    calls.at(-1)?.headers.get("Authorization"),
    "Bearer private-token-2",
  );
  assert.match(calls.at(-1)?.url ?? "", /cod=0/);
  assert.equal(
    calls.some((call) => call.url.includes("private-password")),
    false,
  );
});

test("serviceability uses validated courier availability without exposing raw provider data", async () => {
  const fetcher: typeof fetch = async (input) =>
    String(input).endsWith("/auth/login")
      ? Response.json({ token: "private" })
      : Response.json({
          data: {
            available_courier_companies: [
              { courier_company_id: 42, blocked: 0, private_rate: 100 },
            ],
          },
        });
  const adapter = new ShiprocketAdapter(
    "api@example.com",
    "private-password",
    fetcher,
  );
  assert.deepEqual(await adapter.getServiceability("110001", "560001", 1), {
    available: true,
    courierCount: 1,
  });
  const malformed: typeof fetch = async (input) =>
    String(input).endsWith("/auth/login")
      ? Response.json({ token: "private" })
      : Response.json({ data: { available_courier_companies: "unexpected" } });
  await assert.rejects(
    new ShiprocketAdapter(
      "api@example.com",
      "private-password",
      malformed,
    ).getServiceability("110001", "560001", 1),
    /response is invalid/,
  );
});

test("Shiprocket adapter rejects incomplete provider references", async () => {
  const fetcher: typeof fetch = async (input) =>
    String(input).endsWith("/auth/login")
      ? Response.json({ token: "private" })
      : Response.json({ order_id: 10 });
  const adapter = new ShiprocketAdapter(
    "api@example.com",
    "private-password",
    fetcher,
  );
  await assert.rejects(
    adapter.createShipment({
      externalOrderId: "test-order",
      orderDate: new Date("2026-09-26T00:00:00Z"),
      pickupLocation: "Test Pickup",
      destination: {
        contactName: "Buyer",
        phone: "9999999999",
        line1: "Test Road",
        city: "Delhi",
        state: "Delhi",
        postalCode: "110001",
        country: "India",
      },
      customerEmail: "buyer@example.com",
      items: [
        {
          name: "Dress",
          sku: "D-1",
          quantity: 1,
          unitPrice: "100.00",
          discount: "0.00",
        },
      ],
      subtotal: "100.00",
      weightKg: 0.5,
      lengthCm: 10,
      breadthCm: 10,
      heightCm: 5,
    }),
    /missing references/,
  );
});

test("pickup lookup returns references without private address or contact data", async () => {
  const fetcher: typeof fetch = async (input) =>
    String(input).endsWith("/auth/login")
      ? Response.json({ token: "private" })
      : Response.json({
          data: {
            shipping_address: [
              {
                id: 123,
                pickup_location: "Warehouse",
                pin_code: "110001",
                status: 2,
                phone: "9999999999",
                email: "private@example.com",
                address: "Private Street",
              },
            ],
          },
        });
  const result = await new ShiprocketAdapter(
    "api@example.com",
    "private-password",
    fetcher,
  ).listPickupLocations();
  assert.deepEqual(result, [
    { reference: "123", name: "Warehouse", postalCode: "110001", status: "2" },
  ]);
});

test("shipment creation maps a paid order to provider fields and keeps credentials in authentication only", async () => {
  const calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers: Headers;
  }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    });
    return url.endsWith("/auth/login")
      ? Response.json({ token: "private-token" })
      : Response.json({
          order_id: 11,
          shipment_id: 22,
          ignored_private_data: "private",
        });
  };
  const adapter = new ShiprocketAdapter(
    "api@example.com",
    "private-password",
    fetcher,
  );
  const created = await adapter.createShipment({
    externalOrderId: "internal-shipment-id",
    orderDate: new Date("2026-09-26T00:00:00Z"),
    pickupLocation: "Warehouse",
    destination: {
      contactName: "Buyer",
      phone: "9999999999",
      line1: "Test Road",
      city: "Delhi",
      state: "Delhi",
      postalCode: "110001",
      country: "IN",
    },
    customerEmail: "buyer@example.com",
    items: [
      {
        name: "Dress",
        sku: "D-1",
        quantity: 1,
        unitPrice: "100.00",
        discount: "0.00",
      },
    ],
    subtotal: "100.00",
    weightKg: 0.5,
    lengthCm: 10,
    breadthCm: 10,
    heightCm: 5,
  });
  assert.deepEqual(created, {
    providerOrderId: "11",
    providerShipmentId: "22",
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, {
    email: "api@example.com",
    password: "private-password",
  });
  assert.equal(calls[1].body.payment_method, "Prepaid");
  assert.equal(calls[1].body.pickup_location, "Warehouse");
  assert.equal(calls[1].body.order_id, "internal-shipment-id");
  assert.equal(calls[1].headers.get("Authorization"), "Bearer private-token");
  assert.equal(
    JSON.stringify(calls[1].body).includes("private-password"),
    false,
  );
});

test("AWB assignment and pickup use provider shipment references", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) return Response.json({ token: "private" });
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return url.endsWith("/courier/assign/awb")
      ? Response.json({
          response: {
            data: { awb_code: "AWB-42", courier_name: "Fixture Courier" },
          },
        })
      : Response.json({ status: 1 });
  };
  const adapter = new ShiprocketAdapter(
    "api@example.com",
    "private-password",
    fetcher,
  );
  assert.deepEqual(await adapter.assignAwb("12345"), {
    awbNumber: "AWB-42",
    carrierName: "Fixture Courier",
  });
  await adapter.requestPickup("12345");
  assert.deepEqual(
    calls.map((call) => call.body),
    [{ shipment_id: 12345 }, { shipment_id: [12345] }],
  );
  await assert.rejects(
    adapter.assignAwb("not-a-number"),
    /Invalid Shiprocket shipment reference/,
  );
  assert.equal(calls.length, 2);
  const rejection: typeof fetch = async (input) =>
    String(input).endsWith("/auth/login")
      ? Response.json({ token: "private" })
      : Response.json({ status: 0 });
  await assert.rejects(
    new ShiprocketAdapter(
      "api@example.com",
      "private-password",
      rejection,
    ).requestPickup("12345"),
    /pickup request was rejected/,
  );
});
