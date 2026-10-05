/**
 * inspect-super-admin-account.ts
 *
 * Read-only: checks the exact account_id and provider_id for the SUPER_ADMIN credential.
 * This validates the Better Auth sign-in condition:
 *   providerId === "credential" && accountId === user.id
 * Never prints password hash.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { accounts, users } from "../src/db/schema/auth";
import { roles, userRoles } from "../src/db/schema/rbac";
import { assertLocalOrOptedIn } from "./local-db-guard";

config({ path: ".env.dev.local", quiet: true });
config({ path: ".env", quiet: true });
assertLocalOrOptedIn("inspect-super-admin-account");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  try {
    const [saRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "SUPER_ADMIN"))
      .limit(1);
    if (!saRole) { console.log("SUPER_ADMIN role: MISSING"); return; }

    const [saUR] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, saRole.id))
      .limit(1);
    if (!saUR) { console.log("SUPER_ADMIN user: NONE"); return; }

    const userId = saUR.userId;

    const [u] = await db
      .select({ id: users.id, emailVerified: users.emailVerified, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!u) { console.log("User record: MISSING"); return; }

    console.log("User ID (prefix):", userId.slice(0, 8) + "...");
    console.log("emailVerified:", u.emailVerified);
    console.log("status:", u.status);

    // Check ALL accounts for this user
    const accs = await db
      .select({
        providerId: accounts.providerId,
        accountId: accounts.accountId,
        hasPassword: accounts.password,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    console.log("Account count:", accs.length);
    for (const acc of accs) {
      const accountIdMatchesUserId = acc.accountId === userId;
      console.log("  provider:", acc.providerId);
      console.log("  accountId matches userId:", accountIdMatchesUserId, "(Better Auth requires this for credential sign-in)");
      console.log("  password hash present:", acc.hasPassword ? "YES" : "NO");
    }
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((e: unknown) => {
  console.error("Inspect failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
