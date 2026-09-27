import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../db/schema/admin";
import { admins } from "../db/schema/rbac";
import { categories, subcategories } from "../db/schema/catalog";
import { shippingProviderConfigs, shippingProviderLocations } from "../db/schema/shipping";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";
import { correctApplication, DomainError, getAdminId, parseAddress, requestCategory, requiredText, reviewApplication, saveAddress, saveKyc, setCategoryAssignment, submitApplication } from "../services/admin/admin.service";
import { configureField, createCategory, createProduct, createSubcategory, getAdminCategoryConfig } from "../services/admin/catalog.service";
import { ShiprocketAdapter } from "../services/shipping/providers/shiprocket.adapter";
import { provisionCredentialUser } from "../services/admin/provision.service";

export const adminRoutes = new Hono<AuthorizedEnv>();
adminRoutes.use("*", requireAuth);

async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } finally { await client.end({ timeout: 1 }); }
}

function ownAdmin(actor: { roles: string[] }) {
  if (!actor.roles.includes("ADMIN")) throw new DomainError("Forbidden", 403);
}
function superAdmin(actor: { roles: string[] }) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
}
async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid JSON body", 422);
  return value as Record<string, unknown>;
}

adminRoutes.onError((error, c) => {
  if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
  console.error("Admin API failed", { name: error.name, code: (error as { code?: string }).code });
  return c.json({ error: "Admin operation unavailable" }, 503);
});

adminRoutes.get("/onboarding", async (c) => {
  ownAdmin(c.get("actor"));
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const adminId = await getAdminId(db, c.get("actor").userId);
    const [profile] = await db.select().from(admins).where(eq(admins.id, adminId)).limit(1);
    const [application] = await db.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId)).limit(1);
    const documents = application ? await db.select({ id: adminKycDocuments.id, documentType: adminKycDocuments.documentType, createdAt: adminKycDocuments.createdAt }).from(adminKycDocuments).where(eq(adminKycDocuments.submissionId, application.id)) : [];
    const addresses = await db.select().from(adminAddresses).where(eq(adminAddresses.adminId, adminId));
    const categories = await db.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId));
    return { profile, application, documents, addresses, categories };
  }));
});

adminRoutes.put("/onboarding/kyc", async (c) => {
  ownAdmin(c.get("actor"));
  const v = await body(c);
  const data = { legalName: requiredText(v.legalName, "legalName"), businessType: requiredText(v.businessType, "businessType", 100), contactPhone: requiredText(v.contactPhone, "contactPhone", 30) };
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => saveKyc(db, await getAdminId(db, c.get("actor").userId), c.get("actor").userId, data)));
});

adminRoutes.post("/onboarding/kyc/documents", async (c) => {
  ownAdmin(c.get("actor"));
  if (!c.env.KYC_BUCKET) throw new DomainError("Private document storage unavailable", 409);
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > 5_500_000) throw new DomainError("Document is too large", 422);
  const form = await c.req.formData();
  const file = form.get("file");
  const documentType = requiredText(form.get("documentType"), "documentType", 80);
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new DomainError("A PDF, JPEG, or PNG up to 5 MB is required", 422);
  const data = await file.arrayBuffer();
  const signature = new Uint8Array(data.slice(0, 8));
  const validSignature = file.type === "application/pdf" ? [37, 80, 68, 70, 45].every((byte, i) => signature[i] === byte)
    : file.type === "image/jpeg" ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
      : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => signature[i] === byte);
  if (!validSignature) throw new DomainError("Document content does not match its file type", 422);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const adminId = await getAdminId(db, c.get("actor").userId);
    const [application] = await db.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId)).limit(1);
    if (!application || !["DRAFT", "CHANGES_REQUIRED"].includes(application.status)) throw new DomainError("Save the seller profile before uploading evidence", 409);
    const key = `admin/${adminId}/${crypto.randomUUID()}`;
    await c.env.KYC_BUCKET!.put(key, data, { httpMetadata: { contentType: file.type } });
    try {
      const [saved] = await db.insert(adminKycDocuments).values({ submissionId: application.id, documentType, privateObjectKey: key }).returning({ id: adminKycDocuments.id, documentType: adminKycDocuments.documentType });
      return saved;
    } catch (error) {
      await c.env.KYC_BUCKET!.delete(key).catch(() => undefined);
      throw error;
    }
  }));
});

adminRoutes.put("/onboarding/addresses/:type", async (c) => {
  ownAdmin(c.get("actor"));
  const input = parseAddress({ ...await body(c), addressType: c.req.param("type") });
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => saveAddress(db, await getAdminId(db, c.get("actor").userId), c.get("actor").userId, input)));
});

