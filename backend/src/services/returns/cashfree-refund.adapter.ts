export type RefundResult = {
  status: "SUCCESS" | "PENDING" | "PENDING_APPROVAL" | "CANCELLED" | "ONHOLD" | "REJECTED";
  refundId: string; orderId: string; amount: number; currency: string;
  providerPaymentId: string; providerReference: string | null;
};

export class CashfreeRefundAdapter {
  private readonly base: string;
  constructor(private readonly clientId: string, private readonly clientSecret: string, environment: string, private readonly fetcher: typeof fetch = fetch) {
    if (!clientId || !clientSecret) throw new Error("Cashfree payment credentials are required");
    if (environment !== "SANDBOX" && environment !== "PRODUCTION") throw new Error("Invalid Cashfree environment");
    this.base = environment === "SANDBOX" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  }

  private async request(path: string, method: "GET" | "POST", body?: Record<string, unknown>, idempotencyKey?: string): Promise<RefundResult> {
    const response = await this.fetcher(`${this.base}${path}`, {
      method,
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json", "x-api-version": "2026-01-01",
        "x-client-id": this.clientId, "x-client-secret": this.clientSecret,
        ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Cashfree refund request failed (${response.status})`);
    const payload: unknown = await response.json();
    const result = (Array.isArray(payload) ? payload.length === 1 ? payload[0] : null : payload) as Record<string, unknown> | null;
    const status = result?.refund_status;
    if (status !== "SUCCESS" && status !== "PENDING" && status !== "PENDING_APPROVAL" && status !== "CANCELLED" && status !== "ONHOLD" && status !== "REJECTED") throw new Error("Cashfree refund response is invalid");
    const amount = result?.refund_amount;
    if (!result || typeof result.refund_id !== "string" || !result.refund_id || typeof result.order_id !== "string" || !result.order_id
      || typeof result.refund_currency !== "string" || !result.refund_currency
      || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0
      || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
      || (typeof result.cf_payment_id !== "string" && typeof result.cf_payment_id !== "number")
      || String(result.cf_payment_id).length === 0
      || (result.cf_refund_id !== undefined && result.cf_refund_id !== null
        && typeof result.cf_refund_id !== "string" && typeof result.cf_refund_id !== "number"))
      throw new Error("Cashfree refund response is not attributable");
    return { status, refundId: result.refund_id, orderId: result.order_id, amount, currency: result.refund_currency,
      providerPaymentId: String(result.cf_payment_id), providerReference: result.cf_refund_id == null ? null : String(result.cf_refund_id) };
  }

  createRefund(providerOrderId: string, refundId: string, amount: string): Promise<RefundResult> {
    return this.request(`/orders/${encodeURIComponent(providerOrderId)}/refunds`, "POST", {
      refund_amount: Number(amount), refund_id: refundId, refund_note: "Approved product return", refund_speed: "STANDARD",
    }, refundId);
  }

  getRefund(providerOrderId: string, refundId: string): Promise<RefundResult> {
    return this.request(`/orders/${encodeURIComponent(providerOrderId)}/refunds/${encodeURIComponent(refundId)}`, "GET");
  }
}
