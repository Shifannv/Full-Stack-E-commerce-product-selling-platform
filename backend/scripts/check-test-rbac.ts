import { config } from "dotenv";
import { createDb } from "../src/db/index.js";
import { roles, permissions, userRoles } from "../src/db/schema/rbac.js";
import { users, accounts } from "../src/db/schema/auth.js";
import { eq } from "drizzle-orm";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
  if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL not set");
  const { db, client } = createDb(testUrl);
  try {
    const r = await db.select({ name: roles.name }).from(roles);
    const p = await db.select({ key: permissions.key }).from(permissions);
    const [demoUser] = await db
      .select({ id: users.id, email: users.email, status: users.status })
      .from(users)
      .where(eq(users.id, "tees-demo-seed-user"))
      .limit(1);
    const demoUserRoles = demoUser
      ? await db.select({ role: roles.name }).from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, demoUser.id))
      : [];
    const demoAccounts = demoUser
      ? await db.select({ provider: accounts.providerId }).from(accounts)
          .where(eq(accounts.userId, demoUser.id))
      : [];
    console.log("roles in test DB:", r.map((x) => x.name));
    console.log("permissions count:", p.length);
    console.log("demo user:", demoUser ?? "NOT FOUND");
    console.log("demo user roles:", demoUserRoles);
    console.log("demo user accounts:", demoAccounts);
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