adminRoutes.post("/onboarding/categories/:categoryId", async (c) => {
  ownAdmin(c.get("actor"));
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => requestCategory(db, await getAdminId(db, c.get("actor").userId), c.req.param("categoryId"))));
});

adminRoutes.post("/onboarding/submit", async (c) => {
  ownAdmin(c.get("actor"));
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => submitApplication(db, await getAdminId(db, c.get("actor").userId), c.get("actor").userId)));
});

adminRoutes.get("/review/:adminId", async (c) => {
  superAdmin(c.get("actor"));
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const adminId = c.req.param("adminId");
    const [profile] = await db.select().from(admins).where(eq(admins.id, adminId)).limit(1);
    if (!profile) throw new DomainError("Admin unavailable", 404);
    const [application] = await db.select().from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, adminId)).limit(1);
    const documents = application ? await db.select({ id: adminKycDocuments.id, documentType: adminKycDocuments.documentType, createdAt: adminKycDocuments.createdAt }).from(adminKycDocuments).where(eq(adminKycDocuments.submissionId, application.id)) : [];
    const addresses = await db.select().from(adminAddresses).where(eq(adminAddresses.adminId, adminId));
    const categories = await db.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId));
    const audit = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId));
    return { profile, application, documents, addresses, categories, audit };
  }));
});

adminRoutes.post("/review/provision", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) => provisionCredentialUser(db, {
    email: requiredText(v.email, "email", 320), name: requiredText(v.name, "name"), password: typeof v.password === "string" ? v.password : "",
  }, "ADMIN", c.get("actor").userId));
  return c.json(result, 201);
});

adminRoutes.get("/review/:adminId/documents/:documentId", async (c) => {
  superAdmin(c.get("actor"));
  if (!c.env.KYC_BUCKET) throw new DomainError("Private document storage unavailable", 409);
  const key = await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [application] = await db.select({ id: adminKycSubmissions.id }).from(adminKycSubmissions).where(eq(adminKycSubmissions.adminId, c.req.param("adminId"))).limit(1);
    if (!application) throw new DomainError("Document unavailable", 404);
    const [document] = await db.select({ key: adminKycDocuments.privateObjectKey }).from(adminKycDocuments).where(and(eq(adminKycDocuments.id, c.req.param("documentId")), eq(adminKycDocuments.submissionId, application.id))).limit(1);
    if (!document?.key.startsWith(`admin/${c.req.param("adminId")}/`)) throw new DomainError("Document unavailable", 404);
    return document.key;
  });
  const object = await c.env.KYC_BUCKET.get(key);
  if (!object) throw new DomainError("Document unavailable", 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream", "Content-Disposition": "attachment", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});

adminRoutes.patch("/review/:adminId/kyc", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  const changes: { legalName?: string; businessType?: string; contactPhone?: string; reason: string } = { reason: requiredText(v.reason, "reason", 1000) };
  if (v.legalName !== undefined) changes.legalName = requiredText(v.legalName, "legalName");
  if (v.businessType !== undefined) changes.businessType = requiredText(v.businessType, "businessType", 100);
  if (v.contactPhone !== undefined) changes.contactPhone = requiredText(v.contactPhone, "contactPhone", 30);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => correctApplication(db, c.req.param("adminId"), c.get("actor").userId, changes)));
});

adminRoutes.put("/review/:adminId/addresses/:type", async (c) => {
  superAdmin(c.get("actor"));
  const input = parseAddress({ ...await body(c), addressType: c.req.param("type") });
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => saveAddress(db, c.req.param("adminId"), c.get("actor").userId, input, true)));
});

adminRoutes.post("/review/:adminId/decision", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (v.decision !== "CHANGES_REQUIRED" && v.decision !== "REJECTED" && v.decision !== "APPROVED") throw new DomainError("Invalid decision", 422);
  const notes = requiredText(v.notes, "notes", 1000);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => reviewApplication(db, c.req.param("adminId"), c.get("actor").userId, v.decision as "CHANGES_REQUIRED" | "REJECTED" | "APPROVED", notes)));
});

adminRoutes.put("/review/:adminId/categories/:categoryId", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (typeof v.active !== "boolean") throw new DomainError("active must be a boolean", 422);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => setCategoryAssignment(db, c.req.param("adminId"), c.req.param("categoryId"), c.get("actor").userId, v.active as boolean, requiredText(v.reason, "reason", 1000))));
});

adminRoutes.get("/categories", async (c) => {
  ownAdmin(c.get("actor"));
  return c.json({ categories: await withDb(c.env.HYPERDRIVE.connectionString, async (db) => getAdminCategoryConfig(db, await getAdminId(db, c.get("actor").userId))) });
});

adminRoutes.post("/subcategories", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("products.create")) throw new DomainError("Forbidden", 403);
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => createSubcategory(db, v, await getAdminId(db, actor.userId))));
});

