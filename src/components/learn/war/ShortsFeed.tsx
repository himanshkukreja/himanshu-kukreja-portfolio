"use client";

/**
 * /learn/shorts: every vertical short in a swipe-through feed, filtered by category (course, side quests,
 * real incidents, …) and topic (caching, databases, …). The short in view plays, muted until the viewer
 * turns the sound on. Every short links to its full lecture at that moment and to its written article, and
 * takes upvotes and a discussion.
 * - Phones and tablets: full screen, like Reels. The site header and dock are covered; the filters float
 *   at the top, the actions (upvote, discussion, share, sound, full screen) sit in a rail on the right, the
 *   label, title and links at the bottom left. Swipe up for the next one. A few seconds into playback all of
 *   that fades away and only the video is left; a tap (or a pause, or the next short) brings it back. The
 *   full-screen button asks the browser for real full screen; where a page can't have it (iPhone Safari),
 *   it keeps the controls hidden until a tap.
 * - Laptops: a centred 9:16 column with the details and actions beside it.
 * Discussion opens beside the short, never over it, and nothing dims, so the short keeps playing: on laptops
 * the feed slides left and the panel takes the right; on phones and tablets the short shrinks to the top and
 * the panel takes the bottom (as Instagram does). It follows the short on screen.
 * Every visit deals a fresh order: shorts this browser hasn't seen yet come first, shuffled, then the rest
 * (?v= keeps the given short first). Any short can be saved to the learner's library (the notebook).
 * ?v=<id> opens at a short; ?cat= and ?topic= set the filters (shareable).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { preconnect, preload } from "react-dom";
import { ArrowLeft, BookOpen, Bookmark, Maximize, MessageCircle, Minimize, Share2, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { track } from "@/lib/track";
import { compact } from "@/components/learn/lecture/LectureVote";
import { SHORT_CATEGORIES, type PlayableShort, type ShortCategory } from "@/lib/learn/shorts/types";
import ShortPlayer, { type ShortHandle } from "./ShortPlayer";
import { CommentsSheet, useCommentCounts, useShortSave, useShortVote } from "./ShortSocial";

const SEEN_KEY = "hk.shorts.seen";
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as string[];
  } catch {
    return [];
  }
};
const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let k = b.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [b[k], b[j]] = [b[j], b[k]];
  }
  return b;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** how long the controls stay up once a short is playing, on phones and tablets */
const CHROME_S = 3;
const phoneLayout = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

