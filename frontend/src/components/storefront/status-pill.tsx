function statusTone(status: string): "positive" | "warning" | "negative" | "neutral" {
  const value = status.toUpperCase();
  if (["DELIVERED", "PAID", "APPROVED", "REFUNDED", "COMPLETED", "ACTIVE"].some((item) => value.includes(item))) return "positive";
  if (["CANCELLED", "CANCELED", "REJECTED", "FAILED", "ISSUE"].some((item) => value.includes(item))) return "negative";
  if (["PENDING", "PROCESSING", "REQUESTED", "IN_PROGRESS", "CREATED", "CONFIRMED"].some((item) => value.includes(item))) return "warning";
  return "neutral";
}

export function StatusPill({ status }: { status: string }) {
  return <span className="storefront-status" data-tone={statusTone(status)}>{status.replaceAll("_", " ")}</span>;
}
