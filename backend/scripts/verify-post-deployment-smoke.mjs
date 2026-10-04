import assert from "node:assert/strict";
const worker = "https://ecommerce-api.ownlinedropshipping.workers.dev";
const frontend = "https://ownline-ecommerce.pages.dev";
const result = { checks: [], productionMutationPerformed: "NO" };
async function request(path, options = {}) {
  const response = await fetch(worker + path, { redirect: "manual", signal: AbortSignal.timeout(30000), ...options });
  const body = await response.text();
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}
const health = await request("/health");
assert.equal(health.status, 200);
result.checks.push({ name: "health", status: health.status, body: health.body });
const me = await request("/api/me");
assert.equal(me.status, 401);
result.checks.push({ name: "api-auth", status: me.status, body: me.body });
const cors = await request("/api/me", { method: "OPTIONS", headers: { Origin: frontend, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Content-Type" } });
assert.equal(cors.status, 204);
assert.equal(cors.headers["access-control-allow-origin"], frontend);
assert.equal(cors.headers["access-control-allow-credentials"], "true");
result.checks.push({ name: "cors", status: cors.status, allowOrigin: cors.headers["access-control-allow-origin"], allowCredentials: cors.headers["access-control-allow-credentials"] });
const hostile = await request("/api/customer/addresses", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
assert.equal(hostile.status, 403);
assert.match(hostile.body, /Untrusted mutation origin/i);
result.checks.push({ name: "hostile-origin", status: hostile.status, body: hostile.body });
const db = await request("/health/db");
assert.equal(db.status, 200);
assert.match(db.body, /connected/);
result.checks.push({ name: "hyperdrive-runtime", status: db.status, body: db.body });
console.log(JSON.stringify(result, null, 2));
