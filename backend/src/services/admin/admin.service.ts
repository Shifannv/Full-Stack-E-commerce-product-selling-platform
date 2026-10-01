import { and, eq, isNull } from "drizzle-orm";
import type { createDb } from "../../db";
import {
  adminAddresses,
  adminAuditEvents,
  adminCategoryAssignments,
  adminKycDocuments,
  adminKycSubmissions,
} from "../../db/schema/admin";
import { categories } from "../../db/schema/catalog";
import { admins } from "../../db/schema/rbac";
import { users } from "../../db/schema/auth";
import { lockAdmin } from "./admin-lock";

type Db = ReturnType<typeof createDb>["db"];
export type AddressInput = {
  addressType: "SHIPPING_ORIGIN" | "RETURN";
  businessName?: string | null;
  contactName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export class DomainError extends Error {
  constructor(
    message: string,
    public status:
      400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 502 | 503 = 400,
  ) {
    super(message);
  }
}

export function requiredText(value: unknown, name: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new DomainError(
      `${name} is required and must be at most ${max} characters`,
      422,
    );
  return value.trim();
}

export function parseAddress(value: unknown): AddressInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("Invalid address", 422);
  const v = value as Record<string, unknown>;
  if (v.addressType !== "SHIPPING_ORIGIN" && v.addressType !== "RETURN")
    throw new DomainError("Invalid address type", 422);
  return {
    addressType: v.addressType,
    businessName:
      typeof v.businessName === "string"
        ? v.businessName.trim().slice(0, 200)
        : null,
    contactName: requiredText(v.contactName, "contactName"),
    phone: requiredText(v.phone, "phone", 30),
    line1: requiredText(v.line1, "line1", 300),
    line2: typeof v.line2 === "string" ? v.line2.trim().slice(0, 300) : null,
    city: requiredText(v.city, "city", 100),
    state: requiredText(v.state, "state", 100),
    postalCode: requiredText(v.postalCode, "postalCode", 20),
    country: requiredText(v.country, "country", 60),
  };
}

export async function getAdminId(db: Db, userId: string): Promise<string> {
  const [admin] = await db
    .select({ id: admins.id })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId))
    .where(
      and(
        eq(admins.userId, userId),
        isNull(admins.deletedAt),
        isNull(users.deletedAt),
        eq(users.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!admin) throw new DomainError("Admin profile unavailable", 403);
  return admin.id;
}

export async function saveAddress(
  db: Db,
  adminId: string,
  actorUserId: string,
  input: AddressInput,
  superAdmin = false,
) {
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (
      !superAdmin &&
      !["PENDING", "DRAFT", "CHANGES_REQUIRED"].includes(owner.status)
    )
      throw new DomainError("Address changes require review", 409);
    const [existing] = await tx
      .select({ id: adminAddresses.id })
      .from(adminAddresses)
      .where(
        and(
          eq(adminAddresses.adminId, adminId),
          eq(adminAddresses.addressType, input.addressType),
          eq(adminAddresses.isActive, true),
        ),
      )
      .limit(1);
    const data = { ...input, adminId, updatedAt: new Date() };
    const [address] = existing
      ? await tx
          .update(adminAddresses)
          .set(data)
          .where(eq(adminAddresses.id, existing.id))
          .returning()
      : await tx.insert(adminAddresses).values(data).returning();
    await tx.insert(adminAuditEvents).values({
      entityId: adminId,
      adminId,
      actorUserId,
      action: "ADDRESS_SAVED",
      changedFields: Object.keys(input),
    });
    return address;
  });
}

export async function saveKyc(
  db: Db,
  adminId: string,
  actorUserId: string,
  input: { legalName: string; businessType: string; contactPhone: string },
) {
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (!["PENDING", "DRAFT", "CHANGES_REQUIRED"].includes(owner.status))
      throw new DomainError("Application cannot be edited in this state", 409);
    const [current] = await tx
      .select()
      .from(adminKycSubmissions)
      .where(eq(adminKycSubmissions.adminId, adminId))
      .limit(1);
    if (current && !["DRAFT", "CHANGES_REQUIRED"].includes(current.status))
      throw new DomainError("Application cannot be edited in this state", 409);
    const data = { ...input, adminId, updatedAt: new Date() };
    const [result] = current
      ? await tx
          .update(adminKycSubmissions)
          .set(data)
          .where(eq(adminKycSubmissions.id, current.id))
          .returning()
      : await tx.insert(adminKycSubmissions).values(data).returning();
    await tx.insert(adminAuditEvents).values({
      entityId: adminId,
      adminId,
      actorUserId,
      action: "KYC_SAVED",
      changedFields: Object.keys(input),
    });
    return result;
  });
}

