import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { parse } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { createDb } from "../src/db";
import { accounts, sessions, users } from "../src/db/schema/auth";
import {
  adminAuditEvents,
  adminCategoryAssignments,
} from "../src/db/schema/admin";
import {
  categories,
  inventories,
  productAdmins,
  products,
  productVariants,
  subcategories,
} from "../src/db/schema/catalog";
import { orderItems, orders, payments } from "../src/db/schema/orders";
import { admins, roles, userRoles } from "../src/db/schema/rbac";
import { reviews } from "../src/db/schema/reviews";
import { returnItems, returns } from "../src/db/schema/returns";
import {
  shipmentItems,
  shipments,
  shippingProviderConfigs,
} from "../src/db/schema/shipping";
import { provisionCredentialUser } from "../src/services/admin/provision.service";
import { app } from "../src/app";

// Local-only verification. Refuses to run against anything but the guarded
// local test database. Never touches Aiven, Cashfree, Shiprocket or R2.
const backendRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(backendRoot, "..");
const frontendRoot = join(repoRoot, "frontend");
const env = parse(readFileSync(join(backendRoot, ".env.checkout-test.local")));
const testUrl = env.CHECKOUT_TEST_DATABASE_URL;
assert.ok(testUrl, "CHECKOUT_TEST_DATABASE_URL is required");
const target = new URL(testUrl);
assert.deepEqual(
  [target.hostname, target.port, target.pathname, decodeURIComponent(target.username)],
  ["127.0.0.1", "5432", "/ownline_checkout_test", "postgres"],
  "Unexpected test database target",
);

const frontendOrigin = "http://127.0.0.1:3000";
const apiOrigin = "http://127.0.0.1:8790";
const runId = randomUUID();
const prefix = `mut-e2e-${runId.slice(0, 8)}`;
const password = `Local-${randomBytes(18).toString("base64url")}!`;
const address = {
  contactName: "Mutation verification",
  phone: "9000000000",
  line1: "Local test address",
  line2: null,
  city: "Chennai",
  state: "Tamil Nadu",
  postalCode: "600001",
  country: "IN",
};

function runNextBuild(): ChildProcess {
  return spawn(
    process.execPath,
    [join(frontendRoot, "node_modules/next/dist/bin/next"), "build"],
    {
      cwd: frontendRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CATALOG_BUILD_API_URL: apiOrigin,
        NEXT_PUBLIC_API_URL: apiOrigin,
      },
      windowsHide: true,
    },
  );
}

async function startApiServer(): Promise<Server> {
  const workerVars = parse(readFileSync(join(backendRoot, ".dev.vars")));
  assert.equal(workerVars.RETURN_WINDOW_DAYS, "5", "5-day policy must be configured");
  const executionContext = {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as Parameters<typeof app.fetch>[2];
  const server = createServer(async (incoming, outgoing) => {
    try {
      const requestUrl = new URL(incoming.url ?? "/", apiOrigin);
      const chunks: Buffer[] = [];
      for await (const chunk of incoming)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const request = new Request(requestUrl, {
        method: incoming.method,
        headers: incoming.headers as HeadersInit,
        body:
          incoming.method === "GET" || incoming.method === "HEAD"
            ? undefined
            : Buffer.concat(chunks),
      });
      const response = await app.fetch(
        request,
        {
          ...workerVars,
          FRONTEND_ORIGIN: frontendOrigin,
          BETTER_AUTH_URL: apiOrigin,
          HYPERDRIVE: { connectionString: testUrl },
        },
        executionContext,
      );
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length) outgoing.setHeader("set-cookie", setCookies);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("Local API bridge failed", error);
      outgoing.statusCode = 500;
      outgoing.end(JSON.stringify({ error: "Local API bridge failed" }));
    }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(8790, "127.0.0.1", resolveListen);
  });
  return server;
}

async function startFrontendServer(): Promise<Server> {
  const outputRoot = join(frontendRoot, "out");
  const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
  };
  const server = createServer((incoming, outgoing) => {
    try {
      const pathname = decodeURIComponent(new URL(incoming.url ?? "/", frontendOrigin).pathname);
      const relative = pathname.replace(/^\/+/, "");
      const candidates =
        pathname === "/"
          ? [join(outputRoot, "index.html")]
          : [join(outputRoot, relative), join(outputRoot, `${relative}.html`), join(outputRoot, relative, "index.html")];
      const file = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
      if (!file) {
        outgoing.statusCode = 404;
        outgoing.end("Not found");
        return;
      }
      const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
      outgoing.setHeader("content-type", contentTypes[extension] ?? "application/octet-stream");
      outgoing.end(readFileSync(file));
    } catch {
      outgoing.statusCode = 400;
      outgoing.end("Bad request");
    }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(3000, "127.0.0.1", resolveListen);
  });
  return server;
}

async function waitFor(url: string, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function childResult(child: ChildProcess): Promise<void> {
  await new Promise<void>((res, rej) => {
    child.on("error", rej);
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`Child failed (${code})`))));
  });
}

