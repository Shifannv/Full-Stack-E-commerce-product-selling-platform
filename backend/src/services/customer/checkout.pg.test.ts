import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createDb } from "../../db";
import worker from "../../index";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments } from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import { categories, inventories, productAdmins, products, productVariants, subcategories } from "../../db/schema/catalog";
import { cartItems, carts, customerAddresses } from "../../db/schema/customer";
import { cashfreeWebhookEvents, orderItems, orders, payments } from "../../db/schema/orders";
import { admins } from "../../db/schema/rbac";
import { refunds, returns, returnItems, returnInspections } from "../../db/schema/returns";
import { shipments, shipmentItems, shipmentEvents, shippingProviderConfigs, shippingProviderLocations } from "../../db/schema/shipping";
import { createForwardShipment, ingestShiprocketWebhook, listShipmentReconciliationCandidates, reconcileShipment, recordKnownProviderShipment } from "../shipping/shipping.service";
import type { ShippingProvider } from "../shipping/shipping-provider";
import { adminSettlements, payoutRequests, payoutSettlementItems } from "../../db/schema/finance";
import { authorizeRefund, requestReturn, decideReturn, markReturnReceived, inspectReturn, submitRefund } from "../returns/return.service";
import { CashfreeRefundAdapter } from "../returns/cashfree-refund.adapter";
import { listUnresolvedRefundObligations } from "../reservation.service";
import { getAdminFinance, requestPayout, reviewPayout } from "../admin/finance.service";
import { applyVerifiedPayment, cancelUnpaidOrder, expireUnpaidOrder, expireUnpaidOrderInTransaction, markRefundResolved, recordDefinitivePaymentFailure, recordVerifiedPayment, releaseUnpaidOrder } from "../reservation.service";
import { requireFulfillmentEligible } from "../order-eligibility";
import { createSettlement } from "../admin/finance.service";
import { requireSettlementEligible } from "../admin/settlement-eligibility";
import { createPaymentSession, ingestCashfreeWebhook } from "../payment.service";
import { recoverDueUnpaidOrder, runDueOrderExpiryBatch } from "../unpaid-expiry.service";
import { setProductInventory } from "../admin/catalog.service";
import { checkoutCart, getCustomerOrders, quoteCart } from "./order.service";
import { setCartItem } from "./customer.service";
import { canPurchaseProduct } from "./purchase-eligibility";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (testUrl) {
  const target = new URL(testUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "5432" || target.pathname !== "/ownline_checkout_test" || decodeURIComponent(target.username) !== "postgres") throw new Error("Unexpected checkout test database target");
}
if (testUrl && process.env.DATABASE_URL) {
  const testDatabase = new URL(testUrl), configured = new URL(process.env.DATABASE_URL);
  if (testDatabase.hostname === configured.hostname && testDatabase.port === configured.port && testDatabase.pathname === configured.pathname) throw new Error("Checkout tests require a dedicated database");
}

async function fixture(run: (context: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL is required");
  const context = await createFixture();
  try { await run(context); } finally { await context.cleanup(); }
}

async function createFixture() {
  const { db, client } = createDb(testUrl!);
  const id = randomUUID(), adminId = randomUUID(), categoryId = randomUUID(), subcategoryId = randomUUID(), productId = randomUUID();
  const customers = [`checkout-a-${id}`, `checkout-b-${id}`];
  const seller = `checkout-seller-${id}`;
  const addressIds: string[] = [];
  const extraProductIds: string[] = [];
  const extraShippingProviderKeys: string[] = [];
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values([...customers, seller].map((userId) => ({ id: userId, name: "Checkout fixture", email: `${userId}@example.invalid` })));
      await tx.insert(admins).values({ id: adminId, userId: seller, status: "ACTIVE" });
      await tx.insert(categories).values({ id: categoryId, name: "Checkout fixture", slug: `checkout-${id}`, status: "PUBLISHED" });
      await tx.insert(subcategories).values({ id: subcategoryId, categoryId, name: "Fixture", slug: "fixture", status: "PUBLISHED" });
      await tx.insert(adminCategoryAssignments).values({ adminId, categoryId, status: "ACTIVE" });
      await tx.insert(products).values({ id: productId, categoryId, subcategoryId, createdByAdminId: adminId, name: "Checkout fixture", slug: `checkout-${id}`, status: "PUBLISHED", price: "500.00", sku: `checkout-${id}`, weightKg: "1", lengthCm: "10", breadthCm: "10", heightCm: "10" });
      await tx.insert(productAdmins).values({ adminId, productId });
      await tx.insert(inventories).values({ productId, availableQuantity: 2 });
      const addresses = await tx.insert(customerAddresses).values(customers.map((customerId) => ({ customerId, label: "Fixture", contactName: "Fixture", phone: "9999999999", line1: "Fixture Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" }))).returning({ id: customerAddresses.id });
      addressIds.push(...addresses.map((address) => address.id));
      const fixtureCarts = await tx.insert(carts).values(customers.map((customerId) => ({ customerId }))).returning({ id: carts.id });
      await tx.insert(cartItems).values(fixtureCarts.map((cart) => ({ cartId: cart.id, productId, quantity: 1 })));
    });
  } catch (error) { await client.end({ timeout: 1 }); throw error; }
  return {
    db, customers, addressIds, productId, categoryId, subcategoryId, adminId, extraProductIds, extraShippingProviderKeys,
    async cleanup() {
      try {
        await db.transaction(async (tx) => {
          const createdOrders = await tx.select({ id: orders.id }).from(orders).where(inArray(orders.customerId, customers));
          if (createdOrders.length) {
            const ids = createdOrders.map((order) => order.id);
            const settlementRows = await tx.select({ id: adminSettlements.id }).from(adminSettlements).where(inArray(adminSettlements.orderId, ids));
            if (settlementRows.length) await tx.delete(payoutSettlementItems).where(inArray(payoutSettlementItems.settlementId, settlementRows.map((row) => row.id)));
            await tx.delete(payoutRequests).where(eq(payoutRequests.adminId, adminId));
            await tx.delete(adminSettlements).where(inArray(adminSettlements.orderId, ids));
            const shipmentRows = await tx.select({ id: shipments.id }).from(shipments).where(inArray(shipments.orderId, ids));
            if (shipmentRows.length) await tx.delete(shipmentEvents).where(inArray(shipmentEvents.shipmentId, shipmentRows.map((row) => row.id)));
            await tx.delete(shipmentItems).where(inArray(shipmentItems.orderId, ids));
            await tx.delete(shipments).where(inArray(shipments.orderId, ids));
            await tx.delete(refunds).where(inArray(refunds.orderId, ids));
            const returnRows = await tx.select({ id: returns.id }).from(returns).where(inArray(returns.orderId, ids));
            if (returnRows.length) {
              await tx.delete(returnInspections).where(inArray(returnInspections.returnId, returnRows.map((row) => row.id)));
              await tx.delete(returnItems).where(inArray(returnItems.returnId, returnRows.map((row) => row.id)));
              await tx.delete(returns).where(inArray(returns.id, returnRows.map((row) => row.id)));
            }
            await tx.delete(cashfreeWebhookEvents).where(inArray(cashfreeWebhookEvents.orderId, ids));
            await tx.delete(payments).where(inArray(payments.orderId, ids));
            await tx.delete(orderItems).where(inArray(orderItems.orderId, ids));
            await tx.delete(orders).where(inArray(orders.id, ids));
          }
          await tx.delete(cartItems).where(inArray(cartItems.productId, [productId, ...extraProductIds]));
          await tx.delete(carts).where(inArray(carts.customerId, customers));
          await tx.delete(customerAddresses).where(inArray(customerAddresses.customerId, customers));
          await tx.delete(inventories).where(inArray(inventories.productId, [productId, ...extraProductIds]));
          await tx.delete(productVariants).where(inArray(productVariants.productId, [productId, ...extraProductIds]));
          await tx.delete(productAdmins).where(inArray(productAdmins.productId, [productId, ...extraProductIds]));
          await tx.delete(products).where(inArray(products.id, [productId, ...extraProductIds]));
          await tx.delete(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId));
          await tx.delete(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId));
          await tx.delete(shippingProviderLocations).where(eq(shippingProviderLocations.adminId, adminId));
          await tx.delete(adminAddresses).where(eq(adminAddresses.adminId, adminId));
          await tx.delete(shippingProviderConfigs).where(eq(shippingProviderConfigs.providerKey, `refund-${adminId}`));
          if (extraShippingProviderKeys.length) await tx.delete(shippingProviderConfigs).where(inArray(shippingProviderConfigs.providerKey, extraShippingProviderKeys));
          await tx.delete(subcategories).where(eq(subcategories.id, subcategoryId));
          await tx.delete(categories).where(eq(categories.id, categoryId));
          await tx.delete(admins).where(eq(admins.id, adminId));
          await tx.delete(users).where(inArray(users.id, [...customers, seller]));
        });
      } finally { await client.end({ timeout: 1 }); }
    },
  };
}

async function intent(context: Awaited<ReturnType<typeof createFixture>>, customer = 0) {
  const addressId = context.addressIds[customer];
  const quote = await quoteCart(context.db, context.customers[customer], addressId);
  assert.equal(quote.valid, true);
  return { addressId, key: randomUUID(), cartVersion: quote.cartVersion, lineFingerprint: quote.lineFingerprint };
}

async function addProduct(context: Awaited<ReturnType<typeof createFixture>>) {
  const id = randomUUID();
  context.extraProductIds.push(id);
  await context.db.transaction(async (tx) => {
    await tx.insert(products).values({ id, categoryId: context.categoryId, subcategoryId: context.subcategoryId, createdByAdminId: context.adminId, name: "Second fixture", slug: `checkout-${id}`, status: "PUBLISHED", price: "100.00", sku: `checkout-${id}`, weightKg: "1", lengthCm: "10", breadthCm: "10", heightCm: "10" });
    await tx.insert(productAdmins).values({ adminId: context.adminId, productId: id });
    await tx.insert(inventories).values({ productId: id, availableQuantity: 2 });
  });
  return id;
}

test("PostgreSQL checkout reserves stock and replays the same intent exactly once", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  const first = await checkoutCart(context.db, context.customers[0], input);
  const replay = await checkoutCart(context.db, context.customers[0], input);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.orderId, first.orderId);
  assert.equal(first.status, "CREATED");
  assert.equal(first.stockState, "RESERVED");
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  assert.equal(stock.availableQuantity, 1);
  assert.equal(stock.reservedQuantity, 1);
  assert.equal(stock.version, 1);
  assert.equal((await context.db.select().from(payments).where(eq(payments.orderId, first.orderId))).length, 1);
  await assert.rejects(checkoutCart(context.db, context.customers[0], { ...input, cartVersion: input.cartVersion + 1 }), /IDEMPOTENCY_KEY_REUSED/);
  await assert.rejects(checkoutCart(context.db, context.customers[0], { ...input, key: randomUUID() }), /EMPTY_CART/);
}));

test("lost response retry on an independent connection replays the committed order", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  const first = createDb(testUrl!);
  const second = createDb(testUrl!);
  try {
    await checkoutCart(first.db, context.customers[0], input); // Deliberately discard the response.
    const replay = await checkoutCart(second.db, context.customers[0], input);
    assert.equal(replay.replayed, true);
    const saved = await context.db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, context.customers[0]));
    assert.deepEqual(saved.map((order) => order.id), [replay.orderId]);
    assert.equal((await context.db.select().from(payments).where(eq(payments.orderId, replay.orderId))).length, 1);
  } finally {
    await first.client.end({ timeout: 1 });
    await second.client.end({ timeout: 1 });
  }
}));

test("same checkout key with a changed fingerprint is rejected", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  await checkoutCart(context.db, context.customers[0], input);
  await assert.rejects(checkoutCart(context.db, context.customers[0], { ...input, lineFingerprint: "f".repeat(64) }), /IDEMPOTENCY_KEY_REUSED/);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 1);
}));

test("PostgreSQL checkout rejects a changed price without consuming the cart", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  await context.db.update(products).set({ price: "550.00" }).where(eq(products.id, context.productId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /QUOTE_CHANGED/);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
  assert.equal((await context.db.select().from(cartItems).innerJoin(carts, eq(cartItems.cartId, carts.id)).where(eq(carts.customerId, context.customers[0]))).length, 1);
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  assert.equal(stock.availableQuantity, 2);
  assert.equal(stock.reservedQuantity, 0);
}));

test("PostgreSQL checkout rechecks publication and seller assignment", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  await context.db.update(products).set({ status: "DRAFT" }).where(eq(products.id, context.productId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /PRODUCT_UNAVAILABLE/);
  await context.db.update(products).set({ status: "PUBLISHED" }).where(eq(products.id, context.productId));
  await context.db.update(categories).set({ status: "DRAFT" }).where(eq(categories.id, context.categoryId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /PRODUCT_UNAVAILABLE/);
  await context.db.update(categories).set({ status: "PUBLISHED" }).where(eq(categories.id, context.categoryId));
  await context.db.update(subcategories).set({ status: "DRAFT" }).where(eq(subcategories.id, context.subcategoryId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /PRODUCT_UNAVAILABLE/);
  await context.db.update(subcategories).set({ status: "PUBLISHED" }).where(eq(subcategories.id, context.subcategoryId));
  await context.db.update(admins).set({ status: "SUSPENDED" }).where(eq(admins.id, context.adminId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /PRODUCT_UNAVAILABLE/);
  await context.db.update(admins).set({ status: "ACTIVE" }).where(eq(admins.id, context.adminId));
  await context.db.update(adminCategoryAssignments).set({ status: "REVOKED" }).where(eq(adminCategoryAssignments.adminId, context.adminId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /PRODUCT_UNAVAILABLE/);
  await context.db.update(adminCategoryAssignments).set({ status: "ACTIVE" }).where(eq(adminCategoryAssignments.adminId, context.adminId));
  await context.db.update(inventories).set({ availableQuantity: 0 }).where(eq(inventories.productId, context.productId));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /INSUFFICIENT_STOCK/);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
}));

test("PostgreSQL cart version rejects a stale checkout intent", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  await context.db.update(carts).set({ version: sql`${carts.version} + 1` }).where(eq(carts.customerId, context.customers[0]));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /QUOTE_CHANGED/);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
}));

test("cart edit and checkout on independent transactions serialize through the cart lock", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  const editor = createDb(testUrl!), buyer = createDb(testUrl!);
  let release!: () => void, locked!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  try {
    const edit = editor.db.transaction(async (tx) => {
      const [cart] = await tx.select({ id: carts.id }).from(carts).where(eq(carts.customerId, context.customers[0])).for("update");
      locked();
      await hold;
      await setCartItem(tx as never, context.customers[0], context.productId, 2);
    });
    await acquired;
    const checkout = assert.rejects(checkoutCart(buyer.db, context.customers[0], input), /QUOTE_CHANGED/);
    release();
    await edit;
    await checkout;
    assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
  } finally {
    release?.();
    await editor.client.end({ timeout: 1 });
    await buyer.client.end({ timeout: 1 });
  }
}));

test("missing and wrong-product variants are rejected by production eligibility", { skip: !testUrl }, async () => fixture(async (context) => {
  await assert.rejects(canPurchaseProduct(context.db, context.productId, randomUUID(), 1), /VARIANT_UNAVAILABLE/);
  const input = await intent(context);
  const otherProductId = await addProduct(context);
  const [wrongVariant] = await context.db.insert(productVariants).values({ productId: otherProductId, sku: `wrong-${randomUUID()}`, title: "Wrong product", price: null, status: "ACTIVE" }).returning();
  const [cart] = await context.db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, context.customers[0]));
  await context.db.update(cartItems).set({ variantId: wrongVariant.id }).where(eq(cartItems.cartId, cart.id));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /VARIANT_UNAVAILABLE/);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
}));

