"use client";

/**
 * A war story's vertical short (9:16), in a phone-shaped frame. Same rule as the lectures: signed out, the
 * first minute plays, then it asks to sign in (free); a learner's share link (?s=<token> for this story's
 * lecture) plays it in full. Plays count as views of the story's lecture (lecture_play, short: true).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import type { WarShort } from "@/lib/learn/war/load";

const FREE_S = 60;

export type ShortHandle = { play: () => void; pause: () => void };

const ShortPlayer = forwardRef<ShortHandle, { short: WarShort; shared?: boolean; muted?: boolean; onMutedChange?: (m: boolean) => void; className?: string }>(function ShortPlayer(
  { short, shared = false, muted = false, onMutedChange, className = "" },
  ref,
) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const v = useRef<HTMLVideoElement>(null);
  const [gate, setGate] = useState(false);
  const counted = useRef(false);
  const gated = !loading && !user && !shared;
  const gatedRef = useRef(gated);
  useEffect(() => {
    gatedRef.current = gated;
  }, [gated]);

  useImperativeHandle(ref, () => ({
    play: () => {
      const el = v.current;
      if (!el || (gatedRef.current && el.currentTime >= FREE_S)) return;
      void el.play().catch(() => {});
    },
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
        muted={muted}
        preload="metadata"
        className="h-full w-full object-contain"
        onVolumeChange={(e) => onMutedChange?.(e.currentTarget.muted)}
        onPlay={(e) => {
          if (gatedRef.current && e.currentTarget.currentTime >= FREE_S) {
            e.currentTarget.pause();
            setGate(true);
            return;
          }
          if (!counted.current) {
            counted.current = true;
            track("lecture_play", { quest: short.lecture, at: Math.round(e.currentTarget.currentTime), short: true });
          }
        }}
        onTimeUpdate={(e) => {
          if (gatedRef.current && e.currentTarget.currentTime >= FREE_S) {
            e.currentTarget.pause();
            e.currentTarget.currentTime = FREE_S;
            setGate(true);
          }
        }}
      />
      {gate && gated && (
        <div className="absolute inset-0 grid place-items-center bg-black/90 p-5 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">free · just sign in</span>
            <span className="font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#f3f2ee]">Sign in to keep watching</span>
            <span className="text-[14px] leading-snug text-[#c9c8c4]">Every video is free with an account. Or read the whole story now, with its sources.</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={openAuthModal} className="inline-flex min-h-11 items-center bg-signal px-5 font-mono text-sm font-semibold text-on-signal">
                sign in free
              </button>
              <a href={short.href} className="inline-flex min-h-11 items-center border border-[#3a3a40] px-4 font-mono text-sm text-[#f3f2ee]">
                read the story
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ShortPlayer;
