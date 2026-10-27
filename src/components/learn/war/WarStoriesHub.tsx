"use client";

/**
 * /learn/war-stories: story of the day, the real stories (filter by theme, read ones ticked) and the
 * war rooms (cleared ones ticked, best run). Read / cleared state is this browser's plus the game state.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const noop = () => () => {};
import { useGame } from "@/game/GameProvider";
import { istToday, storyOfTheDay } from "@/lib/learn/war/day";
import { STORY_THEMES, THEME_LABEL, WAR_ROOM_XP, warRoomKey, type StorySummary, type StoryTheme, type WarRoomSummary } from "@/lib/learn/war/types";
import { readRuns, readStoriesRead, WAR_EVENT } from "./store";

const LABEL = "font-mono text-[11px] uppercase tracking-label";

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
        <p className="m-0 font-mono text-xs text-fg-3">
          {stories.length} real stories{Object.keys(videos).length ? ` · ${Object.keys(videos).length} with a short video` : ""}{local ? ` · ${readCount} read` : ""} · {rooms.length} war room{rooms.length === 1 ? "" : "s"}
        </p>
        {shorts > 0 && (
          <Link href="/learn/war-stories/shorts" className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 font-mono text-sm font-semibold text-on-signal">
            ▶ swipe through {shorts} shorts
          </Link>
        )}
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
      <section aria-labelledby="stories-h" className="flex flex-col gap-4">
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
                  className={`min-h-9 border px-3 font-mono text-xs ${theme === t ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`}
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
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => {
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
        )}
      </section>

      {/* war rooms: after the stories, with their own page (also linked from Prep) */}
      <section aria-labelledby="rooms-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
          <h2 id="rooms-h" className="m-0 flex flex-col gap-1">
            <span className={`${LABEL} text-signal-text`}>war room · you&apos;re on call</span>
            <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">Take the page</span>
          </h2>
          <span className="flex max-w-[520px] flex-col gap-1 text-[14px] text-fg-3 sm:items-end sm:text-right">
            Fictional company and people; each night is modelled on a real public postmortem, named at the end.
            <Link href="/learn/war-stories/war-room" className="font-mono text-xs text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              all {rooms.length} war rooms →
            </Link>
          </span>
        </div>
        <WarRoomGrid rooms={rooms} />
      </section>
    </main>
  );
}

/** The war-room cards (the hub and /learn/war-stories/war-room). */
export function WarRoomGrid({ rooms }: { rooms: WarRoomSummary[] }) {
  const { done, hydrated } = useGame();
  const local = useLocal();
  const cleared = (slug: string) => (hydrated && !!done[warRoomKey(slug)]) || !!local?.runs[slug];
  return (
    <>
    {rooms.length === 0 ? (
      <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">The first war rooms are being written.</p>
    ) : (
      <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        {rooms.map((r) => {
          const c = cleared(r.slug);
          const best = local?.runs[r.slug];
          return (
            <li key={r.slug}>
              <Link href={r.href} className={`flex h-full flex-col gap-3 border p-5 hover:border-fg-3 ${c ? "border-line-strong bg-surface-2" : "border-line bg-surface"}`}>
                <span className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-label">
                  <span>
                    <span className="bg-bad px-1.5 py-0.5 font-semibold text-white">{r.sev}</span> <span className="text-fg-3">· {r.starts} · {r.company}</span>
                  </span>
                  <span className={c ? "text-fg" : "text-signal-text"}>{c ? "cleared ✓" : `+${WAR_ROOM_XP} xp`}</span>
                </span>
                <span className="font-display text-[22px] font-bold leading-[1.1] tracking-[-0.02em] text-fg">{r.title}</span>
                {r.product && <span className="text-[14px] leading-snug text-fg-2">{r.product}</span>}
                <span className="mt-auto font-mono text-xs text-fg-3">
                  ~{r.minutes} min · {r.decisions} calls{best ? ` · best: ${best.wrong} wrong` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    )}
    </>
  );
}
