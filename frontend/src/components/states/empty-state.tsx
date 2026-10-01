import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
      <h2 className="type-section">{title}</h2>
      <p className="mx-auto mt-3 max-w-prose text-muted-foreground">
        {description}
      </p>
      {action && (
        <Button asChild className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
