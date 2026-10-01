import Link from "next/link";

export function SectionHeading({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
      <div>
        <h2 className="type-section">{title}</h2>
        {description && (
          <p className="mt-3 max-w-prose text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="text-sm font-semibold underline decoration-border underline-offset-8 hover:decoration-foreground"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
