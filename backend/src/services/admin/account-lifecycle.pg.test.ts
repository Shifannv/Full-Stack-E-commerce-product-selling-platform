import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "../../db";
import { accounts, sessions, users } from "../../db/schema/auth";
import { admins, roles, userRoles } from "../../db/schema/rbac";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../../db/schema/admin";
import { adminArchives, adminDeletionRequests, adminRecoveryRequests } from "../../db/schema/admin-lifecycle";
import { categories, inventories, productAdmins, products, subcategories } from "../../db/schema/catalog";
import { orderItems, orders, payments } from "../../db/schema/orders";
import { adminSettlements, payoutRequests, payoutSettlementItems } from "../../db/schema/finance";
import { requestAdminDeletion, verifyAdminDeletion, reviewAdminDeletion, requestAdminRecovery, reviewAdminRecovery } from "./account-lifecycle.service";
import { updateProduct, setProductInventory } from "./catalog.service";
import { setCategoryAssignment } from "./admin.service";
import { listCatalog, getPublicProduct } from "../customer/customer.service";
import { transitionAdminStatus } from "./account-state.service";
import { createAuth } from "../../lib/auth/auth";
import worker from "../../index";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (testUrl) {
  const u = new URL(testUrl);
  if (u.hostname !== "127.0.0.1" || u.port !== "5432" || u.pathname !== "/ownline_checkout_test" || decodeURIComponent(u.username) !== "postgres") throw new Error("Unexpected checkout test target");
  if (process.env.DATABASE_URL) {
    const shared = new URL(process.env.DATABASE_URL);
    if (shared.host === u.host && shared.pathname === u.pathname) throw new Error("Isolated test database required");
  }
}
const password = "archive test credential 2026";

