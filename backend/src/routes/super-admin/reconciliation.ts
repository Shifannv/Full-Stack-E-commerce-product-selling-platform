/**
 * Super Admin operator routes for the internal reconciliation framework.
 *
 * All endpoints require SUPER_ADMIN role.
 * Authentication, eligibility, mutation-origin protection, and rate limiting
 * are enforced by the existing middleware stack (requireAuth + mutationRateLimit).
 *
 * Allowed actions (no arbitrary status changes):
 *  - GET  /api/super-admin/reconciliation        — list unresolved items
 *  - GET  /api/super-admin/reconciliation/:id    — inspect one item
 *  - POST /api/super-admin/reconciliation/:id/resolve  — mark RESOLVED (audited)
 *  - POST /api/super-admin/reconciliation/:id/escalate — mark REVIEW   (audited)
 */

import { Hono } from "hono";
import { createDb } from "../../db";
import { type AuthorizedEnv, requireAuth } from "../../middleware/authorization";
import { mutationRateLimit } from "../../middleware/rate-limit";
import { DomainError } from "../../services/admin/admin.service";
import {
  listUnresolvedItems,
  getReconciliationItem,
  resolveReconciliationItem,
  escalateToReview,
} from "../../services/reconciliation.service";

export const reconciliationRoutes = new Hono<AuthorizedEnv>();

reconciliationRoutes.use("*", requireAuth);

reconciliationRoutes.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status as 400 | 401 | 403 | 404 | 409 | 422 | 503);
  console.error("Reconciliation API failed", { name: error instanceof Error ? error.name : "UnknownError" });
  return c.json({ error: "Reconciliation operation unavailable" }, 503);
});

function requireSuperAdmin(roles: string[]): void {
  if (!roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
}

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

function pageNumber(raw: string | undefined, name: string, min: number, max: number, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new DomainError(`Invalid ${name}`, 422);
  }
  return value;
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("Invalid JSON body", 422);
  }
  return value as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/super-admin/reconciliation
// List unresolved reconciliation items. Optional ?domain=PAYMENT|REFUND|FINANCE
// and cursor-based pagination via ?after_id=<uuid>&limit=<1-100>.
// ─────────────────────────────────────────────────────────────────────────────
reconciliationRoutes.get("/reconciliation", async (c) => {
  requireSuperAdmin(c.get("actor").roles);

  const domain = c.req.query("domain");
  const afterId = c.req.query("after_id");
  const limit = pageNumber(c.req.query("limit"), "limit", 1, 100, 50);

  const items = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    listUnresolvedItems(db, { domain, limit, afterId }),
  );

  return c.json({ items, count: items.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/super-admin/reconciliation/:id
// Inspect one reconciliation item by UUID.
// ─────────────────────────────────────────────────────────────────────────────
reconciliationRoutes.get("/reconciliation/:id", async (c) => {
  requireSuperAdmin(c.get("actor").roles);

  const id = c.req.param("id");
  const item = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    getReconciliationItem(db, id),
  );

  return c.json({ item });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/super-admin/reconciliation/:id/resolve
// Mark a reconciliation item RESOLVED. Body: { note: string }
// Resolution is validated under lock and audited atomically.
// Only PENDING, RETRYABLE, or REVIEW items may be resolved (RESOLVED is idempotent).
// ─────────────────────────────────────────────────────────────────────────────
reconciliationRoutes.post("/reconciliation/:id/resolve", mutationRateLimit, async (c) => {
  requireSuperAdmin(c.get("actor").roles);

  const id = c.req.param("id");
  const body = await jsonBody(c);

  const note = body.note;
  if (typeof note !== "string") throw new DomainError("note is required", 422);

  const resolved = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    resolveReconciliationItem(db, id, c.get("actor").userId, note),
  );

  return c.json({ item: resolved });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/super-admin/reconciliation/:id/escalate
// Mark a reconciliation item as requiring manual REVIEW. Body: { note: string }
// Escalation is validated under lock and audited atomically.
// PENDING or RETRYABLE items may be escalated. REVIEW is idempotent.
// RESOLVED items cannot be escalated.
// ─────────────────────────────────────────────────────────────────────────────
reconciliationRoutes.post("/reconciliation/:id/escalate", mutationRateLimit, async (c) => {
  requireSuperAdmin(c.get("actor").roles);

  const id = c.req.param("id");
  const body = await jsonBody(c);

  const note = body.note;
  if (typeof note !== "string") throw new DomainError("note is required", 422);

  const escalated = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    escalateToReview(db, id, c.get("actor").userId, note),
  );

  return c.json({ item: escalated });
});
