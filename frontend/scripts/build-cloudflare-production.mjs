import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Pin public origins before Next reads .env.local. Product media is served
// through the existing same-origin API proxy unless the build environment
// explicitly configures another public base. Never inherit development media.
const productionOrigin = "https://ownline-ecommerce.pages.dev";
const mediaBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim()
  ?? `${productionOrigin}/api/images`;
if (!mediaBase) {
  throw new Error("NEXT_PUBLIC_R2_PUBLIC_BASE_URL must not be empty for a production build");
}
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    CATALOG_BUILD_API_URL: "https://ecommerce-api.ownlinedropshipping.workers.dev",
    NEXT_PUBLIC_API_URL: productionOrigin,
    NEXT_PUBLIC_SITE_URL: productionOrigin,
    NEXT_PUBLIC_R2_PUBLIC_BASE_URL: mediaBase,
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
