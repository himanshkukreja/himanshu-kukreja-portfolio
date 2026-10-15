import { getCourseMap } from "@/lib/learn/course";
import { formatWeekTopic } from "@/lib/github";

export type LessonOg = { title: string; tag: string; world: string; worldNum: number; minutes: number; boss: boolean };

const humanize = (slug: string) =>
  slug
    .replace(/^(day|bonus)-\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Title + context for a lesson's share card. Never throws: falls back to the slug. */
export async function lessonOg(course: string, week: string, slug: string): Promise<LessonOg> {
  const n = parseInt(week.match(/week-(\d+)/)?.[1] ?? "-1", 10);
  const fallback: LessonOg = {
    title: humanize(slug),
    tag: n >= 0 ? `W${String(n).padStart(2, "0")}` : "LESSON",
    world: n >= 0 ? formatWeekTopic(week) : "System Design Mastery",
    worldNum: n,
    minutes: 0,
    boss: false,
  };
  try {
    const map = await getCourseMap(course);
    if (!map) return fallback;
    const w = map.weeks.find((x) => x.key === week);
    const all = [...map.weeks.flatMap((x) => [...x.lessons, ...(x.boss ? [x.boss] : [])]), ...map.sideQuests, ...(map.plan ? [map.plan] : [])];
    const l = all.find((x) => x.week === week && x.slug === slug);
    if (l) {
      return {
        title: l.title,
        tag: l.tag,
        world: l.kind === "bonus" ? "Side quest" : w?.title || fallback.world,
        worldNum: l.kind === "bonus" || l.kind === "overview" ? -1 : n,
        minutes: l.minutes,
        boss: l.kind === "capstone",
      };
    }
    if (w?.trial && w.trial.slug === slug) {
      return { ...fallback, title: w.trial.title, tag: `W${w.code} · TRIAL`, world: w.title };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
