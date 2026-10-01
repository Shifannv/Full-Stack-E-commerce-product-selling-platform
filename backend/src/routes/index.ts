import type { App } from "../app-env";
import { registerHealthRoutes } from "./health";
import { registerAuthHandler, registerSessionRoute } from "./auth/auth.routes";
import { adminActivationRoutes, adminRoutes } from "./admin";
import { adminLifecycleRoutes } from "./admin/admin-lifecycle";
import { customerRoutes, publicCatalogRoutes } from "./customer/customer";
import { orderRoutes } from "./customer/orders";
import { publicReviewRoutes, reviewRoutes } from "./customer/reviews";
import { paymentRoutes } from "./customer/payments";
import { returnRoutes } from "./customer/returns";
import { financeRoutes } from "./super-admin/finance";
import { superAdminDashboardRoutes } from "./super-admin/dashboard";
import { reconciliationRoutes } from "./super-admin/reconciliation";
import { shippingRoutes } from "./super-admin/shipping";
import { webhookRoutes } from "./webhooks/shipping.webhook";
import { paymentWebhookRoutes } from "./webhooks/payments.webhook";

/**
 * Registers every route on the app.
 *
 * ORDER IS BEHAVIOR. Most routers call `use("*", requireAuth)` and are mounted at "/api", so Hono applies
 * that middleware to every /api route registered after them. Do not reorder mounts without
 * re-diffing the route table (see docs/development/REFACTORING_GUIDE.md).
 */
export function registerRoutes(app: App) {
  registerAuthHandler(app);
  registerHealthRoutes(app);
  registerSessionRoute(app);
  app.route("/api", publicCatalogRoutes);
  app.route("/api", publicReviewRoutes);
  app.route("/api/admin", adminActivationRoutes);
  app.route("/api/admin", adminLifecycleRoutes);
  app.route("/api/customer", customerRoutes);
  app.route("/api", orderRoutes);
  app.route("/api", reviewRoutes);
  app.route("/api", financeRoutes);
  app.route("/api", paymentRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/super-admin", superAdminDashboardRoutes);
  app.route("/api/super-admin", reconciliationRoutes);
  app.route("/api", shippingRoutes);
  app.route("/api", returnRoutes);
  app.route("/webhooks", webhookRoutes);
  app.route("/webhooks", paymentWebhookRoutes);
}
