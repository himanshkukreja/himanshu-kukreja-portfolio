/**
 * Section drop-off (/admin/course/dropoff) guarantees, checked on fixture events without a network:
 *   npx tsx scripts/dropoff-check.ts
 * - one reader per person: a guest browser that signs in is merged into the user; another course's rows,
 *   unknown event names and rows without a lesson are dropped;
 * - reached is the furthest section per reader (any visit), so it never rises down the lesson; section 1 is
 *   every starter, the "stopped here" counts add up to the starters and the last one is the finishers;
 * - drop = readers lost since the section above; only drops whose section above had MIN_READERS+ readers are
 *   judged (worst; up to 3 highlighted, each >= 10% and >= half the worst), small sections are flagged lowSample;
 * - time to reach comes only from visits that opened at the top, matched by page view, median, not mean;
 * - a renamed heading's events are "unmatched", the recorded index is trusted only when the section count
 *   still matches; lesson_complete is counted separately;
 * - the seeded sample data is deterministic and keeps every invariant on real lesson shapes;
 * - with SDM_LOCAL_DIR set: the summary's line-based section ids equal the reader's rendered stage ids.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { aggregateLesson, byLesson, MIN_READERS, toEvents, type RawRow, type SectionRef } from "@/lib/admin/dropoff/aggregate";
import { sampleRows } from "@/lib/admin/dropoff/fixtures";

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

const C = "system-design-mastery";
const W = "week-01-x";
const L = "day-01-y";
const T0 = Date.parse("2026-10-20T10:00:00Z");
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const sections: SectionRef[] = ["intro", "part-1", "part-2", "part-3", "exercises"].map((id) => ({ id, title: id.toUpperCase() }));

function row(vid: string | null, uid: string | null, sec: number, name: string, m: Record<string, unknown> = {}): RawRow {
  return { visitor_id: vid, user_id: uid, created_at: iso(sec), metadata: { name, course: C, week: W, lesson: L, ...m } };
}
/** a reader who opens at the top (pv) and reaches sections 1..upTo, `step` seconds apart */
function reader(vid: string, upTo: number, step = 60, pv = `pv-${vid}`, uid: string | null = null): RawRow[] {
  const out = [row(vid, uid, 0, "lesson_open", { stage: "intro", pv })];
  for (let i = 1; i <= upTo; i++) out.push(row(vid, uid, i * step, "stage_reach", { stage: sections[i].id, index: i, total: sections.length, pv }));
  return out;
}

