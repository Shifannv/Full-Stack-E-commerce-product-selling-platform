import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL is required for checkout preflight");
const db = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  try {
    const checks = {
      counts: await db`select
        (select count(*)::integer from orders) as orders,
        (select count(*)::integer from payments) as payments,
        (select count(*)::integer from carts) as carts,
        (select count(*)::integer from inventories) as inventories`,
      duplicatePayments:
        await db`select order_id, count(*)::integer as count from payments group by order_id having count(*) > 1`,
      duplicateProviderOrders:
        await db`select provider, provider_order_id, count(*)::integer as count from payments where provider_order_id is not null group by provider, provider_order_id having count(*) > 1`,
      duplicateProviderPayments:
        await db`select provider, provider_payment_id, count(*)::integer as count from payments where provider_payment_id is not null group by provider, provider_payment_id having count(*) > 1`,
      duplicateCarts:
        await db`select customer_id, count(*)::integer as count from carts group by customer_id having count(*) > 1`,
      orderStatuses:
        await db`select status, payment_status, count(*)::integer as count from orders group by status, payment_status order by status, payment_status`,
      paymentStatuses:
        await db`select status, count(*)::integer as count from payments group by status order by status`,
      inventoryTotals:
        await db`select coalesce(sum(available_quantity),0)::integer as available, coalesce(sum(reserved_quantity),0)::integer as reserved, count(*) filter (where available_quantity < 0 or reserved_quantity < 0)::integer as invalid from inventories`,
      checkoutColumns:
        await db`select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name in ('orders','payments','carts','inventories','product_variants') and column_name in ('checkout_key','checkout_request_hash','payment_expires_at','stock_state','resolution_status','version','price') order by table_name, column_name`,
    };
    console.log(JSON.stringify(checks, null, 2));
  } finally {
    await db.end({ timeout: 1 });
  }
}
main().catch((error: unknown) => {
  console.error("Checkout preflight failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: (error as { code?: string })?.code,
  });
  process.exitCode = 1;
});
