"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { operatorKeys } from "@/lib/api/query-keys";
import { PageHeader, Panel, DetailList } from "@/components/operator/page-header";
import { LoadingPanel, ErrorPanel } from "@/components/operator/states";
import { StatusBadge } from "@/components/operator/status-badge";
import { date } from "@/components/operator/money";

function statusDescription(status: string): string {
  switch (status) {
    case "DRAFT": return "Complete each section below, then submit for review.";
    case "PENDING_SUPER_ADMIN_APPROVAL": return "Your application is under review. You will be notified once a decision is made.";
    case "CHANGES_REQUIRED": return "The reviewer has requested changes. See the notes below, update the relevant sections, then re-submit.";
    case "APPROVED":
    case "ACTIVE": return "Your seller account is approved and active.";
    case "REJECTED": return "Your application was not approved. Contact support for more information.";
    case "SUSPENDED": return "Your seller account has been suspended. Contact support for more information.";
    default: return "";
  }
}

function OnboardingPageContent() {
  const onboarding = useQuery({
    queryKey: ["admin", "onboarding"],
    queryFn: () => adminApi.onboarding(),
  });

  const categories = useQuery({
    queryKey: operatorKeys.adminCategories(),
    queryFn: () => adminApi.categories(),
    enabled: !!onboarding.data,
  });

  if (onboarding.isLoading) return <LoadingPanel label="Loading seller profile" />;
  if (onboarding.isError) return <ErrorPanel error={onboarding.error} onRetry={() => void onboarding.refetch()} />;
  if (!onboarding.data) return null;

  const { profile, application, documents, addresses, categories: assigned, bank } = onboarding.data;
  const status = profile.status;
  const isChangesRequired = status === "CHANGES_REQUIRED";
  const reviewNotes = application?.reviewNotes;

  const shippingAddress = addresses.find((a) => a.addressType === "SHIPPING_ORIGIN");
  const returnAddress = addresses.find((a) => a.addressType === "RETURN");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Seller profile"
        description="Your account onboarding status and verification details."
      />

      {/* Status banner */}
      <div
        className={
          "rounded-md border p-4 " +
          (isChangesRequired
            ? "border-(--tone-warn-fg)/30 bg-(--tone-warn-bg)"
            : status === "REJECTED" || status === "SUSPENDED"
            ? "border-(--tone-bad-fg)/30 bg-(--tone-bad-bg)"
            : "border-border bg-muted/30")
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={status} />
          <p className="text-sm text-muted-foreground">{statusDescription(status)}</p>
        </div>
        {isChangesRequired && reviewNotes && (
          <p className="mt-3 rounded-md border border-(--tone-warn-fg)/20 bg-card px-3 py-2 text-sm">
            <span className="font-medium">Reviewer note: </span>{reviewNotes}
          </p>
        )}
      </div>

      {/* Identity / KYC */}
      <Panel title="Identity &amp; business">
        {application ? (
          <DetailList
            items={[
              { label: "Legal name", value: application.legalName },
              { label: "Business type", value: application.businessType },
              { label: "Contact phone", value: application.contactPhone },
              { label: "Submitted", value: application.submittedAt ? date(application.submittedAt) : "Not submitted" },
              { label: "KYC status", value: <StatusBadge status={application.status} /> },
            ]}
          />
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No KYC submission yet. Use Advanced tools → Onboarding to complete your identity verification.
          </p>
        )}
      </Panel>

      {/* Documents */}
      <Panel title="Uploaded documents">
        {documents.length ? (
          <ul className="divide-y divide-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{doc.documentType.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{date(doc.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">No documents uploaded.</p>
        )}
      </Panel>

      {/* Addresses */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "Shipping origin", address: shippingAddress },
          { label: "Return address", address: returnAddress },
        ].map(({ label, address }) => (
          <Panel key={label} title={label}>
            {address ? (
              <DetailList
                items={[
                  { label: "Business", value: address.businessName ?? "—" },
                  { label: "Contact", value: address.contactName },
                  { label: "Phone", value: address.phone },
                  {
                    label: "Address",
                    value: [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
                      .filter(Boolean)
                      .join(", "),
                  },
                ]}
              />
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">Not set.</p>
            )}
          </Panel>
        ))}
      </div>

      {/* Bank */}
      <Panel title="Bank account">
        {bank ? (
          <DetailList
            items={[
              { label: "Status", value: <StatusBadge status={bank.status} /> },
              { label: "Updated", value: date(bank.updatedAt) },
            ]}
          />
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No bank account on file. Use Advanced tools → Onboarding to add bank details.
          </p>
        )}
      </Panel>

      {/* Categories */}
      <Panel title="Assigned categories">
        {assigned.length ? (
          <ul className="divide-y divide-border">
            {assigned.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {categories.data?.categories.find((category) => category.id === cat.categoryId)?.name ?? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {cat.categoryId.slice(0, 8)}…
                    </span>
                  )}
                </span>
                <StatusBadge status={cat.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No categories assigned yet. A Super Admin assigns your selling categories.
          </p>
        )}
      </Panel>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingPanel />}>
      <OnboardingPageContent />
    </Suspense>
  );
}
