import assert from "node:assert/strict";
import test from "node:test";
import app from "../index";

test("public catalog accepts only supported sort and availability filters", async () => {
  const invalidSort = await app.request("/api/products?sort=price;drop", {}, { FRONTEND_ORIGIN: "http://localhost:3000" } as never);
  assert.equal(invalidSort.status, 422);
  assert.deepEqual(await invalidSort.json(), { error: "Invalid sort" });

  const invalidAvailability = await app.request("/api/products?available=yes", {}, { FRONTEND_ORIGIN: "http://localhost:3000" } as never);
  assert.equal(invalidAvailability.status, 422);
  assert.deepEqual(await invalidAvailability.json(), { error: "Invalid available" });
});

test("checkout quote requires a customer session before any database read", async () => {
  const response = await app.request("/api/customer/checkout/quote?addressId=missing", {}, {
    FRONTEND_ORIGIN: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-only-test-secret-only-test", BETTER_AUTH_URL: "http://localhost:8787", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", HYPERDRIVE: { connectionString: "postgres://test:test@localhost:5432/test" },
  } as never);
  assert.equal(response.status, 401);
});
