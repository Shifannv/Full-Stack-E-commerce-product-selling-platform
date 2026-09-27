import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { accounts, users } from "../../db/schema/auth";
import { adminAuditEvents } from "../../db/schema/admin";
import { admins, roles, userRoles } from "../../db/schema/rbac";
import { DomainError, requiredText } from "./admin.service";

type Db = ReturnType<typeof createDb>["db"];

export async function provisionCredentialUser(db: Db, input: { email: string; name: string; password: string }, roleName: "ADMIN" | "SUPER_ADMIN", actorUserId?: string) {
  const email = requiredText(input.email, "email", 320).toLowerCase();
  const name = requiredText(input.name, "name", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("Invalid email", 422);
  if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 256) throw new DomainError("Password must be 12 to 256 characters", 422);
  const hashed = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, roleName)).limit(1).for("update");
    if (!role) throw new DomainError("RBAC role unavailable", 409);
    if (roleName === "SUPER_ADMIN") {
      const [existing] = await tx.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, role.id)).limit(1);
      if (existing) throw new DomainError("Super Admin already exists", 409);
    }
    const [found] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (found) throw new DomainError("Email already belongs to an account", 409);
    const userId = crypto.randomUUID();
    await tx.insert(users).values({ id: userId, name, email, emailVerified: false, status: "ACTIVE" });
    await tx.insert(accounts).values({ id: crypto.randomUUID(), userId, accountId: userId, providerId: "credential", password: hashed });
    await tx.insert(userRoles).values({ userId, roleId: role.id });
    if (roleName === "ADMIN") {
      const [admin] = await tx.insert(admins).values({ userId, status: "DRAFT" }).returning({ id: admins.id });
      if (actorUserId) await tx.insert(adminAuditEvents).values({ adminId: admin.id, actorUserId, action: "ADMIN_PROVISIONED", changedFields: ["userId", "status"] });
      return { userId, email, adminId: admin.id };
    }
    return { userId, email };
  });
}
