import { and, eq, isNull } from "drizzle-orm";
import type { createDb } from "../../db";
import { adminBankAccounts } from "../../db/schema/admin-bank";
import { adminAuditEvents } from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import { roles, userRoles } from "../../db/schema/rbac";
import { DomainError, requiredText } from "./admin.service";
import { lockAdmin, type AdminTx } from "./admin-lock";

type Db = ReturnType<typeof createDb>["db"];
const bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
async function key(value?: string) {
  try {
    if (!value || bytes(value).length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", bytes(value), "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch { throw new DomainError("Private bank storage is not configured", 409); }
}
async function reviewer(tx: AdminTx, userId: string) {
  const [grant] = await tx.select({ id: users.id }).from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.id, userId), eq(users.status, "ACTIVE"), isNull(users.deletedAt), eq(roles.name, "SUPER_ADMIN"))).limit(1);
  if (!grant) throw new DomainError("Forbidden", 403);
}
export const bankProjection = {
  accountLast4: adminBankAccounts.accountLast4, status: adminBankAccounts.status,
  revision: adminBankAccounts.revision, reviewedAt: adminBankAccounts.reviewedAt,
  reviewNotes: adminBankAccounts.reviewNotes, updatedAt: adminBankAccounts.updatedAt,
};
export async function getBankSummary(db: Db, adminId: string) {
  const [row] = await db.select(bankProjection).from(adminBankAccounts).where(eq(adminBankAccounts.adminId, adminId));
  return row ?? null;
}
export async function saveBankDetails(db: Db, adminId: string, userId: string, input: Record<string, unknown>, secret?: string) {
  const details = {
    accountHolder: requiredText(input.accountHolder, "Account holder", 200),
    bankName: requiredText(input.bankName, "Bank name", 200),
    accountNumber: requiredText(input.accountNumber, "Account number", 34),
    ifsc: requiredText(input.ifsc, "IFSC", 11).toUpperCase(),
  };
  if (!/^\d{6,34}$/.test(details.accountNumber) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(details.ifsc)) throw new DomainError("Enter a valid account number and IFSC", 422);
  const encryptionKey = await key(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(adminId) }, encryptionKey, new TextEncoder().encode(JSON.stringify(details)));
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    if (owner.userId !== userId) throw new DomainError("Forbidden", 403);
    const [existing] = await tx.select({ status: adminBankAccounts.status }).from(adminBankAccounts).where(eq(adminBankAccounts.adminId, adminId));
    const legacyIntake = owner.status === "ACTIVE" && (!existing || existing.status === "CHANGES_REQUIRED");
    if (!legacyIntake && !["DRAFT", "PENDING", "CHANGES_REQUIRED"].includes(owner.status)) throw new DomainError("Bank changes require an editable application", 409);
    const data = { encryptedDetails: `${base64(iv)}.${base64(new Uint8Array(encrypted))}`, accountLast4: details.accountNumber.slice(-4), status: "PENDING", revision: crypto.randomUUID(), reviewedAt: null, reviewedByUserId: null, reviewNotes: null, updatedAt: new Date() };
    const [row] = await tx.insert(adminBankAccounts).values({ adminId, ...data }).onConflictDoUpdate({ target: adminBankAccounts.adminId, set: data }).returning(bankProjection);
    await tx.insert(adminAuditEvents).values({ adminId, entityId: adminId, actorUserId: userId, action: "BANK_DETAILS_SAVED", changedFields: ["bankDetails", "status", "revision"] });
    return row;
  });
}
export async function revealBankDetails(db: Db, adminId: string, reviewerId: string, secret?: string) {
  const encryptionKey = await key(secret);
  return db.transaction(async (tx) => {
    await reviewer(tx, reviewerId);
    const [row] = await tx.select().from(adminBankAccounts).where(eq(adminBankAccounts.adminId, adminId)).for("share");
    if (!row) throw new DomainError("Bank details unavailable", 404);
    const [iv, encrypted] = row.encryptedDetails.split(".");
    let details;
    try {
      const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: new TextEncoder().encode(adminId) }, encryptionKey, bytes(encrypted));
      details = JSON.parse(new TextDecoder().decode(data)) as { accountHolder: string; bankName: string; accountNumber: string; ifsc: string };
    } catch { throw new DomainError("Bank details could not be decrypted", 503); }
    await tx.insert(adminAuditEvents).values({ adminId, entityId: adminId, actorUserId: reviewerId, action: "BANK_DETAILS_VIEWED", changedFields: [] });
    return { ...details, revision: row.revision };
  });
}
export async function reviewBankDetails(db: Db, adminId: string, reviewerId: string, input: Record<string, unknown>) {
  if (!["VERIFIED", "CHANGES_REQUIRED"].includes(String(input.decision))) throw new DomainError("Invalid bank decision", 422);
  const notes = requiredText(input.notes, "Verification notes", 1000);
  return db.transaction(async (tx) => {
    const owner = await lockAdmin(tx, adminId);
    await reviewer(tx, reviewerId);
    const [row] = await tx.select().from(adminBankAccounts).where(eq(adminBankAccounts.adminId, adminId)).for("update");
    if (!row || row.revision !== input.revision) throw new DomainError("Bank details changed; reload before review", 409);
    if (owner.status === "ACTIVE" && row.status === "VERIFIED") throw new DomainError("Verified active bank details cannot be changed through onboarding", 409);
    const [saved] = await tx.update(adminBankAccounts).set({ status: String(input.decision), reviewedByUserId: reviewerId, reviewedAt: new Date(), reviewNotes: notes }).where(eq(adminBankAccounts.adminId, adminId)).returning(bankProjection);
    await tx.insert(adminAuditEvents).values({ adminId, entityId: adminId, actorUserId: reviewerId, action: "BANK_DETAILS_REVIEWED", changedFields: ["status", "reviewNotes"], reason: notes });
    return saved;
  });
}

export async function requireVerifiedBank(tx: AdminTx, adminId: string) {
  const [bank] = await tx.select({ status: adminBankAccounts.status }).from(adminBankAccounts).where(eq(adminBankAccounts.adminId, adminId)).for("share");
  if (bank?.status !== "VERIFIED") throw new DomainError("Verified bank details are required for manual payout", 409);
}
