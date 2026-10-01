import { api, id, json } from "./client";
import type { Product, ProductDetail, CustomerAddress, Cart, CheckoutQuote, Order, Shipment, ReturnStatus } from "./types";

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
