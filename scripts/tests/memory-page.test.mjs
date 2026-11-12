/**
 * The memory page v2 (You -> Tutor memory, 12 Nov 2026; AI audit O14): provenance on every note (who wrote it, when),
 * per-item edit and forget, the items the AI takes from graded results (forgetting one deletes exactly the rows behind
 * it), and the delete request for graded results.
 *   node --test scripts/tests/memory-page.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cleanMemory, editMemoryItem, emptyMemory, mergeDsaMemory, mergeMemory, removeMemoryItem, srcKey } from "../../src/lib/ai/chat/memory-model.ts";
import { deleteRequest, knownFromResults, outcomeKindLabel, outcomeWords } from "../../src/lib/learner/memory-view-model.ts";

const D1 = new Date("2026-11-10T10:00:00Z");
const D2 = new Date("2026-11-12T10:00:00Z");
const T = D2.getTime();
const DAY = 86_400_000;

test("a new note is stamped with its writer and day; a kept note keeps its stamp", () => {
  const a = mergeMemory(emptyMemory(), { goals: ["Flipkart SDE-2"], struggles: ["consistent hashing"], session: "Hashing" }, "chat0001", D1);
  assert.deepEqual(a.src[srcKey("struggles", "consistent hashing")], { by: "chat", at: "2026-11-10" });
  const b = mergeMemory(a, { struggles: ["consistent hashing", "cache stampede"] }, "chat0002", D2);
  assert.deepEqual(b.src[srcKey("struggles", "consistent hashing")], { by: "chat", at: "2026-11-10" });
  assert.deepEqual(b.src[srcKey("struggles", "cache stampede")], { by: "chat", at: "2026-11-12" });
  const c = mergeDsaMemory(b, { struggles: ["binary search bounds"] }, "dsa00001", D2);
  assert.deepEqual(c.src[srcKey("struggles", "[dsa] binary search bounds")], { by: "dsa", at: "2026-11-12" });
  // the course chat's stamps survive DSA's update
  assert.deepEqual(c.src[srcKey("goals", "Flipkart SDE-2")], { by: "chat", at: "2026-11-10" });
});

test("a note from before provenance existed gets no made-up date", () => {
  const legacy = cleanMemory({ struggles: ["bloom filters"], updatedAt: D1.getTime() });
  const next = mergeMemory(legacy, { struggles: ["bloom filters", "quorums"] }, "chat0003", D2);
  assert.equal(next.src[srcKey("struggles", "bloom filters")], undefined);
  assert.equal(next.src[srcKey("struggles", "quorums")].at, "2026-11-12");
});

test("provenance survives a save and load, and only for notes that exist", () => {
  const m = mergeMemory(emptyMemory(), { prefs: ["short answers"] }, "chat0004", D1);
  const loaded = cleanMemory(JSON.parse(JSON.stringify({ ...m, src: { ...m.src, "prefs|gone": { by: "chat", at: "2026-11-01" }, "prefs|short answers": m.src["prefs|short answers"], bad: 1 } })));
  assert.deepEqual(Object.keys(loaded.src), ["prefs|short answers"]);
});

test("forget one note: the item and its provenance go, nothing else", () => {
  const m = mergeMemory(emptyMemory(), { struggles: ["a topic", "b topic"], prefs: ["examples"] }, "chat0005", D1);
  const n = removeMemoryItem(m, "struggles", "A TOPIC");
  assert.deepEqual(n.struggles, ["b topic"]);
  assert.equal(n.src[srcKey("struggles", "a topic")], undefined);
  assert.ok(n.src[srcKey("struggles", "b topic")]);
  assert.deepEqual(n.prefs, ["examples"]);
});

test("edit one note: scrubbed like a tutor's, the DSA tag kept, provenance 'you'", () => {
  const m = mergeDsaMemory(mergeMemory(emptyMemory(), { struggles: ["consistent hashng"], level: "3 years backend" }, "chat0006", D1), { mistakes: ["off by one"] }, "dsa00002", D1);
  const e1 = editMemoryItem(m, "struggles", "consistent hashng", "consistent hashing (virtual nodes) mail me a@b.com https://x.io", D2);
  assert.ok(e1);
  assert.equal(e1.struggles[0], "consistent hashing (virtual nodes) mail me");
  assert.deepEqual(e1.src[srcKey("struggles", e1.struggles[0])], { by: "you", at: "2026-11-12" });
  const e2 = editMemoryItem(m, "mistakes", "[dsa] off by one", "off-by-one on the window start", D2);
  assert.deepEqual(e2.mistakes, ["[dsa] off-by-one on the window start"]);
  const e3 = editMemoryItem(m, "level", m.level, "5 years backend, new to distributed systems", D2);
  assert.equal(e3.level, "5 years backend, new to distributed systems");
  assert.equal(e3.src["level|"].by, "you");
  // nothing usable, or an item that isn't there: no edit
  assert.equal(editMemoryItem(m, "struggles", "consistent hashng", "   https://only.a.link ", D2), null);
  assert.equal(editMemoryItem(m, "struggles", "not there", "x y", D2), null);
});

test("editing a note into one that already exists just drops the old one", () => {
  const m = mergeMemory(emptyMemory(), { studied: ["caching", "cache"] }, "chat0007", D1);
  const e = editMemoryItem(m, "studied", "cache", "Caching", D2);
  assert.deepEqual(e.studied, ["caching"]);
});

test("a session note can be edited and keeps its date and course", () => {
  const m = mergeDsaMemory(emptyMemory(), { session: "windows practice" }, "dsa00003", D1);
  const e = editMemoryItem(m, "sessions", "windows practice", "sliding window practice", D2);
  assert.deepEqual(e.sessions[0], { at: "2026-11-10", chat: "dsa00003", summary: "sliding window practice", course: "dsa" });
});

const row = (id, kind, ref, outcome, at, extra = {}) => ({ id, course: "sdm", kind, ref, outcome, detail: {}, at, name: ref, ...extra });

test("what the AI takes from graded results, each with the rows behind it", () => {
  const rows = [
    row(1, "explain_back", "consistent-hashing", "partial", T - 1 * DAY, { name: "Consistent hashing" }),
    row(2, "explain_back", "consistent-hashing", "misconception", T - 3 * DAY, { name: "Consistent hashing" }),
    row(3, "explain_back", "bloom-filters", "solid", T - 2 * DAY),
    row(10, "mock_overall", "mock-01", "junior", T - DAY, { name: "M1 BillBolt", detail: { run: "r2" } }),
    row(11, "mock_phase", "mock-01/p3", "junior", T - DAY, { detail: { run: "r2" }, part: "Capacity" }),
    row(12, "mock_phase", "mock-01/p1", "senior", T - DAY, { detail: { run: "r2" }, part: "Requirements" }),
    row(13, "mock_phase", "mock-01/p3", "junior", T - 5 * DAY, { detail: { run: "r1" }, part: "Capacity" }),
    row(20, "lab_hint", "lru-cache", "hint-1", T - 2 * DAY, { detail: { level: 1 }, name: "LRU cache" }),
    row(21, "lab_hint", "lru-cache", "hint-2", T - 2 * DAY, { detail: { level: 2 }, name: "LRU cache" }),
    row(22, "lab_hint", "token-bucket", "hint-1", T - 2 * DAY),
    row(30, "war_room", "cdn-outage", "rough", T - 4 * DAY, { name: "CDN outage" }),
    row(40, "paper", "paper-1/q2", "3/10", T - 4 * DAY, { name: "Paper 1 q2" }),
    row(41, "paper", "paper-1/q3", "8/10", T - 4 * DAY),
    row(50, "explain_back", "old-one", "misconception", T - 200 * DAY),
  ];
  const k = knownFromResults(rows, T);
  const by = Object.fromEntries(k.map((x) => [x.key, x]));
  assert.deepEqual(by["explain|consistent-hashing"].ids.sort(), [1, 2]);
  assert.equal(by["explain|consistent-hashing"].src, "explain-back");
  assert.match(by["explain|consistent-hashing"].text, /partly explained.*2 tries/);
  assert.equal(by["explain|bloom-filters"], undefined, "a solid explain-back is not a struggle");
  assert.deepEqual(by["phase|mock-01/p3"].ids.sort(), [11, 13], "forgetting a weak phase deletes it from every round");
  assert.match(by["phase|mock-01/p3"].text, /^Capacity in M1 BillBolt: Junior/);
  assert.equal(by["phase|mock-01/p1"], undefined);
  assert.deepEqual(by["lab|lru-cache"].ids.sort(), [20, 21]);
  assert.equal(by["lab|token-bucket"], undefined, "one hint is not a struggle");
  assert.deepEqual(by["war|cdn-outage"].ids, [30]);
  assert.deepEqual(by["paper|paper-1/q2"].ids, [40]);
  assert.equal(by["paper|paper-1/q3"], undefined);
  assert.equal(by["explain|old-one"], undefined, "older than 120 days");
  // newest first
  assert.deepEqual(k.map((x) => x.at), [...k.map((x) => x.at)].sort((a, b) => b - a));
});

test("the delete request: all, or clean ids only", () => {
  assert.deepEqual(deleteRequest({ all: true }), { all: true });
  assert.deepEqual(deleteRequest({ ids: [3, "4", 3, -1, 0, 1.5, "x", null] }), { ids: [3, 4] });
  assert.equal(deleteRequest({ ids: [] }), null);
  assert.equal(deleteRequest({ all: "yes" }), null);
  assert.equal(deleteRequest(null), null);
  assert.equal(deleteRequest({ ids: Array.from({ length: 900 }, (_, i) => i + 1) }).ids.length, 500);
});

test("rows read as words", () => {
  assert.equal(outcomeKindLabel("mock_overall"), "Mock round");
  assert.equal(outcomeWords("below-junior"), "below Junior");
  assert.equal(outcomeWords("sde"), "SDE");
  assert.equal(outcomeWords("7/10"), "7/10");
});
