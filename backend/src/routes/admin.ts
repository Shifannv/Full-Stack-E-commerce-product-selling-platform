import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../db/schema/admin";
import { admins } from "../db/schema/rbac";
import { categories, products, subcategories } from "../db/schema/catalog";
import { shippingProviderConfigs, shippingProviderLocations } from "../db/schema/shipping";
import { requireAuth, type AuthorizedEnv } from "../middleware/authorization";
import { correctApplication, DomainError, getAdminId, parseAddress, requestCategory, requiredText, reviewApplication, saveAddress, saveKyc, setCategoryAssignment, submitApplication } from "../services/admin/admin.service";
import { configureField, createCategory, createProduct, createSubcategory, createVariant, getAdminCategoryConfig, listAdminProducts, saveProductImageMetadata, setProductInventory, updateProduct } from "../services/admin/catalog.service";
import { getAdminSummary } from "../services/admin/summary.service";
import { getShiprocketAdapter } from "../services/shipping/providers/shiprocket.adapter";
import { activateAdminAccount, createInvitation, peekInvitation, reissueInvitation } from "../services/admin/invitation.service";
import { sendInvitationEmail } from "../services/admin/invitation-email.service";

type AdminEnv = AuthorizedEnv & {
  Bindings: AuthorizedEnv["Bindings"] & {
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    ADMIN_SETUP_URL?: string;
  };
};

export const adminRoutes = new Hono<AdminEnv>();

// ---------------------------------------------------------------------------
// Unauthenticated activation routes — Admin has no session before password setup.
// These MUST be registered before the requireAuth middleware below.
// ---------------------------------------------------------------------------
adminRoutes.get("/activate", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!token) return c.json({ error: "token is required" }, 422);
  return withDbPublic(c.env.HYPERDRIVE.connectionString, async (db) => {
    const info = await peekInvitation(db, token);
    return c.json({ email: info.email, expiresAt: info.expiresAt });
  }, c);
});

adminRoutes.post("/activate", async (c) => {
  const v = await bodyPublic(c);
  const rawToken = requiredText(v.token, "token", 200);
  const password = requiredText(v.password, "password", 256);
  return withDbPublic(c.env.HYPERDRIVE.connectionString, async (db) => {
    const result = await activateAdminAccount(db, { rawToken, password });
    return c.json({ userId: result.userId, email: result.email, adminId: result.adminId });
  }, c);
});

adminRoutes.use("*", requireAuth);

async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } finally { await client.end({ timeout: 1 }); }
}

async function withDbPublic(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<Response>, c: { json: (body: unknown, status?: number) => Response }): Promise<Response> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } catch (error) {
    if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
    console.error("Activation request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return c.json({ error: "Activation unavailable" }, 503);
  } finally { await client.end({ timeout: 1 }); }
}

async function bodyPublic(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid JSON body", 422);
  return value as Record<string, unknown>;
}

function ownAdmin(actor: { roles: string[] }) {
  if (!actor.roles.includes("ADMIN")) throw new DomainError("Forbidden", 403);
}
function superAdmin(actor: { roles: string[] }) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
}
function requireSetupUrl(value: string | undefined): string {
  if (!value) throw new DomainError("Admin invitation delivery is not configured", 409);
  let url: URL;
  try { url = new URL(value); } catch { throw new DomainError("Admin setup URL is invalid", 409); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new DomainError("Admin setup URL must use HTTPS", 409);
  return value;
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
    const cats = await db.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId));
    return { profile, application, documents, addresses, categories: cats };
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
    const cats = await db.select().from(adminCategoryAssignments).where(eq(adminCategoryAssignments.adminId, adminId));
    const audit = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.adminId, adminId));
    return { profile, application, documents, addresses, categories: cats, audit };
  }));
});

// ---------------------------------------------------------------------------
// Passwords must be chosen by the invited Admin, never supplied by Super Admin.
// ---------------------------------------------------------------------------
adminRoutes.post("/review/provision", async (c) => {
  superAdmin(c.get("actor"));
  throw new DomainError("Use Admin invitation for password setup", 422);
});

// ---------------------------------------------------------------------------
// Invitation flow: Super Admin sends a secure invitation email.
// The Admin activates their account via GET/POST /admin/activate (unauthenticated).
// ---------------------------------------------------------------------------
adminRoutes.post("/review/invite", async (c) => {
  superAdmin(c.get("actor"));
  if (!c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL) throw new DomainError("Admin invitation delivery is not configured", 409);
  const setupPageUrl = requireSetupUrl(c.env.ADMIN_SETUP_URL);
  const v = await body(c);
  const email = requiredText(v.email, "email", 320);
  const name = requiredText(v.name, "name");
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    createInvitation(db, { email, name, invitedByUserId: c.get("actor").userId })
  );
  const emailResult = await sendInvitationEmail({
    toEmail: email,
    toName: name,
    rawToken: result.rawToken,
    expiresAt: result.expiresAt,
    setupPageUrl,
    fromEmail: c.env.RESEND_FROM_EMAIL ?? "",
    resendApiKey: c.env.RESEND_API_KEY ?? "",
  });
  return c.json({
    adminId: result.adminId,
    expiresAt: result.expiresAt,
    emailDelivered: emailResult.delivered,
    emailNote: emailResult.delivered ? undefined : (emailResult as { reason?: string }).reason,
  }, 201);
});

