import { Hono } from "hono";
import { createDb } from "../../db";
import type { AuthorizedEnv } from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { ingestShiprocketWebhook } from "../../services/shipping/shipping.service";
import { readBoundedBody } from "../../lib/security/body";

type ShippingEnv = AuthorizedEnv & { Bindings: AuthorizedEnv["Bindings"] & { SHIPPING_PROVIDER?: string; SHIPROCKET_API_EMAIL?: string; SHIPROCKET_API_PASSWORD?: string; SHIPROCKET_API_BASE_URL?: string; SHIPROCKET_WEBHOOK_TOKEN?: string } };
export const webhookRoutes = new Hono<ShippingEnv>();

async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } finally { await client.end({ timeout: 1 }); }
}
function sameToken(actual: string, expected: string): boolean {
  const a = new TextEncoder().encode(actual);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

webhookRoutes.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  console.error("Shipping API failed", { name: error.name, code: (error as { code?: string }).code });
  return c.json({ error: "Shipping operation unavailable" }, 503);
});

webhookRoutes.post("/shipping/events", async (c) => {
  const expected = c.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected) return c.json({ error: "Webhook unavailable" }, 503);
  if (!sameToken(c.req.header("x-api-key") ?? "", expected)) return c.json({ error: "Unauthorized" }, 401);
  const contentType = c.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return c.json({ error: "Content-Type must be application/json" }, 415);
  const raw = new TextDecoder().decode(await readBoundedBody(c.req.raw, 65536));
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON body", 422); }
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) => ingestShiprocketWebhook(db, payload));
  return c.json({ ok: true, ...result });
});
