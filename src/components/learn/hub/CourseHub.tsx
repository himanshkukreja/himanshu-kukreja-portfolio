"use client";

/**
 * Course hub (/learn/[course]): hero with real numbers, Continue + Daily standup, skill tree of
 * every world (nodes per lesson, boss, trial parts), selected-world panel, side quests, and the
 * world-cleared / level-up moments. Progress: one batched load (useLearnProgress).
 */
import { LOGO_NOTE } from "@/components/learn/prep/CompanyLogo";
import { LEVEL_TONE } from "@/lib/learn/level";
import Link from "next/link";
import QuestEmblem from "@/components/learn/sidequest/QuestEmblem";
import { questBrand } from "@/components/learn/sidequest/brands";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { levelIndex } from "@/game/catalog";
import type { CourseMap } from "@/lib/learn/types";
import { LEARN_XP, lessonKey } from "@/lib/learn/types";
import { activityByDay, findResume, readReviewLog, streakFrom, useLearnProgress, weekStates } from "@/lib/learn/progress";
import { getLessonStages } from "@/lib/learn/actions";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import ContinueReadingBanner, { type ResumeStage } from "@/components/ContinueReadingBanner";
import CourseProgressStats from "@/components/CourseProgressStats";
import AuthPromptBanner from "@/components/AuthPromptBanner";
import TourCard from "@/components/learn/guide/TourCard";
import { MockGlyph, SkillTreeList, SkillTreeRows } from "./SkillTree";
import { useMockStatus } from "@/lib/learn/mock/store";
import WeekDetail from "./WeekDetail";
import WorldCleared from "./WorldCleared";
import LevelUp from "./LevelUp";
import Overlay from "./Overlay";
import ShareButton from "@/components/share/ShareButton";
import { SaveCourseButton } from "@/components/offline/OfflineLibrary";
import { InstallButton } from "@/components/offline/Install";
import { useOffline } from "@/components/offline/OfflineProvider";
import ShortsTeaser, { type TeaserShort } from "@/components/learn/war/ShortsTeaser";

