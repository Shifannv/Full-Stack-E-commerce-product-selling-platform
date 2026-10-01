import { Hono } from "hono";
import { createDb } from "../../db";
import { type AuthorizedEnv, requireAuth } from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { listAdmins } from "../../services/admin/admins-list.service";
import { getSuperAdminSummary } from "../../services/admin/summary.service";

export const superAdminDashboardRoutes = new Hono<AuthorizedEnv>();
superAdminDashboardRoutes.use("*", requireAuth);
superAdminDashboardRoutes.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  console.error("Super Admin dashboard API failed", { name: error.name, code: (error as { code?: string }).code });
  return c.json({ error: "Dashboard unavailable" }, 503);
});

async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const { db, client } = createDb(connectionString);
  try { return await action(db); } finally { await client.end({ timeout: 1 }); }
}

function requireSuperAdmin(roles: string[]): void {
  if (!roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
}

function pageNumber(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (name === "limit" ? 1 : 0)) throw new DomainError(`Invalid ${name}`, 422);
  return value;
}

superAdminDashboardRoutes.get("/summary", async (c) => {
  requireSuperAdmin(c.get("actor").roles);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, getSuperAdminSummary));
});

superAdminDashboardRoutes.get("/admins", async (c) => {
  requireSuperAdmin(c.get("actor").roles);
  const status = c.req.query("status");
  if (status && !["DRAFT", "PENDING", "CHANGES_REQUIRED", "ACTIVE", "SUSPENDED", "REJECTED"].includes(status)) throw new DomainError("Invalid status", 422);
  const rawQuery = c.req.query("q");
  if (rawQuery && rawQuery.length > 100) throw new DomainError("Search is too long", 422);
  const limit = Math.min(50, pageNumber(c.req.query("limit"), "limit", 20));
  const offset = pageNumber(c.req.query("offset"), "offset", 0);
  return c.json({ admins: await withDb(c.env.HYPERDRIVE.connectionString, (db) => listAdmins(db, { status, q: rawQuery?.trim() || undefined, limit, offset })), limit, offset });
});
