import assert from "node:assert/strict";
import test from "node:test";
import { listPublishedReviews } from "./review.service";

test("public reviews always apply the PUBLISHED database filter", async () => {
  let whereUsed = false;
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          whereUsed = true;
          return { orderBy: async () => [] };
        },
      }),
    }),
  } as unknown as Parameters<typeof listPublishedReviews>[0];
  assert.deepEqual(await listPublishedReviews(db, "product-a"), []);
  assert.equal(whereUsed, true);
});
