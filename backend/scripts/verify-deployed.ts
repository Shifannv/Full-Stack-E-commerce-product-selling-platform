import assert from "node:assert/strict";

const target = process.env.VERIFY_API_URL;
if (!target || new URL(target).protocol !== "https:") throw new Error("Set VERIFY_API_URL to the deployed HTTPS Worker URL");

async function main() {
  const checks: Array<[string, string, number]> = [
    ["GET", "/health", 200], ["GET", "/health/db", 200],
    ["GET", "/api/products", 200], ["GET", "/api/categories", 200],
    ["GET", "/api/me", 401], ["GET", "/api/customer/cart", 401],
    ["GET", "/api/admin/onboarding", 401], ["POST", "/api/checkout", 401],
    ["GET", "/api/orders", 401], ["GET", "/api/admin/finance", 401],
    ["POST", "/webhooks/shipping/events", 401],
    // A configured secret rejects an unsigned request. This does not verify provider delivery.
    ["POST", "/webhooks/payments/cashfree", 401],
  ];
  for (const [method, path, expected] of checks) {
    const response = await fetch(new URL(path, target), { method, redirect: "manual", signal: AbortSignal.timeout(30000), ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}) });
    console.log(`${method} ${path}: ${response.status}`);
    assert.equal(response.status, expected, `${method} ${path}`);
    if (path === "/health/db") assert.equal((await response.json() as { database: string }).database, "connected");
  }
  console.log("Deployed smoke checks passed; authenticated verification is a separate verify:auth-e2e run.");
}
main().catch((error: unknown) => { console.error("Deployed verification failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : undefined }); process.exitCode = 1; });
