import { and, eq } from "drizzle-orm";
import { createDb } from "../../db";
import {
  adminAddresses,
  adminAuditEvents,
  adminCategoryAssignments,
  adminKycDocuments,
  adminKycSubmissions,
} from "../../db/schema/admin";
import { admins } from "../../db/schema/rbac";
import { categories } from "../../db/schema/catalog";
import {
  correctApplication,
  DomainError,
  parseAddress,
  requiredText,
  reviewApplication,
  saveAddress,
  setCategoryAssignment,
} from "../../services/admin/admin.service";
import {
  reissueInvitation,
} from "../../services/admin/invitation.service";
import { sendInvitationEmail } from "../../services/admin/invitation-email.service";
import { transitionAdminStatus } from "../../services/admin/account-state.service";
import { provisionAdmin } from "../../services/admin/provisioning.service";
import { getBankSummary, revealBankDetails, reviewBankDetails } from "../../services/admin/bank.service";
import type { AdminRouter } from "./shared";
import { withDb, superAdmin, requireSetupUrl, body } from "./shared";

export function registerReviewRoutes(adminRoutes: AdminRouter) {
  adminRoutes.post("/review/:adminId/bank/reveal", async (c) => {
    superAdmin(c.get("actor"));
    c.header("Cache-Control", "private, no-store");
    return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => revealBankDetails(db, c.req.param("adminId"), c.get("actor").userId, c.env.ADMIN_BANK_ENCRYPTION_KEY)));
  });
  adminRoutes.post("/review/:adminId/bank/decision", async (c) => {
    superAdmin(c.get("actor"));
    const input = await body(c);
    return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) => reviewBankDetails(db, c.req.param("adminId"), c.get("actor").userId, input)));
  });
  adminRoutes.get("/review/:adminId", async (c) => {
    superAdmin(c.get("actor"));
    c.header("Cache-Control", "private, no-store");
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
        const adminId = c.req.param("adminId");
        const [profile] = await db
          .select()
          .from(admins)
          .where(eq(admins.id, adminId))
          .limit(1);
        if (!profile) throw new DomainError("Admin unavailable", 404);
        const [application] = await db
          .select()
          .from(adminKycSubmissions)
          .where(eq(adminKycSubmissions.adminId, adminId))
          .limit(1);
        const documents = application
          ? await db
              .select({
                id: adminKycDocuments.id,
                documentType: adminKycDocuments.documentType,
                createdAt: adminKycDocuments.createdAt,
              })
              .from(adminKycDocuments)
              .where(eq(adminKycDocuments.submissionId, application.id))
          : [];
        const addresses = await db
          .select()
          .from(adminAddresses)
          .where(eq(adminAddresses.adminId, adminId));
        const cats = await db
          .select()
          .from(adminCategoryAssignments)
          .where(eq(adminCategoryAssignments.adminId, adminId));
        const audit = await db
          .select()
          .from(adminAuditEvents)
          .where(eq(adminAuditEvents.adminId, adminId));
        return {
          profile,
          application,
          documents,
          addresses,
          categories: cats,
          audit,
          bank: await getBankSummary(db, adminId),
        };
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Super Admin supplies only the temporary initial password.
  // ---------------------------------------------------------------------------
  adminRoutes.post("/review/provision", async (c) => {
    superAdmin(c.get("actor"));
    const input = await body(c);
    c.header("Cache-Control", "no-store");
    return c.json(await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      provisionAdmin(db, c.get("actor").userId, input)), 201);
  });

  // ---------------------------------------------------------------------------
  // New sellers must use the temporary-password lifecycle. Existing outstanding
  // invitation tokens/reissue remain compatible; they are not a new-account path.
  // ---------------------------------------------------------------------------
  adminRoutes.post("/review/invite", async (c) => {
    superAdmin(c.get("actor"));
    throw new DomainError("Provision new Admins with a temporary password using /api/admin/review/provision", 409);
  });

  adminRoutes.post("/review/reinvite", async (c) => {
    superAdmin(c.get("actor"));
    if (!c.env.RESEND_API_KEY || !c.env.RESEND_FROM_EMAIL)
      throw new DomainError("Admin invitation delivery is not configured", 409);
    const setupPageUrl = requireSetupUrl(c.env.ADMIN_SETUP_URL);
    const v = await body(c);
    const email = requiredText(v.email, "email", 320);
    const { db: innerDb, client: innerClient } = createDb(
      c.env.HYPERDRIVE.connectionString,
    );
    let invitedName: string | undefined;
    try {
      const { users } = await import("../../db/schema/auth");
      const [u] = await innerDb
        .select({ name: users.name })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      invitedName = u?.name;
    } finally {
      await innerClient.end({ timeout: 1 });
    }
    const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
      reissueInvitation(db, { email, invitedByUserId: c.get("actor").userId }),
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
      emailNote: emailResult.delivered
        ? undefined
        : (emailResult as { reason?: string }).reason,
    });
  });

  adminRoutes.get("/review/:adminId/documents/:documentId", async (c) => {
    superAdmin(c.get("actor"));
    if (!c.env.KYC_BUCKET)
      throw new DomainError("Private document storage unavailable", 409);
    const key = await withDb(c.env.HYPERDRIVE.connectionString, async (db) => {
      const [application] = await db
        .select({ id: adminKycSubmissions.id })
        .from(adminKycSubmissions)
        .where(eq(adminKycSubmissions.adminId, c.req.param("adminId")))
        .limit(1);
      if (!application) throw new DomainError("Document unavailable", 404);
      const [document] = await db
        .select({ key: adminKycDocuments.privateObjectKey })
        .from(adminKycDocuments)
        .where(
          and(
            eq(adminKycDocuments.id, c.req.param("documentId")),
            eq(adminKycDocuments.submissionId, application.id),
          ),
        )
        .limit(1);
      if (!document?.key.startsWith(`admin/${c.req.param("adminId")}/`))
        throw new DomainError("Document unavailable", 404);
      return document.key;
    });
    const object = await c.env.KYC_BUCKET.get(key);
    if (!object) throw new DomainError("Document unavailable", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType ?? "application/octet-stream",
        "Content-Disposition": "attachment",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  adminRoutes.patch("/review/:adminId/kyc", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    const changes: {
      legalName?: string;
      businessType?: string;
      contactPhone?: string;
      reason: string;
    } = { reason: requiredText(v.reason, "reason", 1000) };
    if (v.legalName !== undefined)
      changes.legalName = requiredText(v.legalName, "legalName");
    if (v.businessType !== undefined)
      changes.businessType = requiredText(v.businessType, "businessType", 100);
    if (v.contactPhone !== undefined)
      changes.contactPhone = requiredText(v.contactPhone, "contactPhone", 30);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        correctApplication(
          db,
          c.req.param("adminId"),
          c.get("actor").userId,
          changes,
        ),
      ),
    );
  });

  adminRoutes.put("/review/:adminId/addresses/:type", async (c) => {
    superAdmin(c.get("actor"));
    const input = parseAddress({
      ...(await body(c)),
      addressType: c.req.param("type"),
    });
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        saveAddress(
          db,
          c.req.param("adminId"),
          c.get("actor").userId,
          input,
          true,
        ),
      ),
    );
  });

  adminRoutes.post("/review/:adminId/decision", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (
      v.decision !== "CHANGES_REQUIRED" &&
      v.decision !== "REJECTED" &&
      v.decision !== "APPROVED"
    )
      throw new DomainError("Invalid decision", 422);
    const notes = requiredText(v.notes, "notes", 1000);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        reviewApplication(
          db,
          c.req.param("adminId"),
          c.get("actor").userId,
          v.decision as "CHANGES_REQUIRED" | "REJECTED" | "APPROVED",
          notes,
        ),
      ),
    );
  });

  adminRoutes.post("/review/:adminId/status", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (v.action !== "SUSPEND" && v.action !== "RECOVER")
      throw new DomainError("Invalid Admin status action", 422);
    const reason = requiredText(v.reason, "reason", 1000);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        transitionAdminStatus(
          db,
          c.req.param("adminId"),
          c.get("actor").userId,
          v.action as "SUSPEND" | "RECOVER",
          reason,
        ),
      ),
    );
  });

  adminRoutes.put("/review/:adminId/categories/:categoryId", async (c) => {
    superAdmin(c.get("actor"));
    const v = await body(c);
    if (typeof v.active !== "boolean")
      throw new DomainError("active must be a boolean", 422);
    return c.json(
      await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
        setCategoryAssignment(
          db,
          c.req.param("adminId"),
          c.req.param("categoryId"),
          c.get("actor").userId,
          v.active as boolean,
          requiredText(v.reason, "reason", 1000),
        ),
      ),
    );
  });
}
