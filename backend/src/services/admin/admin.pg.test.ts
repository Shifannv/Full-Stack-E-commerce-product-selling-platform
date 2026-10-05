import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { and, eq, like, sql } from "drizzle-orm";
import { createDb } from "../../db";
import {
  adminAddresses,
  adminAuditEvents,
  adminCategoryAssignments,
  adminKycDocuments,
  adminKycSubmissions,
} from "../../db/schema/admin";
import { accounts, users, verifications } from "../../db/schema/auth";
import {
  categories,
  inventories,
  productAdmins,
  products,
  subcategories,
} from "../../db/schema/catalog";
import { admins } from "../../db/schema/rbac";
import { reviewApplication, setCategoryAssignment } from "./admin.service";
import { getProductInventory, setProductInventory, updateProduct } from "./catalog.service";
import { transitionAdminStatus } from "./account-state.service";
import { getSuperAdminSummary } from "./summary.service";
import { listAdmins } from "./admins-list.service";
import { isAdminStatusFilter } from "../../routes/super-admin/dashboard";
import {
  activateAdminAccount,
  peekInvitation,
  reissueInvitation,
} from "./invitation.service";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;

test("submitted applications appear in the pending approval metric and status filter", { skip: !testUrl }, async () => {
  assert.equal(isAdminStatusFilter("PENDING_SUPER_ADMIN_APPROVAL"), true);
  assert.equal(isAdminStatusFilter("NOT_A_STATUS"), false);
  await fixture(async (c) => {
    const before = await getSuperAdminSummary(c.db);
    await prepareReview(c);
    const after = await getSuperAdminSummary(c.db);
    assert.equal(after.admins.pending, before.admins.pending + 1);
    const listed = await listAdmins(c.db, {
      status: "PENDING_SUPER_ADMIN_APPROVAL", limit: 50, offset: 0,
    });
    assert.ok(listed.some((row) => row.id === c.adminId));
  });
});
if (testUrl) {
  const target = new URL(testUrl);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "5432" ||
    target.pathname !== "/ownline_checkout_test" ||
    decodeURIComponent(target.username) !== "postgres"
  )
    throw new Error("Unexpected checkout test database target");
  if (process.env.DATABASE_URL) {
    const shared = new URL(process.env.DATABASE_URL);
    if (target.host === shared.host && target.pathname === shared.pathname)
      throw new Error("Checkout tests require a dedicated database");
  }
}

test("inventory read returns current version and rejects foreign ownership and revoked scope", { skip: !testUrl }, async () => {
  await fixture(async (c) => {
    const before = await getProductInventory(c.db, c.adminId, c.productId);
    assert.equal(before.length, 1);
    assert.equal(before[0].version, 0);
    assert.equal(before[0].availableQuantity, 10);
    assert.equal(before[0].reservedQuantity, 0);
    await setProductInventory(c.db, c.adminId, c.productId, 7, undefined, before[0].version);
    const after = await getProductInventory(c.db, c.adminId, c.productId);
    assert.equal(after[0].version, 1);
    assert.equal(after[0].availableQuantity, 7);
    await assert.rejects(getProductInventory(c.db, randomUUID(), c.productId), (error: unknown) => (error as {status:number}).status === 404);
    await c.db.update(adminCategoryAssignments).set({status:"REVOKED"}).where(and(eq(adminCategoryAssignments.adminId,c.adminId),eq(adminCategoryAssignments.categoryId,c.categoryId)));
    await assert.rejects(getProductInventory(c.db, c.adminId, c.productId));
  });
});

async function fixture(
  run: (c: Awaited<ReturnType<typeof makeFixture>>) => Promise<void>,
  pendingUser = false,
) {
  if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL is required");
  const c = await makeFixture(pendingUser);
  try {
    await run(c);
  } finally {
    await c.cleanup();
  }
}

