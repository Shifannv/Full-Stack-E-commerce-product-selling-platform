import { Hono } from "hono";
import { createDb } from "../../db";
import { requireArchiveRecoveryAuth, requireAuth, type AuthorizedEnv } from "../../middleware/authorization";
import { DomainError, requiredText } from "../../services/admin/admin.service";
import { getAdminLifecycle, requestAdminDeletion, requestAdminRecovery, reviewAdminDeletion, reviewAdminRecovery, verifyAdminDeletion, type RecoveryApproval } from "../../services/admin/account-lifecycle.service";

export const adminLifecycleRoutes = new Hono<AuthorizedEnv>();
adminLifecycleRoutes.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  return c.json({ error: "ADMIN_LIFECYCLE_UNAVAILABLE" }, 503);
});

async function withDb<T>(url: string, fn: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) {
  const { db, client } = createDb(url);
  try { return await fn(db); } finally { await client.end({ timeout: 1 }); }
}
async function body(req: { json: () => Promise<unknown> }) {
  const value = await req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("INVALID_LIFECYCLE_BODY", 422);
  return value as Record<string, unknown>;
}
function id(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new DomainError("INVALID_LIFECYCLE_ID", 422);
  return value;
}
function decision(value: unknown) {
  if (value !== "APPROVED" && value !== "REJECTED") throw new DomainError("INVALID_LIFECYCLE_DECISION", 422);
  return value;
}

adminLifecycleRoutes.get("/account/lifecycle", requireArchiveRecoveryAuth, async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString,
  (db) => getAdminLifecycle(db, c.get("actor").userId))));
adminLifecycleRoutes.post("/account/deletion-requests", requireAuth, async (c) => {
  const v = await body(c.req);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => requestAdminDeletion(db, c.get("actor").userId, requiredText(v.reason, "reason", 1000))));
});
adminLifecycleRoutes.post("/account/deletion-requests/:requestId/verify", requireAuth, async (c) => {
  const v = await body(c.req);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => verifyAdminDeletion(db, c.get("actor").userId, id(c.req.param("requestId")), v.password)));
});
adminLifecycleRoutes.post("/account/recovery-requests", requireArchiveRecoveryAuth, async (c) => {
  const v = await body(c.req);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => requestAdminRecovery(db, c.get("actor").userId, requiredText(v.reason, "reason", 1000), v.password)));
});
adminLifecycleRoutes.get("/review/:adminId/lifecycle", requireAuth, async (c) => c.json(await withDb(c.env.HYPERDRIVE.connectionString,
  (db) => getAdminLifecycle(db, c.get("actor").userId, id(c.req.param("adminId"))))));
adminLifecycleRoutes.post("/review/:adminId/deletion-requests/:requestId/decision", requireAuth, async (c) => {
  const v = await body(c.req);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => reviewAdminDeletion(db, id(c.req.param("adminId")), id(c.req.param("requestId")), c.get("actor").userId, decision(v.decision), requiredText(v.reason, "reason", 1000))));
});
adminLifecycleRoutes.post("/review/:adminId/recovery-requests/:requestId/decision", requireAuth, async (c) => {
  const v = await body(c.req);
  let approval: RecoveryApproval | undefined;
  if (v.decision === "APPROVED") {
    if (!Array.isArray(v.categoryIds) || v.categoryIds.length > 100 || v.categoryIds.some((value) => typeof value !== "string")) throw new DomainError("INVALID_RECOVERY_CATEGORIES", 422);
    approval = { kycSubmissionId: id(requiredText(v.kycSubmissionId, "kycSubmissionId", 40)), kycRevision: requiredText(v.kycRevision, "kycRevision", 40), categoryIds: (v.categoryIds as string[]).map(id) };
  }
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => reviewAdminRecovery(db, id(c.req.param("adminId")), id(c.req.param("requestId")), c.get("actor").userId, decision(v.decision), requiredText(v.reason, "reason", 1000), approval)));
});
