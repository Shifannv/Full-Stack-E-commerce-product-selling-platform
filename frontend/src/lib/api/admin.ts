import { api, id, json } from "./client";
import type {
  AdminCategoryConfig,
  AdminFinance,
  AdminOrder,
  AdminProductDetail,
  AdminProductSummary,
  AdminReturnDetail,
  AdminReturnsResponse,
  AdminSummary,
  InventoryRow,
  PayoutRequest,
  Shipment,
} from "./types";
import type { SellerApplication } from "./seller-lifecycle";

export const adminApi = {
  summary: () => api<AdminSummary>("/api/admin/summary"),
  products: (query: URLSearchParams = new URLSearchParams()) =>
    api<{ products: AdminProductSummary[]; limit: number; offset: number }>(
      `/api/admin/products?${query}`,
    ),
  /** Full detail for prefilling the editor. Foreign products answer 404 by design. */
  product: (productId: string) =>
    api<AdminProductDetail>(`/api/admin/products/${id(productId)}`),
  onboarding: () => api<SellerApplication>("/api/admin/onboarding"),
  categories: () =>
    api<{ categories: AdminCategoryConfig[] }>("/api/admin/categories"),
  createProduct: (input: Record<string, unknown>) =>
    api<unknown>("/api/admin/products", { method: "POST", body: json(input) }),
  updateProduct: (productId: string, input: Record<string, unknown>) =>
    api<unknown>(`/api/admin/products/${id(productId)}`, {
      method: "PATCH",
      body: json(input),
    }),
  /** Current inventory rows and their optimistic-concurrency versions. */
  inventoryRows: (productId: string) =>
    api<{ inventories: InventoryRow[] }>(
      `/api/admin/products/${id(productId)}/inventory`,
    ),
  /**
   * `expectedVersion` must be the `version` read from `inventoryRows`. A stale
   * value is rejected with 409 INVENTORY_VERSION_STALE rather than overwriting
   * a newer quantity. Use 0 only to create a missing row.
   */
  inventory: (
    productId: string,
    quantity: number,
    expectedVersion: number,
    variantId?: string,
  ) =>
    api<InventoryRow>(`/api/admin/products/${id(productId)}/inventory`, {
      method: "PUT",
      body: json({ quantity, variantId, expectedVersion }),
    }),
  /** Unpaginated by contract — the Worker returns every scoped order. */
  orders: () => api<{ orders: AdminOrder[] }>("/api/admin/orders"),
  /** Returns a bare order object, not wrapped in a key. */
  order: (orderId: string) =>
    api<AdminOrder>(`/api/admin/orders/${id(orderId)}`),
  tracking: (orderId: string) =>
    api<{ shipments: Shipment[] }>(
      `/api/admin/orders/${id(orderId)}/tracking`,
    ),
  finance: () => api<AdminFinance>("/api/admin/finance"),
  requestPayout: () =>
    api<PayoutRequest>("/api/admin/payouts", { method: "POST", body: "{}" }),
  /** Seller-scoped queue; `status`, `limit` (max 50) and `offset` are the only filters. */
  returns: (query: URLSearchParams = new URLSearchParams()) =>
    api<AdminReturnsResponse>(`/api/admin/returns?${query}`),
  returnStatus: (returnId: string) =>
    api<AdminReturnDetail>(`/api/admin/returns/${id(returnId)}`),
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