async function fixture(run: (c: Awaited<ReturnType<typeof makeFixture>>) => Promise<void>) {
  if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL required");
  const c = await makeFixture();
  try { await run(c); } finally { await c.cleanup(); }
}
async function makeFixture() {
  const first = createDb(testUrl!), second = createDb(testUrl!);
  const seed = randomUUID();
  const sellerId = `lifecycle-seller-${seed}`, reviewerId = `lifecycle-reviewer-${seed}`, customerId = `lifecycle-customer-${seed}`;
  const adminId = randomUUID(), categoryId = randomUUID(), subcategoryId = randomUUID(), productId = randomUUID(), orderId = randomUUID();
  const sku = `lifecycle-${seed}`;
  try {
    await first.db.transaction(async (tx) => {
      await tx.insert(users).values([sellerId, reviewerId, customerId].map((id) => ({ id, name: "Lifecycle fixture", email: `${id}@example.invalid` })));
      await tx.insert(accounts).values({ id: randomUUID(), accountId: sellerId, userId: sellerId, providerId: "credential", password: await hashPassword(password) });
      await tx.insert(roles).values([{ name: "ADMIN" }, { name: "SUPER_ADMIN" }]).onConflictDoNothing();
      const grants = await tx.select({ id: roles.id, name: roles.name }).from(roles);
      await tx.insert(userRoles).values([
        { userId: sellerId, roleId: grants.find((r) => r.name === "ADMIN")!.id },
        { userId: reviewerId, roleId: grants.find((r) => r.name === "SUPER_ADMIN")!.id },
      ]);
      await tx.insert(admins).values({ id: adminId, userId: sellerId, status: "ACTIVE" });
      await tx.insert(categories).values({ id: categoryId, name: "Lifecycle", slug: sku, status: "PUBLISHED" });
      await tx.insert(subcategories).values({ id: subcategoryId, categoryId, name: "Lifecycle", slug: "lifecycle", status: "PUBLISHED" });
      await tx.insert(adminCategoryAssignments).values({ adminId, categoryId, status: "ACTIVE" });
      await tx.insert(products).values({ id: productId, categoryId, subcategoryId, createdByAdminId: adminId, name: "Historical product", slug: sku, status: "PUBLISHED", price: "40.00" });
      await tx.insert(productAdmins).values({ productId, adminId });
      await tx.insert(inventories).values({ productId, availableQuantity: 8 });
      const [kyc] = await tx.insert(adminKycSubmissions).values({ adminId, status: "APPROVED", legalName: "Seller", businessType: "PERSON", contactPhone: "9999999999" }).returning();
      await tx.insert(adminKycDocuments).values({ submissionId: kyc.id, documentType: "IDENTITY", privateObjectKey: `admin/${adminId}/evidence` });
      await tx.insert(adminAddresses).values(["SHIPPING_ORIGIN", "RETURN"].map((addressType) => ({ adminId, addressType, contactName: "Seller", phone: "9999999999", line1: "Historical street", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" })));
      await tx.insert(orders).values({ id: orderId, customerId, orderNumber: sku, status: "CONFIRMED", paymentStatus: "PAID", stockState: "CONSUMED", subtotal: "40.00", totalAmount: "40.00", shippingAddressSnapshot: { contactName: "Customer", phone: "9999999999", line1: "Snapshot street", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" } });
      const [item] = await tx.insert(orderItems).values({ orderId, adminId, productId, productNameSnapshot: "Historical product", quantity: 1, unitPrice: "40.00", subtotal: "40.00", totalAmount: "40.00" }).returning();
      await tx.insert(payments).values({ orderId, amount: "40.00", status: "PAID" });
      const [settlement] = await tx.insert(adminSettlements).values({ adminId, orderId, orderItemId: item.id, grossAmount: "40.00", commissionAmount: "4.00", gatewayFeeAmount: "1.00", refundAdjustmentAmount: "0.00", netPayable: "35.00", status: "PAID" }).returning();
      const [payout] = await tx.insert(payoutRequests).values({ adminId, amount: "35.00", status: "PAID", reviewedByUserId: reviewerId }).returning();
      await tx.insert(payoutSettlementItems).values({ payoutRequestId: payout.id, settlementId: settlement.id });
    });
  } catch (error) { await Promise.all([first.client.end({ timeout: 1 }), second.client.end({ timeout: 1 })]); throw error; }
  return {
    db: first.db, other: second.db, adminId, categoryId, productId, orderId, sellerId, reviewerId, customerId, sku,
    async cleanup() {
      try {
        await first.db.transaction(async (tx) => {
          await tx.delete(payoutSettlementItems).where(sql`${payoutSettlementItems.payoutRequestId} in (select id from payout_requests where admin_id = ${adminId})`);
          await tx.delete(payoutRequests).where(eq(payoutRequests.adminId, adminId));
          await tx.delete(adminSettlements).where(eq(adminSettlements.adminId, adminId));
          await tx.delete(payments).where(eq(payments.orderId, orderId));
          await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
          await tx.delete(orders).where(eq(orders.id, orderId));
          await tx.delete(adminRecoveryRequests).where(eq(adminRecoveryRequests.adminId, adminId));
          await tx.delete(adminArchives).where(eq(adminArchives.adminId, adminId));
          await tx.delete(adminDeletionRequests).where(eq(adminDeletionRequests.adminId, adminId));
          await tx.delete(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId));
          await tx.delete(sessions).where(eq(sessions.userId, sellerId));
          await tx.delete(accounts).where(eq(accounts.userId, sellerId));
          await tx.delete(adminKycDocuments).where(sql`${adminKycDocuments.submissionId} in (select id from admin_kyc_submissions where admin_id = ${adminId})`);
          await tx.delete(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId));
          await tx.delete(adminAddresses).where(eq(adminAddresses.adminId, adminId));
          await tx.delete(inventories).where(eq(inventories.productId, productId));
          await tx.delete(productAdmins).where(eq(productAdmins.productId, productId));
          await tx.delete(products).where(eq(products.id, productId));
          await tx.delete(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId));
          await tx.delete(subcategories).where(eq(subcategories.id, subcategoryId));
          await tx.delete(categories).where(eq(categories.id, categoryId));
          await tx.delete(admins).where(eq(admins.id, adminId));
          await tx.delete(userRoles).where(eq(userRoles.userId, sellerId));
          await tx.delete(userRoles).where(eq(userRoles.userId, reviewerId));
          await tx.delete(users).where(eq(users.id, sellerId));
          await tx.delete(users).where(eq(users.id, reviewerId));
          await tx.delete(users).where(eq(users.id, customerId));
        });
      } finally { await Promise.all([first.client.end({ timeout: 1 }), second.client.end({ timeout: 1 })]); }
    },
  };
}
type Fixture = Awaited<ReturnType<typeof makeFixture>>;
async function requested(c: Fixture) { return requestAdminDeletion(c.db, c.sellerId, "Seller request"); }
async function verified(c: Fixture) { const req = await requested(c); await verifyAdminDeletion(c.db, c.sellerId, req.id, password); return req.id; }
async function deleted(c: Fixture) { const id = await verified(c); await reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "APPROVED", "Reviewed"); return id; }
async function recoveryApproval(c: Fixture) {
  const [kyc] = await c.db.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, c.adminId));
  return { kycSubmissionId: kyc.id, kycRevision: kyc.updatedAt.toISOString(), categoryIds: [c.categoryId] };
}
async function publicRows(c: Fixture) { return listCatalog(c.db, { category: c.sku, limit: 20, offset: 0 }); }
async function waitBlocked(tx: Parameters<Parameters<Fixture["db"]["transaction"]>[0]>[0], pid: number) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const [row] = await tx.execute(sql`select cardinality(pg_blocking_pids(${pid})) as blockers`);
    if (Number(row.blockers) > 0) return;
    if (Date.now() > deadline) throw new Error("Lifecycle write did not wait for the Admin state lock");
  }
}

