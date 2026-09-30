import assert from "node:assert/strict";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL is required");
const test = new URL(testUrl);
if (!["postgres:", "postgresql:"].includes(test.protocol)) throw new Error("Test URL must be PostgreSQL");
if (test.hostname !== "127.0.0.1" || test.port !== "5432" || test.pathname !== "/ownline_checkout_test" || decodeURIComponent(test.username) !== "postgres") throw new Error("Unexpected checkout test database target");
if (process.env.DATABASE_URL) {
  const configured = new URL(process.env.DATABASE_URL);
  if (test.hostname === configured.hostname && test.port === configured.port && test.pathname === configured.pathname) throw new Error("Test database must differ from configured DATABASE_URL");
}
const client = postgres(testUrl, { max: 1 });

async function main() {
  try {
    const result = await client.begin(async (tx) => {
      await tx`set transaction read only`;
      const columns = await tx`select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name in ('carts','orders','payments','inventories','product_variants')`;
      for (const [table, column] of [
        ["carts", "version"], ["orders", "checkout_key"], ["orders", "checkout_request_hash"], ["orders", "payment_expires_at"], ["orders", "expired_at"], ["orders", "cancelled_at"], ["orders", "stock_state"], ["payments", "resolution_status"], ["inventories", "version"],
      ]) assert.ok(columns.some((row) => row.table_name === table && row.column_name === column), `Missing ${table}.${column}`);
      assert.equal(columns.find((row) => row.table_name === "product_variants" && row.column_name === "price")?.is_nullable, "YES");
      const indexes = await tx`select indexname from pg_indexes where schemaname = 'public'`;
      for (const name of ["orders_customer_checkout_key_unique", "orders_unpaid_expiry_idx", "payments_provider_order_unique", "payments_provider_payment_unique"]) assert.ok(indexes.some((row) => row.indexname === name), `Missing ${name}`);
      const constraints = await tx`select conname from pg_constraint where connamespace = 'public'::regnamespace`;
      assert.ok(constraints.some((row) => row.conname === "payments_order_unique"), "Missing unique payments.order_id");
      const [negative] = await tx`select count(*)::integer as count from inventories where available_quantity < 0 or reserved_quantity < 0`;
      const [reservationMismatch] = await tx`
        select count(*)::integer as count from (
          select i.id from inventories i
          left join order_items oi on oi.product_id = i.product_id and oi.variant_id is not distinct from i.variant_id
          left join orders o on o.id = oi.order_id
          group by i.id, i.reserved_quantity
          having i.reserved_quantity <> coalesce(sum(oi.quantity) filter (where o.stock_state = 'RESERVED'), 0)
        ) mismatches`;
      const [duplicateKeys] = await tx`select count(*)::integer as count from (select customer_id, checkout_key from orders where checkout_key is not null group by customer_id, checkout_key having count(*) > 1) duplicates`;
      const [badPaymentCounts] = await tx`select count(*)::integer as count from (select o.id from orders o left join payments p on p.order_id = o.id where o.checkout_key is not null group by o.id having count(p.id) <> 1) bad`;
      assert.equal(negative.count, 0, "Negative inventory quantity");
      assert.equal(reservationMismatch.count, 0, "Reservation equation mismatch");
      assert.equal(duplicateKeys.count, 0, "Duplicate customer checkout key");
      assert.equal(badPaymentCounts.count, 0, "Checkout order without exactly one payment");
      const [badResolutionRecords] = await tx`select count(*)::integer as count from payments p join orders o on o.id = p.order_id
        where p.resolution_status = 'RESOLVED' and (p.status <> 'PAID' or o.status not in ('EXPIRED','CANCELLED') or o.stock_state <> 'RELEASED'
          or not exists (select 1 from refunds r where r.payment_id = p.id and r.order_id = o.id and r.reason = 'LATE_PAYMENT' and r.status = 'INTERNAL_RECORDED' and r.amount = p.amount and r.currency = p.currency and r.provider_reference is null))`;
      const [duplicateRefundEffects] = await tx`select count(*)::integer as count from (
        select payment_id from refunds where reason = 'LATE_PAYMENT' group by payment_id having count(*) > 1
        union all select payment_id from refunds where return_id is not null group by payment_id, return_id having count(*) > 1) duplicate_refunds`;
      const [terminalConsumed] = await tx`select count(*)::integer as count from orders where status in ('EXPIRED','CANCELLED') and stock_state = 'CONSUMED'`;
      const [unresolved] = await tx`select count(*)::integer as count from payments where status = 'PAID' and resolution_status = 'REFUND_REQUIRED'`;
      assert.equal(badResolutionRecords.count, 0, "Resolved payment without matching internal record");
      assert.equal(duplicateRefundEffects.count, 0, "Duplicate refund effect");
      assert.equal(terminalConsumed.count, 0, "Terminal unpaid order consumed stock");
      const [counts] = await tx`select (select count(*)::integer from orders) as orders, (select count(*)::integer from payments) as payments, (select count(*)::integer from carts) as carts, (select count(*)::integer from inventories) as inventories`;
      return { schema: "PASS", negativeInventory: negative.count, reservationMismatch: reservationMismatch.count, duplicateCheckoutKeys: duplicateKeys.count, badPaymentCounts: badPaymentCounts.count, badResolutionRecords: badResolutionRecords.count, duplicateRefundEffects: duplicateRefundEffects.count, terminalConsumed: terminalConsumed.count, unresolvedRefundObligations: unresolved.count, counts };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.end({ timeout: 1 }); }
}
main().catch((error: unknown) => { console.error("Checkout test verification failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : undefined, code: (error as { code?: string })?.code }); process.exitCode = 1; });