test("outer transaction rollback leaves checkout order, payment, stock, and cart unchanged", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  const rollback = new Error("ROLLBACK_CHECKOUT_TEST");
  let createdOrderId = "";
  await assert.rejects(context.db.transaction(async (tx) => {
    createdOrderId = (await checkoutCart(tx as never, context.customers[0], input)).orderId;
    throw rollback;
  }), (error: unknown) => error === rollback);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
  assert.ok(createdOrderId);
  assert.equal((await context.db.select().from(payments).where(eq(payments.orderId, createdOrderId))).length, 0);
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  const [cart] = await context.db.select().from(carts).where(eq(carts.customerId, context.customers[0]));
  assert.equal(stock.availableQuantity, 2);
  assert.equal(stock.reservedQuantity, 0);
  assert.equal(cart.version, 0);
  assert.equal((await context.db.select().from(cartItems).where(eq(cartItems.cartId, cart.id))).length, 1);
}));

test("PostgreSQL checkout rejects a variant deactivated after quote", { skip: !testUrl }, async () => fixture(async (context) => {
  const [variant] = await context.db.insert(productVariants).values({ productId: context.productId, sku: `variant-${randomUUID()}`, title: "Large", price: null, status: "ACTIVE" }).returning();
  await context.db.insert(inventories).values({ productId: context.productId, variantId: variant.id, availableQuantity: 1 });
  await context.db.update(cartItems).set({ variantId: variant.id }).where(eq(cartItems.productId, context.productId));
  const input = await intent(context);
  await context.db.update(productVariants).set({ status: "INACTIVE" }).where(eq(productVariants.id, variant.id));
  await assert.rejects(checkoutCart(context.db, context.customers[0], input), /VARIANT_UNAVAILABLE/);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 0);
}));

test("concurrent same-key checkout creates one order and one replay", { skip: !testUrl }, async () => fixture(async (context) => {
  const input = await intent(context);
  const results = await Promise.all([checkoutCart(context.db, context.customers[0], input), checkoutCart(context.db, context.customers[0], input)]);
  assert.equal(results[0].orderId, results[1].orderId);
  assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
  assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 1);
}));

test("independent PostgreSQL checkouts cannot reserve the same last unit", { skip: !testUrl }, async () => fixture(async (context) => {
  await context.db.update(inventories).set({ availableQuantity: 1 }).where(eq(inventories.productId, context.productId));
  const inputs = await Promise.all([intent(context, 0), intent(context, 1)]);
  const results = await Promise.allSettled(inputs.map((input, i) => checkoutCart(context.db, context.customers[i], input)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  assert.equal(stock.availableQuantity, 0);
  assert.equal(stock.reservedQuantity, 1);
  assert.equal((await context.db.select().from(orders).where(inArray(orders.customerId, context.customers))).length, 1);
}));

test("reverse cart insertion order still completes both multi-inventory reservations", { skip: !testUrl }, async () => fixture(async (context) => {
  const otherProductId = await addProduct(context);
  const fixtureCarts = await context.db.select({ id: carts.id, customerId: carts.customerId }).from(carts).where(inArray(carts.customerId, context.customers));
  const firstCart = fixtureCarts.find((cart) => cart.customerId === context.customers[0])!;
  const secondCart = fixtureCarts.find((cart) => cart.customerId === context.customers[1])!;
  await context.db.delete(cartItems).where(inArray(cartItems.cartId, [firstCart.id, secondCart.id]));
  await context.db.insert(cartItems).values([
    { cartId: firstCart.id, productId: context.productId, quantity: 1 },
    { cartId: firstCart.id, productId: otherProductId, quantity: 1 },
    { cartId: secondCart.id, productId: otherProductId, quantity: 1 },
    { cartId: secondCart.id, productId: context.productId, quantity: 1 },
  ]);
  const inputs = await Promise.all([intent(context, 0), intent(context, 1)]);
  const first = createDb(testUrl!), second = createDb(testUrl!);
  try {
    const results = await Promise.all([checkoutCart(first.db, context.customers[0], inputs[0]), checkoutCart(second.db, context.customers[1], inputs[1])]);
    assert.notEqual(results[0].orderId, results[1].orderId);
    const stocks = await context.db.select().from(inventories).where(inArray(inventories.productId, [context.productId, otherProductId]));
    assert.equal(stocks.length, 2);
    for (const stock of stocks) { assert.equal(stock.availableQuantity, 0); assert.equal(stock.reservedQuantity, 2); }
  } finally {
    await first.client.end({ timeout: 1 });
    await second.client.end({ timeout: 1 });
  }
}));

test("PostgreSQL serialization failure retries the whole checkout transaction", { skip: !testUrl }, async () => fixture(async (context) => {
  const name = `checkout_retry_${randomUUID().replaceAll("-", "")}`;
  const functionName = `${name}_fn`, sequenceName = `${name}_seq`;
  const input = await intent(context);
  // A sequence survives transaction rollback, so the trigger raises 40001
  // exactly once on this fixture customer's order insert.
  await context.db.execute(sql.raw(`create sequence ${sequenceName}`));
  try {
    await context.db.execute(sql.raw(`create function ${functionName}() returns trigger language plpgsql as $$ begin if new.customer_id = '${context.customers[0]}' and nextval('${sequenceName}') = 1 then raise exception using errcode = '40001'; end if; return new; end $$`));
    await context.db.execute(sql.raw(`create trigger ${name} before insert on orders for each row execute function ${functionName}()`));
    const placed = await checkoutCart(context.db, context.customers[0], input);
    assert.equal(placed.replayed, false);
    assert.equal((await context.db.select().from(orders).where(eq(orders.customerId, context.customers[0]))).length, 1);
    assert.equal((await context.db.select().from(payments).where(eq(payments.orderId, placed.orderId))).length, 1);
    const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
    assert.equal(stock.availableQuantity, 1);
    assert.equal(stock.reservedQuantity, 1);
    const [{ lastValue }] = await context.db.execute<{ lastValue: string }>(sql.raw(`select last_value as "lastValue" from ${sequenceName}`));
    assert.equal(Number(lastValue), 2);
  } finally {
    await context.db.execute(sql.raw(`drop trigger if exists ${name} on orders`));
    await context.db.execute(sql.raw(`drop function if exists ${functionName}()`));
    await context.db.execute(sql.raw(`drop sequence if exists ${sequenceName}`));
  }
}));

test("Admin absolute stock edit preserves reservations and rejects a stale version", { skip: !testUrl }, async () => fixture(async (context) => {
  await checkoutCart(context.db, context.customers[0], await intent(context));
  await assert.rejects(setProductInventory(context.db, context.adminId, context.productId, 7, undefined, 0), /INVENTORY_VERSION_STALE/);
  const updated = await setProductInventory(context.db, context.adminId, context.productId, 7, undefined, 1);
  assert.equal(updated.availableQuantity, 7);
  assert.equal(updated.reservedQuantity, 1);
  assert.equal(updated.version, 2);
}));

test("paid and expired reservations move stock exactly once", { skip: !testUrl }, async () => fixture(async (context) => {
  const first = await checkoutCart(context.db, context.customers[0], await intent(context));
  await context.db.transaction((tx) => recordVerifiedPayment(tx, first.orderId, `paid-${randomUUID()}`));
  await context.db.transaction((tx) => recordVerifiedPayment(tx, first.orderId, `paid-${randomUUID()}`));
  const second = await checkoutCart(context.db, context.customers[1], await intent(context, 1));
  await context.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, second.orderId));
  assert.deepEqual(await releaseUnpaidOrder(context.db, second.orderId, "EXPIRED"), { stockState: "RELEASED", status: "EXPIRED" });
  assert.deepEqual(await releaseUnpaidOrder(context.db, second.orderId, "EXPIRED"), { stockState: "RELEASED", status: "EXPIRED" });
  await context.db.transaction((tx) => recordVerifiedPayment(tx, second.orderId, `late-${randomUUID()}`));
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  const [late] = await context.db.select().from(payments).where(eq(payments.orderId, second.orderId));
  assert.equal(stock.availableQuantity, 1);
  assert.equal(stock.reservedQuantity, 0);
  assert.equal(late.status, "PAID");
  assert.equal(late.resolutionStatus, "REFUND_REQUIRED");
}));

test("definitive payment failure releases stock once", { skip: !testUrl }, async () => fixture(async (context) => {
  const placed = await checkoutCart(context.db, context.customers[0], await intent(context));
  assert.deepEqual(await recordDefinitivePaymentFailure(context.db, placed.orderId), { stockState: "RELEASED", paymentStatus: "FAILED" });
  assert.deepEqual(await recordDefinitivePaymentFailure(context.db, placed.orderId), { stockState: "RELEASED", paymentStatus: "FAILED" });
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  assert.equal(stock.availableQuantity, 2);
  assert.equal(stock.reservedQuantity, 0);
}));

async function lifecycleState(context: Awaited<ReturnType<typeof createFixture>>, orderId: string) {
  const [order] = await context.db.select().from(orders).where(eq(orders.id, orderId));
  const [payment] = await context.db.select().from(payments).where(eq(payments.orderId, orderId));
  const [stock] = await context.db.select().from(inventories).where(eq(inventories.productId, context.productId));
  return { order, payment, stock };
}

async function assertInventoryInvariant(context: Awaited<ReturnType<typeof createFixture>>) {
  const productIds = [context.productId, ...context.extraProductIds];
  const rows = await context.db.execute<{ violations: string }>(sql`
    select count(*)::text as violations from inventories i
    where i.product_id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)}) and (
      i.available_quantity < 0 or i.reserved_quantity < 0 or
      i.reserved_quantity <> coalesce((
        select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
        where oi.product_id = i.product_id and oi.variant_id is not distinct from i.variant_id and o.stock_state = 'RESERVED'
      ), 0)
    )`);
  assert.equal(Number(rows[0].violations), 0);
  const [invalid] = await context.db.execute<{ violations: string }>(sql`
    select count(*)::text as violations from orders o where o.customer_id in (${context.customers[0]}, ${context.customers[1]})
    and ((o.status in ('EXPIRED','CANCELLED') and o.stock_state = 'CONSUMED')
      or (o.status = 'EXPIRED' and o.payment_status = 'PAID' and o.stock_state <> 'RELEASED')
      or (select count(*) from payments p where p.order_id = o.id) > 1)`);
  assert.equal(Number(invalid.violations), 0);
}

test("A timely verified payment consumes once with database timestamps", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  assert.equal((await applyVerifiedPayment(c.db, orderId, `paid-${randomUUID()}`)).outcome, "CONFIRMED");
  const { order, payment, stock } = await lifecycleState(c, orderId);
  assert.equal(order.status, "CONFIRMED"); assert.equal(order.stockState, "CONSUMED"); assert.ok(order.placedAt);
  assert.equal(payment.status, "PAID"); assert.ok(payment.paidAt);
  assert.equal(stock.availableQuantity, 1); assert.equal(stock.reservedQuantity, 0);
  await assertInventoryInvariant(c);
}));

test("B duplicate success never consumes twice or creates a second payment", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const reference = `paid-${randomUUID()}`;
  await applyVerifiedPayment(c.db, orderId, reference);
  const before = await lifecycleState(c, orderId);
  assert.equal((await applyVerifiedPayment(c.db, orderId, reference)).outcome, "CONFIRMED");
  const after = await lifecycleState(c, orderId);
  assert.equal(after.stock.version, before.stock.version);
  assert.equal(after.payment.paidAt?.getTime(), before.payment.paidAt?.getTime());
  assert.equal((await c.db.select().from(payments).where(eq(payments.orderId, orderId))).length, 1);
  await assertInventoryInvariant(c);
}));

test("C definitive provider-order failure releases once", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await recordDefinitivePaymentFailure(c.db, orderId);
  const before = await lifecycleState(c, orderId);
  await recordDefinitivePaymentFailure(c.db, orderId);
  const after = await lifecycleState(c, orderId);
  assert.equal(after.order.status, "CANCELLED"); assert.equal(after.payment.status, "FAILED");
  assert.equal(after.stock.version, before.stock.version); assert.equal(after.stock.availableQuantity, 2);
  await assertInventoryInvariant(c);
}));

test("D browser or network loss leaves the committed order pending", { skip: !testUrl }, async () => fixture(async (c) => {
  const input = await intent(c);
  const { orderId } = await checkoutCart(c.db, c.customers[0], input);
  assert.equal((await checkoutCart(c.db, c.customers[0], input)).orderId, orderId);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "CREATED"); assert.equal(state.payment.status, "PENDING"); assert.equal(state.stock.reservedQuantity, 1);
  await assertInventoryInvariant(c);
}));

test("E an uncertain provider timeout leaves the payment pending", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const provider = { createOrder: async () => { throw new Error("PROVIDER_TIMEOUT"); } } as never;
  await assert.rejects(createPaymentSession(c.db, provider, orderId, c.customers[0], "https://example.invalid/return", "https://example.invalid/webhook"), /PROVIDER_TIMEOUT/);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.payment.status, "PENDING"); assert.equal(state.order.stockState, "RESERVED");
  await assertInventoryInvariant(c);
}));

test("F expiry releases stock and stamps database time", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  await expireUnpaidOrder(c.db, orderId);
  const { order, payment, stock } = await lifecycleState(c, orderId);
  assert.equal(order.status, "EXPIRED"); assert.equal(order.stockState, "RELEASED"); assert.ok(order.expiredAt);
  assert.equal(payment.status, "EXPIRED"); assert.equal(stock.availableQuantity, 2); assert.equal(stock.reservedQuantity, 0);
  await assertInventoryInvariant(c);
}));

test("G duplicate expiry does not move inventory again", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  await expireUnpaidOrder(c.db, orderId);
  const before = await lifecycleState(c, orderId);
  await expireUnpaidOrder(c.db, orderId);
  const after = await lifecycleState(c, orderId);
  assert.equal(after.stock.version, before.stock.version);
  assert.equal(after.order.expiredAt?.getTime(), before.order.expiredAt?.getTime());
  await assertInventoryInvariant(c);
}));

test("H only the owning customer can cancel an unpaid order", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await assert.rejects(cancelUnpaidOrder(c.db, orderId, c.customers[1]), /ORDER_UNAVAILABLE/);
  await cancelUnpaidOrder(c.db, orderId, c.customers[0]);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "CANCELLED"); assert.equal(state.order.stockState, "RELEASED"); assert.ok(state.order.cancelledAt);
  assert.equal(state.stock.availableQuantity, 2);
  await assert.rejects(cancelUnpaidOrder(c.db, orderId, c.customers[0]), /UNPAID_CANCELLATION_UNAVAILABLE/);
  await assertInventoryInvariant(c);
}));

test("I cancelled order cannot become confirmed", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await cancelUnpaidOrder(c.db, orderId, c.customers[0]);
  await applyVerifiedPayment(c.db, orderId, `late-${randomUUID()}`);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "CANCELLED"); assert.equal(state.order.stockState, "RELEASED");
  assert.equal(state.payment.resolutionStatus, "REFUND_REQUIRED");
  await assertInventoryInvariant(c);
}));

