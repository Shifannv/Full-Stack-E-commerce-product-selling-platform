import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const { parsed } = config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const connectionString = parsed?.DATABASE_URL;

try {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Invalid PostgreSQL URL");
  }
} catch {
  console.error("backend/.env needs a valid DATABASE_URL");
  process.exit(1);
}

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const child = spawn(process.execPath, [wrangler, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: connectionString,
  },
});

child.on("error", () => {
  console.error("Could not start Wrangler");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
