import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

// Local verification only. Credentials arrive via stdin and are never persisted.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const credentials = JSON.parse(Buffer.concat(chunks).toString());
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? join(process.env.LOCALAPPDATA, "ms-playwright-go/1.57.0/package/index.js"));
const frontend = "http://127.0.0.1:3000";
const api = "http://127.0.0.1:8787";
const screenshots = resolve("../../.tmp-redesign-auth");
await mkdir(screenshots, { recursive: true });
const report = { environment: "127.0.0.1/ownline_checkout_test", admin: null, superAdmin: null, customer: null, hover: null };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const formatMoney = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));

async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") await route.continue();
    else await route.abort("blockedbyclient");
  });
  return ctx;
}
async function request(page, path, method = "GET", body) {
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { url: api + path, method, body });
}

async function verifyRole(role, credential) {
  const ctx = await context();
  const page = await ctx.newPage();
  let phase = "normal";
  const runtimeErrors = [];
  const consoleErrors = [];
  const failedResponses = [];
  const failedRequests = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && phase === "normal") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (phase === "normal" && response.status() >= 400) failedResponses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  page.on("requestfailed", (req) => { if (phase === "normal") failedRequests.push({ path: new URL(req.url()).pathname, error: req.failure()?.errorText }); });
  try {
    await page.goto(frontend, { waitUntil: "networkidle" });
    const login = await request(page, "/api/auth/sign-in/email", "POST", credential);
    assert.equal(login.status, 200, `${role} sign-in status`);
    const session = await request(page, "/api/auth/get-session");
    assert.equal(session.status, 200);
    assert.ok(session.body?.session && session.body?.user, "Real Better Auth session must exist");
    const actor = await request(page, "/api/me");
    assert.equal(actor.status, 200);
    assert.ok(actor.body.roles.includes(role));
    if (role === "ADMIN") {
      assert.equal(actor.body.adminApproved, true);
      assert.equal(actor.body.roles.includes("SUPER_ADMIN"), false);
    }
    const prefix = role === "ADMIN" ? "/api/admin" : "/api/super-admin";
    const route = role === "ADMIN" ? "/admin" : "/super-admin";
    const listPath = role === "ADMIN" ? "/products" : "/admins";
    const summaryResponse = page.waitForResponse((response) => new URL(response.url()).pathname === prefix + "/summary");
    const listResponse = page.waitForResponse((response) => new URL(response.url()).pathname === prefix + listPath);
    await page.goto(frontend + route, { waitUntil: "networkidle" });
    const summaryHttp = await summaryResponse;
    const listHttp = await listResponse;
    assert.equal(summaryHttp.status(), 200);
    assert.equal(listHttp.status(), 200);
    const summary = await summaryHttp.json();
    const records = await listHttp.json();
    await page.locator('section[aria-label="Key metrics"]').waitFor();
    assert.equal(await page.getByText("Dashboard unavailable", { exact: true }).count(), 0);
    const values = await page.locator(".dashboard-kpi").evaluateAll((cards) => cards.map((card) => card.querySelectorAll("p")[1].textContent));
    const expected = role === "ADMIN"
      ? [formatMoney(summary.finance.grossSettledSales), String(summary.products.total), String(summary.orders.total), formatMoney(summary.finance.availableBalance)]
      : [formatMoney(summary.finance.grossSettledSales), String(summary.admins.active), String(summary.catalog.publishedProducts), String(summary.orders.total)];
    assert.deepEqual(values, expected, "Rendered metric values must equal actual dashboard responses");
    for (const row of records[role === "ADMIN" ? "products" : "admins"]) {
      assert.ok((await page.locator("#records").innerText()).includes(role === "ADMIN" ? row.name : row.userName || row.userEmail));
    }
    await page.screenshot({ path: join(screenshots, `${role.toLowerCase()}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: join(screenshots, `${role.toLowerCase()}-mobile.png`), fullPage: true });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('section[aria-label="Key metrics"]').waitFor();
    assert.equal((await request(page, "/api/me")).status, 200, "Session survives refresh");
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedResponses, []);
    assert.deepEqual(failedRequests, []);
    const result = { authentication: "PASS", roleRecognized: role, refresh: "PASS", dashboardApi: [summaryHttp.status(), listHttp.status()], metricsMatchApi: true, recordsMatchApi: true, rendering: "PASS", consoleErrors, runtimeErrors, failedRequests, authorization: "PASS" };
    phase = "negative";
    if (role === "ADMIN") {
      for (const path of ["/api/super-admin/summary", "/api/super-admin/admins"]) assert.equal((await request(page, path)).status, 403, `Expected ADMIN denial: ${path}`);
      await page.goto(frontend + "/super-admin", { waitUntil: "networkidle" });
      await page.getByText("Dashboard unavailable", { exact: true }).waitFor();
      assert.equal(await page.locator('section[aria-label="Key metrics"]').count(), 0, "Super Admin data must not render for Admin");
      result.superAdminAccess = "403 on both APIs; static page shell accessible, protected data absent";
    }
    const logout = await request(page, "/api/auth/sign-out", "POST", {});
    assert.equal(logout.status, 200);
    assert.equal((await request(page, "/api/me")).status, 401);
    result.logout = "PASS";
    console.log(`${role}: authentication, API metrics, rendering, refresh, authorization and logout PASS`);
    return result;
  } finally { await ctx.close(); }
}

try {
  report.admin = await verifyRole("ADMIN", credentials.admin);
  report.superAdmin = await verifyRole("SUPER_ADMIN", credentials.owner);
  const ctx = await context();
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(frontend, { waitUntil: "networkidle" });
    const result = await request(page, "/api/products/tees");
    assert.equal(result.status, 200);
    const product = result.body;
    assert.equal(Number(product.price), 249);
    assert.deepEqual(product.variants.map((variant) => variant.title).sort(), ["L", "M"]);
    assert.ok((await page.locator("body").innerText()).includes(product.name));
    const homeImage = page.locator("img").filter({ hasNotText: "unused" });
    assert.ok(await homeImage.count());
    await page.goto(frontend + "/products/tees", { waitUntil: "networkidle" });
    assert.equal(await page.locator("h1").innerText(), product.name);
    assert.ok((await page.locator("body").innerText()).includes("₹249"));
    for (const variant of product.variants) {
      const button = page.getByRole("button", { name: variant.title, exact: true });
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    }
    const image = page.locator("img").first();
    await image.evaluate(async (img) => { await img.decode(); });
    assert.equal(await image.evaluate((img) => img.complete && img.naturalWidth > 0), true);
    assert.ok((await image.getAttribute("src")).includes(product.images[0].objectKey));
    assert.deepEqual(errors, []);
    report.customer = { result: "PASS", priceFromApi: product.price, variantsFromApi: product.variants.map((variant) => variant.title), variantSelection: "PASS", realImage: "PASS", runtimeErrors: errors };
    report.hover = product.images.length === 1 ? "IMPLEMENTED BUT NOT VISUALLY EXERCISED BECAUSE CURRENT TEST PRODUCT HAS ONE IMAGE." : "Multiple images present; hover exercise still required.";
    console.log("Customer home, Tees price, M/L selection and real image PASS");
  } finally { await ctx.close(); }
  await writeFile(resolve("../docs/verification/AUTHENTICATED_DASHBOARDS_LOCAL.json"), JSON.stringify(report, null, 2) + "\n");
} finally { await browser.close(); }