export async function requestCategory(
  db: Db,
  adminId: string,
  categoryId: string,
) {
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (!["PENDING", "DRAFT", "CHANGES_REQUIRED"].includes(owner.status))
      throw new DomainError(
        "Category requests are unavailable in this state",
        409,
      );
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.id, categoryId), eq(categories.status, "PUBLISHED")),
      )
      .limit(1);
    if (!category) throw new DomainError("Category unavailable", 404);
    const [assignment] = await tx
      .insert(adminCategoryAssignments)
      .values({ adminId, categoryId, status: "REQUESTED" })
      .onConflictDoUpdate({
        target: [
          adminCategoryAssignments.adminId,
          adminCategoryAssignments.categoryId,
        ],
        set: { status: "REQUESTED", updatedAt: new Date() },
      })
      .returning();
    await tx.insert(adminAuditEvents).values({
      entityType: "CATEGORY_ASSIGNMENT",
      entityId: assignment.id,
      metadata: { categoryId },
      adminId,
      actorUserId: owner.userId,
      action: "CATEGORY_REQUESTED",
      changedFields: [categoryId, "status"],
    });
    return assignment;
  });
}

export async function setCategoryAssignment(
  db: Db,
  adminId: string,
  categoryId: string,
  reviewerId: string,
  active: boolean,
  reason: string,
) {
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (active && owner.status !== "ACTIVE")
      throw new DomainError("Admin approval required", 409);
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!category) throw new DomainError("Category unavailable", 404);
    const [assignment] = await tx
      .insert(adminCategoryAssignments)
      .values({
        adminId,
        categoryId,
        status: active ? "ACTIVE" : "REVOKED",
        assignedByUserId: reviewerId,
      })
      .onConflictDoUpdate({
        target: [
          adminCategoryAssignments.adminId,
          adminCategoryAssignments.categoryId,
        ],
        set: {
          status: active ? "ACTIVE" : "REVOKED",
          assignedByUserId: reviewerId,
          updatedAt: new Date(),
        },
      })
      .returning();
    await tx.insert(adminAuditEvents).values({
      entityType: "CATEGORY_ASSIGNMENT",
      entityId: assignment.id,
      metadata: { categoryId },
      adminId,
      actorUserId: reviewerId,
      action: active ? "CATEGORY_ASSIGNED" : "CATEGORY_REVOKED",
      changedFields: [categoryId, "status"],
      reason,
    });
    return assignment;
  });
}

export async function submitApplication(
  db: Db,
  adminId: string,
  actorUserId: string,
) {
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (!["PENDING", "DRAFT", "CHANGES_REQUIRED"].includes(owner.status))
      throw new DomainError(
        "Application cannot be submitted in this state",
        409,
      );
    const [kyc] = await tx
      .select()
      .from(adminKycSubmissions)
      .where(eq(adminKycSubmissions.adminId, adminId))
      .limit(1);
    if (
      !kyc ||
      !["DRAFT", "CHANGES_REQUIRED"].includes(kyc.status) ||
      !kyc.legalName ||
      !kyc.contactPhone ||
      !kyc.businessType
    )
      throw new DomainError(
        "Complete the seller profile before submission",
        422,
      );
    const addresses = await tx
      .select({ addressType: adminAddresses.addressType })
      .from(adminAddresses)
      .where(
        and(
          eq(adminAddresses.adminId, adminId),
          eq(adminAddresses.isActive, true),
        ),
      );
    if (
      !addresses.some((a) => a.addressType === "SHIPPING_ORIGIN") ||
      !addresses.some((a) => a.addressType === "RETURN")
    )
      throw new DomainError(
        "Shipping origin and return addresses are required",
        422,
      );
    const [scope] = await tx
      .select({ id: adminCategoryAssignments.id })
      .from(adminCategoryAssignments)
      .where(
        and(
          eq(adminCategoryAssignments.adminId, adminId),
          eq(adminCategoryAssignments.status, "REQUESTED"),
        ),
      )
      .limit(1);
    if (!scope)
      throw new DomainError("Request at least one selling category", 422);
    const [evidence] = await tx
      .select({ id: adminKycDocuments.id })
      .from(adminKycDocuments)
      .where(eq(adminKycDocuments.submissionId, kyc.id))
      .limit(1);
    if (!evidence)
      throw new DomainError("Private KYC evidence is required", 422);
    const [result] = await tx
      .update(adminKycSubmissions)
      .set({
        status: "PENDING_SUPER_ADMIN_APPROVAL",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adminKycSubmissions.id, kyc.id))
      .returning();
    await tx
      .update(admins)
      .set({ status: "PENDING_SUPER_ADMIN_APPROVAL", updatedAt: new Date() })
      .where(eq(admins.id, adminId));
    await tx.insert(adminAuditEvents).values({
      entityId: adminId,
      adminId,
      actorUserId,
      action: "APPLICATION_SUBMITTED",
      changedFields: ["status"],
    });
    return result;
  });
}

