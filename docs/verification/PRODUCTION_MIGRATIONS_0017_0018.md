# Production migrations 0017 and 0018

**CLASSIFICATION: PRODUCTION DATABASE MIGRATION VERIFIED**

Verified 8 October 2026, approximately 00:24 IST. **PRODUCTION DATABASE MIGRATION GATE PASSED.**

## A. Pre-migration state

The production target was confirmed by matching the existing baseline DATABASE_URL host, port, database and user against the live Cloudflare Hyperdrive origin, and matching that Hyperdrive ID against the live `ecommerce-api` Worker binding. Direct PostgreSQL identity checks confirmed `defaultdb`, user `avnadmin`, server port `14805`, and TLS enabled.

- Aiven host: `ownline-ecommerce-ownline-ecommerce.i.aivencloud.com`
- Hyperdrive: `0c6bae39855446449b1276eecf3dd4d3`, `ecommerce-db`
- Immediately before migration: 17 records, corresponding to 0000 through 0016, with increasing journal timestamps and record IDs. Every recorded hash matched the corresponding repository migration (Git LF or unchanged Windows CRLF checkout representation).
- Only pending migrations: `0017_admin_initial_credentials.sql`, `0018_admin_bank_verification.sql`.
- Exactly 19 SQL files and journal entries existed. All migration SQL matched Git HEAD after accounting for checkout line endings; neither migration files nor schema files were edited. The two new migrations matched HEAD byte for byte.
- New tables were absent. Existing shipping foreign keys were present, validated, and matched the replacement definitions. PostgreSQL's 63-byte identifier truncation accounts for the existing catalog names.

Earlier preflight attempts encountered an expired Cloudflare token, a raw LF/CRLF comparison mismatch, and an audit assertion that initially omitted PostgreSQL identifier truncation. These checks stopped before any migration. Existing Wrangler authentication refreshed successfully; corrected read-only checks passed. No schema drift or SQL modification was needed.

## B. Migration execution

Mechanism: existing backend `npm run migrate`, which invokes `drizzle-kit migrate` using `drizzle.config.ts`. The existing production DATABASE_URL was explicitly supplied to the child process to prevent the local development override from winning. `ALLOW_REMOTE_MIGRATION=1` enabled the repository's approved remote-migration guard for this process only. No production secret was modified.

The installed Drizzle PostgreSQL migrator consults `drizzle.__drizzle_migrations`, selects pending migrations by increasing journal timestamp, and applies pending SQL plus journal inserts in a transaction.

- 0017: applied successfully, directly confirmed by record ID 18 and its matching timestamp/hash.
- 0018: applied successfully, directly confirmed by record ID 19 and its matching timestamp/hash.
- Tool exit code: 0.
- Tool terminal result: `[✓] migrations applied successfully!`
- Tool stderr: empty. Node emitted a launcher deprecation warning about `shell: true`; the invoked command and arguments were fixed literals.
- No migration was retried; no manual SQL execution, reset, push, or recovery was used.

The exact migration tool stdout/stderr, including terminal control characters, is preserved in the JSON evidence under `execution`. Drizzle emits a combined success message; individual migration success is established by direct journal and catalog evidence.

## C. Post-migration state

Direct Aiven evidence confirms 19 records, 0000 through 0018 present, correct ordering, and no remaining pending migration. All prior records retained their IDs, hashes and timestamps.

| Migration | Record ID | Journal timestamp | SHA-256 |
|---|---:|---:|---|
| 0017 | 18 | 1791220656127 | `3212b618af9d4ef9c6a0bcf5ab28b942fab657a9d76467556205dcdeea6b63b6` |
| 0018 | 19 | 1791221082316 | `090916c3d28a2a68943dfa6cb1cb9365aeba7048d75f42dfd0595bdea57a1e1d` |

## D. New schema objects

All objects below were verified directly from PostgreSQL catalogs, including column types, nullability, defaults, primary keys, and validated foreign-key definitions. Foreign keys use the SQL's default NO ACTION behavior.

0017 creates `public.admin_credentials`:

| Column | Type | Nullability | Default |
|---|---|---|---|
| admin_id | uuid | NOT NULL, primary key | none |
| must_change_password | boolean | NOT NULL | true |
| provisioned_by_user_id | text | NOT NULL | none |
| created_at | timestamp without time zone | NOT NULL | now() |
| password_changed_at | timestamp without time zone | nullable | none |

Constraints: `admin_credentials_pkey`; `admin_credentials_admin_id_admins_id_fk` references `admins(id)`; `admin_credentials_provisioned_by_user_id_users_id_fk` references `users(id)`.

