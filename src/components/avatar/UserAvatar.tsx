"use client";

import { useState } from "react";
import { initialsOf, isDisplayableAvatar } from "@/lib/avatars/catalog";

type Props = {
  src: string | null | undefined;
  name: string | null | undefined;
  /** CSS pixels (square). */
  size?: number;
  className?: string;
  /** Classes for the initials tile (colours + type), e.g. "bg-fg text-bg". */
  initialsClassName?: string;
};

/**
 * A learner's avatar: their cartoon, uploaded photo or Google photo, or their initials. A plain <img>
 * (cartoons are tiny SVGs, photos are already 256 px): no next/image domain list to keep in sync,
 * and a deleted or broken photo falls back to the initials instead of a broken-image icon.
 */
export default function UserAvatar({ src, name, size = 36, className = "", initialsClassName = "bg-surface-2 text-fg" }: Props) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = isDisplayableAvatar(src) && broken !== src ? src : null;
  const box = { width: size, height: size };
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- see the comment above
      <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" decoding="async" onError={() => setBroken(url)} className={`shrink-0 object-cover ${className}`} style={box} />
    );
  return (
    <span aria-hidden className={`grid shrink-0 select-none place-items-center font-display font-extrabold ${initialsClassName} ${className}`} style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.36)) }}>
      {initialsOf(name)}
    </span>
  );
}
