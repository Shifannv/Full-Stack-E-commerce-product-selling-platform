import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const { parsed } = config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
// .env.dev.local (gitignored) selects the local dev database and wins over .env.
const { parsed: devLocal } = config({
  path: fileURLToPath(new URL("../.env.dev.local", import.meta.url)),
  quiet: true,
  processEnv: {},
});
const connectionString = devLocal?.DATABASE_URL ?? parsed?.DATABASE_URL;

let databaseHost = "";
try {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Invalid PostgreSQL URL");
  }
  databaseHost = url.hostname;
} catch {
  console.error("backend/.env (or .env.dev.local) needs a valid DATABASE_URL");
  process.exit(1);
}

// Local dev also uses a real R2 bucket and runs the scheduler, so never let it reach a
// remote database by accident. Opt in explicitly with ALLOW_REMOTE_DEV=1.
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseHost) &&
  process.env.ALLOW_REMOTE_DEV !== "1"
) {
  console.error(
    `Refusing to start dev against remote database host "${databaseHost}".`,
  );
  console.error(
    "Create backend/.env.dev.local with a local DATABASE_URL, or set ALLOW_REMOTE_DEV=1 to override.",
  );
  process.exit(1);
}

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const child = spawn(
  process.execPath,
  [wrangler, "dev", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        connectionString,
    },
  },
);

child.on("error", () => {
  console.error("Could not start Wrangler");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
