import { and, eq, isNull, ne } from "drizzle-orm";
import type { createDb } from "../../db";
import { orders, payments } from "../../db/schema/orders";
import { shipments, shippingOperations } from "../../db/schema/shipping";
import { DomainError } from "../admin/admin.service";
import { requireFulfillmentEligible } from "../order-eligibility";
import { ShippingProviderRejection } from "./shipping-provider";

type Db = ReturnType<typeof createDb>["db"];
export type ShippingOperation = typeof shippingOperations.$inferSelect;
export const retryAt = () => new Date(Date.now() + 5 * 60_000);
export const operationValues = (
  shipment: typeof shipments.$inferSelect,
  kind: string,
  actor: string,
) => ({
  operationKey: `${shipment.id}:${kind}`,
  shipmentId: shipment.id,
  providerKey: shipment.providerKey,
  providerReference:
    kind === "CREATE" ? shipment.id : shipment.providerShipmentId!,
  kind,
  actor,
  lastAttemptedAt: new Date(),
  nextRetryAt: retryAt(),
});

// The unique key is permanent. Neither lease expiry nor UNKNOWN authorizes a new mutation.
export async function claimShippingOperation(
  db: Db,
  shipmentId: string,
  adminId: string,
  providerKey: string,
  kind: "AWB" | "PICKUP",
) {
  return db.transaction(async (tx) => {
    const [ref] = await tx
      .select()
      .from(shipments)
      .where(
        and(
          eq(shipments.id, shipmentId),
          eq(shipments.adminId, adminId),
          eq(shipments.providerKey, providerKey),
        ),
      );
    if (!ref) throw new DomainError("Shipment unavailable", 404);
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, ref.orderId))
      .for("update");
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, ref.orderId))
      .for("update");
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.id, shipmentId))
      .for("update");
    if (
      (kind === "AWB" && shipment.awbNumber) ||
      (kind === "PICKUP" && shipment.pickupRequestedAt)
    )
      return { shipment };
    const [existing] = await tx
      .select()
      .from(shippingOperations)
      .where(eq(shippingOperations.operationKey, `${shipmentId}:${kind}`));
    if (existing)
      throw new DomainError(
        `Shipping operation ${existing.state}; reconciliation required`,
        409,
      );
    requireFulfillmentEligible(order, payment);
    if (["DELIVERED", "RTO", "CANCELLED"].includes(shipment.status))
      throw new DomainError("Shipment is terminal", 409);
    if (!shipment.providerShipmentId)
      throw new DomainError("Provider shipment unavailable", 404);
    if (kind === "PICKUP" && !shipment.awbNumber)
      throw new DomainError("AWB assignment required", 422);
    const [operation] = await tx
      .insert(shippingOperations)
      .values(operationValues(shipment, kind, adminId))
      .onConflictDoNothing()
      .returning();
    if (!operation) throw new DomainError("Shipping operation pending", 409);
    return { shipment, operation };
  });
}

export async function runShippingMutation<T extends Record<string, unknown>>(
  db: Db,
  operation: ShippingOperation,
  mutate: () => Promise<T>,
  persist: (evidence: T) => Promise<unknown>,
) {
  let evidence: T;
  try {
    evidence = await mutate();
  } catch (error) {
    await db
      .update(shippingOperations)
      .set({
        state:
          error instanceof ShippingProviderRejection ? "FAILED" : "UNKNOWN",
        lastError:
          error instanceof ShippingProviderRejection
            ? "PROVIDER_REJECTED"
            : "PROVIDER_OUTCOME_UNKNOWN",
        nextRetryAt:
          error instanceof ShippingProviderRejection ? null : retryAt(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shippingOperations.id, operation.id),
          isNull(shippingOperations.evidence),
          ne(shippingOperations.state, "SUCCEEDED"),
        ),
      );
    throw error;
  }
  // Commit bounded, normalized evidence before applying local state. If this write also fails,
  // the original claim survives and requires externally verified evidence, never a replay.
  if (JSON.stringify(evidence).length > 2048)
    throw new DomainError("Provider evidence exceeds operation limit", 422);
  const [saved] = await db
    .update(shippingOperations)
    .set({
      evidence,
      state: "UNKNOWN",
      lastError: "LOCAL_APPLY_PENDING",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(shippingOperations.id, operation.id),
        isNull(shippingOperations.evidence),
        ne(shippingOperations.state, "SUCCEEDED"),
      ),
    )
    .returning();
  if (!saved)
    throw new DomainError(
      "Operation already has evidence; reconciliation required",
      409,
    );
  await persist(evidence);
  await db
    .update(shippingOperations)
    .set({
      state: "SUCCEEDED",
      resolvedAt: new Date(),
      nextRetryAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(shippingOperations.id, operation.id));
}
