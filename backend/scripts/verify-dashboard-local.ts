import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { createDb } from "../src/db";
import { users, accounts, sessions } from "../src/db/schema/auth";
import { roles, userRoles } from "../src/db/schema/rbac";
import { provisionCredentialUser } from "../src/services/admin/provision.service";

const testEnv = parse(readFileSync(".env.checkout-test.local"));
const testUrl = testEnv.CHECKOUT_TEST_DATABASE_URL;
assert.ok(testUrl);
const target = new URL(testUrl);
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.port, "5432");
assert.equal(target.pathname, "/ownline_checkout_test");
console.log("Verified database target:", target.hostname, target.port, target.pathname);
const dev = new URL(parse(readFileSync(".env.dev.local")).DATABASE_URL);
console.log("Current dev selection:", dev.hostname, dev.port, dev.pathname);

async function main() {
  if (process.argv.includes("--worker")) {
    const vars = parse(readFileSync(".dev.vars"));
    assert.equal(vars.BETTER_AUTH_URL, "http://127.0.0.1:8787");
    assert.equal(vars.FRONTEND_ORIGIN, "http://127.0.0.1:3000");
    const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1", "--port", "8787"], {
      stdio: "inherit",
      env: { ...process.env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: testUrl, WRANGLER_SEND_METRICS: "false" },
    });
    child.on("exit", (code) => { process.exitCode = code ?? 1; });
    return;
  }
  const { db, client } = createDb(testUrl);
  try {
    const owners = await db.select({ id: users.id, verified: users.emailVerified, status: users.status }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).innerJoin(users, eq(users.id, userRoles.userId)).where(eq(roles.name, "SUPER_ADMIN"));
    const demo = await db.select({ verified: users.emailVerified, status: users.status }).from(users).where(eq(users.id, "tees-demo-seed-user"));
    const demoRoles = await db.select({ role: roles.name }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, "tees-demo-seed-user"));
    const credentials = await db.select({ provider: accounts.providerId }).from(accounts).where(eq(accounts.userId, "tees-demo-seed-user"));
    console.log(JSON.stringify({ superAdminCount: owners.length, demo, demoRoles, credentials }));
    if (process.argv.includes("--verify")) {
      assert.equal(owners.length, 0, "Existing Super Admin found; refusing to replace it");
      assert.equal(demo[0]?.status, "ACTIVE");
      assert.deepEqual(demoRoles.map((row) => row.role), ["ADMIN"]);
      const source = readFileSync("scripts/setup-tees-demo-auth.ts", "utf8");
      const adminPassword = source.match(/DEMO_ADMIN_PASSWORD = "([^"]+)"/)?.[1];
      const adminEmail = source.match(/DEMO_ADMIN_EMAIL = "([^"]+)"/)?.[1];
      assert.ok(adminPassword && adminEmail);
      const before = await db.execute(sql`select current_database() as database, (select count(*)::int from users) as users, (select count(*)::int from accounts) as accounts, (select count(*)::int from user_roles) as grants`);
      assert.equal(before[0].database, "ownline_checkout_test");
      const oldSessions = new Set((await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, "tees-demo-seed-user"))).map((row) => row.id));
      const ownerPassword = randomBytes(24).toString("base64url");
      const ownerEmail = `dashboard-verify-${Date.now()}@example.invalid`;
      let ownerId: string | undefined;
      try {
        const owner = await provisionCredentialUser(db, { email: ownerEmail, name: "Local Dashboard Verification", password: ownerPassword }, "SUPER_ADMIN");
        ownerId = owner.userId;
        console.log("Temporary local Super Admin created through existing provisioning service; credentials remain in memory.");
        await new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, ["scripts/verify-dashboard-browser.mjs"], { stdio: ["pipe", "inherit", "inherit"] });
          child.stdin.end(JSON.stringify({ admin: { email: adminEmail, password: adminPassword }, owner: { email: ownerEmail, password: ownerPassword } }));
          child.on("error", reject);
          child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Browser verification failed (${code})`)));
        });
      } finally {
        if (ownerId) await db.transaction(async (tx) => {
          await tx.delete(sessions).where(eq(sessions.userId, ownerId!));
          await tx.delete(accounts).where(eq(accounts.userId, ownerId!));
          await tx.delete(userRoles).where(eq(userRoles.userId, ownerId!));
          await tx.delete(users).where(eq(users.id, ownerId!));
        });
        const newSessions = (await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, "tees-demo-seed-user"))).filter((row) => !oldSessions.has(row.id));
        if (newSessions.length) await db.delete(sessions).where(inArray(sessions.id, newSessions.map((row) => row.id)));
        const after = await db.execute(sql`select current_database() as database, (select count(*)::int from users) as users, (select count(*)::int from accounts) as accounts, (select count(*)::int from user_roles) as grants`);
        assert.deepEqual([...after], [...before], "Fixture cleanup must restore baseline counts");
        console.log("Cleanup PASS: temporary Super Admin removed; user/account/role counts restored; existing Admin retained.");
      }
    }
  } finally { await client.end({ timeout: 2 }); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
