/**
 * Reset scopes, shared by the progress page (local reset) and POST /api/learn/reset (server).
 * The types mirror src/lib/learn/reset.ts (server-only, so the browser can't import it).
 * No "use client" / "use server" directive: pure functions only.
 */
import type { CourseMap } from "@/lib/learn/types";
import { LEARN_XP } from "@/lib/learn/types";

export type ResetScope =
  | { kind: "lesson"; course: string; week: string; lesson: string }
  | { kind: "week"; course: string; week: string }
  | { kind: "course"; course: string }
  | { kind: "all" };

export type ResetParts = {
  progress?: boolean;
  mcq?: boolean;
  notes?: boolean;
  bookmarks?: boolean;
  streaks?: boolean;
  game?: boolean;
};

export type PartKey = keyof ResetParts;

export const PART_INFO: Record<PartKey, { label: string; detail: string }> = {
  progress: { label: "Lesson progress", detail: "Checkpoints, completions, resume points, boss runs, review cards from these lessons" },
  mcq: { label: "Quiz answers & trials", detail: "Saved MCQ answers, trial attempts and passed trial parts" },
  notes: { label: "Notes & highlights", detail: "Highlights and notes in your notebook (account only)" },
  bookmarks: { label: "Bookmarks", detail: "Saved bookmarks (account only)" },
  streaks: { label: "Streaks & activity", detail: "Streak days and the review activity log" },
  game: { label: "XP & quests", detail: "Your level, every XP point and site quests, not just the course" },
};

/** Parts offered for a scope. Streak days aren't tied to a lesson; the game is site-wide. */
export function partsFor(kind: ResetScope["kind"]): PartKey[] {
  if (kind === "lesson" || kind === "week") return ["progress", "mcq", "notes", "bookmarks"];
  if (kind === "course") return ["progress", "mcq", "notes", "bookmarks", "streaks"];
  return ["progress", "mcq", "notes", "bookmarks", "streaks", "game"];
}

const SAFE = /^[A-Za-z0-9._-]{1,160}$/;

/** Validate untrusted input (API body). */
export function parseScope(input: unknown): ResetScope | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const ok = (v: unknown): v is string => typeof v === "string" && SAFE.test(v);
  if (o.kind === "all") return { kind: "all" };
  if (!ok(o.course)) return null;
  if (o.kind === "course") return { kind: "course", course: o.course };
  if (!ok(o.week)) return null;
  if (o.kind === "week") return { kind: "week", course: o.course, week: o.week };
  if (o.kind === "lesson" && ok(o.lesson)) return { kind: "lesson", course: o.course, week: o.week, lesson: o.lesson };
  return null;
}

export function parseParts(input: unknown, kind: ResetScope["kind"]): ResetParts | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const allowed = partsFor(kind);
  const out: ResetParts = {};
  allowed.forEach((k) => {
    if (o[k] === true) out[k] = true;
  });
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------- course context

export type ScopeCtx = {
  courseId: string;
  /** week folder -> boss slug / trial slug */
  boss: Record<string, string>;
  trial: Record<string, string>;
  /** side quest slug -> its folder */
  side: Record<string, string>;
};

export function scopeCtx(map: CourseMap): ScopeCtx {
  const boss: Record<string, string> = {};
  const trial: Record<string, string> = {};
  map.weeks.forEach((w) => {
    if (w.boss) boss[w.boss.week] = w.boss.slug;
    if (w.trial) {
      trial[w.trial.week] = w.trial.slug;
      trial[w.key] = w.trial.slug;
    }
  });
  const side: Record<string, string> = {};
  map.sideQuests.forEach((l) => (side[l.slug] = l.week));
  return { courseId: map.courseId, boss, trial, side };
}

export function inScope(scope: ResetScope, course: string, week: string, slug: string | null): boolean {
  if (scope.kind === "all") return true;
  if (scope.course !== course) return false;
  if (scope.kind === "course") return true;
  if (scope.week !== week) return false;
  if (scope.kind === "week") return true;
  return slug === scope.lesson;
}

