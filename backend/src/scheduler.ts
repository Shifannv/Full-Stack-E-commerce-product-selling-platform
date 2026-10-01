import { createDb } from "./db";
import type { AuthBindings } from "./lib/auth/auth";
import { runDueOrderExpiryBatch } from "./services/unpaid-expiry.service";
import { runShippingReconciliationBatch } from "./services/shipping/shipping.service";
import { runReconciliationBatch } from "./services/reconciliation.service";

export async function scheduled(_controller: unknown, env: AuthBindings) {
  const { db, client } = createDb(env.HYPERDRIVE.connectionString);
  try {
    const results = await Promise.allSettled([runDueOrderExpiryBatch(db), runShippingReconciliationBatch(db), runReconciliationBatch(db)]);
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  finally { await client.end({ timeout: 1 }); }
}
