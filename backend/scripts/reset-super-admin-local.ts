/**
 * reset-super-admin-local.ts
 *
 * LOCAL/TEST ONLY — Safe local Super Admin credential reset.
 *
 * Purpose:
 *   Tear down the existing SUPER_ADMIN user (if any) in the LOCAL dev database
 *   and re-create it with the credentials supplied via environment variables.
 *   The password is hashed with Better Auth's own crypto (argon2id) before being
 *   written; no plaintext is ever stored.
 *
 * Safety guarantees:
 *   - assertLocalOrOptedIn() blocks execution against any remote/Aiven host.
 *   - Reads .env.dev.local first so the local DB always wins over .env.
 *   - Deletes all existing sessions for the account before re-creating the
 *     credential, effectively invalidating every live session.
 *   - No public endpoint. No email sent. No frontend UI.
 *   - Does not touch CUSTOMER or ADMIN accounts.
 *
 * Usage (PowerShell):
 *   $env:BOOTSTRAP_SUPER_ADMIN_EMAIL="superadmin@example.local"
 *   $env:BOOTSTRAP_SUPER_ADMIN_NAME="Super Admin"
 *   $env:BOOTSTRAP_SUPER_ADMIN_PASSWORD="<strong-password-min-12-chars>"
 *   npx tsx scripts/reset-super-admin-local.ts
 *
 * Or as a single command (PowerShell):
 *   $env:BOOTSTRAP_SUPER_ADMIN_EMAIL="..."; $env:BOOTSTRAP_SUPER_ADMIN_NAME="..."; $env:BOOTSTRAP_SUPER_ADMIN_PASSWORD="..."; npx tsx scripts/reset-super-admin-local.ts
 */

import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { accounts, sessions, users } from "../src/db/schema/auth";
import { roles, userRoles } from "../src/db/schema/rbac";
import { assertLocalOrOptedIn } from "./local-db-guard";

// .env.dev.local wins over .env (same as dev.mjs precedence).
config({ path: ".env.dev.local", quiet: true });
config({ path: ".env", quiet: true });

// Hard-stop against any remote / Aiven database.
assertLocalOrOptedIn("reset-super-admin-local");

const url = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
const name = process.env.BOOTSTRAP_SUPER_ADMIN_NAME;
const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;

if (!url || !email || !name || !password) {
  throw new Error(
    "DATABASE_URL, BOOTSTRAP_SUPER_ADMIN_EMAIL, BOOTSTRAP_SUPER_ADMIN_NAME, " +
      "and BOOTSTRAP_SUPER_ADMIN_PASSWORD are all required. " +
      "Set them as environment variables before running this script. " +
      "Never commit those values.",
  );
}
if (password.length < 12 || password.length > 256) {
  throw new Error("BOOTSTRAP_SUPER_ADMIN_PASSWORD must be 12–256 characters.");
}

const emailNorm = email.toLowerCase().trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
  throw new Error("BOOTSTRAP_SUPER_ADMIN_EMAIL is not a valid email address.");
}

async function main() {
  console.log("DB host:", new URL(url!).hostname);

  // Hash the password with Better Auth's own argon2id implementation.
  const hashed = await hashPassword(password!);

  const { client, db } = createDb(url!);
  try {
    await db.transaction(async (tx) => {
      // 1. Locate the SUPER_ADMIN role.
      const [saRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, "SUPER_ADMIN"))
        .limit(1);
      if (!saRole) {
        throw new Error(
          "SUPER_ADMIN role not found. Run 'npm run seed:rbac' first.",
        );
      }

      // 2. Locate any existing SUPER_ADMIN user.
      const [existingUR] = await tx
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.roleId, saRole.id))
        .limit(1);

      if (existingUR) {
        const oldUserId = existingUR.userId;

        // 2a. Invalidate all live sessions (cascade delete would handle this,
        //     but we do it explicitly so the intent is clear).
        const deletedSessions = await tx
          .delete(sessions)
          .where(eq(sessions.userId, oldUserId))
          .returning({ id: sessions.id });
        console.log(
          `Invalidated ${deletedSessions.length} existing session(s).`,
        );

        // 2b. Delete accounts and user_roles (FK cascade handles accounts
        //     when users row is deleted, but deleting explicitly is safer).
        await tx.delete(accounts).where(eq(accounts.userId, oldUserId));
        await tx.delete(userRoles).where(eq(userRoles.userId, oldUserId));
        await tx.delete(users).where(eq(users.id, oldUserId));
        console.log("Removed existing SUPER_ADMIN user record.");
      } else {
        console.log("No existing SUPER_ADMIN user found — creating fresh.");
      }

      // 3. Check that the target email is not already used by another account.
      const [collision] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, emailNorm))
        .limit(1);
      if (collision) {
        throw new Error(
          `Email "${emailNorm}" is already in use by another account. ` +
            "Choose a different email or remove the conflicting account first.",
        );
      }

      // 4. Create the new SUPER_ADMIN user.
      const newUserId = crypto.randomUUID();
      await tx.insert(users).values({
        id: newUserId,
        name: name!,
        email: emailNorm,
        emailVerified: true, // local admin: no email round-trip needed
        status: "ACTIVE",
      });

      // 5. Create the credential account with the hashed password.
      await tx.insert(accounts).values({
        id: crypto.randomUUID(),
        userId: newUserId,
        accountId: newUserId, // Better Auth requires accountId === userId for credential
        providerId: "credential",
        password: hashed,
      });

      // 6. Assign the SUPER_ADMIN role.
      await tx.insert(userRoles).values({ userId: newUserId, roleId: saRole.id });

      console.log(
        `SUPER_ADMIN credential established for ${emailNorm}. ` +
          "Password is hashed — it was not printed.",
      );
    });
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error("reset-super-admin-local failed:", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    code: (error as { code?: string } | null)?.code,
  });
  process.exitCode = 1;
});
