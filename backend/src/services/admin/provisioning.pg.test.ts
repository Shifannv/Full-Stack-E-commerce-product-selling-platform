import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../../db";
import { users, accounts, sessions } from "../../db/schema/auth";
import { admins, roles, userRoles } from "../../db/schema/rbac";
import { adminCredentials } from "../../db/schema/admin-credentials";
import { adminAddresses, adminCategoryAssignments, adminKycDocuments, adminAuditEvents, adminKycSubmissions } from "../../db/schema/admin";
import { adminBankAccounts } from "../../db/schema/admin-bank";
import { categories } from "../../db/schema/catalog";
import { apiRateLimits } from "../../db/schema/security";
import { createAuth, type AuthBindings } from "../../lib/auth/auth";
import { provisionAdmin, changeInitialAdminPassword } from "./provisioning.service";
import { saveKyc, saveAddress, requestCategory, submitApplication, reviewApplication } from "./admin.service";
import { saveBankDetails, getBankSummary, revealBankDetails, reviewBankDetails } from "./bank.service";
import worker from "../../index";

config({ path: ".env.checkout-test.local", quiet: true });
const url = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!url) throw new Error("CHECKOUT_TEST_DATABASE_URL required");
const target = new URL(url);
if (target.hostname !== "127.0.0.1" || target.port !== "5432" || target.pathname !== "/ownline_checkout_test" || decodeURIComponent(target.username) !== "postgres")
  throw new Error("Isolated PostgreSQL target required");

