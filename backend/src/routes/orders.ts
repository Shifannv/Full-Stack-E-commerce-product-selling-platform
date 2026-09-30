import { Hono } from "hono";
import { createDb } from "../db";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";
import { DomainError, requiredText } from "../services/admin/admin.service";
import { checkoutCart, getAdminOrders, getCustomerOrders } from "../services/customer/order.service";
import { cancelUnpaidOrderInTransaction, withTransitionRetry } from "../services/reservation.service";
import { recordSensitiveAction } from "../services/security-audit";

export const orderRoutes = new Hono<AuthorizedEnv>();
orderRoutes.use("*", requireAuth);
async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) { const { client, db } = createDb(connectionString); try { return await action(db); } finally { await client.end({ timeout: 1 }); } }
orderRoutes.onError((error, c) => { if (error instanceof DomainError) return c.json({ error: error.message }, error.status); console.error("Order API failed", { name: error.name, code: (error as { code?: string }).code }); return c.json({ error: "Order operation unavailable" }, 503); });

orderRoutes.post("/checkout", async (c) => {
  if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403);
  const key = c.req.header("Idempotency-Key");
  if (!key) throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", 422);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new DomainError("INVALID_IDEMPOTENCY_KEY", 422);
  const v = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!v) throw new DomainError("INVALID_JSON", 422);
  const addressId = requiredText(v.addressId, "addressId", 40);
  if (!Number.isInteger(v.cartVersion) || (v.cartVersion as number) < 0 || typeof v.lineFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(v.lineFingerprint)) throw new DomainError("INVALID_QUOTE_PRECONDITION", 422);
  const order = await withDb(c.env.HYPERDRIVE.connectionString, (db) => checkoutCart(db, c.get("actor").userId, { addressId, key, cartVersion: v.cartVersion as number, lineFingerprint: v.lineFingerprint as string }));
  return c.json(order, order.replayed ? 200 : 201);
});
orderRoutes.get("/orders", async (c) => { if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403); return c.json({ orders: await withDb(c.env.HYPERDRIVE.connectionString, (db) => getCustomerOrders(db, c.get("actor").userId)) }); });
orderRoutes.get("/orders/:orderId", async (c) => { if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403); const [order] = await withDb(c.env.HYPERDRIVE.connectionString, (db) => getCustomerOrders(db, c.get("actor").userId, c.req.param("orderId"))); return c.json(order); });
orderRoutes.post("/orders/:orderId/cancel", async (c) => {
  if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403);
  const orderId = c.req.param("orderId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new DomainError("INVALID_ORDER_ID", 422);
  const result = await withDb(c.env.HYPERDRIVE.connectionString, db => withTransitionRetry(db, async tx => {
    const cancelled = await cancelUnpaidOrderInTransaction(tx, orderId, c.get("actor").userId);
    if (!cancelled.replayed) await recordSensitiveAction(tx, c.get("actor").userId, "ORDER_CANCELLED", "ORDER", cancelled.orderId, { paymentStatus: cancelled.paymentStatus, stockState: cancelled.stockState });
    return cancelled;
  }));
  return c.json(result);
});
orderRoutes.get("/admin/orders", async (c) => c.json({ orders: await withDb(c.env.HYPERDRIVE.connectionString, (db) => getAdminOrders(db, c.get("actor"))) }));
orderRoutes.get("/admin/orders/:orderId", async (c) => { const [order] = await withDb(c.env.HYPERDRIVE.connectionString, (db) => getAdminOrders(db, c.get("actor"), c.req.param("orderId"))); return c.json(order); });
