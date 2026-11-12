/**
 * One learner memory for both courses (src/lib/ai/chat/memory-model.ts): DSA Mastery's items carry the "[dsa] " tag and
 * DSA sessions `course: "dsa"`; the course chat's update never drops or rewrites them, DSA's update never touches the
 * course chat's, each course keeps its own caps, and the memory page can forget one item.
 *   node --test scripts/tests/learner-memory.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported module.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cleanMemory, dsaNotes, DSA_MEMORY_LIMITS, emptyMemory, memoryLines, mergeDsaMemory, mergeMemory, MEMORY_LIMITS, removeMemoryItem, sdmNotes } from "../../src/lib/ai/chat/memory-model.ts";

const day = new Date("2026-11-12T10:00:00Z");
const both = () =>
  cleanMemory({
    goals: ["Amazon SDE-2 in December"],
    level: "3 years backend",
    prefs: ["short answers"],
    studied: ["cache invalidation", "[dsa] sliding windows"],
    struggles: ["consistent hashing", "[dsa] variable windows: when to move left"],
    mistakes: ["off-by-one on a window's start index"],
    sessions: [
      { at: "2026-11-10", chat: "sdmchat01", summary: "Caching: write-through vs write-back" },
      { at: "2026-11-11", chat: "dsachat01", summary: "Busiest launch stretch: fixed the >= tie", course: "dsa" },
    ],
  });

test("cleanMemory keeps DSA items tagged and mistakes tagged", () => {
  const m = both();
  assert.deepEqual(m.studied, ["cache invalidation", "[dsa] sliding windows"]);
  assert.deepEqual(m.mistakes, ["[dsa] off-by-one on a window's start index"]);
  assert.equal(m.sessions.filter((s) => s.course === "dsa").length, 1);
});

test("the course chat sees and rewrites only its own items", () => {
  const m = both();
  const lines = memoryLines(m).join("\n");
  assert.ok(lines.includes("cache invalidation") && !lines.includes("sliding windows") && !lines.includes("fixed the >= tie"));
  assert.deepEqual(sdmNotes(m).mistakes, []);
  const next = mergeMemory(m, { studied: ["load balancing"], struggles: [], session: "Load balancers" }, "sdmchat02", day);
  assert.deepEqual(next.studied, ["load balancing", "[dsa] sliding windows"]);
  assert.deepEqual(next.struggles, ["[dsa] variable windows: when to move left"]);
  assert.deepEqual(next.mistakes, m.mistakes);
  assert.equal(next.sessions.filter((s) => s.course === "dsa").length, 1);
  assert.equal(next.sessions[0].summary, "Load balancers");
});

test("a model echoing a tag can't write a DSA item through the course chat", () => {
  const next = mergeMemory(both(), { studied: ["[dsa] heaps"] }, "sdmchat03", day);
  assert.ok(next.studied.includes("heaps") && !next.studied.includes("[dsa] heaps"));
});

test("DSA's update rewrites its items and the shared lines, never the course chat's", () => {
  const m = both();
  const next = mergeDsaMemory(m, { level: "new to DSA", prefs: ["code first"], struggles: ["binary search bounds"], mistakes: ["forgets k > n"], session: "Lower bound practice: lo <= hi" }, "dsachat02", day);
  assert.equal(next.level, "new to DSA");
  assert.deepEqual(next.prefs, ["code first"]);
  assert.deepEqual(next.struggles, ["consistent hashing", "[dsa] binary search bounds"]);
  assert.deepEqual(next.studied, m.studied);
  assert.deepEqual(next.mistakes, ["[dsa] forgets k ＞ n"]);
  assert.deepEqual(next.goals, m.goals);
  assert.deepEqual(
    next.sessions.map((s) => [s.course ?? "sdm", s.summary]),
    [
      ["sdm", "Caching: write-through vs write-back"],
      ["dsa", "Lower bound practice: lo ≤ hi"],
      ["dsa", m.sessions[1].summary],
    ],
  );
  const n = dsaNotes(next);
  assert.deepEqual(n.struggles, ["binary search bounds"]);
  assert.deepEqual(n.mistakes, ["forgets k ＞ n"]);
});

test("each course keeps its own caps", () => {
  const many = (p, n) => Array.from({ length: n }, (_, i) => `${p}topic ${i}`);
  const m = cleanMemory({ struggles: [...many("", 20), ...many("[dsa] ", 20)], sessions: Array.from({ length: 20 }, (_, i) => ({ at: "2026-11-01", chat: `chat${i}x`, summary: `s${i}`, course: i % 2 ? "dsa" : undefined })) });
  assert.equal(m.struggles.filter((x) => !x.startsWith("[dsa] ")).length, MEMORY_LIMITS.struggles);
  assert.equal(m.struggles.filter((x) => x.startsWith("[dsa] ")).length, DSA_MEMORY_LIMITS.struggles);
  assert.equal(m.sessions.filter((s) => s.course === "dsa").length, DSA_MEMORY_LIMITS.sessions);
  assert.equal(m.sessions.filter((s) => s.course !== "dsa").length, MEMORY_LIMITS.sessions);
});

test("DSA notes are scrubbed like the course chat's", () => {
  const next = mergeDsaMemory(emptyMemory(), { mistakes: ["mail me at a@b.com about https://x.io overflow"], session: "call +91 98765 43210" }, "dsachat03", day);
  assert.ok(!/@|https?:|98765/.test(JSON.stringify(next)));
});

test("the memory page forgets one item", () => {
  const m = both();
  assert.deepEqual(removeMemoryItem(m, "struggles", "[dsa] variable windows: when to move left").struggles, ["consistent hashing"]);
  assert.equal(removeMemoryItem(m, "sessions", m.sessions[1].summary).sessions.length, 1);
  assert.equal(removeMemoryItem(m, "level", "").level, "");
});
