import { DomainError } from "./admin/admin.service";

export type CashfreeOrderRequest = {
  orderId: string; amount: string; currency: string; customerId: string; customerName: string;
  customerEmail: string; customerPhone: string; returnUrl: string; notifyUrl: string;
};

export type CashfreeOrderResponse = { providerOrderId: string; providerReference: string | null; paymentSessionId: string };
const baseUrls = { SANDBOX: "https://sandbox.cashfree.com/pg", PRODUCTION: "https://api.cashfree.com/pg" } as const;

export class CashfreePaymentAdapter {
  private readonly baseUrl: string;
  constructor(private readonly clientId: string, private readonly clientSecret: string, environment: string, private readonly fetcher: typeof fetch = fetch) {
    const key = environment.toUpperCase() as keyof typeof baseUrls;
    if (!clientId || !clientSecret || !baseUrls[key]) throw new Error("Cashfree payment configuration is incomplete");
    this.baseUrl = baseUrls[key];
  }
  async createOrder(input: CashfreeOrderRequest): Promise<CashfreeOrderResponse> {
    const response = await this.fetcher(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-version": "2025-01-01", "x-client-id": this.clientId, "x-client-secret": this.clientSecret, "x-idempotency-key": input.orderId },
      body: JSON.stringify({
        order_id: input.orderId, order_amount: Number(input.amount), order_currency: input.currency,
        customer_details: { customer_id: input.customerId, customer_name: input.customerName, customer_email: input.customerEmail, customer_phone: input.customerPhone },
        order_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
      }),
    });
    if (!response.ok) throw new DomainError("Payment provider rejected the order", 502);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || typeof payload.payment_session_id !== "string" || typeof payload.order_id !== "string") throw new DomainError("Payment provider returned an invalid response", 502);
    return { providerOrderId: payload.order_id, providerReference: typeof payload.cf_order_id === "string" || typeof payload.cf_order_id === "number" ? String(payload.cf_order_id) : null, paymentSessionId: payload.payment_session_id };
  }
}

function decodeBase64(value: string): Uint8Array | null {
  try { const decoded = atob(value); return Uint8Array.from(decoded, (character) => character.charCodeAt(0)); } catch { return null; }
}
function equalBytes(actual: Uint8Array, expected: Uint8Array): boolean {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index++) difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  return difference === 0;
}
export async function verifyCashfreeWebhookSignature(rawBody: string, timestamp: string, signature: string, clientSecret: string): Promise<boolean> {
  if (!timestamp || !signature || !clientSecret || !/^\d{10,16}$/.test(timestamp)) return false;
  const supplied = decodeBase64(signature);
  if (!supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(clientSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}${rawBody}`)));
  return equalBytes(supplied, expected);
}