adminRoutes.post("/products", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("products.create")) throw new DomainError("Forbidden", 403);
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => createProduct(db, await getAdminId(db, actor.userId), v)));
});

adminRoutes.post("/catalog/categories", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => createCategory(db, v)));
});

adminRoutes.patch("/catalog/categories/:categoryId/status", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (v.status !== "PUBLISHED" && v.status !== "DRAFT" && v.status !== "ARCHIVED") throw new DomainError("Invalid status", 422);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [result] = await db.update(categories).set({ status: v.status as string, updatedAt: new Date() }).where(eq(categories.id, c.req.param("categoryId"))).returning();
    if (!result) throw new DomainError("Category unavailable", 404);
    return result;
  }));
});

adminRoutes.post("/catalog/subcategories", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => createSubcategory(db, v)));
});

adminRoutes.patch("/catalog/subcategories/:subcategoryId/status", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (v.status !== "PUBLISHED" && v.status !== "DRAFT" && v.status !== "ARCHIVED") throw new DomainError("Invalid status", 422);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [result] = await db.update(subcategories).set({ status: v.status as string, updatedAt: new Date() }).where(eq(subcategories.id, c.req.param("subcategoryId"))).returning();
    if (!result) throw new DomainError("Subcategory unavailable", 404);
    return result;
  }));
});

adminRoutes.put("/catalog/fields", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => configureField(db, v)));
});

adminRoutes.put("/shipping/providers/shiprocket", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (typeof v.enabled !== "boolean") throw new DomainError("enabled must be a boolean", 422);
  if (v.enabled) {
    const env = c.env as typeof c.env & { SHIPROCKET_API_USER_EMAIL?: string; SHIPROCKET_API_USER_PASSWORD?: string };
    if (!env.SHIPROCKET_API_USER_EMAIL || !env.SHIPROCKET_API_USER_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 422);
  }
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [result] = await db.update(shippingProviderConfigs).set({ enabled: v.enabled as boolean, updatedAt: new Date() }).where(eq(shippingProviderConfigs.providerKey, "shiprocket")).returning({ providerKey: shippingProviderConfigs.providerKey, enabled: shippingProviderConfigs.enabled });
    if (!result) throw new DomainError("Shipping provider metadata unavailable", 404);
    return result;
  }));
});

adminRoutes.put("/shipping/pickup-locations", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  const adminId = requiredText(v.adminId, "adminId", 40);
  const adminAddressId = requiredText(v.adminAddressId, "adminAddressId", 40);
  const providerLocationRef = requiredText(v.providerLocationRef, "providerLocationRef", 150);
  const locationName = requiredText(v.locationName, "locationName", 150);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [result] = await db.insert(shippingProviderLocations).values({ adminId, adminAddressId, providerKey: "shiprocket", providerLocationRef, locationName })
      .onConflictDoUpdate({ target: [shippingProviderLocations.providerKey, shippingProviderLocations.adminAddressId], set: { providerLocationRef, locationName, status: "ACTIVE", updatedAt: new Date() } }).returning();
    return result;
  }));
});

adminRoutes.get("/shipping/provider-pickups", async (c) => {
  superAdmin(c.get("actor"));
  const env = c.env as typeof c.env & { SHIPROCKET_API_USER_EMAIL?: string; SHIPROCKET_API_USER_PASSWORD?: string };
  if (!env.SHIPROCKET_API_USER_EMAIL || !env.SHIPROCKET_API_USER_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 409);
  return c.json({ locations: await new ShiprocketAdapter(env.SHIPROCKET_API_USER_EMAIL, env.SHIPROCKET_API_USER_PASSWORD).listPickupLocations() });
});

adminRoutes.get("/shipping/serviceability", async (c) => {
  superAdmin(c.get("actor"));
  const env = c.env as typeof c.env & { SHIPROCKET_API_USER_EMAIL?: string; SHIPROCKET_API_USER_PASSWORD?: string };
  if (!env.SHIPROCKET_API_USER_EMAIL || !env.SHIPROCKET_API_USER_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 409);
  const pickup = c.req.query("pickupPostcode") ?? "";
  const delivery = c.req.query("deliveryPostcode") ?? "";
  const weight = Number(c.req.query("weightKg"));
  if (!/^\d{6}$/.test(pickup) || !/^\d{6}$/.test(delivery) || !Number.isFinite(weight) || weight <= 0) throw new DomainError("Valid Indian pincodes and weight are required", 422);
  return c.json({ serviceability: await new ShiprocketAdapter(env.SHIPROCKET_API_USER_EMAIL, env.SHIPROCKET_API_USER_PASSWORD).getServiceability(pickup, delivery, weight) });
});
