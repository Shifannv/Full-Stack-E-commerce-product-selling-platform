// READ-ONLY Aiven production migration lineage preflight
// NO writes, NO DDL, NO DML mutations.
import postgres from "postgres";

// Target comes from the environment so no credential is ever committed.
// Usage: AIVEN_PREFLIGHT_URL=<read-only connection string> node scripts/aiven_lineage_preflight.mjs
const DB = process.env.AIVEN_PREFLIGHT_URL;
if (!DB) {
  console.error("AIVEN_PREFLIGHT_URL is not set. Refusing to run.");
  process.exit(1);
}

const sql = postgres(DB, { max: 1, fetch_types: false, ssl: "require" });

async function run() {
  try {
    // ── 1. Drizzle migration journal on Aiven ──────────────────────────────
    console.log("\n=== PART 1: DRIZZLE MIGRATION JOURNAL ===");
    const journalTableExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ) AS exists`;
    console.log("drizzle.__drizzle_migrations exists:", journalTableExists[0].exists);

    if (journalTableExists[0].exists) {
      const journal = await sql`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at ASC, id ASC`;
      console.log(`Total migration journal entries: ${journal.length}`);
      console.log("Journal entries:");
      journal.forEach((r, i) => console.log(`  [${i}] id=${r.id} hash=${r.hash} created_at=${r.created_at}`));
    }

    // ── 2. public schema drizzle table (alternative location) ──────────────
    const publicDrizzle = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
      ) AS exists`;
    console.log("public.__drizzle_migrations exists:", publicDrizzle[0].exists);

    // Check drizzle schema existence at all
    const drizzleSchema = await sql`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'drizzle'`;
    console.log("drizzle schema exists:", drizzleSchema.length > 0);

    // ── 3. List ALL tables in public schema ────────────────────────────────
    console.log("\n=== PART 2: ALL PUBLIC TABLES ===");
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`;
    console.log("Public tables:", tables.map(r => r.table_name).join(", "));

    // ── 4. Check specific tables for 0000-0008 migrations ─────────────────
    console.log("\n=== PART 3: KEY TABLE/COLUMN PRESENCE CHECK ===");

    // --- 0000 tables ---
    const tables0000 = ["accounts","sessions","users","verifications","admins","permissions","role_permissions","roles","user_roles"];
    for (const t of tables0000) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=${t}) AS e`;
      console.log(`  [0000] ${t}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // --- 0001 tables ---
    const tables0001 = ["admin_addresses","admin_audit_events","admin_category_assignments","admin_kyc_documents","admin_kyc_submissions","categories","category_product_fields","product_admins","products","subcategories","order_items","orders","payments","shipment_events","shipment_items","shipments","shipping_provider_configs","shipping_provider_locations","refunds","return_inspections","return_items","returns"];
    for (const t of tables0001) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=${t}) AS e`;
      console.log(`  [0001] ${t}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // --- 0002 columns on products/order_items/shipments ---
    console.log("\n--- 0002 columns ---");
    const cols0002 = [
      ["products","weight_kg"],["products","length_cm"],["products","breadth_cm"],["products","height_cm"],
      ["order_items","weight_kg_snapshot"],["order_items","length_cm_snapshot"],["order_items","breadth_cm_snapshot"],["order_items","height_cm_snapshot"],
      ["shipments","last_event_at"]
    ];
    for (const [t, c] of cols0002) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${t} AND column_name=${c}) AS e`;
      console.log(`  [0002] ${t}.${c}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // --- 0003 column ---
    const col0003 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shipments' AND column_name='pickup_requested_at') AS e`;
    console.log(`\n  [0003] shipments.pickup_requested_at: ${col0003[0].e ? 'EXISTS' : 'MISSING'}`);

    // --- 0004 tables ---
    console.log("\n--- 0004 tables ---");
    const tables0004 = ["inventories","product_images","product_variants","cart_items","carts","customer_addresses","wishlist_items","review_images","reviews","admin_settlements","payout_requests","payout_settlement_items"];
    for (const t of tables0004) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=${t}) AS e`;
      console.log(`  [0004] ${t}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // --- 0005 columns ---
    console.log("\n--- 0005 columns ---");
    const cols0005 = [["order_items","variant_id"],["order_items","variant_title_snapshot"],["cart_items","variant_id"]];
    for (const [t,c] of cols0005) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${t} AND column_name=${c}) AS e`;
      console.log(`  [0005] ${t}.${c}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // --- 0006 table cashfree_webhook_events ---
    const t6 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cashfree_webhook_events') AS e`;
    console.log(`\n  [0006] cashfree_webhook_events: ${t6[0].e ? 'EXISTS' : 'MISSING'}`);

    // --- 0007 columns ---
    const c71 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='return_enabled') AS e`;
    const c72 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='delivered_at') AS e`;
    console.log(`  [0007] products.return_enabled: ${c71[0].e ? 'EXISTS' : 'MISSING'}`);
    console.log(`  [0007] orders.delivered_at: ${c72[0].e ? 'EXISTS' : 'MISSING'}`);

    // --- 0008 column products.featured ---
    const c8 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='featured') AS e`;
    console.log(`  [0008] products.featured: ${c8[0].e ? 'EXISTS' : 'MISSING'}`);

    // ── 5. 0009–0014 check columns ─────────────────────────────────────────
    console.log("\n=== PART 4: MIGRATIONS 0009-0014 COLUMN/TABLE PRESENCE ===");

    // 0009
    const cols0009 = [
      ["inventories","version"],["orders","checkout_key"],["orders","checkout_request_hash"],
      ["orders","payment_expires_at"],["orders","expired_at"],["orders","cancelled_at"],
      ["orders","stock_state"],["payments","resolution_status"],["carts","version"]
    ];
    for (const [t,c] of cols0009) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${t} AND column_name=${c}) AS e`;
      console.log(`  [0009] ${t}.${c}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // 0011
    const cols0011 = [["payments","id"]]; // adds id+order_id unique; check constraint on refunds
    const refundNotNull = await sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='refunds' AND column_name='return_id'`;
    console.log(`  [0011] refunds.return_id nullable: ${refundNotNull[0]?.is_nullable}`);

    // 0012 tables
    const tables0012 = ["admin_archives","admin_account_deletion_requests","admin_recovery_requests"];
    for (const t of tables0012) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=${t}) AS e`;
      console.log(`  [0012] ${t}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // 0013
    const t13 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='api_rate_limits') AS e`;
    console.log(`  [0013] api_rate_limits: ${t13[0].e ? 'EXISTS' : 'MISSING'}`);
    const cols0013 = [["admin_audit_events","entity_type"],["admin_audit_events","entity_id"],["admin_audit_events","metadata"]];
    for (const [t,c] of cols0013) {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=${t} AND column_name=${c}) AS e`;
      console.log(`  [0013] ${t}.${c}: ${ex[0].e ? 'EXISTS' : 'MISSING'}`);
    }

    // 0014
    const t14 = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shipping_operations') AS e`;
    console.log(`  [0014] shipping_operations: ${t14[0].e ? 'EXISTS' : 'MISSING'}`);

    // ── 6. Detail: admin_audit_events columns ──────────────────────────────
    console.log("\n=== PART 5: admin_audit_events FULL COLUMN LIST ===");
    const auditCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='admin_audit_events'
      ORDER BY ordinal_position`;
    auditCols.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default}`));

    // ── 7. Detail: orders columns ──────────────────────────────────────────
    console.log("\n=== PART 6: orders FULL COLUMN LIST ===");
    const orderCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders'
      ORDER BY ordinal_position`;
    orderCols.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default}`));

    // ── 8. Detail: payments columns ────────────────────────────────────────
    console.log("\n=== PART 7: payments FULL COLUMN LIST ===");
    const paymentCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payments'
      ORDER BY ordinal_position`;
    paymentCols.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default}`));

    // ── 9. Detail: products columns ────────────────────────────────────────
    console.log("\n=== PART 8: products FULL COLUMN LIST ===");
    const productCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='products'
      ORDER BY ordinal_position`;
    productCols.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default}`));

    // ── 10. Detail: refunds columns ────────────────────────────────────────
    console.log("\n=== PART 9: refunds FULL COLUMN LIST ===");
    const refundCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='refunds'
      ORDER BY ordinal_position`;
    refundCols.forEach(r => console.log(`  ${r.column_name}: ${r.data_type} nullable=${r.is_nullable} default=${r.column_default}`));

    // ── 11. Constraints on key tables ─────────────────────────────────────
    console.log("\n=== PART 10: KEY CONSTRAINTS ===");
    const constraints = await sql`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type, cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name AND tc.constraint_catalog = cc.constraint_catalog
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN ('orders','payments','refunds','inventories','admin_audit_events','shipping_operations','admin_settlements')
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name`;
    constraints.forEach(r => console.log(`  ${r.table_name} | ${r.constraint_type} | ${r.constraint_name}${r.check_clause ? ' | ' + r.check_clause : ''}`));

    // ── 12. Indexes on key tables ──────────────────────────────────────────
    console.log("\n=== PART 11: KEY INDEXES ===");
    const indexes = await sql`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('orders','payments','refunds','inventories','carts','shipments','admin_audit_events')
      ORDER BY tablename, indexname`;
    indexes.forEach(r => console.log(`  ${r.tablename} | ${r.indexname} | ${r.indexdef}`));

    // ── 13. Row counts to assess data risk for 0009–0014 ──────────────────
    console.log("\n=== PART 12: ROW COUNTS FOR MIGRATION SAFETY ===");
    const countTables = ["users","admins","orders","payments","shipments","shipment_items","refunds","admin_audit_events","admin_settlements","products","product_variants","inventories","carts","cart_items","shipping_provider_configs","shipping_provider_locations"];
    for (const t of countTables) {
      try {
        const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=${t}) AS e`;
        if (ex[0].e) {
          const cnt = await sql`SELECT COUNT(*) AS n FROM ${sql(t)}`;
          console.log(`  ${t}: ${cnt[0].n} rows`);
        } else {
          console.log(`  ${t}: TABLE DOES NOT EXIST`);
        }
      } catch(e) { console.log(`  ${t}: ERROR ${e.message}`); }
    }

    // ── 14. Check shipping_provider_configs for seed risk (0014 inserts data) ─
    console.log("\n=== PART 13: SHIPPING PROVIDER CONFIGS (seed risk for 0014) ===");
    try {
      const spc = await sql`SELECT provider_key, display_name, enabled FROM shipping_provider_configs ORDER BY provider_key`;
      console.log("Existing shipping_provider_configs rows:");
      spc.forEach(r => console.log(`  provider_key=${r.provider_key} display_name=${r.display_name} enabled=${r.enabled}`));
      if (spc.length === 0) console.log("  (none)");
    } catch(e) { console.log("  shipping_provider_configs does not exist or cannot be read:", e.message); }

    // 0014 has INSERT INTO shipping_operations? Let me check if shipments exist
    console.log("\n=== PART 14: SHIPMENTS DATA (for 0014 data migration) ===");
    try {
      const ex = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shipments') AS e`;
      if (ex[0].e) {
        const shipCount = await sql`SELECT COUNT(*) AS n FROM shipments`;
        const withProvider = await sql`SELECT COUNT(*) AS n FROM shipments WHERE provider_order_id IS NOT NULL AND provider_shipment_id IS NOT NULL`;
        const withAwb = await sql`SELECT COUNT(*) AS n FROM shipments WHERE awb_number IS NOT NULL`;
        const withPickup = await sql`SELECT COUNT(*) AS n FROM shipments WHERE pickup_requested_at IS NOT NULL`;
        console.log(`  total shipments: ${shipCount[0].n}`);
        console.log(`  with provider_order_id+provider_shipment_id: ${withProvider[0].n}`);
        console.log(`  with awb_number: ${withAwb[0].n}`);
        console.log(`  with pickup_requested_at: ${withPickup[0].n}`);
      } else {
        console.log("  shipments table does not exist");
      }
    } catch(e) { console.log("  shipments query error:", e.message); }

    // ── 15. admin_audit_events existing data (0013 UPDATE risk) ───────────
    console.log("\n=== PART 15: admin_audit_events data (0013 UPDATE risk) ===");
    try {
      const auditCount = await sql`SELECT COUNT(*) AS n FROM admin_audit_events`;
      console.log(`  admin_audit_events total rows: ${auditCount[0].n}`);
      // Check if entity_id already exists (would mean 0013 already applied)
      const entityIdEx = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_audit_events' AND column_name='entity_id') AS e`;
      console.log(`  entity_id column exists: ${entityIdEx[0].e}`);
    } catch(e) { console.log("  admin_audit_events query error:", e.message); }

    // ── 16. Check payments constraint name (0010 drops/re-adds) ───────────
    console.log("\n=== PART 16: payments_resolution_status_check constraint value ===");
    const resCheck = await sql`
      SELECT cc.check_clause FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema='public' AND tc.table_name='payments' AND tc.constraint_name='payments_resolution_status_check'`;
    if (resCheck.length > 0) {
      console.log(`  payments_resolution_status_check: ${resCheck[0].check_clause}`);
    } else {
      console.log("  payments_resolution_status_check: NOT FOUND");
    }

    // ── 17. product_variants.price nullable (changed in 0009) ─────────────
    console.log("\n=== PART 17: product_variants.price nullable ===");
    const pvPrice = await sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='product_variants' AND column_name='price'`;
    console.log(`  product_variants.price is_nullable: ${pvPrice[0]?.is_nullable}`);

    // ── 18. inventories.version column ────────────────────────────────────
    const invVer = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventories' AND column_name='version') AS e`;
    console.log(`\n  inventories.version exists: ${invVer[0].e}`);

    // ── 19. Check platform_finance_settings (0015) ─────────────────────────
    console.log("\n=== PART 18: platform_finance_settings (0015) ===");
    const pfs = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='platform_finance_settings') AS e`;
    console.log(`  platform_finance_settings exists: ${pfs[0].e}`);

    // ── 20. Check reconciliation_items (0016) ─────────────────────────────
    const ri = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reconciliation_items') AS e`;
    console.log(`  reconciliation_items exists: ${ri[0].e}`);

    // ── 21. Check existing migration records count / names ─────────────────
    console.log("\n=== PART 19: DRIZZLE SCHEMA DETAIL ===");
    const schemas = await sql`SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`;
    console.log("All schemas:", schemas.map(r=>r.schema_name).join(", "));

  } finally {
    await sql.end({ timeout: 2 });
  }
}

run().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
