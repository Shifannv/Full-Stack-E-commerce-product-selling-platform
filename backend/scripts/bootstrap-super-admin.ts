import { config } from "dotenv";
import { createDb } from "../src/db";
import { provisionCredentialUser } from "../src/services/admin/provision.service";
import { assertLocalOrOptedIn } from "./local-db-guard";

// .env.dev.local (gitignored) selects the local dev database and wins over .env,
// consistent with dev.mjs. This prevents accidentally targeting the Aiven remote
// DB when running bootstrap locally.
config({ path: ".env.dev.local", quiet: true });
config({ path: ".env", quiet: true });
assertLocalOrOptedIn("bootstrap:super-admin");
const url = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
const name = process.env.BOOTSTRAP_SUPER_ADMIN_NAME;
const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
if (!url || !email || !name || !password)
  throw new Error(
    "DATABASE_URL and private BOOTSTRAP_SUPER_ADMIN_EMAIL/NAME/PASSWORD environment variables are required",
  );

async function main() {
  const { client, db } = createDb(url!);
  try {
    const created = await provisionCredentialUser(
      db,
      { email: email!, name: name!, password: password! },
      "SUPER_ADMIN",
    );
    console.log(
      `Super Admin account created for ${created.email}; no password was printed`,
    );
  } finally {
    await client.end({ timeout: 1 });
  }
}
main().catch((error: unknown) => {
  console.error("Super Admin bootstrap failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: (error as { code?: string } | null)?.code,
  });
  process.exitCode = 1;
});
