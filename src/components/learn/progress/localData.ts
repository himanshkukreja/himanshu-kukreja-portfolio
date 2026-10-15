"use client";

/**
 * Everything the Learn screens keep in this browser, in one place, so the progress page can show,
 * export and reset it. Keys (and who writes them):
 *   hk.lesson.v1                      lesson reader: { "<course>/<week>/<slug>": { stages, last, completed, max, … } }
 *   hk.game.v1                        game engine: { xp, done: { "<key>": epochMs }, flags }
 *   hk.review.v1                      review queue (guests, or signed in before review_cards exists)
 *   hk.review.log.v1                  review activity per day (streaks)
 *   hk.reveal.v1                      interview "review again" marks (imported into the queue)
 *   hk.trial.v1:<course>:<week>       trial records + run in progress
 *   hk.boss.v1:<week>/<slug>[:draft:<phase>]  boss mode state and drafts
 *   mcq-answers:<course>:<week>:<slug>        guest MCQ answers
 *   sd:check:<week>/<slug>, sd:verdict:<week>/<slug>  lesson checklists / interview verdicts
 *   hk.goal.v1                        weekly goal (guests)
 */
import type { CourseMap } from "@/lib/learn/types";
import { levelIndex } from "@/game/catalog";
import { GOAL_STORAGE_KEY } from "./goal";
import { inScope, scopeCtx, stripGame, type ResetParts, type ResetScope } from "./scope";

export const KEYS = {
  lesson: "hk.lesson.v1",
  game: "hk.game.v1",
  review: "hk.review.v1",
  reviewLog: "hk.review.log.v1",
  reveal: "hk.reveal.v1",
  goal: GOAL_STORAGE_KEY,
} as const;

const PREFIXES = ["hk.trial.v1:", "hk.boss.v1:", "mcq-answers:", "sd:check:", "sd:verdict:"];

export type GuestLesson = { stages?: string[]; last?: string | null; completed?: boolean; completedAt?: number; max?: number; updatedAt?: number };
export type GameState = { xp: number; done: Record<string, number>; flags: Record<string, unknown> };
export type TrialPartRecord = { best: number; total: number; attempts: number; passed: boolean; last?: { at?: number } };

function ls(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function allKeys(): string[] {
  const s = ls();
  if (!s) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k) out.push(k);
  }
  return out;
}

export function readGuestLessons(): Record<string, GuestLesson> {
  const v = readJSON<Record<string, GuestLesson>>(KEYS.lesson, {});
  return v && typeof v === "object" ? v : {};
}

export function readGame(): GameState {
  const v = readJSON<Partial<GameState>>(KEYS.game, {});
  return { xp: Number(v.xp) || 0, done: v.done || {}, flags: v.flags || {} };
}

/** Trial records per week folder from `hk.trial.v1:<course>:<week>`. */
export function readTrialStores(courseId: string): Record<string, Record<string, TrialPartRecord>> {
  const out: Record<string, Record<string, TrialPartRecord>> = {};
  const prefix = `hk.trial.v1:${courseId}:`;
  allKeys()
    .filter((k) => k.startsWith(prefix))
    .forEach((k) => {
      const v = readJSON<{ parts?: Record<string, TrialPartRecord> }>(k, {});
      if (v.parts) out[k.slice(prefix.length)] = v.parts;
    });
  return out;
}

/** Guest lessons with something worth importing into an account. */
export function guestLessonsForImport(courseId: string) {
  const prefix = `${courseId}/`;
  return Object.entries(readGuestLessons())
    .filter(([k, r]) => k.startsWith(prefix) && r && (r.completed || (r.max || 0) > 0 || (r.stages || []).length > 0))
    .map(([k, r]) => {
      const rest = k.slice(prefix.length);
      const i = rest.indexOf("/");
      return { week: rest.slice(0, i), slug: rest.slice(i + 1), completed: !!r.completed, pct: r.completed ? 100 : Math.round(r.max || 0), at: r.updatedAt || r.completedAt || Date.now() };
    })
    .filter((l) => l.week && l.slug);
}

/** Snapshot of every learn key in this browser (export). */
export function localSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  allKeys()
    .filter((k) => (Object.values(KEYS) as string[]).includes(k) || PREFIXES.some((p) => k.startsWith(p)))
    .sort()
    .forEach((k) => {
      const raw = ls()?.getItem(k) ?? null;
      try {
        out[k] = raw ? JSON.parse(raw) : raw;
      } catch {
        out[k] = raw;
      }
    });
  return out;
}

export type LocalResetResult = Record<string, number>;

const bump = (r: LocalResetResult, k: string, n = 1) => {
  if (n) r[k] = (r[k] || 0) + n;
};

/** "<week>/<slug>" out of a key suffix. */
function splitLesson(lk: string): [string, string] | null {
  const i = lk.indexOf("/");
  return i > 0 ? [lk.slice(0, i), lk.slice(i + 1)] : null;
}

/**
 * Clear this browser's copy of the data in scope. Used for guests (the only copy) and for
 * signed-in learners after the server reset: the reader merges hk.lesson.v1 and the game's done
 * keys back into the account on the next visit, so leaving them would resurrect the reset.
 * `dry` counts without writing.
 */
