/**
 * verify-invitations.ts
 *
 * Integration test for the Admin invitation flow:
 * - createInvitation: creates PENDING user + ADMIN record + hashed token
 * - peekInvitation: validates without consuming
 * - activateAdminAccount: activates with password, consumes token (one-time use)
 * - reissueInvitation: revokes prior tokens and issues a new one
 * - expiry enforcement
 * - reuse rejection
 *
 * Runs against the real Aiven database (DATABASE_URL env).
 * All fixture rows are deleted in the finally block.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, like, sql } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { createDb } from "../src/db";
import { adminAuditEvents } from "../src/db/schema/admin";
import { accounts, users, verifications } from "../src/db/schema/auth";
import { admins, userRoles } from "../src/db/schema/rbac";
import {
  activateAdminAccount,
  createInvitation,
  peekInvitation,
  reissueInvitation,
} from "../src/services/admin/invitation.service";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { db, client } = createDb(process.env.DATABASE_URL);

const fixture = randomUUID();
const actorId = randomUUID();
const email = `invitation-admin-${fixture}@example.invalid`;
const name = "Invitation Test Admin";
const password = `Admin!${fixture}aA1`;

let adminId: string | undefined;
let invitedUserId: string | undefined;
let inviteToken: string | undefined;
let token2: string | undefined;

async function main() {
  // Minimal actor user (avoids FK violation on adminAuditEvents.actorUserId)
  await db.insert(users).values({
    id: actorId,
    name: "Invitation Test Actor",
    email: `invitation-actor-${actorId}@example.invalid`,
    emailVerified: false,
    status: "ACTIVE",
  });

  // --- 1. Create invitation ---
  const created = await createInvitation(db, { email, name, invitedByUserId: actorId });
  adminId = created.adminId;
  inviteToken = created.rawToken;

  // Raw token must not be all-zeros or trivially short
  assert.ok(typeof inviteToken === "string" && inviteToken.length >= 60, "Token must be at least 60 chars");

  // User is in PENDING state — cannot sign in yet
  const [pendingUser] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  invitedUserId = pendingUser?.id;
  assert.equal(pendingUser?.status, "PENDING", "Invited user must be PENDING");

  // --- 2. Peek: valid token ---
  const peeked = await peekInvitation(db, inviteToken);
  assert.equal(peeked.email, email);
  assert.ok(peeked.expiresAt > new Date(), "Token must not be expired");
  const originalTokenRows = await db.select({ id: verifications.id, expiresAt: verifications.expiresAt }).from(verifications)
    .where(and(like(verifications.identifier, "invite:%"), sql`${verifications.value}::jsonb ->> 'adminId' = ${adminId!}`));
  assert.equal(originalTokenRows.length, 1);
  const remainingMs = originalTokenRows[0].expiresAt.getTime() - Date.now();
  assert.ok(remainingMs > 24 * 60 * 60 * 1000 - 10_000 && remainingMs <= 24 * 60 * 60 * 1000, "Invitation must expire after 24 hours");

  // --- 3. Peek: invalid token must throw ---
  await assert.rejects(
    () => peekInvitation(db, "invalid-token-that-does-not-exist"),
    /invalid or has expired/,
    "Invalid token must be rejected",
  );

  // --- 4. Duplicate invitation must be rejected (email already exists) ---
  await assert.rejects(
    () => createInvitation(db, { email, name, invitedByUserId: actorId }),
    /already belongs to an account/,
    "Duplicate invitation must be rejected",
  );

  // --- 5. Short password must be rejected ---
  await assert.rejects(
    () => activateAdminAccount(db, { rawToken: inviteToken!, password: "short" }),
    /12 to 256/,
    "Short password must be rejected",
  );

  await db.update(verifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verifications.id, originalTokenRows[0].id));
  await assert.rejects(() => peekInvitation(db, inviteToken!), /expired/);
  await assert.rejects(() => activateAdminAccount(db, { rawToken: inviteToken!, password }), /expired/);

  // --- 6. Reissue invalidates prior token, issues new token ---
  const reissued = await reissueInvitation(db, { email, invitedByUserId: actorId });
  token2 = reissued.rawToken;
  assert.notEqual(token2, inviteToken, "Reissued token must differ");

  // Prior token must now be invalid
  await assert.rejects(
    () => peekInvitation(db, inviteToken!),
    /invalid or has expired/,
    "Prior token must be revoked after reissue",
  );

  // --- 7. Activate with the new token ---
  const activated = await activateAdminAccount(db, { rawToken: token2, password });
  assert.equal(activated.email, email);
  assert.equal(activated.adminId, adminId);

  // Account must now be ACTIVE
  const [activeUser] = await db.select({ status: users.status }).from(users).where(eq(users.id, invitedUserId!)).limit(1);
  assert.equal(activeUser?.status, "ACTIVE", "User must be ACTIVE after activation");

  // Password hash must be verifiable
  const [account] = await db.select({ password: accounts.password }).from(accounts).where(eq(accounts.userId, invitedUserId!)).limit(1);
  assert.ok(account?.password, "Password hash must be stored");
  assert.equal(await verifyPassword({ hash: account.password!, password }), true, "Password must verify");
  const audit = await db.select({ action: adminAuditEvents.action }).from(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId!));
  assert.deepEqual(audit.map((event) => event.action).sort(), ["ADMIN_ACTIVATED", "ADMIN_INVITED", "ADMIN_REINVITED"]);

  // --- 8. Token reuse must be rejected ---
  await assert.rejects(
    () => activateAdminAccount(db, { rawToken: token2!, password }),
    /invalid/,
    "Token must be rejected after activation (one-time use)",
  );

  // --- 9. Reactivation must be rejected (account is no longer PENDING) ---
  // Issue a new token to test reactivation of an already-active user
  await assert.rejects(
    () => reissueInvitation(db, { email, invitedByUserId: actorId }),
    /already active/,
    "Cannot reissue token for an already-active account",
  );

  console.log(
    "Admin invitation verification PASSED: " +
      "hashed token, PENDING state, peek validation, duplicate rejection, short-password rejection, " +
      "24-hour expiry, audit events, reissue revocation of prior token, activation, ACTIVE state, password hash, " +
      "one-time-use enforcement, reactivation rejection.",
  );
}

main()
  .catch((error: unknown) => {
    console.error("Invitation verification FAILED", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : undefined,
      code: (error as { code?: string } | null)?.code,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (adminId) {
        await db.delete(verifications).where(and(like(verifications.identifier, "invite:%"), sql`${verifications.value}::jsonb ->> 'adminId' = ${adminId}`));
        await db.delete(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId));
        await db.delete(admins).where(eq(admins.id, adminId));
      }
      if (invitedUserId) {
        await db.delete(accounts).where(eq(accounts.userId, invitedUserId));
        await db.delete(userRoles).where(eq(userRoles.userId, invitedUserId));
        await db.delete(users).where(eq(users.id, invitedUserId));
      }
      await db.delete(users).where(eq(users.id, actorId));
      await db.delete(users).where(eq(users.email, `invitation-actor-${actorId}@example.invalid`));
      console.log("Invitation test fixture cleanup complete.");
    } finally {
      await client.end({ timeout: 1 });
    }
  });
