import "server-only";
/**
 * Dev QA fixtures for Share my progress (only read when NODE_ENV !== "production" and
 * SHARE_FIXTURES=1; see ./store.ts). Two learners built against the real course map:
 *   fx-grace  already shares as /u/grace-h (three worlds cleared, an Arena regular)
 *   fx-ada    signs in during QA and turns sharing on herself
 */
import type { CourseMap } from "@/lib/learn/types";
import { addDays, istDate } from "@/lib/learn/arena/shared";
import type { Raw, RawRow } from "./stats";

const DAY = 86_400_000;

function build(map: CourseMap, o: { name: string; worlds: number; partial: number; xp: number; streak: number; arena: Raw["arena"]; dailies: number; badges: string[] }): Raw {
  const now = Date.now();
  const rows: RawRow[] = [];
  const done: Record<string, number> = {};
  let t = now - 40 * DAY;
  map.weeks.slice(0, o.worlds + 1).forEach((w, wi) => {
    const full = wi < o.worlds;
    const lessons = full ? w.lessons : w.lessons.slice(0, o.partial);
    lessons.forEach((l) => {
      t += DAY / 2;
      rows.push({ week: l.week, lesson_slug: l.slug, status: "completed", progress_percentage: 100, completed_at: new Date(t).toISOString() });
      done[`lesson:${l.week}/${l.slug}`] = t;
    });
    if (full && w.boss) {
      t += DAY / 3;
      rows.push({ week: w.boss.week, lesson_slug: w.boss.slug, status: "completed", progress_percentage: 100, completed_at: new Date(t).toISOString() });
      done[`boss:${w.key}`] = t;
    }
    if (full && w.trial) w.trial.parts.forEach((p) => (done[`trial:${w.trial!.week}/part-${p.n}`] = t += 3_600_000));
    if (full) done[`world:${w.key}`] = t += 3_600_000;
    if (!full && w.lessons[o.partial]) rows.push({ week: w.lessons[o.partial].week, lesson_slug: w.lessons[o.partial].slug, status: "in_progress", progress_percentage: 40 });
  });
  o.badges.forEach((b, i) => (done[b] = now - (i + 2) * DAY));
  const today = istDate(now);
  return {
    profile: { full_name: o.name, avatar_url: null, created_at: new Date(now - 60 * DAY).toISOString(), xp: o.xp, game_done: done, longest_streak: o.streak + 3 },
    rows,
    streakDays: Array.from({ length: o.streak }, (_, i) => addDays(today, -i)),
    trialsPassed: new Set(),
    dailies: Array.from({ length: o.dailies }, (_, i) => ({ date: addDays(today, -i), correct: i === 1 ? 5 : 4, total: 5, score: i === 1 ? 742 : 560 - i * 10, at: now - i * DAY })),
    arena: o.arena,
  };
}

export function fixtureRaw(userId: string, map: CourseMap): Raw | null {
  if (userId === "fx-grace")
    return build(map, {
      name: "Grace Hopper",
      worlds: 3,
      partial: 2,
      xp: 640,
      streak: 12,
      arena: { tier: 2, rank: 3, leaguePlayers: 18, weekPoints: 236, allTime: 1840, globalRank: 9, dailyStreak: 6 },
      dailies: 6,
      badges: ["quiz:ace", "arena:streak7", "read"],
    });
  if (userId === "fx-ada")
    return build(map, {
      name: "Ada Lovelace",
      worlds: 1,
      partial: 3,
      xp: 340,
      streak: 4,
      arena: { tier: 1, rank: 5, leaguePlayers: 22, weekPoints: 118, allTime: 420, globalRank: 31, dailyStreak: 3 },
      dailies: 3,
      badges: ["quiz:ace"],
    });
  return null;
}
