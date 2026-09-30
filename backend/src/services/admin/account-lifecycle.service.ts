import { and, asc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import type { createDb } from "../../db";
import { accounts, sessions, users, verifications } from "../../db/schema/auth";
import { admins, roles, userRoles } from "../../db/schema/rbac";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../../db/schema/admin";
import { adminArchives, adminDeletionRequests, adminRecoveryRequests } from "../../db/schema/admin-lifecycle";
import { categories, products } from "../../db/schema/catalog";
import { DomainError, requiredText } from "./admin.service";
import { lockAdminIdentity, type AdminTx } from "./admin-lock";

type Db = ReturnType<typeof createDb>["db"];
type Identity = Awaited<ReturnType<typeof lockAdminIdentity>>;
type Decision = "APPROVED" | "REJECTED";

async function requireRole(tx: AdminTx, userId: string, role: string) {
  const [grant] = await tx.select({ userId: userRoles.userId }).from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId)).innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.userId, userId), eq(roles.name, role), role === "SUPER_ADMIN" ? and(eq(users.status, "ACTIVE"), isNull(users.deletedAt)) : undefined))
    .limit(1).for("share", { of: userRoles });
  if (!grant) throw new DomainError("ADMIN_LIFECYCLE_FORBIDDEN", 403);
}

function active(identity: Identity) {
  if (identity.admin.status !== "ACTIVE" || identity.admin.deletedAt || identity.user.status !== "ACTIVE" || identity.user.deletedAt) throw new DomainError("ADMIN_ACCOUNT_INELIGIBLE", 409);
}

async function ownIdentity(tx: AdminTx, userId: string) {
  const [row] = await tx.select({ id: admins.id }).from(admins).where(eq(admins.userId, userId)).limit(1);
  if (!row) throw new DomainError("ADMIN_LIFECYCLE_FORBIDDEN", 403);
  const identity = await lockAdminIdentity(tx, row.id);
  await requireRole(tx, userId, "ADMIN");
  return identity;
}

async function audit(tx: AdminTx, adminId: string, actorUserId: string, action: string, entityId: string, reason?: string) {
  await tx.insert(adminAuditEvents).values({ adminId, actorUserId, action, changedFields: [entityId, "status"], reason });
}

async function verifyCredential(tx: AdminTx, userId: string, password: unknown) {
  if (typeof password !== "string" || password.length < 1 || password.length > 256) throw new DomainError("ACCOUNT_VERIFICATION_REQUIRED", 422);
  const [credential] = await tx.select({ password: accounts.password }).from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"))).limit(1).for("share");
  if (!credential?.password || !await verifyPassword({ hash: credential.password, password })) throw new DomainError("ACCOUNT_VERIFICATION_FAILED", 403);
}

export async function requestAdminDeletion(db: Db, userId: string, reason: string) {
  reason = requiredText(reason, "reason", 1000);
  return db.transaction(async (tx) => {
    const identity = await ownIdentity(tx, userId);
    active(identity);
    const adminId = identity.admin.id;
    const [existing] = await tx.select().from(adminDeletionRequests)
      .where(and(eq(adminDeletionRequests.adminId, adminId), inArray(adminDeletionRequests.status, ["REQUESTED", "PENDING"]))).limit(1);
    if (existing) return existing;
    const [request] = await tx.insert(adminDeletionRequests).values({ adminId, reason }).returning();
    await audit(tx, adminId, userId, "ADMIN_DELETION_REQUESTED", request.id, reason);
    return request;
  });
}

