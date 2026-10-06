import { cn } from "cn";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

/**
 * Every status string the Worker can emit for operator-visible records, taken from the
 * database check constraints (admins, products, payouts, settlements, returns, reconciliation).
 * Unknown values fall back to neutral with a humanized label rather than being hidden.
 */
const STATUS: Record<string, { tone: Tone; label?: string }> = {
  // Seller account / application
  ACTIVE: { tone: "ok", label: "Active" },
  APPROVED: { tone: "ok", label: "Approved" },
  PENDING_SUPER_ADMIN_APPROVAL: { tone: "warn", label: "Awaiting approval" },
  PENDING: { tone: "warn", label: "Pending" },
  CHANGES_REQUIRED: { tone: "warn", label: "Changes required" },
  DRAFT: { tone: "neutral", label: "Draft" },
  SUSPENDED: { tone: "bad", label: "Suspended" },
  REJECTED: { tone: "bad", label: "Rejected" },
  // Catalog
  PUBLISHED: { tone: "ok", label: "Published" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
  // Payment / money
  PAID: { tone: "ok", label: "Paid" },
  REQUESTED: { tone: "warn", label: "Requested" },
  AVAILABLE: { tone: "ok", label: "Available" },
  PAYOUT_PENDING: { tone: "warn", label: "Payout pending" },
  HELD: { tone: "bad", label: "On hold" },
  VERIFIED: { tone: "ok", label: "Verified" },
  REFUNDED: { tone: "ok", label: "Refunded" },
  REFUND_PROCESSING: { tone: "warn", label: "Refund processing" },
  // Returns
  RETURN_PENDING: { tone: "info", label: "Awaiting return shipment" },
  RECEIVED: { tone: "info", label: "Received" },
  QC_IN_PROGRESS: { tone: "warn", label: "Quality check in progress" },
  QC_APPROVED: { tone: "ok", label: "Quality check passed" },
  QC_REJECTED: { tone: "bad", label: "Quality check failed" },
  RETURN_ISSUE: { tone: "bad", label: "Return issue" },
  // Orders
  CONFIRMED: { tone: "ok", label: "Confirmed" },
  CREATED: { tone: "neutral", label: "Created" },
  CANCELLED: { tone: "bad", label: "Cancelled" },
  EXPIRED: { tone: "neutral", label: "Expired" },
  DELIVERED: { tone: "ok", label: "Delivered" },
  FAILED: { tone: "bad", label: "Failed" },
  // Reconciliation
  RETRYABLE: { tone: "info", label: "Retrying automatically" },
  REVIEW: { tone: "warn", label: "Needs manual review" },
  RESOLVED: { tone: "ok", label: "Resolved" },
  // Lifecycle
  DELETION: { tone: "bad", label: "Deletion" },
  RECOVERY: { tone: "info", label: "Recovery" },
};

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-(--tone-ok-bg) text-(--tone-ok-fg)",
  warn: "bg-(--tone-warn-bg) text-(--tone-warn-fg)",
  bad: "bg-(--tone-bad-bg) text-(--tone-bad-fg)",
  info: "bg-(--tone-info-bg) text-(--tone-info-fg)",
  neutral: "bg-(--tone-neutral-bg) text-(--tone-neutral-fg)",
};

export function humanize(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function statusLabel(status: string) {
  return STATUS[status]?.label ?? humanize(status);
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  /** Override the wording when the context needs something more specific. */
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const resolved = tone ?? STATUS[status]?.tone ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium leading-5",
        TONE_CLASS[resolved],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      {label ?? statusLabel(status)}
    </span>
  );
}
