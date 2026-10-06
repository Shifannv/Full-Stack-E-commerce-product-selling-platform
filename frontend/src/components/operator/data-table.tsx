"use client";

import { cn } from "cn";
import { EmptyPanel, ErrorPanel, LoadingRows } from "./states";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Applied to both the header and body cell on wide screens (e.g. "text-right"). */
  className?: string;
  /** Marks the cell used as the card title on narrow screens. Exactly one column should set it. */
  primary?: boolean;
  /** Hide this column from the stacked card layout. */
  hideOnCard?: boolean;
};

/**
 * One accessible table for every operator list.
 *
 * Wide screens get a real <table> (caption, scoped headers, aria-busy). Below `md` the same
 * rows render as stacked cards with a visible label for every value — shrinking a six-column
 * table onto a phone makes it unreadable, so structure changes instead of scale.
 * Both layouts are driven by the same column definitions so they cannot drift.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  empty,
  selectedKey,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Rendered when loading finished and there are no rows. */
  empty: React.ReactNode;
  selectedKey?: string | null;
}) {
  if (error) return <ErrorPanel error={error} onRetry={onRetry} />;
  if (loading && !rows) return <LoadingRows label={`Loading ${caption.toLowerCase()}`} />;
  if (!rows || rows.length === 0) return <>{empty}</>;

  const primary = columns.find((column) => column.primary) ?? columns[0];

  return (
    <div aria-busy={loading}>
      <div className="hidden overflow-x-auto md:block">
        <table className="op-table w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.className}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} data-selected={selectedKey === rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            data-selected={selectedKey === rowKey(row)}
            className={cn(
              "grid gap-2 px-4 py-3.5 text-sm",
              selectedKey === rowKey(row) && "bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]",
            )}
          >
            <div className="font-medium">{primary.cell(row)}</div>
            <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
              {columns
                .filter((column) => column !== primary && !column.hideOnCard)
                .map((column) => (
                  <div key={column.key} className="contents">
                    <dt className="text-xs text-muted-foreground">{column.header}</dt>
                    <dd className="min-w-0 break-words">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { EmptyPanel };