test("J expired order cannot become confirmed", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  await expireUnpaidOrder(c.db, orderId);
  await applyVerifiedPayment(c.db, orderId, `late-${randomUUID()}`);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "EXPIRED"); assert.equal(state.order.stockState, "RELEASED");
  await assertInventoryInvariant(c);
}));

test("K late verified success records paid money and a refund obligation", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  assert.equal((await applyVerifiedPayment(c.db, orderId, `late-${randomUUID()}`)).outcome, "REFUND_REQUIRED");
  const before = await lifecycleState(c, orderId);
  assert.equal(before.order.status, "EXPIRED"); assert.equal(before.payment.status, "PAID");
  assert.equal(before.payment.resolutionStatus, "REFUND_REQUIRED"); assert.ok(before.payment.paidAt);
  assert.equal((await applyVerifiedPayment(c.db, orderId, before.payment.providerPaymentId!)).outcome, "REFUND_REQUIRED");
  const after = await lifecycleState(c, orderId);
  assert.equal(after.payment.paidAt?.getTime(), before.payment.paidAt?.getTime());
  await assertInventoryInvariant(c);
}));

test("L late success never restores or re-reserves released stock", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  await expireUnpaidOrder(c.db, orderId);
  const before = await lifecycleState(c, orderId);
  await applyVerifiedPayment(c.db, orderId, `late-${randomUUID()}`);
  const after = await lifecycleState(c, orderId);
  assert.equal(after.stock.version, before.stock.version);
  assert.equal(after.stock.availableQuantity, 2); assert.equal(after.stock.reservedQuantity, 0);
  await assertInventoryInvariant(c);
}));

test("M late paid expired order is rejected by fulfillment and settlement guards", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  await applyVerifiedPayment(c.db, orderId, `late-${randomUUID()}`);
  const { order, payment } = await lifecycleState(c, orderId);
  assert.throws(() => requireFulfillmentEligible(order, payment), /FULFILLMENT_ORDER_INELIGIBLE/);
  const [item] = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  await assert.rejects(createSettlement(c.db, item.id, 1000, 200, "0.00"), /SETTLEMENT_ORDER_INELIGIBLE/);
  await assertInventoryInvariant(c);
}));

test("N independent payment and expiry transactions serialize at the order lock", { skip: !testUrl }, async () => fixture(async (c) => {
  for (const expiryFirst of [true, false]) {
    const customer = expiryFirst ? 0 : 1;
    const { orderId } = await checkoutCart(c.db, c.customers[customer], await intent(c, customer));
    const first = createDb(testUrl!), second = createDb(testUrl!);
    let unlock!: () => void, locked!: () => void;
    const hold = new Promise<void>((resolve) => { unlock = resolve; });
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    try {
      const leading = first.db.transaction(async (tx) => {
        await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
        locked(); await hold;
        if (expiryFirst) {
          await tx.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
          await expireUnpaidOrderInTransaction(tx, orderId);
        } else await recordVerifiedPayment(tx, orderId, `paid-${randomUUID()}`);
      });
      await acquired;
      const follower = expiryFirst ? applyVerifiedPayment(second.db, orderId, `late-${randomUUID()}`) : expireUnpaidOrder(second.db, orderId);
      unlock(); await leading; await follower;
      const state = await lifecycleState(c, orderId);
      if (expiryFirst) { assert.equal(state.order.status, "EXPIRED"); assert.equal(state.payment.resolutionStatus, "REFUND_REQUIRED"); }
      else { assert.equal(state.order.status, "CONFIRMED"); assert.equal(state.stock.reservedQuantity, 0); }
    } finally { unlock?.(); await first.client.end({ timeout: 1 }); await second.client.end({ timeout: 1 }); }
  }
  await assertInventoryInvariant(c);
}));

test("O rollback after stock movement leaves order, payment, and inventory unchanged", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const before = await lifecycleState(c, orderId);
  const rollback = new Error("ROLLBACK_AFTER_STOCK");
  await assert.rejects(c.db.transaction(async (tx) => { await recordVerifiedPayment(tx, orderId, `paid-${randomUUID()}`); throw rollback; }), (error: unknown) => error === rollback);
  const after = await lifecycleState(c, orderId);
  assert.equal(after.order.status, before.order.status); assert.equal(after.payment.status, before.payment.status);
  assert.equal(after.stock.version, before.stock.version); assert.equal(after.stock.reservedQuantity, 1);
  await assertInventoryInvariant(c);
}));

test("P payment and expiry acquire multi-item inventory locks in ascending ID order", { skip: !testUrl }, async () => fixture(async (c) => {
  const other = await addProduct(c);
  const [cart] = await c.db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, c.customers[0]));
  await c.db.insert(cartItems).values({ cartId: cart.id, productId: other, quantity: 1 });
  const name = `lifecycle_order_${randomUUID().replaceAll("-", "")}`;
  await c.db.execute(sql.raw(`create table ${name}(seq bigserial primary key, inventory_id uuid not null)`));
  try {
    await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin insert into ${name}(inventory_id) values (new.id); return new; end $$`));
    await c.db.execute(sql.raw(`create trigger ${name}_trg after update on inventories for each row execute function ${name}_fn()`));
    for (const customer of [0, 1]) {
      if (customer === 1) {
        const [secondCart] = await c.db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, c.customers[1]));
        await c.db.insert(cartItems).values({ cartId: secondCart.id, productId: other, quantity: 1 });
      }
      const { orderId } = await checkoutCart(c.db, c.customers[customer], await intent(c, customer));
      await c.db.execute(sql.raw(`truncate ${name}`));
      if (customer === 0) await applyVerifiedPayment(c.db, orderId, `paid-${randomUUID()}`);
      else {
        await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
        await expireUnpaidOrder(c.db, orderId);
      }
      const locked = await c.db.execute<{ inventory_id: string }>(sql.raw(`select inventory_id from ${name} order by seq`));
      assert.equal(locked.length, 2);
      assert.deepEqual(locked.map((row) => row.inventory_id), locked.map((row) => row.inventory_id).sort());
    }
    await assertInventoryInvariant(c);
  } finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_trg on inventories`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
    await c.db.execute(sql.raw(`drop table if exists ${name}`));
  }
}));

test("Q serialization failure retries the entire payment transition", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const name = `lifecycle_retry_${randomUUID().replaceAll("-", "")}`;
  await c.db.execute(sql.raw(`create sequence ${name}_seq`));
  try {
    await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin if new.order_id = '${orderId}' and nextval('${name}_seq') = 1 then raise exception using errcode = '40001'; end if; return new; end $$`));
    await c.db.execute(sql.raw(`create trigger ${name}_trg before update on payments for each row execute function ${name}_fn()`));
    assert.equal((await applyVerifiedPayment(c.db, orderId, `paid-${randomUUID()}`)).outcome, "CONFIRMED");
    const [sequence] = await c.db.execute<{ last_value: string }>(sql.raw(`select last_value from ${name}_seq`));
    assert.equal(Number(sequence.last_value), 2);
    const state = await lifecycleState(c, orderId);
    assert.equal(state.order.status, "CONFIRMED"); assert.equal(state.stock.reservedQuantity, 0);
    await assertInventoryInvariant(c);
  } finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_trg on payments`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
    await c.db.execute(sql.raw(`drop sequence if exists ${name}_seq`));
  }
}));

test("resolved late payment stays released and repeated success remains idempotent", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
  const reference = `late-${randomUUID()}`;
  await applyVerifiedPayment(c.db, orderId, reference);
  assert.equal((await markRefundResolved(c.db, orderId)).outcome, "RESOLVED");
  assert.equal((await applyVerifiedPayment(c.db, orderId, reference)).outcome, "RESOLVED");
  const state = await lifecycleState(c, orderId);
  assert.equal(state.payment.resolutionStatus, "RESOLVED"); assert.equal(state.order.status, "EXPIRED");
  assert.equal(state.stock.reservedQuantity, 0);
  await assertInventoryInvariant(c);
}));

test("verified webhook uses the same atomic transition and deduplicates its receipt", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const event = { type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: orderId, order_amount: 500, order_currency: "INR" }, payment: { cf_payment_id: `paid-${randomUUID()}`, payment_status: "SUCCESS", payment_amount: 500, payment_currency: "INR" } } };
  assert.deepEqual(await ingestCashfreeWebhook(c.db, event), { accepted: 1, duplicates: 0 });
  const before = await lifecycleState(c, orderId);
  assert.deepEqual(await ingestCashfreeWebhook(c.db, event), { accepted: 0, duplicates: 1 });
  const after = await lifecycleState(c, orderId);
  assert.equal(after.order.status, "CONFIRMED"); assert.equal(after.payment.status, "PAID");
  assert.equal(after.stock.version, before.stock.version);
  assert.equal((await c.db.select().from(cashfreeWebhookEvents).where(eq(cashfreeWebhookEvents.orderId, orderId))).length, 1);
  await assertInventoryInvariant(c);
}));

