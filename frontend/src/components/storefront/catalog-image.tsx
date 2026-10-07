"use client";

import { useState } from "react";
import Image from "next/image";

export function CatalogImage({ src, alt, sizes, className, priority = false, fallback = "message" }: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  fallback?: "message" | "none";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);
  if (!src || failed) {
    if (fallback === "none") return null;
    return <span className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-muted-foreground">Image coming soon</span>;
  }
  return <Image src={src} alt={alt} fill priority={priority} loading={priority ? undefined : "lazy"} decoding="async" sizes={sizes} className={className} onError={() => setFailedSrc(src)} />;
}
