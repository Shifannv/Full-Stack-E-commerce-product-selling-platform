# Administrative concurrency checkpoint — 2026-09-30

This checkpoint describes the earlier implementation. The subsequent [Admin deletion and recovery verification](ADMIN_DELETION_RECOVERY_VERIFICATION.md) records the completed lifecycle workflow and supersedes the deletion/recovery limitation below.

## Result

The implemented Admin review, category, catalog, KYC write, invitation reissue, and suspension/recovery paths now serialize their state checks with their writes. The isolated PostgreSQL suite passes 167 tests (15 new Admin cases and 152 prior commerce cases); 67 backend regression tests pass. TypeScript, Drizzle validation, and `git diff --check` pass. No migration was needed. The Aiven/shared database was untouched. No live provider was called and nothing was deployed.

One earlier run failed the existing scheduler batch test because its expected order remained CREATED despite a successful batch result. The isolated scheduler test and subsequent full runs passed. The cause of that intermittent failure was not established; checkout behavior was not changed.

The **existing administrative concurrency paths are verified internally**. Full account deletion approval and archive/recovery remain outside this checkpoint: the architecture specifies deletion request and archive tables, but this backend has neither those tables nor an approval route. The new status route supports suspension and recovery from suspension only. It cannot recover a deleted account. The overall account deletion/recovery workflow remains a production readiness blocker.

## State and authorization protocol

- Application review locks `admins`, then `users`, checks the Admin and KYC pending states, and commits its decision, requested category activation, and actor attributed audit row together. A later review sees the committed decision and returns 409. Approval after suspension or deletion is rejected.
- Admin writes use this lock order: `admins` → `users` → category assignment → product management relationship → product → inventory. Category assignment and account status transitions take the same leading locks. Revocation and suspension therefore either follow a completed write or commit first and cause the waiting write to fail. Inventory keeps the expected version guard and row lock. `products.created_by_admin_id` remains the sale owner; `product_admins` remains the management relationship.
- The route for Super Admin status decisions accepts only `SUSPEND` and `RECOVER`, requires a reason, and uses a current state check and same transaction audit. Recovery requires an approved KYC application. `deleted_at` on either Admin or user blocks all protected Admin writes. Session middleware also rejects deleted users and treats deleted Admins as unapproved.
- Admin onboarding address, KYC, category request, submission, and Super Admin correction all take the Admin lock before checking and writing. KYC document upload rechecks eligibility in its database transaction after the private object upload and deletes the object if persistence fails. Product image upload retains its existing object cleanup on metadata failure.
- Reissue locks the pending user and Admin before removing old invitations and inserting one replacement. Activation reads the token, then takes user and Admin locks before locking and rechecking the token. This avoids a reissue/activation lock inversion. Raw tokens are never stored or audited; the existing 24 hour TTL is unchanged.

## PostgreSQL evidence

Independent database connections cover approve/reject, approve/approve, reject/reject, approve/changes, duplicate decision, rollback of decision/status/category/audit, approval/suspension, category assignment races, revocation versus product and inventory writes, suspension versus catalog write, deleted Admin and user guards, recovery versus deletion, and concurrent invitation reissue. Lock barrier tests use `pg_blocking_pids` to prove a protected write waits and rejects after committed revocation or suspension; no sleeps are used. Exactly one review audit row is asserted, with the actor and winning decision. Revoked writes leave inventory and catalog state unchanged.

The account deletion tests exercise the existing `deleted_at` guard using an isolated test transaction. They do not validate a deletion approval business workflow, because none exists in the current schema or routes.
