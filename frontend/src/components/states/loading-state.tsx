import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({
  label = "Loading content",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
