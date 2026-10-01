import { eq } from "drizzle-orm";
import { adminAddresses, adminAuditEvents, adminCategoryAssignments, adminKycDocuments, adminKycSubmissions } from "../../db/schema/admin";
import { admins } from "../../db/schema/rbac";
import { categories } from "../../db/schema/catalog";
import { DomainError, getAdminId, parseAddress, requestCategory, requiredText, saveAddress, saveKyc, submitApplication } from "../../services/admin/admin.service";
import { lockAdmin } from "../../services/admin/admin-lock";
import { readBoundedMultipart } from "../../lib/security/body";
import type { AdminRouter } from "./shared";
import { withDb, ownAdmin, body } from "./shared";

export function registerOnboardingRoutes(adminRoutes: AdminRouter) {
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
    const form = await readBoundedMultipart(c.req.raw, 5_500_000);
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
        return await db.transaction(async (tx) => {
          const owner = await lockAdmin(tx, adminId);
          if (!["DRAFT", "PENDING", "CHANGES_REQUIRED"].includes(owner.status)) throw new DomainError("Application cannot be edited in this state", 409);
          const [current] = await tx.select({ id: adminKycSubmissions.id, status: adminKycSubmissions.status }).from(adminKycSubmissions)
            .where(eq(adminKycSubmissions.adminId, adminId)).limit(1).for("update");
          if (!current || current.id !== application.id || !["DRAFT", "CHANGES_REQUIRED"].includes(current.status)) throw new DomainError("Application cannot be edited in this state", 409);
          const [saved] = await tx.insert(adminKycDocuments).values({ submissionId: current.id, documentType, privateObjectKey: key }).returning({ id: adminKycDocuments.id, documentType: adminKycDocuments.documentType });
          await tx.insert(adminAuditEvents).values({ entityId: adminId, adminId, actorUserId: c.get("actor").userId, action: "KYC_DOCUMENT_SAVED", changedFields: ["documentType"] });
          return saved;
        });
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
}
