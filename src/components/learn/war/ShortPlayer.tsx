"use client";

/**
 * One vertical short (9:16) in a phone-shaped frame. Shorts are public, the funnel into the full lectures
 * (which ask for a free account after the first minute), so there's no gate here. A play counts as a view
 * of the lecture it comes from (lecture_play, short: id).
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { track } from "@/lib/track";
import type { PlayableShort } from "@/lib/learn/shorts/types";

export type ShortHandle = { play: () => void; pause: () => void };

const ShortPlayer = forwardRef<ShortHandle, { short: PlayableShort; muted?: boolean; onMutedChange?: (m: boolean) => void; className?: string }>(function ShortPlayer(
  { short, muted = false, onMutedChange, className = "" },
  ref,
) {
  const v = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);

  useImperativeHandle(ref, () => ({
    play: () => void v.current?.play().catch(() => {}),
    pause: () => v.current?.pause(),
  }));

  return (
    <div className={`relative aspect-[9/16] overflow-hidden border border-line-strong bg-[#0b0b0c] ${className}`}>
      <video
        ref={v}
        src={short.src}
        poster={short.poster}
        playsInline
        controls
        loop
        muted={muted}
        preload="metadata"
        className="h-full w-full object-contain"
        onVolumeChange={(e) => onMutedChange?.(e.currentTarget.muted)}
        onPlay={(e) => {
          if (counted.current) return;
          counted.current = true;
          track("lecture_play", { quest: short.lecture, at: Math.round(e.currentTarget.currentTime), short: short.id });
        }}
      />
    </div>
  );
});

export default ShortPlayer;
