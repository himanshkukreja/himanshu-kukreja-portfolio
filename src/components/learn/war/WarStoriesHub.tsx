"use client";

/**
 * /war-stories: story of the day, the real stories (filter by theme, read ones ticked) and the
 * war rooms (cleared ones ticked, best run). Read / cleared state is this browser's plus the game state.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};
import { useGame } from "@/game/GameProvider";
import { istToday, storyOfTheDay } from "@/lib/learn/war/day";
import { ROOM_LEVEL_LABEL, ROOM_LEVELS, STORY_THEMES, THEME_LABEL, WAR_ROOM_XP, warRoomKey, type RoomLevel, type StorySummary, type StoryTheme, type WarRoomSummary } from "@/lib/learn/war/types";
import { readRuns, readStoriesRead, WAR_EVENT } from "./store";
import WatchHowItWorks from "@/components/learn/guide/videos/WatchHowItWorks";

const LABEL = "font-mono text-[11px] uppercase tracking-label";
/** stories shown before "Show all": four rows of three on a laptop, six of two on a tablet */
const STORY_LIMIT = 12;
/** war rooms shown on the hub before "Show all" (the war-room page shows every one) */
const ROOM_LIMIT = 6;
/** anchor targets clear the sticky site header */
const ANCHOR = "scroll-mt-[calc(var(--hk-header-h,61px)+24px)]";
const CHIP = "min-h-9 border px-3 font-mono text-xs";
const chip = (on: boolean) => `${CHIP} shrink-0 whitespace-nowrap ${on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`;
/** a row of filter chips: one swipeable line on phones, wrapping from tablets up */
const CHIPS = "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0";