async function makeDue(context: Awaited<ReturnType<typeof createFixture>>, orderId: string, offset = "-1 minute") {
  await context.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() + ${offset}::interval` }).where(eq(orders.id, orderId));
}

test("scheduler 1 finds a due order through the indexed batch query", { skip: !testUrl }, async () => fixture(async (c) => {
  const [index] = await c.db.execute<{ indexdef: string }>(sql`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'orders_unpaid_expiry_idx'`);
  assert.match(index.indexdef, /\(payment_expires_at\)/);
  assert.match(index.indexdef, /status.*CREATED/);
  assert.match(index.indexdef, /payment_status.*PENDING/);
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  // This test intentionally limits the scheduler to one candidate. Other
  // PostgreSQL tests run concurrently and may create due orders, so make this
  // fixture unambiguously first in the scheduler's payment_expires_at order.
  await makeDue(c, orderId, "-1 year");
  assert.deepEqual(await runDueOrderExpiryBatch(c.db, { batchSize: 1 }), { attempted: 1, expired: 1, failed: 0 });
  assert.equal((await lifecycleState(c, orderId)).order.status, "EXPIRED");
  await assertInventoryInvariant(c);
}));

test("scheduler 2 ignores a future order", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  assert.deepEqual(await runDueOrderExpiryBatch(c.db, { batchSize: 1 }), { attempted: 0, expired: 0, failed: 0 });
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "CREATED"); assert.equal(state.payment.status, "PENDING");
  await assertInventoryInvariant(c);
}));

test("scheduler 3 expires due CREATED/PENDING order and payment atomically", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  await runDueOrderExpiryBatch(c.db);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "EXPIRED"); assert.equal(state.order.stockState, "RELEASED");
  assert.equal(state.payment.status, "EXPIRED"); assert.ok(state.order.expiredAt);
  await assertInventoryInvariant(c);
}));

test("scheduler 4 releases a reservation exactly once", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  await runDueOrderExpiryBatch(c.db);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.stock.availableQuantity, 2); assert.equal(state.stock.reservedQuantity, 0); assert.equal(state.stock.version, 2);
  await assertInventoryInvariant(c);
}));

test("scheduler 5 duplicate invocations on independent connections do not double-release", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const first = createDb(testUrl!), second = createDb(testUrl!);
  try {
    await Promise.all([runDueOrderExpiryBatch(first.db), runDueOrderExpiryBatch(second.db)]);
    const state = await lifecycleState(c, orderId);
    assert.equal(state.order.status, "EXPIRED"); assert.equal(state.stock.version, 2);
    await assertInventoryInvariant(c);
  } finally { await first.client.end({ timeout: 1 }); await second.client.end({ timeout: 1 }); }
}));

test("scheduler 6 races verified payment on independent PostgreSQL connections", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const worker = createDb(testUrl!), webhook = createDb(testUrl!);
  try {
    await Promise.all([runDueOrderExpiryBatch(worker.db), applyVerifiedPayment(webhook.db, orderId, `late-${randomUUID()}`)]);
    const state = await lifecycleState(c, orderId);
    assert.equal(state.order.status, "EXPIRED"); assert.equal(state.order.stockState, "RELEASED");
    assert.equal(state.payment.status, "PAID"); assert.equal(state.payment.resolutionStatus, "REFUND_REQUIRED");
    assert.equal(state.stock.version, 2);
    await assertInventoryInvariant(c);
  } finally { await worker.client.end({ timeout: 1 }); await webhook.client.end({ timeout: 1 }); }
}));

test("scheduler 7 races customer cancellation on independent connections", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const worker = createDb(testUrl!), buyer = createDb(testUrl!);
  try {
    const [scheduled, cancelled] = await Promise.allSettled([runDueOrderExpiryBatch(worker.db), cancelUnpaidOrder(buyer.db, orderId, c.customers[0])]);
    assert.equal(scheduled.status, "fulfilled");
    if (cancelled.status === "rejected") assert.match(String(cancelled.reason), /UNPAID_CANCELLATION_UNAVAILABLE/);
    const state = await lifecycleState(c, orderId);
    assert.ok(["CANCELLED", "EXPIRED"].includes(state.order.status));
    assert.equal(state.order.stockState, "RELEASED"); assert.equal(state.stock.version, 2);
    await assertInventoryInvariant(c);
  } finally { await worker.client.end({ timeout: 1 }); await buyer.client.end({ timeout: 1 }); }
}));

test("scheduler 8 customer detail request recovers due expiry through the same service", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const [response] = await getCustomerOrders(c.db, c.customers[0], orderId);
  assert.equal(response.status, "EXPIRED"); assert.equal(response.paymentStatus, "EXPIRED");
  assert.equal((await lifecycleState(c, orderId)).stock.version, 2);
  await assertInventoryInvariant(c);
}));

test("scheduler 9 request recovery racing cron expires only once", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const worker = createDb(testUrl!), reader = createDb(testUrl!);
  try {
    const [batch, [detail]] = await Promise.all([runDueOrderExpiryBatch(worker.db), getCustomerOrders(reader.db, c.customers[0], orderId)]);
    assert.equal(detail.status, "EXPIRED"); assert.ok(batch.expired <= 1);
    const state = await lifecycleState(c, orderId);
    assert.equal(state.order.status, "EXPIRED"); assert.equal(state.stock.version, 2);
    await assertInventoryInvariant(c);
  } finally { await worker.client.end({ timeout: 1 }); await reader.client.end({ timeout: 1 }); }
}));

test("scheduler 10 processes multiple due orders within the batch bound", { skip: !testUrl }, async () => fixture(async (c) => {
  const first = await checkoutCart(c.db, c.customers[0], await intent(c));
  const second = await checkoutCart(c.db, c.customers[1], await intent(c, 1));
  await makeDue(c, first.orderId); await makeDue(c, second.orderId);
  assert.deepEqual(await runDueOrderExpiryBatch(c.db, { batchSize: 2 }), { attempted: 2, expired: 2, failed: 0 });
  assert.equal((await lifecycleState(c, first.orderId)).order.status, "EXPIRED");
  assert.equal((await lifecycleState(c, second.orderId)).order.status, "EXPIRED");
  await assertInventoryInvariant(c);
}));

test("scheduler 11 one failing order does not prevent another due order", { skip: !testUrl }, async () => fixture(async (c) => {
  const otherProduct = await addProduct(c);
  const [secondCart] = await c.db.select({ id: carts.id }).from(carts).where(eq(carts.customerId, c.customers[1]));
  await c.db.update(cartItems).set({ productId: otherProduct }).where(eq(cartItems.cartId, secondCart.id));
  const first = await checkoutCart(c.db, c.customers[0], await intent(c));
  const second = await checkoutCart(c.db, c.customers[1], await intent(c, 1));
  await makeDue(c, first.orderId, "-2 minutes"); await makeDue(c, second.orderId);
  const [stock] = await c.db.select({ id: inventories.id }).from(inventories).where(eq(inventories.productId, c.productId));
  const name = `expiry_failure_${randomUUID().replaceAll("-", "")}`;
  await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin if new.id = '${stock.id}' then raise exception using errcode = 'P0001'; end if; return new; end $$`));
  await c.db.execute(sql.raw(`create trigger ${name}_trg before update on inventories for each row execute function ${name}_fn()`));
  const failures: string[] = [];
  try {
    const result = await runDueOrderExpiryBatch(c.db, { batchSize: 2, onFailure: (orderId) => { failures.push(orderId ?? ""); } });
    assert.deepEqual(result, { attempted: 2, expired: 1, failed: 1 });
    assert.deepEqual(failures, [first.orderId]);
    assert.equal((await lifecycleState(c, first.orderId)).order.status, "CREATED");
    assert.equal((await lifecycleState(c, second.orderId)).order.status, "EXPIRED");
    await assertInventoryInvariant(c);
  } finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_trg on inventories`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
  }
  assert.equal((await runDueOrderExpiryBatch(c.db)).expired, 1);
  await assertInventoryInvariant(c);
}));

test("scheduler 12 expiry performs no external provider call", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = (async () => { externalCalls++; throw new Error("Unexpected external call"); }) as typeof fetch;
  try { assert.equal((await runDueOrderExpiryBatch(c.db)).expired, 1); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(externalCalls, 0);
  await assertInventoryInvariant(c);
}));

test("scheduler 13 PostgreSQL time governs future and exact-deadline expiry", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  assert.equal((await runDueOrderExpiryBatch(c.db)).attempted, 0);
  await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
  assert.equal((await runDueOrderExpiryBatch(c.db)).expired, 1);
  assert.equal((await lifecycleState(c, orderId)).order.status, "EXPIRED");
  await assertInventoryInvariant(c);
}));

test("scheduler 14 already released order returns recorded state without moving stock", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  await runDueOrderExpiryBatch(c.db);
  const before = await lifecycleState(c, orderId);
  assert.deepEqual(await recoverDueUnpaidOrder(c.db, orderId), { status: "EXPIRED", stockState: "RELEASED" });
  assert.deepEqual(await runDueOrderExpiryBatch(c.db), { attempted: 0, expired: 0, failed: 0 });
  const after = await lifecycleState(c, orderId);
  assert.equal(after.stock.version, before.stock.version);
  assert.equal(after.order.expiredAt?.getTime(), before.order.expiredAt?.getTime());
  await assertInventoryInvariant(c);
}));

test("scheduler 15 rollback after release leaves no partial order, payment, or stock change", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const rollback = new Error("ROLLBACK_EXPIRY");
  await assert.rejects(c.db.transaction(async (tx) => { await expireUnpaidOrderInTransaction(tx, orderId); throw rollback; }), (error: unknown) => error === rollback);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "CREATED"); assert.equal(state.payment.status, "PENDING");
  assert.equal(state.stock.reservedQuantity, 1); assert.equal(state.stock.availableQuantity, 1); assert.equal(state.stock.version, 1);
  await assertInventoryInvariant(c);
}));

test("scheduler and definitive failure on independent connections release once", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const worker = createDb(testUrl!), failure = createDb(testUrl!);
  try {
    const [scheduled, failed] = await Promise.allSettled([runDueOrderExpiryBatch(worker.db), recordDefinitivePaymentFailure(failure.db, orderId)]);
    assert.equal(scheduled.status, "fulfilled");
    if (failed.status === "rejected") assert.match(String(failed.reason), /DEFINITIVE_FAILURE_UNAVAILABLE/);
    const state = await lifecycleState(c, orderId);
    assert.ok(["CANCELLED", "EXPIRED"].includes(state.order.status));
    assert.equal(state.order.stockState, "RELEASED"); assert.equal(state.stock.version, 2);
    await assertInventoryInvariant(c);
  } finally { await worker.client.end({ timeout: 1 }); await failure.client.end({ timeout: 1 }); }
}));

test("Worker scheduled handler expires a due order using the isolated database binding", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  await worker.scheduled(undefined, { HYPERDRIVE: { connectionString: testUrl! } } as never);
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "EXPIRED"); assert.equal(state.payment.status, "EXPIRED");
  assert.equal(state.stock.version, 2);
  await assertInventoryInvariant(c);
}));

async function lateRefundFixture(c: Awaited<ReturnType<typeof createFixture>>) {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  await expireUnpaidOrder(c.db, orderId);
  const reference = `refund-late-${randomUUID()}`;
  await applyVerifiedPayment(c.db, orderId, reference);
  return { orderId, reference };
}

async function refundShippingFixture(c: Awaited<ReturnType<typeof createFixture>>) {
  const address = { contactName: "Fixture", phone: "9999999999", line1: "Fixture Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" };
  const key = `refund-${c.adminId}`;
  await c.db.insert(shippingProviderConfigs).values({ providerKey: key, displayName: "Isolated fixture", enabled: true });
  const [origin] = await c.db.insert(adminAddresses).values({ ...address, adminId: c.adminId, addressType: "SHIPPING_ORIGIN", isActive: true }).returning();
  await c.db.insert(adminAddresses).values({ ...address, adminId: c.adminId, addressType: "RETURN", isActive: true });
  await c.db.insert(shippingProviderLocations).values({ adminId: c.adminId, adminAddressId: origin.id, providerKey: key, providerLocationRef: "fixture", locationName: "Fixture" });
  return { address, key };
}

async function deliveredReturnFixture(c: Awaited<ReturnType<typeof createFixture>>, qc = true, approve = true) {
  await c.db.update(categories).set({ slug: "dress" }).where(eq(categories.id, c.categoryId));
  await c.db.update(products).set({ returnEnabled: true }).where(eq(products.id, c.productId));
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `return-paid-${randomUUID()}`);
  await c.db.update(orders).set({ status: "DELIVERED", deliveredAt: sql`clock_timestamp() - interval '1 hour'` }).where(eq(orders.id, orderId));
  const [item] = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const { address, key } = await refundShippingFixture(c);
  const [shipment] = await c.db.insert(shipments).values({ orderId, adminId: c.adminId, providerKey: key, status: "DELIVERED", deliveredAt: sql`clock_timestamp() - interval '1 hour'`, originAddressSnapshot: address, destinationAddressSnapshot: address }).returning();
  await c.db.insert(shipmentItems).values({ shipmentId: shipment.id, orderItemId: item.id, orderId, adminId: c.adminId });
  const record = await requestReturn(c.db, c.customers[0], item.id, 1, "Return fixture", null, 5);
  if (approve) await decideReturn(c.db, record.id, c.adminId, true, "Approved");
  if (qc) {
    await markReturnReceived(c.db, record.id, c.adminId);
    await inspectReturn(c.db, record.id, c.adminId, "APPROVED", "GOOD", "GOOD", "QC passed");
  }
  return { orderId, item, returnId: record.id };
}

for (const [name, check] of [
  ["1 expired late payment requires refund", (s: Awaited<ReturnType<typeof lifecycleState>>) => { assert.equal(s.payment.status, "PAID"); assert.equal(s.payment.resolutionStatus, "REFUND_REQUIRED"); }],
  ["2 late payment cannot confirm", (s: Awaited<ReturnType<typeof lifecycleState>>) => { assert.equal(s.order.status, "EXPIRED"); assert.equal(s.order.placedAt, null); }],
  ["3 late payment cannot consume released stock", (s: Awaited<ReturnType<typeof lifecycleState>>) => { assert.equal(s.order.stockState, "RELEASED"); assert.equal(s.stock.availableQuantity, 2); assert.equal(s.stock.reservedQuantity, 0); }],
] as const) test(`refund ${name}`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  check(await lifecycleState(c, orderId));
  await assertInventoryInvariant(c);
}));

test("refund 4 late paid order cannot create shipment", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  const { key } = await refundShippingFixture(c);
  let calls = 0;
  const provider = { key, getServiceability: async () => { calls++; throw new Error("Provider must not be called"); } } as never;
  await assert.rejects(createForwardShipment(c.db, provider, orderId, c.adminId, { weightKg: 1, lengthCm: 10, breadthCm: 10, heightCm: 10 }), /FULFILLMENT_ORDER_INELIGIBLE/);
  assert.equal(calls, 0);
  assert.equal((await c.db.select().from(shipments).where(eq(shipments.orderId, orderId))).length, 0);
}));

test("refund 5 late paid order cannot create settlement", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  const [item] = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /SETTLEMENT_ORDER_INELIGIBLE/);
  await markRefundResolved(c.db, orderId);
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /SETTLEMENT_ORDER_INELIGIBLE/);
}));

test("refund 6 duplicate late payment preserves one obligation", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, reference } = await lateRefundFixture(c);
  await applyVerifiedPayment(c.db, orderId, reference);
  assert.equal((await listUnresolvedRefundObligations(c.db)).filter((row) => row.orderId === orderId).length, 1);
  assert.equal((await lifecycleState(c, orderId)).stock.version, 2);
}));

test("refund 7 resolution atomically records the full internal obligation without provider success", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  assert.equal((await markRefundResolved(c.db, orderId)).outcome, "RESOLVED");
  const [record] = await c.db.select().from(refunds).where(eq(refunds.orderId, orderId));
  assert.equal(record.amount, "500.00"); assert.equal(record.status, "INTERNAL_RECORDED");
  assert.equal(record.returnId, null); assert.equal(record.providerReference, null);
  assert.equal((await lifecycleState(c, orderId)).payment.status, "PAID");
}));

test("refund 8 duplicate resolution preserves the same record and timestamp", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  await markRefundResolved(c.db, orderId);
  const [before] = await c.db.select().from(refunds).where(eq(refunds.orderId, orderId));
  await markRefundResolved(c.db, orderId);
  const after = await c.db.select().from(refunds).where(eq(refunds.orderId, orderId));
  assert.equal(after.length, 1); assert.equal(after[0].id, before.id); assert.equal(after[0].updatedAt.getTime(), before.updatedAt.getTime());
}));

test("refund 9 authorization uses historical purchase price after catalog changes", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item, returnId } = await deliveredReturnFixture(c);
  await c.db.update(products).set({ price: "999.00" }).where(eq(products.id, c.productId));
  assert.equal((await authorizeRefund(c.db, returnId)).amount, "500.00");
  const [unchanged] = await c.db.select().from(orderItems).where(eq(orderItems.id, item.id));
  assert.equal(unchanged.unitPrice, item.unitPrice); assert.equal(unchanged.totalAmount, item.totalAmount);
}));

test("refund 10 customer-paid return courier is not deducted again", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  const refund = await authorizeRefund(c.db, returnId);
  const [record] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  assert.equal(record.deductionAmount, "0.00"); assert.deepEqual(record.deductionBreakdown, {});
  assert.equal(record.grossRefundAmount, record.netRefundAmount); assert.equal(refund.amount, record.netRefundAmount);
}));

test("refund 11 return, order, payment and finance associations agree", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId, item } = await deliveredReturnFixture(c);
  const refund = await authorizeRefund(c.db, returnId);
  const { payment } = await lifecycleState(c, orderId);
  assert.equal(refund.orderId, orderId); assert.equal(refund.paymentId, payment.id); assert.equal(refund.returnId, returnId);
  const finance = await getAdminFinance(c.db, c.adminId);
  assert.deepEqual(finance.refundObligations.map((row) => [row.refundId, row.orderItemId, row.amount]), [[refund.id, item.id, refund.amount]]);
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /RETURN_REFUND_UNRESOLVED/);
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, refund.amount), /RETURN_REFUND_UNRESOLVED/);
  assert.equal((await c.db.select().from(adminSettlements).where(eq(adminSettlements.orderItemId, item.id))).length, 0);
  const other = await checkoutCart(c.db, c.customers[1], await intent(c, 1));
  await assert.rejects(c.db.update(refunds).set({ orderId: other.orderId }).where(eq(refunds.id, refund.id)), (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23503");
}));

test("refund 12 repeated authorization returns one refund effect", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c);
  const first = await authorizeRefund(c.db, returnId), second = await authorizeRefund(c.db, returnId);
  assert.equal(first.id, second.id);
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  assert.equal((await lifecycleState(c, orderId)).stock.version, 2);
}));

test("refund 13 resolving a released order never restores stock", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, reference } = await lateRefundFixture(c);
  const before = await lifecycleState(c, orderId);
  await markRefundResolved(c.db, orderId);
  await applyVerifiedPayment(c.db, orderId, reference);
  const after = await lifecycleState(c, orderId);
  assert.deepEqual(after.stock, before.stock); assert.equal(after.order.status, "EXPIRED"); assert.equal(after.order.stockState, "RELEASED");
  await assertInventoryInvariant(c);
}));

test("refund 14 rollback leaves neither internal record nor partial resolution", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  const rollback = new Error("ROLLBACK_REFUND");
  await assert.rejects(c.db.transaction(async (tx) => { await markRefundResolved(tx as never, orderId); throw rollback; }), (error: unknown) => error === rollback);
  assert.equal((await lifecycleState(c, orderId)).payment.resolutionStatus, "REFUND_REQUIRED");
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 0);
  await assertInventoryInvariant(c);
}));

test("refund 15 independent concurrent reconciliation requests produce one record", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  const first = createDb(testUrl!), second = createDb(testUrl!);
  try {
    await Promise.all([markRefundResolved(first.db, orderId), markRefundResolved(second.db, orderId)]);
    assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  } finally { await first.client.end({ timeout: 1 }); await second.client.end({ timeout: 1 }); }
  await assertInventoryInvariant(c);
}));

test("refund 16 unresolved obligations are enumerable and resolved records remain auditable", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await lateRefundFixture(c);
  assert.equal((await listUnresolvedRefundObligations(c.db)).filter((row) => row.orderId === orderId).length, 1);
  await markRefundResolved(c.db, orderId);
  assert.equal((await listUnresolvedRefundObligations(c.db)).filter((row) => row.orderId === orderId).length, 0);
  const [violations] = await c.db.execute<{ count: string }>(sql`select count(*)::text as count from payments p where p.order_id = ${orderId} and p.resolution_status = 'RESOLVED' and not exists (select 1 from refunds r where r.payment_id = p.id and r.order_id = p.order_id and r.reason = 'LATE_PAYMENT' and r.status = 'INTERNAL_RECORDED' and r.amount = p.amount and r.currency = p.currency)`);
  assert.equal(violations.count, "0");
}));

test("refund 17 delivered return requires receipt and QC before concurrent authorization", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c, false);
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 0);
  await assert.rejects(authorizeRefund(c.db, returnId), /Receipt and approved QC/);
  await markReturnReceived(c.db, returnId, c.adminId);
  await assert.rejects(authorizeRefund(c.db, returnId), /Receipt and approved QC/);
  await inspectReturn(c.db, returnId, c.adminId, "APPROVED", "GOOD", null, "Approved QC");
  const first = createDb(testUrl!), second = createDb(testUrl!);
  try {
    const [a, b] = await Promise.all([authorizeRefund(first.db, returnId), authorizeRefund(second.db, returnId)]);
    assert.equal(a.id, b.id); assert.equal(a.status, "PENDING_PROVIDER"); assert.equal(a.providerReference, null);
    assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  } finally { await first.client.end({ timeout: 1 }); await second.client.end({ timeout: 1 }); }
  const state = await lifecycleState(c, orderId);
  assert.equal(state.order.status, "DELIVERED"); assert.equal(state.order.stockState, "CONSUMED"); assert.equal(state.stock.version, 2);
  await assertInventoryInvariant(c);
}));

async function onIndependentConnections<T>(run: (first: ReturnType<typeof createDb>["db"], second: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const first = createDb(testUrl!), second = createDb(testUrl!);
  try { return await run(first.db, second.db); }
  finally { await first.client.end({ timeout: 1 }); await second.client.end({ timeout: 1 }); }
}

// Finance tests use real independent sessions and observe PostgreSQL lock waits.
// No sleeps, production hooks or copied eligibility implementation.
function financeLatch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixtureRefundPayload(c: Awaited<ReturnType<typeof createFixture>>, returnId: string,
  status: "SUCCESS" | "PENDING" | "CANCELLED" | "REJECTED" = "SUCCESS", reference = "fixture-refund") {
  const [record] = await c.db.select().from(refunds).where(eq(refunds.returnId, returnId));
  const [payment] = await c.db.select().from(payments).where(eq(payments.id, record.paymentId));
  return { refund_status: status, cf_refund_id: reference, refund_id: record.id, order_id: payment.providerOrderId,
    refund_amount: Number(record.amount), refund_currency: record.currency, cf_payment_id: payment.providerPaymentId };
}

function paymentSessionProvider(onCall?: (input: { orderId: string; amount: string; currency: string }) => Promise<void>) {
  let calls = 0;
  const provider = { createOrder: async (input: { orderId: string; amount: string; currency: string }) => {
    calls++;
    await onCall?.(input);
    return { providerOrderId: input.orderId, providerReference: "fixture-order", paymentSessionId: "fixture-session" };
  } } as never;
  return { provider, get calls() { return calls; } };
}

const sessionFor = (db: ReturnType<typeof createDb>["db"], provider: never, orderId: string, customerId: string) =>
  createPaymentSession(db, provider, orderId, customerId, "https://example.invalid/return", "https://example.invalid/webhook");

test("payment session accepts only a live CREATED reserved pending order", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const stub = paymentSessionProvider();
  assert.deepEqual(await sessionFor(c.db, stub.provider, orderId, c.customers[0]), { orderId, paymentSessionId: "fixture-session" });
  assert.equal(stub.calls, 1);
  const [payment] = await c.db.select().from(payments).where(eq(payments.orderId, orderId));
  assert.equal(payment.providerOrderId, orderId); assert.equal(payment.status, "PENDING");
  await assertInventoryInvariant(c);
}));

for (const caseName of ["EXPIRED", "CANCELLED", "RELEASED", "CONSUMED", "PAID", "DEADLINE", "EXACT_DEADLINE", "FAILED_PAYMENT", "REFUND_REQUIRED", "WRONG_PROVIDER_REFERENCE", "MISMATCHED_AMOUNT", "MISMATCHED_CURRENCY"] as const)
  test(`payment session rejects ${caseName} before calling provider`, { skip: !testUrl }, async () => fixture(async (c) => {
    const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
    if (caseName === "EXPIRED") { await makeDue(c, orderId); await expireUnpaidOrder(c.db, orderId); }
    else if (caseName === "CANCELLED") await cancelUnpaidOrder(c.db, orderId, c.customers[0]);
    else if (caseName === "RELEASED" || caseName === "CONSUMED") await c.db.update(orders).set({ stockState: caseName }).where(eq(orders.id, orderId));
    else if (caseName === "PAID") await applyVerifiedPayment(c.db, orderId, `session-paid-${randomUUID()}`);
    else if (caseName === "DEADLINE") await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(orders.id, orderId));
    else if (caseName === "EXACT_DEADLINE") await c.db.update(orders).set({ paymentExpiresAt: sql`clock_timestamp()` }).where(eq(orders.id, orderId));
    else if (caseName === "FAILED_PAYMENT") await c.db.update(payments).set({ status: "FAILED" }).where(eq(payments.orderId, orderId));
    else if (caseName === "REFUND_REQUIRED") await c.db.update(payments).set({ resolutionStatus: "REFUND_REQUIRED" }).where(eq(payments.orderId, orderId));
    else if (caseName === "WRONG_PROVIDER_REFERENCE") await c.db.update(payments).set({ providerOrderId: randomUUID() }).where(eq(payments.orderId, orderId));
    else if (caseName === "MISMATCHED_AMOUNT") await c.db.update(payments).set({ amount: "1.00" }).where(eq(payments.orderId, orderId));
    else await c.db.update(payments).set({ currency: "USD" }).where(eq(payments.orderId, orderId));
    const stub = paymentSessionProvider();
    await assert.rejects(sessionFor(c.db, stub.provider, orderId, c.customers[0]), /PAYMENT_SESSION_INELIGIBLE/);
    assert.equal(stub.calls, 0);
    const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
    assert.equal(order.status, caseName === "EXPIRED" ? "EXPIRED" : caseName === "CANCELLED" ? "CANCELLED" : caseName === "PAID" ? "CONFIRMED" : "CREATED");
    const [stock] = await c.db.select().from(inventories).where(eq(inventories.productId, c.productId));
    assert.ok(stock.availableQuantity >= 0 && stock.reservedQuantity >= 0);
    if (!["RELEASED", "CONSUMED", "FAILED_PAYMENT", "REFUND_REQUIRED"].includes(caseName)) await assertInventoryInvariant(c);
  }));

test("payment session denies another customer's order before provider call", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const stub = paymentSessionProvider();
  await assert.rejects(sessionFor(c.db, stub.provider, orderId, c.customers[1]), /Order unavailable/);
  assert.equal(stub.calls, 0);
  await assertInventoryInvariant(c);
}));

test("payment session waits for expiry's order lock and rejects without provider call", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await makeDue(c, orderId);
  const stub = paymentSessionProvider();
  const outcomes = await financeRace(c.db, (db) => expireUnpaidOrder(db, orderId),
    (db) => sessionFor(db, stub.provider, orderId, c.customers[0]));
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  assert.equal(stub.calls, 0);
  await assertInventoryInvariant(c);
}));

test("payment session holds order lock while provider responds; cancellation follows safely", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const stub = paymentSessionProvider();
  const outcomes = await financeRace(c.db, (db) => sessionFor(db, stub.provider, orderId, c.customers[0]),
    (db) => cancelUnpaidOrder(db, orderId, c.customers[0]));
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "fulfilled");
  assert.equal(stub.calls, 1);
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(order.status, "CANCELLED"); assert.equal(order.stockState, "RELEASED");
  await assertInventoryInvariant(c);
}));

test("payment session rejects provider order identity mismatch without changing local reference", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const provider = { createOrder: async () => ({ providerOrderId: randomUUID(), providerReference: null, paymentSessionId: "wrong" }) } as never;
  await assert.rejects(sessionFor(c.db, provider, orderId, c.customers[0]), /Payment provider order mismatch/);
  const [payment] = await c.db.select().from(payments).where(eq(payments.orderId, orderId));
  assert.equal(payment.providerOrderId, orderId); assert.equal(payment.status, "PENDING");
  await assertInventoryInvariant(c);
}));

test("payment session refuses a zero-row conditional update", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const [payment] = await c.db.select().from(payments).where(eq(payments.orderId, orderId));
  const name = `session_zero_${randomUUID().replaceAll("-", "")}`;
  await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin if new.id = '${payment.id}' then return null; end if; return new; end $$`));
  await c.db.execute(sql.raw(`create trigger ${name}_tr before update on payments for each row execute function ${name}_fn()`));
  const stub = paymentSessionProvider();
  try { await assert.rejects(sessionFor(c.db, stub.provider, orderId, c.customers[0]), /PAYMENT_SESSION_STATE_CHANGED/); }
  finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_tr on payments`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
  }
  assert.equal(stub.calls, 1);
  const [unchanged] = await c.db.select().from(payments).where(eq(payments.id, payment.id));
  assert.equal(unchanged.status, "PENDING"); assert.equal(unchanged.providerOrderId, orderId);
  await assertInventoryInvariant(c);
}));

function refundResponse(c: Awaited<ReturnType<typeof createFixture>>, returnId: string, status: "SUCCESS" | "PENDING" = "SUCCESS") {
  return new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () =>
    Response.json(await fixtureRefundPayload(c, returnId, status)));
}

test("refund SUCCESS stays terminal and duplicate submission has no second provider effect", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c);
  const refund = await authorizeRefund(c.db, returnId);
  let calls = 0;
  const provider = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () => {
    calls++; return Response.json(await fixtureRefundPayload(c, returnId));
  });
  const first = await submitRefund(c.db, returnId, provider);
  const second = await submitRefund(c.db, returnId, provider);
  assert.equal(first.status, "SUCCESS"); assert.equal(second.status, "SUCCESS");
  assert.equal(first.updatedAt.getTime(), second.updatedAt.getTime()); assert.equal(calls, 1);
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  assert.equal(first.id, refund.id);
  await assertInventoryInvariant(c);
}));

test("refund concurrent SUCCESS submissions leave one terminal outcome", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c);
  await authorizeRefund(c.db, returnId);
  await onIndependentConnections(async (a, b) => {
    const [first, second] = await Promise.all([
      submitRefund(a, returnId, refundResponse(c, returnId)),
      submitRefund(b, returnId, refundResponse(c, returnId)),
    ]);
    assert.equal(first.status, "SUCCESS"); assert.equal(second.status, "SUCCESS");
  });
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  await assertInventoryInvariant(c);
}));

test("refund delayed PROCESSING cannot overwrite a terminal FAILED result", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  await authorizeRefund(c.db, returnId);
  const entered = financeLatch(), release = financeLatch();
  const delayed = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () => {
    entered.resolve(); await release.promise;
    return Response.json(await fixtureRefundPayload(c, returnId, "PENDING"));
  });
  await onIndependentConnections(async (a, b) => {
    const pending = submitRefund(a, returnId, delayed);
    try {
      await entered.promise;
      const failed = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () =>
        Response.json(await fixtureRefundPayload(c, returnId, "REJECTED")));
      assert.equal((await submitRefund(b, returnId, failed)).status, "FAILED");
    } finally { release.resolve(); }
    assert.equal((await pending).status, "FAILED");
  });
  const [saved] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  assert.equal(saved.status, "RETURN_ISSUE");
  await assertInventoryInvariant(c);
}));

test("refund FAILED followed by delayed SUCCESS requires manual review", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  await authorizeRefund(c.db, returnId);
  const entered = financeLatch(), release = financeLatch();
  const delayedSuccess = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () => {
    entered.resolve(); await release.promise;
    return Response.json(await fixtureRefundPayload(c, returnId));
  });
  await onIndependentConnections(async (a, b) => {
    const success = submitRefund(a, returnId, delayedSuccess);
    success.catch(() => undefined);
    try {
      await entered.promise;
      const failed = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () =>
        Response.json(await fixtureRefundPayload(c, returnId, "CANCELLED")));
      assert.equal((await submitRefund(b, returnId, failed)).status, "FAILED");
    } finally { release.resolve(); }
    await assert.rejects(success, /Failed refund needs manual review/);
  });
  const [saved] = await c.db.select().from(refunds).where(eq(refunds.returnId, returnId));
  assert.equal(saved.status, "FAILED");
  await assertInventoryInvariant(c);
}));

test("refund repeated PROCESSING lookup is idempotent and uses GET after POST", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  await authorizeRefund(c.db, returnId);
  const methods: string[] = [];
  const provider = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async (_input, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json(await fixtureRefundPayload(c, returnId, "PENDING"));
  });
  const first = await submitRefund(c.db, returnId, provider);
  const second = await submitRefund(c.db, returnId, provider);
  assert.equal(first.status, "PROCESSING"); assert.equal(second.status, "PROCESSING");
  assert.equal(first.updatedAt.getTime(), second.updatedAt.getTime());
  assert.deepEqual(methods, ["POST", "GET"]);
  await assertInventoryInvariant(c);
}));

test("refund provider call holds no refund or return row lock", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  const authorized = await authorizeRefund(c.db, returnId);
  const entered = financeLatch(), release = financeLatch();
  const waitingProvider = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () => {
    entered.resolve(); await release.promise;
    return Response.json(await fixtureRefundPayload(c, returnId));
  });
  await onIndependentConnections(async (a, b) => {
    const submitting = submitRefund(a, returnId, waitingProvider);
    try {
      await entered.promise;
      await b.transaction(async (tx) => {
        await tx.select().from(returns).where(eq(returns.id, returnId)).for("update", { noWait: true });
        await tx.select().from(refunds).where(eq(refunds.id, authorized.id)).for("update", { noWait: true });
      });
    } finally { release.resolve(); }
    assert.equal((await submitting).status, "SUCCESS");
  });
  await assertInventoryInvariant(c);
}));

test("refund conflicting provider reference is held for review", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  const authorized = await authorizeRefund(c.db, returnId);
  assert.equal((await submitRefund(c.db, returnId, refundResponse(c, returnId, "PENDING"))).status, "PROCESSING");
  const mismatch = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () =>
    Response.json(await fixtureRefundPayload(c, returnId, "SUCCESS", "different-provider-refund")));
  await assert.rejects(submitRefund(c.db, returnId, mismatch), /Refund provider reference conflict/);
  const [saved] = await c.db.select().from(refunds).where(eq(refunds.id, authorized.id));
  assert.equal(saved.status, "PROCESSING"); assert.equal(saved.providerReference, "fixture-refund");
  await assertInventoryInvariant(c);
}));

for (const [name, override] of [
  ["merchant refund identity", { refund_id: randomUUID() }],
  ["provider order", { order_id: randomUUID() }],
  ["amount", { refund_amount: 0.01 }],
  ["currency", { refund_currency: "USD" }],
  ["provider payment identity", { cf_payment_id: "unrelated-payment" }],
  ["missing response identity", { refund_id: undefined }],
] as const) test(`refund rejects ${name} mismatch and retains reconciliation state`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c);
  const original = await authorizeRefund(c.db, returnId);
  const provider = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () =>
    Response.json({ ...await fixtureRefundPayload(c, returnId), ...override }));
  await assert.rejects(submitRefund(c.db, returnId, provider));
  const [saved] = await c.db.select().from(refunds).where(eq(refunds.id, original.id));
  const [record] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  assert.equal(saved.status, "PROCESSING"); assert.equal(saved.returnId, returnId); assert.equal(saved.orderId, orderId);
  assert.equal(saved.providerReference, null); assert.equal(record.status, "REFUND_PROCESSING");
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  assert.equal((await submitRefund(c.db, returnId, refundResponse(c, returnId))).status, "SUCCESS");
  await assertInventoryInvariant(c);
}));

test("refund timeout remains unknown and later GET can finalize", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c);
  const authorized = await authorizeRefund(c.db, returnId);
  const timeout = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () => { throw new Error("PROVIDER_TIMEOUT"); });
  await assert.rejects(submitRefund(c.db, returnId, timeout), /PROVIDER_TIMEOUT/);
  const [unknown] = await c.db.select().from(refunds).where(eq(refunds.id, authorized.id));
  assert.equal(unknown.status, "PROCESSING"); assert.equal(unknown.providerReference, null);
  let lookup = "";
  const provider = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async (input, init) => {
    lookup = `${init?.method} ${String(input)}`;
    return Response.json(await fixtureRefundPayload(c, returnId));
  });
  const result = await submitRefund(c.db, returnId, provider);
  assert.equal(result.status, "SUCCESS"); assert.match(lookup, new RegExp(`/orders/${orderId}/refunds/${authorized.id}$`));
  await assertInventoryInvariant(c);
}));

test("refund finalization rollback preserves pending state and retries by merchant refund ID", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId } = await deliveredReturnFixture(c);
  const authorized = await authorizeRefund(c.db, returnId);
  const name = `refund_rollback_${randomUUID().replaceAll("-", "")}`;
  await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin if new.id = '${authorized.id}' and new.status = 'SUCCESS' then raise exception using errcode = 'P0001'; end if; return new; end $$`));
  await c.db.execute(sql.raw(`create trigger ${name}_tr before update on refunds for each row execute function ${name}_fn()`));
  try { await assert.rejects(submitRefund(c.db, returnId, refundResponse(c, returnId))); }
  finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_tr on refunds`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
  }
  const [pending] = await c.db.select().from(refunds).where(eq(refunds.id, authorized.id));
  const [record] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  assert.equal(pending.status, "PENDING_PROVIDER"); assert.equal(record.status, "QC_APPROVED");
  assert.equal((await submitRefund(c.db, returnId, refundResponse(c, returnId))).status, "SUCCESS");
  await assertInventoryInvariant(c);
}));

async function partialRefundFinanceFixture(c: Awaited<ReturnType<typeof createFixture>>) {
  const [cart] = await c.db.select().from(carts).where(eq(carts.customerId, c.customers[0]));
  await c.db.update(cartItems).set({ quantity: 2 }).where(eq(cartItems.cartId, cart.id));
  const sale = await deliveredReturnFixture(c);
  const refund = await authorizeRefund(c.db, sale.returnId);
  assert.equal(refund.amount, "500.00"); assert.equal(sale.item.totalAmount, "1000.00");
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, sale.orderId));
  return { ...sale, refund };
}

test("finance successful refund adjustment is applied once from historical purchase", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item, returnId } = await partialRefundFinanceFixture(c);
  await c.db.update(products).set({ price: "9000.00" }).where(eq(products.id, item.productId));
  await submitRefund(c.db, returnId, refundResponse(c, returnId));
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /REFUND_ADJUSTMENT_REQUIRED/);
  const settlement = await createSettlement(c.db, item.id, 0, 0, "500.00");
  assert.equal(settlement.netPayable, "500.00"); assert.equal(settlement.refundAdjustmentAmount, "500.00");
  assert.equal((await requestPayout(c.db, c.adminId)).amount, "500.00");
  await assert.rejects(requestPayout(c.db, c.adminId), /No payable balance/);
  await financeInvariants(c);
}));

for (const refundFirst of [true, false]) test(`finance concurrent refund/payout ${refundFirst ? "refund" : "payout"} commits first`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { item, orderId, returnId } = await partialRefundFinanceFixture(c);
  // Historical premature row: payout must revalidate, not trust AVAILABLE.
  await c.db.insert(adminSettlements).values({ adminId: c.adminId, orderId, orderItemId: item.id, grossAmount: "1000.00", commissionAmount: "0.00", gatewayFeeAmount: "0.00", refundAdjustmentAmount: "500.00", netPayable: "500.00" });
  const complete = (db: ReturnType<typeof createDb>["db"]) => submitRefund(db, returnId, refundResponse(c, returnId));
  const allocate = async (db: ReturnType<typeof createDb>["db"]) => {
    try { return await requestPayout(db, c.adminId); }
    catch (error) { assert.match(String(error), /No payable balance/); return null; }
  };
  if (refundFirst) {
    const result = await financeRace(c.db, complete, allocate);
    assert.equal(result[0].status, "fulfilled"); assert.equal(result[1].status, "fulfilled");
    assert.ok((result[1] as PromiseFulfilledResult<unknown>).value);
  } else {
    const result = await financeRace(c.db, allocate, complete);
    assert.equal(result[0].status, "fulfilled"); assert.equal((result[0] as PromiseFulfilledResult<unknown>).value, null);
    assert.equal(result[1].status, "fulfilled");
    assert.equal((await requestPayout(c.db, c.adminId)).amount, "500.00");
  }
  await financeInvariants(c);
}));

test("finance delayed refund result cannot reopen an allocated successful refund", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item, returnId } = await partialRefundFinanceFixture(c);
  const entered = financeLatch(), release = financeLatch();
  const provider = new CashfreeRefundAdapter("fixture", "fixture", "SANDBOX", async () => {
    entered.resolve(); await release.promise;
    return Response.json(await fixtureRefundPayload(c, returnId, "PENDING", "stale"));
  });
  await onIndependentConnections(async (a, b) => {
    const pending = submitRefund(a, returnId, provider);
    try {
      await entered.promise;
      await submitRefund(b, returnId, refundResponse(c, returnId));
      await createSettlement(b, item.id, 0, 0, "500.00");
      await requestPayout(b, c.adminId);
    } finally { release.resolve(); }
    assert.equal((await pending).status, "SUCCESS");
  });
  const [record] = await c.db.select().from(returns).where(eq(returns.id, returnId)); assert.equal(record.status, "REFUNDED");
  await financeInvariants(c);
}));

test("finance exact selected IDs exclude settlement committed during payout allocation", { skip: !testUrl }, async () => fixture(async (c) => {
  const first = await financeSale(c), later = await financeSale(c, 1);
  const selected = await createSettlement(c.db, first.item.id, 0, 0, "0.00");
  const name = `finance_gate_${randomUUID().replaceAll("-", "")}`;
  const key = Math.floor(Math.random() * 1000000000);
  await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin if new.admin_id = '${c.adminId}' then perform pg_advisory_xact_lock(${key}); end if; return new; end $$`));
  await c.db.execute(sql.raw(`create trigger ${name}_tr before insert on payout_requests for each row execute function ${name}_fn()`));
  try {
    await onIndependentConnections(async (a, b) => {
      const ready = financeLatch(), release = financeLatch(), started = financeLatch(); let pid = 0;
      const blocker = a.transaction(async (tx) => { await tx.execute(sql`select pg_advisory_xact_lock(${key})`); ready.resolve(); await release.promise; });
      await ready.promise;
      const allocating = b.transaction(async (tx) => {
        const rows = await tx.execute(sql`select pg_backend_pid() as pid`); pid = Number(rows[0].pid); started.resolve();
        return requestPayout(tx as never, c.adminId);
      });
      allocating.catch(() => undefined);
      let inserted: Awaited<ReturnType<typeof createSettlement>> | undefined;
      try {
        await started.promise; await waitForFinanceLock(c.db, pid);
        inserted = await createSettlement(c.db, later.item.id, 0, 0, "0.00");
      } finally { release.resolve(); await blocker; }
      const payout = await allocating; assert.equal(payout.amount, "500.00");
      const links = await c.db.select().from(payoutSettlementItems).where(eq(payoutSettlementItems.payoutRequestId, payout.id));
      assert.deepEqual(links.map((row) => row.settlementId), [selected.id]);
      const [untouched] = await c.db.select().from(adminSettlements).where(eq(adminSettlements.id, inserted!.id));
      assert.equal(untouched.status, "AVAILABLE");
    });
  } finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_tr on payout_requests`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
  }
  await financeInvariants(c);
}));

test("finance allocation rollback leaves no payout links or pending settlements", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item } = await financeSale(c);
  const settlement = await createSettlement(c.db, item.id, 0, 0, "0.00");
  const name = `finance_rollback_${randomUUID().replaceAll("-", "")}`;
  await c.db.execute(sql.raw(`create function ${name}_fn() returns trigger language plpgsql as $$ begin if new.id = '${settlement.id}' and new.status = 'PAYOUT_PENDING' then raise exception using errcode = 'P0001'; end if; return new; end $$`));
  await c.db.execute(sql.raw(`create trigger ${name}_tr before update on admin_settlements for each row execute function ${name}_fn()`));
  try { await assert.rejects(requestPayout(c.db, c.adminId)); }
  finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${name}_tr on admin_settlements`));
    await c.db.execute(sql.raw(`drop function if exists ${name}_fn()`));
  }
  assert.equal((await c.db.select().from(payoutRequests).where(eq(payoutRequests.adminId, c.adminId))).length, 0);
  assert.equal((await c.db.select().from(payoutSettlementItems).where(eq(payoutSettlementItems.settlementId, settlement.id))).length, 0);
  const [unchanged] = await c.db.select().from(adminSettlements).where(eq(adminSettlements.id, settlement.id)); assert.equal(unchanged.status, "AVAILABLE");
  await financeInvariants(c);
}));

