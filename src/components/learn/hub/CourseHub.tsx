"use client";

/**
 * Course hub (/learn/[course]): hero with real numbers, Continue + Daily standup, skill tree of
 * every world (nodes per lesson, boss, trial parts), selected-world panel, side quests, and the
 * world-cleared / level-up moments. Progress: one batched load (useLearnProgress).
 */
import Link from "next/link";
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
import { SkillTreeList, SkillTreeRows } from "./SkillTree";
import WeekDetail from "./WeekDetail";
import WorldCleared from "./WorldCleared";
import LevelUp from "./LevelUp";
import Overlay from "./Overlay";

export default function CourseHub({ map }: { map: CourseMap }) {
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
            An {map.stats.worlds}-world campaign for backend engineers going from intermediate to advanced. Clear a world&apos;s lessons, beat its interview boss, pass the trial, and move on to the next. Nothing is locked.
          </p>
          <CourseProgressStats stats={map.stats} learner={counts} />
        </div>
        <div className="w-full flex-[1_1_360px] lg:max-w-[460px]">
          <ContinueReadingBanner ready={ready} resume={resume} stages={stages} dueCount={dueCount} dueReady={dueReady} streak={streak} />
        </div>
      </section>

      {ready && !signedIn && <AuthPromptBanner variant="learn-page" />}

      {/* Skill tree */}
      <section aria-labelledby="tree-h" className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_680px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="tree-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
              Skill tree
            </h2>
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
            </div>
          </div>
          <div className="hidden lg:block">
            <SkillTreeRows states={states} lessons={lessons} currentKey={currentKey} currentWeek={currentWeek} selected={selected} onSelect={setPicked} />
          </div>
          <div className="lg:hidden">
            <SkillTreeList states={states} lessons={lessons} currentKey={currentKey} currentWeek={currentWeek} onOpen={setSheet} />
          </div>
        </div>
        {selState && (
          <aside aria-label="Selected week" className="hidden min-w-0 flex-[1_1_340px] border border-line-strong bg-surface p-6 lg:block">
            <WeekDetail state={selState} lessons={lessons} currentKey={currentKey} current={selState.week.key === currentWeek} done={done} />
          </aside>
        )}
      </section>

      {/* Side quests */}
      <section aria-labelledby="side-h" className="flex flex-col gap-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="side-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
            Side quests
          </h2>
          <span className="text-[15px] text-fg-3">Real systems, designed end to end. All open. +{LEARN_XP.sideQuest} XP each.</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2">
          {map.sideQuests.map((q) => {
            const isDone = lessons[lessonKey(q.week, q.slug)]?.status === "completed";
            const started = !isDone && lessons[lessonKey(q.week, q.slug)]?.status === "in_progress";
            return (
              <Link
                key={q.slug}
                href={q.href}
                className={`flex min-h-[140px] flex-col gap-2.5 p-[18px] hover:border-fg-4 ${isDone ? "border border-line-strong bg-surface-2" : "border border-line bg-bg"}`}
              >
                <span className="flex justify-between font-mono text-[11px] tracking-label text-fg-3">
                  <span>{q.code}</span>
                  <span>{q.minutes} MIN</span>
                </span>
                <span className="font-display text-[22px] font-bold leading-[1.05] tracking-[-0.02em] text-fg">{q.title}</span>
                <span className={`mt-auto font-mono text-xs ${isDone ? "text-fg" : "text-signal-text"}`}>
                  {isDone ? "COMPLETED ✓" : started ? `IN PROGRESS · +${LEARN_XP.sideQuest} XP` : `+${LEARN_XP.sideQuest} XP`}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

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
