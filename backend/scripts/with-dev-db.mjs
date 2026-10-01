// Runs a TypeScript script against the LOCAL dev database (backend/.env.dev.local).
// dotenv never overrides variables that are already set, so scripts that call
// config({ path: ".env" }) keep the local DATABASE_URL instead of the one in .env.
//
// Usage: node scripts/with-dev-db.mjs scripts/seed-rbac.ts [args...]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const { parsed } = config({
  path: fileURLToPath(new URL("../.env.dev.local", import.meta.url)),
  quiet: true,
  processEnv: {},
});
const databaseUrl = parsed?.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "backend/.env.dev.local with a local DATABASE_URL is required.",
  );
  process.exit(1);
}
const host = new URL(databaseUrl).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing: .env.dev.local points at non-local host "${host}".`);
  process.exit(1);
}

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/with-dev-db.mjs <script.ts> [args...]");
  process.exit(1);
}

const child = spawn(process.execPath, ["--import", "tsx", script, ...args], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