test("provisioned seller must replace initial credential before onboarding; existing identities remain intact", async () => {
  const { db, client } = createDb(url);
  const reviewerId = `provision-reviewer-${randomUUID()}`;
  const fixtureIds = [reviewerId];
  const adminIds: string[] = [];
  const categoryId = randomUUID();
  const temporaryPassword = randomUUID();
  const permanentPassword = randomUUID();
  const env: AuthBindings = {
    HYPERDRIVE: { connectionString: url }, BETTER_AUTH_SECRET: randomUUID(),
    BETTER_AUTH_URL: "http://127.0.0.1:8787", FRONTEND_ORIGIN: "http://127.0.0.1:3000",
    GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture",
    ADMIN_BANK_ENCRYPTION_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
  };
  async function login(email: string, password: string) {
    const connection = createAuth(env);
    try {
      const response = await connection.auth.api.signInEmail({ body: { email, password }, asResponse: true });
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      return { status: response.status, cookie: cookie ?? "" };
    } finally { await connection.client.end({ timeout: 1 }); }
  }
  async function call(path: string, cookie: string, body?: unknown) {
    return worker.fetch(new Request(`${env.BETTER_AUTH_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie, origin: env.FRONTEND_ORIGIN, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
  }
  try {
    await db.insert(users).values({ id: reviewerId, email: `${reviewerId}@example.invalid`, name: "Isolated reviewer" });
    await db.insert(roles).values([{ name: "ADMIN" }, { name: "SUPER_ADMIN" }]).onConflictDoNothing();
    const [role] = await db.select().from(roles).where(eq(roles.name, "SUPER_ADMIN"));
    await db.insert(userRoles).values({ userId: reviewerId, roleId: role.id });
    const email = `provision-${randomUUID()}@example.invalid`;
    await assert.rejects(provisionAdmin(db, "not-a-reviewer", { email, name: "Seller", temporaryPassword }), /Forbidden/);
    await assert.rejects(provisionAdmin(db, reviewerId, { email: `${reviewerId}@example.invalid`, name: "Replacement", temporaryPassword }), /already belongs/);
    await assert.rejects(provisionAdmin(db, reviewerId, { email, name: "Seller", temporaryPassword: "short" }), /12 to 128/);
    const results = await Promise.allSettled([1, 2].map(() => provisionAdmin(db, reviewerId, { email, name: "Seller", temporaryPassword })));
    const successes = results.filter((r) => r.status === "fulfilled");
    // Track all creations before asserting, so failure cleanup remains scoped.
    for (const result of successes) { fixtureIds.push(result.value.userId); adminIds.push(result.value.adminId); }
    assert.equal(successes.length, 1);
    const seller = successes[0].value;
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.equal("temporaryPassword" in seller, false);
    const [account] = await db.select({ password: accounts.password }).from(accounts).where(eq(accounts.userId, seller.userId));
    assert.ok(account.password && account.password !== temporaryPassword);
    await assert.rejects(saveKyc(db, seller.adminId, seller.userId, { legalName: "Seller", businessType: "Individual", contactPhone: "1234567890" }), /ADMIN_PASSWORD_CHANGE_REQUIRED/);
    const initial = await login(email, temporaryPassword);
    assert.equal(initial.status, 200); assert.ok(initial.cookie);
    const me = await call("/api/me", initial.cookie);
    assert.equal(me.status, 200);
    assert.equal((await me.json() as { mustChangePassword: boolean }).mustChangePassword, true);
    assert.equal((await call("/api/admin/onboarding", initial.cookie)).status, 403);
    assert.equal((await call("/api/auth/change-password", initial.cookie, { currentPassword: temporaryPassword, newPassword: randomUUID() })).status, 403);
    assert.equal((await call("/api/super-admin/dashboard", initial.cookie)).status, 403);
    assert.equal((await call("/api/admin/account/initial-password", "", { currentPassword: temporaryPassword, newPassword: permanentPassword })).status, 401);
    await assert.rejects(changeInitialAdminPassword(db, seller.userId, { currentPassword: randomUUID(), newPassword: permanentPassword }), /incorrect/);
    await assert.rejects(changeInitialAdminPassword(db, seller.userId, { currentPassword: temporaryPassword, newPassword: temporaryPassword }), /different/);
    const changed = await call("/api/admin/account/initial-password", initial.cookie, { currentPassword: temporaryPassword, newPassword: permanentPassword });
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { mustChangePassword: false, signInRequired: true });
    assert.equal((await call("/api/me", initial.cookie)).status, 401);
    assert.notEqual((await login(email, temporaryPassword)).status, 200);
    const permanent = await login(email, permanentPassword);
    assert.equal(permanent.status, 200);
    assert.equal((await call("/api/admin/onboarding", permanent.cookie)).status, 200);
    assert.equal((await call("/api/super-admin/admins", permanent.cookie)).status, 403);
    await saveKyc(db, seller.adminId, seller.userId, { legalName: "Seller", businessType: "Individual", contactPhone: "1234567890" });
    await assert.rejects(changeInitialAdminPassword(db, seller.userId, { currentPassword: permanentPassword, newPassword: randomUUID() }), /already changed/);
    const bankInput = { accountHolder: "Fixture Seller", bankName: "Fixture Bank", accountNumber: "123456789012", ifsc: "TEST0123456" };
    await assert.rejects(saveBankDetails(db, seller.adminId, seller.userId, bankInput), /not configured/);
    const bank = await saveBankDetails(db, seller.adminId, seller.userId, bankInput, env.ADMIN_BANK_ENCRYPTION_KEY);
    assert.equal(bank.accountLast4, "9012");
    assert.equal("accountNumber" in bank, false);
    const [storedBank] = await db.select().from(adminBankAccounts).where(eq(adminBankAccounts.adminId, seller.adminId));
    assert.equal(storedBank.encryptedDetails.includes(bankInput.accountNumber), false);
    await assert.rejects(revealBankDetails(db, seller.adminId, seller.userId, env.ADMIN_BANK_ENCRYPTION_KEY), /Forbidden/);
    const revealed = await revealBankDetails(db, seller.adminId, reviewerId, env.ADMIN_BANK_ENCRYPTION_KEY);
    assert.equal(revealed.accountNumber, bankInput.accountNumber);
    await assert.rejects(reviewBankDetails(db, seller.adminId, reviewerId, { revision: randomUUID(), decision: "VERIFIED", notes: "Checked" }), /changed/);
    await db.insert(categories).values({ id: categoryId, name: "Fixture category", slug: `provision-${categoryId}`, status: "PUBLISHED" });
    await requestCategory(db, seller.adminId, categoryId);
    for (const addressType of ["SHIPPING_ORIGIN", "RETURN"] as const) await saveAddress(db, seller.adminId, seller.userId, { addressType, contactName: "Seller", phone: "9999999999", line1: "Fixture address", city: "Chennai", state: "Tamil Nadu", postalCode: "600001", country: "India" });
    const [kyc] = await db.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, seller.adminId));
    await db.insert(adminKycDocuments).values({ submissionId: kyc.id, documentType: "IDENTITY", privateObjectKey: `admin/${seller.adminId}/fixture` });
    await submitApplication(db, seller.adminId, seller.userId);
    await assert.rejects(reviewApplication(db, seller.adminId, reviewerId, "APPROVED", "Reviewed"), /bank verification/);
    await reviewApplication(db, seller.adminId, reviewerId, "CHANGES_REQUIRED", "Correct bank holder");
    await reviewBankDetails(db, seller.adminId, reviewerId, { revision: bank.revision, decision: "CHANGES_REQUIRED", notes: "Correct holder" });
    await assert.rejects(submitApplication(db, seller.adminId, seller.userId), /bank details/);
    const updatedBank = await saveBankDetails(db, seller.adminId, seller.userId, bankInput, env.ADMIN_BANK_ENCRYPTION_KEY);
    assert.notEqual(updatedBank.revision, bank.revision);
    await submitApplication(db, seller.adminId, seller.userId);
    await reviewBankDetails(db, seller.adminId, reviewerId, { revision: updatedBank.revision, decision: "VERIFIED", notes: "Manual details verified" });
    assert.equal((await getBankSummary(db, seller.adminId))?.status, "VERIFIED");
    await reviewApplication(db, seller.adminId, reviewerId, "APPROVED", "Complete application reviewed");
    assert.equal((await db.select().from(admins).where(eq(admins.id, seller.adminId)))[0].status, "ACTIVE");
    const audit = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, seller.adminId));
    assert.ok(audit.some((a) => a.action === "ADMIN_PROVISIONED"));
    assert.ok(audit.some((a) => a.action === "ADMIN_INITIAL_PASSWORD_CHANGED"));
    assert.equal(JSON.stringify(audit).includes(temporaryPassword), false);
    assert.equal(JSON.stringify(audit).includes(permanentPassword), false);
    const [reviewer] = await db.select().from(users).where(eq(users.id, reviewerId));
    assert.equal(reviewer.name, "Isolated reviewer");
    assert.equal((await db.select().from(accounts).where(eq(accounts.userId, reviewerId))).length, 0);
  } finally {
    try {
      await db.transaction(async (tx) => {
        if (adminIds.length) {
          for (const adminId of adminIds) {
            const submissions = await tx.select({ id: adminKycSubmissions.id }).from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId));
            if (submissions.length) await tx.delete(adminKycDocuments).where(inArray(adminKycDocuments.submissionId, submissions.map((row) => row.id)));
          }
          await tx.delete(adminAddresses).where(inArray(adminAddresses.adminId, adminIds));
          await tx.delete(adminCategoryAssignments).where(inArray(adminCategoryAssignments.adminId, adminIds));
          await tx.delete(adminBankAccounts).where(inArray(adminBankAccounts.adminId, adminIds));
          await tx.delete(adminKycSubmissions).where(inArray(adminKycSubmissions.adminId, adminIds));
          await tx.delete(adminAuditEvents).where(inArray(adminAuditEvents.adminId, adminIds));
          await tx.delete(adminCredentials).where(inArray(adminCredentials.adminId, adminIds));
          await tx.delete(admins).where(inArray(admins.id, adminIds));
        }
        await tx.delete(categories).where(eq(categories.id, categoryId));
        const rateKeys = fixtureIds.flatMap((id) => ["privileged", "account"].map((group) => `v1:${group}:${createHash("sha256").update(id).digest("hex")}`));
        await tx.delete(apiRateLimits).where(inArray(apiRateLimits.key, rateKeys));
        await tx.delete(sessions).where(inArray(sessions.userId, fixtureIds));
        await tx.delete(accounts).where(inArray(accounts.userId, fixtureIds));
        await tx.delete(userRoles).where(inArray(userRoles.userId, fixtureIds));
        await tx.delete(users).where(inArray(users.id, fixtureIds));
      });
    } finally { await client.end({ timeout: 1 }); }
  }
});
