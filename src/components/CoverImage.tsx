"use client";
import Image from "next/image";
import { useMemo, useState, useCallback } from "react";
import { resolveCoverUrl } from "@/lib/utils";

export type CoverImageProps = {
  src?: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  // Optional: override container classes
  containerClassName?: string;
};

export default function CoverImage({ src, alt, width, height, className, priority, containerClassName }: CoverImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const finalSrc = useMemo(() => resolveCoverUrl(src), [src]);

  const handleLoad = useCallback(() => setLoaded(true), []);
  const handleError = useCallback(() => setErrored(true), []);

  // Do not render anything if there's no src or it failed to load
  if (!finalSrc || errored) return null;

  return (
    <div className={[
      "relative overflow-hidden rounded-xl ring-1 ring-white/10",
      loaded ? "bg-transparent" : "bg-white/[0.06]",
      containerClassName,
      className,
    ].filter(Boolean).join(" ")}
    >
      {/* Skeleton */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-indigo-500/10 via-blue-500/10 to-purple-500/10" />
      )}

      <Image
        src={finalSrc}
        alt={alt}
        width={width}
        height={height}
        className={["w-full h-auto object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0"].join(" ")}
        priority={priority}
        onLoadingComplete={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
