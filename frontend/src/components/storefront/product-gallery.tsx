"use client";

import { useState } from "react";
import Image from "next/image";
import { publicImageUrl } from "@/lib/images";

type GalleryImage = { id: string; objectKey: string; altText: string | null };

export function ProductGallery({
  images,
  name,
}: {
  images: GalleryImage[];
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const selected = images[index];
  const url = publicImageUrl(selected?.objectKey);
  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
        {url ? (
          <Image
            src={url}
            alt={selected.altText || name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Image coming soon
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div
          className="mt-3 flex gap-2 overflow-x-auto"
          aria-label="Product images"
        >
          {images.map((image, imageIndex) => {
            const thumb = publicImageUrl(image.objectKey);
            return (
              <button
                type="button"
                key={image.id}
                aria-label={`View image ${imageIndex + 1}`}
                aria-pressed={imageIndex === index}
                onClick={() => setIndex(imageIndex)}
                className="relative size-18 shrink-0 overflow-hidden border border-border aria-pressed:border-primary"
              >
                {thumb && (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="72px"
                    className="object-cover"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
