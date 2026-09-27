import assert from "node:assert/strict";
import test from "node:test";
import { getReturn, returnWindowDays } from "./return.service";
import { CashfreeRefundAdapter } from "./cashfree-refund.adapter";

test("return requests need an explicit published policy window", () => {
  assert.throws(() => returnWindowDays(undefined), /not configured/);
  assert.throws(() => returnWindowDays("0"), /not configured/);
  assert.throws(() => returnWindowDays("366"), /not configured/);
  assert.equal(returnWindowDays("14"), 14);
});

test("return status hides the seller address until approval and enforces ownership", async () => {
  const address = { contactName: "Seller", phone: "9999999999", line1: "Return Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" };
  const actor = { userId: "customer-a", roles: ["CUSTOMER"], permissions: [], adminApproved: false };
  const record = { id: "return-a", orderId: "order-a", customerId: "customer-a", status: "REQUESTED", returnAddressSnapshot: address };
  const fakeDb = (status: string) => {
    const rows = [[{ ...record, status }], []];
    return { select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.shift() ?? [] }) }) }) } as unknown as Parameters<typeof getReturn>[0];
  };
  assert.equal((await getReturn(fakeDb("REQUESTED"), "return-a", actor, "customer")).returnAddress, null);
  assert.deepEqual((await getReturn(fakeDb("APPROVED"), "return-a", actor, "customer")).returnAddress, address);
  await assert.rejects(getReturn(fakeDb("APPROVED"), "return-a", { ...actor, userId: "customer-b" }, "customer"), /Return unavailable/);
  await assert.rejects(getReturn(fakeDb("APPROVED"), "return-a", { userId: "admin-a", roles: ["ADMIN"], permissions: [], adminApproved: true }, "admin"), /Return unavailable/);
});

test("refund request uses the same merchant refund ID as its idempotency key", async () => {
  let requested: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requested = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
    return Response.json({ refund_status: "PENDING", cf_refund_id: "cf-test" });
  };
  const adapter = new CashfreeRefundAdapter("private-id", "private-secret", "SANDBOX", fetcher);
  const result = await adapter.createRefund("paid-order", "2c32120e-524b-44db-b774-f1915017d9e6", "120.00");
  assert.equal(result.status, "PENDING");
  assert.equal(requested?.headers.get("x-idempotency-key"), requested?.body.refund_id);
  assert.equal(requested?.body.refund_amount, 120);
  assert.equal(requested?.url, "https://sandbox.cashfree.com/pg/orders/paid-order/refunds");
});
