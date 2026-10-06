// Browser-facing contracts only.

export type Actor = {
  userId: string;
  roles: string[];
  permissions: string[];
  adminApproved: boolean;
  mustChangePassword?: boolean;
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
  variants: Array<{
    id: string;
    title: string;
    price: string | null;
    available: boolean;
  }>;
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
export type OrderItem = {
  id: string;
  productId: string;
  productNameSnapshot: string;
  variantTitleSnapshot: string | null;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  deliveredAt: string | null;
  reviewStatus: string | null;
  reviewEligible: boolean;
  reviewEligibilityReasons: string[];
  returnEligible: boolean;
  returnEligibilityReasons: string[];
  remainingReturnableQuantity: number;
  returnWindowEndsAt: string | null;
};
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
  cancellationEligible: boolean;
  cancellationEligibilityReasons: string[];
  cancellationDeadline: string | null;
  shippingAddressSnapshot: Omit<CustomerAddress, "id" | "label" | "isDefault">;
  items: OrderItem[];
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
  refund: {
    status: string;
    amount: string;
    providerReference: string | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Operator (ADMIN / SUPER_ADMIN) contracts.
//
// Every shape below was read from the Worker handler or the Drizzle table it
// selects, not inferred. Numeric money columns serialize as decimal STRINGS;
// quantities, versions and sort orders are NUMBERS; timestamps are ISO strings.
// ---------------------------------------------------------------------------

/** Seller account / application states (admins.status). */
export type AdminStatus =
  | "DRAFT"
  | "PENDING"
  | "PENDING_SUPER_ADMIN_APPROVAL"
  | "CHANGES_REQUIRED"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED";

/** products.status (catalog check constraint). */
export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** payout_requests.status check constraint. */
export type PayoutStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "PAID";

/** admin_settlements.status check constraint. */
export type SettlementStatus = "AVAILABLE" | "PAYOUT_PENDING" | "PAID" | "HELD";

/** returns.status check constraint. */
export type ReturnState =
  | "REQUESTED"
  | "APPROVED"
  | "RETURN_PENDING"
  | "RECEIVED"
  | "QC_IN_PROGRESS"
  | "QC_APPROVED"
  | "QC_REJECTED"
  | "REFUND_PROCESSING"
  | "REFUNDED"
  | "RETURN_ISSUE"
  | "REJECTED";

/** category_product_fields.input_type check constraint. */
export type CategoryFieldInputType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

/** Operational address snapshot stored on an order (AddressSnapshot in the backend). */
export type AddressSnapshot = {
  contactName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  businessName?: string | null;
};

/** GET /api/admin/summary — database aggregates for the signed-in seller. */
export type AdminSummary = {
  products: { total: number };
  /** `confirmedPaid` counts orders that are both PAID and CONFIRMED, not shipments. */
  orders: { total: number; confirmedPaid: number };
  finance: {
    availableBalance: string;
    grossSettledSales: string;
    pendingPayoutRequests: number;
  };
};

export type AdminCategoryField = {
  key: string;
  label: string;
  inputType: CategoryFieldInputType;
  required: boolean;
  options: string[] | null;
  sortOrder: number;
};

/**
 * GET /api/admin/categories — only ACTIVE assignments on PUBLISHED categories,
 * so this list is exactly the selling scope the backend will accept.
 */
export type AdminCategoryConfig = {
  id: string;
  name: string;
  slug: string;
  status: string;
  subcategories: Array<{ id: string; name: string; slug: string }>;
  fields: AdminCategoryField[];
};

/**
 * GET /api/admin/products/:productId/inventory — `version` is the optimistic
 * concurrency token that must be echoed back as `expectedVersion` on write.
 */
export type InventoryRow = {
  id: string;
  productId: string;
  variantId: string | null;
  availableQuantity: number;
  reservedQuantity: number;
  version: number;
  updatedAt: string;
};

/** admin_settlements row. Carries the full seller-facing finance breakdown. */
export type Settlement = {
  id: string;
  adminId: string;
  orderId: string;
  orderItemId: string;
  grossAmount: string;
  commissionAmount: string;
  gatewayFeeAmount: string;
  refundAdjustmentAmount: string;
  netPayable: string;
  status: SettlementStatus;
  createdAt: string;
  updatedAt: string;
};

/** payout_requests row. */
export type PayoutRequest = {
  id: string;
  adminId: string;
  amount: string;
  status: PayoutStatus;
  requestedAt: string;
  reviewedByUserId: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RefundObligation = {
  refundId: string;
  orderId: string;
  orderItemId: string;
  amount: string;
  currency: string;
  status: string;
};

/** GET /api/admin/finance. */
export type AdminFinance = {
  availableBalance: string;
  settlements: Settlement[];
  payouts: PayoutRequest[];
  refundObligations: RefundObligation[];
};

/** order_items row, scoped to the requesting seller by the Worker. */
export type AdminOrderItem = {
  id: string;
  orderId: string;
  adminId: string;
  productId: string;
  variantId: string | null;
  productNameSnapshot: string;
  variantTitleSnapshot: string | null;
  skuSnapshot: string | null;
  unitPrice: string;
  weightKgSnapshot: string | null;
  lengthCmSnapshot: string | null;
  breadthCmSnapshot: string | null;
  heightCmSnapshot: string | null;
  quantity: number;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  createdAt: string;
};

/**
 * GET /api/admin/orders (array) and GET /api/admin/orders/:orderId (single, bare
 * object). `adminSubtotal` is this seller's share only, not the order total.
 */
export type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  paymentStatus: string;
  shippingAddress: AddressSnapshot;
  placedAt: string | null;
  createdAt: string;
  adminSubtotal: string;
  items: AdminOrderItem[];
};

/** One row of GET /api/admin/returns (seller-scoped). */
export type AdminReturnRow = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  status: ReturnState;
  reason: string;
  requestedAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  qcStatus: string | null;
  grossRefundAmount: string | null;
  deductionAmount: string | null;
  netRefundAmount: string | null;
  deliveredAt: string | null;
  /**
   * Computed by the Worker as delivered_at + the configured return window. Null when the order
   * is not delivered or the policy is not configured — never guessed in the browser.
   */
  returnWindowEndsAt: string | null;
  itemCount: number;
  totalQuantity: number;
  refund: { status: string; amount: string } | null;
};

export type AdminReturnsResponse = {
  returns: AdminReturnRow[];
  limit: number;
  offset: number;
};

/** GET /api/admin/returns/:returnId — richer than the customer-facing ReturnStatus. */
export type AdminReturnDetail = ReturnStatus & {
  reason: string;
  customerNotes: string | null;
  requestedAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  qcStatus: string | null;
  qcNotes: string | null;
  status: ReturnState;
};

export type AdminProductVariant = {
  id: string;
  sku: string;
  title: string;
  price: string | null;
  attributes: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductImage = {
  id: string;
  variantId: string | null;
  objectKey: string;
  altText: string | null;
  sortOrder: number;
};

/** GET /api/admin/products/:productId — every field an editor needs to prefill. */
export type AdminProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  status: ProductStatus;
  attributes: Record<string, unknown> | null;
  returnEnabled: boolean;
  featured: boolean;
  weightKg: string | null;
  lengthCm: string | null;
  breadthCm: string | null;
  heightCm: string | null;
  categoryId: string;
  category: string;
  categorySlug: string;
  subcategoryId: string;
  subcategory: string;
  subcategorySlug: string;
  createdAt: string;
  updatedAt: string;
  variants: AdminProductVariant[];
  images: AdminProductImage[];
};

/** GET /api/super-admin/reviews/pending — a `reviews` row. */
export type PendingReview = {
  id: string;
  productId: string;
  orderItemId: string | null;
  customerId: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  moderatedByUserId: string | null;
  moderationNotes: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * GET /api/super-admin/finance-settings. Basis points: 100 bps = 1%.
 * "Commission" is platform revenue; "Payment Gateway Fee" is the provider cost passed to the seller.
 */
export type FinanceSettings = { commissionBps: number; gatewayFeeBps: number };

export type SettlementsResponse = {
  settlements: Settlement[];
  limit: number;
  offset: number;
};