export default function CourseHub({ map, shorts }: { map: CourseMap; shorts?: { items: TeaserShort[]; total: number } }) {
  const { ready, signedIn, lessons, done } = useLearnProgress(map.courseId);
  const { profile } = useAuth();
  const { xp, flags, setFlag, awardOnce, hydrated } = useGame();
  const { dueCount, ready: dueReady } = useReviewCards();
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [stagesFor, setStagesFor] = useState<{ key: string; stages: ResumeStage[] } | null>(null);

  const resume = useMemo(() => (ready ? findResume(map, lessons) : null), [ready, map, lessons]);
  const currentKey = resume ? lessonKey(resume.lesson.week, resume.lesson.slug) : null;
  const currentWeek = resume && resume.lesson.kind !== "bonus" ? resume.lesson.week : null;
  const states = useMemo(() => weekStates(map, lessons, done, currentWeek), [map, lessons, done, currentWeek]);
  const startedWeeks = useMemo(() => (ready ? new Set(states.filter((s) => s.status !== "ahead").map((s) => s.week.key)) : null), [ready, states]);
  const mocks = useMockStatus(map.mocks, startedWeeks);
  const mockAfter = (week: string) => mocks.find((m) => m.mock.after === week) || null;
  const selected = picked || currentWeek || map.weeks[0]?.key || "";
  const selState = states.find((s) => s.week.key === selected) || states[0];

  // Stages of the resume lesson for "Stage 2 of 5 · Part II · ~28 min left" (server-rendered, one lesson).
  useEffect(() => {
    if (!resume || resume.mode === "start") return;
    const key = lessonKey(resume.lesson.week, resume.lesson.slug);
    let off = false;
    getLessonStages(resume.lesson.week, resume.lesson.slug)
      .then((stages) => {
        if (!off) setStagesFor({ key, stages });
      })
      .catch(() => {
        if (!off) setStagesFor({ key, stages: [] });
      });
    return () => {
      off = true;
    };
  }, [resume]);
  const stages = stagesFor && currentKey === stagesFor.key ? stagesFor.stages : null;

  const streak = useMemo(() => {
    if (!ready) return null;
    const local = streakFrom(activityByDay(done, readReviewLog()));
    if (signedIn && profile && typeof profile.current_streak === "number" && profile.current_streak > 0) {
      return { current: Math.max(profile.current_streak, local.current), today: local.today };
    }
    return local;
  }, [ready, done, signedIn, profile]);

  const counts = useMemo(() => {
    if (!ready) return null;
    return {
      coreDone: states.reduce((a, s) => a + s.lessonsDone, 0),
      bossesDone: states.filter((s) => s.bossDone).length,
      partsPassed: states.reduce((a, s) => a + s.partsPassed.length, 0),
      sideDone: map.sideQuests.filter((l) => lessons[lessonKey(l.week, l.slug)]?.status === "completed").length,
    };
  }, [ready, states, map.sideQuests, lessons]);

  // Rewards that follow from progress: world bonus (+300) and the side-quest top-up (+60 on top
  // of the lesson's +60). awardOnce is idempotent, so this is safe to re-run.
  useEffect(() => {
    if (!ready || !hydrated) return;
    if (typeof flags["learn:levelSeen"] !== "number") setFlag("learn:levelSeen", levelIndex(xp));
    map.sideQuests.forEach((l) => {
      if (lessons[lessonKey(l.week, l.slug)]?.status === "completed" && !done[`sidequest:${l.slug}`]) {
        awardOnce(`sidequest:${l.slug}`, LEARN_XP.sideQuest - LEARN_XP.lesson, `Side quest · ${l.title}`);
      }
    });
    states.forEach((s) => {
      if (s.cleared && !done[`world:${s.week.key}`]) awardOnce(`world:${s.week.key}`, LEARN_XP.world, `World ${s.week.code} cleared · ${s.week.badge}`);
    });
  }, [ready, hydrated, states, lessons, done, flags, setFlag, awardOnce, xp, map.sideQuests]);

  // Moments: the newest world cleared since the last visit, then a level-up recap.
  const unseenCleared = useMemo(() => (ready ? states.filter((s) => s.cleared && !flags[`learn:cleared:${s.week.key}`]) : []), [ready, states, flags]);
  const worldMoment = unseenCleared.length ? unseenCleared[unseenCleared.length - 1] : null;
  const seenLevel = typeof flags["learn:levelSeen"] === "number" ? (flags["learn:levelSeen"] as number) : null;
  const levelMoment = ready && !worldMoment && seenLevel !== null && levelIndex(xp) > seenLevel ? seenLevel : null;

  const closeWorld = useCallback(() => {
    const now = Date.now();
    unseenCleared.forEach((s) => setFlag(`learn:cleared:${s.week.key}`, now));
  }, [unseenCleared, setFlag]);
  const closeLevel = useCallback(() => setFlag("learn:levelSeen", levelIndex(xp)), [setFlag, xp]);

  const sheetState = sheet ? states.find((s) => s.week.key === sheet) : null;
  const nextOf = (key: string) => {
    const i = map.weeks.findIndex((w) => w.key === key);
    return i >= 0 && i + 1 < map.weeks.length ? map.weeks[i + 1] : null;
  };

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      {/* Hero */}
      <section className="flex flex-wrap items-end justify-between gap-10">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-[18px]">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · free forever · no sign-up to read</span>
          <h1 className="font-display text-[clamp(48px,7.4vw,112px)] font-extrabold leading-[0.86] tracking-tightest text-fg">
            {map.title}
            <span className="text-signal-text">.</span>
          </h1>
          <p className="max-w-[640px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
            An {map.stats.worlds}-world campaign for backend engineers going from intermediate to advanced. Clear a world&apos;s lessons, beat its interview boss, pass the trial, and move on to the next.{map.mocks?.length ? " After most worlds, a timed mock interview loop checks it all under real interview pressure." : ""} Nothing is locked.
          </p>
          <CourseProgressStats stats={map.stats} learner={counts} />
          <Link href="/learn/guide" className="inline-flex min-h-10 items-center self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            how the course works: stages, XP, trials, Arena →
          </Link>
        </div>
        <div className="w-full flex-[1_1_360px] lg:max-w-[460px]">
          <ContinueReadingBanner ready={ready} resume={resume} stages={stages} dueCount={dueCount} dueReady={dueReady} streak={streak} />
        </div>
      </section>

      <TourCard />

      {ready && !signedIn && <AuthPromptBanner variant="learn-page" />}

      {/* Skill tree */}
      <section aria-labelledby="tree-h" className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_680px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 id="tree-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
                Skill tree
              </h2>
              <ShareButton kind="tree" label="Share" className="min-h-10 px-3" />
            </div>
            <div className="flex flex-wrap items-center gap-3.5 text-xs text-fg-3">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 bg-fg" />
                done
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 border-2 border-signal" />
                current
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 border border-dashed border-fg-4" />
                ahead
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="mx-0.5 h-2.5 w-2.5 rotate-45 border border-fg" />
                boss
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-4 border border-signal" />
                trial part
              </span>
              {mocks.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <MockGlyph state="ready" size="sm" text="" />
                  mock interview
                </span>
              )}
            </div>
          </div>
          <div className="hidden lg:block">
            <SkillTreeRows states={states} lessons={lessons} currentKey={currentKey} currentWeek={currentWeek} selected={selected} onSelect={setPicked} mocks={mocks} />
          </div>
          <div className="lg:hidden">
            <SkillTreeList states={states} lessons={lessons} currentKey={currentKey} currentWeek={currentWeek} onOpen={setSheet} mocks={mocks} />
          </div>
        </div>
        {selState && (
          <aside aria-label="Selected week" className="hidden min-w-0 flex-[1_1_340px] border border-line-strong bg-surface p-6 lg:block">
            <WeekDetail state={selState} lessons={lessons} currentKey={currentKey} current={selState.week.key === currentWeek} done={done} mock={mockAfter(selState.week.key)} />
          </aside>
        )}
      </section>

      {/* Shorts: one idea in under two minutes, the way in for a scroller */}
      {shorts && <ShortsTeaser shorts={shorts.items} total={shorts.total} />}

      {/* Side quests */}
      <section aria-labelledby="side-h" className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="side-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
            Side quests
          </h2>
          <span className="text-[15px] text-fg-3">
            Real systems, designed end to end, easiest first. All open. +{LEARN_XP.sideQuest} XP each.{" "}
            <Link href="/learn/sheets" className="font-mono text-[13px] text-signal-text underline underline-offset-4">
              design sheets →
            </Link>
          </span>
          <span className="basis-full text-[11px] text-fg-4">{LOGO_NOTE}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2">
          {map.sideQuests.map((q) => {
            const isDone = lessons[lessonKey(q.week, q.slug)]?.status === "completed";
            const started = !isDone && lessons[lessonKey(q.week, q.slug)]?.status === "in_progress";
            return (
              <Link
                key={q.slug}
                href={q.href}
                className={`flex flex-col gap-1.5 p-4 hover:border-fg-4 sm:min-h-[140px] sm:gap-2.5 sm:p-[18px] ${isDone ? "border border-line-strong bg-surface-2" : "border border-line bg-bg"}`}
              >
                <span className="flex items-start justify-between gap-3 font-mono text-[11px] tracking-label text-fg-3">
                  <QuestEmblem brand={questBrand(q.slug)} size={40} />
                  <span className="flex flex-col items-end gap-0.5">
                    <span>{q.code}</span>
                    <span>{q.minutes} MIN</span>
                  </span>
                </span>
                <span className="font-display text-[19px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[22px] sm:leading-[1.05]">{q.title}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className={`font-mono text-xs ${isDone ? "text-fg" : "text-signal-text"}`}>
                    {isDone ? "COMPLETED ✓" : started ? `IN PROGRESS · +${LEARN_XP.sideQuest} XP` : `+${LEARN_XP.sideQuest} XP`}
                  </span>
                  {q.level && (
                    <span className="border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label" style={{ color: LEVEL_TONE[q.level].fg, borderColor: LEVEL_TONE[q.level].border }} title={`Difficulty: ${q.level}`}>
                      {q.level}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Beyond the course: the other tabs, so the hub says where each thing lives */}
      <section aria-labelledby="beyond-h" className="flex flex-col gap-[18px]">
        <h2 id="beyond-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
          Beyond the course
        </h2>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {[
            {
              href: "/learn/prep",
              tab: "prep · get hired",
              title: "Interview prep",
              body: `Company pages with what candidates were asked, the question bank, ${(map.problems || []).length} classic problems, ${(map.lld || []).length} low-level design rounds, timed mocks, cheat and design sheets.`,
            },
            { href: "/learn/arena", tab: "arena · play", title: "Arena", body: "The daily challenge, weekly leagues, quick games, your review queue and design of the week." },
            { href: "/learn/war-stories", tab: "stories · see it for real", title: "War stories", body: "True stories of real systems at their limits, and war rooms where you take the page." },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="group flex flex-col gap-2 border border-line bg-surface p-5 hover:border-fg-3">
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{c.tab}</span>
              <span className="font-display text-[24px] font-bold leading-none tracking-[-0.02em] text-fg group-hover:text-signal-text">{c.title} →</span>
              <span className="text-[14px] leading-snug text-fg-2">{c.body}</span>
            </Link>
          ))}
        </div>
        <p className="m-0 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[13px]">
          <span className="text-fg-3">in the course too:</span>
          <Link href="/learn/concepts" className="text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            concepts A–Z →
          </Link>
          <Link href="/learn/reading" className="text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            reading trail →
          </Link>
          <Link href="/learn/sheets" className="text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            side-quest design sheets →
          </Link>
        </p>
      </section>

      <ReadOffline />

      {map.plan && (
        <Link href={map.plan.href} className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-5 py-4 hover:border-fg-4">
          <span className="flex flex-col gap-1">
            <span className="font-mono text-[11px] tracking-label text-fg-3">THE PLAN · {map.plan.minutes} MIN</span>
            <span className="text-base font-semibold text-fg">{map.plan.title}</span>
          </span>
          <span className="font-mono text-sm text-signal-text">read the roadmap →</span>
        </Link>
      )}

      {/* Phone: world sheet */}
      {sheetState && (
        <Overlay labelledBy="world-sheet-h" onClose={() => setSheet(null)} className="max-w-[560px] border border-line-strong bg-surface p-4 sm:p-6">
          <WeekDetail
            state={sheetState}
            lessons={lessons}
            currentKey={currentKey}
            current={sheetState.week.key === currentWeek}
            done={done}
            mock={mockAfter(sheetState.week.key)}
            onClose={() => setSheet(null)}
            headingId="world-sheet-h"
          />
        </Overlay>
      )}

      {worldMoment && <WorldCleared week={worldMoment.week} next={nextOf(worldMoment.week.key)} done={done} dueCount={dueCount} onClose={closeWorld} />}
      {levelMoment !== null && <LevelUp from={levelMoment} onClose={closeLevel} />}
    </main>
  );
}

/** Offline reading: save the whole course (or open the library), install the app. */
function ReadOffline() {
  const { checked, supported, saved } = useOffline();
  if (checked && !supported) return null;
  return (
    <section aria-labelledby="offline-h" className="flex flex-col gap-4 border border-line-strong bg-surface p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">No internet? No problem</span>
        <h2 id="offline-h" className="m-0 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[32px]">
          Read offline
        </h2>
        <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
          Save a lesson, a world or the whole course and read it on a flight. Diagrams, code, quick checks and trials work with no connection, and your progress syncs when you land.
          {saved.size > 0 && ` ${saved.size} saved on this device.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        <SaveCourseButton />
        <Link href="/learn/offline" className="inline-flex min-h-[52px] items-center border border-line-strong px-4 text-[15px] font-medium text-fg hover:bg-surface-2">
          Offline library
        </Link>
        <InstallButton className="min-h-[52px]" />
      </div>
    </section>
  );
}
