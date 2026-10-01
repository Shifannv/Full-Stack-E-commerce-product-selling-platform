import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-secondary/40">
      <div className="site-container grid gap-8 py-12 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-lg font-semibold tracking-tight">
            OWNLINE DROPSHIP
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Thoughtfully presented goods, made easy to discover.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
        >
          <Link href="/search">Shop</Link>
          <Link href="/orders">Orders</Link>
          <Link href="/account">Account</Link>
        </nav>
      </div>
    </footer>
  );
}
