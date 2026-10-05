/**
 * PostgreSQL integration tests for Super Admin read-only oversight queries:
 * listRolePermissions and listAdminLifecycleRequests.
 *
 * Guard: only runs against the local ownline_checkout_test database
 * (127.0.0.1:5432). Never Aiven / production.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../../db";
import { users } from "../../db/schema/auth";
import { admins } from "../../db/schema/rbac";
import {
  adminArchives,
  adminDeletionRequests,
  adminRecoveryRequests,
} from "../../db/schema/admin-lifecycle";
import {
  listAdminLifecycleRequests,
  listRolePermissions,
} from "./super-admin-oversight.service";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;

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

type Db = ReturnType<typeof createDb>["db"];

async function makeLifecycleFixture(db: Db) {
  const tag = randomUUID().slice(0, 8);
  const userA = `sa-life-a-${tag}`;
  const userB = `sa-life-b-${tag}`;
  const adminA = randomUUID();
  const adminB = randomUUID();
  const deletionA = randomUUID();
  const deletionB = randomUUID();
  const archiveB = randomUUID();
  const recoveryB = randomUUID();
  const t0 = new Date("2030-01-01T00:00:00Z");
  const t1 = new Date("2030-01-02T00:00:00Z");
  await db.transaction(async (tx) => {
    await tx.insert(users).values([
      { id: userA, name: "Life A", email: `${userA}@example.invalid`, status: "ACTIVE" },
      { id: userB, name: "Life B", email: `${userB}@example.invalid`, status: "SUSPENDED" },
    ]);
    await tx.insert(admins).values([
      { id: adminA, userId: userA, status: "ACTIVE" },
      { id: adminB, userId: userB, status: "SUSPENDED", deletedAt: t0 },
    ]);
    // A: open (unverified) deletion request, newest.
    await tx.insert(adminDeletionRequests).values({
      id: deletionA,
      adminId: adminA,
      status: "REQUESTED",
      reason: "fixture",
      requestedAt: t1,
    });
    // B: approved deletion -> archive -> pending recovery.
    await tx.insert(adminDeletionRequests).values({
      id: deletionB,
      adminId: adminB,
      status: "APPROVED",
      reason: "fixture",
      requestedAt: t0,
      verifiedAt: t0,
      reviewedAt: t0,
      completedAt: t0,
    });
    await tx.insert(adminArchives).values({
      id: archiveB,
      adminId: adminB,
      deletionRequestId: deletionB,
      categoryManifest: [],
      createdAt: t0,
    });
    await tx.insert(adminRecoveryRequests).values({
      id: recoveryB,
      archiveId: archiveB,
      adminId: adminB,
      status: "PENDING",
      reason: "fixture",
      requestedAt: t1,
    });
  });
  return { tag, userA, userB, adminA, adminB, deletionA, deletionB, archiveB, recoveryB };
}

async function cleanup(db: Db, f: Awaited<ReturnType<typeof makeLifecycleFixture>>) {
  await db.transaction(async (tx) => {
    await tx.delete(adminRecoveryRequests).where(eq(adminRecoveryRequests.id, f.recoveryB));
    await tx.delete(adminArchives).where(eq(adminArchives.id, f.archiveB));
    await tx
      .delete(adminDeletionRequests)
      .where(inArray(adminDeletionRequests.id, [f.deletionA, f.deletionB]));
    await tx.delete(admins).where(inArray(admins.id, [f.adminA, f.adminB]));
    await tx.delete(users).where(inArray(users.id, [f.userA, f.userB]));
  });
}

async function withFixture(
  run: (db: Db, f: Awaited<ReturnType<typeof makeLifecycleFixture>>) => Promise<void>,
) {
  const { db, client } = createDb(testUrl!);
  try {
    const f = await makeLifecycleFixture(db);
    try {
      await run(db, f);
    } finally {
      await cleanup(db, f);
    }
  } finally {
    await client.end({ timeout: 1 });
  }
}

test("listRolePermissions returns roles with sorted grant keys and definitions", { skip: !testUrl }, async () => {
  const { db, client } = createDb(testUrl!);
  try {
    const result = await listRolePermissions(db);
    assert.ok(Array.isArray(result.roles));
    assert.ok(Array.isArray(result.permissions));
    const names = result.roles.map((r) => r.name);
    assert.deepEqual(names, [...names].sort(), "roles ordered by name");
    const keys = result.permissions.map((p) => p.key);
    assert.deepEqual(keys, [...keys].sort(), "permissions ordered by key");
    for (const role of result.roles) {
      assert.deepEqual(role.permissions, [...role.permissions].sort());
      for (const key of role.permissions) assert.ok(keys.includes(key));
    }
    assert.ok(!JSON.stringify(result).toLowerCase().includes("password"));
  } finally {
    await client.end({ timeout: 1 });
  }
});

test("lifecycle DELETION list includes open request with admin identity", { skip: !testUrl }, () =>
  withFixture(async (db, f) => {
    const rows = await listAdminLifecycleRequests(db, { type: "DELETION", status: "REQUESTED", limit: 50, offset: 0 });
    const row = rows.find((r) => r.id === f.deletionA);
    assert.ok(row, "open deletion request discoverable");
    assert.equal(row.type, "DELETION");
    assert.equal(row.adminId, f.adminA);
    assert.equal(row.userEmail, `${f.userA}@example.invalid`);
    assert.equal(row.verifiedAt, null);
    assert.ok(!rows.some((r) => r.id === f.deletionB), "status filter excludes APPROVED");
  }));

test("lifecycle RECOVERY list includes pending request for archived admin", { skip: !testUrl }, () =>
  withFixture(async (db, f) => {
    const rows = await listAdminLifecycleRequests(db, { type: "RECOVERY", status: "PENDING", limit: 50, offset: 0 });
    const row = rows.find((r) => r.id === f.recoveryB);
    assert.ok(row);
    assert.equal(row.type, "RECOVERY");
    assert.equal(row.adminStatus, "SUSPENDED");
    assert.equal(row.archiveId, f.archiveB);
    const rejected = await listAdminLifecycleRequests(db, { type: "RECOVERY", status: "REJECTED", limit: 50, offset: 0 });
    assert.ok(!rejected.some((r) => r.id === f.recoveryB));
  }));

test("lifecycle list ordering is deterministic and pagination is bounded", { skip: !testUrl }, () =>
  withFixture(async (db, f) => {
    const all = await listAdminLifecycleRequests(db, { type: "DELETION", limit: 50, offset: 0 });
    const iA = all.findIndex((r) => r.id === f.deletionA);
    const iB = all.findIndex((r) => r.id === f.deletionB);
    assert.ok(iA >= 0 && iB >= 0 && iA < iB, "newer requestedAt first");
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1].requestedAt.getTime();
      const cur = all[i].requestedAt.getTime();
      assert.ok(prev > cur || (prev === cur && all[i - 1].id < all[i].id));
    }
    const again = await listAdminLifecycleRequests(db, { type: "DELETION", limit: 50, offset: 0 });
    assert.deepEqual(again.map((r) => r.id), all.map((r) => r.id));
    const page1 = await listAdminLifecycleRequests(db, { type: "DELETION", limit: 1, offset: 0 });
    const page2 = await listAdminLifecycleRequests(db, { type: "DELETION", limit: 1, offset: 1 });
    assert.equal(page1.length, 1);
    assert.equal(page1[0].id, all[0].id);
    if (all.length > 1) assert.equal(page2[0].id, all[1].id);
  }));
