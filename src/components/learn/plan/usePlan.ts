"use client";

/**
 * The study plan's state for the planner page, the Progress card and the course hub.
 *
 * Storage: the plan's settings live in the game's `plan:sdm` flag (src/game). Flags are kept in this
 * browser for guests and synced to user_profiles.game_flags for signed-in learners, so the plan
 * follows an account across devices with no new table. Only the settings and the baseline moment
 * are stored; the day-by-day plan is recomputed from them and the real progress every time.
 * Calendar-export bookkeeping (which dates this browser exported, the SEQUENCE) stays local.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import type { CourseLesson, CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import type { LessonProgress } from "@/lib/learn/progress";
import { minutesRead } from "@/components/learn/progress/derive";
import { localDate } from "@/lib/learn/review";
import {
  buildItems,
  cleanRecord,
  drift,
  minutesToFit,
  newPlanId,
  schedule,
  stretchMocks,
  type Drift,
  type ItemStatus,
  type PlanItem,
  type PlanRecord,
  type PlanSettings,
  type Schedule,
} from "@/lib/learn/plan/schedule";

export const PLAN_FLAG = "plan:sdm";
const EXPORT_KEY = "hk.plan.ics.v1";

/** What's done, per plan item, from the merged progress (rows + game keys + this browser). */
export function itemStatus(items: PlanItem[], lessons: Record<string, LessonProgress>, done: Record<string, number>): Record<string, ItemStatus> {
  const out: Record<string, ItemStatus> = {};
  for (const it of items) {
    if (it.kind === "lesson" || it.kind === "sidequest" || it.kind === "boss") {
      const lk = it.kind === "boss" ? null : it.id.slice("lesson:".length);
      const bossLesson = it.kind === "boss" ? lessonKeyFromHref(it.href) : null;
      const key = lk || bossLesson || "";
      const p = lessons[key];
      const gameAt = done[it.id] || (key ? done[`lesson:${key}`] : 0) || 0;
      const isDone = !!gameAt || p?.status === "completed";
      const read = p ? minutesRead({ minutes: it.minutes } as CourseLesson, p) : 0;
      out[it.id] = { done: isDone, left: isDone ? 0 : Math.max(0, it.minutes - read), doneAt: gameAt || (isDone ? p?.lastAt || 0 : 0) };
    } else if (it.kind === "trial") {
      const m = /^trial:(.+)\/part-(\d+)$/.exec(it.id);
      const at = done[it.id] || (m && it.week ? done[`trial:${it.week}/part-${m[2]}`] : 0) || 0;
      out[it.id] = { done: !!at, left: at ? 0 : it.minutes, doneAt: at };
    } else {
      const at = done[it.id] || 0;
      out[it.id] = { done: !!at, left: at ? 0 : it.minutes, doneAt: at };
    }
  }
  return out;
}

/** "/learn/<course>/<week>/<slug>" → "<week>/<slug>" */
function lessonKeyFromHref(href: string): string | null {
  const m = /^\/learn\/[^/]+\/([^/]+)\/([^/?#]+)/.exec(href);
  return m ? lessonKey(m[1], m[2]) : null;
}

const startOfDay = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).getTime();
};

export type PlanView = {
  record: PlanRecord;
  settings: PlanSettings;
  items: PlanItem[];
  status: Record<string, ItemStatus>;
  /** the plan recomputed from today with real progress (what the page shows) */
  live: Schedule;
  /** the plan as accepted (from baseStart), to measure drift against */
  baseline: Schedule;
  drift: Drift;
  /** minutes/day that would make the live plan fit, when it doesn't */
  needMinutes: number | null;
  today: string;
};

export function computePlan(map: CourseMap, record: PlanRecord, lessons: Record<string, LessonProgress>, done: Record<string, number>, today: string): PlanView {
  const s = record.settings;
  const items = buildItems(map, s);
  const stretch = stretchMocks(map, s);
  const status = itemStatus([...items, ...stretch], lessons, done);
  const liveInput = { items, stretch, status, settings: s, from: today, cutoff: startOfDay(today) };
  const live = schedule(liveInput);
  const baseline = schedule({ items, stretch, status, settings: s, from: record.baseStart, cutoff: record.baseAt });
  return {
    record,
    settings: s,
    items,
    status,
    live,
    baseline,
    drift: drift(baseline, [...items, ...stretch], status, today, s.minutes),
    needMinutes: live.fits ? null : minutesToFit(liveInput),
    today,
  };
}

/** Preview for the form: the plan these settings would make, starting today. */
export function previewPlan(map: CourseMap, s: PlanSettings, lessons: Record<string, LessonProgress>, done: Record<string, number>, today: string) {
  const items = buildItems(map, s);
  const stretch = stretchMocks(map, s);
  const status = itemStatus([...items, ...stretch], lessons, done);
  const input = { items, stretch, status, settings: s, from: today, cutoff: startOfDay(today) };
  const sch = schedule(input);
  return { sch, items, status, needMinutes: sch.fits ? null : minutesToFit(input) };
}

/** Today's local date, set after mount (the server render has no "today" of the learner's). */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setToday(localDate());
    const t = window.setTimeout(tick, 0);
    // midnight rollover while the page stays open
    const i = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(i);
    };
  }, []);
  return today;
}

/** The stored plan record (null: none yet) and its writers. */
export function usePlanRecord() {
  const { flags, setFlag, hydrated } = useGame();
  const record = useMemo(() => (hydrated ? cleanRecord(flags[PLAN_FLAG]) : null), [flags, hydrated]);

  const save = useCallback(
    (settings: PlanSettings, today: string, keepId?: string | null) => {
      const now = Date.now();
      const rec: PlanRecord = {
        v: 1,
        id: keepId || newPlanId(),
        settings,
        baseStart: today,
        baseAt: now,
        createdAt: record && keepId === record.id ? record.createdAt : now,
        updatedAt: now,
      };
      setFlag(PLAN_FLAG, rec);
      return rec;
    },
    [record, setFlag]
  );

  /** accept the adjusted plan: it becomes the new baseline from today */
  const rebaseline = useCallback(
    (today: string) => {
      if (!record) return;
      setFlag(PLAN_FLAG, { ...record, baseStart: today, baseAt: Date.now(), updatedAt: Date.now() });
    },
    [record, setFlag]
  );

  const remove = useCallback(() => setFlag(PLAN_FLAG, null), [setFlag]);

  return { hydrated, record, save, rebaseline, remove };
}

// ---------------------------------------------------------------- export bookkeeping (this browser)

export type ExportLog = { planId: string; seq: number; dates: string[]; at: number };

export function readExportLog(): ExportLog | null {
  try {
    const raw = window.localStorage.getItem(EXPORT_KEY);
    const o = raw ? (JSON.parse(raw) as ExportLog) : null;
    if (!o || typeof o.planId !== "string" || !Array.isArray(o.dates)) return null;
    return { planId: o.planId, seq: Number(o.seq) || 0, dates: o.dates.filter((d) => typeof d === "string"), at: Number(o.at) || 0 };
  } catch {
    return null;
  }
}

export function writeExportLog(log: ExportLog) {
  try {
    window.localStorage.setItem(EXPORT_KEY, JSON.stringify(log));
  } catch {
    // storage blocked: the next export starts a fresh sequence, which clients still accept
  }
}
