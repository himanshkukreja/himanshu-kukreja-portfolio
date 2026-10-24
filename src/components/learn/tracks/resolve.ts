import type { CourseLesson, CourseMap } from "@/lib/learn/types";
import type { Track } from "@/lib/learn/tracks";

export type ResolvedItem = { lesson: CourseLesson; why: string };

/** Map a track's "<folder>/<slug>" keys to course lessons; anything not published yet is skipped. */
export function resolveTrack(map: CourseMap, t: Track): { items: ResolvedItem[]; mock: { title: string; company: string; href: string } | null } {
  const all = [
    ...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]),
    ...map.sideQuests,
    ...(map.problems || []),
    ...(map.lld || []),
  ];
  const byKey = new Map(all.map((l) => [`${l.week}/${l.slug}`, l]));
  const items = t.items.flatMap((i) => {
    const lesson = byKey.get(i.key);
    return lesson ? [{ lesson, why: i.why }] : [];
  });
  const m = t.mock ? (map.mocks || []).find((x) => x.slug === t.mock) : null;
  return { items, mock: m ? { title: m.title, company: m.company, href: m.href } : null };
}
