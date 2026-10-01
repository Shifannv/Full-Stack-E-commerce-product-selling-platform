import { sql } from "drizzle-orm";
import type { createDb } from "../db";
import {
  expireUnpaidOrder,
  expireUnpaidOrderInTransaction,
  withTransitionRetry,
} from "./reservation.service";

type Db = ReturnType<typeof createDb>["db"];
const MAX_BATCH_SIZE = 50;
// A due order held longer than this is reported as a failed slot and retried by
// the next invocation rather than blocking the batch behind a slow transaction.
const CONTENDED_LOCK_WAIT = "2s";

function safeFailure(error: unknown) {
  const detail =
    error && typeof error === "object"
      ? (error as { name?: string; code?: string; cause?: { code?: string } })
      : {};
  return {
    name: detail.name ?? "UnknownError",
    code: detail.code ?? detail.cause?.code,
  };
}

export async function runDueOrderExpiryBatch(
  db: Db,
  options: {
    batchSize?: number;
    onFailure?: (orderId: string | null, error: unknown) => void;
  } = {},
) {
  const batchSize = options.batchSize ?? MAX_BATCH_SIZE;
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH_SIZE
  )
    throw new Error("INVALID_EXPIRY_BATCH_SIZE");
  const attemptedIds: string[] = [];
  let expired = 0,
    failed = 0;
  for (let slot = 0; slot < batchSize; slot++) {
    let candidateId: string | null = null;
    try {
      const result = await withTransitionRetry(db, async (tx) => {
        // The existing partial index covers CREATED/PENDING rows ordered by
        // payment_expires_at. Lock only one order per short transaction.
        const excluded = attemptedIds.length
          ? sql`and o.id not in (${sql.join(
              attemptedIds.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql``;
        const due = (wait: boolean) => sql`
          select o.id from orders o
          where o.status = 'CREATED' and o.payment_status = 'PENDING'
            and o.payment_expires_at <= statement_timestamp()
            and exists (select 1 from payments p where p.order_id = o.id and p.status = 'PENDING')
            ${excluded}
          order by o.payment_expires_at, o.id
          limit 1 for update of o ${wait ? sql`` : sql`skip locked`}`;
        const [skipped] = await tx.execute<{ id: string }>(due(false));
        // SKIP LOCKED keeps parallel workers moving, but an empty result cannot
        // tell an empty queue from a due order whose row is held by another
        // transaction that may still roll back, which would leave that order
        // CREATED with its reservation held. Wait for the holder under a bounded
        // timeout: PostgreSQL re-checks the predicate on the row it releases, so
        // an order the holder settled is skipped and one it abandoned is expired
        // here. The lock is still the first in the orders -> payments ->
        // inventories order, so no new wait cycle is possible.
        if (!skipped)
          await tx.execute(
            sql`select set_config('lock_timeout', ${CONTENDED_LOCK_WAIT}, true)`,
          );
        const [candidate] = skipped
          ? [skipped]
          : await tx.execute<{ id: string }>(due(true));
        if (!candidate) return null;
        candidateId = candidate.id;
        return {
          id: candidate.id,
          state: await expireUnpaidOrderInTransaction(tx, candidate.id),
        };
      });
      if (!result) break;
      attemptedIds.push(result.id);
      if (
        result.state.status === "EXPIRED" &&
        result.state.stockState === "RELEASED"
      )
        expired++;
    } catch (error) {
      failed++;
      if (candidateId) attemptedIds.push(candidateId);
      try {
        if (options.onFailure) options.onFailure(candidateId, error);
        else
          console.error("Unpaid order expiry failed", {
            orderId: candidateId,
            ...safeFailure(error),
          });
      } catch (loggingError) {
        console.error("Unpaid order expiry logging failed", {
          orderId: candidateId,
          ...safeFailure(loggingError),
        });
      }
      // A connection failure before selection cannot identify a safe next
      // candidate. The next cron invocation will retry the batch.
      if (!candidateId) break;
    }
  }
  return { attempted: attemptedIds.length, expired, failed };
}

// Detail requests use this read-only database-time probe before invoking the
// same authoritative expiry transition as the scheduled Worker.
export async function recoverDueUnpaidOrder(db: Db, orderId: string) {
  const [order] = await db.execute<{
    status: string;
    stockState: string;
    due: boolean;
  }>(sql`
    select status, stock_state as "stockState",
      (status = 'CREATED' and payment_status = 'PENDING' and payment_expires_at <= clock_timestamp()) as due
    from orders where id = ${orderId}`);
  if (!order) return null;
  if (!order.due) return { status: order.status, stockState: order.stockState };
  return expireUnpaidOrder(db, orderId);
}
