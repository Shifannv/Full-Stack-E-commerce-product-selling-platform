/**
 * Super Admin read-only oversight queries.
 *
 * - listRolePermissions: effective role -> permission grants from the existing
 *   RBAC tables (roles, permissions, role_permissions). Read-only; there is no
 *   grant mutation policy, so writes are intentionally not provided.
 * - listAdminLifecycleRequests: platform-wide discovery of Admin deletion and
 *   recovery requests. Decisions stay with the existing per-Admin review routes
 *   (reviewAdminDeletion / reviewAdminRecovery in account-lifecycle.service).
 *
 * No credentials, password hashes, session data or KYC object keys are read.
 */
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { createDb } from "../../db";
import { users } from "../../db/schema/auth";
import {
  admins,
  permissions,
  rolePermissions,
  roles,
} from "../../db/schema/rbac";
import {
  adminDeletionRequests,
  adminRecoveryRequests,
} from "../../db/schema/admin-lifecycle";

type Db = ReturnType<typeof createDb>["db"];

export async function listRolePermissions(db: Db) {
  const [roleRows, permissionRows, grantRows] = await Promise.all([
    db
      .select({ id: roles.id, name: roles.name, description: roles.description })
      .from(roles)
      .orderBy(asc(roles.name), asc(roles.id)),
    db
      .select({
        id: permissions.id,
        key: permissions.key,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(asc(permissions.key), asc(permissions.id)),
    db
      .select({ roleId: rolePermissions.roleId, key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .orderBy(asc(permissions.key)),
  ]);
  return {
    roles: roleRows.map((role) => ({
      ...role,
      permissions: grantRows
        .filter((grant) => grant.roleId === role.id)
        .map((grant) => grant.key),
    })),
    permissions: permissionRows,
  };
}

export const LIFECYCLE_REQUEST_TYPES = ["DELETION", "RECOVERY"] as const;
export type LifecycleRequestType = (typeof LIFECYCLE_REQUEST_TYPES)[number];
export const LIFECYCLE_REQUEST_STATUSES: Record<LifecycleRequestType, string[]> =
  {
    DELETION: ["REQUESTED", "PENDING", "APPROVED", "REJECTED"],
    RECOVERY: ["PENDING", "APPROVED", "REJECTED"],
  };

/**
 * Deterministic ordering: requestedAt DESC, id ASC for ties.
 * Deletion rows include verifiedAt: only PENDING + verified rows can be
 * approved by the existing review service.
 */
export async function listAdminLifecycleRequests(
  db: Db,
  opts: {
    type: LifecycleRequestType;
    status?: string;
    limit: number;
    offset: number;
  },
) {
  if (opts.type === "DELETION") {
    const conditions: SQL[] = [];
    if (opts.status)
      conditions.push(eq(adminDeletionRequests.status, opts.status));
    return db
      .select({
        id: adminDeletionRequests.id,
        type: sqlLiteral("DELETION"),
        adminId: adminDeletionRequests.adminId,
        adminStatus: admins.status,
        userName: users.name,
        userEmail: users.email,
        status: adminDeletionRequests.status,
        reason: adminDeletionRequests.reason,
        requestedAt: adminDeletionRequests.requestedAt,
        verifiedAt: adminDeletionRequests.verifiedAt,
        reviewedAt: adminDeletionRequests.reviewedAt,
        reviewNotes: adminDeletionRequests.reviewNotes,
      })
      .from(adminDeletionRequests)
      .innerJoin(admins, eq(admins.id, adminDeletionRequests.adminId))
      .innerJoin(users, eq(users.id, admins.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        desc(adminDeletionRequests.requestedAt),
        asc(adminDeletionRequests.id),
      )
      .limit(opts.limit)
      .offset(opts.offset);
  }
  const conditions: SQL[] = [];
  if (opts.status)
    conditions.push(eq(adminRecoveryRequests.status, opts.status));
  return db
    .select({
      id: adminRecoveryRequests.id,
      type: sqlLiteral("RECOVERY"),
      adminId: adminRecoveryRequests.adminId,
      adminStatus: admins.status,
      userName: users.name,
      userEmail: users.email,
      status: adminRecoveryRequests.status,
      reason: adminRecoveryRequests.reason,
      requestedAt: adminRecoveryRequests.requestedAt,
      archiveId: adminRecoveryRequests.archiveId,
      reviewedAt: adminRecoveryRequests.reviewedAt,
      reviewNotes: adminRecoveryRequests.reviewNotes,
    })
    .from(adminRecoveryRequests)
    .innerJoin(admins, eq(admins.id, adminRecoveryRequests.adminId))
    .innerJoin(users, eq(users.id, admins.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      desc(adminRecoveryRequests.requestedAt),
      asc(adminRecoveryRequests.id),
    )
    .limit(opts.limit)
    .offset(opts.offset);
}

function sqlLiteral<T extends string>(value: T) {
  return sql<T>`${value}::text`;
}