async function waitForFinanceLock(db: ReturnType<typeof createDb>["db"], pid: number) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const rows = await db.execute(sql`select cardinality(pg_blocking_pids(${pid}::int)) > 0 as blocked`);
    if (rows[0].blocked) return;
  }
  throw new Error("Expected independent finance transaction to wait on a PostgreSQL lock");
}

async function financeRace<T, U>(db: ReturnType<typeof createDb>["db"],
  firstWork: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
  secondWork: (db: ReturnType<typeof createDb>["db"]) => Promise<U>) {
  return onIndependentConnections(async (a, b) => {
    const ready = financeLatch(), release = financeLatch(), started = financeLatch();
    let pid = 0;
    const first = a.transaction(async (tx) => {
      const result = await firstWork(tx as never);
      ready.resolve();
      await release.promise;
      return result;
    });
    first.catch(() => ready.resolve());
    await ready.promise;
    const second = b.transaction(async (tx) => {
      const rows = await tx.execute(sql`select pg_backend_pid() as pid`);
      pid = Number(rows[0].pid); started.resolve();
      return secondWork(tx as never);
    });
    const outcomes = Promise.allSettled([first, second]);
    try { await started.promise; await waitForFinanceLock(db, pid); }
    finally { release.resolve(); }
    return outcomes;
  });
}

