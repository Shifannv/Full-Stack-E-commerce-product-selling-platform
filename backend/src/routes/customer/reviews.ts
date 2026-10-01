import { Hono } from "hono";
import { createDb } from "../../db";
import {
  requireAuth,
  type AuthorizedEnv,
} from "../../middleware/authorization";
import { DomainError, requiredText } from "../../services/admin/admin.service";
import {
  createReview,
  listPendingReviews,
  listPublishedReviews,
  moderateReview,
} from "../../services/customer/review.service";

export const publicReviewRoutes = new Hono<AuthorizedEnv>();
export const reviewRoutes = new Hono<AuthorizedEnv>();
async function withDb<T>(
  connectionString: string,
  action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
) {
  const { client, db } = createDb(connectionString);
  try {
    return await action(db);
  } finally {
    await client.end({ timeout: 1 });
  }
}
async function body(c: { req: { json: () => Promise<unknown> } }) {
  const v = await c.req.json().catch(() => null);
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new DomainError("Invalid JSON body", 422);
  return v as Record<string, unknown>;
}
const onError = (
  error: Error,
  c: Parameters<Parameters<typeof reviewRoutes.onError>[0]>[1],
) =>
  error instanceof DomainError
    ? c.json({ error: error.message }, error.status)
    : (console.error("Review API failed", {
        name: error.name,
        code: (error as { code?: string }).code,
      }),
      c.json({ error: "Review operation unavailable" }, 503));
publicReviewRoutes.onError(onError);
reviewRoutes.onError(onError);
publicReviewRoutes.get("/products/:productId/reviews", async (c) =>
  c.json({
    reviews: await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      listPublishedReviews(db, c.req.param("productId")),
    ),
  }),
);
reviewRoutes.use("*", requireAuth);
reviewRoutes.post("/reviews", async (c) => {
  if (!c.get("actor").roles.includes("CUSTOMER"))
    throw new DomainError("Forbidden", 403);
  const v = await body(c);
  const review = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    createReview(db, c.get("actor").userId, {
      orderItemId: requiredText(v.orderItemId, "orderItemId", 40),
      rating: Number(v.rating),
      title: requiredText(v.title, "title", 150),
      body: requiredText(v.body, "body", 5000),
    }),
  );
  return c.json(review, 201);
});
reviewRoutes.get("/super-admin/reviews/pending", async (c) => {
  if (!c.get("actor").roles.includes("SUPER_ADMIN"))
    throw new DomainError("Forbidden", 403);
  return c.json({
    reviews: await withDb(
      c.env.HYPERDRIVE.connectionString,
      listPendingReviews,
    ),
  });
});
reviewRoutes.post("/super-admin/reviews/:reviewId/moderate", async (c) => {
  if (!c.get("actor").roles.includes("SUPER_ADMIN"))
    throw new DomainError("Forbidden", 403);
  const v = await body(c);
  if (v.decision !== "PUBLISHED" && v.decision !== "REJECTED")
    throw new DomainError("Invalid decision", 422);
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      moderateReview(
        db,
        c.req.param("reviewId"),
        c.get("actor").userId,
        v.decision as "PUBLISHED" | "REJECTED",
        requiredText(v.notes, "notes", 1000),
      ),
    ),
  );
});
