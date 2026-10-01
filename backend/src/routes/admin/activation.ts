import { DomainError, requiredText } from "../../services/admin/admin.service";
import {
  activateAdminAccount,
  peekInvitation,
} from "../../services/admin/invitation.service";
import { mutationRateLimit } from "../../middleware/rate-limit";
import { Hono } from "hono";
import type { AdminEnv } from "./shared";
import { withDbPublic, bodyPublic } from "./shared";

export const adminActivationRoutes = new Hono<AdminEnv>();

// ---------------------------------------------------------------------------
// Unauthenticated activation routes — Admin has no session before password setup.
// These are mounted before the authenticated admin router (see admin/index.ts).
// ---------------------------------------------------------------------------
adminActivationRoutes.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json({ error: error.message }, error.status);
  return c.json({ error: "Activation unavailable" }, 503);
});
adminActivationRoutes.use("/activate", mutationRateLimit);
adminActivationRoutes.get("/activate", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!token) return c.json({ error: "token is required" }, 422);
  return withDbPublic(
    c.env.HYPERDRIVE.connectionString,
    async (db) => {
      const info = await peekInvitation(db, token);
      return c.json({ email: info.email, expiresAt: info.expiresAt });
    },
    c,
  );
});

adminActivationRoutes.post("/activate", async (c) => {
  const v = await bodyPublic(c);
  const rawToken = requiredText(v.token, "token", 200);
  const password = requiredText(v.password, "password", 256);
  return withDbPublic(
    c.env.HYPERDRIVE.connectionString,
    async (db) => {
      const result = await activateAdminAccount(db, { rawToken, password });
      return c.json({
        userId: result.userId,
        email: result.email,
        adminId: result.adminId,
      });
    },
    c,
  );
});
