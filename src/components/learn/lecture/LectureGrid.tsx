"use client";

/**
 * The lecture playlist: how far this learner is overall and per section, "continue watching" (or
 * what to watch next), a sticky section bar, and every lecture as a card with its difficulty and
 * progress. Progress comes from the game flags `lec:<id>` the player writes (synced for signed-in
 * learners), with the older per-browser resume point (`hk.lecture.pos.<id>`) as a fallback.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import type { LectureSummary } from "@/lib/learn/lecture/load";
import { lectureGroupAnchor } from "@/lib/learn/lecture/types";
import { isWatched, readProgress, watchedPct, type LectureProgress } from "@/lib/learn/lecture/progress";
import { LEVEL_TONE, type Level } from "@/lib/learn/level";
import { compact, lectureStats } from "./LectureVote";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function LevelBadge({ level, className = "" }: { level: Level; className?: string }) {
  const t = LEVEL_TONE[level];
  return (
    <span className={`inline-flex items-center border bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label ${className}`} style={{ color: t.fg, borderColor: t.border }} title={`Difficulty: ${level}`}>
      {level}
    </span>
  );
}

function Bar({ pct, className = "h-1.5" }: { pct: number; className?: string }) {
  return (
    <span className={`block w-full overflow-hidden bg-surface-2 ${className}`} role="presentation">
      <span className="block h-full bg-signal transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

function Poster({ l, mediaBase, eager }: { l: LectureSummary; mediaBase: string | null; eager: boolean }) {
  if (!mediaBase) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- poster lives on the media host (R2), not in next/image's domains
    <img
      src={`${mediaBase}/${l.slug}/poster.jpg`}
      alt=""
      loading={eager ? "eager" : "lazy"}
      className="h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03]"
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}

const TRACK_LABEL: Record<LectureSummary["track"], string> = {
  course: "The course",
  mocks: "Mock interviews",
  quests: "Side quests",
  problems: "Interview problems",
  lld: "Low-level design",
  cases: "Case files",
  stories: "War stories",
};

/** "W04 · Caching" → "Week 4 · Caching"; other sections keep their names. */
const groupLabel = (name: string) => name.replace(/^W0*(\d+)\s*·\s*/, (_, n) => `Week ${n} · `);

type Group = { name: string; items: LectureSummary[] };

/**
 * Where everything is, in words: desktop gets a sticky list of every section under its track
 * (the course weeks, side quests, problems, LLD, case files) with watched counts; phones get the
 * tracks as buttons and a "jump to a section" menu.
 */
