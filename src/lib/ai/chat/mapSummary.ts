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
  const pats = (map.lld ?? []).filter((l) => l.slug.startsWith("dp-"));
  const cases = (map.lld ?? []).filter((l) => !l.slug.startsWith("dp-"));
  lines.push(`Also: ${n(map.problems)} classic interview problems, ${n(map.mocks)} mock interviews.`);
  // the low-level design track (lld tab, /low-level-design): its own track beside the weeks, own progress and XP
  if (pats.length || cases.length)
    lines.push(
      `Low-level design track (its own "lld" tab, /low-level-design, beside the 12-week course; earns XP, own progress, not in the course %; a 6-minute intro lecture opens it): ${pats.length} design-pattern lessons in five parts (Foundations DP-01–05: OOP and composition, UML, SOLID, coupling and cohesion; Creational 06–09; Structural 10–15; Behavioural 16–24; In practice 25–28: concurrency patterns, anti-patterns, choosing patterns in an interview, the pattern map), each with code in Python, Java, C++ and JavaScript, a class diagram, look-alikes, when not to use it, a lecture, clips, quiz, FAQ and a refactoring lab; then ${cases.length} case-study rounds (${cases.slice(0, 6).map((l) => short(l.title.replace(/^Design (an? )?/i, ""), 28)).join(", ")}…) taught as a 7-step interview walkthrough (requirements, entities, class diagram, patterns, code, concurrency, follow-ups) with a "Try it first" toggle and a pattern map. Recommended order: patterns first, then case studies.`,
    );
  return lines.join("\n");
}
