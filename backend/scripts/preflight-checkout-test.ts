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
      const [identity] = await tx`select current_database() as database_name, current_user as role_name`;
      if (identity.database_name !== "ownline_checkout_test" || identity.role_name !== "postgres") throw new Error("Connected database identity is not the dedicated checkout test database");
      const [tables] = await tx`select count(*)::integer as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
      const [presence] = await tx`select to_regclass('public.orders') is not null as orders, to_regclass('public.payments') is not null as payments, to_regclass('public.carts') is not null as carts, to_regclass('public.inventories') is not null as inventories, to_regclass('drizzle.__drizzle_migrations') is not null as migration_history`;
      const [migration] = presence.migration_history ? await tx`select count(*)::integer as count from drizzle.__drizzle_migrations` : [{ count: 0 }];
      const [orders] = presence.orders ? await tx`select count(*)::integer as count from orders` : [{ count: 0 }];
      const [payments] = presence.payments ? await tx`select count(*)::integer as count from payments` : [{ count: 0 }];
      const [carts] = presence.carts ? await tx`select count(*)::integer as count from carts` : [{ count: 0 }];
      const [inventories] = presence.inventories ? await tx`select count(*)::integer as count, coalesce(sum(available_quantity),0)::integer as available, coalesce(sum(reserved_quantity),0)::integer as reserved from inventories` : [{ count: 0, available: 0, reserved: 0 }];
      const duplicatePayments = presence.payments ? await tx`select order_id, count(*)::integer as count from payments group by order_id having count(*) > 1` : [];
      const duplicateProviderOrders = presence.payments ? await tx`select provider, provider_order_id, count(*)::integer as count from payments where provider_order_id is not null group by provider, provider_order_id having count(*) > 1` : [];
      const duplicateProviderPayments = presence.payments ? await tx`select provider, provider_payment_id, count(*)::integer as count from payments where provider_payment_id is not null group by provider, provider_payment_id having count(*) > 1` : [];
      const duplicateCarts = presence.carts ? await tx`select customer_id, count(*)::integer as count from carts group by customer_id having count(*) > 1` : [];
      return { database: identity.database_name, role: identity.role_name, tables: tables.count, migrations: migration.count, orders: orders.count, payments: payments.count, carts: carts.count, inventories, conflicts: { duplicatePayments: duplicatePayments.length, duplicateProviderOrders: duplicateProviderOrders.length, duplicateProviderPayments: duplicateProviderPayments.length, duplicateCarts: duplicateCarts.length } };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.end({ timeout: 1 }); }
}
main().catch((error: unknown) => { console.error("Checkout test preflight failed", { name: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string })?.code }); process.exitCode = 1; });
