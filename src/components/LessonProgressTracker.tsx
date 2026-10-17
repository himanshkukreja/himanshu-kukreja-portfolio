"use client";

/**
 * Stage-based lesson progress, earned by reading time.
 *
 * - A stage counts as read only after real engaged reading time IN it (≥ 25% of its estimated
 *   minutes, 20 s – 6 min) with 60% of it on screen while reading — see READING in
 *   lib/learn/engagedClock. Jumping or scrolling past (anchors, TOC, "discussion", End/PageDown,
 *   flicks) never completes anything, and time below the article (end card, discussion) counts
 *   for no stage. Reading seconds per stage persist on this device (`hk.lesson.v1` → dwell/seen).
 * - The lesson completes on its own when every required stage is read. "Mark complete" is the
 *   explicit shortcut, unlocked after 70% of the summed stage reading time (each stage counting
 *   up to its own requirement); before that it shows "keep reading · ~N min left".
 * - "Save checkpoint" is a bookmark (resume here). It also clears the stage when that stage's
 *   time requirement is met (coverage is not required: the reader vouches for having read it).
 * - XP (`stage:<week>/<slug>/<stageId>` +10, `lesson:<week>/<slug>` +60, each once) and the
 *   `stage_done` / `lesson_complete` events happen only on those genuine completions.
 * - Completed stays completed and the percentage never goes down; resume is by stage.
 *
 * Signed in → `learning_progress` (stage columns when the level-up migration is applied, the
 * original columns otherwise; `time_spent` = engaged seconds on the page). Guests → localStorage.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Stage } from "@/lib/course/types";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import {
  claimGuestProgress,
  loadRemoteLesson,
  readGuestLesson,
  recordLearningActivity,
  saveRemoteLesson,
  writeGuestDwell,
  writeGuestLesson,
  type RemoteLessonRow,
} from "@/components/learn/lesson/progress";
import { headerStackBottom, stageElement, stageRailHeight } from "@/components/learn/lesson/layout";
import { isOptionalStage } from "@/components/learn/lesson/stageText";
import { track } from "@/lib/track";
import {
  completeNeedSeconds,
  coverageOf,
  isStageRead,
  lessonTimeCap,
  readProgress,
  stageNeedSeconds,
  startEngagedClock,
  startReadingProbe,
  visibleBins,
  type EngagedClock,
} from "@/lib/learn/engagedClock";

export { isOptionalStage };

export type StageReading = {
  /** engaged reading seconds in this stage */
  seconds: number;
  /** seconds it needs to count as read */
  need: number;
  /** 0..1 share of the stage seen while reading */
  coverage: number;
  /** 0..1 progress towards "read" (time and coverage) */
  progress: number;
};

export type LessonProgressValue = {
  /** stored state has loaded (guest storage or the DB row) */
  ready: boolean;
  stages: Stage[];
  required: Stage[];
  done: ReadonlySet<string>;
  lastStage: string | null;
  completed: boolean;
  /** stage currently under the reading line */
  current: string;
  /** 0..1, how far the reading line is through the current stage */
  currentPct: number;
  /** required stages left, in minutes (current stage counted partially) */
  minutesLeft: number;
  /** reading time per stage id */
  reading: Record<string, StageReading>;
  /** "Mark complete" is allowed (enough reading time, or every required stage read) */
  canComplete: boolean;
  /** minutes of reading left before "Mark complete" unlocks (0 once it has) */
  completeLeftMin: number;
  /** clears a stage if its reading time is met; returns whether it is done */
  markStageDone: (id: string) => boolean;
  /** "Save checkpoint": bookmark the current stage; clears it too when its reading time is met */
  saveCheckpoint: () => void;
  /** explicit "Mark complete" (gated by reading time) */
  complete: () => void;
};

const Ctx = createContext<LessonProgressValue | null>(null);

/** null outside a lesson reader (e.g. the trial page's week rail). */
export function useOptionalLessonProgress() {
  return useContext(Ctx);
}

export function useLessonProgress() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLessonProgress must be used inside <LessonProgressProvider>");
  return v;
}

