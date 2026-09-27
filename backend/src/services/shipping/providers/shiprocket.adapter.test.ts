import assert from "node:assert/strict";
import test from "node:test";
import { ShiprocketAdapter } from "./shiprocket.adapter";

test("Shiprocket adapter authenticates privately, retries an expired token, and sends prepaid serviceability", async () => {
  const calls: Array<{ url: string; headers: Headers; body: string | undefined }> = [];
  let logins = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/auth/login")) return Response.json({ token: `private-token-${++logins}` });
    if (logins === 1) return Response.json({}, { status: 401 });
    return Response.json({ data: { available_courier_companies: [] } });
  };
  const adapter = new ShiprocketAdapter("api@example.com", "private-password", fetcher);
  await adapter.getServiceability("110001", "560001", 1.5);
  assert.equal(logins, 2);
  assert.equal(calls.at(-1)?.headers.get("Authorization"), "Bearer private-token-2");
  assert.match(calls.at(-1)?.url ?? "", /cod=0/);
  assert.equal(calls.some((call) => call.url.includes("private-password")), false);
});

test("Shiprocket adapter rejects incomplete provider references", async () => {
  const fetcher: typeof fetch = async (input) => String(input).endsWith("/auth/login") ? Response.json({ token: "private" }) : Response.json({ order_id: 10 });
  const adapter = new ShiprocketAdapter("api@example.com", "private-password", fetcher);
  await assert.rejects(adapter.createShipment({
    externalOrderId: "test-order", orderDate: new Date("2026-09-26T00:00:00Z"), pickupLocation: "Test Pickup",
    destination: { contactName: "Buyer", phone: "9999999999", line1: "Test Road", city: "Delhi", state: "Delhi", postalCode: "110001", country: "India" },
    customerEmail: "buyer@example.com", items: [{ name: "Dress", sku: "D-1", quantity: 1, unitPrice: "100.00", discount: "0.00" }], subtotal: "100.00",
    weightKg: 0.5, lengthCm: 10, breadthCm: 10, heightCm: 5,
  }), /missing references/);
});

test("pickup lookup returns references without private address or contact data", async () => {
  const fetcher: typeof fetch = async (input) => String(input).endsWith("/auth/login")
    ? Response.json({ token: "private" })
    : Response.json({ data: { shipping_address: [{ id: 123, pickup_location: "Warehouse", pin_code: "110001", status: 2, phone: "9999999999", email: "private@example.com", address: "Private Street" }] } });
  const result = await new ShiprocketAdapter("api@example.com", "private-password", fetcher).listPickupLocations();
  assert.deepEqual(result, [{ reference: "123", name: "Warehouse", postalCode: "110001", status: "2" }]);
});
