import assert from "node:assert/strict";
import test from "node:test";
import app from "../index";
import { webhookRoutes } from "./shipping";

const endpoint = "/shipping/events";
const secret = "private-webhook-token";

test("shipping webhook refuses requests without a configured secret", async () => {
  const response = await webhookRoutes.request(endpoint, { method: "POST", body: "{}" }, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Webhook unavailable" });
});

test("the Worker registers the neutral webhook route", async () => {
  const response = await app.request("/webhooks/shipping/events", { method: "POST" }, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Webhook unavailable" });
});

test("shipping webhook rejects an incorrect secret before reading provider data", async () => {
  const response = await webhookRoutes.request(endpoint, {
    method: "POST", headers: { "x-api-key": "incorrect" }, body: "{}",
  }, { SHIPROCKET_WEBHOOK_TOKEN: secret });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("shipping webhook validates JSON and limits UTF-8 payload bytes", async () => {
  const env = { SHIPROCKET_WEBHOOK_TOKEN: secret };
  const headers = { "x-api-key": secret, "content-type": "application/json" };
  const invalid = await webhookRoutes.request(endpoint, { method: "POST", headers, body: "{" }, env);
  assert.equal(invalid.status, 422);
  assert.deepEqual(await invalid.json(), { error: "Invalid JSON body" });

  const oversized = await webhookRoutes.request(endpoint, {
    method: "POST", headers, body: "é".repeat(32769),
  }, env);
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "Payload too large" });
});

test("shipping webhook only accepts JSON after successful authentication", async () => {
  const response = await webhookRoutes.request(endpoint, {
    method: "POST", headers: { "x-api-key": secret, "content-type": "text/plain" }, body: "{}",
  }, { SHIPROCKET_WEBHOOK_TOKEN: secret });
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "Content-Type must be application/json" });
});
