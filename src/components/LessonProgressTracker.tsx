"use client";

/**
 * Stage-based lesson progress.
 *
 * Progress is "stages done", not scroll depth:
 * - a stage is done when the reader saves a checkpoint on it, or reads it through (its end passes
 *   the reading line after a real dwell time — fast scrolling never counts);
 * - the lesson completes only through "Mark complete" or when every required stage is done
 *   (the old 90%-scroll auto-complete is gone);
 * - completed stays completed and the percentage never goes down;
 * - resume is by stage (`last_stage`), never by pixel offset.
 *
 * Signed in → `learning_progress` (stage columns when the level-up migration is applied, the
 * original columns otherwise). Guests → localStorage (`hk.lesson.v1`). XP goes through the game
 * engine: `stage:<week>/<slug>/<stageId>` +10 and `lesson:<week>/<slug>` +60, each once.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Stage } from "@/lib/course/types";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import {
  loadRemoteLesson,
  readGuestLesson,
  recordLearningActivity,
  saveRemoteLesson,
  writeGuestLesson,
  type RemoteLessonRow,
} from "@/components/learn/lesson/progress";
import { headerStackBottom, stageElement, stageRailHeight } from "@/components/learn/lesson/layout";
import { isOptionalStage } from "@/components/learn/lesson/stageText";

export { isOptionalStage };

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
  markStageDone: (id: string) => void;
  /** "Save checkpoint": current stage done, resume moves to the next one */
  saveCheckpoint: () => void;
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

const EMPTY: Stored = { done: [], lastStage: null, completed: false, completedAt: null, startedAt: null, timeSpent: 0, progress: 0 };

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

export function LessonProgressProvider({ courseId, week, lessonSlug, title, stages, contentVersion, children }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { done: gameDone, awardOnce, hydrated } = useGame();

  const required = useMemo(() => {
    const r = stages.filter((s) => !isOptionalStage(s));
    return r.length ? r : stages;
  }, [stages]);

  const [stored, setStored] = useState<Stored>(EMPTY);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<string>(stages[0]?.id ?? "");
  const [currentPct, setCurrentPct] = useState(0);

  const storedRef = useRef<Stored>(EMPTY);
  const remoteOk = useRef(false); // the row loaded, so writes can't clobber unknown state
  const sessionStart = useRef(0);
  const intent = useRef(false);
  const dwell = useRef<Record<string, number>>({});
  const saveTimer = useRef<number | null>(null);

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
  useEffect(() => {
    gameCompletedRef.current = hydrated && !!gameDone[lessonXpKey];
  }, [hydrated, gameDone, lessonXpKey]);

  // ---- load ------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    sessionStart.current = Date.now();
    remoteOk.current = false;
    dwell.current = {};
    const guest = readGuestLesson(courseId, week, lessonSlug);
    const local: Stored = guest
      ? { ...EMPTY, done: guest.stages, lastStage: guest.last, completed: guest.completed, progress: guest.max }
      : EMPTY;

    const apply = (s: Stored) => {
      if (cancelled) return;
      storedRef.current = s;
      setStored(s);
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
      // merge: anything read as a guest on this device carries over after signing in
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
      if (!next.completed && next.done.length === 0 && !next.lastStage) return;
      const seconds = sessionStart.current ? Math.floor((Date.now() - sessionStart.current) / 1000) : 0;
      void saveRemoteLesson({
        userId,
        course: courseId,
        week,
        slug: lessonSlug,
        stages: next.done,
        lastStage: next.lastStage,
        completed: next.completed,
        progress,
        timeSpent: next.timeSpent + seconds,
        startedAt: next.startedAt,
        completedAt: next.completedAt,
        contentVersion,
      }).then((ok) => {
        if (ok && !storedRef.current.startedAt) storedRef.current = { ...storedRef.current, startedAt: new Date().toISOString() };
      });
    },
    [required, courseId, week, lessonSlug, userId, contentVersion]
  );

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

  const complete = useCallback(() => {
    if (!storedRef.current.completed) {
      update(
        (s) => ({ ...s, completed: true, completedAt: s.completedAt ?? new Date().toISOString() }),
        { immediate: true }
      );
      if (userId) void recordLearningActivity(userId);
    }
    awardOnce(lessonXpKey, 60, `${title} · complete`);
  }, [update, awardOnce, lessonXpKey, title, userId]);

  const markStageDone = useCallback(
    (id: string) => {
      const stage = stages.find((s) => s.id === id);
      if (!stage) return;
      const already = storedRef.current.done.includes(id);
      if (!already) {
        update((s) => ({ ...s, done: [...s.done, id] }), { immediate: true });
        if (userId) void recordLearningActivity(userId);
      }
      awardOnce(stageKey(id), 10, `${stage.label} cleared · ${title}`);
      // every required stage done → the lesson is complete
      const doneNow = new Set([...storedRef.current.done, id]);
      if (required.every((s) => doneNow.has(s.id) || (hydrated && gameDone[stageKey(s.id)]))) complete();
    },
    [stages, update, userId, awardOnce, stageKey, title, required, hydrated, gameDone, complete]
  );

  const saveCheckpoint = useCallback(() => {
    const idx = stages.findIndex((s) => s.id === current);
    if (idx < 0) return;
    const next = stages[idx + 1]?.id ?? stages[idx].id;
    update((s) => ({ ...s, lastStage: next }), { immediate: false });
    markStageDone(stages[idx].id);
  }, [stages, current, update, markStageDone]);

  // ---- reading position (current stage from scroll) -------------------------------------
  const currentRef = useRef(current);
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
        if (intent.current) update((s) => (s.lastStage === cur ? s : { ...s, lastStage: cur }));
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
  }, [stages, update]);

  // ---- "read through" detection: dwell time per stage, then its end passes the line ----------
  useEffect(() => {
    if (!ready || !stages.length) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !intent.current) return;
      const cur = currentRef.current;
      dwell.current[cur] = (dwell.current[cur] ?? 0) + 1;
      const needed = (s: Stage) => Math.min(300, Math.max(20, s.minutes * 60 * 0.3));
      const idx = stages.findIndex((s) => s.id === cur);
      // the previous stage was read through when the reader moved on after enough time in it
      const prev = stages[idx - 1];
      if (prev && !storedRef.current.done.includes(prev.id) && (dwell.current[prev.id] ?? 0) >= needed(prev)) markStageDone(prev.id);
      const stage = stages[idx];
      if (stage && !storedRef.current.done.includes(stage.id) && pctRef.current >= 0.98 && (dwell.current[stage.id] ?? 0) >= needed(stage)) markStageDone(stage.id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [ready, stages, markStageDone]);

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
      const isDone = completed || doneSet.has(st.id);
      el.setAttribute("data-stage-state", isDone ? (st.id === current ? "done-current" : "done") : st.id === current ? "current" : "ahead");
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
      markStageDone,
      saveCheckpoint,
      complete,
    }),
    [ready, stages, required, doneSet, stored.lastStage, completed, current, currentPct, minutesLeft, markStageDone, saveCheckpoint, complete]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
