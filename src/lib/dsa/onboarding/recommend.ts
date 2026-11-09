/**
 * The signed-in onboarding's record and the pure rules over it (no React, no browser).
 *
 *   record      what the learner told us, stored as the account flag `pref:dsa-onboarding` (src/game flags; the newer copy
 *               wins on a merge, src/lib/learn/saved-paths.ts mergeGameFlags) and mirrored by the game's localStorage
 *   sniff test  3 to 5 micro-puzzles picked from the topics the learner claims
 *   start       the Academy region to recommend first (recommendStart); nothing is ever locked, the map only
 *               highlights it and "Continue" begins there
 *   plan        a 7-day preview from the chosen minutes per day
 */
import { PUZZLES, type Puzzle, type TopicId } from "./puzzles";
import { FRONT_REGION, PATTERNS_REGION, TOPICS, type Know } from "./topics";
import type { DsaLang } from "../types";

export type Goal = "placements" | "interviews" | "cp";
export type Minutes = 15 | 30 | 60;
export type Exp = "new" | "some" | "experienced";

export type OnboardingRecord = {
  v: 1;
  status: "done" | "skipped";
  /** the step the learner left at, when skipped (0 welcome, 1 topics, 2 sniff, 3 pace) */
  skippedAt?: number;
  knows: Partial<Record<TopicId, Know>>;
  /** puzzle id -> answered right */
  sniff: Record<string, boolean>;
  pace: { minutes: Minutes | null; goal: Goal | null; lang: DsaLang | null };
  exp: Exp;
  /** the Academy region id to start at (resolved against what is built when it is used) */
  start: string | null;
  at: number;
  updatedAt: number;
};

export const ONBOARDING_FLAG = "pref:dsa-onboarding";

export function readRecord(flags: Record<string, unknown> | undefined): OnboardingRecord | null {
  const r = flags?.[ONBOARDING_FLAG] as Partial<OnboardingRecord> | undefined;
  if (!r || typeof r !== "object" || (r.status !== "done" && r.status !== "skipped")) return null;
  return r as OnboardingRecord;
}

/* ------------------------------------------------------------------ the sniff test */

/** 3 to 5 puzzles from the topics claimed ("seen it" or "can code it"), "can code it" first; one per topic until
 *  every claimed topic has one, then second puzzles. Empty when nothing is claimed. */
