import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex min-h-svh flex-col"><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3">Skip to content</a><SiteHeader /><main id="main-content" className="flex-1">{children}</main><SiteFooter /></div>;
}
