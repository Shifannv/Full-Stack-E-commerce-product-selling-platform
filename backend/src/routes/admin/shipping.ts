import { and, eq } from "drizzle-orm";
import { shippingProviderConfigs, shippingProviderLocations } from "../../db/schema/shipping";
import { DomainError, requiredText } from "../../services/admin/admin.service";
import { getShiprocketAdapter } from "../../services/shipping/providers/shiprocket.adapter";
import { auditedMutation } from "../../services/security-audit";
import type { AdminRouter } from "./shared";
import { withDb, superAdmin, body } from "./shared";

export function registerShippingConfigRoutes(adminRoutes: AdminRouter) {
  adminRoutes.put("/shipping/providers/shiprocket", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (typeof v.enabled !== "boolean") throw new DomainError("enabled must be a boolean", 422);
    if (v.enabled) {
      const env = c.env as typeof c.env & { SHIPROCKET_API_EMAIL?: string; SHIPROCKET_API_PASSWORD?: string };
      if (!env.SHIPROCKET_API_EMAIL || !env.SHIPROCKET_API_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 422);
    }
    return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => auditedMutation(db, c.get("actor").userId, "SHIPPING_PROVIDER_CONFIGURED", "SHIPPING_PROVIDER", async (tx) => {
      const [result] = await tx.update(shippingProviderConfigs).set({ enabled: v.enabled as boolean, updatedAt: new Date() }).where(eq(shippingProviderConfigs.providerKey, "shiprocket")).returning({ providerKey: shippingProviderConfigs.providerKey, enabled: shippingProviderConfigs.enabled });
      if (!result) throw new DomainError("Shipping provider metadata unavailable", 404);
      return result;
    }, result => result.providerKey)));
  });

  adminRoutes.put("/shipping/pickup-locations", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    const adminId = requiredText(v.adminId, "adminId", 40);
    const adminAddressId = requiredText(v.adminAddressId, "adminAddressId", 40);
    const providerLocationRef = requiredText(v.providerLocationRef, "providerLocationRef", 150);
    const locationName = requiredText(v.locationName, "locationName", 150);
    return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => auditedMutation(db, c.get("actor").userId, "PICKUP_LOCATION_CONFIGURED", "PICKUP_LOCATION", async (tx) => {
      const [result] = await tx.insert(shippingProviderLocations).values({ adminId, adminAddressId, providerKey: "shiprocket", providerLocationRef, locationName })
        .onConflictDoUpdate({ target: [shippingProviderLocations.providerKey, shippingProviderLocations.adminAddressId], set: { providerLocationRef, locationName, status: "ACTIVE", updatedAt: new Date() } }).returning();
      return result;
    }, result => result.id)));
  });

  adminRoutes.get("/shipping/provider-pickups", async (c) => {
    superAdmin(c.get("actor"));
    const env = c.env as typeof c.env & { SHIPROCKET_API_EMAIL?: string; SHIPROCKET_API_PASSWORD?: string; SHIPROCKET_API_BASE_URL?: string };
    if (!env.SHIPROCKET_API_EMAIL || !env.SHIPROCKET_API_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 409);
    return c.json({ locations: await getShiprocketAdapter(env.SHIPROCKET_API_EMAIL, env.SHIPROCKET_API_PASSWORD, env.SHIPROCKET_API_BASE_URL).listPickupLocations() });
  });

  adminRoutes.get("/shipping/serviceability", async (c) => {
    superAdmin(c.get("actor"));
    const env = c.env as typeof c.env & { SHIPROCKET_API_EMAIL?: string; SHIPROCKET_API_PASSWORD?: string; SHIPROCKET_API_BASE_URL?: string };
    if (!env.SHIPROCKET_API_EMAIL || !env.SHIPROCKET_API_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 409);
    const pickup = c.req.query("pickupPostcode") ?? "";
    const delivery = c.req.query("deliveryPostcode") ?? "";
    const weight = Number(c.req.query("weightKg"));
    if (!/^\d{6}$/.test(pickup) || !/^\d{6}$/.test(delivery) || !Number.isFinite(weight) || weight <= 0) throw new DomainError("Valid Indian pincodes and weight are required", 422);
    return c.json({ serviceability: await getShiprocketAdapter(env.SHIPROCKET_API_EMAIL, env.SHIPROCKET_API_PASSWORD, env.SHIPROCKET_API_BASE_URL).getServiceability(pickup, delivery, weight) });
  });
}
