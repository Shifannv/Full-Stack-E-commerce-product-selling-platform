"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { OperatorGate } from "@/components/operator/operator-gate";
import { OperatorQueryProvider } from "@/components/operator/operator-query-provider";

/**
 * Every route under this group is seller-only: the gate gets exclusive control of what renders
 * (sign-in, forced password change, forbidden or the real workspace) and the shell only ever
 * mounts once an Admin actor is confirmed, so navigation is always built from real grants.
 */
export default function AdminWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <OperatorQueryProvider>
      <OperatorGate role="admin">
        {(actor) => (
          <DashboardShell
            title="Seller workspace"
            subtitle="Catalog, orders and finance"
            homeHref="/admin"
            actor={actor}
          >
            {children}
          </DashboardShell>
        )}
      </OperatorGate>
    </OperatorQueryProvider>
  );
}
