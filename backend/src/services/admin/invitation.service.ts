/**
 * Admin invitation service.
 *
 * Security model:
 * - 48-byte cryptographically random token generated per invitation.
 * - Raw token is transmitted ONCE (via email) and NEVER stored.
 * - SHA-256 hex hash of the raw token is used as the verifications.identifier
 *   (with prefix "invite:"), so the raw token cannot be reconstructed.
 * - value column holds JSON: { email, invitedByUserId, adminId }.
 * - Token expires after 24 hours.
 * - Token is one-time-use: the row is DELETED atomically on activation.
 * - Raw token is never logged.
 */

import { and, eq, gt, like, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import { verifications } from "../../db/schema/auth";
import { adminAuditEvents } from "../../db/schema/admin";
import { admins, roles, userRoles } from "../../db/schema/rbac";
import { users, accounts } from "../../db/schema/auth";
import { DomainError, requiredText } from "./admin.service";
import { hashPassword } from "better-auth/crypto";

type Db = ReturnType<typeof createDb>["db"];

/** 24-hour invitation window. */
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Stable prefix for invitation tokens in the verifications table. */
const INVITE_PREFIX = "invite:";

/** SHA-256 hex of the raw token. Never logged. */
async function hashToken(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** URL-safe base64 token of 48 random bytes. */
function generateRawToken(): string {
  const buf = new Uint8Array(48);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type InvitationPayload = {
  email: string;
  invitedByUserId: string;
  adminId?: string;
};

/**
 * Create an invitation for a new Admin.
 * Creates a PENDING user + ADMIN role + admin record, then stores a hashed token.
 * Returns the raw token (never stored) for email delivery.
 */
export async function createInvitation(
  db: Db,
  input: { email: string; name: string; invitedByUserId: string },
): Promise<{ rawToken: string; expiresAt: Date; adminId: string }> {
  const email = requiredText(input.email, "email", 320).toLowerCase();
  const name = requiredText(input.name, "name", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("Invalid email", 422);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new DomainError("Email already belongs to an account", 409);

    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "ADMIN"))
      .limit(1)
      .for("update");
    if (!role) throw new DomainError("RBAC role unavailable", 409);

    const userId = crypto.randomUUID();
    await tx.insert(users).values({
      id: userId,
      name,
      email,
      emailVerified: false,
      status: "PENDING",
    });
    await tx.insert(userRoles).values({ userId, roleId: role.id });

    const [admin] = await tx
      .insert(admins)
      .values({ userId, status: "DRAFT" })
      .returning({ id: admins.id });

    await tx.insert(adminAuditEvents).values({
      adminId: admin.id,
      actorUserId: input.invitedByUserId,
      action: "ADMIN_INVITED",
      changedFields: ["userId", "status", "email"],
    });

    const rawToken = generateRawToken();
    const tokenHash = await hashToken(rawToken);
    const identifier = `${INVITE_PREFIX}${tokenHash}`;
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const payload: InvitationPayload = {
      email,
      invitedByUserId: input.invitedByUserId,
      adminId: admin.id,
    };
    await tx.insert(verifications).values({
      id: crypto.randomUUID(),
      identifier,
      value: JSON.stringify(payload),
      expiresAt,
    });

    return { rawToken, expiresAt, adminId: admin.id };
  });
}

/**
 * Reissue an invitation for an existing PENDING Admin.
 * Deletes prior invite tokens and creates a new one.
 */
export async function reissueInvitation(
  db: Db,
  input: { email: string; invitedByUserId: string },
): Promise<{ rawToken: string; expiresAt: Date; adminId: string }> {
  const email = input.email.toLowerCase().trim();

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .for("update");
    if (!user) throw new DomainError("Invited user unavailable", 404);
    if (user.status !== "PENDING" || user.deletedAt) throw new DomainError("Account is already active", 409);

    const [admin] = await tx
      .select({ id: admins.id, deletedAt: admins.deletedAt })
      .from(admins)
      .where(eq(admins.userId, user.id))
      .limit(1)
      .for("update");
    if (!admin || admin.deletedAt) throw new DomainError("Admin record unavailable", 404);

    // Revoke only this Admin's prior invitations; other Admins' links remain valid.
    await tx
      .delete(verifications)
      .where(and(like(verifications.identifier, `${INVITE_PREFIX}%`), sql`${verifications.value}::jsonb ->> 'adminId' = ${admin.id}`));

    await tx.insert(adminAuditEvents).values({
      adminId: admin.id,
      actorUserId: input.invitedByUserId,
      action: "ADMIN_REINVITED",
      changedFields: ["invitationToken"],
    });

    const rawToken = generateRawToken();
    const tokenHash = await hashToken(rawToken);
    const identifier = `${INVITE_PREFIX}${tokenHash}`;
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const payload: InvitationPayload = {
      email,
      invitedByUserId: input.invitedByUserId,
      adminId: admin.id,
    };
    await tx.insert(verifications).values({
      id: crypto.randomUUID(),
      identifier,
      value: JSON.stringify(payload),
      expiresAt,
    });

    return { rawToken, expiresAt, adminId: admin.id };
  });
}

