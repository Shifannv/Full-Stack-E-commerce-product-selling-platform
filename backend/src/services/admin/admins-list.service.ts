/**
 * Super Admin — admin management queries.
 *
 * Exposes admin list with KYC status for the Super Admin management dashboard.
 * Private KYC document keys are never included in list responses.
 */
import { and, desc, eq, ilike, or, SQL } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminKycSubmissions } from "../../db/schema/admin";
import { admins } from "../../db/schema/rbac";
import { users } from "../../db/schema/auth";

type Db = ReturnType<typeof createDb>["db"];

export type AdminListFilters = {
  /** Filter by admin status (e.g. "ACTIVE", "PENDING_SUPER_ADMIN_APPROVAL"). */
  status?: string;
  /** Full-text search across user name and email (case-insensitive, max 100 chars). */
  q?: string;
  limit: number;
  offset: number;
};

/**
 * Lists all admin accounts for the Super Admin management page.
 *
 * Returns: adminId, userId, admin status, user name, user email, KYC status, timestamps.
 * Excludes: privateObjectKey, reviewNotes, individual audit events.
 */
export async function listAdmins(db: Db, filters: AdminListFilters) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(admins.status, filters.status));
  if (filters.q) {
    const pattern = `%${filters.q.trim().slice(0, 100)}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }

  const whereClause = conditions.length === 0
    ? undefined
    : conditions.length === 1
      ? conditions[0]
      : and(...conditions);

  return db
    .select({
      id: admins.id,
      userId: admins.userId,
      status: admins.status,
      createdAt: admins.createdAt,
      updatedAt: admins.updatedAt,
      userName: users.name,
      userEmail: users.email,
      kycStatus: adminKycSubmissions.status,
      kycSubmittedAt: adminKycSubmissions.submittedAt,
      kycReviewedAt: adminKycSubmissions.reviewedAt,
    })
    .from(admins)
    .innerJoin(users, eq(admins.userId, users.id))
    .leftJoin(adminKycSubmissions, eq(adminKycSubmissions.adminId, admins.id))
    .where(whereClause)
    .orderBy(desc(admins.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);
}
