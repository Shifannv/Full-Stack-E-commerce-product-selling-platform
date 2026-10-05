/**
 * inspect-super-admin-detail.ts
 *
 * Extended inspection: checks emailVerified and credential account detail.
 * Read-only. Never prints the password hash.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { accounts, users } from "../src/db/schema/auth";
import { roles, userRoles } from "../src/db/schema/rbac";
import { assertLocalOrOptedIn } from "./local-db-guard";

config({ path: ".env.dev.local", quiet: true });
config({ path: ".env", quiet: true });
assertLocalOrOptedIn("inspect-super-admin-detail");
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

    const [u] = await db
      .select({ emailVerified: users.emailVerified, status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, saUR.userId))
      .limit(1);

    const [acc] = await db
      .select({ providerId: accounts.providerId, hasPassword: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, saUR.userId))
      .limit(1);

    console.log("SUPER_ADMIN user detail:");
    console.log("  status:", u?.status);
    console.log("  emailVerified:", u?.emailVerified);
    console.log("  deletedAt:", u?.deletedAt ?? null);
    console.log("  credential provider:", acc?.providerId ?? "NONE");
    console.log("  password hash present:", acc?.hasPassword ? "YES" : "NO");
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((e: unknown) => {
  console.error("Inspect failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
