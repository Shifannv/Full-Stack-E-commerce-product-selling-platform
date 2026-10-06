/**
 * Operator list/detail endpoints added for the Admin and Super Admin workspaces:
 *   - listAdminReturns        (GET /api/admin/returns)
 *   - getAdminProduct         (GET /api/admin/products/:productId)
 *   - listSuperAdminSettlements (GET /api/super-admin/settlements)
 *
 * Two sellers are created so cross-seller isolation is exercised, not assumed.
 * Runs only against the isolated local test database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../../db";
import { adminCategoryAssignments } from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import {
  categories,
  inventories,
  productAdmins,
  productImages,
  products,
  productVariants,
  subcategories,
} from "../../db/schema/catalog";
import { adminSettlements } from "../../db/schema/finance";
import { orderItems, orders } from "../../db/schema/orders";
import { returnItems, returns } from "../../db/schema/returns";
import { admins } from "../../db/schema/rbac";
import type { Actor } from "../../middleware/authorization";
import { listAdminReturns } from "../returns/return.service";
import { getAdminProduct } from "./catalog.service";
import { listSuperAdminSettlements } from "./finance.service";

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
      throw new Error("Operator list tests require a dedicated database");
  }
}

type Db = ReturnType<typeof createDb>["db"];
const DAY = 86400000;

async function makeSeller(tx: Db, tag: string, categoryId: string) {
  const userId = `op-${tag}-${randomUUID().slice(0, 8)}`;
  const adminId = randomUUID();
  await tx.insert(users).values({
    id: userId,
    name: `Seller ${tag}`,
    email: `${userId}@example.invalid`,
    status: "ACTIVE",
  });
  await tx.insert(admins).values({ id: adminId, userId, status: "ACTIVE" });
  await tx
    .insert(adminCategoryAssignments)
    .values({ adminId, categoryId, status: "ACTIVE" });
  return { userId, adminId };
}

const actorFor = (
  userId: string,
  overrides: Partial<Actor> = {},
): Actor => ({
  userId,
  roles: ["ADMIN"],
  permissions: ["orders.view", "products.view"],
  adminApproved: true,
  ...overrides,
});

async function makeFixture(db: Db) {
  const tag = randomUUID().slice(0, 8);
  const categoryId = randomUUID();
  const subcategoryId = randomUUID();
  const customerId = `op-cust-${tag}`;
  const deliveredAt = new Date(Date.now() - 2 * DAY);

  const fixture = await db.transaction(async (tx) => {
    await tx.insert(categories).values({
      id: categoryId,
      name: `OpCat-${tag}`,
      slug: `op-cat-${tag}`,
      status: "PUBLISHED",
    });
    await tx.insert(subcategories).values({
      id: subcategoryId,
      categoryId,
      name: `OpSub-${tag}`,
      slug: `op-sub-${tag}`,
      status: "PUBLISHED",
    });
    await tx.insert(users).values({
      id: customerId,
      name: "Op Customer",
      email: `${customerId}@example.invalid`,
      status: "ACTIVE",
    });
    const a = await makeSeller(tx as unknown as Db, `A-${tag}`, categoryId);
    const b = await makeSeller(tx as unknown as Db, `B-${tag}`, categoryId);

    const address = {
      contactName: "Op Customer",
      phone: "9000000000",
      line1: "1 Test Street",
      city: "Pune",
      state: "MH",
      postalCode: "411001",
      country: "IN",
    };

    // One product + order + item + settlement + returns per seller.
    async function sellerData(
      seller: { adminId: string },
      label: string,
      returnStatuses: string[],
    ) {
      const productId = randomUUID();
      const variantId = randomUUID();
      const orderId = randomUUID();
      await tx.insert(products).values({
        id: productId,
        categoryId,
        subcategoryId,
        name: `Product ${label}-${tag}`,
        slug: `product-${label.toLowerCase()}-${tag}`,
        description: `Description ${label}`,
        sku: `SKU-${label}-${tag}`,
        price: "250.00",
        status: "PUBLISHED",
        createdByAdminId: seller.adminId,
      });
      await tx.insert(productAdmins).values({ productId, adminId: seller.adminId });
      await tx.insert(inventories).values({ productId, availableQuantity: 7 });
      await tx.insert(productVariants).values({
        id: variantId,
        productId,
        sku: `VAR-${label}-${tag}`,
        title: `Variant ${label}`,
        price: "260.00",
      });
      await tx.insert(productImages).values({
        productId,
        objectKey: `products/${productId}/${randomUUID()}.png`,
        altText: `Image ${label}`,
        sortOrder: 0,
      });
      await tx.insert(orders).values({
        id: orderId,
        orderNumber: `OP-${label}-${tag}`,
        customerId,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        subtotal: "250.00",
        totalAmount: "250.00",
        shippingAddressSnapshot: address,
        placedAt: new Date(Date.now() - 3 * DAY),
        deliveredAt,
      });
      // return_items_order_item_unique allows one return per order item, so each return
      // gets its own line on the same order.
      const itemIds = returnStatuses.length
        ? returnStatuses.map(() => randomUUID())
        : [randomUUID()];
      for (const itemId of itemIds)
        await tx.insert(orderItems).values({
          id: itemId,
          orderId,
          adminId: seller.adminId,
          productId,
          productNameSnapshot: `Product ${label}`,
          unitPrice: "250.00",
          quantity: 5,
          subtotal: "1250.00",
          totalAmount: "1250.00",
        });
      const orderItemId = itemIds[0];
      await tx.insert(adminSettlements).values({
        adminId: seller.adminId,
        orderId,
        orderItemId,
        grossAmount: "500.00",
        commissionAmount: "50.00",
        gatewayFeeAmount: "10.00",
        refundAdjustmentAmount: "0",
        netPayable: "440.00",
        status: label === "A" ? "AVAILABLE" : "PAID",
      });
      const returnIds: string[] = [];
      for (const [index, status] of returnStatuses.entries()) {
        const returnId = randomUUID();
        returnIds.push(returnId);
        await tx.insert(returns).values({
          id: returnId,
          orderId,
          customerId,
          adminId: seller.adminId,
          status,
          reason: `Reason ${label}${index}`,
          // Distinct, ordered request times so newest-first ordering is deterministic.
          requestedAt: new Date(Date.now() - (10 - index) * 60000),
        });
        await tx.insert(returnItems).values({
          returnId,
          orderItemId: itemIds[index],
          orderId,
          adminId: seller.adminId,
          quantity: index + 1,
          reason: `Item reason ${label}${index}`,
        });
      }
      return { productId, variantId, orderId, orderItemId, returnIds };
    }

    const dataA = await sellerData(a, "A", ["REQUESTED", "APPROVED", "REFUNDED"]);
    const dataB = await sellerData(b, "B", ["REQUESTED"]);
    return { a, b, dataA, dataB };
  });

  return { ...fixture, tag, categoryId, subcategoryId, customerId, deliveredAt };
}

async function cleanup(db: Db, f: Awaited<ReturnType<typeof makeFixture>>) {
  const productIds = [f.dataA.productId, f.dataB.productId];
  const orderIds = [f.dataA.orderId, f.dataB.orderId];
  const returnIds = [...f.dataA.returnIds, ...f.dataB.returnIds];
  const adminIds = [f.a.adminId, f.b.adminId];
  await db.transaction(async (tx) => {
    await tx.delete(returnItems).where(inArray(returnItems.returnId, returnIds));
    await tx.delete(returns).where(inArray(returns.id, returnIds));
    await tx.delete(adminSettlements).where(inArray(adminSettlements.adminId, adminIds));
    await tx.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
    await tx.delete(orders).where(inArray(orders.id, orderIds));
    await tx.delete(productImages).where(inArray(productImages.productId, productIds));
    await tx.delete(productVariants).where(inArray(productVariants.productId, productIds));
    await tx.delete(inventories).where(inArray(inventories.productId, productIds));
    await tx.delete(productAdmins).where(inArray(productAdmins.productId, productIds));
    await tx.delete(products).where(inArray(products.id, productIds));
    await tx
      .delete(adminCategoryAssignments)
      .where(inArray(adminCategoryAssignments.adminId, adminIds));
    await tx.delete(subcategories).where(eq(subcategories.id, f.subcategoryId));
    await tx.delete(categories).where(eq(categories.id, f.categoryId));
    await tx.delete(admins).where(inArray(admins.id, adminIds));
    await tx
      .delete(users)
      .where(inArray(users.id, [f.a.userId, f.b.userId, f.customerId]));
  });
}

async function withFixture(
  run: (ctx: { db: Db; f: Awaited<ReturnType<typeof makeFixture>> }) => Promise<void>,
) {
  const { client, db } = createDb(testUrl!);
  let f: Awaited<ReturnType<typeof makeFixture>> | undefined;
  try {
    f = await makeFixture(db);
    await run({ db, f });
  } finally {
    if (f) await cleanup(db, f);
    await client.end({ timeout: 1 });
  }
}

// ---------------------------------------------------------------------------
// listAdminReturns
// ---------------------------------------------------------------------------

test("admin return queue returns only the seller's own returns, newest first", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const rows = await listAdminReturns(db, actorFor(f.a.userId), {
      limit: 20,
      offset: 0,
      windowDays: 5,
    });
    assert.equal(rows.length, 3);
    assert.deepEqual(
      new Set(rows.map((row) => row.id)),
      new Set(f.dataA.returnIds),
    );
    assert.ok(
      !rows.some((row) => f.dataB.returnIds.includes(row.id)),
      "seller A must never see seller B's return",
    );
    // returnIds were requested oldest -> newest, so newest-first reverses them.
    assert.deepEqual(rows.map((row) => row.id), [...f.dataA.returnIds].reverse());

    const own = rows.find((row) => row.id === f.dataA.returnIds[2])!;
    assert.equal(own.orderNumber, `OP-A-${f.tag}`);
    assert.equal(own.itemCount, 1);
    assert.equal(own.totalQuantity, 3);
    assert.equal(own.refund, null);
  });
});

test("admin return queue is isolated per seller", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const rows = await listAdminReturns(db, actorFor(f.b.userId), {
      limit: 20,
      offset: 0,
      windowDays: 5,
    });
    assert.deepEqual(rows.map((row) => row.id), f.dataB.returnIds);
  });
});

test("admin return queue filters by status and paginates", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const approved = await listAdminReturns(db, actorFor(f.a.userId), {
      status: "APPROVED",
      limit: 20,
      offset: 0,
      windowDays: 5,
    });
    assert.deepEqual(approved.map((row) => row.id), [f.dataA.returnIds[1]]);

    const firstPage = await listAdminReturns(db, actorFor(f.a.userId), {
      limit: 2,
      offset: 0,
      windowDays: 5,
    });
    const secondPage = await listAdminReturns(db, actorFor(f.a.userId), {
      limit: 2,
      offset: 2,
      windowDays: 5,
    });
    assert.equal(firstPage.length, 2);
    assert.equal(secondPage.length, 1);
    assert.equal(
      new Set([...firstPage, ...secondPage].map((row) => row.id)).size,
      3,
      "pages must not overlap",
    );
  });
});

test("admin return queue computes the five-day deadline from delivered_at on the server", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const [row] = await listAdminReturns(db, actorFor(f.a.userId), {
      status: "REQUESTED",
      limit: 1,
      offset: 0,
      windowDays: 5,
    });
    assert.ok(row.returnWindowEndsAt);
    assert.equal(
      row.returnWindowEndsAt!.getTime(),
      f.deliveredAt.getTime() + 5 * DAY,
    );

    const [unconfigured] = await listAdminReturns(db, actorFor(f.a.userId), {
      status: "REQUESTED",
      limit: 1,
      offset: 0,
      windowDays: null,
    });
    assert.equal(
      unconfigured.returnWindowEndsAt,
      null,
      "no deadline may be claimed when the policy is not configured",
    );
  });
});

test("admin return queue refuses unapproved, unprivileged and non-admin callers", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const query = { limit: 20, offset: 0, windowDays: 5 };
    await assert.rejects(
      listAdminReturns(db, actorFor(f.a.userId, { adminApproved: false }), query),
      { status: 403 },
    );
    await assert.rejects(
      listAdminReturns(db, actorFor(f.a.userId, { permissions: ["products.view"] }), query),
      { status: 403 },
    );
    await assert.rejects(
      listAdminReturns(db, actorFor(f.customerId, { roles: ["CUSTOMER"] }), query),
      { status: 403 },
    );
    // SUPER_ADMIN has no platform-wide seller queue; it is a documented gap, not a back door.
    await assert.rejects(
      listAdminReturns(db, actorFor(f.a.userId, { roles: ["SUPER_ADMIN"] }), query),
      { status: 403 },
    );
  });
});

// ---------------------------------------------------------------------------
// getAdminProduct
// ---------------------------------------------------------------------------

test("admin product detail returns every field needed to prefill an editor", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const detail = await getAdminProduct(db, f.a.adminId, f.dataA.productId);
    assert.equal(detail.id, f.dataA.productId);
    assert.equal(detail.description, "Description A");
    assert.equal(detail.sku, `SKU-A-${f.tag}`);
    assert.equal(detail.price, "250.00");
    assert.equal(detail.status, "PUBLISHED");
    assert.equal(detail.categoryId, f.categoryId);
    assert.equal(detail.subcategoryId, f.subcategoryId);
    assert.equal(detail.variants.length, 1);
    assert.equal(detail.variants[0].id, f.dataA.variantId);
    assert.equal(detail.variants[0].price, "260.00");
    assert.equal(detail.images.length, 1);
    assert.match(detail.images[0].objectKey, /^products\//);
  });
});

test("admin product detail answers a foreign seller's product with 404", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    // B asking for A's product is indistinguishable from a missing product.
    await assert.rejects(getAdminProduct(db, f.b.adminId, f.dataA.productId), {
      status: 404,
      message: "Product unavailable",
    });
    await assert.rejects(getAdminProduct(db, f.a.adminId, randomUUID()), {
      status: 404,
      message: "Product unavailable",
    });
  });
});

test("admin product detail is refused once the category assignment is revoked", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    await db
      .update(adminCategoryAssignments)
      .set({ status: "REVOKED" })
      .where(eq(adminCategoryAssignments.adminId, f.a.adminId));
    await assert.rejects(getAdminProduct(db, f.a.adminId, f.dataA.productId), {
      status: 403,
    });
  });
});

// ---------------------------------------------------------------------------
// listSuperAdminSettlements
// ---------------------------------------------------------------------------

test("super admin settlements list returns stored amounts without recomputation", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    const rows = await listSuperAdminSettlements(db, {
      adminId: f.a.adminId,
      limit: 20,
      offset: 0,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].grossAmount, "500.00");
    assert.equal(rows[0].commissionAmount, "50.00");
    assert.equal(rows[0].gatewayFeeAmount, "10.00");
    assert.equal(rows[0].refundAdjustmentAmount, "0.00");
    assert.equal(rows[0].netPayable, "440.00");
  });
});

test("super admin settlements list filters by seller and status and paginates", { skip: !testUrl }, async () => {
  await withFixture(async ({ db, f }) => {
    // Query per seller rather than scanning the whole table, which may hold other fixtures.
    for (const adminId of [f.a.adminId, f.b.adminId]) {
      const rows = await listSuperAdminSettlements(db, {
        adminId,
        limit: 50,
        offset: 0,
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].adminId, adminId);
    }

    const paid = await listSuperAdminSettlements(db, {
      adminId: f.b.adminId,
      status: "PAID",
      limit: 20,
      offset: 0,
    });
    assert.equal(paid.length, 1);
    assert.equal(paid[0].adminId, f.b.adminId);

    const none = await listSuperAdminSettlements(db, {
      adminId: f.a.adminId,
      status: "PAID",
      limit: 20,
      offset: 0,
    });
    assert.equal(none.length, 0, "status filter must exclude non-matching rows");

    const paged = await listSuperAdminSettlements(db, {
      adminId: f.a.adminId,
      limit: 1,
      offset: 1,
    });
    assert.equal(paged.length, 0, "offset past the last row returns nothing");
  });
});
