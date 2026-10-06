import Link from "next/link";
import { cn } from "cn";

/** Page title block shared by every operator screen: serif title, one plain sentence, actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="op-title">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-[65ch] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Bordered surface used for tables and detail sections. Never nested inside another Panel. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="op-section-title">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export type Stat = {
  label: string;
  value: React.ReactNode;
  /** One line of context, e.g. what the number counts. */
  note?: React.ReactNode;
  href?: string;
};

/**
 * Ruled strip of figures. Deliberately not a row of cards: figures sit on one surface separated
 * by hairlines, so the eye reads across rather than hunting between boxes.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-card sm:grid-cols-3 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      style={{ ["--cols" as string]: Math.min(stats.length, 5) }}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="relative border-b border-r border-border px-4 py-3.5 last:border-r-0 [&:nth-child(2n)]:max-sm:border-r-0"
        >
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="op-num mt-1 text-xl font-semibold tracking-tight">{stat.value}</dd>
          {stat.note && <p className="mt-0.5 text-xs text-muted-foreground">{stat.note}</p>}
          {stat.href && (
            <Link
              href={stat.href}
              className="absolute inset-0 transition-colors hover:bg-[color-mix(in_srgb,var(--secondary)_35%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--secondary)_35%,transparent)]"
            >
              <span className="sr-only">Open {stat.label}</span>
            </Link>
          )}
        </div>
      ))}
    </dl>
  );
}

/** Label/value list for record details. */
export function DetailList({
  items,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
