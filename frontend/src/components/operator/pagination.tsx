"use client";

import { Button } from "@/components/ui/button";

/**
 * No operator endpoint returns a total count, so pagination can only infer "more" from a full
 * page (`rows.length >= limit`) and can never show "page 3 of 7" without inventing a number.
 */
export function OffsetPagination({
  offset,
  limit,
  rowCount,
  onChange,
  disabled = false,
}: {
  offset: number;
  limit: number;
  rowCount: number;
  onChange: (offset: number) => void;
  disabled?: boolean;
}) {
  const hasPrev = offset > 0;
  const hasNext = rowCount >= limit;
  if (!hasPrev && !hasNext) return null;
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground">
        Showing {rowCount === 0 ? 0 : offset + 1}
        {rowCount > 0 ? `–${offset + rowCount}` : ""}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !hasPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !hasNext}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

/**
 * UUID-cursor pagination for reconciliation (`after_id`). The backend returns no cursor to
 * follow, so the caller supplies the last row's id as the next `after`; a local history stack
 * makes "Previous" possible despite the cursor contract being forward-only.
 */
export function CursorPagination({
  canGoBack,
  rowCount,
  limit,
  onBack,
  onNext,
  disabled = false,
}: {
  canGoBack: boolean;
  rowCount: number;
  limit: number;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  const hasNext = rowCount >= limit;
  if (!canGoBack && !hasNext) return null;
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground">{rowCount} shown</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={disabled || !canGoBack} onClick={onBack}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || !hasNext} onClick={onNext}>
          Next
        </Button>
      </div>
    </nav>
  );
}