async function financeSale(c: Awaited<ReturnType<typeof createFixture>>, customer = 0) {
  const { orderId } = await checkoutCart(c.db, c.customers[customer], await intent(c, customer));
  await applyVerifiedPayment(c.db, orderId, `finance-${randomUUID()}`);
  await c.db.update(orders).set({ status: "DELIVERED", deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, orderId));
  const [item] = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { orderId, item };
}

async function financeInvariants(c: Awaited<ReturnType<typeof createFixture>>) {
  const rows = await c.db.select().from(adminSettlements).where(eq(adminSettlements.adminId, c.adminId));
  for (const row of rows) {
    const [item] = await c.db.select().from(orderItems).where(eq(orderItems.id, row.orderItemId));
    assert.equal(row.adminId, item.adminId); assert.equal(row.orderId, item.orderId);
    const links = await c.db.select().from(payoutSettlementItems).where(eq(payoutSettlementItems.settlementId, row.id));
    assert.ok(links.length <= 1);
    if (row.status === "PAYOUT_PENDING" || row.status === "PAID") assert.equal(links.length, 1);
    if (row.status === "AVAILABLE") {
      // Call the actual canonical rule, not a duplicate test implementation.
      await c.db.transaction((tx) => requireSettlementEligible(tx, row.orderItemId, row.refundAdjustmentAmount));
    }
  }
  const payouts = await c.db.select().from(payoutRequests).where(eq(payoutRequests.adminId, c.adminId));
  for (const payout of payouts.filter((row) => row.status !== "REJECTED")) {
    const allocated = await c.db.select({ amount: adminSettlements.netPayable, adminId: adminSettlements.adminId })
      .from(payoutSettlementItems).innerJoin(adminSettlements, eq(adminSettlements.id, payoutSettlementItems.settlementId))
      .where(eq(payoutSettlementItems.payoutRequestId, payout.id));
    assert.ok(allocated.every((row) => row.adminId === payout.adminId));
    assert.equal(Math.round(Number(payout.amount) * 100), allocated.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0));
  }
  await assertInventoryInvariant(c);
}

for (const [name, change, error] of [
  ["confirmed is not delivered", { status: "CONFIRMED", deliveredAt: null }, /SETTLEMENT_DELIVERY_REQUIRED/],
  ["missing delivery timestamp", { deliveredAt: null }, /SETTLEMENT_DELIVERY_REQUIRED/],
  ["five-day window remains open", { deliveredAt: sql`clock_timestamp() - interval '4 days'` }, /SETTLEMENT_RETURN_WINDOW_OPEN/],
  ["released stock", { stockState: "RELEASED" }, /SETTLEMENT_ORDER_INELIGIBLE/],
] as const) test(`finance rejects ${name}`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item } = await financeSale(c);
  await c.db.update(orders).set(change).where(eq(orders.id, orderId));
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), error);
  assert.equal((await c.db.select().from(adminSettlements).where(eq(adminSettlements.orderId, orderId))).length, 0);
  await financeInvariants(c);
}));

for (const terminal of ["EXPIRED", "CANCELLED"] as const) test(`finance rejects ${terminal} order`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  if (terminal === "EXPIRED") { await makeDue(c, orderId); await expireUnpaidOrder(c.db, orderId); }
  else await cancelUnpaidOrder(c.db, orderId, c.customers[0]);
  const [item] = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /SETTLEMENT_ORDER_INELIGIBLE/);
  await financeInvariants(c);
}));

test("finance refund-required payment cannot settle", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item } = await financeSale(c);
  await c.db.update(payments).set({ resolutionStatus: "REFUND_REQUIRED" }).where(eq(payments.orderId, orderId));
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /SETTLEMENT_ORDER_INELIGIBLE/);
  await financeInvariants(c);
}));

test("finance elapsed window uses historical purchase amount and exact fee formula", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item } = await financeSale(c);
  await c.db.update(products).set({ price: "999.00" }).where(eq(products.id, item.productId));
  const settlement = await createSettlement(c.db, item.id, 1000, 200, "10.00");
  assert.equal(settlement.status, "AVAILABLE"); assert.equal(settlement.grossAmount, "500.00");
  assert.equal(settlement.commissionAmount, "50.00"); assert.equal(settlement.gatewayFeeAmount, "10.00");
  assert.equal(settlement.refundAdjustmentAmount, "10.00"); assert.equal(settlement.netPayable, "430.00");
  await assert.rejects(createSettlement(c.db, item.id, 1000, 200, "10.00"));
  const payout = await requestPayout(c.db, c.adminId); assert.equal(payout.amount, "430.00");
  await financeInvariants(c);
}));

test("finance active return blocks after window elapsed", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item } = await deliveredReturnFixture(c, false, false);
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, orderId));
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /RETURN_REFUND_UNRESOLVED/);
  await financeInvariants(c);
}));

