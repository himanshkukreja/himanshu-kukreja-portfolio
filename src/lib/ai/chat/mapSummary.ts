/**
 * The course map as a few compact lines for the course chat's system prompt: every week with its lessons,
 * and how many side quests, problems, LLD rounds and mocks there are. Pure (the route and the eval build
 * the same text). Unreleased work ("-next" folders, only in a local checkout) is left out, as in the index.
 * It changes only when the course does, so the prompt stays cached between messages.
 */
import type { CourseMap } from "@/lib/learn/types";

const unreleased = (week: string) => /-next(?:--|\/|$)/.test(week);
const short = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t);

export function courseMapSummary(map: CourseMap | null): string {
  if (!map) return "(the course map is unavailable right now: use get_week_plan and search_course)";
  const lines: string[] = [];
  for (const w of map.weeks) {
    if (unreleased(w.key)) continue;
    const ls = w.lessons.filter((l) => !unreleased(l.week)).map((l) => short(l.title));
    const extra = [w.boss ? "a capstone (boss)" : "", w.trial ? `a ${w.trial.parts.length}-part MCQ trial` : ""].filter(Boolean).join(", ");
    lines.push(`W${w.code} ${w.title} (~${Math.round(w.minutes / 60)} h): ${ls.join("; ")}${extra ? `; plus ${extra}` : ""}`);
  }
  const quests = map.sideQuests.filter((q) => !unreleased(q.week));
  lines.push(`Side quests (${quests.length}, how real products are built): ${quests.map((q) => short(q.title.replace(/^Side quest\s*\d*\s*[:·-]\s*/i, ""), 36)).join("; ")}`);
  const n = (x?: unknown[]) => x?.length ?? 0;
  lines.push(`Also: ${n(map.problems)} classic interview problems, ${n(map.lld)} low-level design (machine coding) rounds, ${n(map.mocks)} mock interviews.`);
  return lines.join("\n");
}
