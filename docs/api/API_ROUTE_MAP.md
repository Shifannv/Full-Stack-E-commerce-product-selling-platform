# API Route Map

Generated from the route sources on 2026-10-01 (after the structure refactor). Mount order lives in `backend/src/routes/index.ts`; **order is behavior** (see [REFACTORING_GUIDE](../development/REFACTORING_GUIDE.md)). Handler registrations below: 103 (excluding middleware).

Authentication/role enforcement lives in each handler or router middleware (`requireAuth`, role/permission checks), not in this table; this table is the HTTP surface only. Provider-authenticated routes (webhooks) use provider secrets/signatures, not sessions. Several routers mix audiences under one `use("*", requireAuth)` (orders, returns, finance, reviews, shipping); they are filed under their primary domain, not split.

Global: for `/api/*`, CORS (origin must equal `FRONTEND_ORIGIN`, credentials on) then `mutationOrigin`. Registered directly: `ALL /api/auth/*` (Better Auth), `GET /health`, `GET /health/db`, `GET /api/me`.

## publicCatalogRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| GET | `/api/categories` | `backend/src/routes/customer/customer.ts` |
| GET | `/api/products` | `backend/src/routes/customer/customer.ts` |
| GET | `/api/products/:slug` | `backend/src/routes/customer/customer.ts` |

## publicReviewRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| GET | `/api/products/:productId/reviews` | `backend/src/routes/customer/reviews.ts` |

## adminActivationRoutes — mounted at `/api/admin`

| Method | Path | Source |
|---|---|---|
| GET | `/api/admin/activate` | `backend/src/routes/admin/activation.ts` |
| POST | `/api/admin/activate` | `backend/src/routes/admin/activation.ts` |

## adminLifecycleRoutes — mounted at `/api/admin`

| Method | Path | Source |
|---|---|---|
| GET | `/api/admin/account/lifecycle` | `backend/src/routes/admin/admin-lifecycle.ts` |
| POST | `/api/admin/account/deletion-requests` | `backend/src/routes/admin/admin-lifecycle.ts` |
| POST | `/api/admin/account/deletion-requests/:requestId/verify` | `backend/src/routes/admin/admin-lifecycle.ts` |
| POST | `/api/admin/account/recovery-requests` | `backend/src/routes/admin/admin-lifecycle.ts` |
| GET | `/api/admin/review/:adminId/lifecycle` | `backend/src/routes/admin/admin-lifecycle.ts` |
| POST | `/api/admin/review/:adminId/deletion-requests/:requestId/decision` | `backend/src/routes/admin/admin-lifecycle.ts` |
| POST | `/api/admin/review/:adminId/recovery-requests/:requestId/decision` | `backend/src/routes/admin/admin-lifecycle.ts` |

## customerRoutes — mounted at `/api/customer`

| Method | Path | Source |
|---|---|---|
| GET | `/api/customer/addresses` | `backend/src/routes/customer/customer.ts` |
| POST | `/api/customer/addresses` | `backend/src/routes/customer/customer.ts` |
| PUT | `/api/customer/addresses/:addressId` | `backend/src/routes/customer/customer.ts` |
| DELETE | `/api/customer/addresses/:addressId` | `backend/src/routes/customer/customer.ts` |
| GET | `/api/customer/cart` | `backend/src/routes/customer/customer.ts` |
| GET | `/api/customer/checkout/quote` | `backend/src/routes/customer/customer.ts` |
| PUT | `/api/customer/cart/items/:productId` | `backend/src/routes/customer/customer.ts` |
| DELETE | `/api/customer/cart/items/:itemId` | `backend/src/routes/customer/customer.ts` |
| GET | `/api/customer/wishlist` | `backend/src/routes/customer/customer.ts` |
| PUT | `/api/customer/wishlist/:productId` | `backend/src/routes/customer/customer.ts` |

## orderRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| POST | `/api/checkout` | `backend/src/routes/customer/orders.ts` |
| GET | `/api/orders` | `backend/src/routes/customer/orders.ts` |
| GET | `/api/orders/:orderId` | `backend/src/routes/customer/orders.ts` |
| POST | `/api/orders/:orderId/cancel` | `backend/src/routes/customer/orders.ts` |
| GET | `/api/admin/orders` | `backend/src/routes/customer/orders.ts` |
| GET | `/api/admin/orders/:orderId` | `backend/src/routes/customer/orders.ts` |

## reviewRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| POST | `/api/reviews` | `backend/src/routes/customer/reviews.ts` |
| GET | `/api/super-admin/reviews/pending` | `backend/src/routes/customer/reviews.ts` |
| POST | `/api/super-admin/reviews/:reviewId/moderate` | `backend/src/routes/customer/reviews.ts` |

## financeRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| GET | `/api/admin/finance` | `backend/src/routes/super-admin/finance.ts` |
| POST | `/api/admin/payouts` | `backend/src/routes/super-admin/finance.ts` |
| GET | `/api/super-admin/finance-settings` | `backend/src/routes/super-admin/finance.ts` |
| PUT | `/api/super-admin/finance-settings/commission` | `backend/src/routes/super-admin/finance.ts` |
| PUT | `/api/super-admin/finance-settings/payment-gateway-fee` | `backend/src/routes/super-admin/finance.ts` |
| POST | `/api/super-admin/settlements` | `backend/src/routes/super-admin/finance.ts` |
| POST | `/api/super-admin/payouts/:payoutId/decision` | `backend/src/routes/super-admin/finance.ts` |
| POST | `/api/super-admin/payouts/:payoutId/paid` | `backend/src/routes/super-admin/finance.ts` |

## paymentRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| POST | `/api/orders/:orderId/payment-session` | `backend/src/routes/customer/payments.ts` |

## adminRoutes — mounted at `/api/admin`

| Method | Path | Source |
|---|---|---|
| POST | `/api/admin/catalog/categories` | `backend/src/routes/admin/catalog.ts` |
| PATCH | `/api/admin/catalog/categories/:categoryId/status` | `backend/src/routes/admin/catalog.ts` |
| POST | `/api/admin/catalog/subcategories` | `backend/src/routes/admin/catalog.ts` |
| PATCH | `/api/admin/catalog/subcategories/:subcategoryId/status` | `backend/src/routes/admin/catalog.ts` |
| PATCH | `/api/admin/catalog/products/:productId/status` | `backend/src/routes/admin/catalog.ts` |
| PATCH | `/api/admin/catalog/products/:productId/featured` | `backend/src/routes/admin/catalog.ts` |
| PUT | `/api/admin/catalog/fields` | `backend/src/routes/admin/catalog.ts` |
| GET | `/api/admin/onboarding` | `backend/src/routes/admin/onboarding.ts` |
| PUT | `/api/admin/onboarding/kyc` | `backend/src/routes/admin/onboarding.ts` |
| POST | `/api/admin/onboarding/kyc/documents` | `backend/src/routes/admin/onboarding.ts` |
| PUT | `/api/admin/onboarding/addresses/:type` | `backend/src/routes/admin/onboarding.ts` |
| POST | `/api/admin/onboarding/categories/:categoryId` | `backend/src/routes/admin/onboarding.ts` |
| POST | `/api/admin/onboarding/submit` | `backend/src/routes/admin/onboarding.ts` |
| GET | `/api/admin/categories` | `backend/src/routes/admin/products.ts` |
| GET | `/api/admin/summary` | `backend/src/routes/admin/products.ts` |
| GET | `/api/admin/products` | `backend/src/routes/admin/products.ts` |
| POST | `/api/admin/subcategories` | `backend/src/routes/admin/products.ts` |
| POST | `/api/admin/products` | `backend/src/routes/admin/products.ts` |
| PATCH | `/api/admin/products/:productId` | `backend/src/routes/admin/products.ts` |
| POST | `/api/admin/products/:productId/variants` | `backend/src/routes/admin/products.ts` |
| POST | `/api/admin/products/:productId/images` | `backend/src/routes/admin/products.ts` |
| POST | `/api/admin/products/:productId/images/upload` | `backend/src/routes/admin/products.ts` |
| PUT | `/api/admin/products/:productId/inventory` | `backend/src/routes/admin/products.ts` |
| GET | `/api/admin/review/:adminId` | `backend/src/routes/admin/review.ts` |
| POST | `/api/admin/review/provision` | `backend/src/routes/admin/review.ts` |
| POST | `/api/admin/review/invite` | `backend/src/routes/admin/review.ts` |
| POST | `/api/admin/review/reinvite` | `backend/src/routes/admin/review.ts` |
| GET | `/api/admin/review/:adminId/documents/:documentId` | `backend/src/routes/admin/review.ts` |
| PATCH | `/api/admin/review/:adminId/kyc` | `backend/src/routes/admin/review.ts` |
| PUT | `/api/admin/review/:adminId/addresses/:type` | `backend/src/routes/admin/review.ts` |
| POST | `/api/admin/review/:adminId/decision` | `backend/src/routes/admin/review.ts` |
| POST | `/api/admin/review/:adminId/status` | `backend/src/routes/admin/review.ts` |
| PUT | `/api/admin/review/:adminId/categories/:categoryId` | `backend/src/routes/admin/review.ts` |
| PUT | `/api/admin/shipping/providers/shiprocket` | `backend/src/routes/admin/shipping.ts` |
| PUT | `/api/admin/shipping/pickup-locations` | `backend/src/routes/admin/shipping.ts` |
| GET | `/api/admin/shipping/provider-pickups` | `backend/src/routes/admin/shipping.ts` |
| GET | `/api/admin/shipping/serviceability` | `backend/src/routes/admin/shipping.ts` |

