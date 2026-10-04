// Browser-facing contracts only.

export type Actor = {
  userId: string;
  roles: string[];
  permissions: string[];
  adminApproved: boolean;
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  price: string;
  currency: string;
  categorySlug: string;
  category?: string;
  subcategory?: string;
  subcategorySlug?: string;
  returnEnabled: boolean;
  featured?: boolean;
  image: { objectKey: string; altText: string | null } | null;
  available: boolean;
  rating: number | null;
  reviewCount: number;
  createdAt: string;
};
export type AdminProductSummary = {
  id: string;
  name: string;
  slug: string;
  price: string;
  currency: string;
  status: string;
  featured: boolean;
  returnEnabled: boolean;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  createdAt: string;
  updatedAt: string;
};
export type ProductDetail = Omit<Product, "categorySlug" | "image"> & {
  categoryId: string;
  description: string | null;
  attributes: Record<string, unknown>;
  variants: Array<{ id: string; title: string; price: string }>;
  images: Array<{ id: string; objectKey: string; altText: string | null }>;
};
export type CustomerAddress = {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};
export type CartItem = {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  variantTitle: string | null;
  price: string;
  currency: string;
  quantity: number;
};
export type Cart = { items: CartItem[]; subtotal: string };
export type CheckoutQuote = {
  cartVersion: number;
  lineFingerprint: string;
  items: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    variantTitle: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    available: boolean;
  }>;
  subtotal: string;
  discountAmount: string;
  shippingAmount: string;
  totalAmount: string | null;
  currency: string;
  valid: boolean;
  problems: string[];
};
export type CheckoutResult = { orderId: string; status: string; paymentStatus: string; stockState: string; totalAmount: string; currency: string; paymentDeadline: string; replayed: boolean };
export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveredAt: string | null;
  createdAt: string;
  currency: string;
  subtotal: string;
  shippingAmount: string;
  discountAmount: string;
  totalAmount: string;
  shippingAddressSnapshot: Omit<CustomerAddress, "id" | "label" | "isDefault">;
  items?: Array<{
    id: string;
    productId: string;
    productNameSnapshot: string;
    variantTitleSnapshot: string | null;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
  }>;
};
export type Shipment = {
  id: string;
  carrierName: string | null;
  awbNumber: string | null;
  trackingUrl: string | null;
  status: string;
  estimatedDeliveryDate: string | null;
  deliveredAt: string | null;
  events: Array<{
    status: string;
    location: string | null;
    description: string | null;
    eventTime: string | null;
  }>;
};
export type ReturnStatus = {
  id: string;
  orderId: string;
  status: string;
  returnAddress: Record<string, string | null> | null;
  grossRefundAmount: string | null;
  deductionAmount: string | null;
  netRefundAmount: string | null;
  refund: { status: string; amount: string } | null;
};