export async function verifyAdminDeletion(db: Db, userId: string, requestId: string, password: unknown) {
  return db.transaction(async (tx) => {
    const identity = await ownIdentity(tx, userId);
    active(identity);
    const [request] = await tx.select().from(adminDeletionRequests)
      .where(and(eq(adminDeletionRequests.id, requestId), eq(adminDeletionRequests.adminId, identity.admin.id))).limit(1).for("update");
    if (!request) throw new DomainError("DELETION_REQUEST_UNAVAILABLE", 404);
    if (!["REQUESTED", "PENDING"].includes(request.status)) throw new DomainError("DELETION_REQUEST_FINAL", 409);
    await verifyCredential(tx, userId, password);
    if (request.status === "PENDING") return request;
    const [result] = await tx.update(adminDeletionRequests).set({ status: "PENDING", verifiedAt: new Date() }).where(eq(adminDeletionRequests.id, request.id)).returning();
    await audit(tx, identity.admin.id, userId, "ADMIN_DELETION_VERIFIED", request.id);
    return result;
  });
}

export async function reviewAdminDeletion(db: Db, adminId: string, requestId: string, reviewerId: string, decision: Decision, reason: string) {
  reason = requiredText(reason, "reason", 1000);
  if (!["APPROVED", "REJECTED"].includes(decision)) throw new DomainError("INVALID_LIFECYCLE_DECISION", 422);
  return db.transaction(async (tx) => {
    const identity = await lockAdminIdentity(tx, adminId);
    await requireRole(tx, reviewerId, "SUPER_ADMIN");
    const [request] = await tx.select().from(adminDeletionRequests).where(and(eq(adminDeletionRequests.id, requestId), eq(adminDeletionRequests.adminId, adminId))).limit(1).for("update");
    if (!request) throw new DomainError("DELETION_REQUEST_UNAVAILABLE", 404);
    if (["APPROVED", "REJECTED"].includes(request.status)) {
      if (request.status === decision) return request;
      throw new DomainError("DELETION_DECISION_CONFLICT", 409);
    }
    if (request.status !== "PENDING" || !request.verifiedAt) throw new DomainError("ACCOUNT_VERIFICATION_REQUIRED", 409);
    if (!identity.admin.deletedAt && !identity.user.deletedAt && identity.user.status === "ACTIVE" && ["ACTIVE", "SUSPENDED"].includes(identity.admin.status)) {
      // A suspension never authorizes deletion itself; the verified request and
      // explicit Super Admin decision are still required.
    } else throw new DomainError("ADMIN_ACCOUNT_INELIGIBLE", 409);
    const now = new Date();
    if (decision === "APPROVED") {
      const scope = await tx.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId)).orderBy(asc(adminCategoryAssignments.id)).for("update");
      const activeIds = scope.filter((s) => s.status === "ACTIVE").map((s) => s.id);
      if (activeIds.length) await tx.update(adminCategoryAssignments).set({ status: "REVOKED", updatedAt: now }).where(inArray(adminCategoryAssignments.id, activeIds));
      await tx.insert(adminArchives).values({ adminId, deletionRequestId: request.id, createdAt: now,
        categoryManifest: scope.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, categoryId: s.categoryId, revision: now.toISOString() })) });
      // Only sale-owned products are hidden; management links never transfer ownership.
      const owned = await tx.select({ id: products.id }).from(products).where(eq(products.createdByAdminId, adminId)).orderBy(asc(products.id)).for("update");
      if (owned.length) await tx.update(products).set({ status: "ARCHIVED", featured: false, updatedAt: now }).where(inArray(products.id, owned.map((p) => p.id)));
      await tx.update(admins).set({ status: "SUSPENDED", deletedAt: now, updatedAt: now }).where(eq(admins.id, adminId));
      await tx.update(users).set({ status: "SUSPENDED", deletedAt: now, updatedAt: now }).where(eq(users.id, identity.admin.userId));
      await tx.delete(sessions).where(eq(sessions.userId, identity.admin.userId));
      await tx.delete(verifications).where(and(like(verifications.identifier, "invite:%"), sql`${verifications.value}::jsonb ->> 'adminId' = ${adminId}`));
      await audit(tx, adminId, reviewerId, "ADMIN_ARCHIVED", request.id);
    }
    const [result] = await tx.update(adminDeletionRequests).set({ status: decision, reviewedByUserId: reviewerId, reviewedAt: now, reviewNotes: reason, completedAt: decision === "APPROVED" ? now : null }).where(eq(adminDeletionRequests.id, request.id)).returning();
    await audit(tx, adminId, reviewerId, decision === "APPROVED" ? "ADMIN_DELETION_APPROVED" : "ADMIN_DELETION_REJECTED", request.id, reason);
    return result;
  });
}

