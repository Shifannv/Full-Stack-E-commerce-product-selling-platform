import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
const address = { contactName: "Fixture", phone: "9999999999", line1: "Fixture Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" };

async function main() {
  try {
    const [tables] = await client`select count(*)::integer as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
    const [migrations] = await client`select count(*)::integer as count from drizzle.__drizzle_migrations`;
    const [provider] = await client`select enabled from shipping_provider_configs where provider_key = 'shiprocket'`;
    assert.ok(tables.count >= 44);
    assert.equal(migrations.count, 9);
    const [featuredColumn] = await client`select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'featured'`;
    assert.equal(featuredColumn?.is_nullable, "NO");
    assert.equal(featuredColumn?.column_default, "false");
    // Published products may now be deliberately curated by the Super Admin.
    // The NOT NULL/default check above protects the original migration contract.
    assert.equal(provider.enabled, false);
    await assert.rejects(client.begin(async (tx) => {
      const userId = `integrity-${randomUUID()}`;
      await tx`insert into users (id, name, email) values (${userId}, 'Fixture', ${`${userId}@example.invalid`})`;
      const [admin] = await tx`insert into admins (user_id, status) values (${userId}, 'ACTIVE') returning id`;
      const values = [admin.id, "SHIPPING_ORIGIN", "Fixture", "9999999999", "Fixture Lane", "Delhi", "Delhi", "110001", "IN"];
      await tx`insert into admin_addresses (admin_id,address_type,contact_name,phone,line1,city,state,postal_code,country) values (${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]})`;
      await tx`insert into admin_addresses (admin_id,address_type,contact_name,phone,line1,city,state,postal_code,country) values (${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]})`;
    }), (error: unknown) => (error as { code?: string }).code === "23505");

    await assert.rejects(client.begin(async (tx) => {
      const userId = `integrity-${randomUUID()}`;
      await tx`insert into users (id, name, email) values (${userId}, 'Fixture', ${`${userId}@example.invalid`})`;
      const [admin] = await tx`insert into admins (user_id, status) values (${userId}, 'ACTIVE') returning id`;
      const [first] = await tx`insert into categories (name, slug, status) values ('Fixture A', ${`fixture-a-${randomUUID()}`}, 'PUBLISHED') returning id`;
      const [second] = await tx`insert into categories (name, slug, status) values ('Fixture B', ${`fixture-b-${randomUUID()}`}, 'PUBLISHED') returning id`;
      const [sub] = await tx`insert into subcategories (category_id, name, slug, status) values (${first.id}, 'Fixture Sub', 'fixture-sub', 'PUBLISHED') returning id`;
      await tx`insert into products (category_id, subcategory_id, name, slug, price, created_by_admin_id) values (${second.id}, ${sub.id}, 'Invalid Product', ${`invalid-${randomUUID()}`}, 100, ${admin.id})`;
    }), (error: unknown) => (error as { code?: string }).code === "23503");

    let fixtureUserId = "";
    try {
      await client.begin(async (tx) => {
        fixtureUserId = `integrity-${randomUUID()}`;
        await tx`insert into users (id, name, email) values (${fixtureUserId}, 'Fixture', ${`${fixtureUserId}@example.invalid`})`;
        const [adminA] = await tx`insert into admins (user_id, status) values (${fixtureUserId}, 'ACTIVE') returning id`;
        const otherUserId = `integrity-${randomUUID()}`;
        await tx`insert into users (id, name, email) values (${otherUserId}, 'Fixture B', ${`${otherUserId}@example.invalid`})`;
        const [adminB] = await tx`insert into admins (user_id, status) values (${otherUserId}, 'ACTIVE') returning id`;
        const [category] = await tx`insert into categories (name, slug, status) values ('Fixture', ${`fixture-${randomUUID()}`}, 'PUBLISHED') returning id`;
        const [sub] = await tx`insert into subcategories (category_id, name, slug, status) values (${category.id}, 'Fixture Sub', 'fixture-sub', 'PUBLISHED') returning id`;
        const [productA] = await tx`insert into products (category_id, subcategory_id, name, slug, price, created_by_admin_id) values (${category.id}, ${sub.id}, 'A', ${`fixture-pa-${randomUUID()}`}, 100, ${adminA.id}) returning id, featured`;
        assert.equal(productA.featured, false);
        const [productB] = await tx`insert into products (category_id, subcategory_id, name, slug, price, created_by_admin_id) values (${category.id}, ${sub.id}, 'B', ${`fixture-pb-${randomUUID()}`}, 200, ${adminB.id}) returning id`;
        const [order] = await tx`insert into orders (order_number, customer_id, subtotal, total_amount, shipping_address_snapshot) values (${`fixture-${randomUUID()}`}, ${fixtureUserId}, 300, 300, ${JSON.stringify(address)}::jsonb) returning id`;
        const [itemA] = await tx`insert into order_items (order_id,admin_id,product_id,product_name_snapshot,unit_price,quantity,subtotal,total_amount) values (${order.id},${adminA.id},${productA.id},'A',100,1,100,100) returning id`;
        const [itemB] = await tx`insert into order_items (order_id,admin_id,product_id,product_name_snapshot,unit_price,quantity,subtotal,total_amount) values (${order.id},${adminB.id},${productB.id},'B',200,1,200,200) returning id`;
        const [shipmentA] = await tx`insert into shipments (order_id,admin_id,provider_key,origin_address_snapshot,destination_address_snapshot) values (${order.id},${adminA.id},'shiprocket',${JSON.stringify(address)}::jsonb,${JSON.stringify(address)}::jsonb) returning id`;
        const [shipmentB] = await tx`insert into shipments (order_id,admin_id,provider_key,origin_address_snapshot,destination_address_snapshot) values (${order.id},${adminB.id},'shiprocket',${JSON.stringify(address)}::jsonb,${JSON.stringify(address)}::jsonb) returning id`;
        await tx`insert into shipment_items (shipment_id,order_item_id,order_id,admin_id) values (${shipmentA.id},${itemA.id},${order.id},${adminA.id}),(${shipmentB.id},${itemB.id},${order.id},${adminB.id})`;
        const [count] = await tx`select count(*)::integer as count from shipments where order_id = ${order.id}`;
        assert.equal(count.count, 2);
        const eventKey = `fixture-${randomUUID()}`;
        const firstEvent = await tx`insert into shipment_events (shipment_id,event_key,provider_status,normalized_status,event_time) values (${shipmentA.id},${eventKey},'Delivered','DELIVERED',now()) on conflict do nothing returning id`;
        const repeatedEvent = await tx`insert into shipment_events (shipment_id,event_key,provider_status,normalized_status,event_time) values (${shipmentA.id},${eventKey},'Delivered','DELIVERED',now()) on conflict do nothing returning id`;
        assert.equal(firstEvent.length, 1);
        assert.equal(repeatedEvent.length, 0);
        const [adminAddress] = await tx`insert into admin_addresses (admin_id,address_type,contact_name,phone,line1,city,state,postal_code,country) values (${adminA.id},'SHIPPING_ORIGIN','Fixture','9999999999','Fixture Lane','Delhi','Delhi','110001','IN') returning id`;
        await tx`update admin_addresses set line1 = 'Updated Lane' where id = ${adminAddress.id}`;
        const [savedShipment] = await tx`select origin_address_snapshot from shipments where id = ${shipmentA.id}`;
        const storedOrigin = typeof savedShipment.origin_address_snapshot === "string" ? JSON.parse(savedShipment.origin_address_snapshot) : savedShipment.origin_address_snapshot;
        assert.equal(storedOrigin.line1, "Fixture Lane");
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    const [leftover] = await client`select count(*)::integer as count from users where id = ${fixtureUserId}`;
    assert.equal(leftover.count, 0);
    console.log(`Database integrity checks passed: ${tables.count} tables, ${migrations.count} migrations, disabled provider, active address uniqueness, category FK, multi-Admin shipments, event uniqueness, address snapshot, rollback`);
  } finally { await client.end({ timeout: 1 }); }
}
main().catch((error: unknown) => {
  console.error("Database integrity check failed", { name: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string } | null)?.code, at: error instanceof Error ? error.stack?.split("\n").find((line) => line.includes("verify-integrity.ts"))?.trim() : undefined });
  process.exitCode = 1;
});
