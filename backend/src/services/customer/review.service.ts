import { and, desc, eq } from "drizzle-orm";
import type { createDb } from "../../db";
import { orderItems, orders } from "../../db/schema/orders";
import { reviews } from "../../db/schema/reviews";
import { shipmentItems, shipments } from "../../db/schema/shipping";
import { DomainError, requiredText } from "../admin/admin.service";

type Db = ReturnType<typeof createDb>["db"];

export async function createReview(db: Db, customerId: string, input: { orderItemId: string; rating: number; title: string; body: string }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new DomainError("Rating must be between 1 and 5", 422);
  const [item] = await db.select({ id: orderItems.id, productId: orderItems.productId, orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, input.orderItemId)).limit(1);
  if (!item) throw new DomainError("Order item unavailable", 404);
  const [order] = await db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, item.orderId)).limit(1);
  if (order?.customerId !== customerId) throw new DomainError("Order item unavailable", 404);
  const [delivered] = await db.select({ id: shipments.id }).from(shipmentItems).innerJoin(shipments, eq(shipmentItems.shipmentId, shipments.id))
    .where(and(eq(shipmentItems.orderItemId, item.id), eq(shipments.status, "DELIVERED"))).limit(1);
  if (!delivered) throw new DomainError("A delivered purchase is required", 422);
  try {
    const [review] = await db.insert(reviews).values({ productId: item.productId, orderItemId: item.id, customerId, rating: input.rating, title: requiredText(input.title, "title", 150), body: requiredText(input.body, "body", 5000) }).returning();
    return review;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new DomainError("This order item already has a review", 409);
    throw error;
  }
}

export async function listPublishedReviews(db: Db, productId: string) {
  return db.select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, createdAt: reviews.createdAt })
    .from(reviews).where(and(eq(reviews.productId, productId), eq(reviews.status, "PUBLISHED"))).orderBy(desc(reviews.createdAt));
}

export async function listPendingReviews(db: Db) { return db.select().from(reviews).where(eq(reviews.status, "PENDING")).orderBy(reviews.createdAt); }

export async function moderateReview(db: Db, reviewId: string, moderatorUserId: string, decision: "PUBLISHED" | "REJECTED", notes: string) {
  const [review] = await db.update(reviews).set({ status: decision, moderatedByUserId: moderatorUserId, moderationNotes: requiredText(notes, "notes", 1000), moderatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), eq(reviews.status, "PENDING"))).returning();
  if (!review) throw new DomainError("Pending review unavailable", 409);
  return review;
}
