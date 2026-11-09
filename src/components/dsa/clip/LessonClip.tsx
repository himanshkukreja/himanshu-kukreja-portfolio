"use client";

/**
 * An in-article clip (`::clip[id]` in a visual lesson; dsa-mastery clips.json): a 20-30 s video of one lecture scene,
 * recorded by scripts/lecture/export.mjs at 1280x720 with the narration as its audio track and no music.
 *
 * - Scrolled into view, it plays muted on a loop; scrolled away, it pauses. Nothing downloads until it is near.
 * - Tap: it plays from the start with the narration and captions (one clip narrates at a time); at the end it goes
 *   back to the silent loop. Tap again to pause or resume; "Silent" stops the narration.
 * - prefers-reduced-motion (or Data Saver): no autoplay; the poster with a play button, and tap plays it narrated.
 * - media.json (fetched like the lecture player's) must carry this script's hash (`v`), or the clip hides itself: a
 *   changed script reads as "not recorded yet". Saved lessons keep the video, poster and media.json (offline).
 */
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LessonClipData } from "@/lib/dsa/structures";

type Mode = "loop" | "narrated" | "idle";
type Media = { source: string; starts: number[]; duration: number };

const NARRATE = "hk:clip-narrate";

/** The sentence being spoken: the step's text split into sentences, timed by their length. */
function captionAt(say: string, f: number): string {
  const parts = say.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map((x) => x.trim()) || [say];
  const total = parts.reduce((a, p) => a + p.length, 0) || 1;
  let acc = 0;
  for (const p of parts) {
    acc += p.length;
    if (f <= acc / total) return p;
  }
  return parts[parts.length - 1];
}

const fmt = (s: number) => `0:${String(Math.max(0, Math.round(s))).padStart(2, "0")}`;

function useCalm(): boolean {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const save = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const on = () => setCalm(mq.matches || save);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return calm;
}

