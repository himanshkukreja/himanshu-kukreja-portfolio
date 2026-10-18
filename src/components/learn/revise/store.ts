"use client";

/**
 * What this browser has revised (localStorage `hk.revise.v1`): one entry per lesson deck finished
 * and per world flipped end to end. Works offline; nothing here is needed for the deck to run.
 * "Again" cards also go to the review queue (lib/learn/review), which syncs for signed-in readers.
 */
import type { RevCard } from "@/lib/learn/revision/parse";
import { plain } from "@/lib/learn/revision/parse";
import type { ReviewCardInput } from "@/lib/learn/review";

export const REVISE_KEY = "hk.revise.v1";
export const REVISE_EVENT = "hk:revise-changed";
/** XP for revising a whole world once (game key `revise:<week>`). */
export const REVISE_WEEK_XP = 40;

export type ReviseRun = { at: number; got: number; again: number; seconds: number };
export type ReviseState = { lessons: Record<string, ReviseRun>; weeks: Record<string, ReviseRun> };

const EMPTY: ReviseState = { lessons: {}, weeks: {} };

export function readRevise(): ReviseState {
  try {
    const raw = window.localStorage.getItem(REVISE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<ReviseState>;
    return { lessons: p.lessons || {}, weeks: p.weeks || {} };
  } catch {
    return EMPTY;
  }
}

function write(s: ReviseState) {
  try {
    window.localStorage.setItem(REVISE_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(REVISE_EVENT));
  } catch {
    // private mode / storage full: the run still counts for this page
  }
}

export function recordRun(week: string, lessonSlugs: string[], run: ReviseRun, wholeWeek: boolean): ReviseState {
  const s = readRevise();
  const next: ReviseState = { lessons: { ...s.lessons }, weeks: { ...s.weeks } };
  for (const slug of lessonSlugs) next.lessons[`${week}/${slug}`] = run;
  if (wholeWeek) next.weeks[week] = run;
  write(next);
  return next;
}

/** A world counts as revised once every lesson that has cards was finished (any mix of runs). */
export function weekRevised(s: ReviseState, week: string, lessonSlugs: string[]): boolean {
  return !!s.weeks[week] || (lessonSlugs.length > 0 && lessonSlugs.every((l) => !!s.lessons[`${week}/${l}`]));
}

/** A revision card as a review-queue card (front = a prompt, back = the card). */
export function toReviewCard(c: RevCard, ctx: { course: string; week: string; slug: string; tag: string; lesson: string }): ReviewCardInput {
  const base = {
    source: "interview" as const,
    sourceRef: `revise:${ctx.week}/${ctx.slug}:${c.id}`,
    courseId: ctx.course,
    week: ctx.week,
    lessonSlug: ctx.slug,
  };
  const context = `${ctx.tag} · Revision`;
  switch (c.kind) {
    case "idea":
      return { ...base, front: `Explain in one breath: ${plain(c.title)}`, back: plain(c.text), detail: { context, short: plain(c.title) } };
    case "ask":
      return { ...base, front: plain(c.title), back: plain(c.text), detail: { context, short: plain(c.title) } };
    case "numbers":
      return {
        ...base,
        front: `${c.title === "Numbers to remember" ? "The numbers to remember" : plain(c.title)} · ${ctx.lesson}`,
        back: c.items.map((i) => `${plain(i.value)}: ${plain(i.label)}`).join("; "),
        detail: { context, short: `Numbers · ${ctx.lesson}`, points: c.items.map((i) => ({ k: plain(i.value), v: plain(i.label) })) },
      };
    case "mistakes":
      return {
        ...base,
        front: `Classic mistakes · ${ctx.lesson}`,
        back: c.items.map(plain).join("; "),
        detail: { context, short: `Mistakes · ${ctx.lesson}`, points: c.items.map((i) => ({ k: "✕", v: plain(i) })) },
      };
    case "tradeoff":
      return {
        ...base,
        front: `Trade-off: ${plain(c.title)}`,
        back: c.rows.map((r) => `${plain(r[0])}: ${r.slice(1).map((v, k) => `${plain(c.head[k + 1] || "")} ${plain(v)}`).join(" / ")}`).join("; "),
        detail: {
          context,
          short: plain(c.title),
          points: c.rows.map((r) => ({ k: plain(r[0]), v: r.slice(1).map((v, k) => `${plain(c.head[k + 1] || "")}: ${plain(v)}`).join(" · ") })),
        },
      };
  }
}
