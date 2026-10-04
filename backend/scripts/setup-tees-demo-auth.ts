/**
 * Adds email/password credentials and ADMIN role to the existing tees-demo-seed-user.
 *
 * Run:     npx tsx scripts/setup-tees-demo-auth.ts
 * Cleanup: npx tsx scripts/setup-tees-demo-auth.ts --cleanup
 *
 * Safe: only writes to ownline_checkout_test; aborts if CHECKOUT_TEST_DATABASE_URL
 * is not the local test DB.
 *
 * The password is DEMO-ONLY and only valid in the local test DB.
 */

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "../src/db/index.js";
import { accounts, users } from "../src/db/schema/auth.js";
import { roles, userRoles } from "../src/db/schema/rbac.js";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) { console.error("ABORT: CHECKOUT_TEST_DATABASE_URL not set"); process.exit(1); }
const parsedUrl = new URL(testUrl);
if (
  parsedUrl.hostname !== "127.0.0.1" ||
  parsedUrl.port !== "5432" ||
  parsedUrl.pathname !== "/ownline_checkout_test" ||
  decodeURIComponent(parsedUrl.username) !== "postgres"
) {
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL must point to postgres@127.0.0.1:5432/ownline_checkout_test");
  process.exit(1);
}
if (process.env.DATABASE_URL) {
  const shared = new URL(process.env.DATABASE_URL);
  if (parsedUrl.host === shared.host && parsedUrl.pathname === shared.pathname) {
    console.error("ABORT: test URL and DATABASE_URL are the same");
    process.exit(1);
  }
}

const SEED_USER_ID = "tees-demo-seed-user";
// Demo-only password — only valid in local test DB, never stored in source
export const DEMO_ADMIN_PASSWORD = "TeesDemo-LocalOnly-2026!";
export const DEMO_ADMIN_EMAIL = "tees-demo-seed@example.invalid";

async function main() {
  const { db, client } = createDb(testUrl!);
  const doCleanup = process.argv.includes("--cleanup");
  try {
    // Verify the user exists
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, SEED_USER_ID))
      .limit(1);
    if (!user) {
      console.error("ABORT: tees-demo-seed-user not found. Run seed-tees-demo.ts first.");
      process.exitCode = 1;
      return;
    }

    if (doCleanup) {
      console.log("Removing auth credentials from tees-demo-seed-user…");
      await db.transaction(async (tx) => {
        await tx.delete(userRoles).where(eq(userRoles.userId, SEED_USER_ID));
        await tx.delete(accounts).where(eq(accounts.userId, SEED_USER_ID));
      });
      console.log("Auth cleanup complete.");
      return;
    }

    // Check if already set up
    const [existingAccount] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, SEED_USER_ID))
      .limit(1);
    if (existingAccount) {
      console.log("Auth credentials already present for tees-demo-seed-user.");
      return;
    }

    // Find ADMIN role
    const [adminRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "ADMIN"))
      .limit(1);
    assert.ok(adminRole, "ADMIN role not found in test DB — run seed:rbac first");

    console.log("Adding email/password credentials and ADMIN role to tees-demo-seed-user…");
    const hashed = await hashPassword(DEMO_ADMIN_PASSWORD);

    await db.transaction(async (tx) => {
      // Better Auth credential sign-in requires emailVerified=true
      await tx.update(users).set({ emailVerified: true }).where(eq(users.id, SEED_USER_ID));
      // Add email/password account (Better Auth credential provider)
      await tx.insert(accounts).values({
        id: randomUUID(),
        userId: SEED_USER_ID,
        accountId: SEED_USER_ID,
        providerId: "credential",
        password: hashed,
      });
      // Assign ADMIN role
      await tx.insert(userRoles).values({ userId: SEED_USER_ID, roleId: adminRole.id });
    });

    console.log("Done.");
    console.log(`  email   : ${DEMO_ADMIN_EMAIL}`);
    console.log(`  password: ${DEMO_ADMIN_PASSWORD}  (local test DB only)`);
    console.log(`  role    : ADMIN`);
  } finally {
    await client.end({ timeout: 2 });
  }
}

main().catch((err: unknown) => {
  console.error("setup-tees-demo-auth FAILED:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
