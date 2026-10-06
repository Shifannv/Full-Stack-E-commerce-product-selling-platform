/**
 * Minimal in-process stub catalog server for frontend build verification.
 * Serves real catalog data from ownline_checkout_test.
 * Runs on port 8797. Send SIGTERM or close stdin to stop.
 *
 * Usage (from backend/):
 *   npx tsx scripts/stub-catalog-server.ts
 * Then (from frontend/, while this is running):
 *   CATALOG_BUILD_API_URL=http://127.0.0.1:8797 npm run build
 */
import { createServer } from "node:http";
import { config } from "dotenv";
import { app } from "../src/app.js";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) {
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL not set");
  process.exit(1);
}

const parsed = new URL(testUrl);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ownline_checkout_test") {
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL must be ownline_checkout_test on 127.0.0.1");
  process.exit(1);
}

const mockEnv = {
  HYPERDRIVE: { connectionString: testUrl },
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  AUTH_SECRET: "stub",
  ADMIN_BANK_ENCRYPTION_KEY: "",
  KYC_BUCKET: null,
  PRODUCT_IMAGES_BUCKET: null,
  RESEND_API_KEY: null,
  RESEND_FROM_EMAIL: null,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCtx: any = { waitUntil: () => {}, passThroughOnException: () => {} };

const server = createServer(async (req, res) => {
  const url = `http://127.0.0.1:8797${req.url ?? "/"}`;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers[k] = String(Array.isArray(v) ? v.join(", ") : v);
  }
  const cfReq = new Request(url, { method: req.method ?? "GET", headers });
  try {
    const cfRes = await app.fetch(cfReq, mockEnv, mockCtx);
    res.writeHead(cfRes.status, Object.fromEntries(cfRes.headers.entries()));
    const body = await cfRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(8797, "127.0.0.1", () => {
  console.log("STUB CATALOG READY http://127.0.0.1:8797");
});

// Keep alive — caller kills the process explicitly (e.g. Stop-Process or SIGTERM)
process.on("SIGTERM", () => { server.close(); process.exit(0); });
process.on("SIGINT", () => { server.close(); process.exit(0); });
