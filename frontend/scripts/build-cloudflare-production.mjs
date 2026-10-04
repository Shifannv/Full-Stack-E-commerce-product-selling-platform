import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Pin public origins before Next reads .env.local. An empty media base is
// deliberate until an owned production R2 custom domain is configured.
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    CATALOG_BUILD_API_URL: "https://ecommerce-api.ownlinedropshipping.workers.dev",
    NEXT_PUBLIC_API_URL: "https://ownline-ecommerce.pages.dev",
    NEXT_PUBLIC_SITE_URL: "https://ownline-ecommerce.pages.dev",
    NEXT_PUBLIC_R2_PUBLIC_BASE_URL: "",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
