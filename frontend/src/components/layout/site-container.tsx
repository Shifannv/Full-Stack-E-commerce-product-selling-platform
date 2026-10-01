import type { HTMLAttributes } from "react";
import { cn } from "cn";

export function SiteContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("site-container", className)} {...props} />;
}

export function Section({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("section-space", className)} {...props} />;
}
