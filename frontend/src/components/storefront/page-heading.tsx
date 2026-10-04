import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function PageHeading({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return <div className="store-page-heading"><div><h1 className="type-page">{title}</h1><p>{description}</p></div>{action && <Link href={action.href} className="editorial-link">{action.label}<ArrowUpRight size={18} aria-hidden="true" /></Link>}</div>;
}