async function makeFixture(pendingUser: boolean) {
  const first = createDb(testUrl!),
    second = createDb(testUrl!);
  const id = randomUUID(),
    adminId = randomUUID(),
    categoryId = randomUUID(),
    subcategoryId = randomUUID(),
    productId = randomUUID();
  const sellerId = `admin-race-seller-${id}`,
    reviewerId = `admin-race-reviewer-${id}`;
  const email = `${sellerId}@example.invalid`;
  try {
    await first.db.transaction(async (tx) => {
      await tx.insert(users).values([
        {
          id: sellerId,
          name: "Seller",
          email,
          status: pendingUser ? "PENDING" : "ACTIVE",
        },
        {
          id: reviewerId,
          name: "Reviewer",
          email: `${reviewerId}@example.invalid`,
        },
      ]);
      await tx.insert(admins).values({
        id: adminId,
        userId: sellerId,
        status: pendingUser ? "DRAFT" : "ACTIVE",
      });
      await tx.insert(categories).values({
        id: categoryId,
        name: "Admin race",
        slug: `admin-race-${id}`,
        status: "PUBLISHED",
      });
      await tx.insert(subcategories).values({
        id: subcategoryId,
        categoryId,
        name: "Subcategory",
        slug: "subcategory",
        status: "PUBLISHED",
      });
      await tx
        .insert(adminCategoryAssignments)
        .values({ adminId, categoryId, status: "ACTIVE" });
      await tx.insert(products).values({
        id: productId,
        categoryId,
        subcategoryId,
        createdByAdminId: adminId,
        name: "Product",
        slug: `admin-race-${id}`,
        price: "10.00",
        attributes: {},
      });
      await tx.insert(productAdmins).values({ adminId, productId });
      await tx.insert(inventories).values({ productId, availableQuantity: 10 });
      await tx.insert(adminKycSubmissions).values({
        adminId,
        status: "APPROVED",
        legalName: "Seller",
        businessType: "PERSON",
        contactPhone: "9999999999",
      });
    });
  } catch (error) {
    await Promise.all([
      first.client.end({ timeout: 1 }),
      second.client.end({ timeout: 1 }),
    ]);
    throw error;
  }
  return {
    db: first.db,
    other: second.db,
    adminId,
    categoryId,
    productId,
    sellerId,
    reviewerId,
    email,
    async cleanup() {
      try {
        await first.db.transaction(async (tx) => {
          await tx
            .delete(verifications)
            .where(
              and(
                like(verifications.identifier, "invite:%"),
                sql`${verifications.value}::jsonb ->> 'adminId' = ${adminId}`,
              ),
            );
          await tx.delete(accounts).where(eq(accounts.userId, sellerId));
          await tx
            .delete(adminAuditEvents)
            .where(eq(adminAuditEvents.adminId, adminId));
          await tx
            .delete(adminKycDocuments)
            .where(
              sql`${adminKycDocuments.submissionId} in (select id from admin_kyc_submissions where admin_id = ${adminId})`,
            );
          await tx
            .delete(adminKycSubmissions)
            .where(eq(adminKycSubmissions.adminId, adminId));
          await tx
            .delete(adminAddresses)
            .where(eq(adminAddresses.adminId, adminId));
          await tx
            .delete(inventories)
            .where(eq(inventories.productId, productId));
          await tx
            .delete(productAdmins)
            .where(eq(productAdmins.productId, productId));
          await tx.delete(products).where(eq(products.id, productId));
          await tx
            .delete(adminCategoryAssignments)
            .where(eq(adminCategoryAssignments.adminId, adminId));
          await tx
            .delete(subcategories)
            .where(eq(subcategories.id, subcategoryId));
          await tx.delete(categories).where(eq(categories.id, categoryId));
          await tx.delete(admins).where(eq(admins.id, adminId));
          await tx.delete(users).where(eq(users.id, sellerId));
          await tx.delete(users).where(eq(users.id, reviewerId));
        });
      } finally {
        await Promise.all([
          first.client.end({ timeout: 1 }),
          second.client.end({ timeout: 1 }),
        ]);
      }
    },
  };
}

