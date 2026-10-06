import { api, id, json } from "./client";
import type { AdminStatus } from "./types";

/**
 * Masked bank projection. Ordinary responses never carry the account number —
 * only the last four digits and the review state.
 */
export type BankSummary = {
  accountLast4: string;
  status: string;
  revision: string;
  reviewedAt?: string | null;
  reviewNotes: string | null;
  updatedAt?: string | null;
};

/**
 * Full bank details. Returned ONLY by the audited Super Admin reveal endpoint,
 * which responds `private, no-store`. Never cache or persist this.
 */
export type BankDetails = {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  revision: string;
};

/** admins row. */
export type SellerProfile = {
  id: string;
  userId: string;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** admin_kyc_submissions row. */
export type SellerKycSubmission = {
  id: string;
  adminId: string;
  status: string;
  legalName: string;
  businessType: string;
  contactPhone: string;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** admin_addresses row. `addressType` is SHIPPING_ORIGIN or RETURN. */
export type SellerAddress = {
  id: string;
  adminId: string;
  addressType: "SHIPPING_ORIGIN" | "RETURN" | string;
  businessName: string | null;
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** admin_category_assignments row. `status` is REQUESTED or ACTIVE. */
export type SellerCategoryAssignment = {
  id: string;
  adminId: string;
  categoryId: string;
  status: string;
  assignedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** KYC document metadata. The private object key is never exposed. */
export type SellerDocument = {
  id: string;
  documentType: string;
  createdAt: string;
};

/** admin_audit_events row — Super Admin review only. */
export type SellerAuditEvent = {
  id: string;
  adminId: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  changedFields: unknown;
  reason: string | null;
  createdAt: string;
};

/**
 * GET /api/admin/onboarding (own seller) and the shared part of
 * GET /api/admin/review/:adminId.
 *
 * `application` is absent from the JSON entirely when no KYC submission row
 * exists yet, so it is optional rather than `| null`.
 */
export type SellerApplication = {
  profile: SellerProfile;
  application?: SellerKycSubmission | null;
  documents: SellerDocument[];
  addresses: SellerAddress[];
  categories: SellerCategoryAssignment[];
  bank: BankSummary | null;
};

/** GET /api/admin/review/:adminId adds the audit trail. */
export type SellerReviewDetail = SellerApplication & {
  audit: SellerAuditEvent[];
};

/** POST /api/admin/review/provision — 201. Never returns a password. */
export type ProvisionResult = {
  adminId: string;
  userId: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
};

export type SellerDecision = "APPROVED" | "CHANGES_REQUIRED" | "REJECTED";
export type BankDecision = "VERIFIED" | "CHANGES_REQUIRED";

export const sellerLifecycle = {
  publishedCategories: () =>
    api<{ categories: { id: string; name: string }[] }>("/api/categories"),
  provision: (input: {
    email: string;
    name: string;
    temporaryPassword: string;
  }) =>
    api<ProvisionResult>("/api/admin/review/provision", {
      method: "POST",
      body: json(input),
    }),
  review: (adminId: string) =>
    api<SellerReviewDetail>(`/api/admin/review/${id(adminId)}`),
  /** Audited. Shows the full account number — gate behind a confirmation. */
  revealBank: (adminId: string) =>
    api<BankDetails>(`/api/admin/review/${id(adminId)}/bank/reveal`, {
      method: "POST",
      body: "{}",
    }),
  /**
   * `revision` must be the revision currently shown. A mismatch is rejected
   * with 409 so a reviewer cannot verify details they did not see.
   */
  verifyBank: (
    adminId: string,
    input: { revision: string; decision: BankDecision; notes: string },
  ) =>
    api<BankSummary>(`/api/admin/review/${id(adminId)}/bank/decision`, {
      method: "POST",
      body: json(input),
    }),
  decision: (adminId: string, decision: SellerDecision, notes: string) =>
    api<unknown>(`/api/admin/review/${id(adminId)}/decision`, {
      method: "POST",
      body: json({ decision, notes }),
    }),
  suspendOrRecover: (
    adminId: string,
    action: "SUSPEND" | "RECOVER",
    reason: string,
  ) =>
    api<unknown>(`/api/admin/review/${id(adminId)}/status`, {
      method: "POST",
      body: json({ action, reason }),
    }),
  setCategory: (
    adminId: string,
    categoryId: string,
    active: boolean,
    reason: string,
  ) =>
    api<unknown>(
      `/api/admin/review/${id(adminId)}/categories/${id(categoryId)}`,
      { method: "PUT", body: json({ active, reason }) },
    ),
  onboarding: () => api<SellerApplication>("/api/admin/onboarding"),
};