function useLocal() {
  const [s, setS] = useState<{ read: string[]; runs: Record<string, { wrong: number }> } | null>(null);
  useEffect(() => {
    const load = () => setS({ read: readStoriesRead(), runs: readRuns() });
    load();
    window.addEventListener(WAR_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(WAR_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return s;
}

export default function WarStoriesHub({ stories, rooms, videos = {}, shorts = 0 }: { stories: StorySummary[]; rooms: WarRoomSummary[]; videos?: Record<string, number>; shorts?: number }) {
  const local = useLocal();
  const [theme, setTheme] = useState<StoryTheme | "all">("all");
  // "Show all N stories": client state only, so the cached page stays the same for everyone
  const [allStories, setAllStories] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const storiesRef = useRef<HTMLElement>(null);
  // today's IST date on the client (the page itself is cached for a day)
  const day = useSyncExternalStore(
    noop,
    () => istToday(),
    () => null,
  );

  const today = day ? storyOfTheDay(stories, day) : null;
  const themes = useMemo(() => STORY_THEMES.filter((t) => stories.some((s) => s.theme === t)), [stories]);
  const list = theme === "all" ? stories : stories.filter((s) => s.theme === theme);
  const readCount = local ? stories.filter((s) => local.read.includes(s.slug)).length : 0;
  const more = list.length > STORY_LIMIT + 2; // never hide just one or two
  const visible = more && !allStories ? list.slice(0, STORY_LIMIT) : list;
  const toggleStories = () => {
    if (allStories) {
      setAllStories(false);
      // folding the list back: keep the reader at the stories, not wherever the page now ends
      storiesRef.current?.scrollIntoView({ block: "start" });
      return;
    }
    setAllStories(true);
    // keyboard and screen-reader users land on the first story that just appeared
    window.requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLAnchorElement>("li > a")[STORY_LIMIT]?.focus({ preventScroll: true }));
  };

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-4">
        <span className={`${LABEL} text-signal-text`}>❯ war stories · true stories and on-call nights</span>
        <h1 className="m-0 font-display text-[clamp(48px,9vw,104px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
          War stories<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          What really happened when real systems hit real limits, in two minutes each, with the sources. Then take the page yourself: incidents played out in the channel, modelled on real
          postmortems, where you make the calls.
        </p>
        <WatchHowItWorks id="side-quests" chapter="Case files" />
        <p className="m-0 font-mono text-xs text-fg-3">
          {stories.length} real stories{Object.keys(videos).length ? ` · ${Object.keys(videos).length} with a short video` : ""}{local ? ` · ${readCount} read` : ""} · {rooms.length} war room{rooms.length === 1 ? "" : "s"}
        </p>
        {shorts > 0 && (
          <Link href="/shorts?cat=stories" className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 font-mono text-sm font-semibold text-on-signal">
            ▶ swipe through {shorts} shorts
          </Link>
        )}
        <nav aria-label="On this page" className="flex flex-wrap gap-2 pt-1">
          <a href="#stories" className="inline-flex min-h-11 items-center gap-2 border border-line-strong bg-surface px-4 text-[14px] font-medium text-fg hover:border-fg-3">
            Real stories <span className="font-mono text-xs text-fg-3">{stories.length}</span>
            <span aria-hidden className="text-fg-3">
              ↓
            </span>
          </a>
          <a href="#war-rooms" className="inline-flex min-h-11 items-center gap-2 border border-signal bg-surface px-4 text-[14px] font-semibold text-fg hover:bg-surface-2">
            War rooms: take the page <span className="font-mono text-xs font-normal text-fg-3">{rooms.length}</span>
            <span aria-hidden className="text-signal-text">
              ↓
            </span>
          </a>
        </nav>
      </header>

      {today && (
        <Link href={today.href} className="group flex flex-col gap-3 border border-signal bg-surface p-5 sm:p-8">
          <span className={`${LABEL} text-signal-text`}>
            story of the day · {THEME_LABEL[today.theme]} · {today.company}
            {today.when ? ` · ${today.when}` : ""}
          </span>
          <span className="max-w-[900px] font-display text-[clamp(28px,4.4vw,48px)] font-extrabold leading-[1] tracking-[-0.03em] text-fg group-hover:text-signal-text">{today.title}</span>
          <span className="max-w-[720px] text-[16px] leading-relaxed text-fg-2">{today.hook}</span>
          <span className="font-mono text-xs text-fg-3">
            {today.minutes} min read · with sources{videos[today.slug] ? <span className="text-signal-text"> · ▶ {videos[today.slug]}-min video</span> : null} →
          </span>
        </Link>
      )}

      {/* real stories */}
      <section ref={storiesRef} id="stories" aria-labelledby="stories-h" className={`flex flex-col gap-4 ${ANCHOR}`}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line pb-3">
          <h2 id="stories-h" className="m-0 flex flex-col gap-1">
            <span className={`${LABEL} text-signal-text`}>real stories · two minutes each</span>
            <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">It really happened</span>
          </h2>
          {themes.length > 1 && (
            <div role="group" aria-label="Filter by theme" className="flex flex-wrap gap-1.5">
              {(["all", ...themes] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={theme === t}
                  onClick={() => setTheme(t)}
                  className={chip(theme === t)}
                >
                  {t === "all" ? "all" : THEME_LABEL[t].toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        {stories.length === 0 ? (
          <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">The first stories are being checked against their sources.</p>
        ) : (
          <>
          <ul ref={listRef} id="stories-list" className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => {
              const read = !!local?.read.includes(s.slug);
              return (
                <li key={s.slug}>
                  <Link href={s.href} className={`flex h-full flex-col gap-2 border p-4 hover:border-fg-3 sm:p-5 ${read ? "border-line-strong bg-surface-2" : "border-line bg-surface"}`}>
                    <span className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
                      <span>
                        {THEME_LABEL[s.theme]} · {s.company}
                      </span>
                      <span className={read ? "text-fg" : ""}>{read ? "read ✓" : `${s.minutes} min`}</span>
                    </span>
                    <span className="font-display text-[20px] font-bold leading-[1.15] tracking-[-0.02em] text-fg">{s.title}</span>
                    <span className="text-[14px] leading-snug text-fg-2">{s.hook}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-1 font-mono text-xs text-fg-4">
                      <span>{s.when}</span>
                      {videos[s.slug] ? <span className="text-signal-text">▶ {videos[s.slug]}-min video</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {more && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={toggleStories}
                aria-expanded={allStories}
                aria-controls="stories-list"
                className="min-h-11 border border-line-strong px-5 text-[15px] font-medium text-fg hover:border-fg-3"
              >
                {allStories ? "Show fewer stories" : `Show all ${list.length} stories`}
              </button>
              {!allStories && (
                <span className="font-mono text-xs text-fg-3">
                  showing {STORY_LIMIT} of {list.length}
                </span>
              )}
            </div>
          )}
          </>
        )}
      </section>

      {/* war rooms: after the stories, with their own page (also linked from Prep) */}
      <section id="war-rooms" aria-labelledby="rooms-h" className={`flex flex-col gap-4 ${ANCHOR}`}>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
          <h2 id="rooms-h" className="m-0 flex flex-col gap-1">
            <span className={`${LABEL} text-signal-text`}>war room · you&apos;re on call</span>
            <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">Take the page</span>
          </h2>
          <span className="flex max-w-[520px] flex-col gap-1 text-[14px] text-fg-3 sm:items-end sm:text-right">
            Fictional company and people; each night is modelled on a real public postmortem, named at the end.
            <Link href="/war-stories/war-room" className="font-mono text-xs text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              all {rooms.length} war rooms →
            </Link>
          </span>
        </div>
        <WarRoomGrid rooms={rooms} limit={ROOM_LIMIT} />
      </section>
    </main>
  );
}

/** How hard a room plays, as three small bars (the label says it in words). */
function Level({ level }: { level: RoomLevel }) {
  const n = ROOM_LEVELS.indexOf(level) + 1;
  return (
    <span className="inline-flex items-center gap-1.5 border border-line px-1.5 py-0.5">
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3].map((k) => (
          <span key={k} className={`w-[3px] ${k <= n ? (level === "hard" ? "bg-bad" : "bg-signal") : "bg-line-strong"}`} style={{ height: 4 + k * 2 }} />
        ))}
      </span>
      {ROOM_LEVEL_LABEL[level]}
    </span>
  );
}

/**
 * The war-room cards (the hub and /war-stories/war-room): topic and difficulty tags, cleared and best-run
 * markers from this browser and the game state. With more than a handful of rooms: filters by topic, difficulty and
 * "not played yet"; `limit` shows the first few with a "Show all" that opens the rest in place.
 */
export function WarRoomGrid({ rooms, limit }: { rooms: WarRoomSummary[]; limit?: number }) {
  const { done, hydrated } = useGame();
  const local = useLocal();
  const cleared = (slug: string) => (hydrated && !!done[warRoomKey(slug)]) || !!local?.runs[slug];
  const [topic, setTopic] = useState<string>("all");
  const [level, setLevel] = useState<RoomLevel | "all">("all");
  const [fresh, setFresh] = useState(false);
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const topics = useMemo(() => [...new Set(rooms.map((r) => r.topic).filter(Boolean))].sort(), [rooms]);
  const levels = useMemo(() => ROOM_LEVELS.filter((l) => rooms.some((r) => r.difficulty === l)), [rooms]);
  const filters = rooms.length > ROOM_LIMIT;
  const list = rooms.filter((r) => (topic === "all" || r.topic === topic) && (level === "all" || r.difficulty === level) && (!fresh || !cleared(r.slug)));
  const clearedCount = rooms.filter((r) => cleared(r.slug)).length;
  const cut = limit && !all && list.length > limit + 1 ? limit : 0;
  const shown = cut ? list.slice(0, cut) : list;
  const showAll = () => {
    setAll(true);
    window.requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLAnchorElement>("li > a")[cut]?.focus({ preventScroll: true }));
  };

  if (rooms.length === 0) return <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">The first war rooms are being written.</p>;
  return (
    <div className="flex flex-col gap-4">
      {filters && (
        <div className="flex flex-col gap-2">
          {topics.length > 1 && (
            <div role="group" aria-label="Filter war rooms by topic" className={CHIPS}>
              {(["all", ...topics] as const).map((t) => (
                <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)} className={chip(topic === t)}>
                  {t === "all" ? "all topics" : t.toLowerCase()}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5">
            {(levels.length > 1 || clearedCount > 0) && (
              <div className={CHIPS}>
                {levels.length > 1 && (
                  <div role="group" aria-label="Filter war rooms by difficulty" className="flex shrink-0 gap-1.5">
                    {(["all", ...levels] as const).map((l) => (
                      <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={chip(level === l)}>
                        {l === "all" ? "any difficulty" : ROOM_LEVEL_LABEL[l].toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
                {clearedCount > 0 && (
                  <button type="button" aria-pressed={fresh} onClick={() => setFresh((f) => !f)} className={chip(fresh)}>
                    not played yet
                  </button>
                )}
              </div>
            )}
            <span className="font-mono text-xs text-fg-3 sm:ml-2" aria-live="polite">
              {list.length === rooms.length ? `${rooms.length} rooms` : `${list.length} of ${rooms.length} rooms`}
              {clearedCount ? ` · ${clearedCount} cleared` : ""}
            </span>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">No war room matches these filters.</p>
      ) : (
        <ul ref={listRef} id="war-room-list" className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const c = cleared(r.slug);
            const best = local?.runs[r.slug];
            return (
              <li key={r.slug}>
                <Link href={r.href} className={`flex h-full flex-col gap-3 border p-4 hover:border-fg-3 sm:p-5 ${c ? "border-line-strong bg-surface-2" : "border-line bg-surface"}`}>
                  <span className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label">
                    <span className="min-w-0 truncate">
                      <span className="bg-bad px-1.5 py-0.5 font-semibold text-on-bad">{r.sev}</span>{" "}
                      <span className="text-fg-3">
                        · {r.starts} · {r.company}
                      </span>
                    </span>
                    <span className={`shrink-0 ${c ? "text-fg" : "text-signal-text"}`}>{c ? "cleared ✓" : `+${WAR_ROOM_XP} xp`}</span>
                  </span>
                  <span className="font-display text-[21px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[22px]">{r.title}</span>
                  {r.product && <span className="text-[14px] leading-snug text-fg-2">{r.product}</span>}
                  {(r.topic || r.difficulty) && (
                    <span className="flex flex-wrap items-start gap-1.5 font-mono text-[11px] text-fg-2">
                      {r.topic && <span className="border border-line px-1.5 py-0.5">{r.topic}</span>}
                      {r.difficulty && <Level level={r.difficulty} />}
                    </span>
                  )}
                  <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-xs text-fg-3">
                    <span>
                      ~{r.minutes} min · {r.decisions} calls
                    </span>
                    {best ? <span className="text-fg-2">best: {best.wrong === 0 ? "no wrong calls" : `${best.wrong} wrong`}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {cut > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={showAll}
            aria-expanded={false}
            aria-controls="war-room-list"
            className="min-h-11 border border-line-strong px-5 text-[15px] font-medium text-fg hover:border-fg-3"
          >
            Show all {list.length} war rooms
          </button>
          <span className="font-mono text-xs text-fg-3">
            showing {cut} of {list.length}
          </span>
        </div>
      )}
    </div>
  );
}
