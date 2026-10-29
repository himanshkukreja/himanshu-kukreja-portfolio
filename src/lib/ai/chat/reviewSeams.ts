import "server-only";
/**
 * The chat's seams to the review-due and study-plan modules (lib/learn/review-due.ts, lib/learn/study-plan.ts):
 * get_due_reviews reads what is due for the verified learner; make_study_plan dates the tutor's chosen steps
 * with the same planner (revision days, minutes per day) the study-plan feature uses.
 */
import { getDueReviews } from "@/lib/learn/review-due";
import { buildStudyPlan } from "@/lib/learn/study-plan";
import type { DueItem, PlanInput, PlanStep } from "./tools";

export async function dueReviewsFor(userId: string): Promise<DueItem[] | null> {
  const r = await getDueReviews({ userId, limit: 8 }).catch(() => null);
  return r ? r.items.map((i) => ({ kind: i.kind, id: i.id, title: i.title, href: i.href, why: i.why, dueAt: i.dueAt })) : null;
}

/** Each item's first study day (a step split across days starts on its first). */
export async function planFor(p: PlanInput): Promise<PlanStep[] | null> {
  const plan = buildStudyPlan({ goal: p.goal, days: p.days, startDate: p.startDate, hoursPerDay: p.hoursPerDay, items: p.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, href: i.href, minutes: i.minutes })) });
  if (plan.problem) return null;
  const out: PlanStep[] = [];
  for (const d of plan.days)
    for (const s of d.steps) if (!out.some((o) => o.id === s.id) && p.items.some((i) => i.id === s.id)) out.push({ date: d.date, id: s.id, title: s.title, href: s.href, minutes: s.minutes });
  return out;
}
