import { Star } from "lucide-react";

export function RatingDisplay({ rating, count }: { rating: number | null; count?: number }) {
  if (rating === null || !Number.isFinite(rating)) return <span className="text-sm text-muted-foreground">No ratings yet</span>;
  const normalized = Math.max(0, Math.min(5, rating));
  return <span className="inline-flex items-center gap-1.5 text-sm" aria-label={`${normalized.toFixed(1)} out of 5 stars${count === undefined ? "" : ` from ${count} reviews`}`}>
    <Star className="size-4 fill-accent stroke-foreground" aria-hidden="true" /><span className="font-medium tabular-nums">{normalized.toFixed(1)}</span>{count !== undefined && <span className="text-muted-foreground">({count})</span>}
  </span>;
}
