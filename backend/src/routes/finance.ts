import { Hono } from "hono";
import { createDb } from "../db";
import { getAdminId, DomainError, requiredText } from "../services/admin/admin.service";
import { createSettlement, getAdminFinance, getFinanceSettings, markPayoutPaid, parseBasisPoints, requestPayout, reviewPayout, updateFinanceSetting } from "../services/admin/finance.service";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";

export const financeRoutes = new Hono<AuthorizedEnv>();
financeRoutes.use("*", requireAuth);
async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) { const { client, db } = createDb(connectionString); try { return await action(db); } finally { await client.end({ timeout: 1 }); } }
async function body(c: { req: { json: () => Promise<unknown> } }) { const v = await c.req.json().catch(() => null); if (!v || typeof v !== "object" || Array.isArray(v)) throw new DomainError("Invalid JSON body", 422); return v as Record<string, unknown>; }
financeRoutes.onError((error, c) => { if (error instanceof DomainError) return c.json({ error: error.message }, error.status); console.error("Finance API failed", { name: error.name, code: (error as { code?: string }).code }); return c.json({ error: "Finance operation unavailable" }, 503); });
function superAdmin(roles: string[]) { if (!roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403); }
function approvedAdmin(actor: { roles: string[]; permissions: string[]; adminApproved: boolean }) { if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("payouts.view")) throw new DomainError("Forbidden", 403); }

financeRoutes.get("/admin/finance", async (c) => { approvedAdmin(c.get("actor")); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => getAdminFinance(db, await getAdminId(db, c.get("actor").userId)))); });
financeRoutes.post("/admin/payouts", async (c) => { const actor = c.get("actor"); approvedAdmin(actor); if (!actor.permissions.includes("payouts.request")) throw new DomainError("Forbidden", 403); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => requestPayout(db, await getAdminId(db, actor.userId))), 201); });
financeRoutes.get("/super-admin/finance-settings", async (c) => { superAdmin(c.get("actor").roles); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, getFinanceSettings)); });
financeRoutes.put("/super-admin/finance-settings/commission", async (c) => { superAdmin(c.get("actor").roles); const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, db => updateFinanceSetting(db, "COMMISSION_BPS", parseBasisPoints(v.basisPoints), c.get("actor").userId))); });
financeRoutes.put("/super-admin/finance-settings/payment-gateway-fee", async (c) => { superAdmin(c.get("actor").roles); const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, db => updateFinanceSetting(db, "PAYMENT_GATEWAY_FEE_BPS", parseBasisPoints(v.basisPoints), c.get("actor").userId))); });
financeRoutes.post("/super-admin/settlements", async (c) => { superAdmin(c.get("actor").roles); const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => createSettlement(db, requiredText(v.orderItemId, "orderItemId", 40), typeof v.refundAdjustment === "string" ? v.refundAdjustment : "0.00", c.get("actor").userId)), 201); });
financeRoutes.post("/super-admin/payouts/:payoutId/decision", async (c) => { superAdmin(c.get("actor").roles); const v = await body(c); if (v.decision !== "APPROVED" && v.decision !== "REJECTED") throw new DomainError("Invalid decision", 422); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => reviewPayout(db, c.req.param("payoutId"), c.get("actor").userId, v.decision as "APPROVED" | "REJECTED", requiredText(v.notes, "notes", 1000)))); });
financeRoutes.post("/super-admin/payouts/:payoutId/paid", async (c) => { superAdmin(c.get("actor").roles); const v = await body(c); return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => markPayoutPaid(db, c.req.param("payoutId"), requiredText(v.paymentReference, "paymentReference", 200), c.get("actor").userId))); });
