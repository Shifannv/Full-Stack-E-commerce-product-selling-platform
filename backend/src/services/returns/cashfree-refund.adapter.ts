type RefundResult = { status: "SUCCESS" | "PENDING" | "PENDING_APPROVAL" | "CANCELLED" | "ONHOLD" | "REJECTED"; providerReference: string | null };

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
      headers: {
        "Content-Type": "application/json", "x-api-version": "2026-01-01",
        "x-client-id": this.clientId, "x-client-secret": this.clientSecret,
        ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Cashfree refund request failed (${response.status})`);
    const payload: unknown = await response.json();
    const result = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null;
    const status = result?.refund_status;
    if (status !== "SUCCESS" && status !== "PENDING" && status !== "PENDING_APPROVAL" && status !== "CANCELLED" && status !== "ONHOLD" && status !== "REJECTED") throw new Error("Cashfree refund response is invalid");
    return { status, providerReference: result?.cf_refund_id === undefined ? null : String(result.cf_refund_id) };
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