async function main() {
await ok("toEvents: guest browser that signs in is one reader; other course / bad rows dropped", () => {
  const rows: RawRow[] = [
    row("b1", null, 0, "lesson_open", { stage: "intro", pv: "p1" }),
    row("b1", "u1", 30, "stage_reach", { stage: "part-1", index: 1, total: 5, pv: "p1" }),
    row("b2", null, 0, "lesson_open", { stage: "intro", pv: "p2" }),
    { visitor_id: "b3", user_id: null, created_at: iso(0), metadata: { name: "lesson_open", course: "other-course", week: W, lesson: L, stage: "intro" } },
    { visitor_id: "b4", user_id: null, created_at: iso(0), metadata: { name: "page_scroll", course: C, week: W, lesson: L } },
    { visitor_id: "b5", user_id: null, created_at: iso(0), metadata: { name: "stage_reach", course: C, week: "", lesson: L, stage: "part-1" } },
    { visitor_id: null, user_id: null, created_at: iso(0), metadata: { name: "lesson_open", course: C, week: W, lesson: L } },
  ];
  const ev = toEvents(rows, C);
  assert.equal(ev.length, 3);
  assert.deepEqual([...new Set(ev.map((e) => e.reader))].sort(), ["u:u1", "v:b2"]);
  const agg = aggregateLesson(W, L, ev, sections);
  assert.equal(agg.starters, 2);
  assert.deepEqual(
    agg.sections.map((s) => s.reached),
    [2, 1, 0, 0, 0],
  );
});

await ok("funnel: furthest per reader across visits; reached never rises; stopped sums to starters", () => {
  const rows: RawRow[] = [
    ...reader("a", 4), // finished
    ...reader("b", 2),
    ...reader("c", 0), // opened, never scrolled
    // d: two visits; the second resumes at part-2 and goes on to part-3
    ...reader("d", 1, 60, "pv-d1"),
    row("d", null, 5000, "lesson_open", { stage: "part-2", pv: "pv-d2" }),
    row("d", null, 5100, "stage_reach", { stage: "part-3", index: 3, total: 5, pv: "pv-d2" }),
  ];
  const agg = aggregateLesson(W, L, toEvents(rows, C), sections);
  assert.equal(agg.starters, 4);
  assert.deepEqual(
    agg.sections.map((s) => s.reached),
    [4, 3, 3, 2, 1],
  );
  assert.deepEqual(
    agg.sections.map((s) => s.stopped),
    [1, 0, 1, 1, 1],
  );
  assert.equal(
    agg.sections.reduce((a, s) => a + s.stopped, 0),
    agg.starters,
  );
  assert.equal(agg.finished, 1);
  assert.equal(agg.completion, 0.25);
  assert.deepEqual(
    agg.sections.map((s) => s.drop),
    [null, 1, 0, 1, 1],
  );
  assert.equal(agg.sections[1].dropShare, 0.25);
  assert.equal(agg.sections[0].pct, 1);
  // under MIN_READERS everywhere: nothing judged, all low-sample
  assert.equal(agg.worst, null);
  assert.ok(agg.sections.every((s) => s.lowSample && !s.highlight));
});

await ok("time to reach: only visits that opened at the top, same page view, median", () => {
  const rows: RawRow[] = [
    ...reader("a", 2, 60), // part-1 at 60 s, part-2 at 120 s
    ...reader("b", 2, 100), // 100, 200
    ...reader("c", 2, 1000), // 1000, 2000 (slow outlier; the median ignores it)
    // resumed visit at part-1, reaches part-2 10 s later: not timed
    row("d", null, 0, "lesson_open", { stage: "part-1", pv: "pv-d" }),
    row("d", null, 10, "stage_reach", { stage: "part-2", index: 2, total: 5, pv: "pv-d" }),
    // reach without a page view id: not timed (but still reached)
    row("e", null, 0, "lesson_open", { stage: "intro" }),
    row("e", null, 5, "stage_reach", { stage: "part-1", index: 1, total: 5 }),
    // a tab left open five hours: not a reading time
    ...reader("f", 1, 5 * 3600),
  ];
  const agg = aggregateLesson(W, L, toEvents(rows, C), sections);
  assert.equal(agg.sections[1].timed, 3);
  assert.equal(agg.sections[1].medianSec, 100);
  assert.equal(agg.sections[2].timed, 3);
  assert.equal(agg.sections[2].medianSec, 200);
  assert.equal(agg.sections[0].medianSec, null);
  assert.equal(agg.sections[2].reached, 4); // a, b, c, d
});

await ok("judging: drops are highlighted only from a section with MIN_READERS+; worst is the largest share", () => {
  const rows: RawRow[] = [];
  // 40 starters: 36 reach part-1, 12 reach part-2 (cliff), 11 part-3, 4 exercises
  for (let k = 0; k < 40; k++) {
    const upTo = k < 4 ? 0 : k < 28 ? 1 : k < 29 ? 2 : k < 36 ? 3 : 4;
    rows.push(...reader(`r${k}`, upTo));
  }
  const agg = aggregateLesson(W, L, toEvents(rows, C), sections);
  assert.deepEqual(
    agg.sections.map((s) => s.reached),
    [40, 36, 12, 11, 4],
  );
  assert.equal(agg.worst?.id, "part-2");
  assert.equal(agg.worst?.lost, 24);
  assert.equal(agg.worst?.from, 36);
  assert.ok(Math.abs((agg.worst?.share ?? 0) - 24 / 36) < 1e-9);
  // part-1 (−10%, from 40) and part-2 (−67%, from 36) are judged; part-3 / exercises come from <20 readers.
  // Only part-2 is marked: part-1's −10% is under half the worst drop.
  assert.deepEqual(
    agg.sections.map((s) => s.highlight),
    [false, false, true, false, false],
  );
  // two comparable drops are both marked
  const rows2: RawRow[] = [];
  for (let k = 0; k < 100; k++) rows2.push(...reader(`q${k}`, k < 40 ? 0 : k < 70 ? 1 : 4)); // 100 → 60 (−40%) → 30 (−50%)
  const agg2 = aggregateLesson(W, L, toEvents(rows2, C), sections);
  assert.deepEqual(
    agg2.sections.map((s) => s.highlight),
    [false, true, true, false, false],
  );
  assert.equal(agg2.worst?.id, "part-2");
  assert.deepEqual(
    agg.sections.map((s) => s.lowSample),
    [false, false, true, true, true],
  );
  assert.ok(MIN_READERS === 20);
});

await ok("renamed headings are unmatched; the recorded index is used only when the section count still matches", () => {
  const rows: RawRow[] = [
    ...reader("a", 0),
    row("a", null, 10, "stage_reach", { stage: "old-part", index: 2, total: 5, pv: "pv-a" }), // same count: index 2 trusted
    ...reader("b", 0),
    row("b", null, 10, "stage_reach", { stage: "older-part", index: 3, total: 7, pv: "pv-b" }), // count changed: unmatched
    row("b", null, 20, "stage_done", { stage: "intro", index: 0, total: 5, pv: "pv-b" }),
    row("b", null, 30, "lesson_complete", { minutes: 12, pv: "pv-b" }),
  ];
  const agg = aggregateLesson(W, L, toEvents(rows, C), sections);
  assert.equal(agg.unmatched, 1);
  assert.deepEqual(
    agg.sections.map((s) => s.reached),
    [2, 1, 1, 0, 0],
  );
  assert.equal(agg.sections[0].read, 1);
  assert.equal(agg.completed, 1);
});

await ok("sample data: deterministic, every invariant holds, windows nest", () => {
  const lessons = [
    { week: "w1", slug: "a", sections: sections.map((s) => ({ ...s, minutes: 5 })) },
    { week: "w1", slug: "b", sections: sections.slice(0, 3) },
    { week: "w2", slug: "c", sections: [{ id: "lesson", title: "Lesson" }] },
  ];
  const now = Date.parse("2026-10-30T00:00:00Z");
  const a = sampleRows(lessons, 90, now, C);
  const b = sampleRows(lessons, 90, now, C);
  assert.deepEqual(a, b);
  const starters = (days: number) => {
    const g = byLesson(toEvents(sampleRows(lessons, days, now, C), C));
    return lessons.map((l) => {
      const agg = aggregateLesson(l.week, l.slug, g.get(`${l.week}/${l.slug}`) ?? [], l.sections);
      for (let i = 1; i < agg.sections.length; i++) assert.ok(agg.sections[i].reached <= agg.sections[i - 1].reached);
      if (agg.starters) {
        assert.equal(agg.sections[0].reached, agg.starters);
        assert.equal(
          agg.sections.reduce((x, s) => x + s.stopped, 0),
          agg.starters,
        );
        assert.equal(agg.sections.at(-1)!.reached, agg.finished);
      }
      for (const s of agg.sections) {
        assert.ok(s.read <= agg.starters);
        assert.equal(s.lowSample, s.reached < MIN_READERS);
      }
      return agg.starters;
    });
  };
  const s7 = starters(7);
  const s30 = starters(30);
  const s90 = starters(90);
  s7.forEach((x, i) => assert.ok(x <= s30[i] && s30[i] <= s90[i]));
  assert.ok(s90[0] > MIN_READERS);
});

// ------------------------------------------------------------------ real lessons (needs SDM_LOCAL_DIR)

const dir = process.env.SDM_LOCAL_DIR;
if (dir) {
  const { lessonSections } = await import("@/lib/search/smart/sections");
  const { renderLesson } = await import("@/lib/course/render");
  type Kind = Parameters<typeof lessonSections>[1];
  const files: [string, Kind][] = [
    ["week-00-foundations/foundations-part-1-basic-concepts.md", "foundations"],
    ["week-00-foundations/foundations-part-8-databases-in-depth.md", "foundations"],
    ["week-06-designing-notification-platform/day-02-core-notification-flow.md", "day-content"],
    ["week-06-designing-notification-platform/capstone-interview-week-6-food-delivery-system.md", "capstone"],
    ["week-06-designing-notification-platform/week-06-preview.md", "week-preview"],
    ["bonus-problems/bonus-14-chatgpt-llm-serving.md", "bonus"],
  ];
  await ok(`real lessons: line-based section ids equal the rendered stage ids (${files.length} lessons)`, async () => {
    for (const [f, kind] of files) {
      const md: string = await readFile(resolve(dir, "resources", f), "utf8");
      const lines = lessonSections(md, kind)
        .sections.filter((s) => s.depth === 1 && s.id === s.stage)
        .map((s) => s.id);
      const rendered: string[] = (await renderLesson(md, { kind })).stages.map((s) => s.id);
      assert.deepEqual(lines, rendered, f);
      assert.ok(rendered.length >= 1, f);
    }
  });
} else console.log("# SDM_LOCAL_DIR not set: skipped the real-lesson section id check");

console.log(`\n${n} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
