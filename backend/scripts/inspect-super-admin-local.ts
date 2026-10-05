/**
 * inspect-super-admin-local.ts
 *
 * Diagnostic-only: checks whether a SUPER_ADMIN user exists in the local dev DB.
 * Reads .env.dev.local first (local DB wins), falls back to .env.
 * Never prints credentials. Safe – read-only queries.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { accounts, users } from "../src/db/schema/auth";
import { roles, userRoles } from "../src/db/schema/rbac";
import { assertLocalOrOptedIn } from "./local-db-guard";

// Dev-local DB overrides .env (same precedence as dev.mjs).
config({ path: ".env.dev.local", quiet: true });
config({ path: ".env", quiet: true });
assertLocalOrOptedIn("inspect-super-admin-local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  try {
    const dbUrl = process.env.DATABASE_URL!;
    console.log("DB host:", new URL(dbUrl).hostname);

    // 1. Roles
    const roleRows = await db.select({ name: roles.name }).from(roles);
    console.log("Roles:", roleRows.map((r) => r.name));

    // 2. SUPER_ADMIN role
    const [saRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "SUPER_ADMIN"))
      .limit(1);

    if (!saRole) {
      console.log("SUPER_ADMIN role: MISSING — run 'npm run seed:rbac' first");
      return;
    }
    console.log("SUPER_ADMIN role: exists");

    // 3. SUPER_ADMIN user
    const [saUserRole] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, saRole.id))
      .limit(1);

    if (!saUserRole) {
      console.log("SUPER_ADMIN user: NONE — bootstrap script has not been run");
      return;
    }

    const [saUser] = await db
      .select({ status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, saUserRole.userId))
      .limit(1);

    console.log("SUPER_ADMIN user: EXISTS");
    console.log("  status:", saUser?.status ?? "UNKNOWN");
    console.log("  deletedAt:", saUser?.deletedAt ?? null);

    // 4. Credential account
    const [credAcc] = await db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, saUserRole.userId))
      .limit(1);

    console.log(
      "  credential account:",
      credAcc?.providerId === "credential" ? "HAS credential (password set)" : "NO credential",
    );
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((e: unknown) => {
  console.error("Inspect failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