export function pickPuzzles(knows: Partial<Record<TopicId, Know>>): Puzzle[] {
  const claimed = TOPICS.filter((t) => (knows[t.id] ?? 0) >= 1).sort((a, b) => (knows[b.id] ?? 0) - (knows[a.id] ?? 0));
  if (!claimed.length) return [];
  const want = Math.min(5, Math.max(3, claimed.length));
  const byTopic = (id: TopicId) => PUZZLES.filter((p) => p.topic === id);
  const out: Puzzle[] = [];
  for (let round = 0; round < 2 && out.length < want; round++) {
    for (const t of claimed) {
      const p = byTopic(t.id)[round];
      if (p && out.length < want) out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ experience and the starting point */

/** Experience from the cards, with the guest welcome's own answer (when there is one) breaking ties. */
export function experienceOf(knows: Partial<Record<TopicId, Know>>, hint: Exp | null): Exp {
  const code = TOPICS.filter((t) => knows[t.id] === 2).length;
  const seen = TOPICS.filter((t) => knows[t.id] === 1).length;
  if (code >= 5) return "experienced";
  if (hint === "new" && code < 3) return "new";
  if (code >= 1 || seen >= 3) return "some";
  return "new";
}

export type TopicStanding = "known" | "shaky" | "seen" | "new";

/** How a topic stands: claimed code and (if tested) passed = known; claimed but missed = shaky. */
export function standing(t: TopicId, knows: Partial<Record<TopicId, Know>>, sniff: Record<string, boolean>): TopicStanding {
  const k = knows[t] ?? 0;
  if (k === 0) return "new";
  const asked = PUZZLES.filter((p) => p.topic === t && p.id in sniff);
  const right = asked.filter((p) => sniff[p.id]).length;
  const ok = !asked.length || right * 2 >= asked.length;
  if (!ok) return "shaky";
  return k === 2 ? "known" : "seen";
}

/**
 * The Academy region to start at.
 * - new to coding, or nothing claimed: Toolkit Hall (M0);
 * - otherwise walk the topics in campus order and stop at the first one that is not "known": claimed and passed
 *   ("can code it" and the puzzles right) skips a topic; "seen it" or "never heard of it" starts there; claimed but
 *   missed ("shaky") starts one step earlier;
 * - everything known: the pattern lessons (Part 4).
 */
export function recommendStart(knows: Partial<Record<TopicId, Know>>, sniff: Record<string, boolean>, exp: Exp): { region: string; reason: string } {
  const known = TOPICS.filter((t) => standing(t.id, knows, sniff) === "known");
  if (exp === "new" || known.length === 0) {
    const shaky = TOPICS.some((t) => standing(t.id, knows, sniff) === "shaky");
    return { region: FRONT_REGION, reason: shaky ? "A few of those were slippery, so we begin with the toolkit." : "A fresh start: how to read a problem, count steps and trace code by hand." };
  }
  const at = TOPICS.findIndex((t) => standing(t.id, knows, sniff) !== "known");
  if (at < 0) return { region: PATTERNS_REGION, reason: "You know your structures. Time for the patterns that solve interview problems." };
  const st = standing(TOPICS[at].id, knows, sniff);
  if (st === "shaky") {
    const prev = at > 0 ? TOPICS[at - 1] : null;
    return { region: prev ? prev.region : FRONT_REGION, reason: `${TOPICS[at].label} looked shaky, so we start one step earlier.` };
  }
  const before = TOPICS[at - 1];
  return {
    region: TOPICS[at].region,
    reason: before ? `You have ${before.label.toLowerCase()} covered. Next on the campus: ${TOPICS[at].label.toLowerCase()}.` : `Start with ${TOPICS[at].label.toLowerCase()}.`,
  };
}

/* ------------------------------------------------------------------ the 7-day plan */

/** One stop of the Academy outline (GET /api/dsa/onboarding): a required, built lesson, problem or checkpoint. */
export type OutlineNode = { id: string; type: "concept" | "practice" | "checkpoint"; title: string; href: string; minutes: number };
export type OutlineRegion = { id: string; code: string; title: string; nodes: OutlineNode[] };
export type Outline = { regions: OutlineRegion[] };

/** The region to use: the wanted one, or the first after it (in campus order) that has something written. */
export function resolveRegion(regions: { id: string; nodes: unknown[] }[], wanted: string): string | null {
  const at = regions.findIndex((r) => r.id === wanted);
  const from = at < 0 ? 0 : at;
  const hit = regions.slice(from).find((r) => r.nodes.length > 0) || regions.find((r) => r.nodes.length > 0);
  return hit ? hit.id : null;
}

export type PlanDay = { day: number; minutes: number; items: OutlineNode[]; note?: string };

export function buildPlan(outline: Outline, wanted: string, perDay: Minutes, skip: ReadonlySet<string> = new Set()): { days: PlanDay[]; regionId: string | null } {
  const regionId = resolveRegion(outline.regions, wanted);
  const at = outline.regions.findIndex((r) => r.id === regionId);
  const queue = at < 0 ? [] : outline.regions.slice(at).flatMap((r) => r.nodes).filter((n) => !skip.has(n.id));
  const days: PlanDay[] = [];
  let i = 0;
  for (let d = 1; d <= 6; d++) {
    const items: OutlineNode[] = [];
    let used = 0;
    while (i < queue.length && (items.length === 0 || used + queue[i].minutes <= perDay)) {
      items.push(queue[i]);
      used += queue[i].minutes;
      i++;
    }
    days.push({ day: d, minutes: used, items });
  }
  days.push({ day: 7, minutes: Math.min(perDay, 20), items: [], note: "Revise what you learned and solve the daily problem" });
  return { days, regionId };
}

export const PACE_LABEL: Record<Minutes, string> = { 15: "15 min", 30: "30 min", 60: "1 hour" };
export const GOAL_LABEL: Record<Goal, string> = { placements: "Placements", interviews: "Interviews", cp: "Competitive programming" };
