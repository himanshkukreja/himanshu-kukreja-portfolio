/**
 * End-of-article references to the course → their pages. Side quests close with "Related systems to
 * study" ("**UPI (Bonus Problem 1)**: …") and "Foundational concepts (this course)" ("Week 1, Day 3 —
 * Rate Limiting at Scale"); the renderer (resources lists, src/lib/course/detect/blocks.ts) links the
 * entries this resolves. Codes go through the mock loader's resolveStudy, so only lessons in the course
 * map resolve: a hidden or scheduled side quest, a week that isn't live, or an entry naming two pages
 * stays static rather than becoming a broken link.
 */
import type { CourseRef, CourseRefResolver } from "@/lib/course/types";
import { resolveStudy, type MockCtx } from "./mock/load";

/** "Week 1, Day 3 — …" → "W1-D3"; "Week 0, Part 3 — …" → "W0-P3"; "Week 2, Capstone — …" → "W2-B". */
function lessonCode(t: string): string | null {
  const m = t.match(/^Week\s+(\d{1,2}),?\s+(?:(Day|Part)\s+(\d{1,2})|(Capstone|Boss))\b/i);
  if (!m) return null;
  return m[4] ? `W${m[1]}-B` : `W${m[1]}-${m[2][0].toUpperCase()}${m[3]}`;
}

/** Exactly one distinct "Bonus Problem N" → "SQ-N". */
function questCode(t: string): string | null {
  const ns = new Set(Array.from(t.matchAll(/\bBonus Problem\s+(\d{1,2})\b/gi), (m) => parseInt(m[1], 10)));
  return ns.size === 1 ? `SQ-${[...ns][0]}` : null;
}

/** "the course's Week 9 capstone" → "W9-B", only when the entry names no other week. */
function bossCode(t: string): string | null {
  const m = t.match(/\bWeek\s+(\d{1,2})(?:'s)?\s+(?:capstone|boss)\b/i);
  if (!m) return null;
  const weeks = new Set(Array.from(t.matchAll(/\bWeek\s+(\d{1,2})\b/gi), (x) => parseInt(x[1], 10)));
  return weeks.size === 1 ? `W${m[1]}-B` : null;
}

export function courseRefResolver(ctx: MockCtx): CourseRefResolver {
  return (entry) => {
    const t = entry.replace(/\s+/g, " ").trim();
    const code = lessonCode(t) ?? questCode(t) ?? bossCode(t);
    if (!code) return null;
    const ref = resolveStudy(code, ctx);
    if (!ref) return null;
    const kind: CourseRef["kind"] = code.startsWith("SQ") ? "quest" : code.endsWith("-B") ? "boss" : "lesson";
    return { href: ref.href, title: ref.title, kind };
  };
}
