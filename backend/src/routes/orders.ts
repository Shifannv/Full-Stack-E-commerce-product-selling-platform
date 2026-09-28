import { Hono } from "hono";
import { createDb } from "../db";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";
import { DomainError, requiredText } from "../services/admin/admin.service";
import { checkoutCart, getAdminOrders, getCustomerOrders } from "../services/customer/order.service";

export const orderRoutes = new Hono<AuthorizedEnv>();
orderRoutes.use("*", requireAuth);
async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) { const { client, db } = createDb(connectionString); try { return await action(db); } finally { await client.end({ timeout: 1 }); } }
orderRoutes.onError((error, c) => { if (error instanceof DomainError) return c.json({ error: error.message }, error.status); console.error("Order API failed", { name: error.name, code: (error as { code?: string }).code }); return c.json({ error: "Order operation unavailable" }, 503); });

orderRoutes.post("/checkout", async (c) => { if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403); const v = await c.req.json().catch(() => null) as Record<string, unknown> | null; if (!v) throw new DomainError("Invalid JSON body", 422); const order = await withDb(c.env.HYPERDRIVE.connectionString, (db) => checkoutCart(db, c.get("actor").userId, requiredText(v.addressId, "addressId", 40))); return c.json({ order }, 201); });
orderRoutes.get("/orders", async (c) => { if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403); return c.json({ orders: await withDb(c.env.HYPERDRIVE.connectionString, (db) => getCustomerOrders(db, c.get("actor").userId)) }); });
orderRoutes.get("/orders/:orderId", async (c) => { if (!c.get("actor").roles.includes("CUSTOMER")) throw new DomainError("Forbidden", 403); const [order] = await withDb(c.env.HYPERDRIVE.connectionString, (db) => getCustomerOrders(db, c.get("actor").userId, c.req.param("orderId"))); return c.json(order); });
orderRoutes.get("/admin/orders", async (c) => c.json({ orders: await withDb(c.env.HYPERDRIVE.connectionString, (db) => getAdminOrders(db, c.get("actor"))) }));
orderRoutes.get("/admin/orders/:orderId", async (c) => { const [order] = await withDb(c.env.HYPERDRIVE.connectionString, (db) => getAdminOrders(db, c.get("actor"), c.req.param("orderId"))); return c.json(order); });
