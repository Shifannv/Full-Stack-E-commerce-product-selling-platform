import { Hono } from "hono";
import { createDb } from "../db";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";
import { DomainError } from "../services/admin/admin.service";
import { getAdminId } from "../services/admin/admin.service";
import { assignShipmentAwb, createForwardShipment, getOrderTracking, ingestShiprocketWebhook, requestShipmentPickup } from "../services/shipping/shipping.service";
import { ShiprocketAdapter } from "../services/shipping/providers/shiprocket.adapter";

type ShippingEnv = AuthorizedEnv & { Bindings: AuthorizedEnv["Bindings"] & { SHIPPING_PROVIDER?: string; SHIPROCKET_API_USER_EMAIL?: string; SHIPROCKET_API_USER_PASSWORD?: string; SHIPROCKET_WEBHOOK_TOKEN?: string } };
export const shippingRoutes = new Hono<ShippingEnv>();
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
function seller(actor: { roles: string[]; permissions: string[]; adminApproved: boolean }) {
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("orders.update")) throw new DomainError("Forbidden", 403);
}
function provider(env: ShippingEnv["Bindings"]) {
  if (env.SHIPPING_PROVIDER !== "shiprocket") throw new DomainError("Shipping provider unavailable", 409);
  if (!env.SHIPROCKET_API_USER_EMAIL || !env.SHIPROCKET_API_USER_PASSWORD) throw new DomainError("Shipping provider credentials unavailable", 409);
  return new ShiprocketAdapter(env.SHIPROCKET_API_USER_EMAIL, env.SHIPROCKET_API_USER_PASSWORD);
}

const onError = (error: Error, c: Parameters<Parameters<typeof shippingRoutes.onError>[0]>[1]) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  console.error("Shipping API failed", { name: error.name, code: (error as { code?: string }).code });
  return c.json({ error: "Shipping operation unavailable" }, 503);
};
shippingRoutes.onError(onError);
webhookRoutes.onError(onError);

shippingRoutes.get("/orders/:orderId/tracking", requireAuth, async (c) => {
  const tracking = await withDb(c.env.HYPERDRIVE.connectionString, (db) => getOrderTracking(db, c.req.param("orderId"), c.get("actor"), "customer"));
  return c.json({ shipments: tracking });
});

shippingRoutes.get("/admin/orders/:orderId/tracking", requireAuth, async (c) => {
  const tracking = await withDb(c.env.HYPERDRIVE.connectionString, (db) => getOrderTracking(db, c.req.param("orderId"), c.get("actor"), "admin"));
  return c.json({ shipments: tracking });
});

shippingRoutes.post("/admin/orders/:orderId/shipments", requireAuth, async (c) => {
  seller(c.get("actor"));
  const v = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new DomainError("Invalid JSON body", 422);
  const measurement = (key: string): number => {
    const value = v[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new DomainError(`Invalid ${key}`, 422);
    return value;
  };
  const pkg = { weightKg: measurement("weightKg"), lengthCm: measurement("lengthCm"), breadthCm: measurement("breadthCm"), heightCm: measurement("heightCm") };
  const result = await withDb(c.env.HYPERDRIVE.connectionString, async (db) => createForwardShipment(db, provider(c.env), c.req.param("orderId"), await getAdminId(db, c.get("actor").userId), pkg));
  return c.json({ shipmentId: result.id, status: result.status, providerShipmentId: result.providerShipmentId }, 201);
});

shippingRoutes.post("/admin/shipments/:shipmentId/awb", requireAuth, async (c) => {
  seller(c.get("actor"));
  const result = await withDb(c.env.HYPERDRIVE.connectionString, async (db) => assignShipmentAwb(db, provider(c.env), c.req.param("shipmentId"), await getAdminId(db, c.get("actor").userId)));
  return c.json({ shipmentId: result.id, awbNumber: result.awbNumber, carrierName: result.carrierName, status: result.status });
});

shippingRoutes.post("/admin/shipments/:shipmentId/pickup", requireAuth, async (c) => {
  seller(c.get("actor"));
  const result = await withDb(c.env.HYPERDRIVE.connectionString, async (db) => requestShipmentPickup(db, provider(c.env), c.req.param("shipmentId"), await getAdminId(db, c.get("actor").userId)));
  return c.json({ shipmentId: result.id, pickupRequestedAt: result.pickupRequestedAt });
});

webhookRoutes.post("/shipping/events", async (c) => {
  const expected = c.env.SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected) return c.json({ error: "Webhook unavailable" }, 503);
  if (!sameToken(c.req.header("x-api-key") ?? "", expected)) return c.json({ error: "Unauthorized" }, 401);
  const raw = await c.req.text();
  if (raw.length > 65536) return c.json({ error: "Payload too large" }, 413);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON body", 422); }
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) => ingestShiprocketWebhook(db, payload));
  return c.json({ ok: true, ...result });
});
