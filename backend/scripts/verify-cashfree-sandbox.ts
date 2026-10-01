import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { CashfreePaymentAdapter } from "../src/services/cashfree-payment.adapter";

const vars = parse(readFileSync(".dev.vars"));
if (
  !vars.CASHFREE_CLIENT_ID ||
  !vars.CASHFREE_CLIENT_SECRET ||
  vars.CASHFREE_ENVIRONMENT !== "SANDBOX"
)
  throw new Error("Cashfree sandbox credentials are incomplete");

async function main() {
  const orderId = `verify_${randomUUID().replace(/-/g, "")}`;
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const payload = (await response
        .clone()
        .json()
        .catch(() => null)) as { code?: unknown; type?: unknown } | null;
      console.error("Cashfree sandbox HTTP rejection", {
        status: response.status,
        code: typeof payload?.code === "string" ? payload.code : undefined,
        type: typeof payload?.type === "string" ? payload.type : undefined,
      });
    }
    return response;
  };
  const adapter = new CashfreePaymentAdapter(
    vars.CASHFREE_CLIENT_ID,
    vars.CASHFREE_CLIENT_SECRET,
    vars.CASHFREE_ENVIRONMENT,
    diagnosticFetch,
  );
  const result = await adapter.createOrder({
    orderId,
    amount: "1.00",
    currency: "INR",
    customerId: `verify_${randomUUID().slice(0, 8)}`,
    customerName: "Sandbox Verification",
    customerEmail: "cashfree-verification@example.invalid",
    customerPhone: "9999999999",
    returnUrl: "https://example.invalid/verification",
    notifyUrl: "https://example.invalid/verification/webhook",
  });
  if (result.providerOrderId !== orderId || !result.paymentSessionId)
    throw new Error("Cashfree sandbox response did not match the request");
  console.log(
    "Cashfree sandbox order creation passed; no payment, webhook, or refund was performed",
  );
}
main().catch((error: unknown) => {
  console.error("Cashfree sandbox verification failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    status: (error as { status?: number } | null)?.status,
  });
  process.exitCode = 1;
});
