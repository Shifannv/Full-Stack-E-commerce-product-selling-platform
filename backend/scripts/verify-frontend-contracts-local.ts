import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { parse } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../src/db";
import { accounts, sessions, users } from "../src/db/schema/auth";
import {
  adminCategoryAssignments,
  adminKycSubmissions,
} from "../src/db/schema/admin";
import {
  categories,
  inventories,
  productAdmins,
  products,
  productVariants,
  subcategories,
} from "../src/db/schema/catalog";
import {
  cartItems,
  carts,
  customerAddresses,
  wishlistItems,
} from "../src/db/schema/customer";
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
const imageWorkerOrigin = "http://127.0.0.1:8788";
const runId = randomUUID();
const password = `Local-${randomBytes(18).toString("base64url")}!`;
const address = {
  contactName: "Contract verification",
  phone: "9000000000",
  line1: "Local test address",
  line2: null,
  city: "Chennai",
  state: "Tamil Nadu",
  postalCode: "600001",
  country: "IN",
};

function runNext(command: "build", args: string[] = []): ChildProcess {
  return spawn(
    process.execPath,
    [join(frontendRoot, "node_modules/next/dist/bin/next"), command, ...args],
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

function runImageWorker(): ChildProcess {
  return spawn(
    process.execPath,
    [
      join(backendRoot, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      "8788",
    ],
    {
      cwd: backendRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: testUrl,
        WRANGLER_SEND_METRICS: "false",
      },
      windowsHide: true,
    },
  );
}

async function startApiServer(): Promise<Server> {
  const workerVars = parse(readFileSync(join(backendRoot, ".dev.vars")));
  const executionContext = {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as Parameters<typeof app.fetch>[2];
  const server = createServer(async (incoming, outgoing) => {
    try {
      const requestUrl = new URL(incoming.url ?? "/", apiOrigin);
      if (requestUrl.pathname.startsWith("/api/images/")) {
        const imageResponse = await fetch(`${imageWorkerOrigin}${requestUrl.pathname}`);
        outgoing.statusCode = imageResponse.status;
        imageResponse.headers.forEach((value, name) => outgoing.setHeader(name, value));
        outgoing.end(Buffer.from(await imageResponse.arrayBuffer()));
        return;
      }
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
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
  };
  const server = createServer((incoming, outgoing) => {
    try {
      const pathname = decodeURIComponent(new URL(incoming.url ?? "/", frontendOrigin).pathname);
      const relative = pathname.replace(/^\/+/, "");
      const candidates = pathname === "/"
        ? [join(outputRoot, "index.html")]
        : [
            join(outputRoot, relative),
            join(outputRoot, `${relative}.html`),
            join(outputRoot, relative, "index.html"),
          ];
      const file = candidates.find(
        (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
      );
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
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function childResult(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolveChild, rejectChild) => {
    child.on("error", rejectChild);
    child.on("exit", (code) =>
      code === 0
        ? resolveChild()
        : rejectChild(new Error(`Child process failed (${code ?? "unknown"})`)),
    );
  });
}

async function main() {
  const { db, client } = createDb(testUrl);
  const userIds: string[] = [];
  const adminIds: string[] = [];
  const orderIds: string[] = [];
  const productId = randomUUID();
  const categoryId = randomUUID();
  const subcategoryId = randomUUID();
  const providerKey = `frontend-contract-${runId}`;
  let worker: ChildProcess | undefined;
  let apiServer: Server | undefined;
  let frontendServer: Server | undefined;

  try {
    worker = runImageWorker();
    await waitFor(`${imageWorkerOrigin}/health`);
    apiServer = await startApiServer();
    await waitFor(`${apiOrigin}/health`);
    const existingOwners = await db
      .select({ id: users.id })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(roles.name, "SUPER_ADMIN"));
    assert.equal(existingOwners.length, 0, "Test DB must not contain a Super Admin");
    const baselinePending = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.status, "PENDING_SUPER_ADMIN_APPROVAL"));

    const admin = await provisionCredentialUser(
      db,
      {
        email: `frontend-admin-${runId}@example.invalid`,
        name: "Frontend contract admin",
        password,
      },
      "ADMIN",
    );
    assert.ok(admin.adminId);
    userIds.push(admin.userId);
    adminIds.push(admin.adminId);
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, admin.userId));
    await db.update(admins).set({ status: "ACTIVE" }).where(eq(admins.id, admin.adminId));

    const owner = await provisionCredentialUser(
      db,
      {
        email: `frontend-owner-${runId}@example.invalid`,
        name: "Frontend contract owner",
        password,
      },
      "SUPER_ADMIN",
    );
    userIds.push(owner.userId);
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, owner.userId));

    const [customerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "CUSTOMER"));
    assert.ok(customerRole, "CUSTOMER role is required");
    const customerId = `frontend-customer-${runId}`;
    const customerEmail = `${customerId}@example.invalid`;
    userIds.push(customerId);
    await db.insert(users).values({
      id: customerId,
      name: "Frontend contract customer",
      email: customerEmail,
      emailVerified: true,
    });
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: customerId,
      providerId: "credential",
      userId: customerId,
      password: await hashPassword(password),
    });
    await db.insert(userRoles).values({ userId: customerId, roleId: customerRole.id });

    const otherCustomerId = `frontend-other-customer-${runId}`;
    const otherCustomerEmail = `${otherCustomerId}@example.invalid`;
    userIds.push(otherCustomerId);
    await db.insert(users).values({
      id: otherCustomerId,
      name: "Other frontend contract customer",
      email: otherCustomerEmail,
      emailVerified: true,
    });
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: otherCustomerId,
      providerId: "credential",
      userId: otherCustomerId,
      password: await hashPassword(password),
    });
    await db.insert(userRoles).values({
      userId: otherCustomerId,
      roleId: customerRole.id,
    });

    const pendingUserId = `frontend-pending-${runId}`;
    userIds.push(pendingUserId);
    await db.insert(users).values({
      id: pendingUserId,
      name: "Pending contract seller",
      email: `${pendingUserId}@example.invalid`,
      emailVerified: true,
    });
    const [pendingAdmin] = await db
      .insert(admins)
      .values({ userId: pendingUserId, status: "PENDING_SUPER_ADMIN_APPROVAL" })
      .returning({ id: admins.id });
    adminIds.push(pendingAdmin.id);
    await db.insert(adminKycSubmissions).values({
      adminId: pendingAdmin.id,
      status: "PENDING_SUPER_ADMIN_APPROVAL",
      legalName: "Pending contract seller",
      businessType: "PERSON",
      contactPhone: "9000000000",
      submittedAt: new Date(),
    });

    await db.insert(categories).values({
      id: categoryId,
      name: "Contract dresses",
      slug: "dress",
      status: "PUBLISHED",
    });
    await db.insert(subcategories).values({
      id: subcategoryId,
      categoryId,
      name: "Contract edit",
      slug: `edit-${runId}`,
      status: "PUBLISHED",
    });
    await db.insert(adminCategoryAssignments).values({
      adminId: admin.adminId,
      categoryId,
      status: "ACTIVE",
    });
    await db.insert(products).values({
      id: productId,
      categoryId,
      subcategoryId,
      createdByAdminId: admin.adminId,
      name: "Contract dress",
      slug: `contract-dress-${runId}`,
      description: "Local contract verification product.",
      sku: `contract-${runId}`,
      price: "1299.00",
      status: "PUBLISHED",
      returnEnabled: true,
      weightKg: "0.50",
      lengthCm: "30.00",
      breadthCm: "20.00",
      heightCm: "5.00",
    });
    await db.insert(productAdmins).values({ adminId: admin.adminId, productId });
    const [medium, large] = await db
      .insert(productVariants)
      .values([
        {
          productId,
          sku: `contract-m-${runId}`,
          title: "M",
          price: "1299.00",
          attributes: { size: "M" },
        },
        {
          productId,
          sku: `contract-l-${runId}`,
          title: "L",
          price: "1299.00",
          attributes: { size: "L" },
        },
      ])
      .returning();
    await db.insert(inventories).values([
      { productId, variantId: medium.id, availableQuantity: 4 },
      { productId, variantId: large.id, availableQuantity: 0 },
    ]);

    const now = Date.now();
    const orderDefinitions = [
      {
        number: `CONTRACT-CANCEL-${runId}`,
        status: "CREATED",
        paymentStatus: "PENDING",
        stockState: "RESERVED",
        deliveredAt: null,
        paymentExpiresAt: new Date(now + 10 * 60_000),
        createdAt: new Date(now),
      },
      {
        number: `CONTRACT-ELIGIBLE-${runId}`,
        status: "DELIVERED",
        paymentStatus: "PAID",
        stockState: "CONSUMED",
        deliveredAt: new Date(now - 24 * 60 * 60_000),
        paymentExpiresAt: null,
        createdAt: new Date(now - 60_000),
      },
      {
        number: `CONTRACT-RETURNED-${runId}`,
        status: "DELIVERED",
        paymentStatus: "PAID",
        stockState: "CONSUMED",
        deliveredAt: new Date(now - 24 * 60 * 60_000),
        paymentExpiresAt: null,
        createdAt: new Date(now - 120_000),
      },
    ] as const;
    const createdOrders: { id: string; itemId: string; number: string }[] = [];
    for (const definition of orderDefinitions) {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: definition.number,
          customerId,
          status: definition.status,
          paymentStatus: definition.paymentStatus,
          stockState: definition.stockState,
          paymentExpiresAt: definition.paymentExpiresAt,
          deliveredAt: definition.deliveredAt,
          placedAt: definition.status === "DELIVERED" ? definition.createdAt : null,
          createdAt: definition.createdAt,
          subtotal: "1299.00",
          totalAmount: "1299.00",
          shippingAddressSnapshot: address,
        })
        .returning({ id: orders.id });
      orderIds.push(order.id);
      await db.insert(payments).values({
        orderId: order.id,
        amount: "1299.00",
        status: definition.paymentStatus,
      });
      const [item] = await db
        .insert(orderItems)
        .values({
          orderId: order.id,
          adminId: admin.adminId,
          productId,
          variantId: medium.id,
          productNameSnapshot: "Contract dress",
          variantTitleSnapshot: "M",
          skuSnapshot: medium.sku,
          quantity: 1,
          unitPrice: "1299.00",
          subtotal: "1299.00",
          totalAmount: "1299.00",
        })
        .returning({ id: orderItems.id });
      createdOrders.push({ id: order.id, itemId: item.id, number: definition.number });
    }

    await db.insert(shippingProviderConfigs).values({
      providerKey,
      displayName: "Local frontend contract verification",
      enabled: true,
    });
    for (const delivered of createdOrders.slice(1)) {
      const [shipment] = await db
        .insert(shipments)
        .values({
          orderId: delivered.id,
          adminId: admin.adminId,
          providerKey,
          status: "DELIVERED",
          deliveredAt: new Date(now - 24 * 60 * 60_000),
          originAddressSnapshot: address,
          destinationAddressSnapshot: address,
        })
        .returning({ id: shipments.id });
      await db.insert(shipmentItems).values({
        shipmentId: shipment.id,
        orderItemId: delivered.itemId,
        orderId: delivered.id,
        adminId: admin.adminId,
      });
    }

    await db.insert(reviews).values({
      productId,
      orderItemId: createdOrders[2].itemId,
      customerId,
      rating: 5,
      title: "Contract review",
      body: "Local verification only.",
      status: "PENDING",
    });
    const [returnRecord] = await db
      .insert(returns)
      .values({
        orderId: createdOrders[2].id,
        customerId,
        adminId: admin.adminId,
        reason: "Local contract verification",
      })
      .returning({ id: returns.id });
    await db.insert(returnItems).values({
      returnId: returnRecord.id,
      orderItemId: createdOrders[2].itemId,
      orderId: createdOrders[2].id,
      adminId: admin.adminId,
      quantity: 1,
    });

    const visibleProduct = await fetch(
      `${apiOrigin}/api/products/contract-dress-${runId}`,
    );
    assert.equal(
      visibleProduct.status,
      200,
      "The isolated Worker must read the guarded test fixture",
    );

    await childResult(runNext("build"));
    frontendServer = await startFrontendServer();
    await waitFor(frontendOrigin);

    const require = createRequire(import.meta.url);
    const { chromium } = require(
      join(process.env.LOCALAPPDATA!, "ms-playwright-go/1.57.0/package/index.js"),
    );
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const evidence: Record<string, unknown> = {};

    async function rolePage(email: string) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.goto(frontendOrigin, { waitUntil: "networkidle" });
      const login = await page.evaluate(
        async ({
          api,
          emailValue,
          passwordValue,
        }: {
          api: string;
          emailValue: string;
          passwordValue: string;
        }) => {
          const response = await fetch(`${api}/api/auth/sign-in/email`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailValue, password: passwordValue }),
          });
          return response.status;
        },
        { api: apiOrigin, emailValue: email, passwordValue: password },
      );
      assert.equal(login, 200);
      return { context, page };
    }

    async function browserRequest(
      page: { evaluate: Function },
      path: string,
      init: { method?: string; body?: unknown } = {},
    ) {
      return page.evaluate(
        async ({ api, requestPath, requestInit }: {
          api: string;
          requestPath: string;
          requestInit: { method?: string; body?: unknown };
        }) => {
          const response = await fetch(`${api}${requestPath}`, {
            method: requestInit.method,
            credentials: "include",
            headers:
              requestInit.body === undefined
                ? undefined
                : { "Content-Type": "application/json" },
            body:
              requestInit.body === undefined
                ? undefined
                : JSON.stringify(requestInit.body),
          });
          return {
            status: response.status,
            body: await response.json().catch(() => null),
          };
        },
        { api: apiOrigin, requestPath: path, requestInit: init },
      );
    }

    try {
      const anonymousContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto(`${frontendOrigin}/wishlist`, { waitUntil: "networkidle" });
      await anonymousPage.getByText("Sign in to continue", { exact: true }).waitFor();
      const anonymousStatuses: Record<string, number> = {};
      for (const path of [
        "/api/customer/wishlist",
        "/api/customer/cart",
        "/api/customer/addresses",
        "/api/orders",
      ]) {
        anonymousStatuses[path] = (await browserRequest(anonymousPage, path)).status;
        assert.equal(anonymousStatuses[path], 401);
      }
      evidence.unauthenticatedProtection = {
        apiStatuses: anonymousStatuses,
        frontendGate: "PASS",
      };
      await anonymousContext.close();

      const publicContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const publicPage = await publicContext.newPage();
      const productResponse = await fetch(`${apiOrigin}/api/products/contract-dress-${runId}`);
      assert.equal(productResponse.status, 200);
      const product = (await productResponse.json()) as {
        variants: { title: string; available: boolean }[];
      };
      assert.deepEqual(
        product.variants
          .map((variant) => [variant.title, variant.available])
          .sort(([left], [right]) => String(left).localeCompare(String(right))),
        [
          ["L", false],
          ["M", true],
        ],
      );
      await publicPage.goto(`${frontendOrigin}/products/contract-dress-${runId}`, {
        waitUntil: "networkidle",
      });
      const mediumButton = publicPage.getByRole("button", { name: "M", exact: true });
      const largeButton = publicPage.getByRole("button", {
        name: /L\s*Out of stock/,
      });
      assert.equal(await mediumButton.getAttribute("aria-pressed"), "true");
      assert.equal(await mediumButton.isEnabled(), true);
      assert.equal(await largeButton.isDisabled(), true);
      const categoriesHttp = await fetch(`${apiOrigin}/api/categories`);
      const catalogHttp = await fetch(
        `${apiOrigin}/api/products?q=Contract&category=dress&available=true&limit=20&offset=0`,
      );
      assert.equal(categoriesHttp.status, 200);
      assert.equal(catalogHttp.status, 200);
      const categoriesPayload = await categoriesHttp.json() as { categories: Array<{ slug: string }> };
      const catalogPayload = await catalogHttp.json() as { products: Array<{ id: string; slug: string }> };
      assert.ok(categoriesPayload.categories.some((item) => item.slug === "dress"));
      assert.ok(catalogPayload.products.some((item) => item.id === productId));
      await publicPage.goto(`${frontendOrigin}/search?q=Contract&category=dress&available=true`, {
        waitUntil: "networkidle",
      });
      await publicPage.getByText("Contract dress", { exact: true }).first().waitFor();
      await publicPage.goto(`${frontendOrigin}/categories/dress`, { waitUntil: "networkidle" });
      await publicPage.getByText("Contract dress", { exact: true }).first().waitFor();

      const teesResponse = await fetch(`${apiOrigin}/api/products/tees`);
      assert.equal(teesResponse.status, 200, "Retained local Tees fixture is required for image verification");
      const tees = await teesResponse.json() as {
        name: string;
        images: Array<{ objectKey: string }>;
      };
      assert.ok(tees.images[0]?.objectKey, "Tees image metadata is required");
      const imageResponse = await fetch(
        `${apiOrigin}/api/images/${tees.images[0].objectKey}`,
      );
      assert.equal(imageResponse.status, 200, "Tees image bytes must exist in the local R2 binding");
      assert.match(imageResponse.headers.get("content-type") ?? "", /^image\//);
      const imageBytes = (await imageResponse.arrayBuffer()).byteLength;
      assert.ok(imageBytes > 0);
      await publicPage.goto(`${frontendOrigin}/products/tees`, { waitUntil: "networkidle" });
      const productImage = publicPage.locator("img").first();
      await productImage.waitFor();
      assert.equal(
        await productImage.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
        true,
      );
      evidence.catalog = {
        categoriesStatus: categoriesHttp.status,
        productListStatus: catalogHttp.status,
        productDetailStatus: productResponse.status,
        variants: product.variants,
        image: { status: imageResponse.status, bytes: imageBytes },
        rendered: "PASS",
      };
      await publicContext.close();

      const customer = await rolePage(customerEmail);
      const ordersResponsePromise = customer.page.waitForResponse(
        (response: { url(): string }) => new URL(response.url()).pathname === "/api/orders",
      );
      await customer.page.goto(`${frontendOrigin}/orders`, { waitUntil: "networkidle" });
      const ordersHttp = await ordersResponsePromise;
      assert.equal(ordersHttp.status(), 200);
      const ordersPayload = (await ordersHttp.json()) as { orders: Array<Record<string, unknown>> };
      const cancelArticle = customer.page.locator("article", {
        hasText: orderDefinitions[0].number,
      });
      await cancelArticle.getByText("Order details", { exact: true }).click();
      await cancelArticle.getByRole("button", { name: "Cancel unpaid order" }).click();
      await cancelArticle.getByText(/^Available until /).waitFor();
      const eligibleArticle = customer.page.locator("article", {
        hasText: orderDefinitions[1].number,
      });
      await eligibleArticle.getByText("Order details", { exact: true }).click();
      await eligibleArticle.getByRole("button", { name: "Write a review" }).waitFor();
      await eligibleArticle.getByRole("button", { name: "Request a return" }).waitFor();
      await eligibleArticle.getByText(/Return window closes .+1 of 1 eligible\./).waitFor();
      const returnedArticle = customer.page.locator("article", {
        hasText: orderDefinitions[2].number,
      });
      await returnedArticle.getByText("Order details", { exact: true }).click();
      await returnedArticle.getByText("Review pending", { exact: true }).waitFor();
      await returnedArticle.getByText(/Return: A return has already been requested/).waitFor();
      await customer.page.goto(`${frontendOrigin}/returns?id=${returnRecord.id}`, {
        waitUntil: "networkidle",
      });
      await customer.page.getByRole("button", { name: "Check return status" }).click();
      await customer.page.getByText("Refund not initiated yet.", { exact: true }).waitFor();

      await customer.page.goto(`${frontendOrigin}/products/contract-dress-${runId}`, {
        waitUntil: "networkidle",
      });
      const wishlistAdd = customer.page.getByRole("button", { name: "Add to wishlist" });
      await wishlistAdd.click();
      await customer.page.getByText("Saved to wishlist.", { exact: true }).waitFor();
      await customer.page.reload({ waitUntil: "networkidle" });
      await customer.page.getByRole("button", { name: "Remove from wishlist" }).waitFor();
      await customer.page.goto(`${frontendOrigin}/wishlist`, { waitUntil: "networkidle" });
      await customer.page.getByText("Contract dress", { exact: true }).first().waitFor();
      assert.equal(
        (await db.select().from(wishlistItems).where(eq(wishlistItems.customerId, customerId))).length,
        1,
      );
      await customer.page.getByRole("button", { name: "Remove", exact: true }).click();
      await customer.page.getByText("Your wishlist is empty", { exact: true }).waitFor();
      await customer.page.reload({ waitUntil: "networkidle" });
      await customer.page.getByText("Your wishlist is empty", { exact: true }).waitFor();
      assert.equal(
        (await db.select().from(wishlistItems).where(eq(wishlistItems.customerId, customerId))).length,
        0,
      );

      await customer.page.goto(`${frontendOrigin}/products/contract-dress-${runId}`, {
        waitUntil: "networkidle",
      });
      const addCartResponsePromise = customer.page.waitForResponse((response: { url(): string; request(): { method(): string } }) => {
        const url = new URL(response.url());
        return url.pathname === `/api/customer/cart/items/${productId}` && response.request().method() === "PUT";
      });
      await customer.page.getByRole("button", { name: "Add to cart", exact: true }).click();
      const addCartHttp = await addCartResponsePromise;
      assert.equal(
        addCartHttp.status(),
        200,
        `Product-page cart mutation failed: ${await addCartHttp.text()}`,
      );
      await customer.page.getByText("Added to cart.", { exact: true }).waitFor();
      await customer.page.goto(`${frontendOrigin}/cart`, { waitUntil: "networkidle" });
      await customer.page.getByText("Contract dress", { exact: true }).waitFor();
      await customer.page.getByRole("button", { name: "Increase Contract dress quantity" }).click();
      await customer.page.getByLabel("Quantity 2").waitFor();
      await customer.page.reload({ waitUntil: "networkidle" });
      await customer.page.getByLabel("Quantity 2").waitFor();
      const cartAfterRefresh = await browserRequest(customer.page, "/api/customer/cart");
      assert.equal(cartAfterRefresh.status, 200);
      assert.equal(cartAfterRefresh.body.items[0].quantity, 2);
      assert.equal(cartAfterRefresh.body.subtotal, "2598.00");
      const persistedCartRows = await db
        .select({ quantity: cartItems.quantity })
        .from(cartItems)
        .innerJoin(carts, eq(cartItems.cartId, carts.id))
        .where(eq(carts.customerId, customerId));
      assert.deepEqual(persistedCartRows, [{ quantity: 2 }]);
      const unavailableCart = await browserRequest(
        customer.page,
        `/api/customer/cart/items/${productId}`,
        { method: "PUT", body: { quantity: 1, variantId: large.id } },
      );
      assert.equal(unavailableCart.status, 409);
      const customerCartItemId = cartAfterRefresh.body.items[0].id as string;
      await customer.page.getByRole("button", { name: "Remove", exact: true }).click();
      await customer.page.getByText("Your cart is empty", { exact: true }).waitFor();
      await browserRequest(customer.page, `/api/customer/cart/items/${productId}`, {
        method: "PUT",
        body: { quantity: 1, variantId: medium.id },
      });

      await customer.page.goto(`${frontendOrigin}/account/addresses`, { waitUntil: "networkidle" });
      const fillAddress = async (values: Record<string, string>) => {
        for (const [label, value] of Object.entries(values))
          await customer.page.getByLabel(label, { exact: true }).fill(value);
      };
      await fillAddress({
        Label: "Home gate",
        "Full name": "Customer Gate",
        Phone: "9000000001",
        "Address line 1": "1 Test Street",
        City: "Chennai",
        State: "Tamil Nadu",
        "Postal code": "600001",
      });
      await customer.page.getByLabel("Set as default").check();
      const createAddressPromise = customer.page.waitForResponse((response: { url(): string; request(): { method(): string } }) => {
        const url = new URL(response.url());
        return url.pathname === "/api/customer/addresses" && response.request().method() === "POST";
      });
      const refreshAddressesPromise = customer.page.waitForResponse((response: { url(): string; request(): { method(): string } }) => {
        const url = new URL(response.url());
        return url.pathname === "/api/customer/addresses" && response.request().method() === "GET";
      });
      await customer.page.getByRole("button", { name: "Save address" }).click();
      const createAddressHttp = await createAddressPromise;
      assert.equal(
        createAddressHttp.status(),
        201,
        `Address creation failed: ${await createAddressHttp.text()}`,
      );
      const refreshAddressesHttp = await refreshAddressesPromise;
      assert.equal(refreshAddressesHttp.status(), 200);
      const refreshedAddresses = await refreshAddressesHttp.json();
      assert.ok(
        refreshedAddresses.addresses.some((item: { label: string }) => item.label === "Home gate"),
      );
      await customer.page.locator("article", { hasText: "Home gate" }).waitFor();
      await fillAddress({
        Label: "Office gate",
        "Full name": "Customer Gate Office",
        Phone: "9000000002",
        "Address line 1": "2 Test Avenue",
        City: "Chennai",
        State: "Tamil Nadu",
        "Postal code": "600002",
      });
      const createSecondAddressPromise = customer.page.waitForResponse((response: { url(): string; request(): { method(): string } }) => {
        const url = new URL(response.url());
        return url.pathname === "/api/customer/addresses" && response.request().method() === "POST";
      });
      await customer.page.getByRole("button", { name: "Save address" }).click();
      const createSecondAddressHttp = await createSecondAddressPromise;
      assert.equal(
        createSecondAddressHttp.status(),
        201,
        `Second address creation failed: ${await createSecondAddressHttp.text()}`,
      );
      const addressRows = await db
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, customerId));
      assert.equal(addressRows.length, 2);
      assert.equal(addressRows.filter((item) => item.isDefault).length, 1);
      const officeArticle = customer.page.locator("article", { hasText: "Office gate" });
      await officeArticle.getByRole("button", { name: "Edit" }).click();
      await customer.page.getByLabel("Label", { exact: true }).fill("Office updated");
      await customer.page.getByLabel("Set as default").check();
      await customer.page.getByRole("button", { name: "Save changes" }).click();
      const updatedAddresses = await browserRequest(customer.page, "/api/customer/addresses");
      assert.equal(updatedAddresses.status, 200);
      assert.equal(updatedAddresses.body.addresses[0].label, "Office updated");
      assert.equal(updatedAddresses.body.addresses[0].isDefault, true);
      const homeAddress = updatedAddresses.body.addresses.find((item: { label: string }) => item.label === "Home gate");
      assert.equal(homeAddress.isDefault, false);
      await customer.page.locator("article", { hasText: "Home gate" }).getByRole("button", { name: "Delete" }).click();
      await customer.page.locator("article", { hasText: "Home gate" }).waitFor({ state: "detached" });
      const ownedAddressId = updatedAddresses.body.addresses[0].id as string;

      const quoteResponsePromise = customer.page.waitForResponse(
        (response: { url(): string }) => new URL(response.url()).pathname === "/api/customer/checkout/quote",
      );
      await customer.page.goto(`${frontendOrigin}/checkout`, { waitUntil: "networkidle" });
      const quoteHttp = await quoteResponsePromise;
      assert.equal(quoteHttp.status(), 200);
      const quote = await quoteHttp.json();
      assert.equal(quote.subtotal, "1299.00");
      assert.equal(quote.totalAmount, "1299.00");
      assert.deepEqual(quote.problems, []);
      await customer.page.getByText("Payable amount", { exact: true }).waitFor();
      await customer.page.getByText("Payment is not available yet", { exact: true }).waitFor();

      const orderDetail = await browserRequest(customer.page, `/api/orders/${createdOrders[1].id}`);
      assert.equal(orderDetail.status, 200);
      assert.equal(orderDetail.body.id, createdOrders[1].id);
      const returnDetail = await browserRequest(customer.page, `/api/returns/${returnRecord.id}`);
      assert.equal(returnDetail.status, 200);
      assert.equal(returnDetail.body.refund, null);

      const otherCustomer = await rolePage(otherCustomerEmail);
      const otherAddress = await browserRequest(otherCustomer.page, "/api/customer/addresses", {
        method: "POST",
        body: { ...address, label: "Other customer", isDefault: true },
      });
      assert.equal(otherAddress.status, 201);
      const crossOrder = await browserRequest(otherCustomer.page, `/api/orders/${createdOrders[1].id}`);
      const crossReturn = await browserRequest(otherCustomer.page, `/api/returns/${returnRecord.id}`);
      const crossAddress = await browserRequest(otherCustomer.page, `/api/customer/addresses/${ownedAddressId}`, { method: "DELETE" });
      const crossCart = await browserRequest(otherCustomer.page, `/api/customer/cart/items/${customerCartItemId}`, { method: "DELETE" });
      assert.equal(crossOrder.status, 404);
      assert.equal(crossReturn.status, 404);
      assert.equal(crossAddress.status, 404);
      assert.equal(crossCart.status, 404);
      const otherOrders = await browserRequest(otherCustomer.page, "/api/orders");
      const otherWishlist = await browserRequest(otherCustomer.page, "/api/customer/wishlist");
      const otherCart = await browserRequest(otherCustomer.page, "/api/customer/cart");
      assert.equal(otherOrders.body.orders.length, 0);
      assert.equal(otherWishlist.body.products.length, 0);
      assert.equal(otherCart.body.items.length, 0);
      const missingAddressQuote = await browserRequest(
        otherCustomer.page,
        "/api/customer/checkout/quote?addressId=00000000-0000-0000-0000-000000000000",
      );
      assert.equal(missingAddressQuote.status, 200);
      assert.equal(missingAddressQuote.body.valid, false);
      assert.ok(missingAddressQuote.body.problems.includes("ADDRESS_UNAVAILABLE"));
      assert.ok(missingAddressQuote.body.problems.includes("EMPTY_CART"));
      await otherCustomer.context.close();

      evidence.wishlist = { readAddRemoveRefresh: "PASS", databasePersistence: "PASS" };
      evidence.cart = {
        readAddUpdateRemoveRefresh: "PASS",
        api: cartAfterRefresh,
        unavailableVariantStatus: unavailableCart.status,
        databasePersistence: "PASS",
      };
      evidence.addresses = {
        listCreateUpdateDeleteDefault: "PASS",
        ownershipStatus: crossAddress.status,
      };
      evidence.checkoutQuote = {
        status: quoteHttp.status(),
        subtotal: quote.subtotal,
        totalAmount: quote.totalAmount,
        inventoryRejectionStatus: unavailableCart.status,
        missingAddress: {
          status: missingAddressQuote.status,
          valid: missingAddressQuote.body.valid,
          problems: missingAddressQuote.body.problems,
        },
        rendered: "PASS",
      };
      evidence.ownership = {
        order: crossOrder.status,
        return: crossReturn.status,
        address: crossAddress.status,
        cartItem: crossCart.status,
        isolatedCollections: "PASS",
      };
      evidence.customer = {
        ordersApiStatus: ordersHttp.status(),
        cancellation: "PASS",
        reviewState: "PASS",
        returnEligibility: "PASS",
        refundNull: "PASS",
        orderDetailStatus: orderDetail.status,
        returnDetailStatus: returnDetail.status,
        fields: ordersPayload.orders.map((order) => ({
          cancellationEligible: order.cancellationEligible,
          cancellationDeadline: order.cancellationDeadline,
        })),
      };
      await customer.context.close();

      const adminPage = await rolePage(admin.email);
      await adminPage.page.goto(`${frontendOrigin}/admin`, { waitUntil: "networkidle" });
      await adminPage.page.locator('section[aria-label="Key metrics"]').waitFor();
      const adminReturn = await adminPage.page.evaluate(async ({
        api,
        id,
      }: {
        api: string;
        id: string;
      }) => {
        const response = await fetch(`${api}/api/admin/returns/${id}`, {
          credentials: "include",
        });
        return { status: response.status, body: await response.json() };
      }, { api: apiOrigin, id: returnRecord.id });
      assert.equal(adminReturn.status, 200);
      assert.equal(adminReturn.body.refund, null);
      evidence.admin = { dashboard: "PASS", returnRefundNull: "PASS" };
      await adminPage.context.close();

      const ownerPage = await rolePage(owner.email);
      const summaryPromise = ownerPage.page.waitForResponse(
        (response: { url(): string }) => new URL(response.url()).pathname === "/api/super-admin/summary",
      );
      const adminsPromise = ownerPage.page.waitForResponse((response: { url(): string }) => {
        const url = new URL(response.url());
        return url.pathname === "/api/super-admin/admins";
      });
      await ownerPage.page.goto(`${frontendOrigin}/super-admin`, { waitUntil: "networkidle" });
      const [summaryHttp, adminsHttp] = await Promise.all([summaryPromise, adminsPromise]);
      const summary = await summaryHttp.json();
      const adminList = await adminsHttp.json();
      assert.equal(summary.admins.pending, baselinePending.length + 1);
      assert.equal(new URL(adminsHttp.url()).searchParams.get("status"), "PENDING_SUPER_ADMIN_APPROVAL");
      assert.ok(adminList.admins.length >= 1);
      assert.ok(
        adminList.admins.every(
          (listedAdmin: { status: string }) =>
            listedAdmin.status === "PENDING_SUPER_ADMIN_APPROVAL",
        ),
      );
      await ownerPage.page.getByText("Admins pending approval", { exact: true }).waitFor();
      assert.ok((await ownerPage.page.locator("#insights").innerText()).includes("1"));
      await ownerPage.page.getByText("Pending contract seller", { exact: true }).waitFor();
      evidence.superAdmin = {
        summaryPending: summary.admins.pending,
        filter: "PENDING_SUPER_ADMIN_APPROVAL",
        rendered: "PASS",
      };
      await ownerPage.context.close();
      console.log(JSON.stringify({ result: "PASS", environment: target.pathname, evidence }, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    if (frontendServer)
      await new Promise<void>((resolveClose) => frontendServer!.close(() => resolveClose()));
    if (apiServer)
      await new Promise<void>((resolveClose) => apiServer!.close(() => resolveClose()));
    if (worker && worker.exitCode === null) worker.kill();
    try {
      if (orderIds.length) {
        const shipmentRows = await db
          .select({ id: shipments.id })
          .from(shipments)
          .where(inArray(shipments.orderId, orderIds));
        if (shipmentRows.length)
          await db
            .delete(shipmentItems)
            .where(inArray(shipmentItems.shipmentId, shipmentRows.map((row) => row.id)));
        await db.delete(reviews).where(inArray(reviews.orderItemId,
          (await db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, orderIds))).map((row) => row.id),
        ));
        const returnRows = await db
          .select({ id: returns.id })
          .from(returns)
          .where(inArray(returns.orderId, orderIds));
        if (returnRows.length) {
          await db.delete(returnItems).where(inArray(returnItems.returnId, returnRows.map((row) => row.id)));
          await db.delete(returns).where(inArray(returns.id, returnRows.map((row) => row.id)));
        }
        await db.delete(shipments).where(inArray(shipments.orderId, orderIds));
        await db.delete(payments).where(inArray(payments.orderId, orderIds));
        await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
        await db.delete(orders).where(inArray(orders.id, orderIds));
      }
      await db.delete(shippingProviderConfigs).where(eq(shippingProviderConfigs.providerKey, providerKey));
      if (userIds.length) {
        const customerCarts = await db
          .select({ id: carts.id })
          .from(carts)
          .where(inArray(carts.customerId, userIds));
        if (customerCarts.length)
          await db
            .delete(cartItems)
            .where(inArray(cartItems.cartId, customerCarts.map((row) => row.id)));
        await db.delete(carts).where(inArray(carts.customerId, userIds));
        await db
          .delete(wishlistItems)
          .where(inArray(wishlistItems.customerId, userIds));
        await db
          .delete(customerAddresses)
          .where(inArray(customerAddresses.customerId, userIds));
      }
      await db.delete(inventories).where(eq(inventories.productId, productId));
      await db.delete(productVariants).where(eq(productVariants.productId, productId));
      await db.delete(productAdmins).where(eq(productAdmins.productId, productId));
      await db.delete(products).where(eq(products.id, productId));
      if (adminIds.length) {
        await db.delete(adminCategoryAssignments).where(inArray(adminCategoryAssignments.adminId, adminIds));
        await db.delete(adminKycSubmissions).where(inArray(adminKycSubmissions.adminId, adminIds));
      }
      await db.delete(subcategories).where(eq(subcategories.id, subcategoryId));
      await db.delete(categories).where(eq(categories.id, categoryId));
      if (userIds.length) {
        await db.delete(sessions).where(inArray(sessions.userId, userIds));
        await db.delete(accounts).where(inArray(accounts.userId, userIds));
        await db.delete(userRoles).where(inArray(userRoles.userId, userIds));
      }
      if (adminIds.length) await db.delete(admins).where(inArray(admins.id, adminIds));
      if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
      console.log("Cleanup PASS: temporary contract fixture removed.");
    } finally {
      await client.end({ timeout: 2 });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
