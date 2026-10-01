import assert from "node:assert/strict";
import test from "node:test";
import worker, { app } from "../../index";

test("Worker exports HTTP and scheduled handlers", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});

test("public catalog accepts only supported sort and availability filters", async () => {
  const invalidSort = await app.request("/api/products?sort=price;drop", {}, { FRONTEND_ORIGIN: "http://localhost:3000" } as never);
  assert.equal(invalidSort.status, 422);
  assert.deepEqual(await invalidSort.json(), { error: "Invalid sort" });

  const invalidAvailability = await app.request("/api/products?available=yes", {}, { FRONTEND_ORIGIN: "http://localhost:3000" } as never);
  assert.equal(invalidAvailability.status, 422);
  assert.deepEqual(await invalidAvailability.json(), { error: "Invalid available" });

  const invalidInStock = await app.request("/api/products?inStock=yes", {}, { FRONTEND_ORIGIN: "http://localhost:3000" } as never);
  assert.equal(invalidInStock.status, 422);
  const conflictingAvailability = await app.request("/api/products?available=false&inStock=true", {}, { FRONTEND_ORIGIN: "http://localhost:3000" } as never);
  assert.equal(conflictingAvailability.status, 422);
});

test("checkout quote requires a customer session before any database read", async () => {
  const response = await app.request("/api/customer/checkout/quote?addressId=missing", {}, {
    FRONTEND_ORIGIN: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-only-test-secret-only-test", BETTER_AUTH_URL: "http://localhost:8787", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", HYPERDRIVE: { connectionString: "postgres://test:test@localhost:5432/test" },
  } as never);
  assert.equal(response.status, 401);
});

test("Admin mutations require trusted origin before session or public activation processing", async () => {
  const env = { FRONTEND_ORIGIN: "http://localhost:3000", BETTER_AUTH_SECRET: "test-secret-only-test-secret-only-test", BETTER_AUTH_URL: "http://localhost:8787", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", HYPERDRIVE: { connectionString: "postgres://test:test@localhost:5432/test" } } as never;
  const activation = await app.request("/api/admin/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, env);
  assert.equal(activation.status, 403);
  assert.deepEqual(await activation.json(), { error: "Untrusted mutation origin" });
  const protectedRoute = await app.request("/api/admin/catalog/categories", { method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost:3000" }, body: "{}" }, env);
  assert.equal(protectedRoute.status, 401);
  const imageUpload = await app.request("/api/admin/products/7feac135-cab3-4ad8-b01e-331550f2eb37/images/upload", { method: "POST", headers: { origin: "http://localhost:3000" } }, env);
  assert.equal(imageUpload.status, 401);
});
