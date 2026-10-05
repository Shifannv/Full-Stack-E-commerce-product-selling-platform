import { createAuth } from "../../lib/auth/auth";
import { requireAuth } from "../../middleware/authorization";
import type { App } from "../../app-env";
import { and, eq, notExists } from "drizzle-orm";
import { adminCredentials } from "../../db/schema/admin-credentials";
import { admins, roles, userRoles } from "../../db/schema/rbac";

/** Better Auth handler (/api/auth/*). */
export function registerAuthHandler(app: App) {
  app.all("/api/auth/*", async (c) => {
    let client: ReturnType<typeof createAuth>["client"] | undefined;
    try {
      const connection = createAuth(c.env);
      client = connection.client;
      // Credential onboarding is an application rule; do not alter Better Auth
      // configuration or the established Super Admin's session architecture.
      if (c.req.method === "POST" && !["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(c.req.path)) {
        const session = await connection.auth.api.getSession({ headers: c.req.raw.headers });
        if (session) {
          const superAdminGrant = connection.db.select({ id: roles.id }).from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(and(eq(userRoles.userId, session.user.id), eq(roles.name, "SUPER_ADMIN")));
          const [pending] = await connection.db.select({ id: adminCredentials.adminId }).from(adminCredentials)
            .innerJoin(admins, eq(admins.id, adminCredentials.adminId))
            .where(and(eq(admins.userId, session.user.id), eq(adminCredentials.mustChangePassword, true), notExists(superAdminGrant))).limit(1);
          if (pending) return c.json({ error: "ADMIN_PASSWORD_CHANGE_REQUIRED" }, 403);
        }
      }
      return await connection.auth.handler(c.req.raw);
    } catch (error) {
      console.error("Authentication request failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: (error as { code?: string } | null)?.code,
      });
      return c.json({ error: "Authentication unavailable" }, 503);
    } finally {
      await client?.end({ timeout: 1 }).catch(() => undefined);
    }
  });
}

/** Current actor (/api/me). */
export function registerSessionRoute(app: App) {
  app.get("/api/me", requireAuth, (c) => c.json(c.get("actor")));
}
