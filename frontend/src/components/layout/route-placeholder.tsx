import Link from "next/link";
import { Button } from "@/components/ui/button";

export function RoutePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="site-container section-space max-w-3xl">
      <h1 className="type-page">{title}</h1>
      <p className="mt-6 text-muted-foreground">{description}</p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