/** Any lesson of the week is in scope (the week can no longer be "cleared"). */
function weekTouched(scope: ResetScope, course: string, week: string) {
  if (scope.kind === "lesson") return scope.course === course && scope.week === week;
  return inScope(scope, course, week, null);
}

/** XP the course awarded for a game `done` key (0 for site quests). */
export function learnKeyXp(key: string): number {
  const p = key.slice(0, key.indexOf(":"));
  if (p === "lesson") return LEARN_XP.lesson;
  if (p === "stage") return LEARN_XP.stage;
  if (p === "trial") return LEARN_XP.trial;
  if (p === "boss") return LEARN_XP.boss;
  if (p === "world") return LEARN_XP.world;
  if (p === "sidequest") return LEARN_XP.sideQuest - LEARN_XP.lesson;
  return 0;
}

/**
 * Should this game `done` key go? Learn keys follow the parts: lesson/stage/boss/sidequest keys are
 * "progress", trial parts are "quiz answers & trials", the world bonus goes with either.
 */
export function dropGameKey(key: string, ctx: ScopeCtx, scope: ResetScope, parts: ResetParts): boolean {
  if (scope.kind === "all" && parts.game) return true;
  const c = ctx.courseId;
  const colon = key.indexOf(":");
  if (colon < 0) return false;
  const kind = key.slice(0, colon);
  const rest = key.slice(colon + 1);
  if (kind === "lesson") {
    const i = rest.indexOf("/");
    return !!parts.progress && i > 0 && inScope(scope, c, rest.slice(0, i), rest.slice(i + 1));
  }
  if (kind === "stage") {
    const j = rest.lastIndexOf("/");
    const lk = j > 0 ? rest.slice(0, j) : "";
    const i = lk.indexOf("/");
    return !!parts.progress && i > 0 && inScope(scope, c, lk.slice(0, i), lk.slice(i + 1));
  }
  if (kind === "boss") return !!parts.progress && inScope(scope, c, rest, ctx.boss[rest] ?? null);
  if (kind === "sidequest") return !!parts.progress && !!ctx.side[rest] && inScope(scope, c, ctx.side[rest], rest);
  if (kind === "trial") {
    const week = rest.split("/")[0];
    return !!parts.mcq && inScope(scope, c, week, ctx.trial[week] ?? null);
  }
  if (kind === "world") {
    return (!!parts.progress && weekTouched(scope, c, rest)) || (!!parts.mcq && inScope(scope, c, rest, ctx.trial[rest] ?? null));
  }
  return false;
}

/** Apply dropGameKey to a done record. */
export function stripGame(done: Record<string, number>, ctx: ScopeCtx, scope: ResetScope, parts: ResetParts) {
  const next: Record<string, number> = {};
  const dropped: string[] = [];
  let xp = 0;
  Object.entries(done || {}).forEach(([k, v]) => {
    if (dropGameKey(k, ctx, scope, parts)) {
      dropped.push(k);
      xp += learnKeyXp(k);
    } else next[k] = v;
  });
  return { done: next, dropped, xp };
}

export function scopeLabel(scope: ResetScope, map: CourseMap | null): string {
  if (scope.kind === "all") return "everything";
  if (scope.kind === "course") return map?.title || scope.course;
  const w = map?.weeks.find((x) => x.key === scope.week);
  const wl = w ? `Week ${w.code}` : scope.week === "bonus-problems" ? "Side quests" : scope.week;
  if (scope.kind === "week") return w ? `${wl} · ${w.title}` : wl;
  const all = map ? [...map.weeks.flatMap((x) => [...x.lessons, ...(x.boss ? [x.boss] : [])]), ...map.sideQuests] : [];
  const l = all.find((x) => x.week === scope.week && x.slug === scope.lesson);
  if (l) return `${l.tag} · ${l.title}`;
  if (w?.trial && w.trial.slug === scope.lesson) return `${wl} · Trial`;
  return `${scope.week}/${scope.lesson}`;
}