function SectionNav({ groups, progress, hydrated, active }: { groups: Group[]; progress: Record<string, LectureProgress>; hydrated: boolean; active: string | null }) {
  const tracks: { track: LectureSummary["track"]; groups: Group[] }[] = [];
  for (const g of groups) {
    const t = g.items[0].track;
    const last = tracks[tracks.length - 1];
    if (last && last.track === t) last.groups.push(g);
    else tracks.push({ track: t, groups: [g] });
  }
  const doneOf = (g: Group) => g.items.filter((l) => isWatched(progress[l.slug] ?? null)).length;
  const go = (name: string) => document.getElementById(lectureGroupAnchor(name))?.scrollIntoView({ behavior: "smooth", block: "start" });
  const activeTrack = tracks.find((t) => t.groups.some((g) => g.name === active))?.track;
  return (
    <>
      {/* phones and tablets: tracks as buttons + a section menu */}
      <nav aria-label="Playlist sections" className="sticky top-[var(--hk-header-h,61px)] z-20 -mx-4 flex min-w-0 flex-col gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="flex gap-1 overflow-x-auto">
          {tracks.map((t) => (
            <button
              key={t.track}
              type="button"
              onClick={() => go(t.groups[0].name)}
              className={`min-h-9 shrink-0 border px-2.5 text-[13px] ${activeTrack === t.track ? "border-signal text-fg" : "border-line-strong text-fg-2"}`}
            >
              {TRACK_LABEL[t.track]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-label text-fg-3">jump to</span>
          <select
            value={active ?? ""}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="min-h-9 min-w-0 flex-1 border border-line-strong bg-bg px-2 text-[13px] text-fg"
          >
            <option value="" disabled>
              Choose a section…
            </option>
            {tracks.map((t) => (
              <optgroup key={t.track} label={TRACK_LABEL[t.track]}>
                {t.groups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {groupLabel(g.name)} ({hydrated ? `${doneOf(g)}/` : ""}
                    {g.items.length})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </nav>

      {/* desktop: every section, in words, with progress */}
      <nav aria-label="Playlist sections" className="sticky top-[calc(var(--hk-header-h,61px)+16px)] hidden max-h-[calc(100vh-var(--hk-header-h,61px)-32px)] flex-col gap-4 overflow-y-auto overscroll-contain pr-1 lg:flex">
        {tracks.map((t) => (
          <div key={t.track} className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{TRACK_LABEL[t.track]}</span>
            <ol className="m-0 flex list-none flex-col p-0">
              {t.groups.map((g) => {
                const done = doneOf(g);
                const on = active === g.name;
                const label = t.groups.length === 1 ? `All ${g.items.length} lectures` : groupLabel(g.name);
                return (
                  <li key={g.name}>
                    <a
                      href={`#${lectureGroupAnchor(g.name)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        go(g.name);
                        history.replaceState(null, "", `#${lectureGroupAnchor(g.name)}`);
                      }}
                      className={`flex items-baseline gap-2 border-l-2 py-1 pl-2.5 pr-1 text-[13px] leading-snug ${on ? "border-signal bg-surface text-fg" : "border-line text-fg-2 hover:border-fg-3 hover:text-fg"}`}
                    >
                      <span className="min-w-0 flex-1">{label}</span>
                      <span className={`shrink-0 font-mono text-[10px] ${hydrated && done === g.items.length ? "text-signal-text" : "text-fg-4"}`}>
                        {hydrated && done === g.items.length ? "✓" : `${hydrated ? `${done}/` : ""}${g.items.length}`}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </nav>
    </>
  );
}

export default function LectureGrid({ lectures, mediaBase }: { lectures: LectureSummary[]; mediaBase: string | null }) {
  const { flags, hydrated } = useGame();
  // viewers and upvotes per lecture (one cached fetch)
  const [stats, setStats] = useState<Record<string, { v: number; u: number }>>({});
  useEffect(() => {
    let off = false;
    void lectureStats().then((s) => !off && setStats(s));
    return () => {
      off = true;
    };
  }, []);
  // older resume points kept only in this browser (before progress moved to the synced flags)
  const [legacy, setLegacy] = useState<Record<string, number>>({});
  useEffect(() => {
    const id = window.setTimeout(() => {
      const out: Record<string, number> = {};
      try {
        for (const l of lectures) {
          const at = Number(localStorage.getItem(`hk.lecture.pos.${l.slug}`));
          if (at > 0) out[l.slug] = at;
        }
      } catch {}
      setLegacy(out);
    }, 0);
    return () => window.clearTimeout(id);
  }, [lectures]);
  // opened with a section anchor (#w04-caching): the page loads at the top, so go there once laid out
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 120);
    return () => window.clearTimeout(t);
  }, []);

  const progress = useMemo(() => {
    const out: Record<string, LectureProgress> = {};
    if (!hydrated) return out;
    for (const l of lectures) {
      const p = readProgress(flags, l.slug);
      if (p) out[l.slug] = p;
      else if (legacy[l.slug]) out[l.slug] = { t: legacy[l.slug], m: legacy[l.slug], d: l.minutes * 60, at: 0 };
    }
    return out;
  }, [lectures, flags, legacy, hydrated]);

  // one section per week (and one per track), in course order
  const groups = useMemo(() => {
    const out: { name: string; items: LectureSummary[] }[] = [];
    for (const l of lectures) {
      const g = out[out.length - 1];
      if (g && g.name === l.group) g.items.push(l);
      else out.push({ name: l.group, items: [l] });
    }
    return out;
  }, [lectures]);

  // which section is on screen (for the section nav)
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-section]")];
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive((hit.target as HTMLElement).dataset.section || null);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [groups]);

  const watched = lectures.filter((l) => isWatched(progress[l.slug] ?? null));
  const totalMin = lectures.reduce((a, l) => a + l.minutes, 0);
  const seenMin = Math.round(lectures.reduce((a, l) => a + (l.minutes * watchedPct(progress[l.slug] ?? null)) / 100, 0));

  // continue watching: started, not finished, most recent first
  const inProgress = lectures
    .filter((l) => progress[l.slug] && !isWatched(progress[l.slug]) && watchedPct(progress[l.slug]) >= 2)
    .sort((a, b) => progress[b.slug].at - progress[a.slug].at)
    .slice(0, 4);
  // nothing half-watched: the next lecture after the last one finished, in course order
  const lastDone = [...watched].sort((a, b) => (progress[b.slug]?.at || 0) - (progress[a.slug]?.at || 0))[0];
  const upNext = !inProgress.length
    ? (lastDone ? lectures.slice(lectures.indexOf(lastDone) + 1).find((l) => !isWatched(progress[l.slug] ?? null) && l.track === lastDone.track) : undefined) ??
      lectures.find((l) => !isWatched(progress[l.slug] ?? null))
    : undefined;

  let k = -1;
  return (
    <div className="flex flex-col gap-10">
      {/* your progress */}
      <section aria-label="Your progress" className="flex flex-col gap-3 border border-line-strong bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">your progress</span>
          <span className="font-mono text-xs text-fg-2">
            {hydrated ? (
              <>
                <span className="text-fg">{watched.length}</span> of {lectures.length} watched · {Math.floor(seenMin / 60)} h {seenMin % 60} min of {Math.floor(totalMin / 60)} h {totalMin % 60} min
              </>
            ) : (
              "…"
            )}
          </span>
        </div>
        <Bar pct={totalMin ? (seenMin / totalMin) * 100 : 0} className="h-2" />

        {hydrated && (inProgress.length > 0 || upNext) && (
          <div className="mt-2 flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{inProgress.length ? "continue watching" : watched.length ? "up next" : "start here"}</span>
            <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
              {(inProgress.length ? inProgress : [upNext!]).map((l) => {
                const p = progress[l.slug];
                const resume = p && !isWatched(p) && p.t > 5 ? p.t : 0;
                return (
                  <li key={l.slug} className="min-w-0">
                    <Link href={resume ? `${l.href}?t=${resume}` : l.href} className="group flex min-w-0 items-center gap-3 overflow-hidden border border-line bg-bg p-2 hover:border-signal">
                      <span className="relative aspect-video w-[112px] shrink-0 overflow-hidden bg-[#0b0b0c] sm:w-[156px]">
                        <Poster l={l} mediaBase={mediaBase} eager />
                        <span className="absolute inset-0 grid place-items-center">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-signal text-on-signal shadow-[0_0_18px_rgba(255,107,43,0.5)]">
                            <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-[1px]" fill="currentColor" aria-hidden>
                              <path d="M7 4l13 8-13 8z" />
                            </svg>
                          </span>
                        </span>
                        {p && (
                          <span className="absolute inset-x-0 bottom-0">
                            <Bar pct={watchedPct(p)} className="h-1" />
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-mono text-[10px] uppercase tracking-label text-fg-3">
                          {l.code} · {l.group.replace(/^W\d+\s*·\s*/, "")}
                        </span>
                        <span className="line-clamp-2 text-[14px] font-semibold leading-snug text-fg group-hover:text-signal-text">{l.title}</span>
                        <span className="font-mono text-[11px] text-fg-3">{resume ? `resume at ${fmt(resume)} · ${watchedPct(p)}% watched` : `${l.minutes} min`}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        {groups.length > 1 && <SectionNav groups={groups} progress={progress} hydrated={hydrated} active={active} />}
        <div className="flex min-w-0 flex-col gap-10">
      {groups.map((g) => {
        const done = g.items.filter((l) => isWatched(progress[l.slug] ?? null)).length;
        return (
          <section key={g.name} id={lectureGroupAnchor(g.name)} data-section={g.name} className="flex scroll-mt-32 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[12px] uppercase tracking-label text-fg-3">
                <span className="text-signal-text">{groupLabel(g.name)}</span>
                <span className="text-fg-4">
                  {g.items.length} lecture{g.items.length === 1 ? "" : "s"} · {g.items.reduce((a, x) => a + x.minutes, 0)} min
                </span>
                {hydrated && <span className={done === g.items.length ? "text-signal-text" : "text-fg-3"}>{done === g.items.length ? "✓ all watched" : `${done}/${g.items.length} watched`}</span>}
              </h2>
              {hydrated && <Bar pct={(done / g.items.length) * 100} className="h-1 max-w-[320px]" />}
            </div>
            <ol className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {g.items.map((l) => {
                k++;
                const p = progress[l.slug] ?? null;
                const pct = watchedPct(p);
                const done = isWatched(p);
                return (
                  <li key={l.slug}>
                    <Link href={p && !done && p.t > 5 ? `${l.href}?t=${p.t}` : l.href} className="group flex h-full flex-col border border-line-strong bg-surface hover:border-signal">
                      <div className="relative aspect-video overflow-hidden bg-[#0b0b0c]">
                        <Poster l={l} mediaBase={mediaBase} eager={k < 6} />
                        <span className="absolute left-2 top-2 bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-signal-text">
                          <span className="text-[#a3a3a8]">#{k + 1}</span> · {l.code}
                        </span>
                        {l.level && <LevelBadge level={l.level} className="absolute right-2 top-2" />}
                        <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-[#f3f2ee]">{l.minutes} min</span>
                        {done && <span className="absolute bottom-2 left-2 bg-signal px-1.5 py-0.5 font-mono text-[11px] font-semibold text-on-signal">✓ watched</span>}
                        <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="grid h-12 w-12 place-items-center rounded-full bg-signal text-on-signal shadow-[0_0_24px_rgba(255,107,43,0.5)]">
                            <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-[1px]" fill="currentColor" aria-hidden>
                              <path d="M7 4l13 8-13 8z" />
                            </svg>
                          </span>
                        </span>
                        {pct > 0 && (
                          <span className="absolute inset-x-0 bottom-0 bg-black/60">
                            <Bar pct={pct} className="h-1 bg-transparent" />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5 p-4">
                        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{l.quest}</span>
                        <span className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:text-signal-text">{l.title}</span>
                        <span className="line-clamp-2 text-[13px] leading-snug text-fg-3">{l.summary}</span>
                        <span className="mt-auto pt-2 font-mono text-[11px] text-fg-4">
                          {l.checkpoints} checkpoints · {l.chapters} chapters
                          {pct > 0 ? ` · ${done ? "watched" : `${pct}% watched`}` : ""}
                          {stats[l.slug]?.v ? ` · ${compact(stats[l.slug].v)} viewer${stats[l.slug].v === 1 ? "" : "s"}` : ""}
                          {stats[l.slug]?.u ? ` · ▲ ${compact(stats[l.slug].u)}` : ""}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
        </div>
      </div>
    </div>
  );
}
