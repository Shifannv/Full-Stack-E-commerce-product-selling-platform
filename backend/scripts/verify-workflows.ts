import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../src/db/schema/admin";
import { users } from "../src/db/schema/auth";
import { categories, categoryProductFields, inventories, products, productVariants, subcategories } from "../src/db/schema/catalog";
import { cartItems, carts, customerAddresses } from "../src/db/schema/customer";
import { orderItems, orders, payments } from "../src/db/schema/orders";
import { admins } from "../src/db/schema/rbac";
import { refunds, returns } from "../src/db/schema/returns";
import { shipmentEvents, shipmentItems, shipments } from "../src/db/schema/shipping";
import { correctApplication, requestCategory, reviewApplication, saveAddress, saveKyc, submitApplication } from "../src/services/admin/admin.service";
import { assertCategoryScope, createProduct, createVariant, setProductInventory, updateProduct } from "../src/services/admin/catalog.service";
import { createSettlement, markPayoutPaid, requestPayout, reviewPayout } from "../src/services/admin/finance.service";
import { checkoutCart, getCustomerOrders } from "../src/services/customer/order.service";
import { getPublicProduct, listCatalog } from "../src/services/customer/customer.service";
import { createReview, listPublishedReviews, moderateReview } from "../src/services/customer/review.service";
import { authorizeRefund, decideReturn, getReturn, inspectReturn, markReturnReceived, requestReturn } from "../src/services/returns/return.service";
import { getOrderTracking, ingestShiprocketWebhook } from "../src/services/shipping/shipping.service";
import { ingestCashfreeWebhook } from "../src/services/payment.service";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { client, db } = createDb(process.env.DATABASE_URL);
type Db = typeof db;
const rollback = new Error("ROLLBACK_WORKFLOW_FIXTURE");
const address = { contactName: "Fixture", phone: "9999999999", line1: "Fixture Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" };

