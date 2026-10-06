import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "../src/db";
import { users, accounts, sessions } from "../src/db/schema/auth";
import { admins, roles, userRoles } from "../src/db/schema/rbac";
import { adminCredentials } from "../src/db/schema/admin-credentials";
import { adminBankAccounts } from "../src/db/schema/admin-bank";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../src/db/schema/admin";
import { categories } from "../src/db/schema/catalog";
import { apiRateLimits } from "../src/db/schema/security";
import { provisionAdmin, changeInitialAdminPassword } from "../src/services/admin/provisioning.service";
import { saveKyc, saveAddress, requestCategory, submitApplication, reviewApplication } from "../src/services/admin/admin.service";
import { saveBankDetails, revealBankDetails, reviewBankDetails } from "../src/services/admin/bank.service";
import { initiatePasswordReset } from "../src/services/password-reset/password-reset.service";
import { app } from "../src/app";
import type { AuthBindings } from "../src/lib/auth/auth";

const mode = process.argv.includes("--admin") ? "admin" : "super-admin";
const root = resolve(process.cwd());
const frontendRoot = resolve(root, "../frontend");
const url = parse(readFileSync(join(root, ".env.checkout-test.local"))).CHECKOUT_TEST_DATABASE_URL;
const target = new URL(url);
assert.deepEqual([target.hostname, target.port, target.pathname, decodeURIComponent(target.username)], ["127.0.0.1", "5432", "/ownline_checkout_test", "postgres"]);
const apiOrigin = "http://127.0.0.1:8791";
const frontendOrigin = "http://127.0.0.1:3011";
const browserRequire = createRequire(join(root, "package.json"));
const { chromium } = browserRequire(join(process.env.LOCALAPPDATA!, "ms-playwright-go/1.57.0/package/index.js"));
const { db, client } = createDb(url);
const reviewerId = `seller-browser-${randomUUID()}`;
const reviewerEmail = `${reviewerId}@example.invalid`;
const reviewerPassword = randomBytes(24).toString("base64url");
const temporaryPassword = randomBytes(24).toString("base64url");
const permanentPassword = randomBytes(24).toString("base64url");
const sellerEmail = `seller-browser-${randomUUID()}@example.invalid`;
const categoryId = randomUUID();
const documents = new Map<string, { data: ArrayBuffer; contentType: string }>();
const env: AuthBindings = {
  HYPERDRIVE: { connectionString: url }, FRONTEND_ORIGIN: frontendOrigin, BETTER_AUTH_URL: apiOrigin,
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"), GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture",
  ADMIN_BANK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  KYC_BUCKET: {
    async put(key, data, options) { documents.set(key, { data, contentType: options?.httpMetadata?.contentType ?? "application/pdf" }); },
    async get(key) { const item = documents.get(key); return item ? { body: new Response(item.data).body!, httpMetadata: { contentType: item.contentType } } : null; },
    async delete(key) { documents.delete(key); },
  },
};
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const response = await app.fetch(new Request(new URL(incoming.url!, apiOrigin), {
      method: incoming.method, headers: incoming.headers as HeadersInit,
      body: ["GET", "HEAD"].includes(incoming.method!) ? undefined : Buffer.concat(chunks),
    }), env);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader("set-cookie", cookies);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.statusCode = 500; outgoing.end("Local verification bridge failed"); }
});
let next: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const screenshotRoot = resolve(root, "../../.tmp-seller-lifecycle");
async function ready(url: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Local verification server did not become ready");
}
async function prepareApplication(adminId: string, userId: string) {
  await changeInitialAdminPassword(db, userId, { currentPassword: temporaryPassword, newPassword: permanentPassword });
  await saveKyc(db, adminId, userId, { legalName: "Browser Seller", businessType: "Individual", contactPhone: "9000000000" });
  for (const addressType of ["SHIPPING_ORIGIN", "RETURN"] as const) await saveAddress(db, adminId, userId, { addressType, contactName: "Browser Seller", phone: "9000000000", line1: "Fixture street", city: "Chennai", state: "Tamil Nadu", postalCode: "600001", country: "IN" });
  await requestCategory(db, adminId, categoryId);
  const [kyc] = await db.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId));
  const key = `admin/${adminId}/browser-fixture`;
  const bytes = new TextEncoder().encode("%PDF-1.4 isolated test evidence");
  documents.set(key, { data: bytes.buffer, contentType: "application/pdf" });
  await db.insert(adminKycDocuments).values({ submissionId: kyc.id, documentType: "Identity", privateObjectKey: key });
  await saveBankDetails(db, adminId, userId, { accountHolder: "Browser Seller", bankName: "Fixture Bank", accountNumber: "123456789012", ifsc: "TEST0123456" }, env.ADMIN_BANK_ENCRYPTION_KEY);
  await submitApplication(db, adminId, userId);
}
async function main() {
try {
  await db.insert(users).values({ id: reviewerId, name: "Isolated Browser Reviewer", email: reviewerEmail });
  await db.insert(roles).values([{ name: "SUPER_ADMIN" }, { name: "ADMIN" }]).onConflictDoNothing();
  const [role] = await db.select().from(roles).where(eq(roles.name, "SUPER_ADMIN"));
  await db.insert(userRoles).values({ userId: reviewerId, roleId: role.id });
  await db.insert(accounts).values({ id: randomUUID(), userId: reviewerId, accountId: reviewerId, providerId: "credential", password: await hashPassword(reviewerPassword) });
  await db.insert(categories).values({ id: categoryId, name: "Browser category", slug: `seller-browser-${categoryId}`, status: "PUBLISHED" });
  await new Promise<void>((res, rej) => { server.once("error", rej); server.listen(8791, "127.0.0.1", res); });
  next = spawn(process.execPath, [join(frontendRoot, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3011"], {
    cwd: frontendRoot, windowsHide: true, stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_API_URL: apiOrigin, CATALOG_BUILD_API_URL: apiOrigin, NEXT_TELEMETRY_DISABLED: "1", OWNLINE_VERIFY_DIST_DIR: ".next-seller-verification" },
  });
  await ready(`${frontendOrigin}/super-admin/admins`);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors: string[] = []; page.on("pageerror", (error: Error) => errors.push(error.message));
  page.on("dialog", async (dialog: { accept: () => Promise<void> }) => { await dialog.accept(); });
  mkdirSync(screenshotRoot, { recursive: true });
  if (mode === "super-admin") {
    await page.goto(`${frontendOrigin}/super-admin/admins`);
    await page.getByLabel("Email", { exact: true }).fill(reviewerEmail);
    await page.getByLabel("Password", { exact: true }).fill(reviewerPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: "Seller Admins" }).waitFor();
    await page.locator("summary").filter({ hasText: "Create seller account" }).click();
    await page.getByLabel("Seller name").fill("Browser Seller");
    await page.getByLabel("Seller email").fill(sellerEmail);
    await page.getByLabel("Temporary password").fill(temporaryPassword);
    await page.getByRole("button", { name: "Create seller account", exact: true }).click();
    await page.getByText(`Account created for ${sellerEmail}.`, { exact: false }).waitFor();
    assert.equal(await page.getByLabel("Temporary password").inputValue(), "");
    const [seller] = await db.select({ id: admins.id, userId: admins.userId }).from(admins).innerJoin(users, eq(users.id, admins.userId)).where(eq(users.email, sellerEmail));
    assert.ok(seller);
    await prepareApplication(seller.id, seller.userId);
    await page.reload();
    await page.getByRole("button", { name: "Review Browser Seller", exact: true }).click();
    await page.getByText("Account ending 9012", { exact: false }).waitFor();
    await page.getByRole("button", { name: "View private bank details" }).click();
    await page.getByText("123456789012", { exact: true }).waitFor();
    await page.getByLabel("Bank decision", { exact: true }).selectOption("VERIFIED");
    await page.getByLabel("Bank verification notes").fill("Fixture bank details checked for manual payout.");
    await page.getByRole("button", { name: "Save bank review" }).click();
    await page.getByText("Bank review saved.", { exact: true }).waitFor();
    assert.equal(await page.getByText("123456789012", { exact: true }).count(), 0);
    await page.getByLabel("Decision", { exact: true }).selectOption("CHANGES_REQUIRED");
    await page.getByLabel("Review notes", { exact: true }).fill("Please confirm the business name.");
    await page.getByRole("button", { name: "Save application decision" }).click();
    await page.getByText("Application decision saved.", { exact: true }).waitFor();
    assert.equal((await db.select().from(admins).where(eq(admins.id, seller.id)))[0].status, "CHANGES_REQUIRED");
    await submitApplication(db, seller.id, seller.userId);
    await page.reload(); await page.getByRole("button", { name: "Review Browser Seller", exact: true }).click();
    await page.getByLabel("Decision", { exact: true }).selectOption("APPROVED");
    await page.getByLabel("Review notes", { exact: true }).fill("Application and bank verification complete.");
    await page.getByRole("button", { name: "Save application decision" }).click();
    await page.getByText("Application decision saved.", { exact: true }).waitFor();
    assert.equal((await db.select().from(admins).where(eq(admins.id, seller.id)))[0].status, "ACTIVE");
    for (const [name, width, height] of [["desktop", 1440, 960], ["mobile", 390, 844]] as const) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: join(screenshotRoot, `super-admin-${name}.png`), fullPage: true });
    }
    await page.reload(); await page.getByRole("heading", { name: "Seller Admins" }).waitFor();
    for (const route of ["/super-admin", "/super-admin/products", "/super-admin/payouts", "/super-admin/roles", "/super-admin/lifecycle", "/super-admin/reconciliation"]) {
      await page.goto(frontendOrigin + route, { waitUntil: "networkidle" });
      assert.equal(await page.getByRole("button", { name: "Sign in", exact: true }).count(), 0);
      const alerts = page.locator("main").getByRole("alert").filter({ hasText: /\S/ });
      assert.equal(await alerts.count(), 0, `Unexpected alert on ${route}: ${await alerts.allTextContents()}`);
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("PASS: Super Admin browser provisioning, masked private review, corrections, approval, real database transitions, refresh, six operator routes, logout, desktop/mobile overflow and runtime checks.");
    if (process.argv.includes("--build")) {
      const build = spawn(process.execPath, [join(frontendRoot, "node_modules/next/dist/bin/next"), "build"], {
        cwd: frontendRoot, windowsHide: true, stdio: "inherit",
        env: { ...process.env, NEXT_PUBLIC_API_URL: apiOrigin, CATALOG_BUILD_API_URL: apiOrigin, NEXT_TELEMETRY_DISABLED: "1", OWNLINE_VERIFY_DIST_DIR: ".next-seller-build" },
      });
      await new Promise<void>((res, rej) => { build.once("error", rej); build.once("exit", (code) => code === 0 ? res() : rej(new Error("Isolated frontend production build failed"))); });
    }
  } else {
    // Provision Admin account (reviewer + category already created by shared setup above)
    await provisionAdmin(db, reviewerId, { email: sellerEmail, name: "Browser Seller", temporaryPassword });
    const kycDocPath = join(screenshotRoot, "fixture-kyc.pdf");
    writeFileSync(kycDocPath, "%PDF-1.4 isolated admin browser verification fixture");

    // PHASE 2: Admin login with temporary password → forced change
    await page.goto(`${frontendOrigin}/admin`);
    await page.getByLabel("Email").fill(sellerEmail);
    await page.getByLabel("Password").fill(temporaryPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: "Set a permanent password" }).waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole("button", { name: "Sign in", exact: true }).count(), 0, "Sign-in form must be hidden during forced password change");
    assert.equal(await page.getByText("Manage your store").count(), 0, "Dashboard must not appear before forced password change");
    await page.locator('[name="currentPassword"]').fill(temporaryPassword);
    await page.locator('[name="newPassword"]').fill(permanentPassword);
    await page.locator('[name="confirm"]').fill(permanentPassword);
    await page.getByRole("button", { name: "Set permanent password" }).click();
    await page.getByRole("heading", { name: "Password updated" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Continue to sign in" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor({ timeout: 10000 });

    // Temporary password now rejected
    await page.getByLabel("Email").fill(sellerEmail);
    await page.getByLabel("Password").fill(temporaryPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("alert").waitFor({ timeout: 10000 });

    // Sign in with permanent password
    await page.getByLabel("Password").clear();
    await page.getByLabel("Password").fill(permanentPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 20000 });
    assert.equal(await page.getByRole("heading", { name: "Your workspace" }).count(), 1, "Admin workspace heading must appear");

    // Role check: Admin must not see Super Admin dashboard
    await page.goto(`${frontendOrigin}/super-admin`);
    await page.waitForLoadState("networkidle");
    const bodyText = await page.evaluate(() => document.body.textContent ?? "");
    assert.ok(!bodyText.includes("Platform at a glance"), "Admin must not reach Super Admin dashboard");
    assert.ok(bodyText.includes("Sign in") || bodyText.includes("needs another account"), "Admin must see sign-in or forbidden state on Super Admin route");
    await page.goto(`${frontendOrigin}/admin`);
    await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 20000 });

    // PHASE 3: Admin onboarding via UI
    await page.getByRole("button", { name: "Seller profile" }).click();

    // KYC details
    await page.locator("nav").getByRole("button", { name: "Save seller details" }).click();
    await page.getByLabel("Legal name").fill("Browser Seller Ltd");
    await page.getByLabel("Business type").fill("Individual");
    await page.getByLabel("Contact phone").fill("9876543210");
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 10000 });

    // KYC document upload
    await page.locator("nav").getByRole("button", { name: "Upload verification document" }).click();
    await page.getByLabel("Document type").fill("Identity");
    await page.locator('[name="file"]').setInputFiles(kycDocPath);
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 15000 });

    // SHIPPING_ORIGIN address
    await page.locator("nav").getByRole("button", { name: "Save operational address" }).click();
    await page.locator("select[name='type']").selectOption("SHIPPING_ORIGIN");
    await page.getByLabel("Contact name").fill("Browser Seller Shipping");
    await page.getByLabel("Phone").fill("9876543210");
    await page.getByLabel("Address line 1").fill("12 Main Street");
    await page.getByLabel("City").fill("Chennai");
    await page.getByLabel("State").fill("Tamil Nadu");
    await page.getByLabel("Postal code").fill("600001");
    await page.getByLabel("Country code").fill("IN");
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 10000 });

    // Navigate away to reset the address form, then RETURN address
    await page.locator("nav").getByRole("button", { name: "Seller application" }).click();
    await page.locator("nav").getByRole("button", { name: "Save operational address" }).click();
    await page.locator("select[name='type']").selectOption("RETURN");
    await page.getByLabel("Contact name").fill("Browser Seller Returns");
    await page.getByLabel("Phone").fill("9876543211");
    await page.getByLabel("Address line 1").fill("14 Return Street");
    await page.getByLabel("City").fill("Chennai");
    await page.getByLabel("State").fill("Tamil Nadu");
    await page.getByLabel("Postal code").fill("600002");
    await page.getByLabel("Country code").fill("IN");
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 10000 });

    // Category request
    await page.locator("nav").getByRole("button", { name: "Request a category assignment" }).click();
    await page.getByLabel("Category reference").fill(categoryId);
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 10000 });

    // Bank details (masked response expected)
    await page.locator("nav").getByRole("button", { name: "Save bank details" }).click();
    await page.getByLabel("Account holder name").fill("Browser Seller Ltd");
    await page.getByLabel("Bank name").fill("Fixture Bank");
    await page.getByLabel("Account number").fill("987654321012");
    await page.getByLabel("IFSC code").fill("TEST0987654");
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 10000 });
    assert.equal(await page.getByText("987654321012", { exact: true }).count(), 0, "Full account number must not appear in bank save response");

    // Submit application
    await page.locator("nav").getByRole("button", { name: "Submit application for review" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    await page.getByText("Operation completed").waitFor({ timeout: 10000 });

    // Verify PENDING_SUPER_ADMIN_APPROVAL via UI
    await page.locator("nav").getByRole("button", { name: "Seller application" }).click();
    await page.getByRole("button", { name: "Load records" }).click();
    await page.getByText("PENDING_SUPER_ADMIN_APPROVAL").first().waitFor({ timeout: 10000 });

    // DB verification
    const [seller] = await db.select({ id: admins.id, status: admins.status, userId: admins.userId }).from(admins).innerJoin(users, eq(users.id, admins.userId)).where(eq(users.email, sellerEmail));
    assert.ok(seller, "Seller admin record must exist in database");
    assert.equal(seller.status, "PENDING_SUPER_ADMIN_APPROVAL", `Expected PENDING_SUPER_ADMIN_APPROVAL, got ${seller.status}`);

    // PHASE 4: Pre-approval security — product creation must be blocked
    await page.getByRole("button", { name: "Catalog" }).click();
    await page.locator("nav").getByRole("button", { name: "Create a product" }).click();
    await page.locator('[name="categoryId"]').fill(categoryId);
    await page.locator('[name="subcategoryId"]').fill(randomUUID());
    await page.getByLabel("Name").fill("Pending Test Product");
    await page.getByLabel("URL slug").fill("pending-test-product");
    await page.getByLabel("Price in INR").fill("999");
    await page.locator("select[name='returnEnabled']").selectOption("false");
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("button", { name: "Confirm changes" }).click();
    const blockedAlertEl = page.getByRole("alert").filter({ hasText: /\S/ }).filter({ hasNot: page.locator('[id="__next-route-announcer__"]') });
    await blockedAlertEl.first().waitFor({ timeout: 10000 });
    const blockedAlert = await blockedAlertEl.first().textContent() ?? "";
    assert.ok(blockedAlert.length > 0, "Pre-approval product creation must return an error message");

    // PHASE 7: Programmatic approval (SA review UI already verified in --super-admin mode)
    const bankData = await revealBankDetails(db, seller.id, reviewerId, env.ADMIN_BANK_ENCRYPTION_KEY);
    await reviewBankDetails(db, seller.id, reviewerId, { decision: "VERIFIED", notes: "Fixture bank verified for admin browser E2E test", revision: bankData.revision });
    await reviewApplication(db, seller.id, reviewerId, "APPROVED", "Admin browser E2E — approved programmatically after SA flow verified separately");
    assert.equal((await db.select({ status: admins.status }).from(admins).where(eq(admins.id, seller.id)))[0].status, "ACTIVE", "Admin must be ACTIVE after approval");

    // PHASE 8: Active Admin dashboard
    await page.goto(`${frontendOrigin}/admin`);
    await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 20000 });
    await page.getByRole("heading", { name: "Your workspace" }).waitFor({ timeout: 10000 });

    // Walk all workspace groups — no alerts
    for (const group of ["Catalog", "Seller profile", "Orders & returns", "Finance", "Account lifecycle"]) {
      await page.getByRole("button", { name: group }).click();
      await page.waitForTimeout(800);
      const alerts = page.locator("main").getByRole("alert").filter({ hasText: /\S/ });
      assert.equal(await alerts.count(), 0, `Unexpected error on group "${group}"`);
    }

    // Finance: verify balance loads
    await page.getByRole("button", { name: "Finance" }).click();
    await page.locator("nav").getByRole("button", { name: "Balance, settlements & payouts" }).click();
    await page.getByRole("button", { name: "Load records" }).click();
    await page.getByText("Records").waitFor({ timeout: 10000 });

    // Account lifecycle: verify lifecycle loads
    await page.getByRole("button", { name: "Account lifecycle" }).click();
    await page.locator("nav").getByRole("button", { name: "Account lifecycle" }).click();
    await page.getByRole("button", { name: "Load records" }).click();
    await page.getByText("Records").waitFor({ timeout: 10000 });

    // Responsive overflow check
    for (const [name, width, height] of [["desktop", 1440, 960], ["tablet-lg", 1280, 800], ["tablet", 1024, 768], ["tablet-sm", 768, 1024], ["mobile-lg", 390, 844], ["mobile-sm", 375, 812]] as const) {
      await page.setViewportSize({ width, height });
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      assert.equal(noOverflow, true, `Horizontal overflow at ${name} (${width}x${height})`);
      await page.screenshot({ path: join(screenshotRoot, `admin-${name}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 960 });

    // Logout
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor({ timeout: 10000 });

    // PHASE 9: Password recovery
    // Enumerate-safe forgot-password UI
    await page.goto(`${frontendOrigin}/admin/forgot-password`);
    await page.getByLabel("Email address").fill("does-not-exist@example.invalid");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText("Check your email").waitFor({ timeout: 10000 });

    // No-token reset URL shows invalid state
    await page.goto(`${frontendOrigin}/admin/reset-password`);
    await page.getByText("No reset token was provided").waitFor({ timeout: 10000 });

    // Obtain token via direct service call (test mode — no Resend email sent)
    const resetResult = await initiatePasswordReset(db, sellerEmail);
    assert.ok(resetResult, "initiatePasswordReset must succeed for an eligible Admin");
    const recoveredPassword = randomBytes(18).toString("base64url");

    // Token validation: valid token shows the reset form
    await page.goto(`${frontendOrigin}/admin/reset-password?token=${encodeURIComponent(resetResult.rawToken)}`);
    await page.getByRole("heading", { name: "Set a new password" }).waitFor({ timeout: 10000 });

    // Submit new password
    await page.locator('[name="password"]').fill(recoveredPassword);
    await page.locator('[name="confirm"]').fill(recoveredPassword);
    await page.getByRole("button", { name: "Set new password" }).click();
    await page.getByRole("heading", { name: "Password updated" }).waitFor({ timeout: 10000 });

    // Old password must fail (sessions invalidated)
    await page.goto(`${frontendOrigin}/admin`);
    await page.getByLabel("Email").fill(sellerEmail);
    await page.getByLabel("Password").fill(permanentPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("alert").waitFor({ timeout: 10000 });

    // New password must work
    await page.getByLabel("Password").clear();
    await page.getByLabel("Password").fill(recoveredPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 20000 });

    // Token is single-use: reuse must fail
    const page2 = await browser.newPage();
    await page2.goto(`${frontendOrigin}/admin/reset-password?token=${encodeURIComponent(resetResult.rawToken)}`);
    await page2.getByText("invalid or has already expired").waitFor({ timeout: 10000 });
    await page2.close();

    // Final sign-out
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor({ timeout: 10000 });

    assert.deepEqual(errors.filter(e => !e.includes("hydration") && !e.includes("act(")), [], "No unhandled JS runtime errors");
    console.log("PASS: Admin browser phase — login, forced password change, role isolation, full onboarding via UI (KYC, document, both addresses, category, bank, submit), pre-approval product block, programmatic approval, active dashboard with all groups, responsive overflow (6 viewports), logout, password recovery (enumerate-safe, token validation, reset, old-password rejection, new-password accepted, single-use enforcement).");

    if (process.argv.includes("--build")) {
      const build = spawn(process.execPath, [join(frontendRoot, "node_modules/next/dist/bin/next"), "build"], {
        cwd: frontendRoot, windowsHide: true, stdio: "inherit",
        env: { ...process.env, NEXT_PUBLIC_API_URL: apiOrigin, CATALOG_BUILD_API_URL: apiOrigin, NEXT_TELEMETRY_DISABLED: "1", OWNLINE_VERIFY_DIST_DIR: ".next-admin-build" },
      });
      await new Promise<void>((res, rej) => { build.once("error", rej); build.once("exit", (code) => code === 0 ? res() : rej(new Error("Isolated frontend production build failed"))); });
    }
  }
} finally {
  await browser?.close(); next?.kill();
  await new Promise<void>((res) => server.close(() => res()));
  try {
    await db.transaction(async (tx) => {
      const fixtureUsers = await tx.select({ id: users.id }).from(users).where(inArray(users.email, [reviewerEmail, sellerEmail]));
      const userIds = fixtureUsers.map((row) => row.id);
      if (!userIds.length) return;
      const fixtureAdmins = await tx.select({ id: admins.id }).from(admins).where(inArray(admins.userId, userIds));
      const adminIds = fixtureAdmins.map((row) => row.id);
      if (adminIds.length) {
        const kycs = await tx.select({ id: adminKycSubmissions.id }).from(adminKycSubmissions).where(inArray(adminKycSubmissions.adminId, adminIds));
        if (kycs.length) await tx.delete(adminKycDocuments).where(inArray(adminKycDocuments.submissionId, kycs.map((row) => row.id)));
        await tx.delete(adminKycSubmissions).where(inArray(adminKycSubmissions.adminId, adminIds));
        await tx.delete(adminAddresses).where(inArray(adminAddresses.adminId, adminIds));
        await tx.delete(adminCategoryAssignments).where(inArray(adminCategoryAssignments.adminId, adminIds));
        await tx.delete(adminBankAccounts).where(inArray(adminBankAccounts.adminId, adminIds));
        await tx.delete(adminCredentials).where(inArray(adminCredentials.adminId, adminIds));
        await tx.delete(adminAuditEvents).where(inArray(adminAuditEvents.adminId, adminIds));
        await tx.delete(admins).where(inArray(admins.id, adminIds));
      }
      await tx.delete(categories).where(eq(categories.id, categoryId));
      const rateKeys = userIds.flatMap((id) => ["privileged", "account", "invitation"].map((group) => `v1:${group}:${createHash("sha256").update(id).digest("hex")}`));
      await tx.delete(apiRateLimits).where(inArray(apiRateLimits.key, rateKeys));
      await tx.delete(sessions).where(inArray(sessions.userId, userIds));
      await tx.delete(accounts).where(inArray(accounts.userId, userIds));
      await tx.delete(userRoles).where(inArray(userRoles.userId, userIds));
      await tx.delete(users).where(inArray(users.id, userIds));
    });
    console.log("PASS: removed this run's disposable identities and onboarding records; protected account untouched.");
  } finally { await client.end({ timeout: 2 }); }
}
}
main().catch((error) => {
  let report = error instanceof Error ? error.message : "Browser verification failed";
  for (const value of [reviewerPassword, temporaryPassword, permanentPassword]) report = report.replaceAll(value, "[redacted]");
  console.error(report); process.exitCode = 1;
});
