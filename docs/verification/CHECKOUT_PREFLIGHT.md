# Checkout reservation preflight

Read-only check of the configured PostgreSQL database on 2026-09-29, before migration `0009_nappy_black_queen.sql`:

| Check | Result |
| --- | ---: |
| Orders | 0 |
| Payments | 0 |
| Carts | 0 |
| Inventory rows | 1 |
| Available / reserved units | 12 / 0 |
| Duplicate payment rows per order | 0 |
| Duplicate provider order IDs | 0 |
| Duplicate provider payment IDs | 0 |
| Duplicate carts per customer | 0 |
| Negative inventory quantities | 0 |

There are no historical order, payment, or cart rows that conflict with the proposed uniqueness constraints. `product_variants.price` is currently `NOT NULL`; making it nullable is forward compatible with existing rows. The current database has not been migrated: automatic approval review rejected applying a schema change to a database whose production status is unknown. The migration SQL and Drizzle snapshot were generated and validated locally. PostgreSQL checkout tests require a dedicated database with the migration applied and `CHECKOUT_TEST_DATABASE_URL` set.