export async function reviewApplication(
  db: Db,
  adminId: string,
  reviewerId: string,
  decision: "CHANGES_REQUIRED" | "REJECTED" | "APPROVED",
  notes: string,
) {
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (owner.status !== "PENDING_SUPER_ADMIN_APPROVAL")
      throw new DomainError("Application is not pending review", 409);
    const [kyc] = await tx
      .select()
      .from(adminKycSubmissions)
      .where(eq(adminKycSubmissions.adminId, adminId))
      .limit(1);
    if (!kyc || kyc.status !== "PENDING_SUPER_ADMIN_APPROVAL")
      throw new DomainError("Application is not pending review", 409);
    if (decision === "APPROVED") {
      const addresses = await tx
        .select({ addressType: adminAddresses.addressType })
        .from(adminAddresses)
        .where(
          and(
            eq(adminAddresses.adminId, adminId),
            eq(adminAddresses.isActive, true),
          ),
        );
      if (
        !addresses.some((a) => a.addressType === "SHIPPING_ORIGIN") ||
        !addresses.some((a) => a.addressType === "RETURN")
      )
        throw new DomainError("Both operational addresses are required", 422);
      const [scope] = await tx
        .select({ id: adminCategoryAssignments.id })
        .from(adminCategoryAssignments)
        .where(
          and(
            eq(adminCategoryAssignments.adminId, adminId),
            eq(adminCategoryAssignments.status, "REQUESTED"),
          ),
        )
        .limit(1);
      if (!scope)
        throw new DomainError("At least one selling category is required", 422);
      const [evidence] = await tx
        .select({ id: adminKycDocuments.id })
        .from(adminKycDocuments)
        .where(eq(adminKycDocuments.submissionId, kyc.id))
        .limit(1);
      if (!evidence)
        throw new DomainError("Private KYC evidence is required", 422);
      await tx
        .update(adminCategoryAssignments)
        .set({
          status: "ACTIVE",
          assignedByUserId: reviewerId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(adminCategoryAssignments.adminId, adminId),
            eq(adminCategoryAssignments.status, "REQUESTED"),
          ),
        );
    }
    const [result] = await tx
      .update(adminKycSubmissions)
      .set({
        status: decision,
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(adminKycSubmissions.id, kyc.id))
      .returning();
    await tx
      .update(admins)
      .set({
        status: decision === "APPROVED" ? "ACTIVE" : decision,
        updatedAt: new Date(),
      })
      .where(eq(admins.id, adminId));
    await tx.insert(adminAuditEvents).values({
      entityId: adminId,
      adminId,
      actorUserId: reviewerId,
      action: "APPLICATION_REVIEWED",
      changedFields: [decision, "status", "reviewNotes"],
      reason: notes,
    });
    return result;
  });
}

export async function correctApplication(
  db: Db,
  adminId: string,
  reviewerId: string,
  input: {
    legalName?: string;
    businessType?: string;
    contactPhone?: string;
    reason: string;
  },
) {
  const { reason, ...changes } = input;
  if (!Object.keys(changes).length)
    throw new DomainError("No changes supplied", 422);
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (owner.status !== "PENDING_SUPER_ADMIN_APPROVAL")
      throw new DomainError("Application is not pending review", 409);
    const [result] = await tx
      .update(adminKycSubmissions)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(adminKycSubmissions.adminId, adminId))
      .returning();
    if (!result) throw new DomainError("Application unavailable", 404);
    await tx.insert(adminAuditEvents).values({
      entityId: adminId,
      adminId,
      actorUserId: reviewerId,
      action: "KYC_CORRECTED",
      changedFields: Object.keys(changes),
      reason,
    });
    return result;
  });
}
