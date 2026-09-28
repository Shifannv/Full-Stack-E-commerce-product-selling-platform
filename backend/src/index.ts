import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import { createDb } from "./db";
import { createAuth, type AuthBindings } from "./lib/auth/auth";
import { requireAuth, type Actor } from "./middleware/authorization";
import { adminRoutes } from "./routes/admin";
import { superAdminDashboardRoutes } from "./routes/super-admin-dashboard";
import { invitationRoutes } from "./routes/invitations";
import { shippingRoutes, webhookRoutes } from "./routes/shipping";
import { returnRoutes } from "./routes/returns";
import { customerRoutes, publicCatalogRoutes } from "./routes/customer";
import { orderRoutes } from "./routes/orders";
import { publicReviewRoutes, reviewRoutes } from "./routes/reviews";
import { financeRoutes } from "./routes/finance";
import { paymentRoutes, paymentWebhookRoutes } from "./routes/payments";

const app = new Hono<{ Bindings: AuthBindings; Variables: { actor: Actor } }>();

app.use("/api/*", cors({
  origin: (origin, c) => origin === c.env.FRONTEND_ORIGIN ? origin : undefined,
  credentials: true,
}));

app.all("/api/auth/*", async (c) => {
  let client: ReturnType<typeof createAuth>["client"] | undefined;
  try {
    const connection = createAuth(c.env);
    client = connection.client;
    return await connection.auth.handler(c.req.raw);
  } catch (error) {
    console.error("Authentication request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: (error as { code?: string } | null)?.code,
    });
    return c.json({ error: "Authentication unavailable" }, 503);
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }
});

app.get("/health", (c) => {
  return c.json({
    status: "ok",
  });
});

app.get("/health/db", async (c) => {
  let client: ReturnType<typeof createDb>["client"] | undefined;
  try {
    const connection = createDb(c.env.HYPERDRIVE.connectionString);
    client = connection.client;
    const { db } = connection;
    const result = await db.execute(sql`SELECT 1 AS ok`);

    return c.json({
      status: "ok",
      database: "connected",
      result: result[0],
    });
  } catch (error) {
    // Driver errors can contain connection details. Log only safe diagnostics.
    console.error("Database health check failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: (error as { code?: string } | null)?.code,
    });

    return c.json(
      {
        status: "error",
        database: "disconnected",
      },
      500,
    );
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }
});

app.get("/api/me", requireAuth, (c) => c.json(c.get("actor")));
app.route("/api", publicCatalogRoutes);
app.route("/api", publicReviewRoutes);
app.route("/api/customer", customerRoutes);
app.route("/api", orderRoutes);
app.route("/api", reviewRoutes);
app.route("/api", financeRoutes);
app.route("/api", paymentRoutes);
app.route("/api", invitationRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/super-admin", superAdminDashboardRoutes);
app.route("/api", shippingRoutes);
app.route("/api", returnRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/webhooks", paymentWebhookRoutes);

export default app;