export default function ShortsFeed({ shorts }: { shorts: PlayableShort[] }) {
  const router = useRouter();
  // sound: off by default on phones and tablets, on for laptops (the player falls back to muted when the
  // browser blocks sound before a click); the viewer's own choice is remembered for the session
  const [muted, setMutedState] = useState(true);
  const setMuted = (m: boolean | ((x: boolean) => boolean)) =>
    setMutedState((prev) => {
      const next = typeof m === "function" ? m(prev) : m;
      try {
        sessionStorage.setItem("hk.shorts.muted", next ? "1" : "0");
      } catch {
        // no storage: the choice lasts for this page only
      }
      return next;
    });
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem("hk.shorts.muted");
    } catch {
      // no storage
    }
    const id = window.setTimeout(() => setMutedState(saved !== null ? saved === "1" : phoneLayout()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const [cat, setCat] = useState<ShortCategory | "all">("all");
  const [topic, setTopic] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [talk, setTalk] = useState(false);
  const { counts, refresh } = useCommentCounts();
  const players = useRef<Record<string, ShortHandle | null>>({});
  const items = useRef<Record<string, HTMLElement | null>>({});
  const root = useRef<HTMLElement>(null);
  // phones/tablets: the overlays (filters, rail, title and links) fade out while a short plays untouched
  const [chrome, setChrome] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [poke, setPoke] = useState(0);
  const [fs, setFs] = useState(false);
  const show = () => {
    setChrome(true);
    setPoke((n) => n + 1);
  };
  useEffect(() => {
    if (!chrome || !playing || talk) return;
    const id = window.setTimeout(() => phoneLayout() && setChrome(false), CHROME_S * 1000);
    return () => window.clearTimeout(id);
  }, [chrome, playing, talk, poke]);
  useEffect(() => {
    const on = () => setFs(!!fsElement());
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, []);
  const toggleFs = async () => {
    try {
      if (fsElement()) {
        await (document.exitFullscreen?.() ?? (document as FsDoc).webkitExitFullscreen?.());
        return;
      }
      const el = root.current as FsEl | null;
      const req = el?.requestFullscreen ? () => el.requestFullscreen() : el?.webkitRequestFullscreen ? () => el.webkitRequestFullscreen!() : null;
      if (req) await req();
      // no page full screen here (iPhone Safari): hide the controls now; a tap brings them back
      setChrome(false);
      track("short_fullscreen", { native: !!req });
    } catch {
      setChrome(false);
    }
  };

  const cats = useMemo(() => SHORT_CATEGORIES.filter((c) => shorts.some((s) => s.category === c.id)), [shorts]);
  const topics = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of shorts) if (cat === "all" || s.category === cat) for (const t of s.topics) n.set(t, (n.get(t) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [shorts, cat]);
  // the short that is mostly on screen is the active one: it plays, the rest pause (see ShortPlayer `active`)
  const [activeId, setActiveId] = useState<string | null>(null);
  // this visit's order. It starts as the server's (its first short plays straight from the HTML); on arrival the
  // rest is re-dealt, unseen first, keeping that first short unless this browser has already watched it
  const [order, setOrder] = useState<PlayableShort[]>(shorts);
  const [dealt, setDealt] = useState(false);
  const list = useMemo(() => order.filter((s) => (cat === "all" || s.category === cat) && (!topic || s.topics.includes(topic))), [order, cat, topic]);

  // ?cat= / ?topic= / ?v= on arrival
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("cat");
    const tp = q.get("topic");
    const v = q.get("v");
    const id = window.setTimeout(() => {
      // a fresh deal: unseen shorts first (shuffled), then the seen ones (shuffled); ?v= leads
      const seen = new Set(readSeen());
      const first = shorts[0];
      const keep = !v && first && !seen.has(first.id) ? first : undefined;
      const rest = shorts.filter((s) => s !== keep);
      const deal = [...shuffle(rest.filter((s) => !seen.has(s.id))), ...shuffle(rest.filter((s) => seen.has(s.id)))];
      const lead = keep ?? (v ? deal.find((s) => s.id === v) : undefined);
      const next = lead ? [lead, ...deal.filter((s) => s !== lead)] : deal;
      setOrder(next);
      setDealt(true);
      setActiveId(next[0]?.id ?? null);
      if (c && SHORT_CATEGORIES.some((x) => x.id === c)) setCat(c as ShortCategory);
      if (tp) setTopic(tp);
    }, 0);
    return () => window.clearTimeout(id);
  }, [shorts]);
  // remember what was watched, so the next visit opens on something new
  useEffect(() => {
    if (!activeId) return;
    try {
      const seen = readSeen().filter((x) => x !== activeId);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, activeId].slice(-500)));
    } catch {
      // private mode: every visit is just a fresh shuffle
    }
  }, [activeId]);
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

  const activeIdx = Math.max(0, list.findIndex((s) => s.id === activeId));
  // the media host: connect before the first <video> asks for it
  if (shorts[0]) {
    preconnect(new URL(shorts[0].src).origin);
    preload(shorts[0].poster, { as: "image", fetchPriority: "high" });
  }
  useEffect(() => {
    // not before this visit's order is dealt: an observer on the server's order would report its first short
    if (!dealt) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.intersectionRatio >= 0.6) {
            setActiveId((e.target as HTMLElement).dataset.id!);
            show();
          }
      },
      { threshold: [0, 0.6, 1] },
    );
    for (const s of list) {
      const el = items.current[s.id];
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [list, dealt]);

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
  const pill = (on: boolean) => `h-8 shrink-0 whitespace-nowrap border px-2.5 font-mono text-[11px] ${on ? "border-signal bg-signal text-on-signal" : "border-white/25 bg-black/55 text-[#f3f2ee]"}`;

  return (
    <main
      ref={root}
      className={`fixed inset-0 z-[60] flex flex-col bg-black lg:relative lg:inset-auto lg:z-auto lg:bg-transparent lg:transition-[margin] lg:duration-300 ${talk ? "lg:ml-0 lg:mr-[420px]" : "lg:mx-auto lg:w-full lg:max-w-[1100px]"}`}
    >
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
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/75 to-transparent pb-6 pt-[calc(env(safe-area-inset-top,0px)+8px)] transition-opacity duration-300 lg:hidden ${chrome && !talk ? "opacity-100" : "opacity-0"}`}
        onPointerDown={show}
      >
        <div className={`${chrome && !talk ? "pointer-events-auto" : "pointer-events-none"} flex items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none]`} role="group" aria-label="Filters">
          <button type="button" onClick={back} aria-label="Back" className="grid h-8 w-8 shrink-0 place-items-center border border-white/25 bg-black/55 text-[#f3f2ee]">
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
        className={`fixed bottom-6 z-40 hidden h-11 items-center ${talk ? "right-[444px]" : "right-6"} gap-2 bg-signal px-3.5 font-mono text-xs font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] lg:inline-flex`}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {muted ? "tap for sound" : "sound on"}
      </button>

      {list.length === 0 ? (
        <p className="m-6 mt-20 border border-dashed border-line p-6 text-[15px] text-fg-3 lg:mt-6">No shorts here yet.</p>
      ) : (
        <ol
          // a fresh list only if the deal changed the first short (scroll-snap would hold on to the old one);
          // when the server's first one is kept, its video keeps playing
          key={list[0]?.id ?? "none"}
          id="shorts-list"
          className={`m-0 h-[100dvh] list-none snap-y snap-mandatory overflow-y-auto overscroll-contain p-0 [overflow-anchor:none] [scrollbar-width:none] lg:h-[calc(100dvh-var(--hk-header-h,61px)-84px)] ${talk ? "max-lg:overflow-hidden" : ""}`}
        >
          {list.map((s, k) =>
            // far from the one on screen: an empty slot of the same height keeps the scroll positions and snap
            // points (and the visibility observer), without building its player, overlays or vote/save hooks
            Math.abs(k - activeIdx) > 2 ? (
              <li
                key={s.id}
                data-id={s.id}
                ref={(el) => {
                  items.current[s.id] = el;
                }}
                className="h-full snap-start snap-always"
                aria-hidden
              />
            ) : (
            <li
              key={s.id}
              data-id={s.id}
              ref={(el) => {
                items.current[s.id] = el;
              }}
              className={`relative flex h-full snap-start snap-always justify-center lg:items-center lg:gap-8 lg:px-6 lg:py-3 lg:[@media(min-aspect-ratio:9/16)]:pt-3 ${talk && k === activeIdx ? "max-lg:items-start max-lg:pt-[calc(env(safe-area-inset-top,0px)+8px)]" : "items-center [@media(min-aspect-ratio:9/16)]:pt-12"}`}
            >
              <ShortPlayer
                ref={(h) => {
                  players.current[s.id] = h;
                }}
                short={s}
                muted={muted}
                onMutedChange={setMuted}
                // Reels-style loading: a <video> only near the one on screen; it and the next buffer ahead
                mounted={k >= activeIdx - 1 && k <= activeIdx + 2}
                preload={k === activeIdx || k === activeIdx + 1 ? "auto" : k === activeIdx + 2 ? "metadata" : "none"}
                active={k === activeIdx}
                // once the one on screen is playing, buffer the next two (iPhone Safari won't otherwise)
                warm={playing && (k === activeIdx + 1 || k === activeIdx + 2)}
                priority={k === 0}
                // the first one starts muted from the HTML, before the page's JavaScript has loaded
                autoPlay={k === 0}
                // phones, discussing: the short shrinks into the top third, still playing, above the panel
                className={`lg:aspect-[9/16] lg:h-full lg:w-auto lg:max-w-full lg:border lg:border-line-strong ${talk && k === activeIdx ? "aspect-[9/16] h-[32dvh] w-auto max-lg:border max-lg:border-line-strong" : "h-full w-full"}`}
                muteClassName="hidden lg:grid"
                // controls hidden: the first tap only brings them back
                onTap={() => {
                  if (chrome || talk || !phoneLayout()) {
                    setPoke((n) => n + 1);
                    return false;
                  }
                  show();
                  return true;
                }}
                onPlayingChange={(p) => {
                  setPlaying(p);
                  if (!p) setChrome(true);
                }}
              />
              <PhoneOverlay
                s={s}
                k={k}
                n={list.length}
                muted={muted}
                chrome={chrome && !talk}
                fs={fs}
                onFs={() => void toggleFs()}
                onPoke={show}
                comments={counts[s.id] ?? 0}
                copied={copied === s.id}
                onMute={() => setMuted((m) => !m)}
                onTalk={() => setTalk(true)}
                onShare={() => void share(s)}
              />
              <DesktopDetails
                s={s}
                k={k}
                n={list.length}
                comments={counts[s.id] ?? 0}
                copied={copied === s.id}
                onTopic={(tp) => setFilter(cat, tp)}
                onTalk={() => setTalk(true)}
                onShare={() => void share(s)}
              />
            </li>
            ),
          )}
        </ol>
      )}

      {talk && list[activeIdx] && (
        <CommentsSheet
          short={list[activeIdx]}
          onClose={() => {
            setTalk(false);
            refresh();
          }}
        />
      )}
    </main>
  );
}

type ItemProps = { s: PlayableShort; k: number; n: number; comments: number; copied: boolean; onTalk: () => void; onShare: () => void };

/** phones: the action rail on the right and the label, title and links at the bottom left, over the video */
function PhoneOverlay({
  s,
  muted,
  onMute,
  chrome,
  fs,
  onFs,
  onPoke,
  comments,
  copied,
  onTalk,
  onShare,
}: ItemProps & { muted: boolean; onMute: () => void; chrome: boolean; fs: boolean; onFs: () => void; onPoke: () => void }) {
  const vote = useShortVote(s.id);
  const save = useShortSave(s);
  const rail = `${chrome ? "pointer-events-auto" : "pointer-events-none"} flex flex-col items-center gap-1 font-mono text-[11px] font-semibold text-[#f3f2ee] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]`;
  const icon = (on = false) => `grid h-11 w-11 place-items-center transition-colors ${on ? "bg-signal text-on-signal" : "bg-black/55 text-[#f3f2ee]"}`;
  return (
    <div className={`pointer-events-none absolute inset-0 transition-opacity duration-300 lg:hidden ${chrome ? "opacity-100" : "opacity-0"}`} onPointerDown={onPoke}>
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" aria-hidden />
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+140px)] right-2 flex flex-col items-center gap-3">
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
        <button type="button" onClick={() => void save.toggle()} aria-pressed={save.saved} aria-label={save.saved ? "Remove from your library" : "Save to your library"} className={rail}>
          <span className={icon(save.saved)}>
            <Bookmark className="h-5 w-5" fill={save.saved ? "currentColor" : "none"} aria-hidden />
          </span>
          {save.saved ? "saved" : "save"}
        </button>
        <button type="button" onClick={onShare} aria-label="Share" className={rail}>
          <span className={icon()}>
            <Share2 className="h-5 w-5" aria-hidden />
          </span>
          {copied ? "copied" : "share"}
        </button>
        <button type="button" onClick={onMute} aria-label={muted ? "Turn sound on" : "Mute"} aria-pressed={!muted} className={rail}>
          <span className={icon(muted)}>{muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}</span>
          {muted ? "muted" : "sound on"}
        </button>
        <button type="button" onClick={onFs} aria-label={fs ? "Exit full screen" : "Full screen"} aria-pressed={fs} className={rail}>
          <span className={icon(fs)}>{fs ? <Minimize className="h-5 w-5" aria-hidden /> : <Maximize className="h-5 w-5" aria-hidden />}</span>
          {fs ? "exit" : "full"}
        </button>
      </div>
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+26px)] left-3 right-16 flex flex-col gap-2 [text-shadow:0_1px_6px_rgba(0,0,0,0.85)]">
        <span className="truncate font-mono text-[11px] uppercase tracking-label text-signal">
          {s.label} · {fmt(s.seconds)}
        </span>
        <span className="line-clamp-2 font-display text-[18px] font-extrabold leading-[1.1] text-[#f3f2ee]">{s.title}</span>
        <span className={`${chrome ? "pointer-events-auto" : "pointer-events-none"} flex gap-2 font-mono text-[12px] [text-shadow:none]`}>
          {s.full && (
            <Link href={s.full} className="inline-flex min-h-9 items-center bg-signal px-3 font-semibold text-on-signal">
              ▶ full lecture
            </Link>
          )}
          <Link href={s.article} className="inline-flex min-h-9 items-center border border-white/40 bg-black/40 px-3 text-[#f3f2ee]">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
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
  const save = useShortSave(s);
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
          <BookOpen className="mr-2 h-3.5 w-3.5 text-signal-text" aria-hidden />
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
        <button
          type="button"
          onClick={() => void save.toggle()}
          aria-pressed={save.saved}
          className={`inline-flex min-h-10 items-center gap-2 border px-3 ${save.saved ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
        >
          <Bookmark className="h-4 w-4" fill={save.saved ? "currentColor" : "none"} aria-hidden />
          {save.saved ? "saved to notebook" : "save"}
        </button>
      </div>
      <span className="font-mono text-[11px] text-fg-4">scroll for the next one ↓</span>
    </div>
  );
}