async function main() {
  const fixtureId = `workflow-${randomUUID()}`;
  try {
    try {
      await db.transaction(async (tx) => {
        const work = tx as unknown as Db;
        const customerId = `${fixtureId}-customer`;
        const otherCustomerId = `${fixtureId}-other-customer`;
        const sellerUserId = `${fixtureId}-seller`;
        const otherSellerUserId = `${fixtureId}-other-seller`;
        const reviewerId = `${fixtureId}-reviewer`;
        await tx.insert(users).values([
          { id: customerId, name: "Fixture Customer", email: `${customerId}@example.invalid` },
          { id: otherCustomerId, name: "Fixture Other", email: `${otherCustomerId}@example.invalid` },
          { id: sellerUserId, name: "Fixture Seller", email: `${sellerUserId}@example.invalid` },
          { id: otherSellerUserId, name: "Fixture Seller B", email: `${otherSellerUserId}@example.invalid` },
          { id: reviewerId, name: "Fixture Reviewer", email: `${reviewerId}@example.invalid` },
        ]);
        const [seller] = await tx.insert(admins).values({ userId: sellerUserId, status: "DRAFT" }).returning();
        const [otherSeller] = await tx.insert(admins).values({ userId: otherSellerUserId, status: "ACTIVE" }).returning();
        const [category] = await tx.insert(categories).values({ name: "Dress", slug: "dress", status: "PUBLISHED" }).returning();
        const [otherCategory] = await tx.insert(categories).values({ name: "Gadgets", slug: `${fixtureId}-gadgets`, status: "PUBLISHED" }).returning();
        const [subcategory] = await tx.insert(subcategories).values({ categoryId: category.id, name: "Fixture Subcategory", slug: "fixture-sub", status: "PUBLISHED" }).returning();

        const kyc = await saveKyc(work, seller.id, sellerUserId, { legalName: "Fixture Seller", businessType: "Retail", contactPhone: "9999999999" });
        await requestCategory(work, seller.id, category.id);
        await assert.rejects(submitApplication(work, seller.id, sellerUserId), /Shipping origin and return addresses are required/);
        await saveAddress(work, seller.id, sellerUserId, { ...address, addressType: "SHIPPING_ORIGIN" });
        await saveAddress(work, seller.id, sellerUserId, { ...address, addressType: "RETURN" });
        await assert.rejects(submitApplication(work, seller.id, sellerUserId), /Private KYC evidence is required/);
        await tx.insert(adminKycDocuments).values({ submissionId: kyc.id, documentType: "TEST_EVIDENCE", privateObjectKey: `fixture/${fixtureId}` });
        await submitApplication(work, seller.id, sellerUserId);
        await reviewApplication(work, seller.id, reviewerId, "CHANGES_REQUIRED", "Correct the legal name");
        await saveKyc(work, seller.id, sellerUserId, { legalName: "Resubmitted Fixture Seller", businessType: "Retail", contactPhone: "9999999999" });
        await submitApplication(work, seller.id, sellerUserId);
        await correctApplication(work, seller.id, reviewerId, { legalName: "Corrected Fixture Seller", reason: "Fixture correction" });
        await reviewApplication(work, seller.id, reviewerId, "APPROVED", "Fixture approval");
        const [approvedSeller] = await tx.select({ status: admins.status }).from(admins).where(eq(admins.id, seller.id));
        const [approvedKyc] = await tx.select({ status: adminKycSubmissions.status, legalName: adminKycSubmissions.legalName }).from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, seller.id));
        assert.equal(approvedSeller.status, "ACTIVE");
        assert.equal(approvedKyc.status, "APPROVED");
        assert.equal(approvedKyc.legalName, "Corrected Fixture Seller");
        const audit = await tx.select({ action: adminAuditEvents.action, changedFields: adminAuditEvents.changedFields }).from(adminAuditEvents).where(eq(adminAuditEvents.adminId, seller.id));
        assert.ok(audit.some((event) => event.action === "KYC_CORRECTED" && event.changedFields.includes("legalName")));

        await assertCategoryScope(work, seller.id, category.id);
        await assert.rejects(assertCategoryScope(work, seller.id, otherCategory.id), /outside Admin scope/);
        await tx.insert(categoryProductFields).values({ categoryId: category.id, key: "size", label: "Size", inputType: "SELECT", required: true, options: ["M", "L"] });
        const productInput = { categoryId: category.id, subcategoryId: subcategory.id, name: "Fixture Product", slug: `${fixtureId}-product`, price: "100.00", sku: "FIXTURE-SKU", weightKg: "0.500", lengthCm: "10", breadthCm: "10", heightCm: "5" };
        await assert.rejects(createProduct(work, seller.id, { ...productInput, attributes: {} }), /size is required/);
        await assert.rejects(createProduct(work, seller.id, { ...productInput, categoryId: otherCategory.id, attributes: { size: "M" } }), /outside Admin scope/);
        const product = await createProduct(work, seller.id, { ...productInput, attributes: { size: "M" } });
        assert.equal(product.returnEnabled, false);
        await assert.rejects(createProduct(work, otherSeller.id, { ...productInput, categoryId: otherCategory.id, returnEnabled: true, attributes: {} }), /outside Admin scope/);
        await tx.update(products).set({ status: "PUBLISHED" }).where(eq(products.id, product.id));
        assert.equal((await listCatalog(work, { q: "Fixture", category: category.slug, minPrice: 90, maxPrice: 110, limit: 20, offset: 0 })).length, 1);
        assert.equal((await getPublicProduct(work, product.slug)).id, product.id);

        const [checkoutAddress] = await tx.insert(customerAddresses).values({ customerId, ...address, label: "Home", isDefault: true }).returning();
        const [cart] = await tx.insert(carts).values({ customerId }).returning();
        await tx.insert(cartItems).values({ cartId: cart.id, productId: product.id, quantity: 2 });
        await tx.insert(inventories).values({ productId: product.id, availableQuantity: 3 });
        const checkoutOrder = await checkoutCart(work, customerId, checkoutAddress.id);
        const [checkoutHistory] = await tx.select({ unitPrice: orderItems.unitPrice, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, checkoutOrder.id));
        assert.deepEqual(checkoutHistory, { unitPrice: "100.00", quantity: 2 });
        const [remainingStock] = await tx.select({ quantity: inventories.availableQuantity }).from(inventories).where(eq(inventories.productId, product.id));
        assert.equal(remainingStock.quantity, 1);
        assert.equal((await getCustomerOrders(work, customerId, checkoutOrder.id))[0].customerId, customerId);
        await assert.rejects(getCustomerOrders(work, otherCustomerId, checkoutOrder.id), /Order unavailable/);
        await updateProduct(work, seller.id, product.id, { name: "Updated Fixture Product", price: "125.00", attributes: { size: "L" } });
        const [unchangedBaseSnapshot] = await tx.select({ name: orderItems.productNameSnapshot, price: orderItems.unitPrice }).from(orderItems).where(eq(orderItems.orderId, checkoutOrder.id));
        assert.deepEqual(unchangedBaseSnapshot, { name: "Fixture Product", price: "100.00" });
        await assert.rejects(updateProduct(work, otherSeller.id, product.id, { price: "1.00" }), /Product unavailable/);
        await tx.update(adminCategoryAssignments).set({ status: "REVOKED" }).where(eq(adminCategoryAssignments.adminId, seller.id));
        await assert.rejects(updateProduct(work, seller.id, product.id, { price: "1.00" }), /outside Admin scope/);
        await assert.rejects(createVariant(work, seller.id, product.id, { sku: "REVOKED", title: "Rejected", price: "1.00" }), /outside Admin scope/);
        await assert.rejects(setProductInventory(work, seller.id, product.id, 999), /outside Admin scope/);
        await tx.update(adminCategoryAssignments).set({ status: "ACTIVE" }).where(eq(adminCategoryAssignments.adminId, seller.id));

        const [otherAddress] = await tx.insert(customerAddresses).values({ customerId: otherCustomerId, ...address, label: "Home", isDefault: true }).returning();
        const [otherCart] = await tx.insert(carts).values({ customerId: otherCustomerId }).returning();
        await tx.insert(cartItems).values({ cartId: otherCart.id, productId: product.id, quantity: 2 });
        await assert.rejects(checkoutCart(work, otherCustomerId, otherAddress.id), /Insufficient stock/);
        await tx.delete(cartItems).where(eq(cartItems.cartId, otherCart.id));
        const variant = await createVariant(work, seller.id, product.id, { sku: `${fixtureId}-VARIANT`, title: "Large", price: "140.00", attributes: { size: "L" } });
        await setProductInventory(work, seller.id, product.id, 2, variant.id);
        await tx.insert(cartItems).values({ cartId: otherCart.id, productId: product.id, variantId: variant.id, quantity: 1 });
        const variantOrder = await checkoutCart(work, otherCustomerId, otherAddress.id);
        await tx.update(productVariants).set({ title: "Changed Large", price: "175.00" }).where(eq(productVariants.id, variant.id));
        const [variantSnapshot] = await tx.select({ title: orderItems.variantTitleSnapshot, price: orderItems.unitPrice }).from(orderItems).where(eq(orderItems.orderId, variantOrder.id));
        assert.deepEqual(variantSnapshot, { title: "Large", price: "140.00" });
        await tx.update(payments).set({ providerOrderId: variantOrder.id }).where(eq(payments.orderId, variantOrder.id));
        const paymentWebhook = { type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: variantOrder.id, order_amount: 140, order_currency: "INR" }, payment: { cf_payment_id: `${fixtureId}-payment`, payment_status: "SUCCESS", payment_amount: 140, payment_currency: "INR" } } };
        assert.deepEqual(await ingestCashfreeWebhook(work, paymentWebhook), { accepted: 1, duplicates: 0 });
        assert.deepEqual(await ingestCashfreeWebhook(work, paymentWebhook), { accepted: 0, duplicates: 1 });
        const [paidOrder] = await tx.select({ paymentStatus: orders.paymentStatus, status: orders.status }).from(orders).where(eq(orders.id, variantOrder.id));
        assert.deepEqual(paidOrder, { paymentStatus: "PAID", status: "CONFIRMED" });

        const [order] = await tx.insert(orders).values({ orderNumber: fixtureId, customerId, subtotal: "100.00", totalAmount: "100.00", shippingAddressSnapshot: address, paymentStatus: "PAID", placedAt: new Date() }).returning();
        const [item] = await tx.insert(orderItems).values({ orderId: order.id, adminId: seller.id, productId: product.id, productNameSnapshot: product.name, skuSnapshot: "FIXTURE-SKU", unitPrice: "50.00", quantity: 2, subtotal: "100.00", totalAmount: "100.00", weightKgSnapshot: "0.500", lengthCmSnapshot: "10", breadthCmSnapshot: "10", heightCmSnapshot: "5" }).returning();
        await tx.insert(payments).values({ orderId: order.id, providerOrderId: fixtureId, amount: "100.00", status: "PAID", paidAt: new Date() });
        await tx.update(products).set({ price: "200.00" }).where(eq(products.id, product.id));
        const [history] = await tx.select({ unitPrice: orderItems.unitPrice }).from(orderItems).where(eq(orderItems.id, item.id));
        assert.equal(history.unitPrice, "50.00");
        const [shipment] = await tx.insert(shipments).values({ orderId: order.id, adminId: seller.id, providerKey: "shiprocket", awbNumber: fixtureId, originAddressSnapshot: address, destinationAddressSnapshot: address, status: "CONFIRMED" }).returning();
        await tx.insert(shipmentItems).values({ shipmentId: shipment.id, orderItemId: item.id, orderId: order.id, adminId: seller.id });
        await assert.rejects(createReview(work, customerId, { orderItemId: item.id, rating: 5, title: "Too early", body: "Not delivered" }), /delivered purchase is required/);
        const webhook = { awb: fixtureId, current_status: "Delivered", current_status_id: 7, current_timestamp: new Date().toISOString() };
        assert.deepEqual(await ingestShiprocketWebhook(work, webhook), { accepted: 1, duplicates: 0 });
        assert.deepEqual(await ingestShiprocketWebhook(work, webhook), { accepted: 0, duplicates: 1 });
        const [deliveryOrder] = await tx.select({ deliveredAt: orders.deliveredAt }).from(orders).where(eq(orders.id, order.id));
        assert.ok(deliveryOrder.deliveredAt);
        assert.equal((await tx.select({ id: shipmentEvents.id }).from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment.id))).length, 1);
        const customer = { userId: customerId, roles: ["CUSTOMER"], permissions: [], adminApproved: false };
        const sellerActor = { userId: sellerUserId, roles: ["ADMIN"], permissions: ["orders.view"], adminApproved: true };
        assert.equal((await getOrderTracking(work, order.id, customer, "customer"))[0].status, "DELIVERED");
        await assert.rejects(getOrderTracking(work, order.id, { ...customer, userId: otherCustomerId }, "customer"), /Order unavailable/);
        assert.equal((await getOrderTracking(work, order.id, sellerActor, "admin"))[0].status, "DELIVERED");
        await assert.rejects(getOrderTracking(work, order.id, { ...sellerActor, userId: otherSellerUserId }, "admin"), /Order unavailable/);

        await assert.rejects(createReview(work, otherCustomerId, { orderItemId: item.id, rating: 5, title: "No", body: "Not owned" }), /Order item unavailable/);
        const review = await createReview(work, customerId, { orderItemId: item.id, rating: 5, title: "Fixture review", body: "Delivered purchase review" });
        assert.equal((await listPublishedReviews(work, product.id)).length, 0);
        await moderateReview(work, review.id, reviewerId, "PUBLISHED", "Fixture moderation");
        assert.equal((await listPublishedReviews(work, product.id)).length, 1);

        await assert.rejects(requestReturn(work, customerId, item.id, 1, "Fixture return", null, 5), /not returnable/);
        await updateProduct(work, seller.id, product.id, { returnEnabled: true });
        const [gadgetSubcategory] = await tx.insert(subcategories).values({ categoryId: otherCategory.id, name: "Fixture Gadgets", slug: "fixture-gadgets", status: "PUBLISHED" }).returning();
        await tx.insert(adminCategoryAssignments).values({ adminId: seller.id, categoryId: otherCategory.id, status: "ACTIVE", assignedByUserId: reviewerId });
        await assert.rejects(createProduct(work, seller.id, { ...productInput, categoryId: otherCategory.id, subcategoryId: gadgetSubcategory.id, slug: `${fixtureId}-bad-return`, returnEnabled: true, attributes: {} }), /Only Dress products can enable returns/);
        const [gadget] = await tx.insert(products).values({ categoryId: otherCategory.id, subcategoryId: gadgetSubcategory.id, createdByAdminId: otherSeller.id, name: "Fixture Gadget", slug: `${fixtureId}-gadget`, price: "10.00", returnEnabled: true }).returning();
        const [gadgetItem] = await tx.insert(orderItems).values({ orderId: order.id, adminId: otherSeller.id, productId: gadget.id, productNameSnapshot: gadget.name, unitPrice: "10.00", quantity: 1, subtotal: "10.00", totalAmount: "10.00" }).returning();
        await assert.rejects(requestReturn(work, customerId, gadgetItem.id, 1, "Fixture return", null, 5), /not returnable/);
        await tx.update(orders).set({ deliveredAt: new Date(Date.now() - 6 * 86400000) }).where(eq(orders.id, order.id));
        await assert.rejects(requestReturn(work, customerId, item.id, 1, "Fixture return", null, 5), /window has closed/);
        await tx.update(orders).set({ deliveredAt: null }).where(eq(orders.id, order.id));
        await assert.rejects(requestReturn(work, customerId, item.id, 1, "Fixture return", null, 5), /Delivered order required/);
        await tx.update(orders).set({ deliveredAt: deliveryOrder.deliveredAt }).where(eq(orders.id, order.id));
        const requested = await requestReturn(work, customerId, item.id, 1, "Fixture return", null, 5);
        assert.equal((await getReturn(work, requested.id, customer, "customer")).returnAddress, null);
        await assert.rejects(authorizeRefund(work, requested.id), /Receipt and approved QC are required/);
        await decideReturn(work, requested.id, seller.id, true, "Fixture approval");
        assert.equal((await getReturn(work, requested.id, customer, "customer")).returnAddress?.line1, "Fixture Lane");
        await tx.update(adminAddresses).set({ line1: "Later Address" }).where(and(eq(adminAddresses.adminId, seller.id), eq(adminAddresses.addressType, "RETURN")));
        assert.equal((await getReturn(work, requested.id, customer, "customer")).returnAddress?.line1, "Fixture Lane");
        await assert.rejects(authorizeRefund(work, requested.id), /Receipt and approved QC are required/);
        await markReturnReceived(work, requested.id, seller.id);
        await inspectReturn(work, requested.id, seller.id, "APPROVED", "GOOD", null, "Fixture QC");
        const refund = await authorizeRefund(work, requested.id);
        assert.equal(refund.amount, "50.00");
        const [savedReturn] = await tx.select({ deductionAmount: returns.deductionAmount, netRefundAmount: returns.netRefundAmount }).from(returns).where(eq(returns.id, requested.id));
        assert.equal(savedReturn.deductionAmount, "0.00");
        assert.equal(savedReturn.netRefundAmount, "50.00");
        assert.equal((await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.returnId, requested.id))).length, 1);
        assert.equal((await authorizeRefund(work, requested.id)).id, refund.id);
        assert.equal((await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.returnId, requested.id))).length, 1);

        const [multiOrder] = await tx.insert(orders).values({ orderNumber: `${fixtureId}-multi`, customerId, subtotal: "20.00", totalAmount: "20.00", shippingAddressSnapshot: address, paymentStatus: "PAID" }).returning();
        const multiItems = await tx.insert(orderItems).values([
          { orderId: multiOrder.id, adminId: seller.id, productId: product.id, productNameSnapshot: product.name, unitPrice: "10.00", quantity: 1, subtotal: "10.00", totalAmount: "10.00" },
          { orderId: multiOrder.id, adminId: otherSeller.id, productId: gadget.id, productNameSnapshot: gadget.name, unitPrice: "10.00", quantity: 1, subtotal: "10.00", totalAmount: "10.00" },
        ]).returning();
        const multiShipments = await tx.insert(shipments).values([seller.id, otherSeller.id].map((adminId, index) => ({ orderId: multiOrder.id, adminId, providerKey: "shiprocket", awbNumber: `${fixtureId}-multi-${index}`, originAddressSnapshot: address, destinationAddressSnapshot: address, status: "CONFIRMED" }))).returning();
        await tx.insert(shipmentItems).values(multiItems.map((orderItem, index) => ({ shipmentId: multiShipments[index].id, orderItemId: orderItem.id, orderId: multiOrder.id, adminId: orderItem.adminId })));
        const deliveryTime = new Date().toISOString();
        await ingestShiprocketWebhook(work, { awb: `${fixtureId}-multi-0`, current_status: "Delivered", current_status_id: 7, current_timestamp: deliveryTime });
        assert.equal((await tx.select({ deliveredAt: orders.deliveredAt }).from(orders).where(eq(orders.id, multiOrder.id)))[0].deliveredAt, null);
        await ingestShiprocketWebhook(work, { awb: `${fixtureId}-multi-1`, current_status: "Delivered", current_status_id: 7, current_timestamp: deliveryTime });
        assert.ok((await tx.select({ deliveredAt: orders.deliveredAt }).from(orders).where(eq(orders.id, multiOrder.id)))[0].deliveredAt);
        const settlement = await createSettlement(work, item.id, 1000, 250, "50.00");
        assert.equal(settlement.netPayable, "37.50");
        const payout = await requestPayout(work, seller.id);
        await reviewPayout(work, payout.id, reviewerId, "APPROVED", "Fixture payout approval");
        const paid = await markPayoutPaid(work, payout.id, "FIXTURE-PAYOUT");
        assert.equal(paid.status, "PAID");
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    const left = await db.select({ id: users.id }).from(users).where(eq(users.id, `${fixtureId}-customer`));
    assert.equal(left.length, 0);
    console.log("Workflow checks passed: KYC approval/audit, category scope, catalog search/detail/update, stale stock, base/variant price snapshots, ownership, payment webhook deduplication, review moderation, shipping webhook deduplication, Admin isolation, return QC/refund, payout authorization, rollback");
  } finally { await client.end({ timeout: 1 }); }
}

main().catch((error: unknown) => {
  console.error("Workflow check failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message.slice(0, 300) : undefined, code: (error as { code?: string } | null)?.code, at: error instanceof Error ? error.stack?.split("\n").find((line) => line.includes("verify-workflows.ts"))?.trim() : undefined });
  process.exitCode = 1;
});
