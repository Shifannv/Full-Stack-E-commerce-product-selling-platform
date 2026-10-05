import { Hono } from "hono";
import { createDb } from "../../db";
import {
  type AuthorizedEnv,
  requireAuth,
} from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { listAdmins } from "../../services/admin/admins-list.service";
import { getSuperAdminSummary } from "../../services/admin/summary.service";
import { listSuperAdminProducts } from "../../services/admin/catalog.service";
import {
  listSuperAdminPayouts,
  VALID_PAYOUT_STATUSES,
} from "../../services/admin/finance.service";


export const superAdminDashboardRoutes = new Hono<AuthorizedEnv>();
superAdminDashboardRoutes.use("*", requireAuth);
superAdminDashboardRoutes.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json({ error: error.message }, error.status);
  console.error("Super Admin dashboard API failed", {
    name: error.name,
    code: (error as { code?: string }).code,
  });
  return c.json({ error: "Dashboard unavailable" }, 503);
});

async function withDb<T>(
  connectionString: string,
  action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
): Promise<T> {
  const { db, client } = createDb(connectionString);
  try {
    return await action(db);
  } finally {
    await client.end({ timeout: 1 });
  }
}

function requireSuperAdmin(roles: string[]): void {
  if (!roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
}

function pageNumber(
  raw: string | undefined,
  name: string,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (name === "limit" ? 1 : 0))
    throw new DomainError(`Invalid ${name}`, 422);
  return value;
}

export function isAdminStatusFilter(status: string): boolean {
  return [
    "DRAFT",
    "PENDING",
    "PENDING_SUPER_ADMIN_APPROVAL",
    "CHANGES_REQUIRED",
    "ACTIVE",
    "SUSPENDED",
    "REJECTED",
  ].includes(status);
}

superAdminDashboardRoutes.get("/summary", async (c) => {
  requireSuperAdmin(c.get("actor").roles);
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, getSuperAdminSummary),
  );
});

superAdminDashboardRoutes.get("/admins", async (c) => {
  requireSuperAdmin(c.get("actor").roles);
  const status = c.req.query("status");
  if (status && !isAdminStatusFilter(status))
    throw new DomainError("Invalid status", 422);
  const rawQuery = c.req.query("q");
  if (rawQuery && rawQuery.length > 100)
    throw new DomainError("Search is too long", 422);
  const limit = Math.min(50, pageNumber(c.req.query("limit"), "limit", 20));
  const offset = pageNumber(c.req.query("offset"), "offset", 0);
  return c.json({
    admins: await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      listAdmins(db, {
        status,
        q: rawQuery?.trim() || undefined,
        limit,
        offset,
      }),
    ),
    limit,
    offset,
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/products
// Super Admin private catalog discovery — returns all products including DRAFTs
// and ARCHIVED across every seller. Public endpoints must never expose these.
//
// Query params:
//   status   — "DRAFT" | "PUBLISHED" | "ARCHIVED"  (optional)
//   adminId  — filter by owning admin UUID           (optional)
//   categoryId — filter by category UUID             (optional)
//   q        — name search (max 100 chars)            (optional)
//   limit    — 1..50, default 20
//   offset   — >= 0, default 0
//
// Authorization: SUPER_ADMIN only
// ---------------------------------------------------------------------------
const VALID_PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

superAdminDashboardRoutes.get("/products", async (c) => {
  requireSuperAdmin(c.get("actor").roles);

  const status = c.req.query("status");
  if (status && !(VALID_PRODUCT_STATUSES as readonly string[]).includes(status))
    throw new DomainError("Invalid status", 422);

  const adminId = c.req.query("adminId");
  if (adminId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId))
    throw new DomainError("Invalid adminId", 422);

  const categoryId = c.req.query("categoryId");
  if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId))
    throw new DomainError("Invalid categoryId", 422);

  const rawQ = c.req.query("q");
  if (rawQ && rawQ.length > 100)
    throw new DomainError("Search is too long", 422);

  const limit = Math.min(50, pageNumber(c.req.query("limit"), "limit", 20));
  const offset = pageNumber(c.req.query("offset"), "offset", 0);

  const products = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    listSuperAdminProducts(db, {
      status,
      adminId,
      categoryId,
      q: rawQ?.trim() || undefined,
      limit,
      offset,
    }),
  );

  return c.json({ products, limit, offset });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/payouts
// Super Admin payout queue — returns payout requests across all sellers.
// Finance amounts are read from stored rows; no recalculation is performed.
//
// Query params:
//   status  — "REQUESTED" | "APPROVED" | "REJECTED" | "PAID"  (optional)
//   adminId — filter by seller admin UUID                       (optional)
//   limit   — 1..50, default 20
//   offset  — >= 0, default 0
//
// Authorization: SUPER_ADMIN only
// ---------------------------------------------------------------------------
superAdminDashboardRoutes.get("/payouts", async (c) => {
  requireSuperAdmin(c.get("actor").roles);

  const status = c.req.query("status");
  if (status && !(VALID_PAYOUT_STATUSES as readonly string[]).includes(status))
    throw new DomainError("Invalid status", 422);

  const adminId = c.req.query("adminId");
  if (adminId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId))
    throw new DomainError("Invalid adminId", 422);

  const limit = Math.min(50, pageNumber(c.req.query("limit"), "limit", 20));
  const offset = pageNumber(c.req.query("offset"), "offset", 0);

  const payouts = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    listSuperAdminPayouts(db, { status, adminId, limit, offset }),
  );

  return c.json({ payouts, limit, offset });
});
