import { api, id, json } from "./client";

// ─── Super Admin response types (browser-facing, no secrets) ─────────────────

export type PlatformSummary = {
  admins: { active: number; pending: number; total: number };
  catalog: { publishedProducts: number };
  orders: { total: number };
  finance: { grossSettledSales: string; pendingPayoutRequests: number };
  onboarding: { pendingKycApplications: number };
};

export type AdminRow = {
  id: string;
  userName: string | null;
  userEmail: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminsResponse = {
  admins: AdminRow[];
  limit: number;
  offset: number;
};

export type SuperAdminProduct = {
  id: string;
  name: string;
  slug: string;
  price: string;
  currency: string;
  status: string;
  featured: boolean;
  returnEnabled: boolean;
  category: string;
  categoryId: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  ownerAdminId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductsResponse = {
  products: SuperAdminProduct[];
  limit: number;
  offset: number;
};

export type SuperAdminPayout = {
  id: string;
  adminId: string;
  amount: string;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutsResponse = {
  payouts: SuperAdminPayout[];
  limit: number;
  offset: number;
};

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
};

export type PermissionRow = {
  id: string;
  key: string;
  description: string | null;
};

export type RolesResponse = {
  roles: RoleRow[];
  permissions: PermissionRow[];
};

export type LifecycleRequest = {
  id: string;
  type: "DELETION" | "RECOVERY";
  adminId: string;
  adminStatus: string;
  userName: string | null;
  userEmail: string;
  status: string;
  reason: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  verifiedAt?: string | null;
  archiveId?: string | null;
};

export type LifecycleResponse = {
  requests: LifecycleRequest[];
  limit: number;
  offset: number;
};

export type ReconciliationItem = {
  id: string;
  domain: string;
  status: string;
  entityType: string;
  entityId: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReconciliationResponse = {
  items: ReconciliationItem[];
  count: number;
};

// ─── Super Admin API client ────────────────────────────────────────────────────

export const superAdminApi = {
  // Dashboard
  summary: () => api<PlatformSummary>("/api/super-admin/summary"),

  // Admins
  admins: (query: URLSearchParams = new URLSearchParams()) =>
    api<AdminsResponse>(`/api/super-admin/admins?${query}`),

  // Review workflows (existing)
  reviewAdmin: (adminId: string) =>
    api<unknown>(`/api/admin/review/${id(adminId)}`),
  decideAdmin: (
    adminId: string,
    decision: "APPROVED" | "CHANGES_REQUIRED" | "REJECTED",
    notes: string,
  ) =>
    api<unknown>(`/api/admin/review/${id(adminId)}/decision`, {
      method: "POST",
      body: json({ decision, notes }),
    }),

  // Products
  products: (query: URLSearchParams = new URLSearchParams()) =>
    api<ProductsResponse>(`/api/super-admin/products?${query}`),

  // Payouts
  payouts: (query: URLSearchParams = new URLSearchParams()) =>
    api<PayoutsResponse>(`/api/super-admin/payouts?${query}`),
  payoutDecision: (
    payoutId: string,
    decision: "APPROVED" | "REJECTED",
    notes: string,
  ) =>
    api<unknown>(`/api/super-admin/payouts/${id(payoutId)}/decision`, {
      method: "POST",
      body: json({ decision, notes }),
    }),
  payoutPaid: (payoutId: string, paymentReference: string) =>
    api<unknown>(`/api/super-admin/payouts/${id(payoutId)}/paid`, {
      method: "POST",
      body: json({ paymentReference }),
    }),

  // Roles (read-only)
  roles: () => api<RolesResponse>("/api/super-admin/roles"),

  // Lifecycle requests
  lifecycleRequests: (query: URLSearchParams = new URLSearchParams()) =>
    api<LifecycleResponse>(`/api/super-admin/lifecycle-requests?${query}`),
  lifecycleDecision: (
    adminId: string,
    requestId: string,
    type: "deletion" | "recovery",
    decision: "APPROVED" | "REJECTED",
    reason: string,
    recoveryExtras?: {
      kycSubmissionId?: string;
      kycRevision?: string;
      categoryIds?: string[];
    },
  ) =>
    api<unknown>(
      `/api/admin/review/${id(adminId)}/${type}-requests/${id(requestId)}/decision`,
      {
        method: "POST",
        body: json({ decision, reason, ...recoveryExtras }),
      },
    ),

  // Reconciliation
  reconciliation: (query: URLSearchParams = new URLSearchParams()) =>
    api<ReconciliationResponse>(`/api/super-admin/reconciliation?${query}`),
  reconciliationItem: (itemId: string) =>
    api<{ item: ReconciliationItem }>(
      `/api/super-admin/reconciliation/${id(itemId)}`,
    ),
  resolveReconciliation: (itemId: string, note: string) =>
    api<unknown>(`/api/super-admin/reconciliation/${id(itemId)}/resolve`, {
      method: "POST",
      body: json({ note }),
    }),
  escalateReconciliation: (itemId: string, note: string) =>
    api<unknown>(`/api/super-admin/reconciliation/${id(itemId)}/escalate`, {
      method: "POST",
      body: json({ note }),
    }),

  // Finance settings
  financeSettings: () => api<unknown>("/api/super-admin/finance-settings"),

  // Review moderation (existing)
  moderateReview: (
    reviewId: string,
    decision: "PUBLISHED" | "REJECTED",
    notes: string,
  ) =>
    api<unknown>(`/api/super-admin/reviews/${id(reviewId)}/moderate`, {
      method: "POST",
      body: json({ decision, notes }),
    }),
  authorizeRefund: (returnId: string) =>
    api<unknown>(`/api/super-admin/returns/${id(returnId)}/refund/authorize`, {
      method: "POST",
      body: "{}",
    }),
};