export default function LessonClip({ clip, fig }: { clip: LessonClipData; fig: HTMLElement }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const calm = useCalm();
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [want, setMode] = useState<Mode>("loop");
  // reduced motion: never the silent loop; a poster with a play button instead
  const mode: Mode = calm && want === "loop" ? "idle" : want;
  const [paused, setPaused] = useState(false);
  const [media, setMedia] = useState<Media | null>(null);
  const [gone, setGone] = useState(!clip.base);
  const [t, setT] = useState(0);
  const src = clip.base ? `${clip.base}video.mp4?v=${clip.v}` : "";
  const poster = clip.base ? `${clip.base}poster.jpg?v=${clip.v}` : "";

  // not recorded (or recorded from another script): the figure steps aside
  useEffect(() => {
    if (gone) fig.setAttribute("hidden", "");
  }, [gone, fig]);

  // the recording's timings (captions while narrated) and the check that it matches this script
  useEffect(() => {
    if (!clip.base || !near) return;
    let off = false;
    fetch(`${clip.base}media.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<Media>) : null))
      .then((m) => {
        if (off) return;
        if (!m || m.source !== clip.v) setGone(true);
        else setMedia(m);
      })
      .catch(() => {
        // offline and not saved, or the host is unreachable: the video's own error decides
      });
    return () => {
      off = true;
    };
  }, [clip.base, clip.v, near]);

  // near the viewport: start loading; mostly on screen: play the silent loop
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setNear(true);
          setInView(e.intersectionRatio >= 0.55);
        }
      },
      { rootMargin: "300px 0px", threshold: [0, 0.55] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // the silent loop follows the viewport; narration pauses when the clip leaves it
  useEffect(() => {
    const v = video.current;
    if (!v || !near) return;
    if (mode === "loop") {
      v.muted = true;
      v.loop = true;
      // autoplay refused (iOS Low Power Mode, a browser setting): the poster and play button; an AbortError only means
      // a pause or a new load cut this play short
      if (inView && !calm) void v.play().catch((e: unknown) => (e as Error)?.name === "NotAllowedError" && setMode("idle"));
      else v.pause();
    } else if (mode === "narrated" && !inView && !v.paused) {
      v.pause();
    }
  }, [mode, inView, calm, near]);

  // another clip started narrating: this one goes quiet
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== clip.id) setMode((m) => (m === "narrated" ? (calm ? "idle" : "loop") : m));
    };
    window.addEventListener(NARRATE, on);
    return () => window.removeEventListener(NARRATE, on);
  }, [clip.id, calm]);

  const narrate = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (mode === "narrated") {
      if (v.paused) void v.play().catch(() => {});
      else v.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(NARRATE, { detail: clip.id }));
    v.loop = false;
    v.muted = false;
    v.currentTime = 0;
    setMode("narrated");
    void v.play().catch((e: unknown) => {
      if ((e as Error)?.name !== "NotAllowedError") return;
      // sound refused (no user activation): fall back to the silent loop
      v.muted = true;
      setMode(calm ? "idle" : "loop");
    });
  }, [mode, clip.id, calm]);

  const silence = useCallback(() => {
    const v = video.current;
    if (v) {
      v.muted = true;
      if (calm) {
        v.pause();
        v.currentTime = 0;
      }
    }
    setMode(calm ? "idle" : "loop");
  }, [calm]);

  if (gone) return null;

  // the caption line while narrated: which step is speaking, then which sentence of it
  let line = "";
  if (mode === "narrated" && clip.say.length) {
    const starts = media && media.starts.length === clip.say.length ? media.starts : clip.say.map((_, k) => (k / clip.say.length) * (media?.duration || 15));
    let k = 0;
    while (k + 1 < starts.length && t >= starts[k + 1]) k++;
    const end = k + 1 < starts.length ? starts[k + 1] : media?.duration || starts[k] + 5;
    line = captionAt(clip.say[k], (t - starts[k]) / Math.max(0.5, end - starts[k] - 0.45));
  }
  const dur = media?.duration || 0;
  const narrated = mode === "narrated";

  return (
    <div className="dsa-ui flex flex-col">
      <div ref={box} className="relative aspect-video w-full overflow-hidden bg-[#0b0b0c]">
        {near && (
          <video
            ref={video}
            src={src}
            poster={poster}
            muted
            loop
            playsInline
            preload={calm ? "none" : "auto"}
            aria-label={`Video clip: ${clip.caption}`}
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
            onClick={narrate}
            onError={() => setGone(true)}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onTimeUpdate={(e) => narrated && setT(e.currentTarget.currentTime)}
            onEnded={() => {
              setT(0);
              silence();
            }}
          />
        )}
        {!narrated && (
          <button
            type="button"
            onClick={narrate}
            aria-label="Play this clip with narration"
            className={
              mode === "idle"
                ? "absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--c-signal)] text-[#04201a] shadow-lg"
                : "absolute bottom-2 left-2 flex min-h-9 items-center gap-1.5 bg-black/70 px-2.5 font-mono text-[12px] uppercase tracking-label text-white hover:bg-black/85"
            }
          >
            {mode === "idle" ? <Play size={24} aria-hidden fill="currentColor" /> : <Volume2 size={15} aria-hidden />}
            {mode === "idle" ? null : <span>Tap to hear</span>}
          </button>
        )}
        {narrated && (
          <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={narrate} aria-label={paused ? "Resume" : "Pause"} className="flex h-9 w-9 items-center justify-center text-white hover:text-[var(--c-signal)]">
                {paused ? <Play size={17} aria-hidden fill="currentColor" /> : <Pause size={17} aria-hidden fill="currentColor" />}
              </button>
              <div className="h-1 flex-1 bg-white/25" aria-hidden>
                <div className="h-full bg-[var(--c-signal)]" style={{ width: `${dur ? Math.min(100, (t / dur) * 100) : 0}%` }} />
              </div>
              <span className="font-mono text-[11px] tabular-nums text-white/80">
                {fmt(t)} / {fmt(dur)}
              </span>
              <button type="button" onClick={silence} aria-label="Stop the narration" className="flex min-h-9 items-center gap-1 px-1.5 font-mono text-[11px] uppercase tracking-label text-white/85 hover:text-white">
                <VolumeX size={15} aria-hidden /> Silent
              </button>
            </div>
          </div>
        )}
      </div>
      {/* the narration's captions, under the picture so they never cover the stage's own labels */}
      {narrated && (
        <p aria-live="polite" className="m-0 flex min-h-[3.4em] items-center justify-center bg-[#0b0b0c] px-3 py-1.5 text-center text-[14px] leading-snug text-white sm:text-[15px]">
          {line}
        </p>
      )}
      <p className="m-0 flex items-baseline gap-2 border-t border-line px-3 py-2.5 text-[14px] leading-snug text-fg-2 sm:px-4">
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-label text-signal-text">Clip{dur ? ` · ${fmt(dur)}` : ""}</span>
        <span>{clip.caption}</span>
      </p>
    </div>
  );
}
