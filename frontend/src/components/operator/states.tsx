"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/errors";

/** Skeleton rows that match table density, so loading does not reflow the page. */
export function LoadingRows({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-px p-4">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

/** Block skeleton for detail panels and stat strips. */
export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid gap-3 p-5">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-2 h-24 w-full" />
    </div>
  );
}

/**
 * Empty states say why nothing is shown and what to do next. `filtered` distinguishes
 * "your filters matched nothing" from "there is genuinely nothing yet".
 */
export function EmptyPanel({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && (
        <div className="mx-auto mt-1.5 max-w-prose text-sm text-muted-foreground">{children}</div>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Error panel driven by the shared mapper. Offers Try again only when a retry could succeed,
 * and says plainly when the real problem is a missing session or missing access.
 */
export function ErrorPanel({
  error,
  onRetry,
  context = "list",
}: {
  error: unknown;
  onRetry?: () => void;
  context?: "list" | "record" | "mutation" | "session";
}) {
  const described = describeApiError(error, context);
  return (
    <div role="alert" className="px-5 py-8">
      <p className="font-medium text-(--tone-bad-fg)">{described.title}</p>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{described.message}</p>
      {described.detail && described.detail !== described.message && (
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{described.detail}</p>
      )}
      {onRetry && described.retryable && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
