import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "../../db";
import { adminAuditEvents } from "../../db/schema/admin";
import { users } from "../../db/schema/auth";
import { platformFinanceSettings } from "../../db/schema/finance";
import { getFinanceSettings, parseBasisPoints, updateFinanceSetting } from "../admin/finance.service";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (testUrl) {
  const target = new URL(testUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== "5432" || target.pathname !== "/ownline_checkout_test" || decodeURIComponent(target.username) !== "postgres") throw new Error("Unexpected checkout test database target");
}

async function fixture(run: (db: ReturnType<typeof createDb>["db"], other: ReturnType<typeof createDb>["db"], actor: string) => Promise<void>) {
  if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL is required");
  const first = createDb(testUrl), second = createDb(testUrl), actor = `finance-settings-${randomUUID()}`;
  const original = await getFinanceSettings(first.db);
  await first.db.insert(users).values({ id: actor, name: "Finance settings fixture", email: `${actor}@example.invalid` });
  try { await run(first.db, second.db, actor); }
  finally {
    await first.db.transaction(async tx => {
      await tx.update(platformFinanceSettings).set({ basisPoints: String(original.commissionBps), updatedByUserId: null }).where(eq(platformFinanceSettings.settingKey, "COMMISSION_BPS"));
      await tx.update(platformFinanceSettings).set({ basisPoints: String(original.gatewayFeeBps), updatedByUserId: null }).where(eq(platformFinanceSettings.settingKey, "PAYMENT_GATEWAY_FEE_BPS"));
      await tx.delete(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, actor));
      await tx.delete(users).where(eq(users.id, actor));
    });
    await Promise.all([first.client.end({ timeout: 1 }), second.client.end({ timeout: 1 })]);
  }
}

test("persistent finance settings read, validate, update, audit, and roll back atomically", { skip: !testUrl }, async () => fixture(async (db, _other, actor) => {
  const before = await getFinanceSettings(db);
  assert.ok(Number.isInteger(before.commissionBps));
  assert.ok(Number.isInteger(before.gatewayFeeBps));
  assert.throws(() => parseBasisPoints("10.00"), { message: "Invalid fee rate" });
  assert.throws(() => parseBasisPoints(-1), { message: "Invalid fee rate" });
  assert.throws(() => parseBasisPoints(10001), { message: "Invalid fee rate" });

  await updateFinanceSetting(db, "COMMISSION_BPS", 1234, actor);
  await updateFinanceSetting(db, "PAYMENT_GATEWAY_FEE_BPS", 321, actor);
  assert.deepEqual(await getFinanceSettings(db), { commissionBps: 1234, gatewayFeeBps: 321 });
  const audits = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, actor));
  assert.equal(audits.length, 2);
  assert.deepEqual(audits.map(a => a.metadata).sort((a, b) => String(a.setting).localeCompare(String(b.setting))), [
    { setting: "COMMISSION_BPS", oldValue: before.commissionBps, newValue: 1234 },
    { setting: "PAYMENT_GATEWAY_FEE_BPS", oldValue: before.gatewayFeeBps, newValue: 321 },
  ]);

  await assert.rejects(db.transaction(async tx => {
    await updateFinanceSetting(tx as never, "COMMISSION_BPS", 777, actor);
    throw new Error("ROLLBACK_SETTINGS");
  }), /ROLLBACK_SETTINGS/);
  assert.equal((await getFinanceSettings(db)).commissionBps, 1234);
  assert.equal((await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, actor))).length, 2);
}));

test("concurrent finance setting updates serialize with matching audit evidence", { skip: !testUrl }, async () => fixture(async (db, other, actor) => {
  const outcomes = await Promise.all([updateFinanceSetting(db, "COMMISSION_BPS", 1100, actor), updateFinanceSetting(other, "COMMISSION_BPS", 1200, actor)]);
  const saved = await getFinanceSettings(db);
  assert.ok([1100, 1200].includes(saved.commissionBps));
  assert.equal(outcomes.length, 2);
  const audits = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, actor));
  assert.equal(audits.length, 2);
  assert.ok(audits.some(audit => audit.metadata.newValue === saved.commissionBps));
}));