adminRoutes.post("/review/reinvite", async (c) => {
  superAdmin(c.get("actor"));
  if (!c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL) throw new DomainError("Admin invitation delivery is not configured", 409);
  const setupPageUrl = requireSetupUrl(c.env.ADMIN_SETUP_URL);
  const v = await body(c);
  const email = requiredText(v.email, "email", 320);
  const { db: innerDb, client: innerClient } = createDb(c.env.HYPERDRIVE.connectionString);
  let invitedName: string | undefined;
  try {
    const { users } = await import("../db/schema/auth");
    const [u] = await innerDb.select({ name: users.name }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    invitedName = u?.name;
  } finally {
    await innerClient.end({ timeout: 1 });
  }
  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    reissueInvitation(db, { email, invitedByUserId: c.get("actor").userId })
  );
  const emailResult = await sendInvitationEmail({
    toEmail: email,
    toName: invitedName ?? email,
    rawToken: result.rawToken,
    expiresAt: result.expiresAt,
    setupPageUrl,
    fromEmail: c.env.RESEND_FROM_EMAIL ?? "",
    resendApiKey: c.env.RESEND_API_KEY ?? "",
  });
  return c.json({
    adminId: result.adminId,
    expiresAt: result.expiresAt,
    emailDelivered: emailResult.delivered,
    emailNote: emailResult.delivered ? undefined : (emailResult as { reason?: string }).reason,
  });
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

adminRoutes.get("/summary", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("analytics.view") || !actor.permissions.includes("earnings.view")) throw new DomainError("Forbidden", 403);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => getAdminSummary(db, await getAdminId(db, actor.userId))));
});

adminRoutes.get("/products", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("products.view")) throw new DomainError("Forbidden", 403);
  const number = (key: string, fallback: number) => {
    const value = c.req.query(key);
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < (key === "limit" ? 1 : 0)) throw new DomainError(`Invalid ${key}`, 422);
    return parsed;
  };
  const status = c.req.query("status");
  if (status && !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) throw new DomainError("Invalid status", 422);
  const limit = Math.min(50, number("limit", 20));
  const offset = number("offset", 0);
  return c.json({ products: await withDb(c.env.HYPERDRIVE.connectionString, async (db) => listAdminProducts(db, await getAdminId(db, actor.userId), { status, limit, offset })), limit, offset });
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

adminRoutes.patch("/products/:productId", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("products.update")) throw new DomainError("Forbidden", 403);
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => updateProduct(db, await getAdminId(db, actor.userId), c.req.param("productId"), v)));
});

adminRoutes.post("/products/:productId/variants", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("products.update")) throw new DomainError("Forbidden", 403);
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => createVariant(db, await getAdminId(db, actor.userId), c.req.param("productId"), v)), 201);
});

adminRoutes.post("/products/:productId/images", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("products.update")) throw new DomainError("Forbidden", 403);
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => saveProductImageMetadata(db, await getAdminId(db, actor.userId), c.req.param("productId"), v)), 201);
});

adminRoutes.put("/products/:productId/inventory", async (c) => {
  const actor = c.get("actor");
  if (!actor.roles.includes("ADMIN") || !actor.adminApproved || !actor.permissions.includes("inventory.update")) throw new DomainError("Forbidden", 403);
  const v = await body(c);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => setProductInventory(db, await getAdminId(db, actor.userId), c.req.param("productId"), Number(v.quantity), typeof v.variantId === "string" ? v.variantId : undefined)));
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

adminRoutes.patch("/catalog/products/:productId/status", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (v.status !== "PUBLISHED" && v.status !== "DRAFT" && v.status !== "ARCHIVED") throw new DomainError("Invalid status", 422);
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [result] = await db.update(products).set({ status: v.status as string, updatedAt: new Date() }).where(eq(products.id, c.req.param("productId"))).returning();
    if (!result) throw new DomainError("Product unavailable", 404);
    return result;
  }));
});

adminRoutes.patch("/catalog/products/:productId/featured", async (c) => {
  superAdmin(c.get("actor"));
  const v = await body(c);
  if (typeof v.featured !== "boolean") throw new DomainError("featured must be a boolean", 422);
  const featured = v.featured as boolean;
  return c.json(await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
    const [result] = await db.update(products).set({ featured, updatedAt: new Date() }).where(eq(products.id, c.req.param("productId"))).returning({ id: products.id, featured: products.featured });
    if (!result) throw new DomainError("Product unavailable", 404);
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
    const env = c.env as typeof c.env & { SHIPROCKET_API_EMAIL?: string; SHIPROCKET_API_PASSWORD?: string };
    if (!env.SHIPROCKET_API_EMAIL || !env.SHIPROCKET_API_PASSWORD) throw new DomainError("Shiprocket API user credentials are required", 422);
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
