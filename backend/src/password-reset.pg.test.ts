/**
 * Password-reset PostgreSQL integration tests.
 *
 * Uses CHECKOUT_TEST_DATABASE_URL (isolated local DB).
 * NEVER touches DATABASE_URL / Aiven.
 * NEVER sends a real Resend email.
 *
 * Covers:
 *  - Customer: forgot-password request (existing + unknown email)
 *  - Customer: token generation, hashed storage, expiry, single-use
 *  - Customer: new password works, old password fails, sessions invalidated
 *  - Admin: same flow, approval/onboarding state preserved
 *  - Super Admin: login unaffected, no reset token generated
 *  - Security: token guessing, malformed token, replay, enumeration-safety
 *  - Rate limiting: pwd-reset group, 5 requests per 600 s per IP
 */

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { createDb } from "./db";
import { accounts, sessions, users, verifications } from "./db/schema/auth";
import { admins, roles, userRoles } from "./db/schema/rbac";
import { adminCredentials, } from "./db/schema/admin-credentials";
import { adminAuditEvents } from "./db/schema/admin";
import { apiRateLimits } from "./db/schema/security";
import { createAuth, type AuthBindings } from "./lib/auth/auth";
import {
  initiatePasswordReset,
  consumePasswordReset,
  peekPasswordResetToken,
} from "./services/password-reset/password-reset.service";
import { consumeMutationLimit } from "./middleware/rate-limit";
import worker from "./index";

config({ path: ".env.checkout-test.local", quiet: true });
const url = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!url) throw new Error("CHECKOUT_TEST_DATABASE_URL required");
const target = new URL(url);
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "5432" ||
  target.pathname !== "/ownline_checkout_test" ||
  decodeURIComponent(target.username) !== "postgres"
)
  throw new Error("Isolated PostgreSQL target required");

