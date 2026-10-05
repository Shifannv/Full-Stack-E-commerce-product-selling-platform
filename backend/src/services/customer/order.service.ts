import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { createDb } from "../../db";
import {
  categories,
  inventories,
  productAdmins,
  products,
  productVariants,
  subcategories,
} from "../../db/schema/catalog";
import { adminCategoryAssignments } from "../../db/schema/admin";
import { cartItems, carts, customerAddresses } from "../../db/schema/customer";
import {
  orderItems,
  orders,
  payments,
  type AddressSnapshot,
} from "../../db/schema/orders";
import { admins } from "../../db/schema/rbac";
import { reviews } from "../../db/schema/reviews";
import { returnItems } from "../../db/schema/returns";
import { shipmentItems, shipments } from "../../db/schema/shipping";
import type { Actor } from "../../middleware/authorization";
import { DomainError } from "../admin/admin.service";
import { canPurchaseProduct } from "./purchase-eligibility";
import { recoverDueUnpaidOrder } from "../unpaid-expiry.service";

type Db = ReturnType<typeof createDb>["db"];
export const toPaise = (value: string): number => {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new DomainError("Invalid money value", 422);
  const [whole, decimals = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
};
export const fromPaise = (value: number): string =>
  `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

type QuoteLine = {
  productId: string;
  variantId: string | null;
  name: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  available: boolean;
};
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
async function lockEligibilityRows(
  tx: Tx,
  items: Array<{ productId: string; variantId: string | null }>,
) {
  const productIds = [...new Set(items.map((item) => item.productId))].sort();
  const references = await tx
    .select({
      categoryId: products.categoryId,
      subcategoryId: products.subcategoryId,
      adminId: products.createdByAdminId,
    })
    .from(products)
    .where(inArray(products.id, productIds));
  const categoryIds = [
    ...new Set(references.map((row) => row.categoryId)),
  ].sort();
  const subcategoryIds = [
    ...new Set(references.map((row) => row.subcategoryId)),
  ].sort();
  const adminIds = [...new Set(references.map((row) => row.adminId))].sort();
  const variantIds = [
    ...new Set(
      items
        .map((item) => item.variantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].sort();
  // Fixed table order and ascending IDs prevent competing checkouts from
  // taking eligibility locks in cart insertion order.
  for (const id of adminIds)
    await tx
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.id, id))
      .for("update");
  for (const adminId of adminIds)
    for (const categoryId of categoryIds)
      await tx
        .select({ id: adminCategoryAssignments.id })
        .from(adminCategoryAssignments)
        .where(
          and(
            eq(adminCategoryAssignments.adminId, adminId),
            eq(adminCategoryAssignments.categoryId, categoryId),
          ),
        )
        .for("update");
  for (const id of categoryIds)
    await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .for("update");
  for (const productId of productIds)
    for (const adminId of adminIds)
      await tx
        .select({ adminId: productAdmins.adminId })
        .from(productAdmins)
        .where(
          and(
            eq(productAdmins.productId, productId),
            eq(productAdmins.adminId, adminId),
          ),
        )
        .for("update");
  for (const id of productIds)
    await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .for("update");
  for (const id of variantIds)
    await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.id, id))
      .for("update");
  for (const id of subcategoryIds)
    await tx
      .select({ id: subcategories.id })
      .from(subcategories)
      .where(eq(subcategories.id, id))
      .for("update");
}
const sortedLines = (lines: QuoteLine[]) =>
  [...lines].sort(
    (a, b) =>
      a.productId.localeCompare(b.productId) ||
      (a.variantId ?? "").localeCompare(b.variantId ?? ""),
  );
async function fingerprint(lines: QuoteLine[]) {
  const canonical = sortedLines(lines).map(
    ({ productId, variantId, quantity, unitPrice }) => ({
      productId,
      variantId,
      quantity,
      unitPrice,
    }),
  );
  return sha256(canonical);
}
async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function quoteCart(
  db: Db,
  customerId: string,
  addressId?: string,
) {
  return db.transaction(
    async (tx) => {
      const problems: string[] = [];
      const [address] = addressId
        ? await tx
            .select({ id: customerAddresses.id })
            .from(customerAddresses)
            .where(
              and(
                eq(customerAddresses.id, addressId),
                eq(customerAddresses.customerId, customerId),
              ),
            )
            .limit(1)
        : [];
      if (!address) problems.push("ADDRESS_UNAVAILABLE");
      const [cart] = await tx
        .select({ id: carts.id, version: carts.version })
        .from(carts)
        .where(eq(carts.customerId, customerId))
        .limit(1);
      const rows = cart
        ? await tx
            .select({
              productId: cartItems.productId,
              variantId: cartItems.variantId,
              quantity: cartItems.quantity,
            })
            .from(cartItems)
            .where(eq(cartItems.cartId, cart.id))
        : [];
      if (!rows.length) problems.push("EMPTY_CART");
      const lines: QuoteLine[] = [];
      for (const item of rows) {
        try {
          const { product, variant, unitPrice } = await canPurchaseProduct(
            tx,
            item.productId,
            item.variantId,
            item.quantity,
          );
          lines.push({
            productId: product.id,
            variantId: variant?.id ?? null,
            name: product.name,
            variantTitle: variant?.title ?? null,
            quantity: item.quantity,
            unitPrice,
            lineTotal: fromPaise(toPaise(unitPrice) * item.quantity),
            available: true,
          });
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          problems.push(error.message);
        }
      }
      const subtotal = fromPaise(
        lines.reduce((sum, line) => sum + toPaise(line.lineTotal), 0),
      );
      return {
        items: sortedLines(lines),
        cartVersion: cart?.version ?? 0,
        lineFingerprint: await fingerprint(lines),
        subtotal,
        discountAmount: "0.00",
        shippingAmount: "0.00",
        totalAmount: problems.length ? null : subtotal,
        currency: "INR",
        valid: problems.length === 0,
        problems,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

export type CheckoutInput = {
  addressId: string;
  key: string;
  cartVersion: number;
  lineFingerprint: string;
};
export async function checkoutCart(
  db: Db,
  customerId: string,
  input: CheckoutInput,
) {
  const requestHash = await sha256({
    addressId: input.addressId,
    cartVersion: input.cartVersion,
    lineFingerprint: input.lineFingerprint,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [cart] = await tx
          .select()
          .from(carts)
          .where(eq(carts.customerId, customerId))
          .limit(1)
          .for("update");
        if (!cart) throw new DomainError("EMPTY_CART", 409);
        const [prior] = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.customerId, customerId),
              eq(orders.checkoutKey, input.key),
            ),
          )
          .limit(1);
        if (prior) {
          if (prior.checkoutRequestHash !== requestHash)
            throw new DomainError("IDEMPOTENCY_KEY_REUSED", 409);
          return {
            orderId: prior.id,
            status: prior.status,
            paymentStatus: prior.paymentStatus,
            stockState: prior.stockState,
            totalAmount: prior.totalAmount,
            currency: prior.currency,
            paymentDeadline: prior.paymentExpiresAt,
            replayed: true,
          };
        }
        const items = await tx
          .select({
            productId: cartItems.productId,
            variantId: cartItems.variantId,
            quantity: cartItems.quantity,
          })
          .from(cartItems)
          .where(eq(cartItems.cartId, cart.id))
          .orderBy(asc(cartItems.productId), asc(cartItems.variantId));
        if (!items.length) throw new DomainError("EMPTY_CART", 409);
        if (cart.version !== input.cartVersion)
          throw new DomainError("QUOTE_CHANGED", 409);
        await lockEligibilityRows(tx, items);
        const prepared = [] as Array<
          Awaited<ReturnType<typeof canPurchaseProduct>> & { quantity: number }
        >;
        const lines: QuoteLine[] = [];
        for (const item of items) {
          const eligible = await canPurchaseProduct(
            tx,
            item.productId,
            item.variantId,
            item.quantity,
          );
          prepared.push({ ...eligible, quantity: item.quantity });
          lines.push({
            productId: eligible.product.id,
            variantId: eligible.variant?.id ?? null,
            name: eligible.product.name,
            variantTitle: eligible.variant?.title ?? null,
            quantity: item.quantity,
            unitPrice: eligible.unitPrice,
            lineTotal: fromPaise(toPaise(eligible.unitPrice) * item.quantity),
            available: true,
          });
        }
        if ((await fingerprint(lines)) !== input.lineFingerprint)
          throw new DomainError("QUOTE_CHANGED", 409);
        const [address] = await tx
          .select()
          .from(customerAddresses)
          .where(
            and(
              eq(customerAddresses.id, input.addressId),
              eq(customerAddresses.customerId, customerId),
            ),
          )
          .limit(1);
        if (!address) throw new DomainError("ADDRESS_UNAVAILABLE", 409);
        const quantities = new Map<string, number>();
        for (const item of prepared)
          quantities.set(
            item.inventory.id,
            (quantities.get(item.inventory.id) ?? 0) + item.quantity,
          );
        for (const [id, quantity] of [...quantities].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const [stock] = await tx
            .select()
            .from(inventories)
            .where(eq(inventories.id, id))
            .limit(1)
            .for("update");
          if (!stock || stock.availableQuantity < quantity)
            throw new DomainError("INSUFFICIENT_STOCK", 409);
        }
        const snapshot: AddressSnapshot = {
          contactName: address.contactName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
        };
        const amount = fromPaise(
          lines.reduce((sum, line) => sum + toPaise(line.lineTotal), 0),
        );
        const [order] = await tx
          .insert(orders)
          .values({
            orderNumber: `ORD-${crypto.randomUUID()}`,
            customerId,
            checkoutKey: input.key,
            checkoutRequestHash: requestHash,
            paymentExpiresAt: sql`clock_timestamp() + interval '15 minutes'`,
            stockState: "RESERVED",
            subtotal: amount,
            totalAmount: amount,
            shippingAddressSnapshot: snapshot,
            createdAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          })
          .returning();
        await tx.insert(orderItems).values(
          prepared.map(({ product, variant, unitPrice, quantity }) => ({
            orderId: order.id,
            adminId: product.createdByAdminId,
            productId: product.id,
            variantId: variant?.id,
            productNameSnapshot: product.name,
            variantTitleSnapshot: variant?.title,
            skuSnapshot: variant?.sku ?? product.sku,
            unitPrice,
            weightKgSnapshot: product.weightKg,
            lengthCmSnapshot: product.lengthCm,
            breadthCmSnapshot: product.breadthCm,
            heightCmSnapshot: product.heightCm,
            quantity,
            subtotal: fromPaise(toPaise(unitPrice) * quantity),
            totalAmount: fromPaise(toPaise(unitPrice) * quantity),
          })),
        );
        for (const [id, quantity] of [...quantities].sort(([a], [b]) =>
          a.localeCompare(b),
        ))
          await tx
            .update(inventories)
            .set({
              availableQuantity: sql`${inventories.availableQuantity} - ${quantity}`,
              reservedQuantity: sql`${inventories.reservedQuantity} + ${quantity}`,
              version: sql`${inventories.version} + 1`,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(eq(inventories.id, id));
        await tx.insert(payments).values({
          orderId: order.id,
          providerOrderId: order.id,
          amount,
          status: "PENDING",
        });
        await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
        await tx
          .update(carts)
          .set({
            version: sql`${carts.version} + 1`,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(carts.id, cart.id));
        return {
          orderId: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          stockState: order.stockState,
          totalAmount: order.totalAmount,
          currency: order.currency,
          paymentDeadline: order.paymentExpiresAt,
          replayed: false,
        };
      });
    } catch (error) {
      const code =
        (error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code;
      if (!["40P01", "40001"].includes(code ?? "")) throw error;
      if (attempt === 2) throw new DomainError("RETRYABLE_TRANSACTION", 503);
    }
  }
  throw new DomainError("RETRYABLE_TRANSACTION", 503);
}

export async function getCustomerOrders(
  db: Db,
  customerId: string,
  orderId?: string,
  returnPolicyRaw?: string,
) {
  let rows = await db
    .select()
    .from(orders)
    .where(
      orderId
        ? and(eq(orders.id, orderId), eq(orders.customerId, customerId))
        : eq(orders.customerId, customerId),
    )
    .orderBy(desc(orders.createdAt));
  if (orderId && !rows.length) throw new DomainError("Order unavailable", 404);
  if (
    orderId &&
    rows[0].status === "CREATED" &&
    rows[0].paymentStatus === "PENDING"
  ) {
    await recoverDueUnpaidOrder(db, orderId);
    rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
      .orderBy(desc(orders.createdAt));
  }
  if (!rows.length) return [];
  // These are advisory projections. The mutation paths retain their own locked,
  // database-clock checks so a stale page cannot authorize an action.
  const eligibilityRows = await db
    .select({
      itemId: orderItems.id,
      shipmentStatus: shipments.status,
      itemDeliveredAt: shipments.deliveredAt,
      reviewId: reviews.id,
      reviewStatus: reviews.status,
      returnId: returnItems.id,
      paymentRecordStatus: payments.status,
      returnEnabled: products.returnEnabled,
      categorySlug: categories.slug,
      returnWindowOpen: sql<boolean>`clock_timestamp() between ${orders.deliveredAt} and ${orders.deliveredAt} + interval '5 days'`,
      cancellationWindowOpen: sql<boolean>`clock_timestamp() < ${orders.paymentExpiresAt}`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(shipmentItems, eq(shipmentItems.orderItemId, orderItems.id))
    .leftJoin(shipments, eq(shipments.id, shipmentItems.shipmentId))
    .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
    .leftJoin(returnItems, eq(returnItems.orderItemId, orderItems.id))
    .where(inArray(orderItems.orderId, rows.map((row) => row.id)));
  const eligibilityByItem = new Map(
    eligibilityRows.map((row) => [row.itemId, row]),
  );
  return Promise.all(
    rows.map(async (order) => {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      const cancellationState = eligibilityByItem.get(items[0]?.id);
      const cancellationReasons = [
        ...(order.status === "CREATED" ? [] : ["ORDER_NOT_CREATED"]),
        ...(cancellationState?.paymentRecordStatus === "PENDING"
          ? []
          : ["PAYMENT_NOT_PENDING"]),
        ...(order.stockState === "RESERVED" ? [] : ["STOCK_NOT_RESERVED"]),
        ...(order.paymentExpiresAt ? [] : ["PAYMENT_DEADLINE_MISSING"]),
        ...(cancellationState?.cancellationWindowOpen === true
          ? []
          : ["PAYMENT_WINDOW_CLOSED"]),
      ];
      return customerOrderResponse(order, items, {
        cancellationEligible: cancellationReasons.length === 0,
        cancellationEligibilityReasons: cancellationReasons,
        items: new Map(
          items.map((item) => {
            const state = eligibilityByItem.get(item.id);
            const delivered = state?.shipmentStatus === "DELIVERED";
            const reviewReasons = [
              ...(delivered ? [] : ["SHIPMENT_NOT_DELIVERED"]),
              ...(state?.reviewId === null ? [] : ["ALREADY_REVIEWED"]),
            ];
            const returnReasons = [
              ...(returnPolicyRaw === "5" ? [] : ["RETURN_POLICY_UNAVAILABLE"]),
              ...(order.paymentStatus === "PAID" ? [] : ["ORDER_NOT_PAID"]),
              ...(order.deliveredAt ? [] : ["ORDER_NOT_DELIVERED"]),
              ...(delivered && state?.itemDeliveredAt
                ? []
                : ["SHIPMENT_NOT_DELIVERED"]),
              ...(state?.returnEnabled === true && state.categorySlug === "dress"
                ? []
                : ["PRODUCT_NOT_RETURNABLE"]),
              ...(state?.returnId === null ? [] : ["ALREADY_RETURNED"]),
              ...(state?.returnWindowOpen === true ? [] : ["RETURN_WINDOW_CLOSED"]),
            ];
            const returnEligible = returnReasons.length === 0;
            return [
              item.id,
              {
                deliveredAt: delivered
                  ? (state.itemDeliveredAt ?? null)
                  : null,
                reviewStatus: state?.reviewStatus ?? null,
                reviewEligible: reviewReasons.length === 0,
                reviewEligibilityReasons: reviewReasons,
                returnEligible,
                returnEligibilityReasons: returnReasons,
                remainingReturnableQuantity: returnEligible ? item.quantity : 0,
                returnWindowEndsAt: order.deliveredAt
                  ? new Date(order.deliveredAt.getTime() + 5 * 86400000)
                  : null,
              },
            ];
          }),
        ),
      });
    }),
  );
}

type ItemActionEligibility = {
  deliveredAt: Date | null;
  reviewStatus: string | null;
  reviewEligible: boolean;
  reviewEligibilityReasons: string[];
  returnEligible: boolean;
  returnEligibilityReasons: string[];
  remainingReturnableQuantity: number;
  returnWindowEndsAt: Date | null;
};

/** Explicit customer boundary: new database fields never become public implicitly. */
export function customerOrderResponse(
  order: typeof orders.$inferSelect,
  items: (typeof orderItems.$inferSelect)[],
  eligibility?: {
    cancellationEligible: boolean;
    cancellationEligibilityReasons: string[];
    items: Map<string, ItemActionEligibility>;
  },
) {
  const address = order.shippingAddressSnapshot;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveredAt: order.deliveredAt,
    ...(eligibility && {
      cancellationEligible: eligibility.cancellationEligible,
      cancellationEligibilityReasons: eligibility.cancellationEligibilityReasons,
      cancellationDeadline: order.paymentExpiresAt,
    }),
    createdAt: order.createdAt,
    currency: order.currency,
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    shippingAddressSnapshot: {
      contactName: address.contactName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? null,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    },
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      variantTitleSnapshot: item.variantTitleSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalAmount: item.totalAmount,
      ...(eligibility?.items.get(item.id) ?? {}),
    })),
  };
}

export async function getAdminOrders(db: Db, actor: Actor, orderId?: string) {
  if (
    !actor.roles.includes("ADMIN") ||
    !actor.adminApproved ||
    !actor.permissions.includes("orders.view")
  )
    throw new DomainError("Forbidden", 403);
  const [admin] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.userId, actor.userId))
    .limit(1);
  if (!admin) throw new DomainError("Forbidden", 403);
  const scoped = await db
    .select({ orderId: orderItems.orderId })
    .from(orderItems)
    .where(eq(orderItems.adminId, admin.id));
  const ids = [...new Set(scoped.map((item) => item.orderId))];
  if (orderId && !ids.includes(orderId))
    throw new DomainError("Order unavailable", 404);
  const selected = orderId ? ids.filter((id) => id === orderId) : ids;
  return Promise.all(
    selected.map(async (id) => {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      const items = await db
        .select()
        .from(orderItems)
        .where(
          and(eq(orderItems.orderId, id), eq(orderItems.adminId, admin.id)),
        );
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        currency: order.currency,
        paymentStatus: order.paymentStatus,
        shippingAddress: order.shippingAddressSnapshot,
        placedAt: order.placedAt,
        createdAt: order.createdAt,
        adminSubtotal: fromPaise(
          items.reduce((sum, item) => sum + toPaise(item.totalAmount), 0),
        ),
        items,
      };
    }),
  );
}
