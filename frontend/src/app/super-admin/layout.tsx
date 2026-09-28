import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = { title: "Platform", robots: { index: false, follow: false } };

export default function SuperAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DashboardShell title="Platform workspace" subtitle="Ownline operations" homeHref="/super-admin">{children}</DashboardShell>;
}