/**
 * Activate an Admin account using a raw invitation token and a chosen password.
 * Deletes the token row atomically (one-time use).
 */
export async function activateAdminAccount(
  db: Db,
  input: { rawToken: string; password: string },
): Promise<{ userId: string; email: string; adminId: string }> {
  if (typeof input.rawToken !== "string" || !input.rawToken) throw new DomainError("Invalid token", 422);
  if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 256) {
    throw new DomainError("Password must be 12 to 256 characters", 422);
  }

  const tokenHash = await hashToken(input.rawToken);
  const identifier = `${INVITE_PREFIX}${tokenHash}`;

  return db.transaction(async (tx) => {
    const [verification] = await tx
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, identifier))
      .limit(1);

    if (!verification) throw new DomainError("Invitation token is invalid", 404);
    if (verification.expiresAt < new Date()) {
      await tx.delete(verifications).where(eq(verifications.id, verification.id));
      throw new DomainError("Invitation token has expired", 422);
    }

    let payload: InvitationPayload;
    try {
      payload = JSON.parse(verification.value) as InvitationPayload;
    } catch {
      throw new DomainError("Invitation payload is corrupt", 503);
    }

    const [user] = await tx
      .select({ id: users.id, status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.email, payload.email))
      .limit(1)
      .for("update");

    if (!user) throw new DomainError("Invited user unavailable", 404);
    if (user.status !== "PENDING" || user.deletedAt) throw new DomainError("Account is already active", 409);

    const [admin] = await tx
      .select({ id: admins.id, deletedAt: admins.deletedAt })
      .from(admins)
      .where(eq(admins.userId, user.id))
      .limit(1)
      .for("update");
    if (!admin || admin.deletedAt) throw new DomainError("Admin record unavailable", 404);

    // Reissue holds the user and Admin locks before removing old tokens.
    // Recheck this token after taking those same locks.
    const [currentToken] = await tx.select({ id: verifications.id, expiresAt: verifications.expiresAt })
      .from(verifications).where(eq(verifications.identifier, identifier)).limit(1).for("update");
    if (!currentToken || currentToken.id !== verification.id) throw new DomainError("Invitation token is invalid", 404);
    if (currentToken.expiresAt < new Date()) throw new DomainError("Invitation token has expired", 422);

    const hashed = await hashPassword(input.password);

    await tx.insert(accounts).values({
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hashed,
    });

    await tx
      .update(users)
      .set({ status: "ACTIVE", emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Consume the token — one-time use.
    await tx.delete(verifications).where(eq(verifications.id, verification.id));

    await tx.insert(adminAuditEvents).values({
      adminId: admin.id,
      actorUserId: user.id,
      action: "ADMIN_ACTIVATED",
      changedFields: ["status", "password", "emailVerified"],
    });

    return { userId: user.id, email: payload.email, adminId: admin.id };
  });
}

/**
 * Peek at an invitation token without consuming it.
 * Used to validate before showing the password setup form.
 */
export async function peekInvitation(
  db: Db,
  rawToken: string,
): Promise<{ email: string; expiresAt: Date; adminId?: string }> {
  if (typeof rawToken !== "string" || !rawToken) throw new DomainError("Invalid token", 422);

  const tokenHash = await hashToken(rawToken);
  const identifier = `${INVITE_PREFIX}${tokenHash}`;

  const [verification] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.identifier, identifier), gt(verifications.expiresAt, new Date())))
    .limit(1);

  if (!verification) throw new DomainError("Invitation token is invalid or has expired", 404);

  let payload: InvitationPayload;
  try {
    payload = JSON.parse(verification.value) as InvitationPayload;
  } catch {
    throw new DomainError("Invitation payload is corrupt", 503);
  }

  return { email: payload.email, expiresAt: verification.expiresAt, adminId: payload.adminId };
}
