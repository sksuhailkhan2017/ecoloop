"use client";

import Image from "next/image";
import { useState } from "react";

import { CATEGORY_META, type Category } from "@/lib/types";
import { cloudinaryLoader, isCloudinaryUrl } from "@/lib/upload";

/**
 * Listing / handover photo with a category fallback when there is no photo or it fails to load.
 * Remote photos go through next/image (Cloudinary resizes its own; others use the Netlify image
 * CDN). Data URLs (camera previews in demo mode) use a plain <img>. The wrapper always has an
 * explicit aspect ratio from `className`, so images never shift layout.
 */
export function ItemImage({
  src,
  alt,
  category = "other",
  className = "",
  imgClassName = "",
  loading = "lazy",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  src?: string;
  alt: string;
  category?: Category;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const meta = CATEGORY_META[category];

  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={`flex items-center justify-center bg-gradient-to-br ${meta.gradient} ${className}`}>
        <span className="text-5xl drop-shadow-sm" aria-hidden="true">
          {meta.emoji}
        </span>
      </div>
    );
  }

  const remote = /^https?:\/\//.test(src);

  return (
    <div className={`relative overflow-hidden bg-stone-100 ${className}`}>
      {remote ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={loading === "eager"}
          loader={isCloudinaryUrl(src) ? cloudinaryLoader : undefined}
          onError={() => setFailed(true)}
          className={`object-cover ${imgClassName}`}
        />
      ) : (
        <img src={src} alt={alt} loading={loading} onError={() => setFailed(true)} className={`h-full w-full object-cover ${imgClassName}`} />
      )}
    </div>
  );
}