## superAdminDashboardRoutes — mounted at `/api/super-admin`

| Method | Path | Source |
|---|---|---|
| GET | `/api/super-admin/summary` | `backend/src/routes/super-admin/dashboard.ts` |
| GET | `/api/super-admin/admins` | `backend/src/routes/super-admin/dashboard.ts` |

## reconciliationRoutes — mounted at `/api/super-admin`

| Method | Path | Source |
|---|---|---|
| GET | `/api/super-admin/reconciliation` | `backend/src/routes/super-admin/reconciliation.ts` |
| GET | `/api/super-admin/reconciliation/:id` | `backend/src/routes/super-admin/reconciliation.ts` |
| POST | `/api/super-admin/reconciliation/:id/resolve` | `backend/src/routes/super-admin/reconciliation.ts` |
| POST | `/api/super-admin/reconciliation/:id/escalate` | `backend/src/routes/super-admin/reconciliation.ts` |

## shippingRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| GET | `/api/super-admin/shipping/operations` | `backend/src/routes/super-admin/shipping.ts` |
| POST | `/api/super-admin/shipping/reconcile` | `backend/src/routes/super-admin/shipping.ts` |
| POST | `/api/super-admin/shipping/operations/:id/retry` | `backend/src/routes/super-admin/shipping.ts` |
| POST | `/api/super-admin/shipping/operations/:id/evidence` | `backend/src/routes/super-admin/shipping.ts` |
| GET | `/api/orders/:orderId/tracking` | `backend/src/routes/super-admin/shipping.ts` |
| GET | `/api/admin/orders/:orderId/tracking` | `backend/src/routes/super-admin/shipping.ts` |
| POST | `/api/admin/orders/:orderId/shipments` | `backend/src/routes/super-admin/shipping.ts` |
| POST | `/api/admin/shipments/:shipmentId/awb` | `backend/src/routes/super-admin/shipping.ts` |
| POST | `/api/admin/shipments/:shipmentId/pickup` | `backend/src/routes/super-admin/shipping.ts` |

## returnRoutes — mounted at `/api`

| Method | Path | Source |
|---|---|---|
| POST | `/api/returns` | `backend/src/routes/customer/returns.ts` |
| GET | `/api/returns/:returnId` | `backend/src/routes/customer/returns.ts` |
| GET | `/api/admin/returns/:returnId` | `backend/src/routes/customer/returns.ts` |
| POST | `/api/admin/returns/:returnId/decision` | `backend/src/routes/customer/returns.ts` |
| POST | `/api/admin/returns/:returnId/received` | `backend/src/routes/customer/returns.ts` |
| POST | `/api/admin/returns/:returnId/inspection` | `backend/src/routes/customer/returns.ts` |
| POST | `/api/super-admin/returns/:returnId/refund/authorize` | `backend/src/routes/customer/returns.ts` |
| POST | `/api/super-admin/returns/:returnId/refund/submit` | `backend/src/routes/customer/returns.ts` |

## webhookRoutes — mounted at `/webhooks`

| Method | Path | Source |
|---|---|---|
| POST | `/webhooks/shipping/events` | `backend/src/routes/webhooks/shipping.webhook.ts` |

## paymentWebhookRoutes — mounted at `/webhooks`

| Method | Path | Source |
|---|---|---|
| POST | `/webhooks/payments/cashfree` | `backend/src/routes/webhooks/payments.webhook.ts` |
