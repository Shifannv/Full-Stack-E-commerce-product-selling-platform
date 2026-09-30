import { eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminAuditEvents, adminKycSubmissions } from "../../db/schema/admin";
import { admins } from "../../db/schema/rbac";
import { DomainError } from "./admin.service";
import { lockAdmin } from "./admin-lock";

type Db = ReturnType<typeof createDb>["db"];

// Internal transition primitive for an already authorized Super Admin caller.
// No deletion approval route exists yet; deleted accounts remain terminal here.
export async function transitionAdminStatus(db: Db, adminId: string, actorUserId: string, action: "SUSPEND" | "RECOVER", reason: string) {
  return db.transaction(async (tx) => {
    const admin = await lockAdmin(tx, adminId);
    const expected = action === "SUSPEND" ? "ACTIVE" : "SUSPENDED";
    if (admin.status !== expected) throw new DomainError("Admin status changed", 409);
    if (action === "RECOVER") {
      const [kyc] = await tx.select({ status: adminKycSubmissions.status }).from(adminKycSubmissions)
        .where(eq(adminKycSubmissions.adminId, adminId)).limit(1);
      if (!kyc || !["APPROVED", "ACTIVE"].includes(kyc.status)) throw new DomainError("Approved application required for recovery", 409);
    }
    const status = action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
    const [result] = await tx.update(admins).set({ status, updatedAt: new Date() }).where(eq(admins.id, adminId)).returning();
    await tx.insert(adminAuditEvents).values({ entityId: adminId, adminId, actorUserId, action: action === "SUSPEND" ? "ADMIN_SUSPENDED" : "ADMIN_RECOVERED", changedFields: ["status"], reason });
    return result;
  });
}
