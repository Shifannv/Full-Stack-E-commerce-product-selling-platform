import { api, id, json } from "./client";

export const superAdminApi = {
  summary: () => api<unknown>("/api/super-admin/summary"),
  admins: (query: URLSearchParams = new URLSearchParams()) =>
    api<unknown>(`/api/super-admin/admins?${query}`),
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