async function currentArchive(tx: AdminTx, identity: Identity) {
  const [archive] = await tx.select().from(adminArchives).where(and(eq(adminArchives.adminId, identity.admin.id), isNull(adminArchives.restoredAt))).limit(1).for("update");
  if (!archive || identity.admin.status !== "SUSPENDED" || identity.user.status !== "SUSPENDED"
    || identity.admin.deletedAt?.getTime() !== archive.createdAt.getTime() || identity.user.deletedAt?.getTime() !== archive.createdAt.getTime()) throw new DomainError("ADMIN_ARCHIVE_INELIGIBLE", 409);
  return archive;
}

export async function requestAdminRecovery(db: Db, userId: string, reason: string, password: unknown) {
  reason = requiredText(reason, "reason", 1000);
  return db.transaction(async (tx) => {
    const identity = await ownIdentity(tx, userId);
    const archive = await currentArchive(tx, identity);
    await verifyCredential(tx, userId, password);
    const [existing] = await tx.select().from(adminRecoveryRequests).where(and(eq(adminRecoveryRequests.archiveId, archive.id), eq(adminRecoveryRequests.status, "PENDING"))).limit(1);
    if (existing) return existing;
    const [request] = await tx.insert(adminRecoveryRequests).values({ archiveId: archive.id, adminId: identity.admin.id, reason }).returning();
    await audit(tx, identity.admin.id, userId, "ADMIN_RECOVERY_REQUESTED", request.id, reason);
    return request;
  });
}

export type RecoveryApproval = { kycSubmissionId: string; kycRevision: string; categoryIds: string[] };

export async function getAdminLifecycle(db: Db, actorUserId: string, subjectAdminId?: string) {
  return db.transaction(async (tx) => {
    let adminId = subjectAdminId;
    if (adminId) await requireRole(tx, actorUserId, "SUPER_ADMIN");
    else adminId = (await ownIdentity(tx, actorUserId)).admin.id;
    return {
      deletionRequests: await tx.select().from(adminDeletionRequests).where(eq(adminDeletionRequests.adminId, adminId)),
      recoveryRequests: await tx.select().from(adminRecoveryRequests).where(eq(adminRecoveryRequests.adminId, adminId)),
      archives: await tx.select().from(adminArchives).where(eq(adminArchives.adminId, adminId)),
    };
  });
}

