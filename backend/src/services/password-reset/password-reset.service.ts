/**
 * Password-reset service.
 *
 * Security model:
 * - 48-byte cryptographically random token generated per request.
 * - Raw token is transmitted ONCE (via email) and NEVER stored.
 * - SHA-256 hex hash of the raw token is stored in verifications.identifier
 *   with prefix "pwd-reset:", so the raw token cannot be reconstructed.
 * - value column holds JSON: { userId, role } — no plaintext password, no token.
 * - Token expires after TOKEN_TTL_MS (1 hour).
 * - Token is one-time-use: the row is DELETED atomically on consumption.
 * - Raw token is NEVER logged.
 * - Forgot-password requests are enumeration-safe: same response for any email.
 * - Super Admin accounts are ineligible for public password reset.
 */

import { and, eq, gt, like } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { createDb } from "../../db";
import { accounts, sessions, users, verifications } from "../../db/schema/auth";
import { roles, userRoles } from "../../db/schema/rbac";
import { DomainError } from "../admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];

/** 1-hour reset window. Short-lived as required. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Stable prefix for password-reset tokens in the verifications table. */
const RESET_PREFIX = "pwd-reset:";

/** Password policy: 12–128 characters, non-empty after the fact of being a string. */
function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new DomainError("Password must be 12 to 128 characters", 422);
  return value;
}

/** SHA-256 hex digest of the raw token. Never logged. */
async function hashToken(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** URL-safe base64 token of 48 random bytes (cryptographically secure). */
function generateRawToken(): string {
  const buf = new Uint8Array(48);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type ResetPayload = {
  userId: string;
  /** CUSTOMER | ADMIN  — never SUPER_ADMIN */
  role: string;
};

/**
 * Initiate a password reset for any eligible CUSTOMER or ADMIN email.
 *
 * Always returns the same shape regardless of whether the email exists,
 * preventing account-existence enumeration.
 *
 * Returns rawToken + expiresAt ONLY when an eligible user is found,
 * so the caller can dispatch the email. Returns null when the email is
 * unknown or ineligible (Super Admin, deleted, etc.).
 */
export async function initiatePasswordReset(
  db: Db,
  email: string,
): Promise<{ rawToken: string; expiresAt: Date; toEmail: string; toName: string; role: string } | null> {
  const normalised = email.toLowerCase().trim();

  return db.transaction(async (tx) => {
    // Look up user — must be ACTIVE, not deleted.
    const [user] = await tx
      .select({ id: users.id, name: users.name, email: users.email, status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.email, normalised))
      .limit(1);

    if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;

    // Fetch all role names for this user.
    const grants = await tx
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, user.id));

    const roleNames = grants.map((g) => g.name);

    // Super Admin is explicitly excluded from public password reset.
    if (roleNames.includes("SUPER_ADMIN")) return null;

    // Determine the primary eligible role (ADMIN takes priority over CUSTOMER).
    let primaryRole: string;
    if (roleNames.includes("ADMIN")) {
      primaryRole = "ADMIN";
    } else if (roleNames.includes("CUSTOMER")) {
      primaryRole = "CUSTOMER";
    } else {
      return null;
    }

    // Revoke any outstanding reset tokens for this user before creating a new one.
    // This prevents token accumulation and enforces a single active reset at a time.
    await tx.delete(verifications).where(
      and(
        like(verifications.identifier, `${RESET_PREFIX}%`),
        eq(verifications.value, JSON.stringify({ userId: user.id, role: primaryRole } satisfies ResetPayload)),
      ),
    );

    const rawToken = generateRawToken();
    const tokenHash = await hashToken(rawToken);
    const identifier = `${RESET_PREFIX}${tokenHash}`;
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    const payload: ResetPayload = { userId: user.id, role: primaryRole };

    await tx.insert(verifications).values({
      id: crypto.randomUUID(),
      identifier,
      value: JSON.stringify(payload),
      expiresAt,
    });

    return { rawToken, expiresAt, toEmail: user.email, toName: user.name, role: primaryRole };
  });
}

