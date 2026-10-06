import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Platform", template: "%s — Ownline Dropship Platform" },
  robots: { index: false, follow: false },
};

export default function SuperAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
