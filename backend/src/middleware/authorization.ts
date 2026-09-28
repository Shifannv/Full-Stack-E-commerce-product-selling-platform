import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { users } from "../db/schema/auth";
import { admins, permissions, rolePermissions, roles, userRoles } from "../db/schema/rbac";
import { createAuth, type AuthBindings } from "../lib/auth/auth";

export type Actor = {
  userId: string;
  roles: string[];
  permissions: string[];
  adminApproved: boolean;
};

export type AuthorizedEnv = {
  Bindings: AuthBindings;
  Variables: { actor: Actor };
};

export function hasPermission(actor: Actor, key: string): boolean {
  if (actor.roles.includes("SUPER_ADMIN")) return true;
  if (actor.roles.includes("ADMIN") && !actor.adminApproved) return false;
  return actor.permissions.includes(key);
}

export const requireAuth = createMiddleware<AuthorizedEnv>(async (c, next) => {
  let client: ReturnType<typeof createAuth>["client"] | undefined;
  try {
    const connection = createAuth(c.env);
    client = connection.client;
    const session = await connection.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const [user] = await connection.db.select({ status: users.status }).from(users)
      .where(eq(users.id, session.user.id)).limit(1);
    if (user?.status !== "ACTIVE") return c.json({ error: "Account unavailable" }, 403);

    const grants = await connection.db.select({ role: roles.name, permission: permissions.key })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, session.user.id));
    const roleNames = [...new Set(grants.map((grant) => grant.role))];
    const permissionKeys = [...new Set(grants.flatMap((grant) => grant.permission ? [grant.permission] : []))];

    let adminApproved = false;
    if (roleNames.includes("ADMIN")) {
      const [admin] = await connection.db.select({ status: admins.status }).from(admins)
        .where(eq(admins.userId, session.user.id)).limit(1);
      adminApproved = admin?.status === "ACTIVE";
    }

    c.set("actor", {
      userId: session.user.id,
      roles: roleNames,
      permissions: permissionKeys,
      adminApproved,
    });
  } catch (error) {
    console.error("Authorization failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: (error as { code?: string } | null)?.code,
    });
    return c.json({ error: "Authorization unavailable" }, 503);
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }

  await next();
});

export const requirePermission = (key: string) => createMiddleware<AuthorizedEnv>(async (c, next) => {
  const actor = c.get("actor");
  if (!actor) return c.json({ error: "Unauthorized" }, 401);
  if (!hasPermission(actor, key)) return c.json({ error: "Forbidden" }, 403);
  await next();
});
