import { Hono } from "hono";
import { createDb } from "../../db";
import {
  requireAuth,
  type AuthorizedEnv,
} from "../../middleware/authorization";
import {
  DomainError,
  getAdminId,
  requiredText,
} from "../../services/admin/admin.service";
import { CashfreeRefundAdapter } from "../../services/returns/cashfree-refund.adapter";
import {
  authorizeRefund,
  decideReturn,
  getReturn,
  inspectReturn,
  markReturnReceived,
  requestReturn,
  returnWindowDays,
  submitRefund,
} from "../../services/returns/return.service";

type ReturnEnv = AuthorizedEnv & {
  Bindings: AuthorizedEnv["Bindings"] & {
    RETURN_WINDOW_DAYS?: string;
    CASHFREE_CLIENT_ID?: string;
    CASHFREE_CLIENT_SECRET?: string;
    CASHFREE_ENVIRONMENT?: string;
  };
};
export const returnRoutes = new Hono<ReturnEnv>();
returnRoutes.use("*", requireAuth);

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
async function body(c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("Invalid JSON body", 422);
  return value as Record<string, unknown>;
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
function owner(actor: { roles: string[] }) {
  if (!actor.roles.includes("SUPER_ADMIN"))
    throw new DomainError("Forbidden", 403);
}

returnRoutes.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json({ error: error.message }, error.status);
  console.error("Return API failed", {
    name: error.name,
    code: (error as { code?: string }).code,
  });
  return c.json({ error: "Return operation unavailable" }, 503);
});

returnRoutes.post("/returns", async (c) => {
  const v = await body(c);
  const itemId = requiredText(v.orderItemId, "orderItemId", 40);
  const quantity = v.quantity;
  if (typeof quantity !== "number")
    throw new DomainError("Invalid quantity", 422);
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    requestReturn(
      db,
      c.get("actor").userId,
      itemId,
      quantity,
      requiredText(v.reason, "reason", 500),
      typeof v.customerNotes === "string" ? v.customerNotes : null,
      returnWindowDays(c.env.RETURN_WINDOW_DAYS),
    ),
  );
  return c.json({ id: result.id, status: result.status }, 201);
});

returnRoutes.get("/returns/:returnId", async (c) => {
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      getReturn(db, c.req.param("returnId"), c.get("actor"), "customer"),
    ),
  );
});

returnRoutes.get("/admin/returns/:returnId", async (c) => {
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      getReturn(db, c.req.param("returnId"), c.get("actor"), "admin"),
    ),
  );
});

returnRoutes.post("/admin/returns/:returnId/decision", async (c) => {
  seller(c.get("actor"));
  const v = await body(c);
  if (typeof v.approve !== "boolean")
    throw new DomainError("approve must be a boolean", 422);
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
      decideReturn(
        db,
        c.req.param("returnId"),
        await getAdminId(db, c.get("actor").userId),
        v.approve as boolean,
        requiredText(v.notes, "notes", 1000),
      ),
    ),
  );
});

returnRoutes.post("/admin/returns/:returnId/received", async (c) => {
  seller(c.get("actor"));
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
      markReturnReceived(
        db,
        c.req.param("returnId"),
        await getAdminId(db, c.get("actor").userId),
      ),
    ),
  );
});

returnRoutes.post("/admin/returns/:returnId/inspection", async (c) => {
  seller(c.get("actor"));
  const v = await body(c);
  if (v.decision !== "APPROVED" && v.decision !== "REJECTED")
    throw new DomainError("Invalid decision", 422);
  return c.json(
    await withDb(c.env.HYPERDRIVE.connectionString, async (db) =>
      inspectReturn(
        db,
        c.req.param("returnId"),
        await getAdminId(db, c.get("actor").userId),
        v.decision as "APPROVED" | "REJECTED",
        requiredText(v.conditionStatus, "conditionStatus", 100),
        typeof v.packagingStatus === "string"
          ? v.packagingStatus.slice(0, 100)
          : null,
        requiredText(v.notes, "notes", 2000),
      ),
    ),
  );
});

returnRoutes.post(
  "/super-admin/returns/:returnId/refund/authorize",
  async (c) => {
    owner(c.get("actor"));
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        authorizeRefund(db, c.req.param("returnId"), c.get("actor").userId),
      ),
    );
  },
);

returnRoutes.post("/super-admin/returns/:returnId/refund/submit", async (c) => {
  owner(c.get("actor"));
  const env = c.env;
  if (
    !env.CASHFREE_CLIENT_ID ||
    !env.CASHFREE_CLIENT_SECRET ||
    !env.CASHFREE_ENVIRONMENT
  )
    throw new DomainError("Cashfree refund credentials are unavailable", 409);
  const provider = new CashfreeRefundAdapter(
    env.CASHFREE_CLIENT_ID,
    env.CASHFREE_CLIENT_SECRET,
    env.CASHFREE_ENVIRONMENT,
  );
  const result = await withDb(env.HYPERDRIVE.connectionString, (db) =>
    submitRefund(db, c.req.param("returnId"), provider, c.get("actor").userId),
  );
  return c.json({
    id: result.id,
    status: result.status,
    providerReference: result.providerReference,
  });
});
