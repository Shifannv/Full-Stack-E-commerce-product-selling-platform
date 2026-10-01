import { Hono } from "hono";
import { requireAuth } from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import type { AdminEnv } from "./shared";
import { registerOnboardingRoutes } from "./onboarding";
import { registerReviewRoutes } from "./review";
import { registerProductRoutes } from "./products";
import { registerCatalogRoutes } from "./catalog";
import { registerShippingConfigRoutes } from "./shipping";

export { adminActivationRoutes } from "./activation";

// One router, one requireAuth, one error handler: handler registration order is the original admin.ts order.
export const adminRoutes = new Hono<AdminEnv>();

adminRoutes.use("*", requireAuth);

adminRoutes.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  console.error("Admin API failed", { name: error.name, code: (error as { code?: string }).code });
  return c.json({ error: "Admin operation unavailable" }, 503);
});

registerOnboardingRoutes(adminRoutes);
registerReviewRoutes(adminRoutes);
registerProductRoutes(adminRoutes);
registerCatalogRoutes(adminRoutes);
registerShippingConfigRoutes(adminRoutes);