async function prepareReview(c: Awaited<ReturnType<typeof makeFixture>>) {
  await c.db
    .update(admins)
    .set({ status: "PENDING_SUPER_ADMIN_APPROVAL" })
    .where(eq(admins.id, c.adminId));
  const [kyc] = await c.db
    .update(adminKycSubmissions)
    .set({ status: "PENDING_SUPER_ADMIN_APPROVAL" })
    .where(eq(adminKycSubmissions.adminId, c.adminId))
    .returning();
  await c.db
    .update(adminCategoryAssignments)
    .set({ status: "REQUESTED" })
    .where(eq(adminCategoryAssignments.adminId, c.adminId));
  await c.db.insert(adminAddresses).values(
    ["SHIPPING_ORIGIN", "RETURN"].map((addressType) => ({
      adminId: c.adminId,
      addressType,
      contactName: "Seller",
      phone: "9999999999",
      line1: "Street",
      city: "Delhi",
      state: "Delhi",
      postalCode: "110001",
      country: "IN",
    })),
  );
  await c.db.insert(adminKycDocuments).values({
    submissionId: kyc.id,
    documentType: "IDENTITY",
    privateObjectKey: `admin/${c.adminId}/test`,
  });
}

async function waitForBlockedPid(
  tx: Parameters<
    Parameters<Awaited<ReturnType<typeof makeFixture>>["db"]["transaction"]>[0]
  >[0],
  pid: number,
) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const [row] = await tx.execute(
      sql`select cardinality(pg_blocking_pids(${pid})) as blockers`,
    );
    if (Number(row.blockers) > 0) return;
    if (Date.now() > deadline)
      throw new Error(
        "Expected independent Admin write to wait for the state lock",
      );
  }
}

for (const [name, left, right] of [
  ["approve/reject", "APPROVED", "REJECTED"],
  ["approve/approve", "APPROVED", "APPROVED"],
  ["reject/reject", "REJECTED", "REJECTED"],
  ["approve/changes", "APPROVED", "CHANGES_REQUIRED"],
] as const) {
  test(
    `Admin review ${name} commits one decision and audit`,
    { skip: !testUrl },
    async () =>
      fixture(async (c) => {
        await prepareReview(c);
        const outcomes = await Promise.allSettled([
          reviewApplication(c.db, c.adminId, c.reviewerId, left, "first"),
          reviewApplication(c.other, c.adminId, c.reviewerId, right, "second"),
        ]);
        assert.equal(
          outcomes.filter((r) => r.status === "fulfilled").length,
          1,
        );
        assert.equal(
          outcomes.filter(
            (r) =>
              r.status === "rejected" &&
              (r.reason as { status?: number }).status === 409,
          ).length,
          1,
        );
        const [kyc] = await c.db
          .select()
          .from(adminKycSubmissions)
          .where(eq(adminKycSubmissions.adminId, c.adminId));
        const [admin] = await c.db
          .select()
          .from(admins)
          .where(eq(admins.id, c.adminId));
        const [assignment] = await c.db
          .select()
          .from(adminCategoryAssignments)
          .where(eq(adminCategoryAssignments.adminId, c.adminId));
        const audits = await c.db
          .select()
          .from(adminAuditEvents)
          .where(eq(adminAuditEvents.adminId, c.adminId));
        assert.equal(audits.length, 1);
        assert.equal(audits[0].actorUserId, c.reviewerId);
        assert.ok(audits[0].changedFields.includes(kyc.status));
        assert.equal(
          admin.status,
          kyc.status === "APPROVED" ? "ACTIVE" : kyc.status,
        );
        assert.equal(
          assignment.status,
          kyc.status === "APPROVED" ? "ACTIVE" : "REQUESTED",
        );
        await assert.rejects(
          reviewApplication(c.db, c.adminId, c.reviewerId, left, "duplicate"),
          { status: 409 },
        );
        assert.equal(
          (
            await c.db
              .select()
              .from(adminAuditEvents)
              .where(eq(adminAuditEvents.adminId, c.adminId))
          ).length,
          1,
        );
      }),
  );
}

test(
  "Admin review rollback leaves status, grants, and audit unchanged",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      await prepareReview(c);
      await assert.rejects(
        c.db.transaction(async (tx) => {
          await reviewApplication(
            tx as never,
            c.adminId,
            c.reviewerId,
            "APPROVED",
            "rollback",
          );
          throw new Error("rollback");
        }),
        /rollback/,
      );
      const [kyc] = await c.db
        .select()
        .from(adminKycSubmissions)
        .where(eq(adminKycSubmissions.adminId, c.adminId));
      const [assignment] = await c.db
        .select()
        .from(adminCategoryAssignments)
        .where(eq(adminCategoryAssignments.adminId, c.adminId));
      assert.equal(kyc.status, "PENDING_SUPER_ADMIN_APPROVAL");
      assert.equal(assignment.status, "REQUESTED");
      assert.equal(
        (
          await c.db
            .select()
            .from(adminAuditEvents)
            .where(eq(adminAuditEvents.adminId, c.adminId))
        ).length,
        0,
      );
    }),
);