export function resetLocal(map: CourseMap, scope: ResetScope, parts: ResetParts, dry = false): LocalResetResult {
  const s = ls();
  const r: LocalResetResult = {};
  if (!s) return r;
  const c = map.courseId;
  const ctx = scopeCtx(map);
  const remove = (k: string) => {
    if (!dry) s.removeItem(k);
  };
  const write = (k: string, v: unknown) => {
    if (!dry) s.setItem(k, JSON.stringify(v));
  };

  // lesson reader records
  if (parts.progress) {
    const all = readGuestLessons();
    let n = 0;
    Object.keys(all).forEach((k) => {
      const [course, ...rest] = k.split("/");
      const wl = splitLesson(rest.join("/"));
      if (wl && inScope(scope, course, wl[0], wl[1])) {
        delete all[k];
        n++;
      }
    });
    if (n) write(KEYS.lesson, all);
    bump(r, "lesson records", n);
  }

  // game: the learn keys for these parts (+ their XP), or everything
  const game = readGame();
  if (scope.kind === "all" && parts.game) {
    if (game.xp || Object.keys(game.done).length) {
      bump(r, "XP", game.xp);
      bump(r, "quests & completions", Object.keys(game.done).length);
      remove(KEYS.game);
    }
  } else if (parts.progress || parts.mcq) {
    const res = stripGame(game.done, ctx, scope, parts);
    if (res.dropped.length) {
      const xp = Math.max(0, game.xp - res.xp);
      const flags = { ...game.flags };
      res.dropped.filter((k) => k.startsWith("world:")).forEach((k) => delete flags[`learn:cleared:${k.slice(6)}`]);
      if (typeof flags["learn:levelSeen"] === "number") flags["learn:levelSeen"] = Math.min(flags["learn:levelSeen"] as number, levelIndex(xp));
      write(KEYS.game, { xp, done: res.done, flags });
      bump(r, "checkpoints", res.dropped.filter((k) => k.startsWith("stage:")).length);
      bump(r, "completions", res.dropped.filter((k) => /^(lesson|boss|sidequest|world):/.test(k)).length);
      bump(r, "trial parts", res.dropped.filter((k) => k.startsWith("trial:")).length);
      bump(r, "XP", game.xp - xp);
    }
  }

  // per-lesson stores
  allKeys().forEach((k) => {
    if (parts.progress && k.startsWith("hk.boss.v1:")) {
      const wl = splitLesson(k.slice(11).split(":draft:")[0]);
      if (wl && inScope(scope, c, wl[0], wl[1])) {
        remove(k);
        if (!k.includes(":draft:")) bump(r, "boss runs");
      }
    } else if (parts.progress && (k.startsWith("sd:check:") || k.startsWith("sd:verdict:"))) {
      const wl = splitLesson(k.slice(k.indexOf(":", 3) + 1));
      if (wl && inScope(scope, c, wl[0], wl[1])) {
        remove(k);
        bump(r, "checklists & verdicts");
      }
    } else if (parts.mcq && k.startsWith("mcq-answers:")) {
      const [, course, week, slug] = k.split(":");
      if (course && week && slug && inScope(scope, course, week, slug)) {
        remove(k);
        bump(r, "quiz answer sets");
      }
    } else if (parts.mcq && k.startsWith("hk.trial.v1:")) {
      const [, course, week] = k.split(":");
      if (course && week && inScope(scope, course, week, ctx.trial[week] ?? null)) {
        remove(k);
        bump(r, "trial records");
      }
    }
  });

  // review queue + interview marks that feed it
  if (parts.progress) {
    const q = readJSON<{ cards?: { courseId?: string; week?: string | null; lessonSlug?: string | null }[] }>(KEYS.review, {});
    const cards = Array.isArray(q.cards) ? q.cards : [];
    const keep = cards.filter((card) => {
      if (scope.kind === "all") return false;
      if (scope.kind === "course") return card.courseId !== scope.course;
      return !(card.week && inScope(scope, card.courseId || c, card.week, card.lessonSlug ?? null));
    });
    if (keep.length !== cards.length) {
      write(KEYS.review, { cards: keep });
      bump(r, "review cards", cards.length - keep.length);
    }
    const reveal = readJSON<unknown>(KEYS.reveal, null);
    if (reveal && (scope.kind === "all" || scope.kind === "course")) {
      remove(KEYS.reveal);
      bump(r, "interview marks");
    } else if (reveal && typeof reveal === "object" && !Array.isArray(reveal)) {
      const o = { ...(reveal as Record<string, unknown>) };
      let n = 0;
      Object.keys(o).forEach((k) => {
        const week = k.match(/week-\d+[a-z0-9-]*/i)?.[0];
        const parts2 = k.split(/[/#:|]/).filter(Boolean);
        const wi = parts2.findIndex((p) => /^week-\d+/i.test(p));
        const slug = wi >= 0 ? parts2[wi + 1] : undefined;
        if (week && inScope(scope, c, week, slug ?? null)) {
          delete o[k];
          n++;
        }
      });
      if (n) {
        write(KEYS.reveal, o);
        bump(r, "interview marks", n);
      }
    }
  }

  if (parts.streaks && (scope.kind === "all" || scope.kind === "course") && s.getItem(KEYS.reviewLog)) {
    remove(KEYS.reviewLog);
    bump(r, "activity log");
  }

  if (!dry) {
    try {
      window.dispatchEvent(new Event("hk:review-changed"));
    } catch {
      // ignore
    }
  }
  return r;
}

/** One-line flash shown after the reload that follows a reset. */
export const FLASH_KEY = "hk.progress.flash";

export function setFlash(text: string) {
  try {
    window.sessionStorage.setItem(FLASH_KEY, text);
  } catch {
    // ignore
  }
}

export function takeFlash(): string | null {
  try {
    const v = window.sessionStorage.getItem(FLASH_KEY);
    if (v) window.sessionStorage.removeItem(FLASH_KEY);
    return v;
  } catch {
    return null;
  }
}
