"use client";

import { useEffect, useState } from "react";
import { Package, Users } from "lucide-react";
import { adminApi, superAdminApi, ApiError } from "@/lib/api";
import type { AdminProductSummary } from "@/lib/api/types";

type AdminSummary = { products: { total: number }; orders: { total: number; confirmedPaid: number }; finance: { availableBalance: string; grossSettledSales: string; pendingPayoutRequests: number } };
type PlatformSummary = { admins: { active: number; pending: number; total: number }; catalog: { publishedProducts: number }; orders: { total: number }; finance: { grossSettledSales: string; pendingPayoutRequests: number }; onboarding: { pendingKycApplications: number } };
type AdminRow = { id: string; userName: string | null; userEmail: string; status: string };
type DashboardData = { role: "admin"; summary: AdminSummary; products: AdminProductSummary[] } | { role: "super-admin"; summary: PlatformSummary; admins: AdminRow[] };

function money(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(number) : "—";
}
function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="dashboard-kpi min-w-0 rounded-xl p-5 sm:p-6"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-4 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p><p className="mt-3 text-xs text-muted-foreground">{note}</p></div>;
}

export function RoleDashboard({ role }: { role: "admin" | "super-admin" }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (role === "admin") {
          const [summary, products] = await Promise.all([adminApi.summary() as Promise<AdminSummary>, adminApi.products(new URLSearchParams({ limit: "5" }))]);
          if (active) setData({ role, summary, products: products.products });
        } else {
          const [summary, admins] = await Promise.all([superAdminApi.summary() as Promise<PlatformSummary>, superAdminApi.admins(new URLSearchParams({ status: "PENDING_SUPER_ADMIN_APPROVAL", limit: "5" })) as Promise<{ admins: AdminRow[] }>]);
          if (active) setData({ role, summary, admins: admins.admins });
        }
      } catch (reason) {
        if (active) setError(reason instanceof ApiError && reason.status === 401 ? "Sign in with an authorized account, then try again." : reason instanceof Error ? reason.message : "Dashboard data is unavailable.");
      }
    }
    void load();
    return () => { active = false; };
  }, [role, retry]);
  const isAdmin = role === "admin";
  return <div className="space-y-7">
    <section id="overview" className="flex scroll-mt-7 flex-wrap items-end justify-between gap-4"><div><p className="text-xs text-muted-foreground">{isAdmin ? "Store overview" : "Platform overview"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{isAdmin ? "Your workspace" : "Platform at a glance"}</h1><p className="mt-2 text-sm text-muted-foreground">{isAdmin ? "A clear view of your catalog and operations." : "Store activity across Ownline Dropship."}</p></div><span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">Live account data</span></section>
    {error && <div role="alert" className="rounded-lg border border-border bg-card p-6"><h2 className="font-semibold">Dashboard unavailable</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p><button type="button" onClick={() => { setError(null); setData(null); setRetry((value) => value + 1); }} className="mt-4 text-sm font-medium text-primary underline">Try again</button></div>}
    {!data && !error && <div role="status" className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading dashboard data…</div>}
    {error && <>
      <section aria-label="Metrics unavailable" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Gross settled sales" value="—" note="Sign in to view" />
        <Metric label={isAdmin ? "Products" : "Active admins"} value="—" note="Sign in to view" />
        <Metric label={isAdmin ? "Orders" : "Published products"} value="—" note="Sign in to view" />
        <Metric label={isAdmin ? "Available balance" : "Orders"} value="—" note="Sign in to view" />
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.8fr)]">
        <section id="insights" className="scroll-mt-7 rounded-xl border border-border bg-card p-6 sm:p-7"><h2 className="text-base font-semibold">Performance overview</h2><p className="mt-1 text-xs text-muted-foreground">Current totals from your dashboard API</p><p className="mt-8 border-t border-border py-16 text-sm text-muted-foreground">Sign in to view your account totals.</p></section>
        <section className="rounded-xl border border-border bg-card p-6 sm:p-7"><h2 className="text-base font-semibold">Needs attention</h2><p className="mt-8 border-t border-border py-16 text-sm text-muted-foreground">Items requiring attention will appear here.</p></section>
      </div>
      <section id="records" className="scroll-mt-7 rounded-xl border border-border bg-card p-6 sm:p-7"><h2 className="text-base font-semibold">{isAdmin ? "Recent products" : "Pending approvals"}</h2><p className="mt-8 border-t border-border py-10 text-sm text-muted-foreground">Sign in to view {isAdmin ? "your products" : "submitted admin applications"}.</p></section>
    </>}
    {data && <>
      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.role === "admin" ? <><Metric label="Gross settled sales" value={money(data.summary.finance.grossSettledSales)} note="Settled orders" /><Metric label="Products" value={data.summary.products.total} note="Your assigned catalog" /><Metric label="Orders" value={data.summary.orders.total} note="Orders containing your products" /><Metric label="Available balance" value={money(data.summary.finance.availableBalance)} note="From settlements" /></> : <><Metric label="Gross settled sales" value={money(data.summary.finance.grossSettledSales)} note="Platform total" /><Metric label="Active admins" value={data.summary.admins.active} note="Of all admin accounts" /><Metric label="Published products" value={data.summary.catalog.publishedProducts} note="Across the platform" /><Metric label="Orders" value={data.summary.orders.total} note="Platform total" /></>}
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.8fr)]">
        <section id="insights" className="scroll-mt-7 rounded-xl border border-border bg-card p-6 sm:p-7" aria-labelledby="insights-heading"><h2 id="insights-heading" className="text-base font-semibold">Performance overview</h2><p className="mt-1 text-xs text-muted-foreground">Current totals from your dashboard API</p><div className="mt-8 grid gap-6 border-t border-border pt-7 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">{isAdmin ? "Confirmed paid orders" : "Admins pending approval"}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{data.role === "admin" ? data.summary.orders.confirmedPaid : data.summary.admins.pending}</p></div><div><p className="text-xs text-muted-foreground">Pending payout requests</p><p className="mt-2 text-3xl font-semibold tabular-nums">{data.summary.finance.pendingPayoutRequests}</p></div></div><p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">A trend chart will appear when a time series API is available.</p></section>
        <section className="rounded-xl border border-border bg-card p-6 sm:p-7" aria-labelledby="attention-heading"><h2 id="attention-heading" className="text-base font-semibold">Needs attention</h2><p className="mt-1 text-xs text-muted-foreground">Items awaiting the next step</p><div className="mt-7 space-y-5"><div className="flex items-center justify-between border-b border-border pb-4"><span className="text-sm">Pending payouts</span><span className="font-semibold tabular-nums">{data.summary.finance.pendingPayoutRequests}</span></div>{data.role === "super-admin" && <div className="flex items-center justify-between border-b border-border pb-4"><span className="text-sm">KYC applications</span><span className="font-semibold tabular-nums">{data.summary.onboarding.pendingKycApplications}</span></div>}</div><p className="mt-6 text-xs leading-relaxed text-muted-foreground">Counts reflect your current access and refresh when this page loads.</p></section>
      </div>
      <section id="records" className="scroll-mt-7 rounded-xl border border-border bg-card" aria-labelledby="records-heading"><div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7"><div><h2 id="records-heading" className="text-base font-semibold">{isAdmin ? "Recent products" : "Pending approvals"}</h2><p className="mt-1 text-xs text-muted-foreground">{isAdmin ? "From your assigned catalog" : "Submitted admin applications awaiting review"}</p></div>{isAdmin ? <Package aria-hidden="true" className="size-5 text-muted-foreground" /> : <Users aria-hidden="true" className="size-5 text-muted-foreground" />}</div>{data.role === "admin" ? (data.products.length ? <div className="divide-y divide-border">{data.products.map((product) => <div key={product.id} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:px-7"><div><p className="font-medium">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.category} · {product.subcategory}</p></div><span className="text-xs text-muted-foreground">{product.status.replaceAll("_", " ")}</span><span className="font-medium tabular-nums">{money(product.price)}</span></div>)}</div> : <p className="px-7 py-10 text-sm text-muted-foreground">No assigned products yet.</p>) : (data.admins.length ? <div className="divide-y divide-border">{data.admins.map((admin) => <div key={admin.id} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-7"><div><p className="font-medium">{admin.userName || admin.userEmail}</p><p className="mt-1 text-xs text-muted-foreground">{admin.userEmail}</p></div><span className="text-xs text-muted-foreground">{admin.status.replaceAll("_", " ")}</span></div>)}</div> : <p className="px-7 py-10 text-sm text-muted-foreground">No submitted admin applications are awaiting review.</p>)}</section>
    </>}
  </div>;
}
