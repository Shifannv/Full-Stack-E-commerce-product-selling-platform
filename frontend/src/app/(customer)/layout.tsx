import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StorefrontProvider } from "@/components/storefront/storefront-provider";

export default function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <StorefrontProvider><div className="storefront flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div></StorefrontProvider>
  );
}