test(
  "application approval and suspension cannot overwrite each other",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      await prepareReview(c);
      const results = await Promise.allSettled([
        reviewApplication(
          c.db,
          c.adminId,
          c.reviewerId,
          "APPROVED",
          "approved",
        ),
        transitionAdminStatus(
          c.other,
          c.adminId,
          c.reviewerId,
          "SUSPEND",
          "suspend after approval",
        ),
      ]);
      assert.equal(results[0].status, "fulfilled");
      if (results[1].status === "rejected")
        assert.equal((results[1].reason as { status?: number }).status, 409);
      const [admin] = await c.db
        .select()
        .from(admins)
        .where(eq(admins.id, c.adminId));
      const [kyc] = await c.db
        .select()
        .from(adminKycSubmissions)
        .where(eq(adminKycSubmissions.adminId, c.adminId));
      const [assignment] = await c.db
        .select()
        .from(adminCategoryAssignments)
        .where(eq(adminCategoryAssignments.adminId, c.adminId));
      const audits = await c.db
        .select()
        .from(adminAuditEvents)
        .where(eq(adminAuditEvents.adminId, c.adminId));
      assert.equal(kyc.status, "APPROVED");
      assert.equal(assignment.status, "ACTIVE");
      assert.equal(
        admin.status,
        results[1].status === "fulfilled" ? "SUSPENDED" : "ACTIVE",
      );
      assert.equal(
        audits.filter((a) => a.action === "APPLICATION_REVIEWED").length,
        1,
      );
      assert.equal(
        audits.filter((a) => a.action === "ADMIN_SUSPENDED").length,
        results[1].status === "fulfilled" ? 1 : 0,
      );
    }),
);

test(
  "category revocation serializes with product and inventory writes",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      const productRace = await Promise.allSettled([
        updateProduct(c.db, c.adminId, c.productId, {
          name: "Before revocation",
        }),
        setCategoryAssignment(
          c.other,
          c.adminId,
          c.categoryId,
          c.reviewerId,
          false,
          "scope revoked",
        ),
      ]);
      assert.equal(productRace[1].status, "fulfilled");
      if (productRace[0].status === "rejected")
        assert.equal(
          (productRace[0].reason as { status?: number }).status,
          403,
        );
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, {
          name: "After revocation",
        }),
        { status: 403 },
      );
      await assert.rejects(
        setProductInventory(c.db, c.adminId, c.productId, 5, undefined, 0),
        { status: 403 },
      );
      await setCategoryAssignment(
        c.db,
        c.adminId,
        c.categoryId,
        c.reviewerId,
        true,
        "scope restored",
      );
      const inventoryRace = await Promise.allSettled([
        setProductInventory(c.db, c.adminId, c.productId, 5, undefined, 0),
        setCategoryAssignment(
          c.other,
          c.adminId,
          c.categoryId,
          c.reviewerId,
          false,
          "scope revoked again",
        ),
      ]);
      assert.equal(inventoryRace[1].status, "fulfilled");
      if (inventoryRace[0].status === "rejected")
        assert.equal(
          (inventoryRace[0].reason as { status?: number }).status,
          403,
        );
      const [inventory] = await c.db
        .select()
        .from(inventories)
        .where(eq(inventories.productId, c.productId));
      assert.equal(
        inventory.availableQuantity,
        inventoryRace[0].status === "fulfilled" ? 5 : 10,
      );
    }),
);

