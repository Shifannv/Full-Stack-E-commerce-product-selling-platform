/**
 * PostgreSQL integration tests for Super Admin catalog discovery and payout
 * list service functions.
 *
 * Guard: only runs when CHECKOUT_TEST_DATABASE_URL points to the local
 * ownline_checkout_test database (127.0.0.1:5432/ownline_checkout_test).
 * Never runs against Aiven / production.
 *
 * Tests:
 *  listSuperAdminProducts
 *    - returns products regardless of status (DRAFT visible)
 *    - filters by status=DRAFT / status=PUBLISHED
 *    - filters by adminId
 *    - filters by categoryId
 *    - respects limit / offset pagination
 *    - search by name (q)
 *    - returns empty when no match
 *
 *  listSuperAdminPayouts
 *    - returns all payout requests when no filter
 *    - filters by status=REQUESTED
 *    - filters by adminId
 *    - respects limit / offset pagination
 *    - returns empty when status does not match
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../../db";
import {
  adminCategoryAssignments,
  adminKycSubmissions,
} from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import {
  categories,
  inventories,
  productAdmins,
  products,
  subcategories,
} from "../../db/schema/catalog";
import { adminSettlements, payoutRequests } from "../../db/schema/finance";
import { admins } from "../../db/schema/rbac";
import { listSuperAdminProducts } from "./catalog.service";
import { listSuperAdminPayouts } from "./finance.service";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;

// Safety guard: ensure this test only targets the local test database.
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

// ---------------------------------------------------------------------------
// Product fixture
// ---------------------------------------------------------------------------

async function makeProductFixture(db: ReturnType<typeof createDb>["db"]) {
  const id = randomUUID().slice(0, 8);
  const sellerId = `sa-test-seller-${id}`;
  const adminId = randomUUID();
  const categoryId = randomUUID();
  const subcategoryId = randomUUID();
  const productId = randomUUID();
  const productId2 = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(users).values([
      {
        id: sellerId,
        name: "SA Seller",
        email: `${sellerId}@example.invalid`,
        status: "ACTIVE",
      },
    ]);
    await tx
      .insert(admins)
      .values({ id: adminId, userId: sellerId, status: "ACTIVE" });
    await tx.insert(categories).values({
      id: categoryId,
      name: `SATestCat-${id}`,
      slug: `sa-test-cat-${id}`,
      status: "PUBLISHED",
    });
    await tx.insert(subcategories).values({
      id: subcategoryId,
      categoryId,
      name: `SATestSub-${id}`,
      slug: `sa-test-sub-${id}`,
      status: "PUBLISHED",
    });
    await tx.insert(adminKycSubmissions).values({
      adminId,
      legalName: "SA Seller Co",
      businessType: "INDIVIDUAL",
      contactPhone: "9000000000",
    });
    await tx
      .insert(adminCategoryAssignments)
      .values({ adminId, categoryId, status: "ACTIVE" });
    // DRAFT product
    await tx.insert(products).values({
      id: productId,
      categoryId,
      subcategoryId,
      name: `DraftProduct-${id}`,
      slug: `draft-product-${id}`,
      price: "100.00",
      status: "DRAFT",
      createdByAdminId: adminId,
    });
    await tx.insert(productAdmins).values({ productId, adminId });
    await tx.insert(inventories).values({ productId, availableQuantity: 5 });
    // PUBLISHED product
    await tx.insert(products).values({
      id: productId2,
      categoryId,
      subcategoryId,
      name: `PublishedProduct-${id}`,
      slug: `published-product-${id}`,
      price: "200.00",
      status: "PUBLISHED",
      createdByAdminId: adminId,
    });
    await tx.insert(productAdmins).values({ productId: productId2, adminId });
    await tx
      .insert(inventories)
      .values({ productId: productId2, availableQuantity: 10 });
  });

  return { db, sellerId, adminId, categoryId, subcategoryId, productId, productId2, id };
}

async function cleanupProductFixture(
  db: ReturnType<typeof createDb>["db"],
  f: Awaited<ReturnType<typeof makeProductFixture>>,
) {
  const { adminId, categoryId, subcategoryId, productId, productId2, sellerId } = f;
  await db.transaction(async (tx) => {
    await tx
      .delete(inventories)
      .where(
        sql`${inventories.productId} in (${sql.raw(`'${productId}'`)}, ${sql.raw(`'${productId2}'`)})`,
      );
    await tx
      .delete(productAdmins)
      .where(
        sql`${productAdmins.productId} in (${sql.raw(`'${productId}'`)}, ${sql.raw(`'${productId2}'`)})`,
      );
    await tx
      .delete(products)
      .where(
        sql`${products.id} in (${sql.raw(`'${productId}'`)}, ${sql.raw(`'${productId2}'`)})`,
      );
    await tx
      .delete(adminCategoryAssignments)
      .where(eq(adminCategoryAssignments.adminId, adminId));
    await tx
      .delete(adminKycSubmissions)
      .where(eq(adminKycSubmissions.adminId, adminId));
    await tx.delete(subcategories).where(eq(subcategories.id, subcategoryId));
    await tx.delete(categories).where(eq(categories.id, categoryId));
    await tx.delete(admins).where(eq(admins.id, adminId));
    await tx.delete(users).where(eq(users.id, sellerId));
  });
}

// ---------------------------------------------------------------------------
// Payout fixture
// ---------------------------------------------------------------------------

async function makePayoutFixture(db: ReturnType<typeof createDb>["db"]) {
  const id = randomUUID().slice(0, 8);
  const sellerId = `sa-payout-${id}`;
  const adminId = randomUUID();
  const categoryId = randomUUID();
  const subcategoryId = randomUUID();
  const productId = randomUUID();
  const payoutId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: sellerId,
      name: "SA PayoutSeller",
      email: `${sellerId}@example.invalid`,
      status: "ACTIVE",
    });
    await tx
      .insert(admins)
      .values({ id: adminId, userId: sellerId, status: "ACTIVE" });
    await tx.insert(categories).values({
      id: categoryId,
      name: `SAPCat-${id}`,
      slug: `sap-cat-${id}`,
      status: "PUBLISHED",
    });
    await tx.insert(subcategories).values({
      id: subcategoryId,
      categoryId,
      name: `SAPSub-${id}`,
      slug: `sap-sub-${id}`,
      status: "PUBLISHED",
    });
    await tx
      .insert(adminCategoryAssignments)
      .values({ adminId, categoryId, status: "ACTIVE" });
    await tx.insert(products).values({
      id: productId,
      categoryId,
      subcategoryId,
      name: `PayoutProduct-${id}`,
      slug: `payout-product-${id}`,
      price: "500.00",
      status: "PUBLISHED",
      createdByAdminId: adminId,
    });
    await tx.insert(productAdmins).values({ productId, adminId });
    await tx.insert(payoutRequests).values({
      id: payoutId,
      adminId,
      amount: "450.00",
      status: "REQUESTED",
    });
  });

  return { db, sellerId, adminId, categoryId, subcategoryId, productId, payoutId, id };
}

async function cleanupPayoutFixture(
  db: ReturnType<typeof createDb>["db"],
  f: Awaited<ReturnType<typeof makePayoutFixture>>,
) {
  const { adminId, categoryId, subcategoryId, productId, payoutId, sellerId } = f;
  await db.transaction(async (tx) => {
    await tx
      .delete(adminSettlements)
      .where(eq(adminSettlements.adminId, adminId));
    await tx.delete(payoutRequests).where(eq(payoutRequests.id, payoutId));
    await tx.delete(productAdmins).where(eq(productAdmins.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
    await tx
      .delete(adminCategoryAssignments)
      .where(eq(adminCategoryAssignments.adminId, adminId));
    await tx.delete(subcategories).where(eq(subcategories.id, subcategoryId));
    await tx.delete(categories).where(eq(categories.id, categoryId));
    await tx.delete(admins).where(eq(admins.id, adminId));
    await tx.delete(users).where(eq(users.id, sellerId));
  });
}

// ---------------------------------------------------------------------------
// listSuperAdminProducts tests
// ---------------------------------------------------------------------------

test(
  "listSuperAdminProducts returns draft and published products for Super Admin",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        const result = await listSuperAdminProducts(db, {
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(
          ids.includes(f.productId),
          "DRAFT product must be visible to Super Admin",
        );
        assert.ok(
          ids.includes(f.productId2),
          "PUBLISHED product must be visible to Super Admin",
        );
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminProducts filters by status=DRAFT",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        const result = await listSuperAdminProducts(db, {
          status: "DRAFT",
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.productId));
        assert.ok(!ids.includes(f.productId2));
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminProducts filters by status=PUBLISHED",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        const result = await listSuperAdminProducts(db, {
          status: "PUBLISHED",
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.productId2));
        assert.ok(!ids.includes(f.productId));
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminProducts filters by adminId",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        const result = await listSuperAdminProducts(db, {
          adminId: f.adminId,
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.productId));
        assert.ok(ids.includes(f.productId2));

        const empty = await listSuperAdminProducts(db, {
          adminId: randomUUID(),
          limit: 50,
          offset: 0,
        });
        assert.equal(empty.length, 0);
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminProducts filters by categoryId",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        const result = await listSuperAdminProducts(db, {
          categoryId: f.categoryId,
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.productId));
        assert.ok(ids.includes(f.productId2));

        const empty = await listSuperAdminProducts(db, {
          categoryId: randomUUID(),
          limit: 50,
          offset: 0,
        });
        assert.equal(empty.length, 0);
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminProducts pagination: offset skips rows deterministically",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        const page1 = await listSuperAdminProducts(db, {
          adminId: f.adminId,
          limit: 1,
          offset: 0,
        });
        const page2 = await listSuperAdminProducts(db, {
          adminId: f.adminId,
          limit: 1,
          offset: 1,
        });
        assert.equal(page1.length, 1);
        assert.equal(page2.length, 1);
        assert.notEqual(page1[0].id, page2[0].id);
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminProducts search by name (q)",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makeProductFixture(db);
      try {
        // Search using the unique id suffix that both fixture products share
        const result = await listSuperAdminProducts(db, {
          q: f.id,
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.productId));
        assert.ok(ids.includes(f.productId2));

        const empty = await listSuperAdminProducts(db, {
          q: "IMPOSSIBLESEARCHTERM-zzz999abc",
          limit: 50,
          offset: 0,
        });
        assert.equal(empty.length, 0);
      } finally {
        await cleanupProductFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

// ---------------------------------------------------------------------------
// listSuperAdminPayouts tests
// ---------------------------------------------------------------------------

test(
  "listSuperAdminPayouts returns all payout requests without filter",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makePayoutFixture(db);
      try {
        const result = await listSuperAdminPayouts(db, {
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.payoutId));
      } finally {
        await cleanupPayoutFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminPayouts filters by status=REQUESTED",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makePayoutFixture(db);
      try {
        const result = await listSuperAdminPayouts(db, {
          status: "REQUESTED",
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.payoutId));
        assert.ok(result.every((r) => r.status === "REQUESTED"));
      } finally {
        await cleanupPayoutFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminPayouts filters by adminId",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makePayoutFixture(db);
      try {
        const result = await listSuperAdminPayouts(db, {
          adminId: f.adminId,
          limit: 50,
          offset: 0,
        });
        const ids = result.map((r) => r.id);
        assert.ok(ids.includes(f.payoutId));

        const empty = await listSuperAdminPayouts(db, {
          adminId: randomUUID(),
          limit: 50,
          offset: 0,
        });
        assert.equal(empty.length, 0);
      } finally {
        await cleanupPayoutFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminPayouts pagination: offset skips rows",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makePayoutFixture(db);
      try {
        const page1 = await listSuperAdminPayouts(db, {
          adminId: f.adminId,
          limit: 1,
          offset: 0,
        });
        assert.equal(page1.length, 1);
        const page2 = await listSuperAdminPayouts(db, {
          adminId: f.adminId,
          limit: 1,
          offset: 1,
        });
        assert.equal(
          page2.length,
          0,
          "Only one payout for this admin; offset=1 must return empty",
        );
      } finally {
        await cleanupPayoutFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);

test(
  "listSuperAdminPayouts status=PAID returns empty when payout is REQUESTED",
  { skip: !testUrl },
  async () => {
    const { db, client } = createDb(testUrl!);
    try {
      const f = await makePayoutFixture(db);
      try {
        const result = await listSuperAdminPayouts(db, {
          adminId: f.adminId,
          status: "PAID",
          limit: 50,
          offset: 0,
        });
        assert.equal(
          result.length,
          0,
          "REQUESTED payout must not appear in status=PAID filter",
        );
      } finally {
        await cleanupPayoutFixture(db, f);
      }
    } finally {
      await client.end({ timeout: 1 });
    }
  },
);
