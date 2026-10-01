import { eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { users } from "../../db/schema/auth";
import { admins } from "../../db/schema/rbac";
import { DomainError } from "./admin.service";

type Db = ReturnType<typeof createDb>["db"];
export type AdminTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Lock order for onboarding/catalog Admin writes: admins -> users -> category assignment ->
// product management/product -> inventory. Status transitions take the same
// first two locks, so a revoked account cannot commit a later protected write.
export async function lockAdminIdentity(tx: AdminTx, adminId: string) {
  const [admin] = await tx
    .select()
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1)
    .for("update");
  if (!admin) throw new DomainError("Admin unavailable", 404);
  const [user] = await tx
    .select({ status: users.status, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, admin.userId))
    .limit(1)
    .for("update");
  if (!user) throw new DomainError("Admin account unavailable", 403);
  return { admin, user };
}

export async function lockAdmin(tx: AdminTx, adminId: string) {
  const { admin, user } = await lockAdminIdentity(tx, adminId);
  if (!user || user.status !== "ACTIVE" || user.deletedAt || admin.deletedAt) {
    throw new DomainError("Admin account unavailable", 403);
  }
  return admin;
}

export function requireActiveAdmin(
  admin: Awaited<ReturnType<typeof lockAdmin>>,
) {
  if (admin.status !== "ACTIVE")
    throw new DomainError("Admin approval required", 403);
}
