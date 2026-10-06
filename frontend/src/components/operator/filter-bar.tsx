"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SelectFilter = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

/**
 * Search + select filters synced to the URL query string via `router.replace`, so a reload,
 * a shared link or browser back/forward reproduces the same list. Changing any select resets
 * `offset`/`after_id` to the start of the result set, since a stale cursor into a differently
 * filtered set would not make sense.
 */
export function FilterBar({
  searchName = "q",
  searchLabel = "Search",
  searchPlaceholder = "Search…",
  selects = [],
  cursorParam,
}: {
  searchName?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  selects?: SelectFilter[];
  /** The pagination param to clear on any filter change (e.g. "offset" or "after_id"). */
  cursorParam: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get(searchName) ?? "");

  function apply(next: URLSearchParams) {
    next.delete(cursorParam);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (draft) next.set(searchName, draft);
    else next.delete(searchName);
    apply(next);
  }

  function changeSelect(name: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    apply(next);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
      <form onSubmit={submitSearch} className="flex items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          {searchLabel}
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-56"
            maxLength={100}
          />
        </label>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>
      {selects.map((filter) => (
        <label key={filter.name} className="grid gap-1 text-xs text-muted-foreground">
          {filter.label}
          <select
            value={searchParams.get(filter.name) ?? ""}
            onChange={(event) => changeSelect(filter.name, event.target.value)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="">All</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
