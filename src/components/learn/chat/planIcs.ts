/**
 * A chat study plan (make_study_plan) as a calendar file, through the study planner's own .ics writer
 * (lib/learn/study-plan.ts): one all-day event per dated day, each step with its full link.
 */
import { studyPlanId, toIcs, type StudyDay } from "@/lib/learn/study-plan";
import type { ChatSource, PathCard } from "@/lib/ai/chat/text";

export function buildIcsForPath(p: PathCard, sources: Record<string, ChatSource>): string {
  const byDate = new Map<string, StudyDay>();
  for (const s of p.steps) {
    const src = sources[s.ref];
    if (!s.date || !src) continue;
    const d = byDate.get(s.date) ?? { date: s.date, n: byDate.size + 1, type: "study" as const, minutes: 0, steps: [] };
    d.steps.push({ id: src.id, kind: src.kind, title: src.title, href: src.href, minutes: 0, part: null });
    byDate.set(s.date, d);
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return toIcs({ id: studyPlanId(p.title, p.plan?.start ?? days[0]?.date ?? ""), days, goal: p.title }, { title: p.title, url: "https://www.himanshukukreja.in/learn/saved" });
}
