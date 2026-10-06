/**
 * Minimal in-process stub catalog server for frontend build verification.
 * Serves real catalog data from ownline_checkout_test (via app.fetch).
 * Runs on port 8797. Exits when stdin closes.
 *
 * Usage (from backend/):
 *   node --import tsx/esm scripts/stub-catalog-server.mjs
 * Then (in another shell, from frontend/):
 *   CATALOG_BUILD_API_URL=http://127.0.0.1:8797 npm run build
 */
import { createServer } from "node:http";
import { config } from "dotenv";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });

const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) { console.error("ABORT: CHECKOUT_TEST_DATABASE_URL not set"); process.exit(1); }

const parsed = new URL(testUrl);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ownline_checkout_test") {
  console.error("ABORT: CHECKOUT_TEST_DATABASE_URL must be ownline_checkout_test on 127.0.0.1"); process.exit(1);
}

const { app } = await import("../src/app.js");

const mockEnv = {
  HYPERDRIVE: { connectionString: testUrl },
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
};
const mockCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

const server = createServer(async (req, res) => {
  const url = `http://127.0.0.1:8797${req.url ?? "/"}`;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) { if (v) headers[k] = String(v); }
  const cfReq = new Request(url, { method: req.method ?? "GET", headers });
  try {
    const cfRes = await app.fetch(cfReq, mockEnv, mockCtx);
    res.writeHead(cfRes.status, Object.fromEntries(cfRes.headers.entries()));
    const body = await cfRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    res.writeHead(500); res.end(String(err));
  }
});

server.listen(8797, "127.0.0.1", () => {
  console.log("STUB CATALOG READY http://127.0.0.1:8797");
});

process.stdin.resume();
process.stdin.on("end", () => { server.close(); process.exit(0); });
