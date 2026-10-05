import Link from "next/link";
import { BarChart3, Boxes, ExternalLink, LayoutDashboard, Menu, Users, CreditCard, Shield, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  homeHref: "/admin" | "/super-admin";
  children: React.ReactNode;
};

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, external: false },
  { href: "#records", label: "Products", icon: Boxes, external: false },
  { href: "#insights", label: "Insights", icon: BarChart3, external: false },
  { href: "#operations", label: "Manage workspace", icon: Boxes, external: false },
  { href: "/admin/account", label: "Account", icon: Activity, external: false },
];

const superAdminNav = [
  { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard, external: false },
  { href: "/super-admin/admins", label: "Admins", icon: Users, external: false },
  { href: "/super-admin/products", label: "Products", icon: Boxes, external: false },
  { href: "/super-admin/payouts", label: "Payouts", icon: CreditCard, external: false },
  { href: "/super-admin/roles", label: "Roles & Permissions", icon: Shield, external: false },
  { href: "/super-admin/lifecycle", label: "Lifecycle Requests", icon: Activity, external: false },
  { href: "/super-admin/reconciliation", label: "Reconciliation", icon: RefreshCw, external: false },
  { href: "#operations", label: "Workflows", icon: BarChart3, external: false },
];

export function DashboardShell({
  title,
  subtitle,
  homeHref,
  children,
}: DashboardShellProps) {
  const isSuperAdmin = homeHref === "/super-admin";
  const navItems = isSuperAdmin ? superAdminNav : adminNav;

  const navigation = (
    <nav aria-label={`${title} navigation`} className="flex flex-col gap-1 text-sm">
      {navItems.map((item) => (
        <a
          key={item.href + item.label}
          href={item.href}
          className="flex items-center gap-3 rounded-md px-4 py-3 opacity-75 hover:bg-primary/10 hover:opacity-100 transition-colors"
        >
          <item.icon aria-hidden="true" className="size-4 shrink-0" />
          {item.label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="dashboard-shell min-h-svh bg-background lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]" data-role={homeHref === "/admin" ? "admin" : "super-admin"}>
      <aside className="dashboard-sidebar hidden px-5 py-7 lg:flex lg:flex-col">
        <Link href={homeHref} className="text-lg font-bold tracking-[-0.035em]">OWNLINE<span className="ml-1 text-[9px] font-medium uppercase tracking-[0.12em]">Ops</span></Link>
        <p className="mb-3 mt-11 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-50">Workspace</p>
        {navigation}
        <Link href="/" className="mt-auto flex items-center gap-2 px-4 pt-8 text-xs opacity-70 hover:opacity-100">View storefront <ExternalLink aria-hidden="true" className="size-3" /></Link>
      </aside>
      <div className="min-w-0">
        <header className="flex h-18 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-8">
          <div className="flex items-center gap-3">
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
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>{title}</SheetTitle>
                </SheetHeader>
                <div className="px-4 pt-6">{navigation}</div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View storefront
          </Link>
        </header>
        <main
          id="main-content"
          className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-8 sm:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
