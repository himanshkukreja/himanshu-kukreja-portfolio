"use client";
import Image from "next/image";
import { useMemo, useState, useCallback } from "react";
import { resolveCoverUrl } from "@/lib/utils";

export type CoverImageProps = {
  src?: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  // Optional: override container classes
  containerClassName?: string;
  /** Fill the (positioned, sized) parent instead of using intrinsic width/height. */
  fill?: boolean;
  sizes?: string;
  imgClassName?: string;
};

/**
 * Story cover ("blueprint"). Square corners, 1px line border, blueprint-grid skeleton
 * while loading. Renders nothing when there is no src or the image fails to load,
 * so callers can put their own placeholder behind it.
 */
export default function CoverImage({
  src,
  alt,
  width = 1200,
  height = 630,
  className,
  priority,
  containerClassName,
  fill,
  sizes,
  imgClassName,
}: CoverImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const finalSrc = useMemo(() => resolveCoverUrl(src), [src]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setErrored(true), []);

  if (!finalSrc || errored) return null;

  return (
    <div
      className={[
        "relative overflow-hidden",
        fill ? "absolute inset-0" : "border border-line",
        loaded ? "bg-transparent" : "bg-raised",
        containerClassName,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!loaded && !priority && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse bg-[linear-gradient(var(--c-line)_1px,transparent_1px),linear-gradient(90deg,var(--c-line)_1px,transparent_1px)] bg-[size:24px_24px] opacity-60"
        />
      )}

      {fill ? (
        <Image
          src={finalSrc}
          alt={alt}
          fill
          sizes={sizes || "(min-width: 1024px) 760px, 100vw"}
          className={["object-cover transition-opacity duration-300", loaded || priority ? "opacity-100" : "opacity-0", imgClassName].filter(Boolean).join(" ")}
          priority={priority}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <Image
          src={finalSrc}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className={["h-auto w-full object-cover transition-opacity duration-300", loaded || priority ? "opacity-100" : "opacity-0", imgClassName].filter(Boolean).join(" ")}
          priority={priority}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}
