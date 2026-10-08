"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Menu,
  PackageSearch,
  RefreshCw,
  Settings2,
  Shield,
  Star,
  Truck,
  Undo2,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Actor } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** Hidden unless the signed-in actor has this permission. Omit for items everyone with the role sees. */
  permission?: string;
  /** Marks a route whose children should also count as "current" (e.g. /admin/products?id=…). */
  exact?: boolean;
};

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/onboarding", label: "Seller profile", icon: ClipboardList },
  { href: "/admin/products", label: "Products", icon: Boxes, permission: "products.view" },
  { href: "/admin/inventory", label: "Inventory", icon: PackageSearch, permission: "products.view" },
  { href: "/admin/orders", label: "Orders", icon: Truck, permission: "orders.view" },
  { href: "/admin/returns", label: "Returns", icon: Undo2, permission: "orders.view" },
  { href: "/admin/finance", label: "Finance", icon: Wallet, permission: "payouts.view" },
  { href: "/admin/account", label: "Account", icon: Settings2 },
  { href: "/admin/advanced", label: "Advanced tools", icon: Wrench },
];

const superAdminNav: NavItem[] = [
  { href: "/super-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/super-admin/admins", label: "Sellers", icon: Users },
  { href: "/super-admin/products", label: "Products", icon: Boxes },
  { href: "/super-admin/reviews", label: "Reviews", icon: Star },
  { href: "/super-admin/payouts", label: "Finance", icon: CreditCard },
  { href: "/super-admin/reconciliation", label: "Reconciliation", icon: RefreshCw },
  { href: "/super-admin/lifecycle", label: "Lifecycle requests", icon: BarChart3 },
  { href: "/super-admin/roles", label: "Roles & permissions", icon: Shield },
  { href: "/super-admin/advanced", label: "Advanced tools", icon: Wrench },
];

function isCurrent(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function visibleItems(items: NavItem[], actor: Actor | null) {
  // Nav never offers an action the backend will reject. SUPER_ADMIN has no granular
  // permission list (it is always-allowed server-side), so permission-gated Super Admin
  // items are shown unconditionally; Admin items are filtered by the real grant.
  if (!actor) return items;
  return items.filter(
    (item) => !item.permission || actor.permissions.includes(item.permission),
  );
}

type DashboardShellProps = {
  title: string;
  subtitle: string;
  homeHref: "/admin" | "/super-admin";
  /** The signed-in actor, once known, so navigation reflects real grants. Null while loading or signed out. */
  actor?: Actor | null;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

export function DashboardShell({
  title,
  subtitle,
  homeHref,
  actor = null,
  headerActions,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const isSuperAdmin = homeHref === "/super-admin";
  const items = visibleItems(isSuperAdmin ? superAdminNav : adminNav, actor);

  const navigation = (onNavigate?: () => void) => (
    <nav aria-label={`${title} navigation`} className="flex flex-col gap-0.5 text-sm">
      {items.map((item) => {
        const current = isCurrent(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-4 py-2.5 opacity-80 transition-colors hover:opacity-100"
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div
      className="dashboard-shell relative min-h-svh bg-background lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
      data-role={isSuperAdmin ? "super-admin" : "admin"}
    >
      <a href="#main-content" className="op-skip absolute">
        Skip to content
      </a>
      <aside className="dashboard-sidebar hidden px-5 py-7 lg:flex lg:flex-col">
        <Link href={homeHref} className="text-lg font-bold tracking-[-0.035em]">
          OWNLINE
          <span className="ml-1 text-[9px] font-medium uppercase tracking-[0.12em]">Ops</span>
        </Link>
        <p className="mb-3 mt-11 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-50">
          Workspace
        </p>
        {navigation()}
        <Link
          href="/"
          className="mt-auto flex items-center gap-2 px-4 pt-8 text-xs opacity-70 hover:opacity-100"
        >
          View storefront <ExternalLink aria-hidden="true" className="size-3" />
        </Link>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label={`Open ${title} navigation`}
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="dashboard-shell" data-role={isSuperAdmin ? "super-admin" : "admin"}>
                <SheetHeader>
                  <SheetTitle>{title}</SheetTitle>
                </SheetHeader>
                <div className="px-4 pt-6">{navigation()}</div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{title}</p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/"
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View storefront
          </Link>
          {headerActions}
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export { cn };
