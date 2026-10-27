"use client";

/**
 * /learn/shorts: every vertical short in a swipe-through feed, filtered by category (course, side quests,
 * real incidents, …) and topic (caching, databases, …). The short in view plays, muted until the viewer
 * turns the sound on. Every short links to its full lecture at that moment and to its written article, and
 * takes upvotes and a discussion.
 * - Phones and tablets: full screen, like Reels. The site header and dock are covered; the filters float
 *   at the top, the actions (upvote, discussion, share, sound) sit in a rail on the right, the label, title
 *   and links at the bottom left. Swipe up for the next one.
 * - Laptops: a centred 9:16 column with the details and actions beside it.
 * ?v=<id> opens at a short; ?cat= and ?topic= set the filters (shareable).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Share2, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { track } from "@/lib/track";
import { compact } from "@/components/learn/lecture/LectureVote";
import { SHORT_CATEGORIES, type PlayableShort, type ShortCategory } from "@/lib/learn/shorts/types";
import ShortPlayer, { type ShortHandle } from "./ShortPlayer";
import { CommentsSheet, useCommentCounts, useShortVote } from "./ShortSocial";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function ShortsFeed({ shorts }: { shorts: PlayableShort[] }) {
  const router = useRouter();
  const [muted, setMuted] = useState(true);
  const [cat, setCat] = useState<ShortCategory | "all">("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [talk, setTalk] = useState<PlayableShort | null>(null);
  const { counts, refresh } = useCommentCounts();
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
  const back = () => (window.history.length > 1 ? router.back() : router.push("/learn"));

  const chip = (on: boolean) => `min-h-8 shrink-0 whitespace-nowrap border px-2.5 font-mono text-[11px] ${on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`;
  // over the video on phones: translucent, readable on any frame
  const pill = (on: boolean) => `h-8 shrink-0 whitespace-nowrap border px-2.5 font-mono text-[11px] backdrop-blur-sm ${on ? "border-signal bg-signal text-on-signal" : "border-white/25 bg-black/40 text-[#f3f2ee]"}`;

  return (
    <main className="fixed inset-0 z-[60] flex flex-col bg-black lg:relative lg:inset-auto lg:z-auto lg:mx-auto lg:w-full lg:max-w-[1100px] lg:bg-transparent">
      {/* laptops: filters above the feed */}
      <div className="hidden flex-col gap-1.5 border-b border-line px-6 py-2 lg:flex">
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

      {/* phones: back + filters float over the top of the video, one swipeable row */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/75 to-transparent pb-6 pt-[calc(env(safe-area-inset-top,0px)+8px)] lg:hidden">
        <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none]" role="group" aria-label="Filters">
          <button type="button" onClick={back} aria-label="Back" className="grid h-8 w-8 shrink-0 place-items-center border border-white/25 bg-black/40 text-[#f3f2ee] backdrop-blur-sm">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setFilter("all", null)} aria-pressed={cat === "all"} className={pill(cat === "all")}>
            all · {shorts.length}
          </button>
          {cats.map((c) => (
            <button key={c.id} type="button" onClick={() => setFilter(c.id, null)} aria-pressed={cat === c.id} className={pill(cat === c.id)}>
              {c.label.toLowerCase()}
            </button>
          ))}
          {topics.length > 1 && <span className="mx-0.5 h-5 w-px shrink-0 bg-white/25" aria-hidden />}
          {topics.length > 1 &&
            topics.map((tp) => (
              <button key={tp} type="button" onClick={() => setFilter(cat, topic === tp ? null : tp)} aria-pressed={topic === tp} className={pill(topic === tp)}>
                #{tp}
              </button>
            ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className="fixed bottom-6 right-6 z-40 hidden h-11 items-center gap-2 bg-signal px-3.5 font-mono text-xs font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] lg:inline-flex"
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {muted ? "tap for sound" : "sound on"}
      </button>

      {list.length === 0 ? (
        <p className="m-6 mt-20 border border-dashed border-line p-6 text-[15px] text-fg-3 lg:mt-6">No shorts here yet.</p>
      ) : (
        <ol
          id="shorts-list"
          className="m-0 h-[100dvh] list-none snap-y snap-mandatory overflow-y-auto overscroll-contain p-0 [scrollbar-width:none] lg:h-[calc(100dvh-var(--hk-header-h,61px)-84px)]"
        >
          {list.map((s, k) => (
            <li
              key={s.id}
              data-id={s.id}
              ref={(el) => {
                items.current[s.id] = el;
              }}
              className="relative flex h-full snap-start snap-always items-center justify-center [@media(min-aspect-ratio:9/16)]:pt-12 lg:gap-8 lg:px-6 lg:py-3 lg:[@media(min-aspect-ratio:9/16)]:pt-3"
            >
              <ShortPlayer
                ref={(h) => {
                  players.current[s.id] = h;
                }}
                short={s}
                muted={muted}
                onMutedChange={setMuted}
                className="h-full w-full lg:aspect-[9/16] lg:w-auto lg:max-w-full lg:border lg:border-line-strong"
                muteClassName="hidden lg:grid"
              />
              <PhoneOverlay
                s={s}
                k={k}
                n={list.length}
                muted={muted}
                comments={counts[s.id] ?? 0}
                copied={copied === s.id}
                onMute={() => setMuted((m) => !m)}
                onTalk={() => setTalk(s)}
                onShare={() => void share(s)}
              />
              <DesktopDetails
                s={s}
                k={k}
                n={list.length}
                comments={counts[s.id] ?? 0}
                copied={copied === s.id}
                onTopic={(tp) => setFilter(cat, tp)}
                onTalk={() => setTalk(s)}
                onShare={() => void share(s)}
              />
            </li>
          ))}
        </ol>
      )}

      {talk && (
        <CommentsSheet
          short={talk}
          onClose={() => {
            setTalk(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}

type ItemProps = { s: PlayableShort; k: number; n: number; comments: number; copied: boolean; onTalk: () => void; onShare: () => void };

/** phones: the action rail on the right and the label, title and links at the bottom left, over the video */
function PhoneOverlay({ s, muted, onMute, comments, copied, onTalk, onShare }: ItemProps & { muted: boolean; onMute: () => void }) {
  const vote = useShortVote(s.id);
  const rail = "pointer-events-auto flex flex-col items-center gap-1 font-mono text-[11px] font-semibold text-[#f3f2ee] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]";
  const icon = (on = false) => `grid h-11 w-11 place-items-center backdrop-blur-sm transition-colors ${on ? "bg-signal text-on-signal" : "bg-black/45 text-[#f3f2ee]"}`;
  return (
    <div className="pointer-events-none absolute inset-0 lg:hidden">
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" aria-hidden />
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+150px)] right-2 flex flex-col items-center gap-4">
        <button type="button" onClick={() => void vote.toggle()} aria-pressed={vote.mine} aria-label={vote.mine ? "Remove upvote" : "Upvote"} className={rail}>
          <span className={icon(vote.mine)}>
            <ThumbsUp className="h-5 w-5" fill={vote.mine ? "currentColor" : "none"} aria-hidden />
          </span>
          {compact(vote.votes)}
        </button>
        <button type="button" onClick={onTalk} aria-label="Discussion" className={rail}>
          <span className={icon()}>
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          {compact(comments)}
        </button>
        <button type="button" onClick={onShare} aria-label="Share" className={rail}>
          <span className={icon()}>
            <Share2 className="h-5 w-5" aria-hidden />
          </span>
          {copied ? "copied" : "share"}
        </button>
        <button type="button" onClick={onMute} aria-label={muted ? "Turn sound on" : "Mute"} aria-pressed={!muted} className={rail}>
          <span className={icon(muted)}>{muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}</span>
          {muted ? "sound" : "on"}
        </button>
      </div>
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+26px)] left-3 right-16 flex flex-col gap-2 [text-shadow:0_1px_6px_rgba(0,0,0,0.85)]">
        <span className="truncate font-mono text-[11px] uppercase tracking-label text-signal">
          {s.label} · {fmt(s.seconds)}
        </span>
        <span className="line-clamp-2 font-display text-[18px] font-extrabold leading-[1.1] text-[#f3f2ee]">{s.title}</span>
        <span className="pointer-events-auto flex gap-2 font-mono text-[12px] [text-shadow:none]">
          {s.full && (
            <Link href={s.full} className="inline-flex min-h-9 items-center bg-signal px-3 font-semibold text-on-signal">
              ▶ full lecture
            </Link>
          )}
          <Link href={s.article} className="inline-flex min-h-9 items-center border border-white/40 bg-black/40 px-3 text-[#f3f2ee] backdrop-blur-sm">
            read it
          </Link>
        </span>
      </div>
    </div>
  );
}

/** laptops: the details and actions beside the video */
function DesktopDetails({ s, k, n, comments, copied, onTopic, onTalk, onShare }: ItemProps & { onTopic: (tp: string) => void }) {
  const vote = useShortVote(s.id);
  return (
    <div className="hidden w-[320px] shrink-0 flex-col gap-3 lg:flex">
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
        short {k + 1} of {n} · {s.label} · {fmt(s.seconds)}
      </span>
      <span className="font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{s.title}</span>
      {s.topics.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {s.topics.map((tp) => (
            <button key={tp} type="button" onClick={() => onTopic(tp)} className="font-mono text-[11px] text-fg-3 hover:text-fg">
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
      </div>
      <div className="flex flex-wrap gap-2 font-mono text-xs">
        <button
          type="button"
          onClick={() => void vote.toggle()}
          aria-pressed={vote.mine}
          className={`inline-flex min-h-10 items-center gap-2 border px-3 ${vote.mine ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
        >
          <ThumbsUp className="h-4 w-4" fill={vote.mine ? "currentColor" : "none"} aria-hidden />
          {compact(vote.votes)}
        </button>
        <button type="button" onClick={onTalk} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-fg-2 hover:border-signal hover:text-fg">
          <MessageCircle className="h-4 w-4" aria-hidden />
          {comments > 0 ? `${compact(comments)} comment${comments === 1 ? "" : "s"}` : "discuss"}
        </button>
        <button type="button" onClick={onShare} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-fg-2 hover:text-fg">
          <Share2 className="h-4 w-4" aria-hidden />
          {copied ? "link copied ✓" : "share"}
        </button>
      </div>
      <span className="font-mono text-[11px] text-fg-4">scroll for the next one ↓</span>
    </div>
  );
}
