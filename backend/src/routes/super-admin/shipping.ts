import { Hono } from "hono";
import { createDb } from "../../db";
import {
  requireAuth,
  type AuthorizedEnv,
} from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { getAdminId } from "../../services/admin/admin.service";
import {
  assignShipmentAwb,
  createForwardShipment,
  getOrderTracking,
  requestShipmentPickup,
} from "../../services/shipping/shipping.service";
import { getShiprocketAdapter } from "../../services/shipping/providers/shiprocket.adapter";
import { readBoundedBody } from "../../lib/security/body";
import { auditedMutation } from "../../services/security-audit";
import {
  listShippingOperations,
  recordShippingOperationEvidence,
  retryShippingOperationReconciliation,
  runShippingReconciliationBatch,
} from "../../services/shipping/shipping.service";

type ShippingEnv = AuthorizedEnv & {
  Bindings: AuthorizedEnv["Bindings"] & {
    SHIPPING_PROVIDER?: string;
    SHIPROCKET_API_EMAIL?: string;
    SHIPROCKET_API_PASSWORD?: string;
    SHIPROCKET_API_BASE_URL?: string;
    SHIPROCKET_WEBHOOK_TOKEN?: string;
  };
};
export const shippingRoutes = new Hono<ShippingEnv>();

async function withDb<T>(
  connectionString: string,
  action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
): Promise<T> {
  const { client, db } = createDb(connectionString);
  try {
    return await action(db);
  } finally {
    await client.end({ timeout: 1 });
  }
}
function seller(actor: {
  roles: string[];
  permissions: string[];
  adminApproved: boolean;
}) {
  if (
    !actor.roles.includes("ADMIN") ||
    !actor.adminApproved ||
    !actor.permissions.includes("orders.update")
  )
    throw new DomainError("Forbidden", 403);
}
function provider(env: ShippingEnv["Bindings"]) {
  if (env.SHIPPING_PROVIDER !== "shiprocket")
    throw new DomainError("Shipping provider unavailable", 409);
  if (!env.SHIPROCKET_API_EMAIL || !env.SHIPROCKET_API_PASSWORD)
    throw new DomainError("Shipping provider credentials unavailable", 409);
  return getShiprocketAdapter(
    env.SHIPROCKET_API_EMAIL,
    env.SHIPROCKET_API_PASSWORD,
    env.SHIPROCKET_API_BASE_URL,
  );
}

const onError = (
  error: Error,
  c: Parameters<Parameters<typeof shippingRoutes.onError>[0]>[1],
) => {
  if (error instanceof DomainError)
    return c.json({ error: error.message }, error.status);
  console.error("Shipping API failed", {
    name: error.name,
    code: (error as { code?: string }).code,
  });
  return c.json({ error: "Shipping operation unavailable" }, 503);
};
shippingRoutes.onError(onError);

shippingRoutes.use("/super-admin/shipping/*", requireAuth, async (c, next) => {
  if (!c.get("actor").roles.includes("SUPER_ADMIN"))
    throw new DomainError("Forbidden", 403);
  const id = c.req.param("id");
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new DomainError("Invalid operation ID", 422);
  await next();
});
shippingRoutes.get("/super-admin/shipping/operations", async (c) => {
  const after = c.req.query("after");
  if (
    after &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      after,
    )
  )
    throw new DomainError("Invalid cursor", 422);
  return c.json({
    operations: await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      listShippingOperations(db, after),
    ),
  });
});
shippingRoutes.post("/super-admin/shipping/reconcile", async (c) =>
  c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      runShippingReconciliationBatch(db),
    ),
  ),
);
shippingRoutes.post("/super-admin/shipping/operations/:id/retry", async (c) =>
  c.json({
    operation: await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      auditedMutation(
        db,
        c.get("actor").userId,
        "shipping.reconciliation.retry",
        "shipping_operation",
        (tx) =>
          retryShippingOperationReconciliation(
            tx as never,
            c.req.param("id"),
            c.get("actor").userId,
          ),
        (result) => result.id,
      ),
    ),
  }),
);
shippingRoutes.post(
  "/super-admin/shipping/operations/:id/evidence",
  async (c) => {
    const raw = new TextDecoder().decode(
      await readBoundedBody(c.req.raw, 4096),
    );
    let body: { providerReference?: unknown; evidence?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new DomainError("Invalid evidence", 422);
    }
    if (
      !body ||
      typeof body.providerReference !== "string" ||
      !body.evidence ||
      typeof body.evidence !== "object" ||
      Array.isArray(body.evidence)
    )
      throw new DomainError("Invalid evidence", 422);
    return c.json({
      operation: await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        auditedMutation(
          db,
          c.get("actor").userId,
          "shipping.reconciliation.evidence",
          "shipping_operation",
          (tx) =>
            recordShippingOperationEvidence(
              tx as never,
              c.req.param("id"),
              body.providerReference as string,
              body.evidence as Record<string, unknown>,
              c.get("actor").userId,
            ),
          (result) => result.id,
        ),
      ),
    });
  },
);

shippingRoutes.get("/orders/:orderId/tracking", requireAuth, async (c) => {
  const tracking = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    getOrderTracking(db, c.req.param("orderId"), c.get("actor"), "customer"),
  );
  return c.json({ shipments: tracking });
});

shippingRoutes.get(
  "/admin/orders/:orderId/tracking",
  requireAuth,
  async (c) => {
    const tracking = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      getOrderTracking(db, c.req.param("orderId"), c.get("actor"), "admin"),
    );
    return c.json({ shipments: tracking });
  },
);

shippingRoutes.post(
  "/admin/orders/:orderId/shipments",
  requireAuth,
  async (c) => {
    seller(c.get("actor"));
    const v = (await c.req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new DomainError("Invalid JSON body", 422);
    const measurement = (key: string): number => {
      const value = v[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        throw new DomainError(`Invalid ${key}`, 422);
      return value;
    };
    const pkg = {
      weightKg: measurement("weightKg"),
      lengthCm: measurement("lengthCm"),
      breadthCm: measurement("breadthCm"),
      heightCm: measurement("heightCm"),
    };
    const result = await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
      createForwardShipment(
        db,
        provider(c.env),
        c.req.param("orderId"),
        await getAdminId(db, c.get("actor").userId),
        pkg,
      ),
    );
    return c.json(
      {
        shipmentId: result.id,
        status: result.status,
        providerShipmentId: result.providerShipmentId,
      },
      201,
    );
  },
);

shippingRoutes.post(
  "/admin/shipments/:shipmentId/awb",
  requireAuth,
  async (c) => {
    seller(c.get("actor"));
    const result = await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
      assignShipmentAwb(
        db,
        provider(c.env),
        c.req.param("shipmentId"),
        await getAdminId(db, c.get("actor").userId),
      ),
    );
    return c.json({
      shipmentId: result.id,
      awbNumber: result.awbNumber,
      carrierName: result.carrierName,
      status: result.status,
    });
  },
);

shippingRoutes.post(
  "/admin/shipments/:shipmentId/pickup",
  requireAuth,
  async (c) => {
    seller(c.get("actor"));
    const result = await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
      requestShipmentPickup(
        db,
        provider(c.env),
        c.req.param("shipmentId"),
        await getAdminId(db, c.get("actor").userId),
      ),
    );
    return c.json({
      shipmentId: result.id,
      pickupRequestedAt: result.pickupRequestedAt,
    });
  },
);
