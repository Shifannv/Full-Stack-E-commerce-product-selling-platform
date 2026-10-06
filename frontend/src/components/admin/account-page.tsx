"use client";

/**
 * Admin account page.
 *
 * Shows:
 *  - Profile (name, email, role, approval status)
 *  - Onboarding status (pulled from GET /api/admin/onboarding)
 *  - Password change (POST /api/admin/account/initial-password is for initial;
 *    for post-activation, use the forgot-password / reset-password flow)
 *  - Forgot password link
 *  - Sign out
 *
 * Does NOT expose Super Admin controls.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi, ApiError } from "@/lib/api";
import { adminApi } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import type { Actor } from "@/lib/api/types";

type OnboardingStatus = "DRAFT" | "PENDING_SUPER_ADMIN_APPROVAL" | "CHANGES_REQUIRED" | "APPROVED" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "DELETED" | "ARCHIVED" | string;

type ApplicationData = {
  profile: { id: string; status: OnboardingStatus; createdAt?: string };
  application: { legalName: string; businessType: string; contactPhone: string; status: string; reviewNotes: string | null } | null;
  documents: { id: string; documentType: string }[];
  addresses: { addressType: string; contactName: string; city: string; state: string; postalCode: string; country: string; isActive: boolean }[];
  categories: { categoryId: string; status: string }[];
  bank: { accountLast4: string; status: string; revision: string; reviewNotes: string | null } | null;
} | null;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    PENDING_SUPER_ADMIN_APPROVAL: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    CHANGES_REQUIRED: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    SUSPENDED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    DELETED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
    ARCHIVED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
    VERIFIED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  };
  const cls = map[status] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function statusDescription(status: OnboardingStatus): string {
  switch (status) {
    case "DRAFT": return "Your seller application is in progress. Complete all required sections and submit when ready.";
    case "PENDING_SUPER_ADMIN_APPROVAL": return "Your application has been submitted and is awaiting review by the platform administrator.";
    case "CHANGES_REQUIRED": return "The administrator has reviewed your application and requested changes. Please review the notes and resubmit.";
    case "APPROVED": return "Your seller application has been approved. Your account is being activated.";
    case "ACTIVE": return "Your seller account is active. You can manage products, orders and your store.";
    case "REJECTED": return "Your seller application was not approved. Contact the platform administrator for more information.";
    case "SUSPENDED": return "Your seller account has been suspended. Contact the platform administrator.";
    case "DELETED": return "This account has been deleted.";
    case "ARCHIVED": return "This account has been archived.";
    default: return `Current status: ${status}`;
  }
}

export function AdminAccountPage() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [onboarding, setOnboarding] = useState<ApplicationData>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [me, ob] = await Promise.all([
          authApi.me(),
          adminApi.onboarding() as Promise<ApplicationData>,
        ]);
        if (!active) return;
        setActor(me);
        setOnboarding(ob);
      } catch (reason) {
        if (!active) return;
        setLoadError(
          reason instanceof ApiError && reason.status === 401
            ? "Sign in to view your account."
            : reason instanceof Error ? reason.message : "Account information unavailable."
        );
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function handleSignOut() {
    setSignOutBusy(true); setSignOutError(null);
    try {
      await authApi.signOut();
      router.push("/admin");
    } catch (reason) {
      setSignOutError(reason instanceof Error ? reason.message : "Sign-out unavailable.");
      setSignOutBusy(false);
    }
  }

  if (loadError) return (
    <div className="commerce-panel max-w-2xl">
      <p role="alert" className="text-sm text-destructive">{loadError}</p>
    </div>
  );

  if (!actor || !onboarding) return (
    <div className="commerce-panel max-w-2xl">
      <p role="status" className="text-sm text-muted-foreground">Loading account…</p>
    </div>
  );

  const status: OnboardingStatus = (onboarding as { profile?: { status?: string } }).profile?.status ?? "DRAFT";
  const application = (onboarding as { application?: ApplicationData }).application as { legalName?: string; businessType?: string; contactPhone?: string; status?: string; reviewNotes?: string | null } | null;
  const addresses = (onboarding as { addresses?: { addressType: string; contactName: string; city: string; state: string; postalCode: string; country: string; isActive: boolean }[] }).addresses ?? [];
  const categories = (onboarding as { categories?: { categoryId: string; status: string }[] }).categories ?? [];
  const documents = (onboarding as { documents?: { id: string; documentType: string }[] }).documents ?? [];
  const bank = (onboarding as { bank?: { accountLast4: string; status: string; revision: string; reviewNotes: string | null } | null }).bank;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <section id="account-overview" className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Your account</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Account &amp; Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your seller profile, onboarding status and security settings.</p>
        </div>
        {statusBadge(status)}
      </section>

      {/* Profile */}
      <section aria-labelledby="profile-heading" className="rounded-xl border border-border bg-card p-6">
        <h2 id="profile-heading" className="text-base font-semibold">Profile</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Role</dt>
            <dd className="mt-1 text-sm">{actor.roles.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Account ID</dt>
            <dd className="mt-1 text-xs font-mono text-muted-foreground break-all">{actor.userId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Approval status</dt>
            <dd className="mt-1">{statusBadge(status)}</dd>
          </div>
          {application?.legalName && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Business name</dt>
              <dd className="mt-1 text-sm">{application.legalName}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Onboarding Status */}
      <section aria-labelledby="onboarding-heading" className="rounded-xl border border-border bg-card p-6">
        <h2 id="onboarding-heading" className="text-base font-semibold">Seller Onboarding</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{statusDescription(status)}</p>

        {/* CHANGES_REQUIRED — show review notes */}
        {status === "CHANGES_REQUIRED" && application?.reviewNotes && (
          <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Changes requested</p>
            <p className="mt-2 text-sm text-orange-700 dark:text-orange-400 whitespace-pre-wrap">{application.reviewNotes}</p>
          </div>
        )}

        {/* Onboarding checklist */}
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Application checklist</p>
          <ul className="space-y-2 text-sm">
            <CheckItem label="Seller profile (KYC)" done={!!application} />
            <CheckItem label="Verification documents" done={documents.length > 0} count={documents.length} />
            <CheckItem label="Shipping origin address" done={addresses.some(a => a.addressType === "SHIPPING_ORIGIN")} />
            <CheckItem label="Return address" done={addresses.some(a => a.addressType === "RETURN")} />
            <CheckItem label="Category requests" done={categories.length > 0} count={categories.length} />
            <CheckItem label="Bank information" done={!!bank} extra={bank ? `••••${bank.accountLast4} — ${bank.status.replaceAll("_", " ")}` : undefined} />
          </ul>
        </div>

        {/* Action buttons based on status */}
        {(status === "DRAFT" || status === "CHANGES_REQUIRED") && (
          <div className="mt-6 flex flex-wrap gap-3">
            <p className="w-full text-xs text-muted-foreground">
              Use the <strong>Seller profile</strong> section in the workspace below to complete each step, then submit your application.
            </p>
          </div>
        )}
      </section>

      {/* Security */}
      <section aria-labelledby="security-heading" className="rounded-xl border border-border bg-card p-6">
        <h2 id="security-heading" className="text-base font-semibold">Security</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          To change your password, use the password reset flow. A reset link will be sent to your registered email address.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/forgot-password"
            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Reset password
          </Link>
        </div>
      </section>

      {/* Sign out */}
      <section aria-labelledby="session-heading" className="rounded-xl border border-border bg-card p-6">
        <h2 id="session-heading" className="text-base font-semibold">Session</h2>
        <p className="mt-3 text-sm text-muted-foreground">Sign out of your seller account on this device.</p>
        {signOutError && <p role="alert" className="mt-3 text-sm text-destructive">{signOutError}</p>}
        <Button
          id="admin-account-sign-out"
          variant="outline"
          className="mt-5"
          disabled={signOutBusy}
          onClick={() => void handleSignOut()}
        >
          {signOutBusy ? "Signing out…" : "Sign out"}
        </Button>
      </section>
    </div>
  );
}

function CheckItem({ label, done, count, extra }: { label: string; done: boolean; count?: number; extra?: string }) {
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
        {done ? "✓" : "○"}
      </span>
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {count !== undefined && count > 0 && <span className="ml-1 text-xs text-muted-foreground">({count})</span>}
        {extra && <span className="ml-2 text-xs text-muted-foreground">{extra}</span>}
      </span>
    </li>
  );
}
