import { config } from "dotenv";
import { inArray } from "drizzle-orm";
import { createDb } from "../src/db";
import { permissions, rolePermissions, roles } from "../src/db/schema/rbac";
import { assertLocalOrOptedIn } from "./local-db-guard";

config({ path: ".env", quiet: true });
assertLocalOrOptedIn("seed:rbac");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const permissionKeys = [
  "products.view", "products.create", "products.update", "products.delete",
  "inventory.view", "inventory.update",
  "orders.view", "orders.update",
  "customers.view", "customers.message",
  "reviews.view", "reviews.moderate",
  "analytics.view", "earnings.view",
  "payouts.view", "payouts.request",
] as const;

async function main() {
  const { db, client } = createDb(process.env.DATABASE_URL!);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(roles).values([
        { name: "CUSTOMER", description: "Customer" },
        { name: "ADMIN", description: "Internal seller/operator" },
        { name: "SUPER_ADMIN", description: "Platform owner" },
      ]).onConflictDoNothing();
      await tx.insert(permissions).values(permissionKeys.map((key) => ({ key }))).onConflictDoNothing();

      const roleRows = await tx.select({ id: roles.id, name: roles.name }).from(roles)
        .where(inArray(roles.name, ["ADMIN", "SUPER_ADMIN"]));
      const permissionRows = await tx.select({ id: permissions.id, key: permissions.key }).from(permissions)
        .where(inArray(permissions.key, [...permissionKeys]));
      const admin = roleRows.find((role) => role.name === "ADMIN");
      const superAdmin = roleRows.find((role) => role.name === "SUPER_ADMIN");
      if (!admin || !superAdmin || permissionRows.length !== permissionKeys.length) {
        throw new Error("RBAC seed records are incomplete");
      }

      await tx.insert(rolePermissions).values(permissionRows.flatMap((permission) => [
        { roleId: admin.id, permissionId: permission.id },
        { roleId: superAdmin.id, permissionId: permission.id },
      ])).onConflictDoNothing();
    });
    console.log("RBAC roles and permissions are ready");
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error("RBAC seed failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: (error as { code?: string } | null)?.code,
  });
  process.exitCode = 1;
});
