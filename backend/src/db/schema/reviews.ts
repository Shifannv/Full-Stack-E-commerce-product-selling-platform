import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { products } from "./catalog";
import { orderItems } from "./orders";

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => users.id),
    rating: integer("rating").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("PENDING"),
    moderatedByUserId: text("moderated_by_user_id").references(() => users.id),
    moderationNotes: text("moderation_notes"),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("reviews_order_item_unique").on(table.orderItemId),
    index("reviews_product_status_idx").on(table.productId, table.status),
    check("reviews_rating_check", sql`${table.rating} between 1 and 5`),
    check(
      "reviews_status_check",
      sql`${table.status} in ('PENDING','PUBLISHED','REJECTED')`,
    ),
  ],
);

// Reserved for a future release. V1 exposes no review-image route or UI.
export const reviewImages = pgTable("review_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id),
  objectKey: text("object_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