export async function reviewAdminRecovery(db: Db, adminId: string, requestId: string, reviewerId: string, decision: Decision, reason: string, approval?: RecoveryApproval) {
  reason = requiredText(reason, "reason", 1000);
  if (!["APPROVED", "REJECTED"].includes(decision)) throw new DomainError("INVALID_LIFECYCLE_DECISION", 422);
  return db.transaction(async (tx) => {
    const identity = await lockAdminIdentity(tx, adminId);
    await requireRole(tx, reviewerId, "SUPER_ADMIN");
    const [request] = await tx.select().from(adminRecoveryRequests).where(and(eq(adminRecoveryRequests.id, requestId), eq(adminRecoveryRequests.adminId, adminId))).limit(1).for("update");
    if (!request) throw new DomainError("RECOVERY_REQUEST_UNAVAILABLE", 404);
    if (request.status !== "PENDING") {
      if (request.status === decision) return request;
      throw new DomainError("RECOVERY_DECISION_CONFLICT", 409);
    }
    const archive = await currentArchive(tx, identity);
    if (archive.id !== request.archiveId) throw new DomainError("ADMIN_ARCHIVE_INELIGIBLE", 409);
    const now = new Date();
    if (decision === "APPROVED") {
      // Never recreate revoked RBAC grants, credentials, sessions or invitations.
      await requireRole(tx, identity.admin.userId, "ADMIN");
      const [credential] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, identity.admin.userId), eq(accounts.providerId, "credential"), sql`${accounts.password} is not null`)).limit(1).for("share");
      if (!credential) throw new DomainError("RECOVERY_CREDENTIAL_UNAVAILABLE", 409);
      const [kyc] = await tx.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId)).limit(1).for("update");
      if (!approval || !kyc || !["APPROVED", "ACTIVE"].includes(kyc.status) || approval.kycSubmissionId !== kyc.id || new Date(approval.kycRevision).getTime() !== kyc.updatedAt.getTime()) throw new DomainError("RECOVERY_KYC_REVALIDATION_REQUIRED", 409);
      const addresses = await tx.select({ type: adminAddresses.addressType }).from(adminAddresses).where(and(eq(adminAddresses.adminId, adminId), eq(adminAddresses.isActive, true)));
      const [evidence] = await tx.select({ id: adminKycDocuments.id }).from(adminKycDocuments).where(eq(adminKycDocuments.submissionId, kyc.id)).limit(1);
      if (!evidence || !addresses.some((a) => a.type === "SHIPPING_ORIGIN") || !addresses.some((a) => a.type === "RETURN")) throw new DomainError("RECOVERY_OPERATIONS_INCOMPLETE", 409);
      if (!Array.isArray(approval.categoryIds) || !approval.categoryIds.length || new Set(approval.categoryIds).size !== approval.categoryIds.length) throw new DomainError("RECOVERY_CATEGORY_REVALIDATION_REQUIRED", 409);
      const scope = await tx.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId)).orderBy(asc(adminCategoryAssignments.id)).for("update");
      for (const categoryId of [...approval.categoryIds].sort()) {
        const saved = archive.categoryManifest.find((s) => s.categoryId === categoryId);
        const current = scope.find((s) => s.categoryId === categoryId);
        if (!saved || !current || current.id !== saved.id || current.status !== "REVOKED" || current.updatedAt.toISOString() !== saved.revision) throw new DomainError("RECOVERY_CATEGORY_CHANGED", 409);
        const [category] = await tx.select({ status: categories.status }).from(categories).where(eq(categories.id, categoryId)).limit(1).for("share");
        if (category?.status !== "PUBLISHED") throw new DomainError("RECOVERY_CATEGORY_UNAVAILABLE", 409);
        await tx.update(adminCategoryAssignments).set({ status: "ACTIVE", assignedByUserId: reviewerId, updatedAt: now }).where(eq(adminCategoryAssignments.id, current.id));
      }
      // Refresh the reviewed KYC timestamp without reviving any rejected status.
      await tx.update(adminKycSubmissions).set({ reviewedByUserId: reviewerId, reviewedAt: now, updatedAt: now }).where(eq(adminKycSubmissions.id, kyc.id));
      await tx.update(admins).set({ status: "ACTIVE", deletedAt: null, updatedAt: now }).where(eq(admins.id, adminId));
      await tx.update(users).set({ status: "ACTIVE", deletedAt: null, updatedAt: now }).where(eq(users.id, identity.admin.userId));
      await tx.delete(sessions).where(eq(sessions.userId, identity.admin.userId));
      await tx.update(adminArchives).set({ restoredAt: now, restoredByUserId: reviewerId }).where(eq(adminArchives.id, archive.id));
      await audit(tx, adminId, reviewerId, "ADMIN_REACTIVATED", request.id);
    }
    const [result] = await tx.update(adminRecoveryRequests).set({ status: decision, reviewedAt: now, reviewedByUserId: reviewerId, reviewNotes: reason }).where(eq(adminRecoveryRequests.id, request.id)).returning();
    await audit(tx, adminId, reviewerId, decision === "APPROVED" ? "ADMIN_RECOVERY_APPROVED" : "ADMIN_RECOVERY_REJECTED", request.id, reason);
    return result;
  });
}
