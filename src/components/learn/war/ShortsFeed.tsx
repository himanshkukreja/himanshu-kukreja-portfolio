"use client";

/**
 * /learn/war-stories/shorts: every war story's vertical short in a swipe-through feed (Reels-style on a
 * phone, a centred column with the story beside it on a laptop). The one in view plays, muted until the
 * viewer taps for sound (browsers block autoplay with sound). ?v=<slug> opens at that short; ?v=…&s=<token>
 * is a learner's share link, which plays that short in full without an account.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import type { WarShort } from "@/lib/learn/war/load";
import ShortPlayer, { type ShortHandle } from "./ShortPlayer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function ShortsFeed({ shorts }: { shorts: WarShort[] }) {
  const { user } = useAuth();
  const [muted, setMuted] = useState(true);
  const [shared, setShared] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const players = useRef<Record<string, ShortHandle | null>>({});
  const items = useRef<Record<string, HTMLElement | null>>({});

  // ?v= opens at that short; ?s= is a share link for it
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("v");
    const s = q.get("s");
    if (v) items.current[v]?.scrollIntoView({ block: "start" });
    if (v && s)
      fetch(`/api/learn/lectures/share?lecture=${encodeURIComponent(`war-stories--${v}`)}&s=${encodeURIComponent(s)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean }>) : { ok: false }))
        .then((d) => d.ok && setShared(v))
        .catch(() => {});
  }, []);

  // the short that is mostly on screen plays; the rest pause
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const slug = (e.target as HTMLElement).dataset.slug!;
          if (e.intersectionRatio >= 0.6) players.current[slug]?.play();
          else players.current[slug]?.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    for (const el of Object.values(items.current)) if (el) io.observe(el);
    return () => io.disconnect();
  }, [shorts]);

  const share = async (s: WarShort) => {
    let token: string | null = null;
    if (user) {
      const r = await userFetch("/api/learn/lectures/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lecture: s.lecture }) }).catch(() => null);
      token = r && r.ok ? ((await r.json()) as { token: string }).token : null;
    } else if (shared === s.slug) {
      token = new URLSearchParams(window.location.search).get("s");
    }
    const url = `${window.location.origin}/learn/war-stories/shorts?v=${s.slug}${token ? `&s=${token}` : ""}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) await navigator.share({ title: s.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(s.slug);
        window.setTimeout(() => setCopied(null), 1800);
      }
      track("lecture_share", { quest: s.lecture, at: 0, channel: "short" });
    } catch {
      // dismissed
    }
  };

  return (
    <main className="relative mx-auto w-full max-w-[1100px]">
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className="fixed right-3 top-[calc(var(--hk-header-h,61px)+10px)] z-40 inline-flex h-10 items-center gap-2 bg-signal px-3 font-mono text-xs font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] lg:bottom-6 lg:right-6 lg:top-auto lg:h-11 lg:px-3.5"
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {muted ? "tap for sound" : "sound on"}
      </button>
      <ol className="m-0 h-[calc(100dvh-var(--hk-header-h,61px)-67px-env(safe-area-inset-bottom,0px))] list-none lg:h-[calc(100dvh-var(--hk-header-h,61px))] snap-y snap-mandatory overflow-y-auto overscroll-contain p-0 [scrollbar-width:none]">
        {shorts.map((s, k) => (
          <li
            key={s.slug}
            data-slug={s.slug}
            ref={(el) => {
              items.current[s.slug] = el;
            }}
            className="flex h-full snap-start snap-always flex-col items-center justify-center gap-2 px-3 py-3 lg:flex-row lg:gap-8 lg:px-6"
          >
            <div className="flex min-h-0 flex-1 justify-center lg:h-full lg:flex-none">
            <ShortPlayer
              ref={(h) => {
                players.current[s.slug] = h;
              }}
              short={s}
              shared={shared === s.slug}
              muted={muted}
              onMutedChange={setMuted}
              className="h-full max-h-full w-auto max-w-full"
            />
            </div>
            {/* phones: the story link and share under the frame (the feed ends above the tab bar) */}
            <div className="flex w-full max-w-[420px] items-center justify-between gap-2 font-mono text-[11px] lg:hidden">
              <span className="text-fg-3">
                {k + 1}/{shorts.length} · {fmt(s.seconds)}
              </span>
              <span className="flex gap-2">
                <Link href={s.href} className="inline-flex min-h-9 items-center border border-line-strong px-2.5 text-fg">
                  read the story
                </Link>
                <button type="button" onClick={() => void share(s)} className="min-h-9 border border-line-strong px-2.5 text-fg-2">
                  {copied === s.slug ? "copied ✓" : "share"}
                </button>
              </span>
            </div>
            <div className="hidden w-[320px] shrink-0 flex-col gap-3 lg:flex">
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                short {k + 1} of {shorts.length} · {s.company}
                {s.when ? ` · ${s.when}` : ""} · {fmt(s.seconds)}
              </span>
              <span className="font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{s.title}</span>
              <div className="flex flex-wrap gap-2">
                <Link href={s.href} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg hover:border-signal">
                  read the story →
                </Link>
                <button type="button" onClick={() => void share(s)} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:text-fg">
                  {copied === s.slug ? "link copied ✓" : "share"}
                </button>
              </div>
              <span className="font-mono text-[11px] text-fg-4">scroll for the next one ↓</span>
            </div>
          </li>
        ))}
      </ol>
      <nav aria-label="Shorts" className="flex flex-wrap justify-center gap-3 px-4 py-3 font-mono text-xs text-fg-3 lg:hidden">
        <Link href="/learn/war-stories" className="underline decoration-line-strong underline-offset-4">
          all war stories
        </Link>
      </nav>
    </main>
  );
}