0017 also drops and recreates the shipping-provider foreign keys. Actual PostgreSQL catalog names are `shipments_provider_key_shipping_provider_configs_provider_key_f` and `shipping_provider_locations_provider_key_shipping_provider_conf`. Both reference `shipping_provider_configs(provider_key)`. Full shipping constraint metadata remained identical before and after; the longer original SQL names already truncate to these same names.

0018 creates `public.admin_bank_accounts`:

| Column | Type | Nullability | Default |
|---|---|---|---|
| admin_id | uuid | NOT NULL, primary key | none |
| encrypted_details | text | NOT NULL | none |
| account_last4 | text | NOT NULL | none |
| status | text | NOT NULL | 'PENDING' |
| revision | uuid | NOT NULL | gen_random_uuid() |
| reviewed_by_user_id | text | nullable | none |
| reviewed_at | timestamp without time zone | nullable | none |
| review_notes | text | nullable | none |
| updated_at | timestamp without time zone | NOT NULL | now() |

Constraints: `admin_bank_accounts_pkey`; `admin_bank_accounts_admin_id_admins_id_fk` references `admins(id)`; `admin_bank_accounts_reviewed_by_user_id_users_id_fk` references `users(id)`.

Both new tables contain zero rows. No backfill or fixture records were created.

## E. Existing production data safety

| Check | Before | After |
|---|---:|---:|
| Admins | 1 | 1 |
| Super Admin users | 1 | 1 |
| Customer-role users | 3 | 3 |
| All users | 5 | 5 |
| Products | 2 | 2 |
| Orders | 0 | 0 |
| Inventory rows | 2 | 2 |
| Available quantity total | 12 | 12 |
| Reserved quantity total | 0 | 0 |
| Inventory version sum | 1 | 1 |

Super Admin account-state and complete inventory-row fingerprints matched. Before/after aggregate row counts and fingerprints also matched for admins, users, user_roles, products, product_variants, orders, order_items, payments, payout_requests, admin_settlements, shipments, and shipping_provider_locations. These are read-only aggregate comparisons; no personal data or credentials are included in the report. This establishes preservation for the checked state, not a claim that every database table was independently audited.

## F. Worker compatibility

Direct anonymous GET requests to `https://ecommerce-api.ownlinedropshipping.workers.dev` after the migrations:

| Endpoint | Status | Result |
|---|---:|---|
| /health | 200 | status ok |
| /health/db | 200 | database connected; result ok=1 |
| /api/me | 401 | Unauthorized |

No cookies or authentication were supplied. No authenticated mutations or provider calls were performed.

## G. Production mutation boundary

| Action | Performed |
|---|---|
| Migration applied | YES — only 0017 and 0018 |
| Application/business data intentionally modified | NO |
| Fixture data created | NO |
| Customer created | NO |
| Admin created | NO |
| Product created | NO |
| Order created | NO |
| Inventory modified | NO |
| Payment modified | NO |
| Payout performed | NO |
| Shipment created | NO |
| Worker redeployed | NO |
| Frontend deployed | NO |
| Production secrets modified | NO |
| Cron enabled | NO |
| Cashfree or Shiprocket called | NO |

Live Worker schedules were read and confirmed empty immediately before migration. No scheduler activation or deployment command was run. Migration journal inserts and authorized schema DDL are the only intentional production writes.

## H. Evidence boundary and next gate

- Direct Aiven production evidence: target/session identity, migration journal before and after, schema metadata, aggregate counts and state fingerprints.
- Direct production Worker/Cloudflare evidence: live Worker Hyperdrive binding and origin, empty schedules, post-migration endpoint responses.
- Repository evidence: SQL enumeration/content, journal ordering, Git HEAD comparisons, package script/configuration and installed migrator behavior.
- Not verified: authenticated Admin, Super Admin or Customer workflows; production Pages end-to-end behavior; live payment/shipping provider workflows; broader commerce launch readiness.

Raw evidence: [PRODUCTION_MIGRATIONS_0017_0018.json](PRODUCTION_MIGRATIONS_0017_0018.json). Credentials were read only from existing local configuration and never printed or written into evidence. No application code, migration SQL, schema, deployment configuration, or existing user changes were edited. The temporary local audit runner was removed after execution.

**ONE next dependency-safe task: PRODUCTION AUTHENTICATED ADMIN + SUPER ADMIN + CUSTOMER END-TO-END VERIFICATION**, using the already-deployed Worker and Pages application. Cashfree and Shiprocket remain separate live-provider gates.