type Props = {
  courseId: string;
  week: string;
  lessonSlug: string;
  title: string;
  stages: Stage[];
  contentVersion: string;
  children: React.ReactNode;
};

type Stored = {
  done: string[];
  lastStage: string | null;
  completed: boolean;
  completedAt: string | null;
  startedAt: string | null;
  timeSpent: number;
  progress: number;
};

type Snap = { dwell: Record<string, number>; seen: Record<string, number> };

const EMPTY: Stored = { done: [], lastStage: null, completed: false, completedAt: null, startedAt: null, timeSpent: 0, progress: 0 };
const EMPTY_SNAP: Snap = { dwell: {}, seen: {} };

function fromRow(row: RemoteLessonRow | null): Stored {
  if (!row) return EMPTY;
  return {
    done: Array.isArray(row.completed_stages) ? row.completed_stages : [],
    lastStage: row.last_stage ?? null,
    completed: row.status === "completed",
    completedAt: row.completed_at ?? null,
    startedAt: row.started_at ?? null,
    timeSpent: row.time_spent ?? 0,
    progress: Math.max(row.progress_percentage ?? 0, row.max_progress ?? 0),
  };
}

const fmtLeft = (secs: number) => `~${Math.max(1, Math.ceil(secs / 60))} min`;

export function LessonProgressProvider({ courseId, week, lessonSlug, title, stages, contentVersion, children }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { done: gameDone, awardOnce, hydrated } = useGame();

  const required = useMemo(() => {
    const r = stages.filter((s) => !isOptionalStage(s));
    return r.length ? r : stages;
  }, [stages]);

  const needs = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, stageNeedSeconds(s.minutes)])) as Record<string, number>, [stages]);
  const completeNeed = useMemo(() => completeNeedSeconds(required.map((s) => needs[s.id])), [required, needs]);
  const timeCap = useMemo(() => lessonTimeCap(stages.reduce((a, s) => a + (s.minutes || 0), 0)), [stages]);

  const [stored, setStored] = useState<Stored>(EMPTY);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string>(stages[0]?.id ?? "");
  const [currentPct, setCurrentPct] = useState(0);
  const [snap, setSnap] = useState<Snap>(EMPTY_SNAP);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);

  const storedRef = useRef<Stored>(EMPTY);
  const remoteOk = useRef(false); // the row loaded, so writes can't clobber unknown state
  // engaged time on the whole page (visible tab + recent activity) → learning_progress.time_spent
  const clock = useRef<EngagedClock | null>(null);
  const intent = useRef(false);
  // reading seconds and seen slices per stage (this device, persisted in hk.lesson.v1)
  const dwell = useRef<Record<string, number>>({});
  const seen = useRef<Record<string, number>>({});
  const readyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const noticeId = useRef(0);

  const stageKey = useCallback((id: string) => `stage:${week}/${lessonSlug}/${id}`, [week, lessonSlug]);
  const lessonXpKey = `lesson:${week}/${lessonSlug}`;

  // Effective state = stored ∪ what the game engine already knows (stage / lesson XP keys).
  const doneSet = useMemo(() => {
    const s = new Set(stored.done);
    if (hydrated) for (const st of stages) if (gameDone[stageKey(st.id)]) s.add(st.id);
    return s;
  }, [stored.done, hydrated, gameDone, stages, stageKey]);
  const completed = stored.completed || (hydrated && !!gameDone[lessonXpKey]);
  const gameCompletedRef = useRef(false);
  const gameDoneRef = useRef<Record<string, number>>({});
  useEffect(() => {
    gameCompletedRef.current = hydrated && !!gameDone[lessonXpKey];
    gameDoneRef.current = hydrated ? gameDone : {};
  }, [hydrated, gameDone, lessonXpKey]);

  const isDone = useCallback((id: string) => storedRef.current.done.includes(id) || !!gameDoneRef.current[stageKey(id)], [stageKey]);

  const say = useCallback((text: string) => {
    noticeId.current += 1;
    setNotice({ text, id: noticeId.current });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice((n) => (n?.id === notice.id ? null : n)), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ---- analytics (tracking contract v2): lesson_open / stage_reach / stage_done / lesson_complete
  const trackCtx = useRef({ course: courseId, week, lesson: lessonSlug });
  const reached = useRef<Set<string>>(new Set());
  const opened = useRef("");
  useEffect(() => {
    trackCtx.current = { course: courseId, week, lesson: lessonSlug };
    reached.current = new Set();
  }, [courseId, week, lessonSlug]);

  // ---- load ------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    remoteOk.current = false;
    readyRef.current = false;
    const guest = readGuestLesson(courseId, week, lessonSlug);
    dwell.current = { ...(guest?.dwell ?? {}) };
    seen.current = { ...(guest?.seen ?? {}) };
    const local: Stored = guest
      ? { ...EMPTY, done: guest.stages, lastStage: guest.last, completed: guest.completed, progress: guest.max }
      : EMPTY;

    const apply = (s: Stored) => {
      if (cancelled) return;
      storedRef.current = s;
      readyRef.current = true;
      setStored(s);
      setSnap({ dwell: { ...dwell.current }, seen: { ...seen.current } });
      setReady(true);
    };

    if (!userId) {
      apply(local);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const { row, ok } = await loadRemoteLesson(userId, courseId, week, lessonSlug);
      remoteOk.current = ok;
      const remote = fromRow(row);
      // merge: anything read as a guest on this device carries over after signing in — unless
      // the stored records belong to another account that signed in on this browser before
      if (!claimGuestProgress(userId)) {
        dwell.current = {};
        seen.current = {};
        apply(remote);
        return;
      }
      apply({
        ...remote,
        done: Array.from(new Set([...remote.done, ...local.done])),
        lastStage: remote.lastStage ?? local.lastStage,
        completed: remote.completed || local.completed,
        progress: Math.max(remote.progress, local.progress),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, courseId, week, lessonSlug]);

  useEffect(() => {
    const key = `${courseId}/${week}/${lessonSlug}`;
    if (!ready || opened.current === key) return;
    opened.current = key;
    track("lesson_open", { course: courseId, week, lesson: lessonSlug, stage: storedRef.current.lastStage ?? stages[0]?.id ?? "" });
  }, [ready, courseId, week, lessonSlug, stages]);

  // ---- persist -----------------------------------------------------------------------------
  const persist = useCallback(
    (input: Stored) => {
      const next = gameCompletedRef.current && !input.completed ? { ...input, completed: true } : input;
      const reqIds = required.map((s) => s.id);
      const doneReq = reqIds.filter((id) => next.done.includes(id)).length;
      const pct = next.completed ? 100 : Math.round((doneReq / Math.max(1, reqIds.length)) * 100);
      const progress = Math.max(next.progress, pct);
      storedRef.current = { ...next, progress };

      writeGuestLesson(courseId, week, lessonSlug, {
        stages: next.done,
        last: next.lastStage,
        completed: next.completed,
        completedAt: next.completed ? Date.now() : undefined,
        max: progress,
        v: contentVersion,
        updatedAt: Date.now(),
      });

      if (!userId || !remoteOk.current) return;
      const seconds = clock.current?.seconds() ?? 0;
      // a row is worth writing once there is progress, or a minute of real reading
      if (!next.completed && next.done.length === 0 && !next.lastStage && seconds < 60) return;
      void saveRemoteLesson({
        userId,
        course: courseId,
        week,
        slug: lessonSlug,
        stages: next.done,
        lastStage: next.lastStage,
        completed: next.completed,
        progress,
        timeSpent: Math.min(timeCap, next.timeSpent + seconds),
        startedAt: next.startedAt,
        completedAt: next.completedAt,
        contentVersion,
      }).then((ok) => {
        if (ok && !storedRef.current.startedAt) storedRef.current = { ...storedRef.current, startedAt: new Date().toISOString() };
      });
    },
    [required, courseId, week, lessonSlug, userId, contentVersion, timeCap]
  );

  const flushDwell = useCallback(() => {
    if (!readyRef.current) return;
    writeGuestDwell(courseId, week, lessonSlug, dwell.current, seen.current);
  }, [courseId, week, lessonSlug]);

  // Run the engaged clock for this lesson and save its time when the reader leaves, hides the tab,
  // or every 2 minutes of reading.
  const persistRef = useRef(persist);
  const flushDwellRef = useRef(flushDwell);
  useEffect(() => {
    persistRef.current = persist;
    flushDwellRef.current = flushDwell;
  }, [persist, flushDwell]);
  useEffect(() => {
    const c = startEngagedClock();
    clock.current = c;
    let sent = 0;
    const flush = () => {
      flushDwellRef.current();
      const secs = c.seconds();
      if (secs - sent < 1) return;
      sent = secs;
      persistRef.current(storedRef.current);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const timer = window.setInterval(() => {
      if (c.seconds() - sent >= 120) flush();
    }, 15_000);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      c.stop();
    };
  }, [courseId, week, lessonSlug]);

  const update = useCallback(
    (fn: (s: Stored) => Stored, opts: { immediate?: boolean } = {}) => {
      const next = fn(storedRef.current);
      storedRef.current = next;
      setStored(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (opts.immediate) persist(next);
      else saveTimer.current = window.setTimeout(() => persist(storedRef.current), 3000);
    },
    [persist]
  );

  /**
   * Reading seconds that count towards "Mark complete": each required stage counts up to its own
   * requirement (a read stage counts in full), so camping on one stage never unlocks the lesson.
   */
  const totalSeconds = useCallback(
    (d: Record<string, number>, done: (id: string) => boolean) => required.reduce((a, s) => a + (done(s.id) ? needs[s.id] : Math.min(d[s.id] ?? 0, needs[s.id])), 0),
    [required, needs]
  );

  // The lesson is complete: once, after genuine reading (all stages read, or the gated button).
  const finishLesson = useCallback(() => {
    if (!storedRef.current.completed) {
      const secs = Math.min(timeCap, storedRef.current.timeSpent + (clock.current?.seconds() ?? 0));
      track("lesson_complete", { ...trackCtx.current, minutes: Math.round(secs / 60) });
      update((s) => ({ ...s, completed: true, completedAt: s.completedAt ?? new Date().toISOString() }), { immediate: true });
      flushDwell();
      if (userId) void recordLearningActivity(userId);
    }
    awardOnce(lessonXpKey, 60, `${title} · complete`);
  }, [update, awardOnce, lessonXpKey, title, userId, timeCap, flushDwell]);

  // A stage is read: once, only from the reading rules / a checkpoint with its time met.
  const clearStage = useCallback(
    (id: string) => {
      const stage = stages.find((s) => s.id === id);
      if (!stage) return;
      if (!isDone(id)) {
        track("stage_done", { ...trackCtx.current, stage: id, index: stages.indexOf(stage), total: stages.length });
        update((s) => (s.done.includes(id) ? s : { ...s, done: [...s.done, id] }), { immediate: true });
        flushDwell();
        if (userId) void recordLearningActivity(userId);
      }
      awardOnce(stageKey(id), 10, `${stage.label} cleared · ${title}`);
      setSnap({ dwell: { ...dwell.current }, seen: { ...seen.current } });
      // every required stage read → the lesson is complete
      if (required.every((s) => s.id === id || isDone(s.id))) finishLesson();
    },
    [stages, isDone, update, flushDwell, userId, awardOnce, stageKey, title, required, finishLesson]
  );

  const markStageDone = useCallback(
    (id: string) => {
      if (isDone(id)) return true;
      if ((dwell.current[id] ?? 0) < (needs[id] ?? Infinity)) return false;
      clearStage(id);
      return true;
    },
    [isDone, needs, clearStage]
  );

  const complete = useCallback(() => {
    if (storedRef.current.completed) {
      awardOnce(lessonXpKey, 60, `${title} · complete`);
      return;
    }
    const allRead = required.every((s) => isDone(s.id));
    const total = totalSeconds(dwell.current, isDone);
    if (allRead || total >= completeNeed) {
      finishLesson();
      return;
    }
    say(`Keep reading · ${fmtLeft(completeNeed - total)} left before this can be marked complete. Skimming and jumping ahead don't count.`);
  }, [awardOnce, lessonXpKey, title, required, isDone, totalSeconds, completeNeed, finishLesson, say]);

  const currentRef = useRef(current);
  const saveCheckpoint = useCallback(() => {
    const cur = currentRef.current;
    const idx = stages.findIndex((s) => s.id === cur);
    if (idx < 0 || isDone(cur)) return;
    const secs = dwell.current[cur] ?? 0;
    const need = needs[cur] ?? 0;
    flushDwell();
    if (secs >= need) {
      const next = stages[idx + 1]?.id ?? stages[idx].id;
      update((s) => ({ ...s, lastStage: next }), { immediate: true });
      clearStage(cur);
      return;
    }
    // a bookmark: resume here; the stage clears once its reading time is met
    update((s) => ({ ...s, lastStage: cur }), { immediate: true });
    say(`Checkpoint saved · you'll resume here. ${stages[idx].label} clears after ${fmtLeft(need - secs)} more of reading.`);
  }, [stages, isDone, needs, flushDwell, update, clearStage, say]);

  // ---- reading position (current stage from scroll) -------------------------------------
  const pctRef = useRef(0);
  useEffect(() => {
    if (!stages.length) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const offset = headerStackBottom() + stageRailHeight();
      const vh = window.innerHeight;
      const line = offset + Math.min(180, (vh - offset) * 0.3);
      let cur = stages[0].id;
      let pct = 0;
      for (const s of stages) {
        const el = stageElement(s.id); // fresh lookup every time
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 && r.top === 0) continue;
        if (r.top <= line) {
          cur = s.id;
          pct = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height)));
        }
      }
      const rounded = Math.round(pct * 40) / 40;
      if (cur !== currentRef.current) {
        currentRef.current = cur;
        setCurrent(cur);
        if (intent.current && !reached.current.has(cur)) {
          reached.current.add(cur);
          track("stage_reach", { ...trackCtx.current, stage: cur, index: stages.findIndex((s) => s.id === cur), total: stages.length });
        }
      }
      if (rounded !== pctRef.current) {
        pctRef.current = rounded;
        setCurrentPct(rounded);
      }
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    const markIntent = () => {
      intent.current = true;
    };
    schedule();
    const t = window.setTimeout(schedule, 600); // after the content layer has enhanced the DOM
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", markIntent, { passive: true });
    window.addEventListener("touchmove", markIntent, { passive: true });
    window.addEventListener("keydown", markIntent);
    window.addEventListener("pointerdown", markIntent);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", markIntent);
      window.removeEventListener("touchmove", markIntent);
      window.removeEventListener("keydown", markIntent);
      window.removeEventListener("pointerdown", markIntent);
    };
  }, [stages]);

  // ---- reading time: one credited second at a time, to the stage under the reading line ------
  const clearStageRef = useRef(clearStage);
  const updateRef = useRef(update);
  useEffect(() => {
    clearStageRef.current = clearStage;
    updateRef.current = update;
  }, [clearStage, update]);
  useEffect(() => {
    if (!stages.length) return;
    let ticks = 0;
    const stop = startReadingProbe(() => {
      if (!readyRef.current) return;
      const offset = headerStackBottom() + stageRailHeight();
      const vh = window.innerHeight;
      const line = offset + Math.min(180, (vh - offset) * 0.3);
      let hit: Stage | null = null;
      const visible: [string, number][] = [];
      for (const s of stages) {
        const el = stageElement(s.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        if (r.top <= line && r.bottom > line) hit = s;
        if (r.bottom > offset && r.top < vh) visible.push([s.id, visibleBins(r, offset, vh)]);
      }
      // the reading line is outside the article (hero, end card, discussion): no stage is read
      if (!hit) return;
      dwell.current[hit.id] = (dwell.current[hit.id] ?? 0) + 1;
      for (const [id, mask] of visible) seen.current[id] = ((seen.current[id] ?? 0) | mask) >>> 0;
      ticks++;
      // resume point = where the reader actually reads (not where a jump landed)
      if (storedRef.current.lastStage !== hit.id) updateRef.current((s) => ({ ...s, lastStage: hit.id }));
      let cleared = false;
      for (const s of stages) {
        if (isDone(s.id)) continue;
        if (isStageRead(dwell.current[s.id] ?? 0, needs[s.id], seen.current[s.id])) {
          clearStageRef.current(s.id);
          cleared = true;
        }
      }
      if (!cleared && ticks % 5 === 0) setSnap({ dwell: { ...dwell.current }, seen: { ...seen.current } });
      if (ticks % 10 === 0) flushDwellRef.current();
    });
    return stop;
  }, [stages, needs, isDone]);

  // flush pending writes when leaving
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        persist(storedRef.current);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  // Expose state to the rendered stage headers (the content layer styles "you are here" / cleared).
  useEffect(() => {
    for (const st of stages) {
      const el = stageElement(st.id);
      if (!el) continue;
      const isDoneSt = completed || doneSet.has(st.id);
      el.setAttribute("data-stage-state", isDoneSt ? (st.id === current ? "done-current" : "done") : st.id === current ? "current" : "ahead");
    }
  }, [stages, completed, doneSet, current]);

  const minutesLeft = useMemo(() => {
    if (completed) return 0;
    let left = 0;
    for (const s of required) {
      if (doneSet.has(s.id)) continue;
      left += s.id === current ? s.minutes * (1 - currentPct) : s.minutes;
    }
    return Math.max(0, Math.round(left));
  }, [completed, required, doneSet, current, currentPct]);

  const reading = useMemo(() => {
    const out: Record<string, StageReading> = {};
    for (const s of stages) {
      const seconds = snap.dwell[s.id] ?? 0;
      const need = needs[s.id];
      out[s.id] = { seconds, need, coverage: coverageOf(snap.seen[s.id]), progress: doneSet.has(s.id) ? 1 : readProgress(seconds, need, snap.seen[s.id]) };
    }
    return out;
  }, [stages, snap, needs, doneSet]);

  const { canComplete, completeLeftMin } = useMemo(() => {
    if (completed || required.every((s) => doneSet.has(s.id))) return { canComplete: true, completeLeftMin: 0 };
    const total = totalSeconds(snap.dwell, (id) => doneSet.has(id));
    return total >= completeNeed ? { canComplete: true, completeLeftMin: 0 } : { canComplete: false, completeLeftMin: Math.max(1, Math.ceil((completeNeed - total) / 60)) };
  }, [completed, required, doneSet, totalSeconds, snap, completeNeed]);

  const value = useMemo<LessonProgressValue>(
    () => ({
      ready,
      stages,
      required,
      done: doneSet,
      lastStage: stored.lastStage,
      completed,
      current,
      currentPct,
      minutesLeft,
      reading,
      canComplete,
      completeLeftMin,
      markStageDone,
      saveCheckpoint,
      complete,
    }),
    [ready, stages, required, doneSet, stored.lastStage, completed, current, currentPct, minutesLeft, reading, canComplete, completeLeftMin, markStageDone, saveCheckpoint, complete]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-reader-ui
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+150px)] z-[70] flex justify-center px-4 lg:bottom-8"
      >
        {notice && (
          <p key={notice.id} className="m-0 max-w-[460px] animate-hk-in border border-line-strong bg-surface-2 px-4 py-3 font-mono text-xs leading-relaxed text-fg shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
            {notice.text}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}

type LegacyProps = {
  courseId: string;
  week: string;
  lessonSlug: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * Kept for callers that still mount the old scroll tracker (HighlightableContent). Progress is
 * owned by <LessonProgressProvider> in the lesson reader now, so this renders nothing and writes
 * nothing — a second writer would bring back the scroll-based completion this replaced.
 */
export default function LessonProgressTracker(props: LegacyProps) {
  void props;
  return null;
}
