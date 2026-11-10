/**
 * The problem-sheet export rows (src/lib/dsa/sheet-export.ts) and the CSV writer (sheet-file.ts).
 *   node --test scripts/tests/dsa-sheet-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const { buildSheet, COLUMNS, defaultColumns, describeFilters, exportFileName, orderColumns } = await import("../../src/lib/dsa/sheet-export.ts");
const { emptyState, evaluate, toggle } = await import("../../src/lib/dsa/problem-filters.ts");
const { toCsv } = await import("../../src/lib/dsa/sheet-file.ts");

const row = (id, o = {}) => ({
  id, title: `Problem ${id}`, seq: 1000, order: 1, concept: "c", module: "m1", level: "easy", rating: 3, minutes: 10, kind: "practice",
  structures: ["array"], algorithms: [], patterns: [], companies: [], video: false, twin: "", tags: [], text: id, ...o,
});
const rows = [
  row("a", { seq: 2000, level: "hard", rating: 8, video: true, twin: "LC 1", module: "m2", structures: ["hash"], minutes: 30 }),
  row("b", { seq: 1000, order: 2 }),
  row("c", { seq: 1000, order: 1, level: "medium", rating: 5, structures: [] }),
];
const ctx = { origin: "https://x.dev", stepLabel: (m) => (m === "m1" ? "1.1 Arrays" : "2.2 Hashing"), statusOf: (id) => (id === "a" ? "solved" : id === "b" ? "tried" : "todo"), solvedAt: (id) => (id === "a" ? Date.UTC(2026, 10, 3) : null) };

test("columns come in the fixed order whatever the pick order", () => {
  assert.deepEqual(orderColumns(["status", "problem", "num"]), ["num", "problem", "status"]);
  assert.deepEqual(orderColumns([]), ["problem"]);
  assert.ok(defaultColumns().includes("problem") && !defaultColumns().includes("revise"));
});

test("course order: a step header per step, a running number, counts add up", () => {
  const s = buildSheet(rows, { columns: defaultColumns(), groupBy: "course" }, ctx);
  assert.deepEqual(s.sections.map((x) => x.title), ["1.1 Arrays", "2.2 Hashing"]);
  assert.deepEqual(s.sections.map((x) => x.rows.length), [2, 1]);
  assert.equal(s.count, 3);
  assert.deepEqual(s.sections.flatMap((x) => x.rows.map((r) => r[0].text)), ["1", "2", "3"]);
  assert.equal(s.sections[0].rows[0][1].text, "Problem c");
  assert.equal(s.header.length, s.columns.length);
});

test("links are absolute; video is a dash when not published; the editorial opens its tab", () => {
  const s = buildSheet(rows, { columns: ["problem", "video", "editorial"], groupBy: "flat" }, ctx);
  const byTitle = Object.fromEntries(s.sections[0].rows.map((r) => [r[0].text, r]));
  assert.equal(byTitle["Problem a"][0].link, "https://x.dev/dsa/problems/a");
  assert.equal(byTitle["Problem a"][1].link, "https://x.dev/dsa/problems/a?tab=editorial#solution-video");
  assert.deepEqual(byTitle["Problem b"][1], { text: "—" });
  assert.equal(byTitle["Problem b"][2].link, "https://x.dev/dsa/problems/b?tab=editorial");
  assert.equal(s.sections[0].title, null);
});

test("difficulty grouping, topic grouping with Other last, status and solved date", () => {
  const lv = buildSheet(rows, { columns: ["level"], groupBy: "level" }, ctx);
  assert.deepEqual(lv.sections.map((x) => x.title), ["Easy", "Medium", "Hard"]);
  assert.equal(lv.sections[0].rows[0][0].level, "easy");
  const tp = buildSheet(rows, { columns: ["topic"], groupBy: "topic" }, ctx);
  assert.equal(tp.sections.at(-1).title, "Other");
  const st = buildSheet(rows, { columns: ["problem", "time", "twin", "status", "solved", "notes"], groupBy: "flat" }, ctx);
  const a = st.sections[0].rows.find((r) => r[0].text === "Problem a");
  assert.deepEqual(a.slice(1).map((c) => c.text), ["30 min", "LC 1", "Solved", "2026-11-03", ""]);
  const b = st.sections[0].rows.find((r) => r[0].text === "Problem b");
  assert.equal(b[3].text, "Tried");
  assert.equal(b[4].text, "");
});

test("the export count equals the filtered rows", () => {
  const s = toggle(emptyState(), "level", "easy");
  const e = evaluate(rows, s, ctx.statusOf);
  assert.equal(e.total, 1);
  assert.equal(buildSheet(e.results, { columns: ["problem"], groupBy: "course" }, ctx).count, 1);
  assert.equal(buildSheet(rows, { columns: ["problem"], groupBy: "course" }, ctx).count, rows.length);
});

test("CSV: BOM, quoting, and a link column beside each linked column", () => {
  const s = buildSheet([row("q", { title: 'Say "hi", ok' })], { columns: ["problem", "level"], groupBy: "flat" }, ctx);
  const csv = toCsv(s);
  assert.ok(csv.startsWith("﻿Problem,Problem link,Difficulty"));
  assert.ok(csv.includes('"Say ""hi"", ok",https://x.dev/dsa/problems/q,Easy'));
});

test("describing the filters and naming the file", () => {
  const s = toggle(toggle({ ...emptyState(), q: "two sum" }, "level", "easy"), "level", "hard");
  assert.equal(describeFilters(s, () => "Difficulty", (g, v) => v), "Search: “two sum” · Difficulty: easy, hard");
  assert.match(exportFileName("xlsx", new Date(Date.UTC(2026, 10, 10))), /^dsa-mastery-sheet-2026-11-10\.xlsx$/);
  assert.equal(COLUMNS.length, 16);
});
