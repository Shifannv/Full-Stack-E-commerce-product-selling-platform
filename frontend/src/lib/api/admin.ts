import { api, id, json } from "./client";
import type { AdminProductSummary, ReturnStatus } from "./types";

export const adminApi = {
  summary: () => api<unknown>("/api/admin/summary"),
  products: (query: URLSearchParams = new URLSearchParams()) =>
    api<{ products: AdminProductSummary[]; limit: number; offset: number }>(
      `/api/admin/products?${query}`,
    ),
  onboarding: () => api<unknown>("/api/admin/onboarding"),
  categories: () => api<unknown>("/api/admin/categories"),
  createProduct: (input: Record<string, unknown>) =>
    api<unknown>("/api/admin/products", { method: "POST", body: json(input) }),
  updateProduct: (productId: string, input: Record<string, unknown>) =>
    api<unknown>(`/api/admin/products/${id(productId)}`, {
      method: "PATCH",
      body: json(input),
    }),
  inventory: (productId: string, quantity: number, expectedVersion: number, variantId?: string) =>
    api<unknown>(`/api/admin/products/${id(productId)}/inventory`, {
      method: "PUT",
      body: json({ quantity, variantId, expectedVersion }),
    }),
  orders: () => api<unknown>("/api/admin/orders"),
  tracking: (orderId: string) =>
    api<unknown>(`/api/admin/orders/${id(orderId)}/tracking`),
  finance: () => api<unknown>("/api/admin/finance"),
  requestPayout: () =>
    api<unknown>("/api/admin/payouts", { method: "POST", body: "{}" }),
  returnStatus: (returnId: string) =>
    api<ReturnStatus>(`/api/admin/returns/${id(returnId)}`),
  decideReturn: (returnId: string, approve: boolean, notes: string) =>
    api<unknown>(`/api/admin/returns/${id(returnId)}/decision`, {
      method: "POST",
      body: json({ approve, notes }),
    }),
  receivedReturn: (returnId: string) =>
    api<unknown>(`/api/admin/returns/${id(returnId)}/received`, {
      method: "POST",
      body: "{}",
    }),
  inspectReturn: (
    returnId: string,
    decision: "APPROVED" | "REJECTED",
    conditionStatus: string,
    notes: string,
  ) =>
    api<unknown>(`/api/admin/returns/${id(returnId)}/inspection`, {
      method: "POST",
      body: json({ decision, conditionStatus, notes }),
    }),
};
