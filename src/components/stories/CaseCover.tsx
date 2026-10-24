"use client";

import CoverImage, { type CoverImageProps } from "@/components/CoverImage";
import { useReducedMotion } from "./activities/kit";

/**
 * Locally served covers (/covers/<name>.png) ship a transparent, text-free SMIL layer next to them
 * (/covers/<name>.motion.svg) drawn on the same 1536×1024 canvas. It is laid over the static PNG,
 * which stays the source of truth for cards, OpenGraph and reduced motion.
 */
export function coverMotionSrc(src?: string): string | null {
  return src && /^\/covers\/[\w-]+\.png$/.test(src) ? src.replace(/\.png$/, ".motion.svg") : null;
}

/** `motionSrc`: an explicit animated layer (CMS case files upload one); otherwise derived from /covers/<name>.png. */
export default function CaseCover({ motionSrc, ...props }: CoverImageProps & { motionSrc?: string }) {
  const reduced = useReducedMotion();
  const motion = reduced ? null : motionSrc || coverMotionSrc(props.src);
  if (!motion) return <CoverImage {...props} />;
  return (
    <div className={props.fill ? "absolute inset-0" : "relative"}>
      <CoverImage {...props} className={[props.className, props.fill ? "h-full w-full" : ""].filter(Boolean).join(" ")} />
      {/* above the fold (priority) it loads with the cover: it's the largest paint there, so a lazy load delayed LCP by seconds */}
      {/* eslint-disable-next-line @next/next/no-img-element -- animated SVG: next/image would rasterise it */}
      <img
        src={motion}
        alt=""
        aria-hidden
        loading={props.priority ? "eager" : "lazy"}
        fetchPriority={props.priority ? "high" : "auto"}
        decoding="async"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
