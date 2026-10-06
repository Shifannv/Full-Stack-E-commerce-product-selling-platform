"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { OperatorGate } from "@/components/operator/operator-gate";
import { OperatorQueryProvider } from "@/components/operator/operator-query-provider";

export default function SuperAdminWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <OperatorQueryProvider>
      <OperatorGate role="super-admin">
        {(actor) => (
          <DashboardShell
            title="Platform workspace"
            subtitle="Ownline Dropship operations"
            homeHref="/super-admin"
            actor={actor}
          >
            {children}
          </DashboardShell>
        )}
      </OperatorGate>
    </OperatorQueryProvider>
  );
}
