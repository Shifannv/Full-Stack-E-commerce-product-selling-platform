import assert from "node:assert/strict";
import test from "node:test";
import { CashfreePaymentAdapter, verifyCashfreeWebhookSignature } from "./cashfree-payment.adapter";
import { CashfreeRefundAdapter } from "./returns/cashfree-refund.adapter";

test("Cashfree adapter creates a sandbox order without exposing credentials in its result", async () => {
  let request: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ order_id: "order-1", cf_order_id: 123, payment_session_id: "session-1" });
  };
  const adapter = new CashfreePaymentAdapter("client-id", "client-secret", "SANDBOX", fetcher);
  const result = await adapter.createOrder({ orderId: "order-1", amount: "125.50", currency: "INR", customerId: "customer-1", customerName: "Customer", customerEmail: "customer@example.invalid", customerPhone: "9999999999", returnUrl: "https://shop.example/orders/order-1", notifyUrl: "https://api.example/webhooks/payments/cashfree" });
  assert.equal(request?.url, "https://sandbox.cashfree.com/pg/orders");
  assert.equal(request?.headers.get("x-client-id"), "client-id");
  assert.equal(request?.headers.get("x-client-secret"), "client-secret");
  assert.equal(request?.headers.get("x-api-version"), "2025-01-01");
  assert.equal(request?.headers.get("x-idempotency-key"), "order-1");
  assert.deepEqual(result, { providerOrderId: "order-1", providerReference: "123", paymentSessionId: "session-1" });
  assert.equal(JSON.stringify(result).includes("client-secret"), false);
});

test("Cashfree webhook signature accepts the exact raw body and rejects tampering", async () => {
  const secret = "webhook-secret", timestamp = "1760000000000", raw = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}${raw}`)));
  const signature = btoa(String.fromCharCode(...bytes));
  assert.equal(await verifyCashfreeWebhookSignature(raw, timestamp, signature, secret), true);
  assert.equal(await verifyCashfreeWebhookSignature(`${raw} `, timestamp, signature, secret), false);
  assert.equal(await verifyCashfreeWebhookSignature(raw, timestamp, "invalid", secret), false);
});

test("Cashfree refund adapter stays in sandbox and uses server credentials and refund idempotency", async () => {
  let request: Request | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return Response.json({ refund_status: "PENDING", cf_refund_id: "refund-provider-1", refund_id: "merchant-refund-1",
      order_id: "provider-order-1", refund_amount: 50, refund_currency: "INR", cf_payment_id: "payment-1" });
  };
  const adapter = new CashfreeRefundAdapter("client-id", "client-secret", "SANDBOX", fetcher);
  const result = await adapter.createRefund("provider-order-1", "merchant-refund-1", "50.00");
  assert.equal(request?.url, "https://sandbox.cashfree.com/pg/orders/provider-order-1/refunds");
  assert.equal(request?.headers.get("x-client-id"), "client-id");
  assert.equal(request?.headers.get("x-client-secret"), "client-secret");
  assert.equal(request?.headers.get("x-idempotency-key"), "merchant-refund-1");
  assert.deepEqual(result, { status: "PENDING", refundId: "merchant-refund-1", orderId: "provider-order-1",
    amount: 50, currency: "INR", providerPaymentId: "payment-1", providerReference: "refund-provider-1" });
  assert.equal(JSON.stringify(result).includes("client-secret"), false);
});