test("Admin deletion requires own Admin role and credential verification", { skip: !testUrl }, async () => fixture(async (c) => {
  await assert.rejects(requestAdminDeletion(c.db, c.customerId, "unauthorized"), { status: 403 });
  const request = await requested(c);
  assert.equal(request.status, "REQUESTED");
  assert.equal((await requested(c)).id, request.id);
  await assert.rejects(reviewAdminDeletion(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "unverified"), { status: 409 });
  await assert.rejects(verifyAdminDeletion(c.db, c.customerId, request.id, password), { status: 403 });
  await assert.rejects(verifyAdminDeletion(c.db, c.sellerId, request.id, "wrong password"), { status: 403 });
  const pending = await verifyAdminDeletion(c.db, c.sellerId, request.id, password);
  assert.equal(pending.status, "PENDING");
  assert.equal((await verifyAdminDeletion(c.db, c.sellerId, request.id, password)).id, request.id);
  await assert.rejects(reviewAdminDeletion(c.db, c.adminId, request.id, c.sellerId, "APPROVED", "forbidden"), { status: 403 });
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  assert.equal(audits.filter((a) => a.action === "ADMIN_DELETION_REQUESTED").length, 1);
  assert.equal(audits.filter((a) => a.action === "ADMIN_DELETION_VERIFIED").length, 1);
}));

test("rejected deletion preserves account and allows a new request", { skip: !testUrl }, async () => fixture(async (c) => {
  const id = await verified(c);
  const rejected = await reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "REJECTED", "Not approved");
  assert.equal(rejected.status, "REJECTED");
  assert.equal((await reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "REJECTED", "repeat")).reviewNotes, "Not approved");
  await assert.rejects(reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "APPROVED", "conflict"), { status: 409 });
  assert.equal((await publicRows(c)).length, 1);
  assert.equal((await requested(c)).status, "REQUESTED");
}));

test("approved deletion archives identity and products while retaining commerce history", { skip: !testUrl }, async () => fixture(async (c) => {
  const id = await verified(c);
  const review = await reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "APPROVED", "Approved");
  assert.equal(review.status, "APPROVED");
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  const [user] = await c.db.select().from(users).where(eq(users.id, c.sellerId));
  const [scope] = await c.db.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, c.adminId));
  const [product] = await c.db.select().from(products).where(eq(products.id, c.productId));
  assert.ok(admin.deletedAt && user.deletedAt);
  assert.equal(admin.status, "SUSPENDED"); assert.equal(user.status, "SUSPENDED");
  assert.equal(scope.status, "REVOKED"); assert.equal(product.status, "ARCHIVED");
  assert.equal(product.createdByAdminId, c.adminId);
  assert.equal((await publicRows(c)).length, 0);
  await assert.rejects(getPublicProduct(c.db, c.sku), { status: 404 });
  await assert.rejects(updateProduct(c.db, c.adminId, c.productId, { name: "Denied" }), { status: 403 });
  await assert.rejects(setProductInventory(c.db, c.adminId, c.productId, 9, undefined, 0), { status: 403 });
  await assert.rejects(setCategoryAssignment(c.db, c.adminId, c.categoryId, c.reviewerId, true, "Denied"), { status: 403 });
  assert.equal((await c.db.select().from(orders).where(eq(orders.id, c.orderId))).length, 1);
  assert.equal((await c.db.select().from(orderItems).where(eq(orderItems.orderId, c.orderId)))[0].productNameSnapshot, "Historical product");
  assert.equal((await c.db.select().from(payments).where(eq(payments.orderId, c.orderId))).length, 1);
  assert.equal((await c.db.select().from(adminSettlements).where(eq(adminSettlements.adminId, c.adminId)))[0].status, "PAID");
  assert.equal((await c.db.select().from(payoutRequests).where(eq(payoutRequests.adminId, c.adminId)))[0].status, "PAID");
  assert.equal((await c.db.select().from(payoutSettlementItems)).filter((r) => r.payoutRequestId).length > 0, true);
  assert.equal((await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId))).length, 1);
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  for (const action of ["ADMIN_DELETION_REQUESTED", "ADMIN_DELETION_VERIFIED", "ADMIN_DELETION_APPROVED", "ADMIN_ARCHIVED"]) assert.equal(audits.filter((a) => a.action === action).length, 1);
  assert.equal((await reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "APPROVED", "repeat")).id, id);
}));

