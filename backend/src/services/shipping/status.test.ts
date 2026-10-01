import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShiprocketStatus, parseShiprocketTime } from "./status";

test("Shiprocket status IDs preserve delivery, exception, RTO, and partial delivery distinctions", () => {
  assert.equal(normalizeShiprocketStatus("IN TRANSIT", 18), "IN_TRANSIT");
  assert.equal(
    normalizeShiprocketStatus("PICKUP EXCEPTION", 20),
    "DELIVERY_FAILED",
  );
  assert.equal(normalizeShiprocketStatus("DELIVERED", 7), "DELIVERED");
  assert.equal(normalizeShiprocketStatus("RTO INITIATED", 9), "RTO");
  assert.equal(
    normalizeShiprocketStatus("PARTIAL_DELIVERED", 23),
    "IN_TRANSIT",
  );
  assert.equal(
    normalizeShiprocketStatus("CANCELLATION REQUESTED", 16),
    "CONFIRMED",
  );
  assert.equal(normalizeShiprocketStatus("UNKNOWN COURIER STATE", 999), null);
});

test("provider timestamps are read from payload and invalid dates are rejected", () => {
  assert.equal(
    parseShiprocketTime("23 05 2023 11:43:52")?.toISOString(),
    "2023-05-23T06:13:52.000Z",
  );
  assert.equal(
    parseShiprocketTime("2023-05-23T06:13:52Z")?.toISOString(),
    "2023-05-23T06:13:52.000Z",
  );
  assert.equal(parseShiprocketTime("unavailable"), null);
});
