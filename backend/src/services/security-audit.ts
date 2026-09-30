import type { createDb } from "../db";
import { adminAuditEvents } from "../db/schema/admin";
import type { AdminTx } from "./admin/admin-lock";

export async function recordSensitiveAction(tx: AdminTx, actorUserId: string, action: string, entityType: string, entityId: string,
  metadata: Record<string, string | number | boolean | null> = {}, adminId?: string) {
  await tx.insert(adminAuditEvents).values({ actorUserId, action, entityType, entityId, metadata, adminId, changedFields: [] });
}

/** Wrap direct privileged route writes and their audit in one transaction. */
export async function auditedMutation<T>(db: ReturnType<typeof createDb>["db"], actorUserId: string, action: string, entityType: string,
  mutation: (tx: AdminTx) => Promise<T>, entityId: (result: T) => string) {
  return db.transaction(async tx => {
    const result = await mutation(tx);
    await recordSensitiveAction(tx, actorUserId, action, entityType, entityId(result));
    return result;
  });
}
