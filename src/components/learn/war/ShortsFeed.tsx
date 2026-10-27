"use client";

/**
 * /learn/shorts: every vertical short in a swipe-through feed (Reels-style on a phone, a centred column
 * with the details beside it on a laptop), filtered by category (course, side quests, real incidents, …)
 * and topic (caching, databases, …). The short in view plays, muted until the viewer taps for sound.
 * Every short links to its full lecture at that moment and to its written article.
 * ?v=<id> opens at a short; ?cat= and ?topic= set the filters (shareable).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { track } from "@/lib/track";
import { SHORT_CATEGORIES, type PlayableShort, type ShortCategory } from "@/lib/learn/shorts/types";
import ShortPlayer, { type ShortHandle } from "./ShortPlayer";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function ShortsFeed({ shorts }: { shorts: PlayableShort[] }) {
  const [muted, setMuted] = useState(true);
  const [cat, setCat] = useState<ShortCategory | "all">("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const players = useRef<Record<string, ShortHandle | null>>({});
  const items = useRef<Record<string, HTMLElement | null>>({});

  const cats = useMemo(() => SHORT_CATEGORIES.filter((c) => shorts.some((s) => s.category === c.id)), [shorts]);
  const topics = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of shorts) if (cat === "all" || s.category === cat) for (const t of s.topics) n.set(t, (n.get(t) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [shorts, cat]);
  const list = useMemo(() => shorts.filter((s) => (cat === "all" || s.category === cat) && (!topic || s.topics.includes(topic))), [shorts, cat, topic]);

  // ?cat= / ?topic= / ?v= on arrival
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("cat");
    const tp = q.get("topic");
    const v = q.get("v");
    const id = window.setTimeout(() => {
      if (c && SHORT_CATEGORIES.some((x) => x.id === c)) setCat(c as ShortCategory);
      if (tp) setTopic(tp);
      if (v) window.setTimeout(() => items.current[v]?.scrollIntoView({ block: "start" }), 50);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  // keep the filters in the address, so a filtered feed can be shared
  const setFilter = (c: ShortCategory | "all", tp: string | null) => {
    setCat(c);
    setTopic(tp);
    const q = new URLSearchParams();
    if (c !== "all") q.set("cat", c);
    if (tp) q.set("topic", tp);
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    document.getElementById("shorts-list")?.scrollTo({ top: 0 });
  };

  // the short that is mostly on screen plays; the rest pause
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.id!;
          if (e.intersectionRatio >= 0.6) players.current[id]?.play();
          else players.current[id]?.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    for (const s of list) {
      const el = items.current[s.id];
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [list]);

  const share = async (s: PlayableShort) => {
    const url = `${window.location.origin}/learn/shorts?v=${encodeURIComponent(s.id)}`;
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) await navigator.share({ title: s.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(s.id);
        window.setTimeout(() => setCopied(null), 1800);
      }
      track("lecture_share", { quest: s.lecture, at: 0, channel: "short", short: s.id });
    } catch {
      // dismissed
    }
  };

  const chip = (on: boolean) => `min-h-8 shrink-0 whitespace-nowrap border px-2.5 font-mono text-[11px] ${on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`;

  return (
    <main className="relative mx-auto flex w-full max-w-[1100px] flex-col">
      {/* filters: category, then topic */}
      <div className="flex flex-col gap-1.5 border-b border-line px-3 py-2 lg:px-6">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Category">
          <button type="button" onClick={() => setFilter("all", null)} aria-pressed={cat === "all"} className={chip(cat === "all")}>
            all · {shorts.length}
          </button>
          {cats.map((c) => (
            <button key={c.id} type="button" onClick={() => setFilter(c.id, null)} aria-pressed={cat === c.id} className={chip(cat === c.id)}>
              {c.label.toLowerCase()}
            </button>
          ))}
        </div>
        {topics.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Topic">
            {topics.map((tp) => (
              <button key={tp} type="button" onClick={() => setFilter(cat, topic === tp ? null : tp)} aria-pressed={topic === tp} className={chip(topic === tp)}>
                #{tp}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className="fixed right-3 top-[calc(var(--hk-header-h,61px)+96px)] z-40 inline-flex h-10 items-center gap-2 bg-signal px-3 font-mono text-xs font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] lg:bottom-6 lg:right-6 lg:top-auto lg:h-11 lg:px-3.5"
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {muted ? "tap for sound" : "sound on"}
      </button>

      {list.length === 0 ? (
        <p className="m-6 border border-dashed border-line p-6 text-[15px] text-fg-3">No shorts here yet.</p>
      ) : (
        <ol
          id="shorts-list"
          className="m-0 h-[calc(100dvh-var(--hk-header-h,61px)-67px-env(safe-area-inset-bottom,0px)-84px)] list-none snap-y snap-mandatory overflow-y-auto overscroll-contain p-0 [scrollbar-width:none] lg:h-[calc(100dvh-var(--hk-header-h,61px)-84px)]"
        >
          {list.map((s, k) => (
            <li
              key={s.id}
              data-id={s.id}
              ref={(el) => {
                items.current[s.id] = el;
              }}
              className="flex h-full snap-start snap-always flex-col items-center justify-center gap-2 px-3 py-3 lg:flex-row lg:gap-8 lg:px-6"
            >
              <div className="flex min-h-0 flex-1 justify-center lg:h-full lg:flex-none">
                <ShortPlayer
                  ref={(h) => {
                    players.current[s.id] = h;
                  }}
                  short={s}
                  muted={muted}
                  onMutedChange={setMuted}
                  className="h-full max-h-full w-auto max-w-full"
                />
              </div>
              {/* phones: links under the frame */}
              <div className="flex w-full max-w-[420px] items-center justify-between gap-2 font-mono text-[11px] lg:hidden">
                <span className="truncate text-fg-3">
                  {k + 1}/{list.length} · {s.label}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {s.full && (
                    <Link href={s.full} className="inline-flex min-h-9 items-center bg-signal px-2.5 font-semibold text-on-signal">
                      full lecture
                    </Link>
                  )}
                  <Link href={s.article} className="inline-flex min-h-9 items-center border border-line-strong px-2.5 text-fg">
                    read
                  </Link>
                  <button type="button" onClick={() => void share(s)} className="min-h-9 border border-line-strong px-2.5 text-fg-2">
                    {copied === s.id ? "copied ✓" : "share"}
                  </button>
                </span>
              </div>
              {/* laptops: the details beside it */}
              <div className="hidden w-[320px] shrink-0 flex-col gap-3 lg:flex">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                  short {k + 1} of {list.length} · {s.label} · {fmt(s.seconds)}
                </span>
                <span className="font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{s.title}</span>
                {s.topics.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {s.topics.map((tp) => (
                      <button key={tp} type="button" onClick={() => setFilter(cat, tp)} className="font-mono text-[11px] text-fg-3 hover:text-fg">
                        #{tp}
                      </button>
                    ))}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {s.full && (
                    <Link href={s.full} className="inline-flex min-h-10 items-center bg-signal px-3 font-mono text-xs font-semibold text-on-signal">
                      ▶ full lecture
                    </Link>
                  )}
                  <Link href={s.article} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg hover:border-signal">
                    read it →
                  </Link>
                  <button type="button" onClick={() => void share(s)} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:text-fg">
                    {copied === s.id ? "link copied ✓" : "share"}
                  </button>
                </div>
                <span className="font-mono text-[11px] text-fg-4">scroll for the next one ↓</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