test(
  "committed category revocation wins before waiting product and inventory writes",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      for (const write of [
        (tx: typeof c.other) =>
          updateProduct(tx, c.adminId, c.productId, {
            name: "Waiting product",
          }),
        (tx: typeof c.other) =>
          setProductInventory(tx, c.adminId, c.productId, 6, undefined, 0),
      ]) {
        let publishPid!: (pid: number) => void;
        const pidReady = new Promise<number>((resolve) => {
          publishPid = resolve;
        });
        let waiting!: Promise<unknown>;
        await c.db.transaction(async (tx) => {
          await setCategoryAssignment(
            tx as never,
            c.adminId,
            c.categoryId,
            c.reviewerId,
            false,
            "revocation first",
          );
          waiting = c.other.transaction(async (otherTx) => {
            const [row] = await otherTx.execute(
              sql`select pg_backend_pid() as pid`,
            );
            publishPid(Number(row.pid));
            return write(otherTx as never);
          });
          await waitForBlockedPid(tx, await pidReady);
        });
        await assert.rejects(waiting, { status: 403 });
        await setCategoryAssignment(
          c.db,
          c.adminId,
          c.categoryId,
          c.reviewerId,
          true,
          "restore for next case",
        );
      }
    }),
);

test(
  "committed suspension wins before a waiting catalog write",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      let publishPid!: (pid: number) => void;
      const pidReady = new Promise<number>((resolve) => {
        publishPid = resolve;
      });
      let waiting!: Promise<unknown>;
      await c.db.transaction(async (tx) => {
        await transitionAdminStatus(
          tx as never,
          c.adminId,
          c.reviewerId,
          "SUSPEND",
          "suspension first",
        );
        waiting = c.other.transaction(async (otherTx) => {
          const [row] = await otherTx.execute(
            sql`select pg_backend_pid() as pid`,
          );
          publishPid(Number(row.pid));
          return updateProduct(otherTx as never, c.adminId, c.productId, {
            name: "Waiting on suspension",
          });
        });
        await waitForBlockedPid(tx, await pidReady);
      });
      await assert.rejects(waiting, { status: 403 });
    }),
);

test(
  "concurrent category assignment decisions remain serialized and audited",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      const results = await Promise.allSettled([
        setCategoryAssignment(
          c.db,
          c.adminId,
          c.categoryId,
          c.reviewerId,
          false,
          "reviewer revoke",
        ),
        setCategoryAssignment(
          c.other,
          c.adminId,
          c.categoryId,
          c.reviewerId,
          true,
          "reviewer grant",
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
      const [assignment] = await c.db
        .select()
        .from(adminCategoryAssignments)
        .where(eq(adminCategoryAssignments.adminId, c.adminId));
      const audits = await c.db
        .select()
        .from(adminAuditEvents)
        .where(eq(adminAuditEvents.adminId, c.adminId));
      assert.equal(audits.length, 2);
      assert.equal(
        audits.filter((a) => a.action === "CATEGORY_ASSIGNED").length,
        1,
      );
      assert.equal(
        audits.filter((a) => a.action === "CATEGORY_REVOKED").length,
        1,
      );
      assert.ok(["ACTIVE", "REVOKED"].includes(assignment.status));
      if (assignment.status === "REVOKED")
        await assert.rejects(
          updateProduct(c.db, c.adminId, c.productId, { name: "Denied" }),
          { status: 403 },
        );
    }),
);

test(
  "suspension, deletion, and recovery block protected writes",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      const race = await Promise.allSettled([
        updateProduct(c.db, c.adminId, c.productId, { name: "Status race" }),
        transitionAdminStatus(
          c.other,
          c.adminId,
          c.reviewerId,
          "SUSPEND",
          "review",
        ),
      ]);
      assert.equal(race[1].status, "fulfilled");
      if (race[0].status === "rejected")
        assert.equal((race[0].reason as { status?: number }).status, 403);
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, { name: "Suspended" }),
        { status: 403 },
      );
      await assert.rejects(
        transitionAdminStatus(
          c.db,
          c.adminId,
          c.reviewerId,
          "SUSPEND",
          "stale",
        ),
        { status: 409 },
      );
      await transitionAdminStatus(
        c.db,
        c.adminId,
        c.reviewerId,
        "RECOVER",
        "verified",
      );
      await c.other
        .update(admins)
        .set({ deletedAt: new Date() })
        .where(eq(admins.id, c.adminId));
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, { name: "Deleted" }),
        { status: 403 },
      );
      await assert.rejects(
        transitionAdminStatus(
          c.db,
          c.adminId,
          c.reviewerId,
          "SUSPEND",
          "deleted",
        ),
        { status: 403 },
      );
      await assert.rejects(
        transitionAdminStatus(
          c.db,
          c.adminId,
          c.reviewerId,
          "RECOVER",
          "deleted",
        ),
        { status: 403 },
      );
      const audits = await c.db
        .select()
        .from(adminAuditEvents)
        .where(eq(adminAuditEvents.adminId, c.adminId));
      assert.equal(
        audits.filter((a) => a.action === "ADMIN_SUSPENDED").length,
        1,
      );
      assert.equal(
        audits.filter((a) => a.action === "ADMIN_RECOVERED").length,
        1,
      );
    }),
);

