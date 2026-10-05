/**
 * Scratch debug script: check expired-token DB-side filter behavior.
 * Run: npx tsx src/scripts/debug-expired-token.ts
 * Safe: uses CHECKOUT_TEST_DATABASE_URL only.
 */
import { config } from "dotenv";
import { and, eq, gt, sql } from "drizzle-orm";
import { createDb } from "../db";
import { verifications } from "../db/schema/auth";

config({ path: ".env.checkout-test.local", quiet: true });
const url = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!url) throw new Error("CHECKOUT_TEST_DATABASE_URL required");

const { db, client } = createDb(url);
const testId = `exp-debug-${Date.now()}`;
const identifier = `pwd-reset:debug-test-${Date.now()}`;

async function run() {
  // Insert a row that expires in the future.
  await db.insert(verifications).values({
    id: testId,
    identifier,
    value: JSON.stringify({ userId: "debug-user", role: "CUSTOMER" }),
    expiresAt: new Date(Date.now() + 60_000),
  });

  // Back-date it.
  await db.update(verifications)
    .set({ expiresAt: sql`now() - interval '1 hour'` })
    .where(eq(verifications.identifier, identifier));

  // Read back the raw row.
  const [raw] = await db.select().from(verifications).where(eq(verifications.identifier, identifier));
  console.log("Raw row expiresAt:", raw?.expiresAt);
  console.log("typeof expiresAt:", typeof raw?.expiresAt);
  console.log("instanceof Date:", raw?.expiresAt instanceof Date);
  console.log("expiresAt < new Date():", raw?.expiresAt < new Date());

  // Query with GT filter.
  const live = await db.select().from(verifications).where(
    and(eq(verifications.identifier, identifier), gt(verifications.expiresAt, new Date())),
  );
  console.log("Live rows with gt() filter:", live.length, "(expect 0)");

  // Cleanup.
  await db.delete(verifications).where(eq(verifications.id, testId));
  await client.end({ timeout: 1 });
}

run().catch((e) => {
  console.error(e);
  client.end({ timeout: 1 });
});