test("deletion approval/rejection race has one final decision and no partial archive", { skip: !testUrl }, async () => fixture(async (c) => {
  const id = await verified(c);
  const outcomes = await Promise.allSettled([
    reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "APPROVED", "approve"),
    reviewAdminDeletion(c.other, c.adminId, id, c.reviewerId, "REJECTED", "reject"),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((o) => o.status === "rejected" && (o.reason as { status?: number }).status === 409).length, 1);
  const [row] = await c.db.select().from(adminDeletionRequests).where(eq(adminDeletionRequests.id, id));
  const archives = await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId));
  assert.equal(archives.length, row.status === "APPROVED" ? 1 : 0);
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  assert.equal(audits.filter((a) => a.action === "ADMIN_DELETION_APPROVED" || a.action === "ADMIN_DELETION_REJECTED").length, 1);
}));

test("deletion races product, inventory and category mutations under the Admin lock", { skip: !testUrl }, async () => fixture(async (c) => {
  const id = await verified(c);
  const results = await Promise.allSettled([
    reviewAdminDeletion(c.db, c.adminId, id, c.reviewerId, "APPROVED", "approve"),
    updateProduct(c.other, c.adminId, c.productId, { name: "Race update" }),
    setProductInventory(c.other, c.adminId, c.productId, 9, undefined, 0),
  ]);
  assert.equal(results[0].status, "fulfilled");
  for (const result of results.slice(1)) if (result.status === "rejected") assert.equal((result.reason as { status?: number }).status, 403);
  const [stock] = await c.db.select().from(inventories).where(eq(inventories.productId, c.productId));
  assert.ok([8, 9].includes(stock.availableQuantity));
  await assert.rejects(setCategoryAssignment(c.other, c.adminId, c.categoryId, c.reviewerId, true, "after archive"), { status: 403 });
}));

test("committed deletion makes a waiting product write fail", { skip: !testUrl }, async () => fixture(async (c) => {
  const requestId = await verified(c);
  let publishPid!: (pid: number) => void;
  const ready = new Promise<number>((resolve) => { publishPid = resolve; });
  let waiting!: Promise<unknown>;
  await c.db.transaction(async (tx) => {
    await reviewAdminDeletion(tx as never, c.adminId, requestId, c.reviewerId, "APPROVED", "delete first");
    waiting = c.other.transaction(async (otherTx) => {
      const [row] = await otherTx.execute(sql`select pg_backend_pid() as pid`);
      publishPid(Number(row.pid));
      return updateProduct(otherTx as never, c.adminId, c.productId, { name: "Stale product write" });
    });
    await waitBlocked(tx, await ready);
  });
  await assert.rejects(waiting, { status: 403 });
}));

for (const [name, write] of [
  ["inventory", (tx: Fixture["other"], c: Fixture) => setProductInventory(tx, c.adminId, c.productId, 9, undefined, 0)],
  ["category grant", (tx: Fixture["other"], c: Fixture) => setCategoryAssignment(tx, c.adminId, c.categoryId, c.reviewerId, true, "stale grant")],
] as const) {
  test(`committed deletion makes a waiting ${name} write fail`, { skip: !testUrl }, async () => fixture(async (c) => {
    const requestId = await verified(c);
    let publishPid!: (pid: number) => void;
    const ready = new Promise<number>((resolve) => { publishPid = resolve; });
    let waiting!: Promise<unknown>;
    await c.db.transaction(async (tx) => {
      await reviewAdminDeletion(tx as never, c.adminId, requestId, c.reviewerId, "APPROVED", "delete first");
      waiting = c.other.transaction(async (otherTx) => {
        const [row] = await otherTx.execute(sql`select pg_backend_pid() as pid`);
        publishPid(Number(row.pid));
        return write(otherTx as never, c);
      });
      await waitBlocked(tx, await ready);
    });
    await assert.rejects(waiting, { status: 403 });
  }));
}

