"use client";

import { useQuery } from "@tanstack/react-query";
import { superAdminApi } from "@/lib/api/super-admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel } from "@/components/operator/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/operator/states";

export default function RolesPage() {
  const roles = useQuery({
    queryKey: operatorKeys.superRoles(),
    queryFn: () => superAdminApi.roles(),
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Roles & permissions"
        description="A role's permission grant is role-wide: changing it here would change every Admin who holds that role at once. There is no approved policy for that, so this view is read-only."
      />

      {roles.isLoading && (
        <Panel>
          <LoadingPanel label="Loading roles" />
        </Panel>
      )}
      {roles.isError && (
        <Panel>
          <ErrorPanel error={roles.error} onRetry={() => void roles.refetch()} />
        </Panel>
      )}

      {roles.data && (
        <>
          <Panel
            title="Roles"
            actions={
              <span className="text-xs text-muted-foreground">
                {roles.data.roles.length} role{roles.data.roles.length !== 1 ? "s" : ""}
              </span>
            }
          >
            {roles.data.roles.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No roles defined.</p>
            ) : (
              <div className="divide-y divide-border">
                {roles.data.roles.map((role) => (
                  <div key={role.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{role.name}</p>
                        {role.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {role.permissions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {role.permissions.map((permission) => (
                          <span
                            key={permission}
                            className="inline-flex items-center rounded bg-(--tone-info-bg) px-2 py-0.5 font-mono text-[11px] text-(--tone-info-fg)"
                          >
                            {permission}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="All permissions"
            actions={
              <span className="text-xs text-muted-foreground">
                {roles.data.permissions.length} registered
              </span>
            }
          >
            {roles.data.permissions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No permissions defined.</p>
            ) : (
              <div className="divide-y divide-border">
                {roles.data.permissions.map((permission) => (
                  <div
                    key={permission.id}
                    className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)] sm:items-center"
                  >
                    <p className="font-mono">{permission.key}</p>
                    <p className="text-muted-foreground">{permission.description ?? "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