/**
 * Consume a password-reset token and replace the user's credential.
 *
 * On success:
 *  1. Token validated and deleted (single-use).
 *  2. New password hashed and stored in the credential account row.
 *  3. All sessions for the user deleted.
 *
 * Throws DomainError for all invalid-token conditions; messages are
 * deliberately generic to avoid leaking information.
 */
export async function consumePasswordReset(
  db: Db,
  rawToken: string,
  newPassword: string,
): Promise<{ userId: string; role: string }> {
  if (typeof rawToken !== "string" || !rawToken)
    throw new DomainError("Invalid reset token", 422);

  const password = validatePassword(newPassword);
  const tokenHash = await hashToken(rawToken);
  const identifier = `${RESET_PREFIX}${tokenHash}`;

  return db.transaction(async (tx) => {
    // Look up the token row — include only non-expired rows via DB-side filter.
    // NOTE: fetch_types:false means timestamp columns arrive as strings; using
    // JS-side `expiresAt < new Date()` silently fails because string < Date
    // coerces Date to a number and the string to NaN, always returning false.
    // The gt() filter runs server-side and is immune to this type issue.
    const [verification] = await tx
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.identifier, identifier),
          gt(verifications.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!verification) throw new DomainError("Reset token is invalid or has expired", 422);

    let payload: ResetPayload;
    try {
      payload = JSON.parse(verification.value) as ResetPayload;
    } catch {
      throw new DomainError("Reset token is invalid or has expired", 422);
    }

    // Validate the user still exists and is eligible.
    const [user] = await tx
      .select({ id: users.id, status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1)
      .for("update");

    if (!user || user.status !== "ACTIVE" || user.deletedAt)
      throw new DomainError("Reset token is invalid or has expired", 422);

    // Re-verify role eligibility — Super Admin must never succeed.
    const grants = await tx
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, user.id));

    const roleNames = grants.map((g) => g.name);
    if (roleNames.includes("SUPER_ADMIN"))
      throw new DomainError("Reset token is invalid or has expired", 422);

    // Re-lock the token row for update to prevent concurrent consumption.
    // Also re-check expiry server-side (same fetch_types:false guard as above).
    const [lockedToken] = await tx
      .select({ id: verifications.id, expiresAt: verifications.expiresAt })
      .from(verifications)
      .where(
        and(
          eq(verifications.identifier, identifier),
          gt(verifications.expiresAt, new Date()),
        ),
      )
      .limit(1)
      .for("update");

    if (!lockedToken || lockedToken.id !== verification.id)
      throw new DomainError("Reset token is invalid or has expired", 422);

    // Hash the new password using better-auth's own mechanism.
    const hashed = await hashPassword(password);

    // Update or insert the credential account row.
    const [existing] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
      .limit(1)
      .for("update");

    if (existing) {
      await tx
        .update(accounts)
        .set({ password: hashed, updatedAt: new Date() })
        .where(eq(accounts.id, existing.id));
    } else {
      // Customer accounts created via Google OAuth may not have a credential row yet.
      await tx.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: user.id,
        userId: user.id,
        providerId: "credential",
        password: hashed,
      });
    }

    // Consume the token atomically — single-use enforced.
    await tx.delete(verifications).where(eq(verifications.id, verification.id));

    // Invalidate ALL existing sessions for this user.
    await tx.delete(sessions).where(eq(sessions.userId, user.id));

    return { userId: user.id, role: payload.role };
  });
}

/**
 * Peek at a reset token without consuming it.
 * Used to validate a token is still live before showing the reset form.
 */
export async function peekPasswordResetToken(
  db: Db,
  rawToken: string,
): Promise<{ expiresAt: Date; role: string }> {
  if (typeof rawToken !== "string" || !rawToken)
    throw new DomainError("Invalid reset token", 422);

  const tokenHash = await hashToken(rawToken);
  const identifier = `${RESET_PREFIX}${tokenHash}`;

  const [verification] = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, identifier),
        gt(verifications.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!verification) throw new DomainError("Reset token is invalid or has expired", 422);

  let payload: ResetPayload;
  try {
    payload = JSON.parse(verification.value) as ResetPayload;
  } catch {
    throw new DomainError("Reset token is invalid or has expired", 422);
  }

  return { expiresAt: verification.expiresAt, role: payload.role };
}
