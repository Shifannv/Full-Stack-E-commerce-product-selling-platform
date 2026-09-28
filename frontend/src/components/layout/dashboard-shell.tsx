import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  homeHref: "/admin" | "/super-admin";
  children: React.ReactNode;
};

export function DashboardShell({ title, subtitle, homeHref, children }: DashboardShellProps) {
  const navigation = <nav aria-label={`${title} navigation`} className="flex flex-col gap-1">
    <Link href={homeHref} aria-current="page" className="rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground">Overview</Link>
  </nav>;

  return <div className="min-h-svh bg-background lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
    <aside className="hidden border-r border-border bg-card px-5 py-7 lg:flex lg:flex-col">
      <Link href="/" className="text-sm font-semibold tracking-tight">OWNLINE DROPSHIP</Link>
      <p className="mt-8 mb-3 type-meta text-muted-foreground">{title}</p>
      {navigation}
    </aside>
    <div className="min-w-0">
      <header className="flex h-18 items-center justify-between gap-4 border-b border-border bg-card px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label={`Open ${title} navigation`}><Menu aria-hidden="true" /></Button></SheetTrigger>
            <SheetContent side="left"><SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader><div className="px-4 pt-6">{navigation}</div></SheetContent>
          </Sheet>
          <div><p className="text-sm font-semibold">{title}</p><p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p></div>
        </div>
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">View storefront</Link>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-8 sm:py-12">{children}</main>
    </div>
  </div>;
}
