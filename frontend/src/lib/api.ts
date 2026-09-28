// Browser-facing contracts only. Eligibility, amounts, approval and permissions stay on the Worker.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export type Actor = { userId: string; roles: string[]; permissions: string[]; adminApproved: boolean };
export type Product = { id: string; name: string; slug: string; price: string; currency: string; categorySlug: string; returnEnabled: boolean; featured?: boolean; image: { objectKey: string; altText: string | null } | null; available: boolean; rating: number | null; reviewCount: number; createdAt: string };
export type ProductDetail = Omit<Product, "categorySlug" | "image"> & { categoryId: string; description: string | null; attributes: Record<string, unknown>; variants: Array<{ id: string; title: string; price: string }>; images: Array<{ id: string; objectKey: string; altText: string | null }> };
export type CustomerAddress = { id: string; label: string; contactName: string; phone: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string; isDefault: boolean };
export type CartItem = { id: string; productId: string; variantId: string | null; name: string; slug: string; variantTitle: string | null; price: string; currency: string; quantity: number };
export type Cart = { items: CartItem[]; subtotal: string };
export type CheckoutQuote = { items: Array<{ productId: string; variantId: string | null; name: string; variantTitle: string | null; quantity: number; unitPrice: string; lineTotal: string; available: boolean }>; subtotal: string; discountAmount: string; shippingAmount: string; totalAmount: string | null; currency: string; valid: boolean; problems: string[] };
export type Order = { id: string; orderNumber: string; status: string; paymentStatus: string; deliveredAt: string | null; createdAt: string; currency: string; subtotal: string; shippingAmount: string; discountAmount: string; totalAmount: string; shippingAddressSnapshot: Omit<CustomerAddress, "id" | "label" | "isDefault">; items?: Array<{ id: string; productId: string; productNameSnapshot: string; variantTitleSnapshot: string | null; quantity: number; unitPrice: string; totalAmount: string }> };
export type Shipment = { id: string; carrierName: string | null; awbNumber: string | null; trackingUrl: string | null; status: string; estimatedDeliveryDate: string | null; deliveredAt: string | null; events: Array<{ status: string; location: string | null; description: string | null; eventTime: string | null }> };
export type ReturnStatus = { id: string; orderId: string; status: string; returnAddress: Record<string, string | null> | null; grossRefundAmount: string | null; deductionAmount: string | null; netRefundAmount: string | null; refund: { status: string; amount: string } | null };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiOrigin) throw new Error("NEXT_PUBLIC_API_URL is required");
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(new URL(path, apiOrigin), { ...init, headers, credentials: "include", cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : `API request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

const id = (value: string) => encodeURIComponent(value);
const json = (value: unknown) => JSON.stringify(value);

export const authApi = {
  me: () => api<Actor>("/api/me"),
  signIn: (email: string, password: string) => api<unknown>("/api/auth/sign-in/email", { method: "POST", body: json({ email, password }) }),
  signOut: () => api<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
};

export const customerApi = {
  products: (query: URLSearchParams = new URLSearchParams()) => api<{ products: Product[] }>(`/api/products?${query}`),
  product: (slug: string) => api<ProductDetail>(`/api/products/${id(slug)}`),
  reviews: (productId: string) => api<{ reviews: Array<{ id: string; rating: number; title: string; body: string; createdAt: string }> }>(`/api/products/${id(productId)}/reviews`),
  cart: () => api<Cart>("/api/customer/cart"),
  checkoutQuote: (addressId: string) => api<CheckoutQuote>(`/api/customer/checkout/quote?addressId=${id(addressId)}`),
  wishlist: () => api<{ products: Array<{ productId: string; name: string; slug: string; price: string; currency: string }> }>("/api/customer/wishlist"),
  setWishlist: (productId: string, enabled: boolean) => api<{ productId: string; enabled: boolean }>(`/api/customer/wishlist/${id(productId)}`, { method: "PUT", body: json({ enabled }) }),
  removeCartItem: (itemId: string) => api<unknown>(`/api/customer/cart/items/${id(itemId)}`, { method: "DELETE" }),
  addresses: () => api<{ addresses: CustomerAddress[] }>("/api/customer/addresses"),
  saveAddress: (value: Omit<CustomerAddress, "id">, addressId?: string) => api<CustomerAddress>(addressId ? `/api/customer/addresses/${id(addressId)}` : "/api/customer/addresses", { method: addressId ? "PUT" : "POST", body: json(value) }),
  deleteAddress: (addressId: string) => api<unknown>(`/api/customer/addresses/${id(addressId)}`, { method: "DELETE" }),
  order: (orderId: string) => api<Order>(`/api/orders/${id(orderId)}`),
  setCartItem: (productId: string, quantity: number, variantId?: string) => api<unknown>(`/api/customer/cart/items/${id(productId)}`, { method: "PUT", body: json({ quantity, variantId }) }),
  checkout: (addressId: string) => api<{ order: Order }>("/api/checkout", { method: "POST", body: json({ addressId }) }),
  paymentSession: (orderId: string) => api<{ orderId: string; paymentSessionId: string }>(`/api/orders/${id(orderId)}/payment-session`, { method: "POST", body: "{}" }),
  orders: () => api<{ orders: Order[] }>("/api/orders"),
  tracking: (orderId: string) => api<{ shipments: Shipment[] }>(`/api/orders/${id(orderId)}/tracking`),
  review: (orderItemId: string, rating: number, title: string, body: string) => api<unknown>("/api/reviews", { method: "POST", body: json({ orderItemId, rating, title, body }) }),
  requestReturn: (orderItemId: string, quantity: number, reason: string, customerNotes?: string) => api<{ id: string; status: string }>("/api/returns", { method: "POST", body: json({ orderItemId, quantity, reason, customerNotes }) }),
  returnStatus: (returnId: string) => api<ReturnStatus>(`/api/returns/${id(returnId)}`),
};

export const adminApi = {
  summary: () => api<unknown>("/api/admin/summary"),
  products: (query: URLSearchParams = new URLSearchParams()) => api<{ products: Product[] }>(`/api/admin/products?${query}`),
  onboarding: () => api<unknown>("/api/admin/onboarding"),
  categories: () => api<unknown>("/api/admin/categories"),
  createProduct: (input: Record<string, unknown>) => api<unknown>("/api/admin/products", { method: "POST", body: json(input) }),
  updateProduct: (productId: string, input: Record<string, unknown>) => api<unknown>(`/api/admin/products/${id(productId)}`, { method: "PATCH", body: json(input) }),
  inventory: (productId: string, quantity: number, variantId?: string) => api<unknown>(`/api/admin/products/${id(productId)}/inventory`, { method: "PUT", body: json({ quantity, variantId }) }),
  orders: () => api<unknown>("/api/admin/orders"),
  tracking: (orderId: string) => api<unknown>(`/api/admin/orders/${id(orderId)}/tracking`),
  finance: () => api<unknown>("/api/admin/finance"),
  requestPayout: () => api<unknown>("/api/admin/payouts", { method: "POST", body: "{}" }),
  returnStatus: (returnId: string) => api<ReturnStatus>(`/api/admin/returns/${id(returnId)}`),
  decideReturn: (returnId: string, approve: boolean, notes: string) => api<unknown>(`/api/admin/returns/${id(returnId)}/decision`, { method: "POST", body: json({ approve, notes }) }),
  receivedReturn: (returnId: string) => api<unknown>(`/api/admin/returns/${id(returnId)}/received`, { method: "POST", body: "{}" }),
  inspectReturn: (returnId: string, decision: "APPROVED" | "REJECTED", conditionStatus: string, notes: string) => api<unknown>(`/api/admin/returns/${id(returnId)}/inspection`, { method: "POST", body: json({ decision, conditionStatus, notes }) }),
};

export const superAdminApi = {
  summary: () => api<unknown>("/api/super-admin/summary"),
  admins: (query: URLSearchParams = new URLSearchParams()) => api<unknown>(`/api/super-admin/admins?${query}`),
  reviewAdmin: (adminId: string) => api<unknown>(`/api/admin/review/${id(adminId)}`),
  decideAdmin: (adminId: string, decision: "APPROVED" | "CHANGES_REQUIRED" | "REJECTED", notes: string) => api<unknown>(`/api/admin/review/${id(adminId)}/decision`, { method: "POST", body: json({ decision, notes }) }),
  moderateReview: (reviewId: string, decision: "PUBLISHED" | "REJECTED", notes: string) => api<unknown>(`/api/super-admin/reviews/${id(reviewId)}/moderate`, { method: "POST", body: json({ decision, notes }) }),
  authorizeRefund: (returnId: string) => api<unknown>(`/api/super-admin/returns/${id(returnId)}/refund/authorize`, { method: "POST", body: "{}" }),
};