test(
  "account deletion racing recovery never restores a deleted Admin",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      await transitionAdminStatus(
        c.db,
        c.adminId,
        c.reviewerId,
        "SUSPEND",
        "suspend",
      );
      const results = await Promise.allSettled([
        transitionAdminStatus(
          c.db,
          c.adminId,
          c.reviewerId,
          "RECOVER",
          "recover",
        ),
        c.other
          .update(admins)
          .set({ deletedAt: new Date() })
          .where(eq(admins.id, c.adminId)),
      ]);
      assert.equal(results[1].status, "fulfilled");
      if (results[0].status === "rejected")
        assert.equal((results[0].reason as { status?: number }).status, 403);
      const [admin] = await c.db
        .select()
        .from(admins)
        .where(eq(admins.id, c.adminId));
      assert.ok(admin.deletedAt);
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, { name: "After deletion" }),
        { status: 403 },
      );
      await assert.rejects(
        transitionAdminStatus(
          c.db,
          c.adminId,
          c.reviewerId,
          "RECOVER",
          "stale recovery",
        ),
        { status: 403 },
      );
    }),
);

test(
  "deleted or suspended user account cannot write through an active Admin profile",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      await c.db
        .update(users)
        .set({ status: "SUSPENDED" })
        .where(eq(users.id, c.sellerId));
      await assert.rejects(
        updateProduct(c.other, c.adminId, c.productId, {
          name: "Suspended user",
        }),
        { status: 403 },
      );
      await c.db
        .update(users)
        .set({ status: "ACTIVE", deletedAt: new Date() })
        .where(eq(users.id, c.sellerId));
      await assert.rejects(
        setProductInventory(c.other, c.adminId, c.productId, 5, undefined, 0),
        { status: 403 },
      );
    }),
);

test(
  "concurrent invitation reissue leaves one active token",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      const results = await Promise.all([
        reissueInvitation(c.db, {
          email: c.email,
          invitedByUserId: c.reviewerId,
        }),
        reissueInvitation(c.other, {
          email: c.email,
          invitedByUserId: c.reviewerId,
        }),
      ]);
      const rows = await c.db
        .select()
        .from(verifications)
        .where(
          and(
            like(verifications.identifier, "invite:%"),
            sql`${verifications.value}::jsonb ->> 'adminId' = ${c.adminId}`,
          ),
        );
      assert.equal(rows.length, 1);
      assert.ok(!rows[0].identifier.includes(results[0].rawToken));
      const valid = await Promise.allSettled(
        results.map((r) => peekInvitation(c.db, r.rawToken)),
      );
      assert.equal(valid.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await c.db
            .select()
            .from(adminAuditEvents)
            .where(eq(adminAuditEvents.adminId, c.adminId))
        ).length,
        2,
      );
    }, true),
);

test(
  "invitation activation and reissue cannot both consume an old token",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      const initial = await reissueInvitation(c.db, {
        email: c.email,
        invitedByUserId: c.reviewerId,
      });
      const outcomes = await Promise.allSettled([
        activateAdminAccount(c.db, {
          rawToken: initial.rawToken,
          password: "correct horse battery staple",
        }),
        reissueInvitation(c.other, {
          email: c.email,
          invitedByUserId: c.reviewerId,
        }),
      ]);
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      const [user] = await c.db
        .select()
        .from(users)
        .where(eq(users.id, c.sellerId));
      const tokens = await c.db
        .select()
        .from(verifications)
        .where(
          and(
            like(verifications.identifier, "invite:%"),
            sql`${verifications.value}::jsonb ->> 'adminId' = ${c.adminId}`,
          ),
        );
      if (outcomes[0].status === "fulfilled") {
        assert.equal(user.status, "ACTIVE");
        assert.equal(tokens.length, 0);
        assert.equal(
          (
            await c.db
              .select()
              .from(accounts)
              .where(eq(accounts.userId, c.sellerId))
          ).length,
          1,
        );
      } else {
        assert.equal(user.status, "PENDING");
        assert.equal(tokens.length, 1);
        await assert.rejects(peekInvitation(c.db, initial.rawToken), {
          status: 404,
        });
      }
    }, true),
);

