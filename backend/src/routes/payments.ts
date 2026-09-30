import { Hono } from "hono";
import { createDb } from "../db";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";
import { DomainError } from "../services/admin/admin.service";
import { CashfreePaymentAdapter, verifyCashfreeWebhookSignature } from "../services/cashfree-payment.adapter";
import { createPaymentSession, ingestCashfreeWebhook } from "../services/payment.service";
import { readBoundedBody } from "../lib/security/body";

type PaymentEnv = AuthorizedEnv & { Bindings: AuthorizedEnv["Bindings"] & { CASHFREE_CLIENT_ID?: string; CASHFREE_CLIENT_SECRET?: string; CASHFREE_ENVIRONMENT?: string } };
export const paymentRoutes = new Hono<PaymentEnv>();
export const paymentWebhookRoutes = new Hono<PaymentEnv>();

async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } finally { await client.end({ timeout: 1 }); }
}
const onError = (error: Error, c: Parameters<Parameters<typeof paymentRoutes.onError>[0]>[1]) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  console.error("Payment API failed", { name: error.name, code: (error as { code?: string }).code });
  return c.json({ error: "Payment operation unavailable" }, 503);
};
paymentRoutes.onError(onError);
paymentWebhookRoutes.onError(onError);

paymentRoutes.post("/orders/:orderId/payment-session", requireAuth, async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403);
  const { CASHFREE_CLIENT_ID: clientId, CASHFREE_CLIENT_SECRET: secret, CASHFREE_ENVIRONMENT: environment } = c.env;
  if (!clientId || !secret || !environment) throw new DomainError("Cashfree payment credentials are unavailable", 409);
  const orderId = c.req.param("orderId");
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) => createPaymentSession(
    db, new CashfreePaymentAdapter(clientId, secret, environment), orderId, actor.userId,
    new URL(`/orders/${orderId}`, c.env.FRONTEND_ORIGIN).toString(),
    new URL("/webhooks/payments/cashfree", c.env.BETTER_AUTH_URL).toString(),
  ));
  return c.json(result);
});

paymentWebhookRoutes.post("/payments/cashfree", async (c) => {
  const secret = c.env.CASHFREE_CLIENT_SECRET;
  if (!secret) return c.json({ error: "Webhook unavailable" }, 503);
  const raw = new TextDecoder().decode(await readBoundedBody(c.req.raw, 65536));
  const signature = c.req.header("x-webhook-signature") ?? "", timestamp = c.req.header("x-webhook-timestamp") ?? "";
  if (!await verifyCashfreeWebhookSignature(raw, timestamp, signature, secret)) return c.json({ error: "Unauthorized" }, 401);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON body", 422); }
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) => ingestCashfreeWebhook(db, payload));
  return c.json({ ok: true, ...result });
});
