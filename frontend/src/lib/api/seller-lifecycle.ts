import { api, id, json } from "./client";

export type BankSummary = { accountLast4: string; status: string; revision: string; reviewNotes: string | null };
export type BankDetails = { accountHolder: string; bankName: string; accountNumber: string; ifsc: string; revision: string };
export type SellerApplication = {
  profile: { id: string; status: string };
  application: { legalName: string; businessType: string; contactPhone: string; status: string; reviewNotes: string | null } | null;
  documents: { id: string; documentType: string }[];
  addresses: { addressType: string; contactName: string; phone: string; line1: string; line2?: string; city: string; state: string; postalCode: string; country: string; isActive: boolean }[];
  categories: { categoryId: string; status: string }[];
  bank: BankSummary | null;
};
export const sellerLifecycle = {
  publishedCategories: () => api<{ categories: { id: string; name: string }[] }>("/api/categories"),
  provision: (input: Record<string, unknown>) => api<{ adminId: string; email: string }>("/api/admin/review/provision", { method: "POST", body: json(input) }),
  review: (adminId: string) => api<SellerApplication>(`/api/admin/review/${id(adminId)}`),
  revealBank: (adminId: string) => api<BankDetails>(`/api/admin/review/${id(adminId)}/bank/reveal`, { method: "POST", body: "{}" }),
  verifyBank: (adminId: string, input: Record<string, unknown>) => api<BankSummary>(`/api/admin/review/${id(adminId)}/bank/decision`, { method: "POST", body: json(input) }),
  decision: (adminId: string, decision: string, notes: string) => api<unknown>(`/api/admin/review/${id(adminId)}/decision`, { method: "POST", body: json({ decision, notes }) }),
  onboarding: () => api<SellerApplication>("/api/admin/onboarding"),
};
