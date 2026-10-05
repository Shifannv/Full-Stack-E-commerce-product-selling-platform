/**
 * verify-super-admin-auth.ts
 *
 * Comprehensive automated verification for local Super Admin authentication & authorization.
 *
 * Verifies:
 * 1. Anonymous access to /api/super-admin/* returns 401
 * 2. Invalid password login returns 401
 * 3. Super Admin login succeeds (POST /api/auth/sign-in/email)
 * 4. Session resolution (/api/me) returns role SUPER_ADMIN
 * 5. Super Admin access to /api/super-admin/summary & /api/super-admin/admins returns 200
 * 6. CUSTOMER role is denied access (returns 403 Forbidden)
 * 7. ADMIN role is denied access (returns 403 Forbidden)
 * 8. Super Admin logout (POST /api/auth/sign-out) succeeds
 * 9. After logout, session is terminated and protected endpoints return 401
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { config, parse } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { app } from "../src";
import { createDb } from "../src/db";
import { accounts, sessions, users } from "../src/db/schema/auth";
import { admins, roles, userRoles } from "../src/db/schema/rbac";
import type { AuthBindings } from "../src/lib/auth/auth";
import { assertLocalOrOptedIn } from "./local-db-guard";

// Dev-local DB overrides .env
config({ path: ".env.dev.local", quiet: true });
config({ path: ".env", quiet: true });
assertLocalOrOptedIn("verify-super-admin-auth");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const vars = parse(readFileSync(".dev.vars"));
const origin = vars.FRONTEND_ORIGIN || "http://127.0.0.1:3000";

const env = {
  ...vars,
  HYPERDRIVE: { connectionString: process.env.DATABASE_URL },
} as unknown as AuthBindings;

const { db, client } = createDb(process.env.DATABASE_URL);

function getCookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!value) throw new Error("Authentication response did not set a session cookie");
  return value;
}

async function request(path: string, init: RequestInit = {}) {
  const options = {
    ...init,
    ...(init.method === "POST" && init.body === undefined ? { body: "{}" } : {}),
    headers: {
      Origin: origin,
      ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  };
  return app.request(new URL(path, vars.BETTER_AUTH_URL).toString(), options, env);
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `Sign-in failed for ${email}`);
  return getCookie(response);
}

const fixtureUserIds: string[] = [];

async function cleanup() {
  if (!fixtureUserIds.length) return;
  await db.delete(sessions).where(inArray(sessions.userId, fixtureUserIds));
  await db.delete(accounts).where(inArray(accounts.userId, fixtureUserIds));
  await db.delete(admins).where(inArray(admins.userId, fixtureUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, fixtureUserIds));
  await db.delete(users).where(inArray(users.id, fixtureUserIds));
}

async function main() {
  console.log("==> Running Super Admin Authentication & RBAC Verification");

  // 1. Health check
  const healthRes = await request("/health");
  assert.equal(healthRes.status, 200, "Health check failed");
  console.log("✓ Health endpoint returned 200");

  // 2. Anonymous access must return 401
  const anonMe = await request("/api/me");
  assert.equal(anonMe.status, 401, "Anonymous /api/me should return 401");
  const anonSummary = await request("/api/super-admin/summary");
  assert.equal(anonSummary.status, 401, "Anonymous /api/super-admin/summary should return 401");
  const anonAdmins = await request("/api/super-admin/admins");
  assert.equal(anonAdmins.status, 401, "Anonymous /api/super-admin/admins should return 401");
  console.log("✓ Anonymous access to Super Admin APIs correctly rejected with 401");

  // 3. Find existing Super Admin
  const [saRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "SUPER_ADMIN"))
    .limit(1);
  assert.ok(saRole, "SUPER_ADMIN role missing in DB");

  const [saUR] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, saRole.id))
    .limit(1);
  assert.ok(saUR, "SUPER_ADMIN user missing in DB");

  const [saUser] = await db
    .select({ id: users.id, email: users.email, status: users.status, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, saUR.userId))
    .limit(1);
  assert.ok(saUser, "SUPER_ADMIN user record not found");
  assert.equal(saUser.status, "ACTIVE", "Super admin must be ACTIVE");

  const superAdminEmail = saUser.email;
  const superAdminPassword = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || "Ownline@2026";

  // 4. Invalid credentials rejected
  const wrongPasswordRes = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: superAdminEmail, password: "wrong-password-12345" }),
  });
  assert.equal(wrongPasswordRes.status, 401, "Incorrect password should return 401");
  console.log("✓ Wrong password rejected with 401");

  // 5. Valid Super Admin Login
  const saCookie = await signIn(superAdminEmail, superAdminPassword);
  console.log("✓ Super Admin login succeeded (POST /api/auth/sign-in/email returned 200 + session cookie)");

  // 6. Verify Session & Roles via /api/me
  const meRes = await request("/api/me", { headers: { Cookie: saCookie } });
  assert.equal(meRes.status, 200, "/api/me should return 200 for active session");
  const meData = (await meRes.json()) as { userId: string; roles: string[] };
  assert.ok(meData.roles.includes("SUPER_ADMIN"), "Actor should have SUPER_ADMIN role");
  console.log("✓ /api/me returned actor with SUPER_ADMIN role");

  // 7. Verify Super Admin APIs
  const summaryRes = await request("/api/super-admin/summary", { headers: { Cookie: saCookie } });
  assert.equal(summaryRes.status, 200, "/api/super-admin/summary returned non-200");
  const adminsRes = await request("/api/super-admin/admins", { headers: { Cookie: saCookie } });
  assert.equal(adminsRes.status, 200, "/api/super-admin/admins returned non-200");
  console.log("✓ /api/super-admin/summary and /api/super-admin/admins return 200 for SUPER_ADMIN");

  // 8. Test CUSTOMER denial
  const testCustomerEmail = `test-cust-${crypto.randomUUID()}@example.invalid`;
  const testCustomerPassword = "CustomerPassword123!";
  const testCustomerUserId = crypto.randomUUID();
  const [customerRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, "CUSTOMER")).limit(1);
  assert.ok(customerRole, "CUSTOMER role exists");
  
  const custHashed = await hashPassword(testCustomerPassword);
  await db.insert(users).values({
    id: testCustomerUserId,
    name: "Test Customer",
    email: testCustomerEmail,
    emailVerified: true,
    status: "ACTIVE",
  });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    userId: testCustomerUserId,
    accountId: testCustomerUserId,
    providerId: "credential",
    password: custHashed,
  });
  await db.insert(userRoles).values({ userId: testCustomerUserId, roleId: customerRole.id });
  fixtureUserIds.push(testCustomerUserId);

  const customerCookie = await signIn(testCustomerEmail, testCustomerPassword);

  const custMe = await request("/api/me", { headers: { Cookie: customerCookie } });
  assert.equal(custMe.status, 200);
  const custMeData = (await custMe.json()) as { roles: string[] };
  assert.ok(custMeData.roles.includes("CUSTOMER"));
  assert.ok(!custMeData.roles.includes("SUPER_ADMIN"));

  const custDenialSummary = await request("/api/super-admin/summary", { headers: { Cookie: customerCookie } });
  assert.equal(custDenialSummary.status, 403, "CUSTOMER accessing /api/super-admin/summary must return 403");
  const custDenialAdmins = await request("/api/super-admin/admins", { headers: { Cookie: customerCookie } });
  assert.equal(custDenialAdmins.status, 403, "CUSTOMER accessing /api/super-admin/admins must return 403");
  console.log("✓ CUSTOMER correctly denied from /api/super-admin/* with 403 Forbidden");

  // 9. Test ADMIN denial
  const testAdminEmail = `test-admin-${crypto.randomUUID()}@example.invalid`;
  const testAdminPassword = "AdminPassword123!";
  const testAdminUserId = crypto.randomUUID();
  const [adminRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, "ADMIN")).limit(1);
  assert.ok(adminRole, "ADMIN role exists");

  const adminHashed = await hashPassword(testAdminPassword);
  await db.insert(users).values({
    id: testAdminUserId,
    name: "Test Admin",
    email: testAdminEmail,
    emailVerified: true,
    status: "ACTIVE",
  });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    userId: testAdminUserId,
    accountId: testAdminUserId,
    providerId: "credential",
    password: adminHashed,
  });
  await db.insert(userRoles).values({ userId: testAdminUserId, roleId: adminRole.id });
  await db.insert(admins).values({ userId: testAdminUserId, status: "ACTIVE" });
  fixtureUserIds.push(testAdminUserId);

  const adminCookie = await signIn(testAdminEmail, testAdminPassword);

  const adminMe = await request("/api/me", { headers: { Cookie: adminCookie } });
  assert.equal(adminMe.status, 200);
  const adminMeData = (await adminMe.json()) as { roles: string[] };
  assert.ok(adminMeData.roles.includes("ADMIN"));
  assert.ok(!adminMeData.roles.includes("SUPER_ADMIN"));

  const adminDenialSummary = await request("/api/super-admin/summary", { headers: { Cookie: adminCookie } });
  assert.equal(adminDenialSummary.status, 403, "ADMIN accessing /api/super-admin/summary must return 403");
  const adminDenialAdmins = await request("/api/super-admin/admins", { headers: { Cookie: adminCookie } });
  assert.equal(adminDenialAdmins.status, 403, "ADMIN accessing /api/super-admin/admins must return 403");
  console.log("✓ ADMIN correctly denied from /api/super-admin/* with 403 Forbidden");

  // 10. Test Logout
  const logoutRes = await request("/api/auth/sign-out", {
    method: "POST",
    headers: { Cookie: saCookie },
  });
  assert.equal(logoutRes.status, 200, "Super Admin sign-out failed");
  console.log("✓ Super Admin logout succeeded (POST /api/auth/sign-out returned 200)");

  // 11. Post-logout protected route check
  const postLogoutMe = await request("/api/me", { headers: { Cookie: saCookie } });
  assert.equal(postLogoutMe.status, 401, "Post-logout /api/me should return 401");
  const postLogoutSummary = await request("/api/super-admin/summary", { headers: { Cookie: saCookie } });
  assert.equal(postLogoutSummary.status, 401, "Post-logout /api/super-admin/summary should return 401");
  console.log("✓ Protected endpoints return 401 after logout");

  console.log("\n==> ALL SUPER ADMIN AUTHENTICATION & RBAC CHECKS PASSED!");
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } finally {
      await client.end({ timeout: 1 });
    }
  });
