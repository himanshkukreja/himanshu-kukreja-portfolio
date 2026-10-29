/**
 * Dev QA sample events for /admin/course/dropoff (NODE_ENV !== "production" AND DROPOFF_FIXTURES=1, see
 * ./report.ts). Built on the real lessons and their real section ids, then run through the real aggregation.
 * Deterministic (seeded), so screenshots and the check script are stable.
 */
import type { RawRow, SectionRef } from "./aggregate";

export const dropoffFixtures = () => process.env.NODE_ENV !== "production" && process.env.DROPOFF_FIXTURES === "1";

/** mulberry32 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** readers per sampled lesson, in course order (a few big, a few under the sample-size line) */
const SIZES = [240, 150, 96, 64, 44, 31, 22, 15, 9, 5];

/**
 * Sample rows for `lessons` (each with its sections), spread over the last `days` days before `now`: per lesson
 * one "cliff" section that loses about half its readers, a gentle leak elsewhere, some resumed visits, some
 * signed-in readers whose browser was a guest first, and stage_done / lesson_complete for the careful ones.
 */
export function sampleRows(lessons: { week: string; slug: string; sections: SectionRef[] }[], days: number, now = Date.now(), course = "system-design-mastery"): RawRow[] {
  const rows: RawRow[] = [];
  const from = now - Math.min(days, 90) * 86_400_000;
  lessons.forEach((l, li) => {
    const n = l.sections.length;
    if (!n) return;
    const r = rng(1000 + li * 7919);
    // always the whole 90-day pool (same draws for every window), cut to the window at the end
    const readers = Math.round((SIZES[li % SIZES.length] ?? 10) * (li < SIZES.length ? 1 : 0.4));
    const cliff = n > 2 ? 1 + Math.floor(r() * (n - 2)) : -1;
    for (let k = 0; k < readers; k++) {
      const start = now - Math.floor(r() * 90 * 86_400_000);
      const vid = `fx-${li}-${k}-vid`;
      const user = k % 3 === 0 ? `fx-user-${li}-${k}` : null;
      const pv = `fxpv${li}x${k}`;
      const base = { course, week: l.week, lesson: l.slug };
      const push = (name: string, at: number, extra: Record<string, unknown>, signedIn = !!user) =>
        rows.push({ visitor_id: vid, user_id: signedIn ? user : null, created_at: new Date(at).toISOString(), metadata: { name, ...base, ...extra, pv } });
      // one in eight resumes mid-lesson (opened at a later section)
      const resumeAt = n > 3 && r() < 0.125 ? 1 + Math.floor(r() * Math.min(3, n - 2)) : 0;
      // the first visit of a signed-in reader starts as a guest on the same browser
      push("lesson_open", start, { stage: l.sections[resumeAt].id }, !(user && k % 2 === 0));
      let t = start;
      let i = resumeAt;
      let careful = r() < 0.55;
      while (i + 1 < n) {
        const keep = i + 1 === cliff ? 0.48 : i === 0 ? 0.82 : 0.9;
        if (r() > keep) break;
        const mins = l.sections[i].minutes ?? 4;
        t += Math.round((careful ? 0.7 + r() * 0.8 : 0.15 + r() * 0.3) * mins * 60_000 + 20_000);
        if (careful && r() < 0.85) push("stage_done", t - 5_000, { stage: l.sections[i].id, index: i, total: n });
        i++;
        push("stage_reach", t, { stage: l.sections[i].id, index: i, total: n });
        if (r() < 0.05) careful = !careful;
      }
      if (i === n - 1 && careful) {
        push("stage_done", t + 60_000, { stage: l.sections[i].id, index: i, total: n });
        push("lesson_complete", t + 61_000, { minutes: Math.round((t - start) / 60_000) });
      }
    }
    // an event from a heading that was renamed since (counted as unmatched, not as a section)
    if (li === 0) rows.push({ visitor_id: "fx-old", user_id: null, created_at: new Date(now - 3_600_000).toISOString(), metadata: { name: "stage_reach", course, week: l.week, lesson: l.slug, stage: "old-heading", index: n + 3, total: n + 4, pv: "fxpvold" } });
  });
  return rows.filter((x) => Date.parse(x.created_at) >= from);
}