test("finance return hold is item scoped even within the same order", { skip: !testUrl }, async () => fixture(async (c) => {
  // Build a two-product sale through checkout, then attach delivery evidence.
  const otherProduct = await addProduct(c);
  const [cart] = await c.db.select().from(carts).where(eq(carts.customerId, c.customers[0]));
  await c.db.insert(cartItems).values({ cartId: cart.id, productId: otherProduct, quantity: 1 });
  await c.db.update(categories).set({ slug: "dress" }).where(eq(categories.id, c.categoryId));
  await c.db.update(products).set({ returnEnabled: true }).where(eq(products.id, c.productId));
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `finance-scope-${randomUUID()}`);
  await c.db.update(orders).set({ status: "DELIVERED", deliveredAt: sql`clock_timestamp() - interval '1 day'` }).where(eq(orders.id, orderId));
  const items = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const affected = items.find((row) => row.productId === c.productId)!, unaffected = items.find((row) => row.productId === otherProduct)!;
  const { address, key } = await refundShippingFixture(c);
  const [shipment] = await c.db.insert(shipments).values({ orderId, adminId: c.adminId, providerKey: key, status: "DELIVERED", deliveredAt: sql`clock_timestamp() - interval '1 day'`, originAddressSnapshot: address, destinationAddressSnapshot: address }).returning();
  await c.db.insert(shipmentItems).values(items.map((item) => ({ shipmentId: shipment.id, orderItemId: item.id, orderId, adminId: item.adminId })));
  await requestReturn(c.db, c.customers[0], affected.id, 1, "Affected item", null, 5);
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, orderId));
  await assert.rejects(createSettlement(c.db, affected.id, 0, 0, "0.00"), /RETURN_REFUND_UNRESOLVED/);
  const settlement = await createSettlement(c.db, unaffected.id, 0, 0, "0.00");
  assert.equal(settlement.netPayable, "100.00"); assert.equal((await requestPayout(c.db, c.adminId)).amount, "100.00");
  await financeInvariants(c);
}));

test("finance payout quarantines an insufficient Refund Adjustment without double deduction", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item, returnId } = await partialRefundFinanceFixture(c);
  await submitRefund(c.db, returnId, refundResponse(c, returnId));
  const [row] = await c.db.insert(adminSettlements).values({ adminId: c.adminId, orderId, orderItemId: item.id, grossAmount: "1000.00", commissionAmount: "0.00", gatewayFeeAmount: "0.00", refundAdjustmentAmount: "0.00", netPayable: "1000.00" }).returning();
  await assert.rejects(requestPayout(c.db, c.adminId), /No payable balance/);
  await assert.rejects(requestPayout(c.db, c.adminId), /No payable balance/);
  const [held] = await c.db.select().from(adminSettlements).where(eq(adminSettlements.id, row.id));
  assert.equal(held.status, "HELD"); assert.equal(held.refundAdjustmentAmount, "0.00"); assert.equal(held.netPayable, "1000.00");
  assert.equal((await c.db.select().from(payoutSettlementItems).where(eq(payoutSettlementItems.settlementId, row.id))).length, 0);
  await financeInvariants(c);
}));

test("finance return creation wins order lock and blocks settlement", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item, returnId } = await deliveredReturnFixture(c, false, false);
  await c.db.delete(returnItems).where(eq(returnItems.returnId, returnId));
  await c.db.delete(returns).where(eq(returns.id, returnId));
  const outcomes = await financeRace(c.db,
    (db) => requestReturn(db, c.customers[0], item.id, 1, "Valid return", null, 5),
    (db) => createSettlement(db, item.id, 0, 0, "0.00"));
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  assert.match(String((outcomes[1] as PromiseRejectedResult).reason), /RETURN_REFUND_UNRESOLVED/);
  assert.equal((await c.db.select().from(adminSettlements).where(eq(adminSettlements.orderId, orderId))).length, 0);
  await financeInvariants(c);
}));

test("finance settlement wins after deadline and waiting return rechecks deadline", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item, returnId } = await deliveredReturnFixture(c, false, false);
  await c.db.delete(returnItems).where(eq(returnItems.returnId, returnId));
  await c.db.delete(returns).where(eq(returns.id, returnId));
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, orderId));
  const outcomes = await financeRace(c.db,
    (db) => createSettlement(db, item.id, 0, 0, "0.00"),
    (db) => requestReturn(db, c.customers[0], item.id, 1, "Too late", null, 5));
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  assert.match(String((outcomes[1] as PromiseRejectedResult).reason), /Return window has closed/);
  await financeInvariants(c);
}));

test("finance QC races settlement using the return lock", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item, returnId } = await deliveredReturnFixture(c, false);
  await markReturnReceived(c.db, returnId, c.adminId);
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, orderId));
  const outcomes = await financeRace(c.db,
    (db) => inspectReturn(db, returnId, c.adminId, "APPROVED", "GOOD", null, "QC"),
    (db) => createSettlement(db, item.id, 0, 0, "0.00"));
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  await financeInvariants(c);
}));

