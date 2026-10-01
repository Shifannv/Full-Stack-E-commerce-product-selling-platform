import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Precedence (highest → lowest):
//   1. Variables already set in the OS/shell environment before this process starts
//      (e.g. a test runner exports DATABASE_URL, or CI sets it).
//   2. .env.dev.local  — gitignored local override; wins over .env for normal dev work.
//   3. .env            — committed baseline; provides Aiven URL but only when nothing
//                        above has already set DATABASE_URL.
//
// dotenv never overwrites a variable that is already present in process.env
// (override defaults to false), so loading order alone determines precedence.
// We deliberately do NOT use override:true here so that an explicitly supplied
// DATABASE_URL (shell export, CI env, test harness) is never silently replaced.
loadEnv({ path: ".env.dev.local", quiet: true });
loadEnv({ quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle tooling");
}

let toolingUrl: URL;
try {
  toolingUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
}
if (!["postgres:", "postgresql:"].includes(toolingUrl.protocol)) {
  throw new Error("DATABASE_URL must be a PostgreSQL URL");
}
// Commands that read or change the live database must not reach a remote host by accident.
// Production migrations need an explicit, deliberate opt-in: ALLOW_REMOTE_MIGRATION=1.
const touchesDatabase = process.argv.some((arg) => ["migrate", "push", "pull", "studio"].includes(arg));
const isLocalHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(toolingUrl.hostname);
if (touchesDatabase && !isLocalHost && process.env.ALLOW_REMOTE_MIGRATION !== "1") {
  throw new Error(
    `Refusing to run against remote host "${toolingUrl.hostname}". ` +
      "Point DATABASE_URL at a local database, or set ALLOW_REMOTE_MIGRATION=1 for an approved production run.",
  );
}
// pg otherwise treats sslmode=require as verify-full; Aiven's require mode uses TLS without CA verification.
toolingUrl.searchParams.set("uselibpqcompat", "true");

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: toolingUrl.toString(),
  },
});