async function withOutsideAdmins(
  c: Awaited<ReturnType<typeof makeFixture>>,
  run: (ids: {
    assignedAdminId: string;
    unassignedAdminId: string;
  }) => Promise<void>,
) {
  const id = randomUUID(),
    assignedAdminId = randomUUID(),
    unassignedAdminId = randomUUID();
  const userIds = [`scope-assigned-${id}`, `scope-unassigned-${id}`];
  await c.db.transaction(async (tx) => {
    await tx.insert(users).values(
      userIds.map((userId) => ({
        id: userId,
        name: "Outside Admin",
        email: `${userId}@example.invalid`,
        status: "ACTIVE" as const,
      })),
    );
    await tx.insert(admins).values([
      { id: assignedAdminId, userId: userIds[0], status: "ACTIVE" },
      { id: unassignedAdminId, userId: userIds[1], status: "ACTIVE" },
    ]);
    await tx.insert(adminCategoryAssignments).values({
      adminId: assignedAdminId,
      categoryId: c.categoryId,
      status: "ACTIVE",
    });
  });
  try {
    await run({ assignedAdminId, unassignedAdminId });
  } finally {
    await c.db.transaction(async (tx) => {
      await tx
        .delete(adminAuditEvents)
        .where(
          sql`${adminAuditEvents.adminId} in (${assignedAdminId}, ${unassignedAdminId})`,
        );
      await tx
        .delete(adminCategoryAssignments)
        .where(eq(adminCategoryAssignments.adminId, assignedAdminId));
      await tx
        .delete(admins)
        .where(sql`${admins.id} in (${assignedAdminId}, ${unassignedAdminId})`);
      await tx
        .delete(users)
        .where(sql`${users.id} in (${userIds[0]}, ${userIds[1]})`);
    });
  }
}

test(
  "cross-Admin product update is indistinguishable from a missing product",
  { skip: !testUrl },
  async () =>
    fixture(async (c) =>
      withOutsideAdmins(c, async ({ assignedAdminId, unassignedAdminId }) => {
        const missing = await updateProduct(
          c.db,
          assignedAdminId,
          randomUUID(),
          { name: "Probe" },
        ).catch((error: { status?: number; message?: string }) => error);
        assert.equal((missing as { status?: number }).status, 404);
        for (const outsider of [assignedAdminId, unassignedAdminId]) {
          for (const input of [
            { name: "Hijacked" },
            { categoryId: c.categoryId },
            { attributes: { bogus: 1 } },
            { returnEnabled: true },
          ]) {
            const denied = (await updateProduct(
              c.db,
              outsider,
              c.productId,
              input,
            ).catch(
              (error: { status?: number; message?: string }) => error,
            )) as { status?: number; message?: string };
            assert.equal(denied.status, 404);
            assert.equal(
              denied.message,
              (missing as { message?: string }).message,
            );
          }
        }
        const [row] = await c.db
          .select({ name: products.name })
          .from(products)
          .where(eq(products.id, c.productId));
        assert.equal(row.name, "Product");
      }),
    ),
);

test(
  "owning Admin can still update a product and keeps existing validation errors",
  { skip: !testUrl },
  async () =>
    fixture(async (c) => {
      const updated = await updateProduct(c.db, c.adminId, c.productId, {
        name: "Owner update",
      });
      assert.equal(updated.name, "Owner update");
      const [audit] = await c.db
        .select()
        .from(adminAuditEvents)
        .where(
          and(
            eq(adminAuditEvents.adminId, c.adminId),
            eq(adminAuditEvents.action, "PRODUCT_UPDATED"),
          ),
        );
      assert.ok(audit);
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, {
          categoryId: c.categoryId,
        }),
        { status: 422 },
      );
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, { returnEnabled: true }),
        { status: 422 },
      );
      await assert.rejects(
        updateProduct(c.db, c.adminId, c.productId, { returnEnabled: "yes" }),
        { status: 422 },
      );
    }),
);