async function main() {
  const { db, client } = createDb(testUrl);
  const userIds: string[] = [];
  const adminIds: string[] = [];
  const orderIds: string[] = [];
  const productIds: string[] = [];
  const subcategoryId = randomUUID();
  const providerKey = `${prefix}-provider`;
  let createdCategoryId: string | null = null;
  const sweepArg = process.argv.find((arg) => arg.startsWith("--sweep="));
  const sweepPattern = sweepArg ? sweepArg.slice(8) : prefix;
  assert.match(sweepPattern, /^mut-e2e-[0-9a-f-]*$/);
  let apiServer: Server | undefined;
  let frontendServer: Server | undefined;
  const evidence: Record<string, unknown> = {};

  try {
    if (sweepArg) {
      userIds.push(...(await db.select({ id: users.id }).from(users).where(sql`${users.id} like ${`${sweepPattern}%`} or ${users.email} like ${`${sweepPattern}%`}`)).map((r) => r.id));
      if (userIds.length) {
        orderIds.push(...(await db.select({ id: orders.id }).from(orders).where(inArray(orders.customerId, userIds))).map((r) => r.id));
        adminIds.push(...(await db.select({ id: admins.id }).from(admins).where(inArray(admins.userId, userIds))).map((r) => r.id));
      }
      productIds.push(...(await db.select({ id: products.id }).from(products).where(like(products.slug, `${sweepPattern}%`))).map((r) => r.id));
      const [leftoverCategory] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.slug, "dress"), eq(categories.name, "Mutation dresses")));
      createdCategoryId = leftoverCategory?.id ?? null;
      return;
    }
    apiServer = await startApiServer();
    await waitFor(`${apiOrigin}/health`);

    const admin = await provisionCredentialUser(
      db,
      { email: `${prefix}-admin@example.invalid`, name: "Mutation E2E admin", password },
      "ADMIN",
    );
    assert.ok(admin.adminId);
    const adminId: string = admin.adminId;
    userIds.push(admin.userId);
    adminIds.push(adminId);
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, admin.userId));
    await db.update(admins).set({ status: "ACTIVE" }).where(eq(admins.id, adminId));

    const [customerRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, "CUSTOMER"));
    assert.ok(customerRole, "CUSTOMER role is required");
    async function createCustomer(label: string) {
      const id = `${prefix}-${label}`;
      userIds.push(id);
      await db.insert(users).values({ id, name: `Mutation E2E ${label}`, email: `${id}@example.invalid`, emailVerified: true });
      await db.insert(accounts).values({
        id: randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: await hashPassword(password),
      });
      await db.insert(userRoles).values({ userId: id, roleId: customerRole.id });
      return { id, email: `${id}@example.invalid` };
    }
    const customer = await createCustomer("customer");
    const other = await createCustomer("other");

    // Catalog: return policy requires category slug "dress" + returnEnabled.
    let [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "dress"));
    if (!category) {
      createdCategoryId = randomUUID();
      await db.insert(categories).values({ id: createdCategoryId, name: "Mutation dresses", slug: "dress", status: "PUBLISHED" });
      category = { id: createdCategoryId };
    }
    const categoryId = category.id;
    await db.insert(subcategories).values({ id: subcategoryId, categoryId, name: "Mutation edit", slug: `${prefix}-edit`, status: "PUBLISHED" });
    await db.insert(adminCategoryAssignments).values({ adminId: adminId, categoryId, status: "ACTIVE" });

    async function createProduct(label: string, returnEnabled: boolean) {
      const id = randomUUID();
      productIds.push(id);
      await db.insert(products).values({
        id, categoryId, subcategoryId, createdByAdminId: adminId,
        name: `Mutation ${label}`, slug: `${prefix}-${label}`,
        description: "Local mutation verification product.", sku: `${prefix}-${label}`,
        price: "1299.00", status: "PUBLISHED", returnEnabled,
        weightKg: "0.50", lengthCm: "30.00", breadthCm: "20.00", heightCm: "5.00",
      });
      await db.insert(productAdmins).values({ adminId: adminId, productId: id });
      const [variant] = await db.insert(productVariants).values({
        productId: id, sku: `${prefix}-${label}-m`, title: "M", price: "1299.00", attributes: { size: "M" },
      }).returning();
      return { id, variant };
    }
    const returnable = await createProduct("returnable", true);
    const plain = await createProduct("plain", false);
    // Four active reservations (A, A2, X, E) are held against the returnable variant.
    await db.insert(inventories).values({
      productId: returnable.id, variantId: returnable.variant.id,
      availableQuantity: 2, reservedQuantity: 4,
    });
    await db.insert(inventories).values({
      productId: plain.id, variantId: plain.variant.id, availableQuantity: 5,
    });
    await db.insert(shippingProviderConfigs).values({ providerKey, displayName: "Local mutation verification", enabled: true });

    const now = Date.now();
    const DAY = 24 * 60 * 60_000;
    type Def = {
      key: string; owner: string; product: typeof returnable; status: string; paymentStatus: string;
      stockState: string; quantity: number; deliveredAt: Date | null; expires: Date | null;
    };
    const defs: Def[] = [
      { key: "A", owner: customer.id, product: returnable, status: "CREATED", paymentStatus: "PENDING", stockState: "RESERVED", quantity: 1, deliveredAt: null, expires: new Date(now + 10 * 60_000) },
      { key: "A2", owner: customer.id, product: returnable, status: "CREATED", paymentStatus: "PENDING", stockState: "RESERVED", quantity: 1, deliveredAt: null, expires: new Date(now + 10 * 60_000) },
      { key: "X", owner: other.id, product: returnable, status: "CREATED", paymentStatus: "PENDING", stockState: "RESERVED", quantity: 1, deliveredAt: null, expires: new Date(now + 10 * 60_000) },
      { key: "E", owner: customer.id, product: returnable, status: "CREATED", paymentStatus: "PENDING", stockState: "RESERVED", quantity: 1, deliveredAt: null, expires: new Date(now + 90_000) },
      { key: "PAID", owner: customer.id, product: returnable, status: "CONFIRMED", paymentStatus: "PAID", stockState: "CONSUMED", quantity: 1, deliveredAt: null, expires: null },
      { key: "RV", owner: customer.id, product: returnable, status: "DELIVERED", paymentStatus: "PAID", stockState: "CONSUMED", quantity: 1, deliveredAt: new Date(now - DAY), expires: null },
      { key: "RT", owner: customer.id, product: returnable, status: "DELIVERED", paymentStatus: "PAID", stockState: "CONSUMED", quantity: 3, deliveredAt: new Date(now - DAY), expires: null },
      { key: "RT2", owner: customer.id, product: returnable, status: "DELIVERED", paymentStatus: "PAID", stockState: "CONSUMED", quantity: 2, deliveredAt: new Date(now - DAY), expires: null },
      { key: "RL", owner: customer.id, product: returnable, status: "DELIVERED", paymentStatus: "PAID", stockState: "CONSUMED", quantity: 1, deliveredAt: new Date(now - 6 * DAY), expires: null },
      { key: "RN", owner: customer.id, product: plain, status: "DELIVERED", paymentStatus: "PAID", stockState: "CONSUMED", quantity: 1, deliveredAt: new Date(now - DAY), expires: null },
    ];
    const rec: Record<string, { orderId: string; itemId: string; number: string }> = {};
    for (const [index, def] of defs.entries()) {
      const number = `${prefix}-${def.key}`.toUpperCase();
      const total = (1299 * def.quantity).toFixed(2);
      const [order] = await db.insert(orders).values({
        orderNumber: number, customerId: def.owner, status: def.status,
        paymentStatus: def.paymentStatus, stockState: def.stockState,
        paymentExpiresAt: def.expires, deliveredAt: def.deliveredAt,
        placedAt: def.status === "CREATED" ? null : new Date(now - 2 * DAY),
        createdAt: new Date(now - index * 1000),
        subtotal: total, totalAmount: total, shippingAddressSnapshot: address,
      }).returning({ id: orders.id });
      orderIds.push(order.id);
      await db.insert(payments).values({ orderId: order.id, amount: total, status: def.paymentStatus });
      const [item] = await db.insert(orderItems).values({
        orderId: order.id, adminId: adminId, productId: def.product.id,
        variantId: def.product.variant.id, productNameSnapshot: `Mutation ${def.key}`,
        variantTitleSnapshot: "M", skuSnapshot: def.product.variant.sku,
        quantity: def.quantity, unitPrice: "1299.00", subtotal: total, totalAmount: total,
      }).returning({ id: orderItems.id });
      rec[def.key] = { orderId: order.id, itemId: item.id, number };
      if (def.deliveredAt) {
        const [shipment] = await db.insert(shipments).values({
          orderId: order.id, adminId: adminId, providerKey, status: "DELIVERED",
          deliveredAt: def.deliveredAt, originAddressSnapshot: address, destinationAddressSnapshot: address,
        }).returning({ id: shipments.id });
        await db.insert(shipmentItems).values({
          shipmentId: shipment.id, orderItemId: item.id, orderId: order.id, adminId: adminId,
        });
      }
    }
    // Test-order inventory was seeded above with the reservations held by A, A2, X and E.

    await childResult(runNextBuild());
    frontendServer = await startFrontendServer();
    await waitFor(frontendOrigin);

    const require = createRequire(import.meta.url);
    const { chromium } = require(join(process.env.LOCALAPPDATA!, "ms-playwright-go/1.57.0/package/index.js"));
    const browser = await chromium.launch({ channel: "chrome", headless: true });

    async function rolePage(email: string) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.goto(frontendOrigin, { waitUntil: "networkidle" });
      const login = await page.evaluate(
        async ({ api, e, p }: { api: string; e: string; p: string }) =>
          (await fetch(`${api}/api/auth/sign-in/email`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: e, password: p }),
          })).status,
        { api: apiOrigin, e: email, p: password },
      );
      assert.equal(login, 200);
      return { context, page };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function call(page: any, path: string, init: { method?: string; body?: unknown } = {}) {
      return page.evaluate(
        async ({ api, p, i }: { api: string; p: string; i: { method?: string; body?: unknown } }) => {
          const response = await fetch(`${api}${p}`, {
            method: i.method, credentials: "include",
            headers: i.body === undefined ? undefined : { "Content-Type": "application/json" },
            body: i.body === undefined ? undefined : JSON.stringify(i.body),
          });
          return { status: response.status, body: await response.json().catch(() => null) };
        },
        { api: apiOrigin, p: path, i: init },
      );
    }
    const inventoryOf = async (productId: string, variantId: string) => {
      const [row] = await db.select({
        available: inventories.availableQuantity, reserved: inventories.reservedQuantity, version: inventories.version,
      }).from(inventories).where(and(eq(inventories.productId, productId), eq(inventories.variantId, variantId)));
      return row;
    };
    const orderRow = async (id: string) => {
      const [row] = await db.select({
        status: orders.status, paymentStatus: orders.paymentStatus, stockState: orders.stockState, cancelledAt: orders.cancelledAt,
      }).from(orders).where(eq(orders.id, id));
      const [pay] = await db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, id));
      return { ...row, payment: pay.status };
    };
    const auditCount = async (orderId: string) =>
      (await db.select({ id: adminAuditEvents.id }).from(adminAuditEvents).where(and(
        eq(adminAuditEvents.action, "ORDER_CANCELLED"), eq(adminAuditEvents.entityId, orderId)))).length;
    const reviewRows = async (itemId: string) =>
      db.select({ status: reviews.status, rating: reviews.rating, title: reviews.title, customerId: reviews.customerId })
        .from(reviews).where(eq(reviews.orderItemId, itemId));
    const returnRows = async (orderId: string) =>
      db.select({ id: returns.id, status: returns.status, customerId: returns.customerId, reason: returns.reason })
        .from(returns).where(eq(returns.orderId, orderId));

    try {
      // ---------- Unauthenticated ----------
      const anonContext = await browser.newContext();
      const anonPage = await anonContext.newPage();
      await anonPage.goto(frontendOrigin, { waitUntil: "networkidle" });
      const anon = {
        cancel: (await call(anonPage, `/api/orders/${rec.A.orderId}/cancel`, { method: "POST", body: {} })).status,
        review: (await call(anonPage, "/api/reviews", { method: "POST", body: { orderItemId: rec.RV.itemId, rating: 5, title: "t", body: "b" } })).status,
        return: (await call(anonPage, "/api/returns", { method: "POST", body: { orderItemId: rec.RT.itemId, quantity: 1, reason: "r" } })).status,
      };
      assert.deepEqual(anon, { cancel: 401, review: 401, return: 401 });
      await anonContext.close();
      evidence.unauthenticated = anon;

      // ---------- Cross-customer attempts (before any owner mutation) ----------
      const otherSession = await rolePage(other.email);
      const invBefore = await inventoryOf(returnable.id, returnable.variant.id);
      assert.deepEqual([invBefore.available, invBefore.reserved], [2, 4]);
      const cross = {
        cancel: await call(otherSession.page, `/api/orders/${rec.A.orderId}/cancel`, { method: "POST", body: {} }),
        review: await call(otherSession.page, "/api/reviews", { method: "POST", body: { orderItemId: rec.RV.itemId, rating: 1, title: "hijack", body: "hijack" } }),
        return: await call(otherSession.page, "/api/returns", { method: "POST", body: { orderItemId: rec.RT.itemId, quantity: 1, reason: "hijack" } }),
      };
      assert.equal(cross.cancel.status, 404);
      assert.equal(cross.review.status, 404);
      assert.equal(cross.return.status, 404);
      assert.equal((await orderRow(rec.A.orderId)).status, "CREATED");
      assert.equal((await reviewRows(rec.RV.itemId)).length, 0);
      assert.equal((await returnRows(rec.RT.orderId)).length, 0);
      assert.deepEqual(await inventoryOf(returnable.id, returnable.variant.id), invBefore);
      assert.equal(await auditCount(rec.A.orderId), 0);
      evidence.crossCustomer = { cancel: cross.cancel, review: cross.review, return: cross.return, stateUnchanged: true };

      // ---------- Customer UI session ----------
      const cust = await rolePage(customer.email);
      const page = cust.page;
      const gotoOrders = async () => {
        const responsePromise = page.waitForResponse((r: { url(): string }) => new URL(r.url()).pathname === "/api/orders");
        await page.goto(`${frontendOrigin}/orders`, { waitUntil: "networkidle" });
        await responsePromise;
      };
      const article = (key: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: rec[key].number, exact: true }) });

      // ===== ORDER CANCELLATION =====
      await gotoOrders();
      const beforeApi = await call(page, `/api/orders/${rec.A.orderId}`);
      assert.equal(beforeApi.body.cancellationEligible, true);
      const a = article("A");
      await a.getByText(/CREATED/).first().waitFor();
      const beforeOrder = await orderRow(rec.A.orderId);
      const cancelPromise = page.waitForResponse((r: { url(): string; request(): { method(): string } }) =>
        new URL(r.url()).pathname === `/api/orders/${rec.A.orderId}/cancel` && r.request().method() === "POST");
      await a.getByRole("button", { name: "Cancel unpaid order" }).click();
      await a.getByRole("button", { name: "Confirm cancellation" }).click();
      const cancelHttp = await cancelPromise;
      const cancelBody = await cancelHttp.json();
      assert.equal(cancelHttp.status(), 200, JSON.stringify(cancelBody));
      assert.equal(cancelBody.status, "CANCELLED");
      await a.getByText(/CANCELLED/).first().waitFor();
      const afterOrder = await orderRow(rec.A.orderId);
      assert.equal(afterOrder.status, "CANCELLED");
      assert.equal(afterOrder.stockState, "RELEASED");
      assert.ok(afterOrder.cancelledAt);
      assert.equal(afterOrder.paymentStatus, "PENDING"); // existing rule: unpaid cancellation leaves payment PENDING
      assert.equal(afterOrder.payment, "PENDING");
      const invAfter = await inventoryOf(returnable.id, returnable.variant.id);
      assert.deepEqual([invAfter.available, invAfter.reserved], [3, 3]);
      assert.equal(invAfter.version, invBefore.version + 1);
      assert.equal(await auditCount(rec.A.orderId), 1);
      // The cancel control must not stay offered after a successful cancellation.
      const staleControls = await a.getByRole("button", { name: /Confirm cancellation|Cancel unpaid order/ }).count();
      assert.equal(staleControls, 0, "Cancel controls still offered after cancellation");
      await gotoOrders();
      await article("A").getByText(/CANCELLED/).first().waitFor();
      assert.equal(await article("A").getByRole("button", { name: /Cancel unpaid order/ }).count(), 0);
      const refetched = await call(page, `/api/orders/${rec.A.orderId}`);
      assert.equal(refetched.body.status, "CANCELLED");
      assert.equal(refetched.body.cancellationEligible, false);
      // Replay
      const replay = await call(page, `/api/orders/${rec.A.orderId}/cancel`, { method: "POST", body: {} });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.status, "CANCELLED");
      assert.deepEqual(await inventoryOf(returnable.id, returnable.variant.id), invAfter);
      assert.equal(await auditCount(rec.A.orderId), 1);
      assert.equal((await orderRow(rec.A.orderId)).cancelledAt?.getTime(), afterOrder.cancelledAt?.getTime());
      // Concurrent duplicate on A2
      const invBeforeA2 = await inventoryOf(returnable.id, returnable.variant.id);
      const pair = await Promise.all([
        call(page, `/api/orders/${rec.A2.orderId}/cancel`, { method: "POST", body: {} }),
        call(page, `/api/orders/${rec.A2.orderId}/cancel`, { method: "POST", body: {} }),
      ]);
      assert.deepEqual(pair.map((r) => r.status), [200, 200]);
      assert.equal(pair.filter((r) => r.body.replayed === false).length + pair.filter((r) => r.body.replayed === true).length, 2);
      const invAfterA2 = await inventoryOf(returnable.id, returnable.variant.id);
      assert.deepEqual([invAfterA2.available, invAfterA2.reserved], [invBeforeA2.available + 1, invBeforeA2.reserved - 1]);
      assert.equal(await auditCount(rec.A2.orderId), 1);
      // Ineligible: expired window (force deadline elapsed) and paid order
      await db.update(orders).set({ paymentExpiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, rec.E.orderId));
      const expired = await call(page, `/api/orders/${rec.E.orderId}/cancel`, { method: "POST", body: {} });
      const paid = await call(page, `/api/orders/${rec.PAID.orderId}/cancel`, { method: "POST", body: {} });
      assert.equal(expired.status, 409);
      assert.equal(paid.status, 409);
      assert.equal((await orderRow(rec.E.orderId)).status, "CREATED");
      assert.equal((await orderRow(rec.PAID.orderId)).status, "CONFIRMED");
      assert.equal(await auditCount(rec.E.orderId) + await auditCount(rec.PAID.orderId), 0);
      const invalidId = await call(page, "/api/orders/not-a-uuid/cancel", { method: "POST", body: {} });
      assert.equal(invalidId.status, 422);
      // X (other customer's) untouched
      assert.equal((await orderRow(rec.X.orderId)).status, "CREATED");
      evidence.cancellation = {
        api: "POST /api/orders/:id/cancel", status: cancelHttp.status(), body: cancelBody,
        db: { before: beforeOrder, after: afterOrder, inventoryBefore: invBefore, inventoryAfter: invAfter, audit: 1 },
        replay: { status: replay.status, body: replay.body, inventoryUnchanged: true, auditStillOne: true },
        concurrent: { statuses: pair.map((r) => r.status), replayedFlags: pair.map((r) => r.body.replayed), inventoryReleasedOnce: true, audit: 1 },
        ineligible: { expiredWindow: expired, paidOrder: paid, invalidId: invalidId.status },
        frontend: "CANCELLED shown, controls removed, persisted after reload",
      };

      // ===== REVIEW =====
      await gotoOrders();
      const rv = article("RV");
      await rv.getByText("Order details", { exact: true }).click();
      await rv.getByRole("button", { name: "Write a review" }).click();
      await rv.getByLabel("Review title").fill("Mutation E2E review");
      await rv.getByLabel("Your experience").fill("Verified locally through the real API.");
      await rv.getByLabel("Rating").selectOption("4");
      const reviewPromise = page.waitForResponse((r: { url(): string; request(): { method(): string } }) =>
        new URL(r.url()).pathname === "/api/reviews" && r.request().method() === "POST");
      await rv.getByRole("button", { name: "Submit review" }).click();
      const reviewHttp = await reviewPromise;
      const reviewBody = await reviewHttp.json();
      assert.equal(reviewHttp.status(), 201, JSON.stringify(reviewBody));
      await rv.getByText("Review pending", { exact: true }).waitFor();
      const reviewDb = await reviewRows(rec.RV.itemId);
      assert.deepEqual(reviewDb.map((r) => [r.status, r.rating, r.customerId]), [["PENDING", 4, customer.id]]);
      await gotoOrders();
      const rv2 = article("RV");
      await rv2.getByText("Order details", { exact: true }).click();
      await rv2.getByText("Review pending", { exact: true }).waitFor();
      assert.equal(await rv2.getByRole("button", { name: "Write a review" }).count(), 0);
      const dup = await call(page, "/api/reviews", { method: "POST", body: { orderItemId: rec.RV.itemId, rating: 1, title: "dup", body: "dup" } });
      assert.equal(dup.status, 409);
      const crossRewrite = await call(otherSession.page, "/api/reviews", { method: "POST", body: { orderItemId: rec.RV.itemId, rating: 1, title: "rewrite", body: "rewrite" } });
      assert.equal(crossRewrite.status, 404);
      const afterDup = await reviewRows(rec.RV.itemId);
      assert.deepEqual(afterDup.map((r) => [r.status, r.rating, r.title]), [["PENDING", 4, "Mutation E2E review"]]);
      const notDelivered = await call(page, "/api/reviews", { method: "POST", body: { orderItemId: rec.PAID.itemId, rating: 5, title: "t", body: "b" } });
      const notDelivered2 = await call(page, "/api/reviews", { method: "POST", body: { orderItemId: rec.A2.itemId, rating: 5, title: "t", body: "b" } });
      const badRating = await call(page, "/api/reviews", { method: "POST", body: { orderItemId: rec.RT.itemId, rating: 9, title: "t", body: "b" } });
      assert.equal(notDelivered.status, 422);
      assert.equal(notDelivered2.status, 422);
      assert.equal(badRating.status, 422);
      assert.equal((await reviewRows(rec.PAID.itemId)).length + (await reviewRows(rec.A2.itemId)).length + (await reviewRows(rec.RT.itemId)).length, 0);
      const published = await fetch(`${apiOrigin}/api/products/${returnable.id}/reviews`).then((r) => r.json()) as { reviews: unknown[] };
      assert.equal(published.reviews.length, 0, "Pending review must not be public");
      evidence.review = {
        api: "POST /api/reviews", status: reviewHttp.status(), body: reviewBody, db: reviewDb,
        duplicate: { status: dup.status, body: dup.body }, crossCustomerRewrite: crossRewrite.status,
        ineligible: { undeliveredPaid: notDelivered.status, undeliveredUnpaid: notDelivered2.status, invalidRating: badRating.status, rowsCreated: 0 },
        frontend: "Review pending shown, write button removed, persisted after reload; not public until moderation",
      };

      // ===== RETURN =====
      await gotoOrders();
      const rt = article("RT");
      await rt.getByText("Order details", { exact: true }).click();
      await rt.getByText(/Return window closes .+3 of 3 eligible\./).waitFor();
      const rtBefore = await call(page, `/api/orders/${rec.RT.orderId}`);
      assert.equal(rtBefore.body.items[0].remainingReturnableQuantity, 3);
      await rt.getByRole("button", { name: "Request a return" }).click();
      await rt.getByLabel("Quantity").fill("2");
      await rt.getByLabel("Reason").fill("Mutation E2E: does not fit");
      await rt.getByLabel("Additional notes (optional)").fill("local only");
      const returnPromise = page.waitForResponse((r: { url(): string; request(): { method(): string } }) =>
        new URL(r.url()).pathname === "/api/returns" && r.request().method() === "POST");
      await rt.getByRole("button", { name: "Submit return request" }).click();
      const returnHttp = await returnPromise;
      const returnBody = await returnHttp.json();
      assert.equal(returnHttp.status(), 201, JSON.stringify(returnBody));
      assert.equal(returnBody.status, "REQUESTED");
      await rt.getByText(/View return /).waitFor();
      const returnDb = await returnRows(rec.RT.orderId);
      assert.equal(returnDb.length, 1);
      assert.equal(returnDb[0].customerId, customer.id);
      const returnItemDb = await db.select({ quantity: returnItems.quantity, orderItemId: returnItems.orderItemId }).from(returnItems).where(eq(returnItems.returnId, returnDb[0].id));
      assert.deepEqual(returnItemDb, [{ quantity: 2, orderItemId: rec.RT.itemId }]);
      await gotoOrders();
      const rt2 = article("RT");
      await rt2.getByText("Order details", { exact: true }).click();
      await rt2.getByText(/Return: A return has already been requested/).waitFor();
      assert.equal(await rt2.getByRole("button", { name: "Request a return" }).count(), 0);
      const rtAfter = await call(page, `/api/orders/${rec.RT.orderId}`);
      const remainingAfter = rtAfter.body.items[0].remainingReturnableQuantity;
      assert.equal(rtAfter.body.items[0].returnEligible, false);
      await page.goto(`${frontendOrigin}/returns?id=${returnDb[0].id}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Check return status" }).click();
      await page.getByText("Refund not initiated yet.", { exact: true }).waitFor();
      const returnDetail = await call(page, `/api/returns/${returnDb[0].id}`);
      assert.equal(returnDetail.status, 200);
      // Replay
      const returnReplay = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RT.itemId, quantity: 1, reason: "replay" } });
      assert.equal(returnReplay.status, 409);
      assert.equal((await returnRows(rec.RT.orderId)).length, 1);
      // Cross customer read of that return
      const crossRead = await call(otherSession.page, `/api/returns/${returnDb[0].id}`);
      assert.equal(crossRead.status, 404);
      // Concurrent duplicate
      const racers = await Promise.all([
        call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RT2.itemId, quantity: 2, reason: "race one" } }),
        call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RT2.itemId, quantity: 2, reason: "race two" } }),
      ]);
      assert.equal(racers.filter((r) => r.status === 201).length, 1, JSON.stringify(racers));
      assert.equal(racers.filter((r) => r.status === 409).length, 1, JSON.stringify(racers));
      assert.equal((await returnRows(rec.RT2.orderId)).length, 1);
      // Ineligible: late (6 days), non-returnable, over-quantity, unpaid/undelivered, invalid quantity
      const late = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RL.itemId, quantity: 1, reason: "late" } });
      const nonReturnable = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RN.itemId, quantity: 1, reason: "no" } });
      const overQuantity = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RV.itemId, quantity: 5, reason: "too many" } });
      const undelivered = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.PAID.itemId, quantity: 1, reason: "not delivered" } });
      const badQuantity = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RV.itemId, quantity: 0, reason: "zero" } });
      assert.deepEqual(
        [late.status, nonReturnable.status, overQuantity.status, undelivered.status, badQuantity.status],
        [422, 422, 404, 422, 422],
        JSON.stringify({ late, nonReturnable, overQuantity, undelivered, badQuantity }),
      );
      for (const key of ["RL", "RN", "RV", "PAID"])
        assert.equal((await returnRows(rec[key].orderId)).length, 0, `${key} must have no return`);
      // Boundary: delivered just inside vs just outside 5 days
      await db.update(orders).set({ deliveredAt: new Date(Date.now() - 5 * DAY - 60_000) }).where(eq(orders.id, rec.RV.orderId));
      const justLate = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RV.itemId, quantity: 1, reason: "edge late" } });
      assert.equal(justLate.status, 422);
      await db.update(orders).set({ deliveredAt: new Date(Date.now() - 5 * DAY + 5 * 60_000) }).where(eq(orders.id, rec.RV.orderId));
      const justInside = await call(page, "/api/returns", { method: "POST", body: { orderItemId: rec.RV.itemId, quantity: 1, reason: "edge inside" } });
      assert.equal(justInside.status, 201, JSON.stringify(justInside));
      // Late order UI message
      await gotoOrders();
      const rl = article("RL");
      await rl.getByText("Order details", { exact: true }).click();
      await rl.getByText(/Return: The return window has closed\./).waitFor();
      evidence.returnRequest = {
        api: "POST /api/returns", status: returnHttp.status(), body: returnBody,
        db: { returns: returnDb, items: returnItemDb },
        remainingReturnable: { before: rtBefore.body.items[0].remainingReturnableQuantity, after: remainingAfter, requested: 2, quantity: 3 },
        replay: { status: returnReplay.status, body: returnReplay.body, returnsStillOne: true },
        concurrent: { statuses: racers.map((r) => r.status), returnsCreated: 1 },
        ineligible: {
          lateSixDays: late.status, justOutside5Days: justLate.status, justInside5Days: justInside.status,
          nonReturnableProduct: nonReturnable.status, overQuantity: overQuantity.status,
          undeliveredPaid: undelivered.status, invalidQuantity: badQuantity.status,
        },
        crossCustomer: { create: cross.return.status, read: crossRead.status },
        frontend: "Return reference link shown, request button removed, 'already requested' persisted after reload, /returns status renders",
      };
      await cust.context.close();
      await otherSession.context.close();
      console.log(JSON.stringify({ result: "PASS", environment: target.pathname, evidence }, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    if (frontendServer) await new Promise<void>((r) => frontendServer!.close(() => r()));
    if (apiServer) await new Promise<void>((r) => apiServer!.close(() => r()));
    try {
      if (orderIds.length || userIds.length) {
        const itemIds = orderIds.length
          ? (await db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, orderIds))).map((row) => row.id)
          : [];
        if (itemIds.length) await db.delete(reviews).where(inArray(reviews.orderItemId, itemIds));
        const returnIds = orderIds.length
          ? (await db.select({ id: returns.id }).from(returns).where(inArray(returns.orderId, orderIds))).map((row) => row.id)
          : [];
        if (returnIds.length) {
          await db.delete(returnItems).where(inArray(returnItems.returnId, returnIds));
          await db.delete(returns).where(inArray(returns.id, returnIds));
        }
        if (orderIds.length) {
          const shipmentIds = (await db.select({ id: shipments.id }).from(shipments).where(inArray(shipments.orderId, orderIds))).map((row) => row.id);
          if (shipmentIds.length) await db.delete(shipmentItems).where(inArray(shipmentItems.shipmentId, shipmentIds));
          await db.delete(shipments).where(inArray(shipments.orderId, orderIds));
          await db.delete(adminAuditEvents).where(inArray(adminAuditEvents.entityId, orderIds));
          await db.delete(payments).where(inArray(payments.orderId, orderIds));
          await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
          await db.delete(orders).where(inArray(orders.id, orderIds));
        }
        if (userIds.length) await db.delete(adminAuditEvents).where(inArray(adminAuditEvents.actorUserId, userIds));
      }
      await db.delete(shippingProviderConfigs).where(like(shippingProviderConfigs.providerKey, `${sweepPattern}%`));
      if (productIds.length) {
        await db.delete(inventories).where(inArray(inventories.productId, productIds));
        await db.delete(productVariants).where(inArray(productVariants.productId, productIds));
        await db.delete(productAdmins).where(inArray(productAdmins.productId, productIds));
        await db.delete(products).where(inArray(products.id, productIds));
      }
      if (adminIds.length) await db.delete(adminCategoryAssignments).where(inArray(adminCategoryAssignments.adminId, adminIds));
      await db.delete(subcategories).where(like(subcategories.slug, `${sweepPattern}%`));
      if (createdCategoryId) await db.delete(categories).where(eq(categories.id, createdCategoryId));
      if (userIds.length) {
        await db.delete(sessions).where(inArray(sessions.userId, userIds));
        await db.delete(accounts).where(inArray(accounts.userId, userIds));
        await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
      }
      if (adminIds.length) await db.delete(admins).where(inArray(admins.id, adminIds));
      if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
      const count = async (table: string, column: string) =>
        Number((await db.execute<{ n: string }>(sql.raw(`select count(*)::text as n from ${table} where ${column} like '${sweepPattern}%'`)))[0].n);
      const remaining = {
        users: await count("users", "id") + await count("users", "email"),
        orders: await count("orders", "order_number") + Number((await db.execute<{ n: string }>(sql.raw(`select count(*)::text as n from orders where order_number like '${sweepPattern.toUpperCase()}%'`)))[0].n),
        products: await count("products", "slug"),
        subcategories: await count("subcategories", "slug"),
        shippingProviderConfigs: await count("shipping_provider_configs", "provider_key"),
        reviewsAndReturnsForUsers: userIds.length
          ? (await db.select({ id: reviews.id }).from(reviews).where(inArray(reviews.customerId, userIds))).length +
            (await db.select({ id: returns.id }).from(returns).where(inArray(returns.customerId, userIds))).length
          : 0,
        audit: userIds.length ? (await db.select({ id: adminAuditEvents.id }).from(adminAuditEvents).where(inArray(adminAuditEvents.actorUserId, userIds))).length : 0,
      };
      console.log(JSON.stringify({ cleanup: "done", prefix: sweepPattern, remaining }));
      assert.ok(Object.values(remaining).every((n) => n === 0), "Temporary records remain");
    } finally {
      await client.end({ timeout: 2 });
    }
  }
}

process.on("unhandledRejection", (reason) => {
  // A dangling waitForResponse rejects when the browser closes after a real
  // failure; keep the process alive so cleanup runs and the real error prints.
  console.error("unhandledRejection (ignored):", (reason as Error)?.message);
});
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