test("archived seller is invisible even if a product is republished directly", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  await c.db.update(products).set({ status: "PUBLISHED" }).where(eq(products.id, c.productId));
  assert.equal((await publicRows(c)).length, 0);
  await assert.rejects(getPublicProduct(c.db, c.sku), { status: 404 });
}));

test("archived Admin session can request recovery but cannot use normal authenticated APIs", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const env = {
    HYPERDRIVE: { connectionString: testUrl! },
    BETTER_AUTH_SECRET: "isolated-lifecycle-test-secret-2026-09-30",
    BETTER_AUTH_URL: "http://127.0.0.1:8787",
    FRONTEND_ORIGIN: "http://127.0.0.1:3000",
    GOOGLE_CLIENT_ID: "unused-local-client",
    GOOGLE_CLIENT_SECRET: "unused-local-secret",
  };
  const auth = createAuth(env);
  let cookie: string;
  try {
    const response = await auth.auth.api.signInEmail({ body: { email: `${c.sellerId}@example.invalid`, password }, asResponse: true });
    assert.equal(response.status, 200);
    cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    assert.ok(cookie);
  } finally { await auth.client.end({ timeout: 1 }); }
  const headers = { cookie, "content-type": "application/json" };
  const normal = await worker.fetch(new Request("http://127.0.0.1:8787/api/me", { headers }), env);
  assert.equal(normal.status, 403);
  const recovery = await worker.fetch(new Request("http://127.0.0.1:8787/api/admin/account/recovery-requests", {
    method: "POST", headers, body: JSON.stringify({ reason: "Authenticated recovery", password }),
  }), env);
  assert.equal(recovery.status, 200);
  assert.equal((await recovery.json() as { status: string }).status, "PENDING");
}));

test("recovery approval requires current KYC and explicitly eligible category", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  await assert.rejects(requestAdminRecovery(c.db, c.sellerId, "recover", "wrong"), { status: 403 });
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  assert.equal((await requestAdminRecovery(c.other, c.sellerId, "duplicate", password)).id, request.id);
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.sellerId, "APPROVED", "forbidden", await recoveryApproval(c)), { status: 403 });
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "missing"), { status: 409 });
  const approval = await recoveryApproval(c);
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "stale", { ...approval, kycRevision: new Date(0).toISOString() }), { status: 409 });
  await c.db.update(adminCategoryAssignments).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(adminCategoryAssignments.adminId, c.adminId));
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "category changed", approval), { status: 409 });
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  assert.ok(admin.deletedAt);
}));

test("recovery does not restore a revoked Admin role or unpublished category", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  const approval = await recoveryApproval(c);
  await c.db.update(categories).set({ status: "DRAFT" }).where(eq(categories.id, c.categoryId));
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "category disabled", approval), { status: 409 });
  await c.db.update(categories).set({ status: "PUBLISHED" }).where(eq(categories.id, c.categoryId));
  await c.db.delete(userRoles).where(eq(userRoles.userId, c.sellerId));
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "role revoked", approval), { status: 403 });
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  assert.ok(admin.deletedAt);
}));

test("recovery never recreates deleted credential material", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  await c.db.delete(accounts).where(eq(accounts.userId, c.sellerId));
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "credential removed", await recoveryApproval(c)), { status: 409 });
  assert.equal((await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId)))[0].restoredAt, null);
}));

test("approved recovery restores identity and reviewed scope without republishing products", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  const result = await reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "verified", await recoveryApproval(c));
  assert.equal(result.status, "APPROVED");
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  const [user] = await c.db.select().from(users).where(eq(users.id, c.sellerId));
  const [scope] = await c.db.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, c.adminId));
  const [product] = await c.db.select().from(products).where(eq(products.id, c.productId));
  const [archive] = await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId));
  assert.equal(admin.status, "ACTIVE"); assert.equal(admin.deletedAt, null);
  assert.equal(user.status, "ACTIVE"); assert.equal(user.deletedAt, null);
  assert.equal(scope.status, "ACTIVE"); assert.equal(product.status, "ARCHIVED");
  assert.ok(archive.restoredAt); assert.equal(archive.restoredByUserId, c.reviewerId);
  assert.equal((await publicRows(c)).length, 0);
  await assert.rejects(reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "REJECTED", "conflict"), { status: 409 });
  assert.equal((await reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "repeat")).id, request.id);
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  for (const action of ["ADMIN_RECOVERY_REQUESTED", "ADMIN_RECOVERY_APPROVED", "ADMIN_REACTIVATED"]) assert.equal(audits.filter((a) => a.action === action).length, 1);
}));

