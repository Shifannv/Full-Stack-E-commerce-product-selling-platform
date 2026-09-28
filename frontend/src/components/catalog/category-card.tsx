import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { publicImageUrl } from "@/lib/images";

export type CategoryCardData = { slug: string; name: string; description?: string | null; image?: { objectKey: string; altText?: string | null } | null };

export function CategoryCard({ category }: { category: CategoryCardData }) {
  const imageUrl = publicImageUrl(category.image?.objectKey);
  return <Link href={`/categories/${encodeURIComponent(category.slug)}`} className="group block min-w-[15rem] rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
    <div className="relative aspect-[5/4] overflow-hidden rounded-lg bg-secondary">
      {imageUrl ? <Image src={imageUrl} alt={category.image?.altText || category.name} fill sizes="(max-width: 640px) 80vw, 30vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.025]" /> : <span className="flex h-full items-center justify-center text-sm text-muted-foreground">Image coming soon</span>}
    </div>
    <div className="mt-4 flex items-start justify-between gap-3"><div><h3 className="text-lg font-medium">{category.name}</h3>{category.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{category.description}</p>}</div><ArrowUpRight aria-hidden="true" className="mt-1 size-5 shrink-0" /></div>
  </Link>;
}
