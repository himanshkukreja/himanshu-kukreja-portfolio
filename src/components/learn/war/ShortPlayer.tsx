"use client";

/**
 * One vertical short (9:16) in a phone-shaped frame, with the site's own controls instead of the browser's:
 * tap to play or pause (a big signal-orange play button while paused), a thin seek bar along the bottom that
 * thickens and can be dragged, the time while paused or scrubbing, a mute toggle, and a spinner while it
 * buffers. Space/K toggles, ←/→ seek 5 s, M mutes (when the player has focus).
 * In the feed, only the shorts around the one on screen get a <video> at all (the rest are their poster),
 * the one on screen and the next buffer ahead (preload "auto"), and `active` plays the one on screen, so a
 * swipe lands on a short that is already loading or loaded, as in Reels.
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
  /** a tap on the video: return true to take it (e.g. to bring the feed's controls back) instead of play/pause */
  onTap?: () => boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** feed: false renders just the poster (no <video>, no network); default true */
  mounted?: boolean;
  /** feed: how much to fetch ahead ("auto" for the one on screen and the next) */
  preload?: "auto" | "metadata" | "none";
  /** feed: this is the short on screen, so it plays (and the others pause) */
  active?: boolean;
  /** the first poster on the page loads first */
  priority?: boolean;
  /** feed: one of the next shorts. Play it muted for a moment and stop, so it has buffered before the swipe
   * (iPhone Safari ignores preload="auto" and only fetches a video that plays) */
  warm?: boolean;
};

const ShortPlayer = forwardRef<ShortHandle, Props>(function ShortPlayer(
  { short, muted = false, onMutedChange, autoPlay = false, className = "aspect-[9/16] border border-line-strong", muteClassName = "", onTap, onPlayingChange, mounted = true, preload = "metadata", active, priority = false, warm = false },
  ref,
) {
  const v = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);
  const resume = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(short.seconds || 0);
  const [waiting, setWaiting] = useState(false);
  // the spinner shows only after a short wait, so a quick start never flashes it
  const [slow, setSlow] = useState(false);
  const [started, setStarted] = useState(false);
  const [scrub, setScrub] = useState(false);
  // the element's own muted state (a parent may set it, the viewer may toggle it here)
  const [isMuted, setIsMuted] = useState(muted);
  // a warm-up play (see `warm`) is silent and invisible to the feed: no play state, no view, no mute changes
  const warming = useRef(false);
  const warmed = useRef(false);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
    const el = v.current;
    if (!el || warming.current) return;
    el.muted = muted;
    // React sets only the property; iPhone Safari's autoplay also looks for the attribute
    el.toggleAttribute("muted", muted);
  }, [muted, mounted]);

  // feed: play the short on screen, pause the rest (also once a just-mounted <video> appears)
  useEffect(() => {
    const el = v.current;
    if (active === undefined || !el) return;
    if (active) {
      warming.current = false;
      el.muted = mutedRef.current;
      el.toggleAttribute("muted", mutedRef.current);
    }
    if (active)
      void el.play().catch((e: unknown) => {
        // the browser won't play sound before the visitor has interacted with the site: play muted instead
        if (e instanceof DOMException && e.name === "NotAllowedError" && !el.muted) {
          el.muted = true;
          el.toggleAttribute("muted", true);
          onMutedChange?.(true);
          void el.play().catch(() => {});
        }
      });
    else el.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMutedChange is the feed's setState
  }, [active, mounted]);

  // warm-up: a muted play until the first frames have decoded, then pause back at the start
  useEffect(() => {
    const el = v.current;
    if (!warm || active || !el || warmed.current) return;
    warmed.current = true;
    warming.current = true;
    el.muted = true;
    el.toggleAttribute("muted", true);
    const stop = () => {
      if (!warming.current) return;
      // the pause event arrives after pause() returns: only then is the warm-up over, so the feed never sees it
      el.addEventListener(
        "pause",
        () => {
          el.currentTime = 0;
          warming.current = false;
        },
        { once: true },
      );
      el.pause();
    };
    const onTime = () => el.currentTime > 0.25 && stop();
    el.addEventListener("timeupdate", onTime);
    const id = window.setTimeout(stop, 4000);
    void el.play().catch(() => {
      warming.current = false;
    });
    return () => {
      el.removeEventListener("timeupdate", onTime);
      window.clearTimeout(id);
    };
  }, [warm, active, mounted]);
  const loading = mounted && (waiting || (!!active && !started));
  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(() => setSlow(true), 250);
    return () => window.clearTimeout(id);
  }, [loading]);
  const spin = loading && slow;

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
      {!mounted ? (
        // far from the one on screen: just the poster, no video download yet
        // eslint-disable-next-line @next/next/no-img-element -- a plain poster frame, same file the <video> uses
        <img src={short.poster} alt="" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className="h-full w-full object-contain" />
      ) : (
      <video
        ref={v}
        src={short.src}
        poster={short.poster}
        playsInline
        loop
        autoPlay={autoPlay}
        muted={muted}
        preload={preload}
        className="h-full w-full cursor-pointer object-contain"
        onClick={() => {
          if (!onTap?.()) toggle();
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || short.seconds || 0)}
        onTimeUpdate={(e) => {
          if (warming.current) return;
          const el = e.currentTarget;
          if (!scrub) setTime(el.currentTime);
          // a short that autoplayed from the HTML started before React was listening: catch up from its clock
          if (!el.paused && !playing) {
            setPlaying(true);
            setStarted(true);
            setWaiting(false);
            onPlayingChange?.(true);
          }
        }}
        onPlaying={() => {
          if (warming.current) return;
          setWaiting(false);
          setSlow(false);
          setStarted(true);
        }}
        onWaiting={() => {
          if (warming.current) return;
          setSlow(false);
          setWaiting(true);
        }}
        onPause={() => {
          if (warming.current) return;
          setPlaying(false);
          onPlayingChange?.(false);
        }}
        onVolumeChange={(e) => {
          if (warming.current) return;
          setIsMuted(e.currentTarget.muted);
          onMutedChange?.(e.currentTarget.muted);
        }}
        onPlay={(e) => {
          if (warming.current) return;
          setPlaying(true);
          onPlayingChange?.(true);
          if (counted.current) return;
          counted.current = true;
          track("lecture_play", { quest: short.lecture, at: Math.round(e.currentTarget.currentTime), short: short.id });
        }}
      />
      )}

      {/* paused: one big play button in the middle */}
      {mounted && !playing && !scrub && !(active && !started) && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center bg-signal text-on-signal shadow-[0_8px_30px_rgba(0,0,0,0.55)] transition-transform hover:scale-105"
        >
          <Play className="h-7 w-7 translate-x-[2px]" fill="currentColor" aria-hidden />
        </button>
      )}
      {/* loading: a fixed centre (the spin is on the inner ring, so it never fights the centring transform) */}
      {spin && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-signal" />
        </span>
      )}

      {/* mute: bottom-right, clear of the short's own label and sticker up top; signal orange while muted */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted ? "Turn sound on" : "Mute"}
        aria-pressed={!isMuted}
        title={isMuted ? "Sound on (M)" : "Mute (M)"}
        className={`${muteClassName} absolute bottom-6 right-2 grid h-9 w-9 place-items-center shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-colors ${isMuted ? "bg-signal text-on-signal" : "bg-black/60 text-[#f3f2ee] hover:bg-signal hover:text-on-signal"}`}
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