test("rejected recovery preserves archive and may be requested again", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  assert.equal((await reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "REJECTED", "declined")).status, "REJECTED");
  const [archive] = await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId));
  assert.equal(archive.restoredAt, null);
  assert.notEqual((await requestAdminRecovery(c.db, c.sellerId, "appeal", password)).id, request.id);
}));

test("concurrent recovery decisions, suspension and rollback preserve one state", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  const approval = await recoveryApproval(c);
  const results = await Promise.allSettled([
    reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "approved", approval),
    reviewAdminRecovery(c.other, c.adminId, request.id, c.reviewerId, "REJECTED", "rejected"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const [row] = await c.db.select().from(adminRecoveryRequests).where(eq(adminRecoveryRequests.id, request.id));
  if (row.status === "APPROVED") {
    const suspension = await transitionAdminStatus(c.other, c.adminId, c.reviewerId, "SUSPEND", "post-recovery");
    assert.equal(suspension.status, "SUSPENDED");
    const [archive] = await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId));
    assert.ok(archive.restoredAt);
  } else {
    await assert.rejects(transitionAdminStatus(c.other, c.adminId, c.reviewerId, "RECOVER", "archived"), { status: 403 });
  }
}));

test("two recovery approvals create one reactivation and audit", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  const approval = await recoveryApproval(c);
  const results = await Promise.allSettled([
    reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "first", approval),
    reviewAdminRecovery(c.other, c.adminId, request.id, c.reviewerId, "APPROVED", "second", approval),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  assert.equal(audits.filter((a) => a.action === "ADMIN_REACTIVATED").length, 1);
  assert.equal(audits.filter((a) => a.action === "ADMIN_RECOVERY_APPROVED").length, 1);
}));

test("recovery approval and suspension serialize without reviving an archived account early", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  const results = await Promise.allSettled([
    reviewAdminRecovery(c.db, c.adminId, request.id, c.reviewerId, "APPROVED", "approved", await recoveryApproval(c)),
    transitionAdminStatus(c.other, c.adminId, c.reviewerId, "SUSPEND", "concurrent suspension"),
  ]);
  assert.equal(results[0].status, "fulfilled");
  if (results[1].status === "rejected") assert.equal((results[1].reason as { status?: number }).status, 403);
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  assert.equal(admin.status, results[1].status === "fulfilled" ? "SUSPENDED" : "ACTIVE");
  assert.equal(admin.deletedAt, null);
}));

test("recovery approval rollback keeps archive and account inactive", { skip: !testUrl }, async () => fixture(async (c) => {
  await deleted(c);
  const request = await requestAdminRecovery(c.db, c.sellerId, "recover", password);
  const approval = await recoveryApproval(c);
  await assert.rejects(c.db.transaction(async (tx) => {
    await reviewAdminRecovery(tx as never, c.adminId, request.id, c.reviewerId, "APPROVED", "rollback", approval);
    throw new Error("rollback");
  }), /rollback/);
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  const [row] = await c.db.select().from(adminRecoveryRequests).where(eq(adminRecoveryRequests.id, request.id));
  const [archive] = await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId));
  assert.ok(admin.deletedAt); assert.equal(row.status, "PENDING"); assert.equal(archive.restoredAt, null);
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  assert.equal(audits.filter((a) => a.action === "ADMIN_REACTIVATED").length, 0);
}));

test("outer rollback removes deletion decision, archive, and audit together", { skip: !testUrl }, async () => fixture(async (c) => {
  const id = await verified(c);
  await assert.rejects(c.db.transaction(async (tx) => {
    await reviewAdminDeletion(tx as never, c.adminId, id, c.reviewerId, "APPROVED", "rollback");
    throw new Error("rollback");
  }), /rollback/);
  const [request] = await c.db.select().from(adminDeletionRequests).where(eq(adminDeletionRequests.id, id));
  const [admin] = await c.db.select().from(admins).where(eq(admins.id, c.adminId));
  assert.equal(request.status, "PENDING"); assert.equal(admin.deletedAt, null);
  assert.equal((await c.db.select().from(adminArchives).where(eq(adminArchives.adminId, c.adminId))).length, 0);
  assert.equal((await publicRows(c)).length, 1);
  const audits = await c.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, c.adminId));
  assert.equal(audits.filter((a) => a.action === "ADMIN_ARCHIVED" || a.action === "ADMIN_DELETION_APPROVED").length, 0);
}));