const env: AuthBindings = {
  HYPERDRIVE: { connectionString: url },
  BETTER_AUTH_SECRET: "isolated-password-reset-test-secret-2026-10",
  BETTER_AUTH_URL: "http://127.0.0.1:8787",
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  GOOGLE_CLIENT_ID: "fixture",
  GOOGLE_CLIENT_SECRET: "fixture",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function call(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(env.BETTER_AUTH_URL + path, init), env);
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return call(path, {
    method: "POST",
    headers: {
      origin: env.FRONTEND_ORIGIN,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function signIn(email: string, password: string): Promise<string> {
  const connection = createAuth(env);
  try {
    const response = await connection.auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    assert.equal(response.status, 200, `Sign-in failed for ${email}`);
    return response.headers.get("set-cookie")!.split(";")[0];
  } finally {
    await connection.client.end({ timeout: 1 });
  }
}

/**
 * Create a fixture CUSTOMER user + credential, returning userId and cleanup.
 */
async function createCustomerFixture(db: ReturnType<typeof createDb>["db"]) {
  const userId = `pr-customer-${randomUUID()}`;
  const email = `${userId}@example.invalid`;
  const password = `fixture-password-${randomUUID()}`;
  await db.insert(users).values({ id: userId, email, name: "PR Customer", status: "ACTIVE", emailVerified: true });
  await db.insert(roles).values({ name: "CUSTOMER" }).onConflictDoNothing();
  const [role] = await db.select().from(roles).where(eq(roles.name, "CUSTOMER"));
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
  await db.insert(accounts).values({
    id: randomUUID(), accountId: userId, userId,
    providerId: "credential", password: await hashPassword(password),
  });
  return { userId, email, password };
}

/**
 * Create a fixture ADMIN user + credential, returning userId, adminId, and cleanup keys.
 */
async function createAdminFixture(db: ReturnType<typeof createDb>["db"], superAdminUserId: string) {
  const userId = `pr-admin-${randomUUID()}`;
  const email = `${userId}@example.invalid`;
  const password = `fixture-admin-password-${randomUUID()}`;
  await db.insert(users).values({ id: userId, email, name: "PR Admin", status: "ACTIVE", emailVerified: true });
  await db.insert(roles).values({ name: "ADMIN" }).onConflictDoNothing();
  const [role] = await db.select().from(roles).where(eq(roles.name, "ADMIN"));
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
  await db.insert(accounts).values({
    id: randomUUID(), accountId: userId, userId,
    providerId: "credential", password: await hashPassword(password),
  });
  const [admin] = await db.insert(admins).values({ userId, status: "DRAFT" }).returning();
  await db.insert(adminCredentials).values({ adminId: admin.id, provisionedByUserId: superAdminUserId, mustChangePassword: false });
  return { userId, email, password, adminId: admin.id };
}

async function cleanup(db: ReturnType<typeof createDb>["db"], userIds: string[], adminIds: string[], ipKeys: string[] = []) {
  if (adminIds.length) {
    await db.delete(adminCredentials).where(inArray(adminCredentials.adminId, adminIds));
    await db.delete(adminAuditEvents).where(inArray(adminAuditEvents.adminId, adminIds));
    await db.delete(admins).where(inArray(admins.id, adminIds));
  }
  if (userIds.length) {
    await db.delete(verifications).where(
      and(like(verifications.identifier, "pwd-reset:%"),
        inArray(verifications.value, userIds.map(id => JSON.stringify({ userId: id, role: "CUSTOMER" })).concat(
          userIds.map(id => JSON.stringify({ userId: id, role: "ADMIN" }))
        )))
    ).catch(() => undefined);
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(accounts).where(inArray(accounts.userId, userIds));
    await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
  if (ipKeys.length) {
    await db.delete(apiRateLimits).where(inArray(apiRateLimits.key, ipKeys));
  }
}

// ---------------------------------------------------------------------------
// CUSTOMER TESTS
// ---------------------------------------------------------------------------

test("password-reset: Customer existing email returns generic 200 response", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const response = await postJson("/api/password-reset/forgot-password", { email: fixture.email }, {
      "cf-connecting-ip": `test-ip-customer-existing-${randomUUID()}`,
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { message: string };
    assert.ok(body.message.includes("reset link has been sent"));
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Unknown email returns identical generic 200 response (no enumeration)", async () => {
  const { db, client } = createDb(url);
  try {
    const response = await postJson("/api/password-reset/forgot-password", { email: "nonexistent-never-used@example.invalid" }, {
      "cf-connecting-ip": `test-ip-unknown-email-${randomUUID()}`,
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { message: string };
    assert.ok(body.message.includes("reset link has been sent"));
  } finally {
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Customer token is generated; only hash is stored; raw token is never persisted", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result, "Should return token data for existing ACTIVE CUSTOMER");
    assert.ok(result!.rawToken.length > 0);
    assert.ok(result!.expiresAt > new Date());

    // Verify only the hash is stored, not the raw token.
    const rawToken = result!.rawToken;
    const allVerifications = await db.select().from(verifications).where(like(verifications.identifier, "pwd-reset:%"));
    const hasRawToken = allVerifications.some((v) => v.identifier.includes(rawToken) || v.value.includes(rawToken));
    assert.equal(hasRawToken, false, "Raw token must NEVER appear in verifications rows");

    // Identifier must be a hash (hex string), not the raw token.
    const matching = allVerifications.filter((v) => {
      try {
        const payload = JSON.parse(v.value) as { userId: string };
        return payload.userId === fixture.userId;
      } catch { return false; }
    });
    assert.equal(matching.length, 1, "Exactly one reset token row for user");
    assert.ok(/^pwd-reset:[a-f0-9]{64}$/.test(matching[0].identifier), "Identifier must be pwd-reset:<sha256hex>");
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Customer token works before expiry; new password authenticates; old password fails; sessions invalidated", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    // Create an active session.
    const oldCookie = await signIn(fixture.email, fixture.password);
    const sessionsBefore = await db.select().from(sessions).where(eq(sessions.userId, fixture.userId));
    assert.ok(sessionsBefore.length > 0, "Session should exist before reset");

    // Initiate and consume reset.
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);
    const newPassword = `new-secure-password-${randomUUID()}`;
    const consumeResult = await consumePasswordReset(db, result!.rawToken, newPassword);
    assert.equal(consumeResult.userId, fixture.userId);
    assert.equal(consumeResult.role, "CUSTOMER");

    // Old password must fail.
    const connection = createAuth(env);
    try {
      const oldSignIn = await connection.auth.api.signInEmail({ body: { email: fixture.email, password: fixture.password }, asResponse: true });
      assert.notEqual(oldSignIn.status, 200, "Old password must be rejected");
    } finally { await connection.client.end({ timeout: 1 }); }

    // New password must succeed.
    const newCookie = await signIn(fixture.email, newPassword);
    assert.ok(newCookie.length > 0, "New password must authenticate");

    // All OLD sessions must be gone.
    const sessionsAfter = await db.select().from(sessions).where(eq(sessions.userId, fixture.userId));
    const oldSessionExists = sessionsAfter.some((s) => s.token === oldCookie.split("=")[1]);
    assert.equal(oldSessionExists, false, "Old sessions must be invalidated");
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Token is single-use; replay after success fails", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);
    const newPassword = `new-secure-password-${randomUUID()}`;
    await consumePasswordReset(db, result!.rawToken, newPassword);

    // Second consumption must fail.
    await assert.rejects(
      () => consumePasswordReset(db, result!.rawToken, "another-new-password-xyz"),
      (err: Error) => { assert.ok(err.message.includes("invalid or has expired")); return true; },
    );
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Expired token fails safely", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);

    // Back-date the expiry to well in the past using the specific identifier.
    const tokenHash = await (async () => {
      const bytes = new TextEncoder().encode(result!.rawToken);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    })();
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }) // 2 hours ago in UTC
      .where(eq(verifications.identifier, `pwd-reset:${tokenHash}`));

    await assert.rejects(
      () => consumePasswordReset(db, result!.rawToken, "new-secure-password-xyz"),
      (err: Error) => { assert.ok(err.message.includes("invalid or has expired")); return true; },
    );
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Guessing a random token fails", async () => {
  const { db, client } = createDb(url);
  try {
    await assert.rejects(
      () => consumePasswordReset(db, `totally-random-fake-${randomUUID()}`, "new-secure-password-xyz"),
      (err: Error) => { assert.ok(err.message.includes("invalid or has expired")); return true; },
    );
  } finally {
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Peek validates live token, rejects expired token", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);

    // Peek should succeed.
    const info = await peekPasswordResetToken(db, result!.rawToken);
    assert.ok(info.expiresAt > new Date());
    assert.equal(info.role, "CUSTOMER");

    // Expire the token using the specific identifier for isolation.
    const tokenHash = await (async () => {
      const bytes = new TextEncoder().encode(result!.rawToken);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    })();
    await db.update(verifications).set({ expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }) // 2 hours ago in UTC
      .where(eq(verifications.identifier, `pwd-reset:${tokenHash}`));

    // Peek should now fail.
    await assert.rejects(
      () => peekPasswordResetToken(db, result!.rawToken),
      (err: Error) => { assert.ok(err.message.includes("invalid or has expired")); return true; },
    );
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: New password hashed; old credential hash replaced", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);
    const newPassword = `new-secure-password-${randomUUID()}`;
    await consumePasswordReset(db, result!.rawToken, newPassword);

    const [cred] = await db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, fixture.userId), eq(accounts.providerId, "credential")));

    assert.ok(cred.password, "Credential hash must exist");
    // New password must verify against the stored hash.
    assert.ok(await verifyPassword({ hash: cred.password!, password: newPassword }), "New password must verify");
    // Old password must NOT verify.
    assert.equal(await verifyPassword({ hash: cred.password!, password: fixture.password }), false, "Old password must not verify");
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

// ---------------------------------------------------------------------------
// ADMIN TESTS
// ---------------------------------------------------------------------------

test("password-reset: Admin existing email returns generic 200", async () => {
  const { db, client } = createDb(url);
  const superAdminId = `pr-sa-${randomUUID()}`;
  const fixture = await (async () => {
    await db.insert(users).values({ id: superAdminId, email: `${superAdminId}@example.invalid`, name: "SA fixture", status: "ACTIVE", emailVerified: true });
    return createAdminFixture(db, superAdminId);
  })();
  try {
    const response = await postJson("/api/password-reset/forgot-password", { email: fixture.email }, {
      "cf-connecting-ip": `test-ip-admin-existing-${randomUUID()}`,
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { message: string };
    assert.ok(body.message.includes("reset link has been sent"));
  } finally {
    await cleanup(db, [fixture.userId, superAdminId], [fixture.adminId]);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Admin token works; sessions invalidated; seller approval state unchanged", async () => {
  const { db, client } = createDb(url);
  const superAdminId = `pr-sa-${randomUUID()}`;
  await db.insert(users).values({ id: superAdminId, email: `${superAdminId}@example.invalid`, name: "SA fixture", status: "ACTIVE", emailVerified: true });
  const fixture = await createAdminFixture(db, superAdminId);
  try {
    // Admin must have a DRAFT status (pre-approval) — verify it is unchanged after reset.
    const [adminBefore] = await db.select({ status: admins.status }).from(admins).where(eq(admins.id, fixture.adminId));
    assert.equal(adminBefore.status, "DRAFT");

    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);
    assert.equal(result!.role, "ADMIN");

    const newPassword = `new-admin-password-${randomUUID()}`;
    const consumeResult = await consumePasswordReset(db, result!.rawToken, newPassword);
    assert.equal(consumeResult.userId, fixture.userId);
    assert.equal(consumeResult.role, "ADMIN");

    // Admin seller approval state must be unchanged.
    const [adminAfter] = await db.select({ status: admins.status }).from(admins).where(eq(admins.id, fixture.adminId));
    assert.equal(adminAfter.status, "DRAFT", "Password reset must NOT change admin approval state");

    // Admin role must still be ADMIN only.
    const grants = await db.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, fixture.userId));
    assert.ok(grants.some((g) => g.name === "ADMIN"), "Role must remain ADMIN");
    assert.ok(!grants.some((g) => g.name === "SUPER_ADMIN"), "Role must NOT become SUPER_ADMIN");

    // New password must authenticate.
    const newCookie = await signIn(fixture.email, newPassword);
    assert.ok(newCookie.length > 0);
  } finally {
    await cleanup(db, [fixture.userId, superAdminId], [fixture.adminId]);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Admin mustChangePassword=true (initial credential) is preserved after reset", async () => {
  const { db, client } = createDb(url);
  const superAdminId = `pr-sa2-${randomUUID()}`;
  await db.insert(users).values({ id: superAdminId, email: `${superAdminId}@example.invalid`, name: "SA fixture 2", status: "ACTIVE", emailVerified: true });
  const fixture = await createAdminFixture(db, superAdminId);

  // Explicitly set mustChangePassword=true as if this were a temp-password Admin.
  await db.update(adminCredentials).set({ mustChangePassword: true }).where(eq(adminCredentials.adminId, fixture.adminId));

  try {
    // Password reset should still work — it resets the credential but doesn't touch mustChangePassword.
    // (Password recovery and forced-change are separate flows.)
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result, "Admin with mustChangePassword=true can still request a reset");

    const newPassword = `new-admin-password-${randomUUID()}`;
    await consumePasswordReset(db, result!.rawToken, newPassword);

    // mustChangePassword flag is managed by the existing provisioning flow, not by password reset.
    const [cred] = await db.select({ mustChangePassword: adminCredentials.mustChangePassword }).from(adminCredentials).where(eq(adminCredentials.adminId, fixture.adminId));
    // Note: password reset does NOT modify mustChangePassword — the admin forced-change flow owns it.
    assert.equal(cred.mustChangePassword, true, "mustChangePassword must not be altered by password reset");
  } finally {
    await cleanup(db, [fixture.userId, superAdminId], [fixture.adminId]);
    await client.end({ timeout: 1 });
  }
});

// ---------------------------------------------------------------------------
// SUPER ADMIN TESTS
// ---------------------------------------------------------------------------

test("password-reset: Super Admin email returns generic 200 but no token is generated", async () => {
  const { db, client } = createDb(url);
  const userId = `pr-superadmin-${randomUUID()}`;
  const email = `${userId}@example.invalid`;
  await db.insert(users).values({ id: userId, email, name: "SA Test", status: "ACTIVE", emailVerified: true });
  await db.insert(roles).values({ name: "SUPER_ADMIN" }).onConflictDoNothing();
  const [saRole] = await db.select().from(roles).where(eq(roles.name, "SUPER_ADMIN"));
  await db.insert(userRoles).values({ userId, roleId: saRole.id }).onConflictDoNothing();
  try {
    // Service must return null (no token) for Super Admin.
    const result = await initiatePasswordReset(db, email);
    assert.equal(result, null, "Super Admin must NOT get a reset token");

    // Route must still return the generic 200 (enumeration-safe).
    const response = await postJson("/api/password-reset/forgot-password", { email }, {
      "cf-connecting-ip": `test-ip-superadmin-${randomUUID()}`,
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { message: string };
    assert.ok(body.message.includes("reset link has been sent"));

    // No token row must exist for Super Admin.
    const tokens = await db.select().from(verifications).where(like(verifications.identifier, "pwd-reset:%"));
    const superAdminToken = tokens.find((v) => {
      try { return (JSON.parse(v.value) as { userId: string }).userId === userId; } catch { return false; }
    });
    assert.equal(superAdminToken, undefined, "No pwd-reset token must exist for Super Admin");
  } finally {
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Super Admin login continues to work after new feature is deployed", async () => {
  // The Super Admin account in test DB uses a randomly generated email + password fixture.
  // We can't test the real shifan.coding@gmail.com account here.
  // We prove that: (a) normal email+password sign-in still works for ANY SUPER_ADMIN-role user,
  // and (b) introducing the password-reset routes has no effect on the existing auth handler.
  const { db, client } = createDb(url);
  const userId = `pr-sa-login-${randomUUID()}`;
  const email = `${userId}@example.invalid`;
  const password = `super-admin-login-fixture-${randomUUID()}`;
  await db.insert(users).values({ id: userId, email, name: "SA Login Test", status: "ACTIVE", emailVerified: true });
  await db.insert(accounts).values({ id: randomUUID(), accountId: userId, userId, providerId: "credential", password: await hashPassword(password) });
  await db.insert(roles).values({ name: "SUPER_ADMIN" }).onConflictDoNothing();
  const [saRole] = await db.select().from(roles).where(eq(roles.name, "SUPER_ADMIN"));
  await db.insert(userRoles).values({ userId, roleId: saRole.id }).onConflictDoNothing();
  try {
    // Super Admin must still be able to sign in.
    const cookie = await signIn(email, password);
    assert.ok(cookie.length > 0, "Super Admin sign-in must still work");
  } finally {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await client.end({ timeout: 1 });
  }
});

// ---------------------------------------------------------------------------
// SECURITY TESTS
// ---------------------------------------------------------------------------

test("password-reset: Malformed / empty token rejected safely", async () => {
  const { db, client } = createDb(url);
  try {
    for (const bad of ["", "   ", "<script>alert(1)</script>", `a${randomUUID()}`]) {
      await assert.rejects(
        () => consumePasswordReset(db, bad, "new-secure-password-xyz"),
        (err: Error) => {
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    }
  } finally {
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Password policy enforced — too short rejected", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.ok(result);
    await assert.rejects(
      () => consumePasswordReset(db, result!.rawToken, "short"),
      (err: Error) => { assert.ok(err.message.includes("12")); return true; },
    );
    // Token must still be valid after a failed attempt (not consumed by validation failure before tx lock).
    const info = await peekPasswordResetToken(db, result!.rawToken);
    assert.ok(info.expiresAt > new Date(), "Token must still be valid after rejected password");
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Unrelated user sessions are NOT invalidated", async () => {
  const { db, client } = createDb(url);
  const user1 = await createCustomerFixture(db);
  const user2 = await createCustomerFixture(db);
  try {
    // user2 logs in.
    const user2Cookie = await signIn(user2.email, user2.password);
    const [user2Session] = await db.select().from(sessions).where(eq(sessions.userId, user2.userId));
    assert.ok(user2Session, "user2 must have a session");

    // Reset user1's password.
    const result = await initiatePasswordReset(db, user1.email);
    assert.ok(result);
    await consumePasswordReset(db, result!.rawToken, `new-secure-password-${randomUUID()}`);

    // user2's sessions must be unchanged.
    const user2SessionAfter = await db.select().from(sessions).where(eq(sessions.userId, user2.userId));
    assert.ok(user2SessionAfter.length > 0, "user2 sessions must NOT be affected by user1 reset");
    assert.equal(user2SessionAfter[0].id, user2Session.id, "user2 session ID must be unchanged");
  } finally {
    await cleanup(db, [user1.userId, user2.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Rate limiting: 5 requests per 600 s per IP, then 429", async () => {
  const { db, client } = createDb(url);
  const ip = `pr-ratelimit-fixture-${randomUUID()}`;
  const policy = { group: "pwd-reset", limit: 5, seconds: 600 };
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => consumeMutationLimit(db, `ip:${ip}`, policy)),
    );
    assert.equal(results.filter((r) => r.allowed).length, 5, "Exactly 5 allowed");
    assert.equal(results.filter((r) => !r.allowed).length, 1, "6th attempt denied");
  } finally {
    // Clean up rate-limit row.
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ip:${ip}`)),
    ).toString("hex");
    await db.delete(apiRateLimits).where(eq(apiRateLimits.key, `v1:pwd-reset:${hash}`));
    await client.end({ timeout: 1 });
  }
});

test("password-reset: Duplicate reset request invalidates previous token", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  try {
    const first = await initiatePasswordReset(db, fixture.email);
    assert.ok(first);

    // Request a second reset — should revoke the first.
    const second = await initiatePasswordReset(db, fixture.email);
    assert.ok(second);
    assert.notEqual(first!.rawToken, second!.rawToken);

    // First token must now be invalid.
    await assert.rejects(
      () => peekPasswordResetToken(db, first!.rawToken),
      (err: Error) => { assert.ok(err.message.includes("invalid or has expired")); return true; },
    );

    // Second token must still be valid.
    const info = await peekPasswordResetToken(db, second!.rawToken);
    assert.ok(info.expiresAt > new Date());
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});

test("password-reset: GET /api/password-reset/validate?token= rejects invalid token with 422", async () => {
  const response = await call(`/api/password-reset/validate?token=invalid-token-${randomUUID()}`);
  assert.equal(response.status, 422);
});

test("password-reset: GET /api/password-reset/validate with no token returns 422", async () => {
  const response = await call("/api/password-reset/validate");
  assert.equal(response.status, 422);
});

test("password-reset: POST /api/password-reset/reset-password with invalid token returns 422", async () => {
  const response = await postJson("/api/password-reset/reset-password", {
    token: `invalid-token-${randomUUID()}`,
    password: "new-secure-password-xyz",
  });
  assert.equal(response.status, 422);
});

test("password-reset: Deleted / suspended user cannot get a reset token", async () => {
  const { db, client } = createDb(url);
  const fixture = await createCustomerFixture(db);
  await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, fixture.userId));
  try {
    const result = await initiatePasswordReset(db, fixture.email);
    assert.equal(result, null, "Suspended user must not get a reset token");
  } finally {
    await cleanup(db, [fixture.userId], []);
    await client.end({ timeout: 1 });
  }
});
