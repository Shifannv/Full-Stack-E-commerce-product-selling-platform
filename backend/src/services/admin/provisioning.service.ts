import { and, eq, isNull, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { createDb } from "../../db";
import { accounts, sessions, users } from "../../db/schema/auth";
import { admins, roles, userRoles } from "../../db/schema/rbac";
import { adminCredentials } from "../../db/schema/admin-credentials";
import { adminAuditEvents } from "../../db/schema/admin";
import { DomainError, requiredText } from "./admin.service";
import { lockAdminIdentity } from "./admin-lock";

type Db = ReturnType<typeof createDb>["db"];

function passwordValue(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128 || !value.trim())
    throw new DomainError("Password must be 12 to 128 characters", 422);
  return value; // Password whitespace is meaningful; never trim it.
}

export async function provisionAdmin(db: Db, reviewerId: string, input: Record<string, unknown>) {
  const email = requiredText(input.email, "email", 320).toLowerCase();
  const name = requiredText(input.name, "name", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("Invalid email", 422);
  const password = passwordValue(input.temporaryPassword);
  return db.transaction(async (tx) => {
    const [reviewer] = await tx.select({ id: users.id }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.id, reviewerId), eq(roles.name, "SUPER_ADMIN"), eq(users.status, "ACTIVE"), isNull(users.deletedAt)))
      .limit(1).for("share", { of: users });
    if (!reviewer) throw new DomainError("Forbidden", 403);
    // Case-insensitive check also protects pre-existing mixed-case identities.
    const [existing] = await tx.select({ id: users.id }).from(users)
      .where(sql`lower(${users.email}) = ${email}`).limit(1);
    if (existing) throw new DomainError("Email already belongs to an account", 409);
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, "ADMIN")).limit(1);
    if (!role) throw new DomainError("RBAC role unavailable", 409);
    const userId = crypto.randomUUID();
    const inserted = await tx.insert(users).values({ id: userId, email, name, status: "ACTIVE", emailVerified: false })
      .onConflictDoNothing().returning({ id: users.id });
    if (!inserted.length) throw new DomainError("Email already belongs to an account", 409);
    await tx.insert(userRoles).values({ userId, roleId: role.id });
    const [admin] = await tx.insert(admins).values({ userId, status: "DRAFT" }).returning({ id: admins.id });
    await tx.insert(accounts).values({ id: crypto.randomUUID(), accountId: userId, userId, providerId: "credential", password: await hashPassword(password) });
    await tx.insert(adminCredentials).values({ adminId: admin.id, provisionedByUserId: reviewerId });
    await tx.insert(adminAuditEvents).values({ entityId: admin.id, adminId: admin.id, actorUserId: reviewerId, action: "ADMIN_PROVISIONED", changedFields: ["userId", "status", "mustChangePassword"] });
    return { adminId: admin.id, userId, email, status: "DRAFT", mustChangePassword: true };
  });
}

export async function changeInitialAdminPassword(db: Db, userId: string, input: Record<string, unknown>) {
  const currentPassword = passwordValue(input.currentPassword);
  const newPassword = passwordValue(input.newPassword);
  if (currentPassword === newPassword) throw new DomainError("Choose a different permanent password", 422);
  return db.transaction(async (tx) => {
    const [profile] = await tx.select({ id: admins.id }).from(admins).where(eq(admins.userId, userId)).limit(1);
    if (!profile) throw new DomainError("Forbidden", 403);
    const identity = await lockAdminIdentity(tx, profile.id);
    const grants = await tx.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId));
    if (!grants.some((r) => r.name === "ADMIN") || grants.some((r) => r.name === "SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
    if (identity.user.status !== "ACTIVE" || identity.user.deletedAt || identity.admin.deletedAt || identity.admin.status !== "DRAFT")
      throw new DomainError("Admin account unavailable", 403);
    const [state] = await tx.select().from(adminCredentials).where(eq(adminCredentials.adminId, profile.id)).for("update");
    if (!state?.mustChangePassword) throw new DomainError("Initial password already changed or not required", 409);
    const [credential] = await tx.select({ id: accounts.id, password: accounts.password }).from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"))).limit(1).for("update");
    if (!credential?.password || !(await verifyPassword({ hash: credential.password, password: currentPassword })))
      throw new DomainError("Current password is incorrect", 403);
    const now = new Date();
    await tx.update(accounts).set({ password: await hashPassword(newPassword), updatedAt: now }).where(eq(accounts.id, credential.id));
    await tx.update(adminCredentials).set({ mustChangePassword: false, passwordChangedAt: now }).where(eq(adminCredentials.adminId, profile.id));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.insert(adminAuditEvents).values({ entityId: profile.id, adminId: profile.id, actorUserId: userId, action: "ADMIN_INITIAL_PASSWORD_CHANGED", changedFields: ["mustChangePassword", "passwordChangedAt"] });
    return { mustChangePassword: false, signInRequired: true };
  });
}
