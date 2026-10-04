import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

// Production READ ONLY: no sessions, credentials, uploads, provider calls or DB writes.
const worker = "https://ecommerce-api.ownlinedropshipping.workers.dev";
const pages = "https://ownline-ecommerce.pages.dev";
const account = "5b6fbec4849a7a164f4c61c6edfb0fc9";
const report = { checkedAt: new Date().toISOString(), checks: [], browser: [] };
async function get(url, expected = 200, headers = {}) {
  const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, expected, `${url}: ${response.status}`);
  return response;
}
async function probe(origin, path, expected = 200) {
  const response = await get(origin + path, expected);
  report.checks.push({ url: origin + path, status: response.status });
  return response.json();
}
const config = await readFile(join(process.env.APPDATA, "xdg.config/.wrangler/config/default.toml"), "utf8");
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
assert.ok(token, "Existing Wrangler login required");
async function cf(path) {
  const response = await get(`https://api.cloudflare.com/client/v4${path}`, 200, { Authorization: `Bearer ${token}` });
  const body = await response.json();
  assert.equal(body.success, true);
  return body.result;
}
const base = `/accounts/${account}`;
const settings = await cf(`${base}/workers/scripts/ecommerce-api/settings`);
report.bindings = settings.bindings.map(({ name, type, bucket_name, id, text }) => ({ name, type, bucket_name, id, ...(type === "plain_text" ? { text } : {}) }));
for (const [name, bucket] of [["KYC_BUCKET", "ecommerce-admin-kyc-private"], ["PRODUCT_IMAGES_BUCKET", "shop-product-images"]]) {
  assert.equal(settings.bindings.find((b) => b.name === name)?.bucket_name, bucket);
}
assert.equal(settings.bindings.find((b) => b.name === "HYPERDRIVE")?.id, "0c6bae39855446449b1276eecf3dd4d3");
for (const name of ["BETTER_AUTH_SECRET", "CASHFREE_CLIENT_ID", "CASHFREE_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RETURN_WINDOW_DAYS", "SHIPROCKET_WEBHOOK_TOKEN"]) {
  assert.equal(settings.bindings.find((b) => b.name === name)?.type, "secret_text", `Existing secret preserved: ${name}`);
}
report.schedules = (await cf(`${base}/workers/scripts/ecommerce-api/schedules`)).schedules;
assert.deepEqual(report.schedules, []);
report.workerDeployments = await cf(`${base}/workers/scripts/ecommerce-api/deployments`);
const project = await cf(`${base}/pages/projects/ownline-ecommerce`);
report.pagesDeployment = { id: project.canonical_deployment.id, environment: project.canonical_deployment.environment, status: project.canonical_deployment.latest_stage.status, usesFunctions: project.canonical_deployment.uses_functions };
assert.equal(report.pagesDeployment.environment, "production");
assert.equal(report.pagesDeployment.status, "success");
assert.equal(report.pagesDeployment.usesFunctions, true);
report.pagesEnvironment = Object.fromEntries(Object.entries(project.deployment_configs.production.env_vars).map(([key, value]) => [key, value.type === "plain_text" ? value.value : "REDACTED"]));
assert.equal(report.pagesEnvironment.PUBLIC_WORKER_URL, worker);
assert.equal(report.pagesEnvironment.NEXT_PUBLIC_API_URL, pages);
report.r2 = {};
for (const bucket of ["shop-product-images", "ecommerce-admin-kyc-private"]) {
  report.r2[bucket] = {
    managed: await cf(`${base}/r2/buckets/${bucket}/domains/managed`),
    custom: await cf(`${base}/r2/buckets/${bucket}/domains/custom`),
  };
}
assert.equal(report.r2["ecommerce-admin-kyc-private"].managed.enabled, false);
assert.deepEqual(report.r2["ecommerce-admin-kyc-private"].custom.domains, []);
report.availableZones = (await cf(`/zones?account.id=${account}`)).map(({ name, status }) => ({ name, status }));
await probe(worker, "/health");
const dbHealth = await probe(worker, "/health/db");
assert.equal(dbHealth.database, "connected"); // endpoint executes SELECT 1 only
const direct = await probe(worker, "/api/products?limit=50");
const proxied = await probe(pages, "/api/products?limit=50");
assert.deepEqual(proxied, direct);
assert.deepEqual(await probe(worker, "/api/categories"), await probe(pages, "/api/categories"));
report.catalog = direct.products.map(({ slug, price, image }) => ({ slug, price, hasImage: !!image }));
for (const origin of [worker, pages]) {
  for (const path of ["/api/me", "/api/admin/summary", "/api/super-admin/summary"]) await probe(origin, path, 401);
  assert.equal(await probe(origin, "/api/auth/get-session"), null);
}
const productWithImage = direct.products.find((p) => p.image);
if (productWithImage) {
  const imagePath = "/api/images/" + productWithImage.image.objectKey.split("/").map(encodeURIComponent).join("/");
  const image = await get(worker + imagePath);
  assert.match(image.headers.get("content-type"), /^image\//);
  report.r2.existingObjectRead = { status: image.status, contentType: image.headers.get("content-type"), bytes: (await image.arrayBuffer()).byteLength };
}
const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.LOCALAPPDATA, "ms-playwright-go/1.57.0/package/index.js"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const errors = [];
  const requests = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!["GET", "HEAD"].includes(request.method()) || new URL(request.url()).origin !== pages) {
      errors.push(`Blocked unexpected request: ${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.url().includes("/api/")) requests.push({ url: r.url(), status: r.status() }); });
  for (const path of ["/", `/products/${direct.products[0].slug}`, "/admin", "/super-admin"]) {
    const response = await page.goto(pages + path, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator("h1").first().waitFor({ timeout: 30000 });
    assert.equal(response.status(), 200);
    const text = await page.locator("body").innerText();
    assert.ok(text.length > 100);
    report.browser.push({ path, status: response.status(), heading: await page.locator("h1").allTextContents() });
  }
  assert.deepEqual(errors, []);
  assert.ok(requests.every(({ status }) => status === 200 || status === 401));
  report.browserRuntimeErrors = errors;
  report.browserApiResponses = requests;
} finally {
  await browser.close();
}
report.result = "PASS: Worker/Pages baseline; R2 production custom domain remains unresolved";
await writeFile(new URL("../../docs/verification/CLOUDFLARE_BASELINE.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ result: report.result, workerDeployment: report.workerDeployments.deployments?.[0]?.versions, pages: report.pagesDeployment, checks: report.checks, browser: report.browser, r2: report.r2 }, null, 2));
