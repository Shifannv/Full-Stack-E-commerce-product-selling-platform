"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { publicImageUrl } from "@/lib/images";
import { CatalogImage } from "@/components/storefront/catalog-image";

type GalleryImage = { id: string; objectKey: string; altText: string | null };

export function ProductGallery({
  images,
  name,
}: {
  images: GalleryImage[];
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const selected = images[index];
  const url = publicImageUrl(selected?.objectKey);
  const showPrevious = () =>
    setIndex((current) => (current - 1 + images.length) % images.length);
  const showNext = () =>
    setIndex((current) => (current + 1) % images.length);
  return (
    <div className="product-gallery">
      <div
        className="product-gallery-stage relative aspect-[4/5] overflow-hidden bg-secondary"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const end = event.changedTouches[0]?.clientX;
          touchStart.current = null;
          if (start === null || end === undefined || Math.abs(start - end) < 45)
            return;
          if (start > end) showNext();
          else showPrevious();
        }}
      >
        <CatalogImage src={url} alt={selected?.altText || name} sizes="(max-width: 768px) 100vw, 50vw" priority className="object-cover" />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={showPrevious}
              aria-label="View previous product image"
              className="product-gallery-arrow left-3"
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNext}
              aria-label="View next product image"
              className="product-gallery-arrow right-3"
            >
              <ArrowRight aria-hidden="true" />
            </button>
            <span className="product-gallery-count" aria-live="polite">
              {index + 1} / {images.length}
            </span>
          </>
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
                className="product-gallery-thumb relative size-20 shrink-0 overflow-hidden border border-transparent aria-pressed:border-primary"
              >
                <CatalogImage src={thumb} alt="" sizes="80px" fallback="none" className="object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