test("finance refund authorization races settlement and preserves hold", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, item, returnId } = await deliveredReturnFixture(c);
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '6 days'` }).where(eq(orders.id, orderId));
  const outcomes = await financeRace(c.db,
    (db) => authorizeRefund(db, returnId), (db) => createSettlement(db, item.id, 0, 0, "500.00"));
  assert.equal(outcomes[0].status, "fulfilled"); assert.equal(outcomes[1].status, "rejected");
  await financeInvariants(c);
}));

test("finance concurrent payout requests allocate a settlement once", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item } = await financeSale(c);
  const settlement = await createSettlement(c.db, item.id, 0, 0, "0.00");
  const outcomes = await financeRace(c.db, (db) => requestPayout(db, c.adminId), (db) => requestPayout(db, c.adminId));
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((row) => row.status === "rejected").length, 1);
  const [payout] = await c.db.select().from(payoutRequests).where(eq(payoutRequests.adminId, c.adminId));
  await assert.rejects(c.db.insert(payoutSettlementItems).values({ payoutRequestId: payout.id, settlementId: settlement.id }));
  await financeInvariants(c);
}));

test("finance payout revalidates legacy AVAILABLE and does not block unrelated eligible sale", { skip: !testUrl }, async () => fixture(async (c) => {
  const first = await financeSale(c), second = await financeSale(c, 1);
  const bad = await createSettlement(c.db, first.item.id, 0, 0, "0.00");
  const good = await createSettlement(c.db, second.item.id, 0, 0, "0.00");
  await c.db.update(orders).set({ deliveredAt: sql`clock_timestamp() - interval '1 day'` }).where(eq(orders.id, first.orderId));
  const payout = await requestPayout(c.db, c.adminId); assert.equal(payout.amount, "500.00");
  const [held] = await c.db.select().from(adminSettlements).where(eq(adminSettlements.id, bad.id)); assert.equal(held.status, "HELD");
  const links = await c.db.select().from(payoutSettlementItems).where(eq(payoutSettlementItems.payoutRequestId, payout.id));
  assert.deepEqual(links.map((row) => row.settlementId), [good.id]);
  await financeInvariants(c);
}));

test("finance payout holds wrong historical Admin ownership", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item } = await financeSale(c);
  const settlement = await createSettlement(c.db, item.id, 0, 0, "0.00");
  const otherId = randomUUID();
  await c.db.insert(admins).values({ id: otherId, userId: c.customers[1], status: "ACTIVE" });
  try {
    await c.db.update(adminSettlements).set({ adminId: otherId }).where(eq(adminSettlements.id, settlement.id));
    await assert.rejects(requestPayout(c.db, otherId), /No payable balance/);
    const [held] = await c.db.select().from(adminSettlements).where(eq(adminSettlements.id, settlement.id)); assert.equal(held.status, "HELD");
  } finally {
    await c.db.update(adminSettlements).set({ adminId: c.adminId }).where(eq(adminSettlements.id, settlement.id));
    await c.db.delete(admins).where(eq(admins.id, otherId));
  }
  await financeInvariants(c);
}));

test("finance sale owner is preserved when a different Admin manages the product", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item } = await financeSale(c);
  const manager = randomUUID();
  await c.db.insert(admins).values({ id: manager, userId: c.customers[1], status: "ACTIVE" });
  await c.db.insert(productAdmins).values({ adminId: manager, productId: c.productId });
  try {
    const settlement = await createSettlement(c.db, item.id, 0, 0, "0.00");
    assert.equal(settlement.adminId, c.adminId);
    await assert.rejects(requestPayout(c.db, manager), /No payable balance/);
    const [untouched] = await c.db.select().from(adminSettlements).where(eq(adminSettlements.id, settlement.id));
    assert.equal(untouched.status, "AVAILABLE");
    assert.equal((await requestPayout(c.db, c.adminId)).amount, "500.00");
    await financeInvariants(c);
  } finally {
    await c.db.delete(productAdmins).where(eq(productAdmins.adminId, manager));
    await c.db.delete(admins).where(eq(admins.id, manager));
  }
}));

test("finance zero balance creates no payout and rejected payout is revalidated", { skip: !testUrl }, async () => fixture(async (c) => {
  const { item } = await financeSale(c);
  const settlement = await createSettlement(c.db, item.id, 0, 0, "500.00");
  await assert.rejects(requestPayout(c.db, c.adminId), /No payable balance/);
  assert.equal((await c.db.select().from(payoutRequests).where(eq(payoutRequests.adminId, c.adminId))).length, 0);
  await c.db.update(adminSettlements).set({ refundAdjustmentAmount: "0.00", netPayable: "500.00" }).where(eq(adminSettlements.id, settlement.id));
  const payout = await requestPayout(c.db, c.adminId);
  await reviewPayout(c.db, payout.id, c.customers[0], "REJECTED", "Recheck");
  assert.equal((await requestPayout(c.db, c.adminId)).amount, "500.00");
  await financeInvariants(c);
}));

test("return decision races preserve one outcome and its original audit fields", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId, item } = await deliveredReturnFixture(c, false, false);
  const outcomes = await onIndependentConnections((a, b) => Promise.allSettled([
    decideReturn(a, returnId, c.adminId, true, "First approval"),
    decideReturn(b, returnId, c.adminId, false, "First rejection"),
  ]));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.match(String((outcomes.find((result) => result.status === "rejected") as PromiseRejectedResult).reason), /RETURN_DECISION_CONFLICT/);
  const [saved] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  assert.ok(["APPROVED", "REJECTED"].includes(saved.status));
  assert.equal(saved.qcNotes, saved.status === "APPROVED" ? "First approval" : "First rejection");
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 0);
  if (saved.status === "REJECTED") {
    await assert.rejects(markReturnReceived(c.db, returnId, c.adminId), /RETURN_RECEIPT_CONFLICT/);
    await assert.rejects(authorizeRefund(c.db, returnId), /Receipt and approved QC/);
  } else {
    await assert.rejects(decideReturn(c.db, returnId, c.adminId, false, "Late rejection"), /RETURN_DECISION_CONFLICT/);
  }
  if (saved.status === "APPROVED") await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /RETURN_REFUND_UNRESOLVED/);
  await assertInventoryInvariant(c);
}));

for (const approve of [true, false]) test(`duplicate concurrent ${approve ? "approvals" : "rejections"} preserve the first decision`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c, false, false);
  const [first, second] = await onIndependentConnections((a, b) => Promise.all([
    decideReturn(a, returnId, c.adminId, approve, "First caller"),
    decideReturn(b, returnId, c.adminId, approve, "Second caller"),
  ]));
  assert.equal(first.status, approve ? "APPROVED" : "REJECTED");
  assert.equal(second.status, first.status);
  assert.equal(first.updatedAt.getTime(), second.updatedAt.getTime());
  assert.equal(first.qcNotes, second.qcNotes);
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 0);
}));

test("QC races preserve one inspection and rejected QC never authorizes a refund", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId, item } = await deliveredReturnFixture(c, false);
  await markReturnReceived(c.db, returnId, c.adminId);
  const outcomes = await onIndependentConnections((a, b) => Promise.allSettled([
    inspectReturn(a, returnId, c.adminId, "APPROVED", "GOOD", null, "Approve QC"),
    inspectReturn(b, returnId, c.adminId, "REJECTED", "DAMAGED", null, "Reject QC"),
  ]));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(String((outcomes.find((result) => result.status === "rejected") as PromiseRejectedResult).reason), /RETURN_QC_CONFLICT/);
  const [saved] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  const inspections = await c.db.select().from(returnInspections).where(eq(returnInspections.returnId, returnId));
  assert.equal(inspections.length, 1);
  assert.equal(saved.status, inspections[0].decision === "APPROVED" ? "QC_APPROVED" : "QC_REJECTED");
  if (saved.status === "QC_REJECTED") await assert.rejects(authorizeRefund(c.db, returnId), /Receipt and approved QC/);
  else {
    await onIndependentConnections((a, b) => Promise.all([authorizeRefund(a, returnId), authorizeRefund(b, returnId)]));
    assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  }
  await assert.rejects(inspectReturn(c.db, returnId, c.adminId, inspections[0].decision === "APPROVED" ? "REJECTED" : "APPROVED", "OTHER", null, "Late QC"), /RETURN_QC_CONFLICT/);
  if (saved.status === "QC_APPROVED") await assert.rejects(createSettlement(c.db, item.id, 0, 0, "0.00"), /RETURN_REFUND_UNRESOLVED/);
}));

test("duplicate QC approval and authorization race preserve one refund obligation", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId, item } = await deliveredReturnFixture(c, false);
  await markReturnReceived(c.db, returnId, c.adminId);
  const [first, second] = await onIndependentConnections((a, b) => Promise.all([
    inspectReturn(a, returnId, c.adminId, "APPROVED", "GOOD", null, "First QC"),
    inspectReturn(b, returnId, c.adminId, "APPROVED", "GOOD", null, "Second QC"),
  ]));
  assert.equal(first.id, second.id);
  assert.equal(first.inspectedAt.getTime(), second.inspectedAt.getTime());
  const [refundA, refundB] = await onIndependentConnections((a, b) => Promise.all([authorizeRefund(a, returnId), authorizeRefund(b, returnId)]));
  assert.equal(refundA.id, refundB.id);
  assert.equal(refundA.amount, item.totalAmount);
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
  await assert.rejects(createSettlement(c.db, item.id, 0, 0, refundA.amount), /RETURN_REFUND_UNRESOLVED/);
  await assertInventoryInvariant(c);
}));

test("refund authorization racing QC approval is safe to retry", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c, false);
  await markReturnReceived(c.db, returnId, c.adminId);
  const outcomes = await onIndependentConnections((a, b) => Promise.allSettled([
    inspectReturn(a, returnId, c.adminId, "APPROVED", "GOOD", null, "QC approved"),
    authorizeRefund(b, returnId),
  ]));
  assert.equal(outcomes[0].status, "fulfilled");
  if (outcomes[1].status === "rejected") assert.match(String(outcomes[1].reason), /Receipt and approved QC/);
  const refund = await authorizeRefund(c.db, returnId);
  assert.equal(refund.status, "PENDING_PROVIDER");
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 1);
}));

test("outer rollback removes a return decision and leaves no refund effect", { skip: !testUrl }, async () => fixture(async (c) => {
  const { returnId, orderId } = await deliveredReturnFixture(c, false, false);
  const marker = new Error("ROLLBACK_RETURN_DECISION");
  await assert.rejects(c.db.transaction(async (tx) => {
    const decided = await decideReturn(tx as never, returnId, c.adminId, true, "Rolled back");
    assert.equal(decided.status, "APPROVED");
    throw marker;
  }), (error: unknown) => error === marker);
  const [saved] = await c.db.select().from(returns).where(eq(returns.id, returnId));
  assert.equal(saved.status, "REQUESTED");
  assert.equal(saved.approvedAt, null);
  assert.equal((await c.db.select().from(refunds).where(eq(refunds.orderId, orderId))).length, 0);
}));

const shippingPackage = { weightKg: 1, lengthCm: 10, breadthCm: 10, heightCm: 10 };

async function webhookShipmentFixture(c: Awaited<ReturnType<typeof createFixture>>) {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
  const { address } = await refundShippingFixture(c);
  const inserted = await c.db.insert(shippingProviderConfigs).values({ providerKey: "shiprocket", displayName: "Isolated webhook fixture", enabled: false }).onConflictDoNothing().returning();
  if (inserted.length) c.extraShippingProviderKeys.push("shiprocket");
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  const awb = `TEST-${randomUUID()}`;
  const [shipment] = await c.db.insert(shipments).values({ orderId, adminId: c.adminId, providerKey: "shiprocket", providerOrderId: `provider-order-${awb}`,
    providerShipmentId: `provider-shipment-${awb}`, awbNumber: awb, status: "CONFIRMED", originAddressSnapshot: address,
    destinationAddressSnapshot: order.shippingAddressSnapshot }).returning();
  const [item] = await c.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  await c.db.insert(shipmentItems).values({ shipmentId: shipment.id, orderItemId: item.id, orderId, adminId: c.adminId });
  return { orderId, shipmentId: shipment.id, awb };
}

const trackingPayload = (awb: string, status: string, time: string) => ({ awb, current_status: status, current_timestamp: time });

test("shipping creation uses paid eligibility and historical destination snapshot", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
  const { key } = await refundShippingFixture(c);
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  await c.db.update(customerAddresses).set({ line1: "New mutable address" }).where(eq(customerAddresses.id, c.addressIds[0]));
  let calls = 0;
  const provider = { key, getServiceability: async () => ({ available: true, courierCount: 1 }), createShipment: async (input: { externalOrderId: string; destination: { line1: string } }) => {
    calls++; assert.equal(input.destination.line1, order.shippingAddressSnapshot.line1);
    return { providerOrderId: `provider-order-${input.externalOrderId}`, providerShipmentId: `provider-shipment-${input.externalOrderId}` };
  } } as unknown as ShippingProvider;
  const shipment = await createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage);
  assert.equal(shipment.status, "CONFIRMED"); assert.equal(shipment.trackingUrl, null);
  assert.deepEqual(shipment.destinationAddressSnapshot, order.shippingAddressSnapshot);
  assert.equal((await listShipmentReconciliationCandidates(c.db)).find((row) => row.id === shipment.id)?.reason, "AWB_PENDING");
  await c.db.update(shipments).set({ status: "CREATED" }).where(eq(shipments.id, shipment.id));
  assert.equal((await listShipmentReconciliationCandidates(c.db)).find((row) => row.id === shipment.id)?.reason, "LOCAL_STATE_STALE");
  assert.equal((await reconcileShipment(c.db, shipment.id)).status, "CONFIRMED");
  await assert.rejects(createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage), /already reserved for shipment/);
  assert.equal(calls, 1);
  await assertInventoryInvariant(c);
}));

test("concurrent delivery webhooks create one event and one order milestone", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, shipmentId, awb } = await webhookShipmentFixture(c);
  const payload = trackingPayload(awb, "DELIVERED", "2026-09-29T10:00:00.000Z");
  const results = await onIndependentConnections((a, b) => Promise.all([ingestShiprocketWebhook(a, payload), ingestShiprocketWebhook(b, payload)]));
  assert.equal(results.reduce((sum, result) => sum + result.accepted, 0), 1);
  assert.equal((await c.db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipmentId))).length, 1);
  const [shipment] = await c.db.select().from(shipments).where(eq(shipments.id, shipmentId));
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(shipment.status, "DELIVERED"); assert.ok(shipment.deliveredAt);
  assert.equal(order.status, "DELIVERED"); assert.equal(order.deliveredAt?.getTime(), shipment.deliveredAt.getTime());
  const original = order.deliveredAt.getTime();
  assert.deepEqual(await ingestShiprocketWebhook(c.db, payload), { accepted: 0, duplicates: 1 });
  await ingestShiprocketWebhook(c.db, trackingPayload(awb, "IN_TRANSIT", "2026-09-29T11:00:00.000Z"));
  const [after] = await c.db.select().from(shipments).where(eq(shipments.id, shipmentId));
  const [afterOrder] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(after.status, "DELIVERED"); assert.equal(after.deliveredAt?.getTime(), original);
  assert.equal(afterOrder.deliveredAt?.getTime(), original);
  await assertInventoryInvariant(c);
}));

test("stored delivery evidence repairs missing shipment and order milestones idempotently", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, shipmentId, awb } = await webhookShipmentFixture(c);
  await ingestShiprocketWebhook(c.db, trackingPayload(awb, "DELIVERED", "2026-09-29T10:00:00.000Z"));
  await c.db.update(shipments).set({ status: "CONFIRMED", deliveredAt: null }).where(eq(shipments.id, shipmentId));
  await c.db.update(orders).set({ status: "CONFIRMED", deliveredAt: null }).where(eq(orders.id, orderId));
  assert.equal((await listShipmentReconciliationCandidates(c.db)).find((row) => row.id === shipmentId)?.reason, "DELIVERY_MILESTONE_MISSING");
  const first = await reconcileShipment(c.db, shipmentId), second = await reconcileShipment(c.db, shipmentId);
  assert.equal(first.status, "DELIVERED"); assert.equal(first.deliveredAt?.getTime(), second.deliveredAt?.getTime());
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(order.deliveredAt?.getTime(), first.deliveredAt?.getTime());
}));

test("delivery transition rolls back its event and milestones together", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, shipmentId, awb } = await webhookShipmentFixture(c);
  const marker = new Error("ROLLBACK_DELIVERY");
  await assert.rejects(c.db.transaction(async (tx) => {
    await ingestShiprocketWebhook(tx as never, trackingPayload(awb, "DELIVERED", "2026-09-29T10:00:00.000Z"));
    throw marker;
  }), (error: unknown) => error === marker);
  assert.equal((await c.db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipmentId))).length, 0);
  const [shipment] = await c.db.select().from(shipments).where(eq(shipments.id, shipmentId));
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(shipment.status, "CONFIRMED"); assert.equal(shipment.deliveredAt, null);
  assert.equal(order.status, "CONFIRMED"); assert.equal(order.deliveredAt, null);
}));

for (const state of ["UNPAID", "EXPIRED", "CANCELLED", "RELEASED_STOCK", "REFUND_REQUIRED"] as const) test(`shipping guard rejects ${state}`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  const { key } = await refundShippingFixture(c);
  if (state === "EXPIRED") { await makeDue(c, orderId); await expireUnpaidOrder(c.db, orderId); }
  if (state === "CANCELLED") await cancelUnpaidOrder(c.db, orderId, c.customers[0]);
  if (state === "RELEASED_STOCK" || state === "REFUND_REQUIRED") {
    await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
    if (state === "RELEASED_STOCK") await c.db.update(orders).set({ stockState: "RELEASED" }).where(eq(orders.id, orderId));
    else await c.db.update(payments).set({ resolutionStatus: "REFUND_REQUIRED" }).where(eq(payments.orderId, orderId));
  }
  let providerCalls = 0;
  const provider = { key, getServiceability: async () => { providerCalls++; return { available: true, courierCount: 1 }; } } as unknown as ShippingProvider;
  await assert.rejects(createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage), /FULFILLMENT_ORDER_INELIGIBLE/);
  assert.equal(providerCalls, 0);
  assert.equal((await c.db.select().from(shipments).where(eq(shipments.orderId, orderId))).length, 0);
}));

for (const failure of ["timeout", "definitive rejection"] as const) test(`shipping ${failure} leaves the reserved ID for reconciliation`, { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
  const { key } = await refundShippingFixture(c);
  let externalOrderId: string | undefined, calls = 0;
  const provider = { key, getServiceability: async () => ({ available: true, courierCount: 1 }), createShipment: async (input: { externalOrderId: string }) => {
    calls++; externalOrderId = input.externalOrderId;
    throw new Error(failure === "timeout" ? "PROVIDER_TIMEOUT" : "Shiprocket API request failed (422)");
  } } as unknown as ShippingProvider;
  await assert.rejects(createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage));
  const rows = await c.db.select().from(shipments).where(eq(shipments.orderId, orderId));
  assert.equal(rows.length, 1); assert.equal(rows[0].id, externalOrderId);
  assert.equal(rows[0].status, "CREATED"); assert.equal(rows[0].providerShipmentId, null);
  assert.equal((await listShipmentReconciliationCandidates(c.db)).find((row) => row.id === rows[0].id)?.reason, "PROVIDER_OUTCOME_UNKNOWN");
  await assert.rejects(createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage), /already reserved for shipment/);
  assert.equal(calls, 1);
}));

test("provider success with failed local persistence retains a deterministic recovery ID", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
  const { key } = await refundShippingFixture(c);
  const trigger = `shipping_fail_${randomUUID().replaceAll("-", "")}`;
  let externalOrderId: string | undefined;
  const provider = { key, getServiceability: async () => ({ available: true, courierCount: 1 }), createShipment: async (input: { externalOrderId: string }) => {
    externalOrderId = input.externalOrderId;
    await c.db.execute(sql.raw(`create function ${trigger}_fn() returns trigger language plpgsql as $$ begin if new.id = '${externalOrderId}' and new.provider_shipment_id is not null then raise exception using errcode = 'P0001'; end if; return new; end $$`));
    await c.db.execute(sql.raw(`create trigger ${trigger}_tr before update on shipments for each row execute function ${trigger}_fn()`));
    return { providerOrderId: "mock-order", providerShipmentId: "mock-shipment" };
  } } as unknown as ShippingProvider;
  try { await assert.rejects(createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage)); }
  finally {
    await c.db.execute(sql.raw(`drop trigger if exists ${trigger}_tr on shipments`));
    await c.db.execute(sql.raw(`drop function if exists ${trigger}_fn()`));
  }
  const [shipment] = await c.db.select().from(shipments).where(eq(shipments.orderId, orderId));
  assert.equal(shipment.id, externalOrderId); assert.equal(shipment.providerShipmentId, null);
  assert.equal((await listShipmentReconciliationCandidates(c.db)).find((row) => row.id === shipment.id)?.reason, "PROVIDER_OUTCOME_UNKNOWN");
  const repaired = await recordKnownProviderShipment(c.db, shipment.id, key, { externalOrderId: shipment.id, providerOrderId: "mock-order", providerShipmentId: "mock-shipment" });
  assert.equal(repaired.status, "CONFIRMED"); assert.equal(repaired.providerShipmentId, "mock-shipment");
  assert.equal((await recordKnownProviderShipment(c.db, shipment.id, key, { externalOrderId: shipment.id, providerOrderId: "mock-order", providerShipmentId: "mock-shipment" })).updatedAt.getTime(), repaired.updatedAt.getTime());
  await assert.rejects(recordKnownProviderShipment(c.db, shipment.id, key, { externalOrderId: randomUUID(), providerOrderId: "mock-order", providerShipmentId: "mock-shipment" }), /evidence is invalid/);
}));

test("malformed and unknown shipment events do not mutate local state", { skip: !testUrl }, async () => fixture(async (c) => {
  const { shipmentId, awb } = await webhookShipmentFixture(c);
  await assert.rejects(ingestShiprocketWebhook(c.db, trackingPayload(awb, "UNRECOGNIZED", "2026-09-29T10:00:00.000Z")), /Invalid tracking event/);
  await assert.rejects(ingestShiprocketWebhook(c.db, trackingPayload("UNKNOWN-AWB", "DELIVERED", "2026-09-29T10:00:00.000Z")), /Shipment unavailable/);
  assert.equal((await c.db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipmentId))).length, 0);
}));

test("concurrent shipment creation reserves an order item once", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
  const { key } = await refundShippingFixture(c);
  let providerCalls = 0;
  const provider = { key, getServiceability: async () => ({ available: true, courierCount: 1 }), createShipment: async (input: { externalOrderId: string }) => {
    providerCalls++; return { providerOrderId: `order-${input.externalOrderId}`, providerShipmentId: `shipment-${input.externalOrderId}` };
  } } as unknown as ShippingProvider;
  const outcomes = await onIndependentConnections((a, b) => Promise.allSettled([
    createForwardShipment(a, provider, orderId, c.adminId, shippingPackage),
    createForwardShipment(b, provider, orderId, c.adminId, shippingPackage),
  ]));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(providerCalls, 1);
  assert.equal((await c.db.select().from(shipments).where(eq(shipments.orderId, orderId))).length, 1);
  assert.equal((await c.db.select().from(shipmentItems).where(eq(shipmentItems.orderId, orderId))).length, 1);
}));

test("webhook delivery before create response preserves the delivered milestone", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId } = await checkoutCart(c.db, c.customers[0], await intent(c));
  await applyVerifiedPayment(c.db, orderId, `shipping-paid-${randomUUID()}`);
  await refundShippingFixture(c);
  const inserted = await c.db.insert(shippingProviderConfigs).values({ providerKey: "shiprocket", displayName: "Isolated early webhook fixture", enabled: true }).onConflictDoNothing().returning();
  if (inserted.length) c.extraShippingProviderKeys.push("shiprocket");
  const [origin] = await c.db.select().from(adminAddresses).where(and(eq(adminAddresses.adminId, c.adminId), eq(adminAddresses.addressType, "SHIPPING_ORIGIN")));
  await c.db.insert(shippingProviderLocations).values({ adminId: c.adminId, adminAddressId: origin.id, providerKey: "shiprocket", providerLocationRef: "early-webhook", locationName: "Fixture" });
  const awb = `EARLY-${randomUUID()}`;
  const provider = { key: "shiprocket", getServiceability: async () => ({ available: true, courierCount: 1 }), createShipment: async (input: { externalOrderId: string }) => {
    await c.db.update(shipments).set({ awbNumber: awb }).where(eq(shipments.id, input.externalOrderId));
    await ingestShiprocketWebhook(c.db, trackingPayload(awb, "DELIVERED", "2026-09-29T10:00:00.000Z"));
    return { providerOrderId: `order-${input.externalOrderId}`, providerShipmentId: `shipment-${input.externalOrderId}` };
  } } as unknown as ShippingProvider;
  const result = await createForwardShipment(c.db, provider, orderId, c.adminId, shippingPackage);
  assert.equal(result.status, "DELIVERED"); assert.ok(result.deliveredAt);
  assert.ok(result.providerShipmentId);
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(order.status, "DELIVERED"); assert.equal(order.deliveredAt?.getTime(), result.deliveredAt.getTime());
}));

test("failed delivery can recover, while RTO cannot move to delivered", { skip: !testUrl }, async () => fixture(async (c) => {
  const { orderId, shipmentId, awb } = await webhookShipmentFixture(c);
  for (const [status, time] of [
    ["IN_TRANSIT", "2026-09-29T10:00:00.000Z"],
    ["DELIVERY_FAILED", "2026-09-29T11:00:00.000Z"],
    ["IN_TRANSIT", "2026-09-29T12:00:00.000Z"],
    ["RTO", "2026-09-29T13:00:00.000Z"],
    ["DELIVERED", "2026-09-29T14:00:00.000Z"],
  ] as const) await ingestShiprocketWebhook(c.db, trackingPayload(awb, status, time));
  const [shipment] = await c.db.select().from(shipments).where(eq(shipments.id, shipmentId));
  const [order] = await c.db.select().from(orders).where(eq(orders.id, orderId));
  assert.equal(shipment.status, "RTO"); assert.equal(shipment.deliveredAt, null);
  assert.equal(order.status, "CONFIRMED"); assert.equal(order.deliveredAt, null);
  assert.equal((await listShipmentReconciliationCandidates(c.db)).find((row) => row.id === shipmentId)?.reason, "CONFLICTING_TERMINAL_EVENT");
}));
