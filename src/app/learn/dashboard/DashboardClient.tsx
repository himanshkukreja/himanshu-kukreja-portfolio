"use client";

/**
 * Progress (/learn/dashboard): where a learner tracks, understands and resets their learning.
 * Overview (level, streak, time, course %, resume), course map, activity, weekly goal, mastery
 * (trials, review queue, notebook, badges) and data controls (export, import, reset).
 * Guests see this browser's data; signed-in learners see their account merged with this browser.
 */
import AiSettings from "@/components/learn/ai/AiSettings";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import type { CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import { BADGES } from "@/game/catalog";
import { findResume, streakFrom, weekStates, xpLog } from "@/lib/learn/progress";
import { getLessonStages } from "@/lib/learn/actions";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { localDate } from "@/lib/learn/review";
import type { ResumeStage } from "@/components/ContinueReadingBanner";
import AuthPromptBanner from "@/components/AuthPromptBanner";
import { useProgressData } from "@/components/learn/progress/useProgressData";
import { dailyActivity, minutesRead, recentPace, remainingWork, rhythm, trialScores, weekCells, weeklySeries, weekStart } from "@/components/learn/progress/derive";
import { takeFlash } from "@/components/learn/progress/localData";
import ProgressHeader from "@/components/learn/progress/ProgressHeader";
import CourseMapGrid from "@/components/learn/progress/CourseMapGrid";
import Activity from "@/components/learn/progress/Activity";
import Goals from "@/components/learn/progress/Goals";
import PlanCard from "@/components/learn/plan/PlanCard";
import Mastery from "@/components/learn/progress/Mastery";
import DataControls from "@/components/learn/progress/DataControls";
import SectionNav from "@/components/learn/progress/SectionNav";
import LectureStats, { type LectureLite } from "@/components/learn/progress/LectureStats";
import Reminders from "@/components/learn/progress/Reminders";
import ArenaStatsCard from "@/components/learn/arena/ArenaStatsCard";
import ShareProgress from "@/components/learn/progress/ShareProgress";
import CertificateEntry from "@/components/learn/certificate/CertificateEntry";
import { useMockStatus } from "@/lib/learn/mock/store";

export default function DashboardClient({ map, lectures = [] }: { map: CourseMap; lectures?: LectureLite[] }) {
  const d = useProgressData(map);
  const { openAuthModal } = useAuthModal();
  const { cards, ready: cardsReady } = useReviewCards();
  const [flash, setFlashState] = useState<string | null>(null);
  const [stagesFor, setStagesFor] = useState<{ key: string; stages: ResumeStage[] } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setFlashState(takeFlash()), 0);
    return () => window.clearTimeout(t);
  }, []);

  const { lessons, done, summary, local } = d;
  const resume = useMemo(() => (d.ready ? findResume(map, lessons) : null), [d.ready, map, lessons]);
  const currentWeek = resume && resume.lesson.kind !== "bonus" ? resume.lesson.week : null;
  const states = useMemo(() => weekStates(map, lessons, done, currentWeek), [map, lessons, done, currentWeek]);
  const scores = useMemo(() => trialScores(map, done, summary?.trials || null, local?.trials || {}), [map, done, summary, local]);
  const rows = useMemo(() => states.map((s) => ({ state: s, cells: weekCells(s.week, lessons, s, scores) })), [states, lessons, scores]);
  const startedWeeks = useMemo(() => (d.ready ? new Set(states.filter((s) => s.status !== "ahead").map((s) => s.week.key)) : null), [d.ready, states]);
  const mocks = useMockStatus(map.mocks, startedWeeks);

  // stages of the resume lesson for "Stage 2 of 5 · ~18 min left"
  useEffect(() => {
    if (!resume || resume.mode === "start") return;
    const key = lessonKey(resume.lesson.week, resume.lesson.slug);
    let off = false;
    getLessonStages(resume.lesson.week, resume.lesson.slug)
      .then((stages) => !off && setStagesFor({ key, stages }))
      .catch(() => !off && setStagesFor({ key, stages: [] }));
    return () => {
      off = true;
    };
  }, [resume]);
  const resumeKey = resume ? lessonKey(resume.lesson.week, resume.lesson.slug) : null;
  const stages = stagesFor && stagesFor.key === resumeKey ? stagesFor.stages : null;

  const nodes = useMemo(() => {
    let doneN = 0;
    let total = 0;
    rows.forEach((r) =>
      r.cells.forEach((c) => {
        total++;
        if (c.status === "done" || c.status === "passed") doneN++;
      })
    );
    return { done: doneN, total };
  }, [rows]);
  const coreLessons = useMemo(() => {
    let doneN = 0;
    let total = 0;
    map.weeks.forEach((w) =>
      [...w.lessons, ...(w.boss ? [w.boss] : [])].forEach((l) => {
        total++;
        if (lessons[lessonKey(l.week, l.slug)]?.status === "completed") doneN++;
      })
    );
    return { done: doneN, total };
  }, [map, lessons]);

  const streakRows = summary?.streaks;
  const activity = useMemo(
    () => dailyActivity({ map, lessons, done, reviewLog: local?.reviewLog || {}, streaks: streakRows || [], rows: d.rows as { completed_at?: string | null; last_accessed_at?: string | null }[] }),
    [map, lessons, done, local, streakRows, d.rows]
  );
  const series = useMemo(() => weeklySeries(activity.days), [activity]);
  const rhythmStats = useMemo(() => rhythm(activity.stamps, activity.days), [activity]);
  const streak = useMemo(() => {
    const ev: Record<string, number> = {};
    Object.entries(activity.days).forEach(([k, v]) => (ev[k] = v.events + (v.minutes > 0 ? 1 : 0)));
    const s = streakFrom(ev);
    const prof = summary?.profile;
    // "current" comes only from the activity days: user_profiles.current_streak is a snapshot taken
    // on the last active day and never decays, so max() kept showing a streak weeks after it broke.
    return { current: s.current, best: Math.max(s.best, prof?.longestStreak || 0, s.current), today: s.today };
  }, [activity, summary]);

  // time: tracked seconds for signed-in learners, otherwise an estimate from what was read
  const tracked = useMemo(() => {
    // Sum of the lesson rows (each capped at 3 h, the DB cap), not user_profiles.total_time_spent:
    // that counter was inflated by the old trigger (one learner: 210 "days") and max() trusted it.
    const rowSecs = (d.rows as { time_spent?: number | null }[]).reduce((a, r) => a + Math.min(10_800, Math.max(0, r.time_spent || 0)), 0);
    return rowSecs / 60;
  }, [d.rows]);
  const estimate = useMemo(() => {
    let m = 0;
    map.weeks.forEach((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])].forEach((l) => (m += minutesRead(l, lessons[lessonKey(l.week, l.slug)]))));
    map.sideQuests.forEach((l) => (m += minutesRead(l, lessons[lessonKey(l.week, l.slug)])));
    return m;
  }, [map, lessons]);
  const timeTracked = d.signedIn && tracked >= 1;
  const minutes = Math.round(timeTracked ? Math.max(tracked, 0) : estimate);

  const completions = useMemo(() => Object.entries(done).filter(([k]) => k.startsWith("lesson:")).map(([, t]) => t), [done]);
  const pace = useMemo(() => recentPace(series, completions), [series, completions]);
  const remaining = useMemo(() => remainingWork(map, lessons), [map, lessons]);
  const thisWeek = useMemo(() => {
    const ws = weekStart(localDate());
    const [y, m, dd] = ws.split("-").map(Number);
    const from = new Date(y, m - 1, dd).getTime();
    return { minutes: series[series.length - 1]?.minutes || 0, lessons: completions.filter((t) => t >= from).length };
  }, [series, completions]);
  const avgLessonMinutes = useMemo(() => {
    const all = map.weeks.flatMap((w) => w.lessons);
    return all.length ? Math.round(all.reduce((a, l) => a + l.minutes, 0) / all.length) : 30;
  }, [map]);

  const log = useMemo(() => xpLog(done, map).slice(0, 12), [done, map]);
  const badges = useMemo(
    () => [
      ...BADGES.map((b) => ({ id: b.id, name: b.name, how: b.how, earned: b.earned(done) })),
      ...states.map((s) => ({ id: `world:${s.week.key}`, name: s.week.badge, how: `Clear Week ${s.week.code} · ${s.week.title}.`, earned: s.cleared })),
      ...(map.mocks || []).map((m) => ({ id: `mock:${m.id}`, name: m.badge, how: `Finish mock interview ${m.n} · ${m.company} with a scored debrief.`, earned: !!done[`mock:${m.id}`] })),
    ],
    [done, states, map.mocks]
  );

  const nextTrial = useMemo(() => {
    const order = [...map.weeks].sort((a, b) => (a.key === currentWeek ? -1 : b.key === currentWeek ? 1 : a.num - b.num));
    for (const w of order) {
      const part = w.trial?.parts.find((x) => !scores[w.key]?.find((s) => s.part === x.n)?.passed);
      if (w.trial && part) {
        const best = scores[w.key]?.find((s) => s.part === part.n)?.pct ?? null;
        return { label: `W${w.code} · Part ${part.n} · ${part.title}`, href: part.href, best };
      }
    }
    return null;
  }, [map.weeks, currentWeek, scores]);
  const dueNow = useMemo(() => (cardsReady ? cards.filter((c) => c.dueAt <= localDate()).length : null), [cards, cardsReady]);

  const name = d.profile?.full_name || d.user?.email?.split("@")[0] || "Guest learner";
  const defaultLesson = resume && resume.mode === "resume" ? { week: resume.lesson.week, slug: resume.lesson.slug } : null;

  if (!d.ready) {
    return (
      <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:pb-24">
        <div aria-busy="true" aria-label="Loading your progress" className="h-[260px] animate-pulse border border-line bg-surface" />
        <div className="h-[180px] animate-pulse border border-line bg-surface" />
        <div className="h-[220px] animate-pulse border border-line bg-surface" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:gap-14 lg:pb-24">
      {flash && (
        <div role="status" className="flex items-center justify-between gap-3 border border-line-strong bg-surface px-4 py-3 text-sm text-fg">
          <span>
            <span className="mr-2 font-mono text-[11px] uppercase tracking-label text-signal-text">done</span>
            {flash}
          </span>
          <button type="button" onClick={() => setFlashState(null)} aria-label="Dismiss" className="grid h-10 w-10 shrink-0 place-items-center text-fg-3 hover:text-fg">
            ✕
          </button>
        </div>
      )}
      {d.summaryError && (
        <div role="alert" className="border border-bad/50 bg-surface px-4 py-3 text-sm text-fg-2">
          Couldn&apos;t load your account progress ({d.summaryError}). Showing this browser&apos;s copy.{" "}
          <button type="button" onClick={d.refresh} className="font-semibold text-fg underline underline-offset-4">
            Retry
          </button>
        </div>
      )}

      <ProgressHeader
        name={name}
        signedIn={d.signedIn}
        xp={d.xp}
        coursePct={nodes.total ? Math.round((nodes.done / nodes.total) * 100) : 0}
        nodes={nodes}
        lessonsDone={coreLessons.done}
        lessonsTotal={coreLessons.total}
        minutes={minutes}
        timeTracked={timeTracked}
        streak={streak}
        states={states}
        currentWeek={currentWeek}
        resume={resume}
        stages={stages}
        nextTrial={nextTrial}
        due={dueNow}
      />

      <SectionNav />

      <Link href="/learn/guide#progress" className="-mt-6 inline-flex min-h-10 items-center self-start font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg lg:-mt-10">
        what do these numbers mean? read the guide →
      </Link>

      <CourseMapGrid rows={rows} side={map.sideQuests} lessons={lessons} currentWeek={currentWeek} mocks={mocks} />

      <Activity days={activity.days} series={series} goalMinutes={d.goal?.unit === "minutes" ? d.goal.perWeek : null} streak={streak} rhythm={rhythmStats} estimated={!timeTracked} log={log} />

      {lectures.length > 0 && <LectureStats lectures={lectures} />}

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <Goals goal={d.goal} fallback={d.defaultGoal} source={d.goalSource} signedIn={d.signedIn} thisWeek={thisWeek} pace={pace} remaining={remaining} avgLessonMinutes={avgLessonMinutes} estimated={!timeTracked} onSaved={d.refresh} />
          <PlanCard map={map} lessons={lessons} done={done} goalTarget={d.goal?.target ?? null} />
        </div>
        <Mastery map={map} scores={scores} cards={cards} cardsReady={cardsReady} notebook={summary?.notebook || null} signedIn={d.signedIn} onSignIn={openAuthModal} badges={badges} />
      </div>

      <ArenaStatsCard />

      <Reminders signedIn={d.signedIn} onSignIn={openAuthModal} />
      <AiSettings signedIn={d.signedIn} onSignIn={openAuthModal} />

      <CertificateEntry states={states} done={done} signedIn={d.signedIn} />

      <ShareProgress />

      {!d.signedIn && <AuthPromptBanner variant="profile" />}

      <DataControls
        map={map}
        signedIn={d.signedIn}
        email={d.user?.email ?? null}
        rows={d.rows as { week: string; lesson_slug: string; status?: string | null; progress_percentage?: number | null }[]}
        defaultLesson={defaultLesson}
        onImported={d.refresh}
      />
    </main>
  );
}
