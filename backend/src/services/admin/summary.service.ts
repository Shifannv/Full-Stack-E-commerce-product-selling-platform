/**
 * Summary service — lightweight aggregate counts for dashboard KPI cards.
 *
 * Design principles:
 * - Uses COUNT(*) with WHERE filters; never fetches full rows just to count.
 * - Each function runs a small number of parallel count queries.
 * - No financial detail is exposed here; totals use pre-calculated settlement amounts.
 * - Super Admin summary never exposes individual admin KYC or payout specifics.
 */
import { and, count, countDistinct, eq, sql, sum } from "drizzle-orm";
import type { createDb } from "../../db";
import {
  adminCategoryAssignments,
  adminKycSubmissions,
} from "../../db/schema/admin";
import { categories, productAdmins, products } from "../../db/schema/catalog";
import { adminSettlements, payoutRequests } from "../../db/schema/finance";
import { orderItems, orders } from "../../db/schema/orders";
import { admins } from "../../db/schema/rbac";

type Db = ReturnType<typeof createDb>["db"];

// ---------------------------------------------------------------------------
// Admin summary — scoped strictly to the authenticated admin's data.
// ---------------------------------------------------------------------------
export async function getAdminSummary(db: Db, adminId: string) {
  const [
    productCount,
    orderCount,
    pendingOrderCount,
    settlementTotals,
    pendingPayoutCount,
  ] = await Promise.all([
    // Only products in currently assigned, published categories.
    db
      .select({ value: count() })
      .from(productAdmins)
      .innerJoin(products, eq(productAdmins.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(
        adminCategoryAssignments,
        and(
          eq(adminCategoryAssignments.adminId, adminId),
          eq(adminCategoryAssignments.categoryId, products.categoryId),
        ),
      )
      .where(
        and(
          eq(productAdmins.adminId, adminId),
          eq(adminCategoryAssignments.status, "ACTIVE"),
          eq(categories.status, "PUBLISHED"),
        ),
      )
      .then((r) => r[0]?.value ?? 0),

    // Orders that contain at least one item from this admin.
    db
      .select({ value: countDistinct(orderItems.orderId) })
      .from(orderItems)
      .where(eq(orderItems.adminId, adminId))
      .then((r) => r[0]?.value ?? 0),

    // Paid, confirmed orders; this is not a carrier/shipment-state count.
    db
      .select({ value: countDistinct(orderItems.orderId) })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.adminId, adminId),
          eq(orders.paymentStatus, "PAID"),
          eq(orders.status, "CONFIRMED"),
        ),
      )
      .then((r) => r[0]?.value ?? 0),

    // Available settlement balance for this admin.
    db
      .select({
        available: sql<string>`coalesce(sum(case when ${adminSettlements.status} = 'AVAILABLE' then ${adminSettlements.netPayable} else 0 end), 0)::text`,
        grossSettledSales: sql<string>`coalesce(sum(${adminSettlements.grossAmount}), 0)::text`,
      })
      .from(adminSettlements)
      .where(eq(adminSettlements.adminId, adminId))
      .then((r) => ({
        available: r[0]?.available ?? "0",
        grossSettledSales: r[0]?.grossSettledSales ?? "0",
      })),

    // Payout requests awaiting approval.
    db
      .select({ value: count() })
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.adminId, adminId),
          eq(payoutRequests.status, "REQUESTED"),
        ),
      )
      .then((r) => r[0]?.value ?? 0),
  ]);

  return {
    products: { total: productCount },
    orders: { total: orderCount, confirmedPaid: pendingOrderCount },
    finance: {
      availableBalance: settlementTotals.available,
      grossSettledSales: settlementTotals.grossSettledSales,
      pendingPayoutRequests: pendingPayoutCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Super Admin summary — platform-wide aggregates, no per-admin PII.
// ---------------------------------------------------------------------------
export async function getSuperAdminSummary(db: Db) {
  const [
    adminCounts,
    productCount,
    orderCount,
    revenueTotal,
    pendingKycCount,
    pendingPayoutCount,
  ] = await Promise.all([
    // Admin counts by status.
    db
      .select({ status: admins.status, value: count() })
      .from(admins)
      .groupBy(admins.status)
      .then((rows) => {
        const byStatus = Object.fromEntries(
          rows.map((r) => [r.status, r.value]),
        );
        return {
          active: byStatus["ACTIVE"] ?? 0,
          pending: byStatus["PENDING_SUPER_ADMIN_APPROVAL"] ?? 0,
          total: rows.reduce((sum, r) => sum + r.value, 0),
        };
      }),

    // Total published products across the platform.
    db
      .select({ value: count() })
      .from(products)
      .where(eq(products.status, "PUBLISHED"))
      .then((r) => r[0]?.value ?? 0),

    // Total orders on the platform.
    db
      .select({ value: count() })
      .from(orders)
      .then((r) => r[0]?.value ?? 0),

    // Gross revenue from all settled orders.
    db
      .select({ value: sum(adminSettlements.grossAmount) })
      .from(adminSettlements)
      .then((r) => r[0]?.value ?? "0.00"),

    // KYC applications awaiting Super Admin review.
    db
      .select({ value: count() })
      .from(adminKycSubmissions)
      .where(eq(adminKycSubmissions.status, "PENDING_SUPER_ADMIN_APPROVAL"))
      .then((r) => r[0]?.value ?? 0),

    // Payout requests awaiting approval across all admins.
    db
      .select({ value: count() })
      .from(payoutRequests)
      .where(eq(payoutRequests.status, "REQUESTED"))
      .then((r) => r[0]?.value ?? 0),
  ]);

  return {
    admins: adminCounts,
    catalog: { publishedProducts: productCount },
    orders: { total: orderCount },
    finance: {
      grossSettledSales: revenueTotal,
      pendingPayoutRequests: pendingPayoutCount,
    },
    onboarding: { pendingKycApplications: pendingKycCount },
  };
}
