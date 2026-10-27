"use client";

/**
 * One vertical short (9:16) in a phone-shaped frame, with the site's own controls instead of the browser's:
 * tap to play or pause (a big signal-orange play button while paused), a thin seek bar along the bottom that
 * thickens and can be dragged, the time while paused or scrubbing, a mute toggle, and a spinner while it
 * buffers. Space/K toggles, ←/→ seek 5 s, M mutes (when the player has focus).
 * Shorts are public, the funnel into the full lectures (which ask for a free account after the first minute),
 * so there's no gate here. A play counts as a view of the lecture it comes from (lecture_play, short: id).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { track } from "@/lib/track";
import type { PlayableShort } from "@/lib/learn/shorts/types";

export type ShortHandle = { play: () => void; pause: () => void };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Props = {
  short: PlayableShort;
  muted?: boolean;
  onMutedChange?: (m: boolean) => void;
  autoPlay?: boolean;
  /** the frame: size, aspect and border (the feed fills the phone screen; elsewhere it's a 9:16 card) */
  className?: string;
  /** the feed's phone layout has its own mute in the action rail */
  muteClassName?: string;
};

const ShortPlayer = forwardRef<ShortHandle, Props>(function ShortPlayer(
  { short, muted = false, onMutedChange, autoPlay = false, className = "aspect-[9/16] border border-line-strong", muteClassName = "" },
  ref,
) {
  const v = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);
  const resume = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(short.seconds || 0);
  const [waiting, setWaiting] = useState(false);
  const [scrub, setScrub] = useState(false);
  // the element's own muted state (a parent may set it, the viewer may toggle it here)
  const [isMuted, setIsMuted] = useState(muted);
  useEffect(() => {
    if (v.current) v.current.muted = muted;
  }, [muted]);

  useImperativeHandle(ref, () => ({
    play: () => void v.current?.play().catch(() => {}),
    pause: () => v.current?.pause(),
  }));

  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };
  const seekTo = (s: number) => {
    const el = v.current;
    if (!el || !duration) return;
    el.currentTime = Math.max(0, Math.min(duration - 0.05, s));
    setTime(el.currentTime);
  };
  const atPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * duration);
  };
  const toggleMute = () => {
    const el = v.current;
    if (!el) return;
    el.muted = !el.muted;
  };

  const pct = duration ? (time / duration) * 100 : 0;
  const showTime = !playing || scrub;

  return (
    <div
      className={`group/sp relative select-none overflow-hidden bg-[#0b0b0c] outline-none focus-visible:border-signal ${className}`}
      tabIndex={0}
      role="region"
      aria-label={`Short: ${short.title}`}
      onKeyDown={(e) => {
        const k = e.key.toLowerCase();
        if (k === " " || k === "k") {
          e.preventDefault();
          toggle();
        } else if (k === "arrowleft") seekTo(time - 5);
        else if (k === "arrowright") seekTo(time + 5);
        else if (k === "m") toggleMute();
      }}
    >
      <video
        ref={v}
        src={short.src}
        poster={short.poster}
        playsInline
        loop
        autoPlay={autoPlay}
        muted={muted}
        preload="metadata"
        className="h-full w-full cursor-pointer object-contain"
        onClick={toggle}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || short.seconds || 0)}
        onTimeUpdate={(e) => !scrub && setTime(e.currentTarget.currentTime)}
        onPlaying={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onPause={() => setPlaying(false)}
        onVolumeChange={(e) => {
          setIsMuted(e.currentTarget.muted);
          onMutedChange?.(e.currentTarget.muted);
        }}
        onPlay={(e) => {
          setPlaying(true);
          if (counted.current) return;
          counted.current = true;
          track("lecture_play", { quest: short.lecture, at: Math.round(e.currentTarget.currentTime), short: short.id });
        }}
      />

      {/* paused: one big play button in the middle */}
      {!playing && !scrub && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center bg-signal text-on-signal shadow-[0_8px_30px_rgba(0,0,0,0.55)] transition-transform hover:scale-105"
        >
          <Play className="h-7 w-7 translate-x-[2px]" fill="currentColor" aria-hidden />
        </button>
      )}
      {waiting && playing && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-[3px] border-white/20 border-t-signal" aria-hidden />
      )}

      {/* mute: bottom-right, clear of the short's own label and sticker up top; signal orange while muted */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted ? "Turn sound on" : "Mute"}
        aria-pressed={!isMuted}
        title={isMuted ? "Sound on (M)" : "Mute (M)"}
        className={`${muteClassName} absolute bottom-6 right-2 grid h-9 w-9 place-items-center shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-colors ${isMuted ? "bg-signal text-on-signal" : "bg-black/55 text-[#f3f2ee] backdrop-blur-sm hover:bg-signal hover:text-on-signal"}`}
      >
        {isMuted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
      </button>

      {/* time, while paused or scrubbing: just under the play button */}
      {showTime && duration > 0 && (
        <span className="pointer-events-none absolute left-1/2 top-[calc(50%+44px)] -translate-x-1/2 bg-black/65 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[#f3f2ee]">
          {fmt(time)} / {fmt(duration)}
        </span>
      )}

      {/* seek bar: a hairline that thickens on hover or drag */}
      <div
        role="slider"
        tabIndex={-1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
        className="group/bar absolute inset-x-0 bottom-0 flex h-[calc(1.25rem+env(safe-area-inset-bottom,0px))] cursor-pointer touch-none items-end pb-[env(safe-area-inset-bottom,0px)]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          resume.current = !!v.current && !v.current.paused;
          v.current?.pause();
          setScrub(true);
          atPointer(e);
        }}
        onPointerMove={(e) => scrub && atPointer(e)}
        onPointerUp={(e) => {
          if (!scrub) return;
          atPointer(e);
          setScrub(false);
          if (resume.current) void v.current?.play().catch(() => {});
        }}
        onPointerCancel={() => setScrub(false)}
      >
        <div className={`relative w-full bg-white/20 transition-[height] ${scrub ? "h-1.5" : "h-[3px] group-hover/bar:h-1.5"}`}>
          <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
          <span
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_10px_rgba(255,107,43,0.7)] transition-opacity ${scrub ? "opacity-100" : "opacity-0 group-hover/bar:opacity-100"}`}
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
});

export default ShortPlayer;
