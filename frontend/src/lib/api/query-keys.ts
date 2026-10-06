// Central query-key factory so a mutation can invalidate exactly the lists it affects instead
// of the previous pattern of a manual `setRetry(v => v + 1)` counter per page.
export const operatorKeys = {
  adminSummary: () => ["admin", "summary"] as const,
  adminFinance: () => ["admin", "finance"] as const,
  adminCategories: () => ["admin", "categories"] as const,
  adminProducts: (query: string) => ["admin", "products", query] as const,
  adminProduct: (productId: string) => ["admin", "products", "detail", productId] as const,
  adminInventory: (productId: string) => ["admin", "inventory", productId] as const,
  adminOrders: () => ["admin", "orders"] as const,
  adminOrder: (orderId: string) => ["admin", "orders", "detail", orderId] as const,
  adminReturns: (query: string) => ["admin", "returns", query] as const,
  adminReturn: (returnId: string) => ["admin", "returns", "detail", returnId] as const,
  onboarding: () => ["onboarding"] as const,

  superSummary: () => ["super-admin", "summary"] as const,
  superAdmins: (query: string) => ["super-admin", "admins", query] as const,
  sellerReview: (adminId: string) => ["super-admin", "admins", "detail", adminId] as const,
  superProducts: (query: string) => ["super-admin", "products", query] as const,
  superPayouts: (query: string) => ["super-admin", "payouts", query] as const,
  superSettlements: (query: string) => ["super-admin", "settlements", query] as const,
  superRoles: () => ["super-admin", "roles"] as const,
  superLifecycle: (query: string) => ["super-admin", "lifecycle", query] as const,
  superReconciliation: (query: string) => ["super-admin", "reconciliation", query] as const,
  superReconciliationItem: (itemId: string) =>
    ["super-admin", "reconciliation", "detail", itemId] as const,
  superPendingReviews: () => ["super-admin", "reviews", "pending"] as const,
  superFinanceSettings: () => ["super-admin", "finance-settings"] as const,
};
