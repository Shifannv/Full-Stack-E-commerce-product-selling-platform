"use client";

import { useEffect, useState } from "react";
import { superAdminApi, type RolesResponse, type RoleRow, type PermissionRow } from "@/lib/api/super-admin";
import { ApiError } from "@/lib/api";
import { OperatorGate } from "@/components/layout/operator-workspace";

function RolesPageContent() {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (active) { setLoading(true); setError(null); }
      try {
        const result = await superAdminApi.roles();
        if (active) { setData(result); setLoading(false); }
      } catch (reason) {
        if (!active) return;
        const msg =
          reason instanceof ApiError
            ? reason.status === 401
              ? "Sign in with a Super Admin account."
              : reason.status === 403
              ? "Forbidden — Super Admin access required."
              : reason.message
            : reason instanceof Error
            ? reason.message
            : "Failed to load roles.";
        setError(msg);
        setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [retry]);

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Authorization</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Roles &amp; Permissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Read-only view of the platform RBAC system. Grant mutation is not exposed.
          </p>
        </div>
        <span className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Read-only · Live data
        </span>
      </section>

      {loading && (
        <div role="status" className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
          Loading roles and permissions…
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold">Could not load roles</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="mt-4 text-sm font-medium text-primary underline"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Roles */}
          <section aria-labelledby="roles-heading" className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-5 sm:px-7">
              <h2 id="roles-heading" className="text-base font-semibold">Roles</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.roles.length} role{data.roles.length !== 1 ? "s" : ""} in the RBAC system
              </p>
            </div>
            {data.roles.length === 0 ? (
              <p className="px-7 py-10 text-sm text-muted-foreground">No roles defined.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.roles.map((role: RoleRow) => (
                  <div key={role.id} className="px-5 py-5 sm:px-7">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{role.name}</p>
                        {role.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>
                        )}
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">{role.id}</p>
                      </div>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {role.permissions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {role.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* All Permissions */}
          <section aria-labelledby="permissions-heading" className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-5 sm:px-7">
              <h2 id="permissions-heading" className="text-base font-semibold">All Permissions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.permissions.length} permission{data.permissions.length !== 1 ? "s" : ""} registered in the system
              </p>
            </div>
            {data.permissions.length === 0 ? (
              <p className="px-7 py-10 text-sm text-muted-foreground">No permissions defined.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.permissions.map((perm: PermissionRow) => (
                  <div key={perm.id} className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)] sm:items-center sm:px-7">
                    <p className="font-mono text-sm font-medium">{perm.key}</p>
                    <p className="text-sm text-muted-foreground">{perm.description ?? "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function RolesPage() {
  return (
    <OperatorGate role="super-admin">
      <RolesPageContent />
    </OperatorGate>
  );
}
