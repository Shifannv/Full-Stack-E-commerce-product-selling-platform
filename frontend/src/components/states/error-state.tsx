import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "We couldn’t load this content",
  description = "Please try again shortly.",
  action,
}: {
  title?: string;
  description?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-border bg-card px-6 py-12 text-center"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{description}</p>
      {action && (
        <Button asChild variant="outline" className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
