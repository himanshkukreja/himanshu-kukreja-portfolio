"use client";

/**
 * First visit to the course hub: a card with the welcome trailer's muted preview (the first ~10 s,
 * looping) and "Watch the 2-min intro (with sound)", which opens the player. "Not now" closes it.
 * Either way it never comes back (localStorage hk.welcomeVideo). Signed in or not; only for
 * learners with no course activity yet (the same test as the "New here?" tour card).
 *
 * No autoplay with prefers-reduced-motion, Save-Data or a 2G connection: the poster only. The
 * preview pauses off screen. While it's up it holds the floor (attention.ts), so the Notebook's
 * one-time pointer waits for another page; it takes the "New here?" card's place (`fallback`), and
 * marks the course as seen so a lesson's "You're reading…" card doesn't follow it.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Play } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { fmtClock, fmtMinutes, guideVideo, openGuideVideo, type GuideVideo } from "@/lib/learn/guide/videos";
import { holdAttention } from "@/lib/learn/guide/attention";

const KEY = "hk.welcomeVideo";
const EVT = "hk:welcome-video";
const SERVER = "\u0000server";
const BLOCKED = "\u0000blocked";
const PREVIEW_SEC = 10;
const LEARN_KEY = /^(lesson|stage|trial|boss|quiz):/;

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

function read(): string {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return BLOCKED; // no storage: it would show on every visit, so it doesn't show at all
  }
}

function remember(how: "watched" | "dismissed") {
  try {
    window.localStorage.setItem(KEY, `${how}:${Date.now()}`);
  } catch {
    // blocked: read() already keeps it hidden
  }
  window.dispatchEvent(new Event(EVT));
}

export default function WelcomeVideoCard({ fallback }: { fallback: ReactNode }) {
  const trailer = guideVideo("welcome-trailer");
  const stored = useSyncExternalStore(subscribe, read, () => SERVER);
  const { done, hydrated } = useGame();
  const fresh = hydrated && !Object.keys(done).some((k) => LEARN_KEY.test(k));
  const show = !!trailer && stored === "" && fresh;
  const [since] = useState(() => Date.now());
  // shown on this page: keep the floor until the learner leaves it, so nothing pops up right after
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!show || release.current) return;
    release.current = holdAttention();
    try {
      window.localStorage.setItem("hk.learn.seen", String(Date.now()));
    } catch {}
  }, [show]);
  useEffect(() => () => release.current?.(), []);

  if (!trailer) return fallback;
  if (stored === SERVER || !hydrated) return null;
  if (show) return <Card trailer={trailer} />;
  // closed on this visit: nothing else in its place until the next one
  const closedAt = Number(/:(\d+)$/.exec(stored)?.[1] || 0);
  return closedAt >= since ? null : fallback;
}

function canAutoplay(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c?.saveData || /2g/.test(c?.effectiveType || "")) return false;
  } catch {}
  return true;
}

function Card({ trailer }: { trailer: GuideVideo }) {
  const [auto] = useState(canAutoplay);
  const v = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLElement>(null);
  const src = trailer.preview || trailer.src;

  // play only while on screen
  useEffect(() => {
    const el = v.current;
    const root = box.current;
    if (!auto || !el || !root) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.play().catch(() => {});
      else el.pause();
    });
    io.observe(root);
    return () => io.disconnect();
  }, [auto]);

  const watch = () => {
    v.current?.pause();
    remember("watched");
    openGuideVideo(trailer.id, "welcome");
  };
  const notNow = () => {
    v.current?.pause();
    remember("dismissed");
    track("welcome_dismiss", { video: trailer.id });
  };

  return (
    <aside ref={box} aria-labelledby="wv-h" className="grid animate-hk-in overflow-hidden border border-signal bg-surface md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
      <div className="relative aspect-video w-full bg-black">
        {auto ? (
          <video
            ref={v}
            src={src}
            poster={trailer.poster}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            aria-hidden
            tabIndex={-1}
            className="block h-full w-full object-cover"
            onTimeUpdate={(e) => {
              // the full-length file as a stand-in for the preview: loop its first seconds
              const el = e.currentTarget;
              if (!trailer.preview && el.currentTime >= PREVIEW_SEC) el.currentTime = 0;
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the trailer's poster frame, from the media host
          <img src={trailer.poster} alt="" width={1280} height={720} decoding="async" className="block h-full w-full object-cover dark:brightness-[0.9]" />
        )}
        <button type="button" tabIndex={-1} aria-hidden onClick={watch} className="group absolute inset-0 grid cursor-pointer place-items-center">
          <span className="grid h-14 w-14 place-items-center bg-signal text-on-signal opacity-90 shadow-[0_6px_24px_rgba(0,0,0,0.35)] group-hover:opacity-100">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </button>
        {auto && <span className="pointer-events-none absolute left-2 top-2 bg-black/75 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-label text-white">muted preview</span>}
      </div>
      <div className="flex flex-col justify-center gap-3 p-5 sm:p-6 lg:p-8">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">New here? · {fmtClock(trailer.duration)} intro</span>
        <h2 id="wv-h" className="m-0 font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[32px]">
          Learn system design by doing, not watching<span className="text-signal-text">.</span>
        </h2>
        <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">What&apos;s in the course, how it works and where to start, in one short video.</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={watch} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-[15px] font-semibold text-on-signal hover:brightness-110">
            <Play className="h-4 w-4 fill-current" aria-hidden />
            Watch the {fmtMinutes(trailer.duration)} intro (with sound)
          </button>
          <button type="button" onClick={notNow} className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg hover:bg-surface-2">
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
