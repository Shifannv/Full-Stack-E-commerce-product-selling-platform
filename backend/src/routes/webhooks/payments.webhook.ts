import { Hono } from "hono";
import { createDb } from "../../db";
import type { AuthorizedEnv } from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { verifyCashfreeWebhookSignature } from "../../services/cashfree-payment.adapter";
import { ingestCashfreeWebhook } from "../../services/payment.service";
import { readBoundedBody } from "../../lib/security/body";

type PaymentEnv = AuthorizedEnv & {
  Bindings: AuthorizedEnv["Bindings"] & {
    CASHFREE_CLIENT_ID?: string;
    CASHFREE_CLIENT_SECRET?: string;
    CASHFREE_ENVIRONMENT?: string;
  };
};
export const paymentWebhookRoutes = new Hono<PaymentEnv>();

async function withDb<T>(
  connectionString: string,
  action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
): Promise<T> {
  const { client, db } = createDb(connectionString);
  try {
    return await action(db);
  } finally {
    await client.end({ timeout: 1 });
  }
}

paymentWebhookRoutes.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json({ error: error.message }, error.status);
  console.error("Payment API failed", {
    name: error.name,
    code: (error as { code?: string }).code,
  });
  return c.json({ error: "Payment operation unavailable" }, 503);
});

paymentWebhookRoutes.post("/payments/cashfree", async (c) => {
  const secret = c.env.CASHFREE_CLIENT_SECRET;
  if (!secret) return c.json({ error: "Webhook unavailable" }, 503);
  const raw = new TextDecoder().decode(await readBoundedBody(c.req.raw, 65536));
  const signature = c.req.header("x-webhook-signature") ?? "",
    timestamp = c.req.header("x-webhook-timestamp") ?? "";
  if (
    !(await verifyCashfreeWebhookSignature(raw, timestamp, signature, secret))
  )
    return c.json({ error: "Unauthorized" }, 401);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new DomainError("Invalid JSON body", 422);
  }
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    ingestCashfreeWebhook(db, payload),
  );
  return c.json({ ok: true, ...result });
});
