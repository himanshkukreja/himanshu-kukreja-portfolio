/**
 * The learner model's outcome log and the feature brief (src/lib/learner/events-model.ts, feature-brief-model.ts;
 * AI audit 12 Nov 2026, O2/O5/O9/O10): detail keeps ids and levels only (≤ 1 KB), graders' words become rubric ids,
 * each feature's brief says what matters to it in ≤ 6 lines, memory off means no brief, and the compare lines.
 *   node --test scripts/tests/learner-events.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cleanDetail, eventRow, namedItems, rankOf, scorecardParts, levelWord } from "../../src/lib/learner/events-model.ts";
import { compareExplain, compareLabReview, compareMock, defaultStyleLines, featureBriefText, outcomeDigest, withBrief } from "../../src/lib/learner/feature-brief-model.ts";

const T = Date.parse("2026-11-12T10:00:00Z");
const DAY = 86_400_000;
const U = "11111111-1111-4111-8111-111111111111";

test("detail keeps ids, levels and numbers only, and stays under 1 KB", () => {
  const d = cleanDetail({ miss: ["p3.s2", "p3.s4", "I forgot the idempotency key on retries"], level: 2, verdict: "partial", code: "def f(x):\n  return x", answer: "my whole answer here", phases: { p1: "sde", p2: "junior", P3: "x" }, "bad key": 1 });
  assert.deepEqual(d.miss, ["p3.s2", "p3.s4"]);
  assert.equal(d.level, 2);
  assert.equal(d.verdict, "partial");
  assert.equal(d.code, undefined, "code with spaces/newlines is dropped");
  assert.equal(d.answer, undefined, "prose is dropped");
  assert.deepEqual(d.phases, { p1: "sde", p2: "junior" });
  const big = cleanDetail({ a: Array.from({ length: 16 }, (_, i) => `id-${"x".repeat(40)}-${i}`), b: Array.from({ length: 16 }, (_, i) => `id-${"y".repeat(40)}-${i}`) });
  assert.ok(new TextEncoder().encode(JSON.stringify(big)).length <= 1024);
});

test("a row needs a known kind, course and a clean ref", () => {
  assert.equal(eventRow(U, { course: "sdm", kind: "nope", ref: "x" }), null);
  assert.equal(eventRow(U, { course: "x", kind: "paper", ref: "x" }), null);
  assert.equal(eventRow(U, { course: "sdm", kind: "paper", ref: "has space" }), null);
  const r = eventRow(U, { course: "sdm", kind: "mock_phase", ref: "mock-03-cart/p2", outcome: "SDE", detail: { run: T } });
  assert.equal(r.outcome, "sde");
});

test("the grader's MISSED words become the rubric's ids", () => {
  const rubric = [
    { id: "p2.s1", text: "Estimates peak QPS from daily active users and a peak factor" },
    { id: "p2.s2", text: "Uses idempotency keys so a retried payment is charged once" },
    { id: "p2.s3", text: "Sizes storage for five years with replication" },
  ];
  assert.deepEqual(namedItems('"Uses idempotency keys so a retried payment is charged once" - no retry story; "Sizes storage for five years" - never sized', rubric), ["p2.s2", "p2.s3"]);
  assert.deepEqual(namedItems("none", rubric), []);
});

test("scorecard parts and levels", () => {
  const text = "### P1 · Requirements\nLEVEL: sde\nMET: x\nMISSED: y\nNEXT: z\n### P2 · Capacity\nLEVEL: not answered\nMET: none\nMISSED: not attempted\n### Overall\nLEVEL: junior\nSUMMARY: s";
  const p = scorecardParts(text);
  assert.deepEqual(p.map((x) => [x.title, x.level]), [["P1 · Requirements", "sde"], ["P2 · Capacity", "none"], ["Overall", "junior"]]);
  assert.equal(levelWord("Below-junior"), "below-junior");
  assert.ok(rankOf("mock_overall", "senior") > rankOf("mock_overall", "sde"));
  assert.equal(rankOf("paper", "6/10"), 0.6);
});

const names = {
  ref: (e) => (e.kind === "explain_back" ? "explain-back on Consistent hashing" : e.kind.startsWith("mock") ? "mock M3 Payments" : e.kind.startsWith("lab") ? "lab Token bucket" : null),
  item: (e, id) => ({ 1: "keys and nodes on one ring", 2: "virtual nodes spread load", p1: "Requirements", p2: "Capacity", "p2.s2": "Uses idempotency keys" })[id] ?? null,
};
const notes = { goals: ["PayKaro SDE-2 loop in December"], level: "2 years backend (Node), new to distributed systems", prefs: ["short answers", "examples from Indian apps"], struggles: ["consistent hashing virtual nodes"] };
const ev = (kind, ref, outcome, detail, at) => ({ course: "sdm", kind, ref, outcome, detail, at });
const events = [
  ev("explain_back", "consistent-hashing", "partial", { miss: ["2"] }, T - DAY),
  ev("mock_overall", "mock-03-pay", "junior", { run: 1, target: "sde", phases: { p1: "sde", p2: "junior" } }, T - 2 * DAY),
  ev("mock_phase", "mock-03-pay/p1", "sde", { run: 1, miss: [], met: [] }, T - 2 * DAY),
  ev("mock_phase", "mock-03-pay/p2", "junior", { run: 1, miss: ["p2.s2"], met: [] }, T - 2 * DAY),
  ev("lab_hint", "token-bucket", "hint-1", { level: 1, fails: 3 }, T - 3600_000),
  ev("lab_hint", "token-bucket", "hint-2", { level: 2, fails: 4 }, T - 1800_000),
];

test("memory off: no brief (a lab hint keeps only the page's failed-run count)", () => {
  const b = featureBriefText({ feature: "lesson-qa", course: "sdm", notes: null, events, names, now: T });
  assert.equal(b.text, "");
  const h = featureBriefText({ feature: "lab-hint", course: "sdm", notes: null, events: [], names, lab: { failedRuns: 5 }, now: T });
  assert.match(h.text, /failed run 5/);
  assert.doesNotMatch(h.text, /hint level/);
});

test("lab hint: the Nth failure and the hint levels already shown", () => {
  const b = featureBriefText({ feature: "lab-hint", course: "sdm", notes, events, names, ref: { kinds: ["lab_hint", "lab_pass", "lab_review"], ref: "token-bucket" }, lab: { failedRuns: 5, level: 3 }, now: T });
  assert.match(b.text, /failed run 5/);
  assert.match(b.text, /hint levels 1, 2 already shown/);
  assert.match(b.text, /Don't repeat a hint/);
  assert.ok(b.lines.length <= 6);
});

test("mock interviewer: the round, the bar, the last attempt's weak phase and this phase's misses", () => {
  const b = featureBriefText({ feature: "mock-interviewer", course: "sdm", notes, events, names, ref: { kinds: ["mock_overall", "mock_phase"], prefix: "mock-03-pay" }, mock: { company: "PayKaro", title: "Payments", level: "sde", phase: { id: "p2", title: "Capacity" } }, now: T });
  assert.match(b.text, /PayKaro SDE-2/);
  assert.match(b.text, /at the SDE bar they picked/);
  assert.match(b.text, /weakest phase Capacity \(junior\)/);
  assert.match(b.text, /In this phase last time they missed: "Uses idempotency keys"/);
  assert.match(b.text, /one neutral question/);
});

test("explain-back and lesson-qa: earlier attempts, struggles, default style from memory (O10)", () => {
  const e = featureBriefText({ feature: "explain-back", course: "sdm", notes, events, names, ref: { kinds: ["explain_back"], ref: "consistent-hashing", topic: "Consistent hashing" }, now: T });
  assert.match(e.text, /Earlier attempts at explaining this: .* partial \(missed "virtual nodes spread load"\)/);
  assert.match(e.text, /\(again\)/);
  const q = featureBriefText({ feature: "lesson-qa", course: "sdm", notes, events, names, ref: { topic: "Consistent hashing ring" }, now: T });
  assert.match(q.text, /Likes answers: short answers/);
  assert.match(q.text, /For a beginner|short answers: keep it brief/);
  assert.match(q.text, /Graded work on this topic: explain-back on Consistent hashing/);
  const chosen = featureBriefText({ feature: "lesson-qa", course: "sdm", notes, events, names, ref: { topic: "x" }, styleChosen: true, now: T });
  assert.doesNotMatch(chosen.text, /keep it brief/);
  assert.deepEqual(defaultStyleLines({ goals: [], level: "8 years, staff engineer", prefs: ["hinglish"], struggles: [] }).length, 2);
  // lesson-qa turns the default style into its own <answer_style> line: the beginner's style lines leave the adapt block
  const viaLine = featureBriefText({ feature: "lesson-qa", course: "sdm", notes, events, names, ref: { topic: "x" }, styleLine: true, now: T });
  assert.equal(viaLine.style, "simple");
  assert.doesNotMatch(viaLine.tail, /For a beginner|keep it brief/);
  assert.equal(withBrief(viaLine, "Q?").indexOf("<learner"), 0);
  assert.ok(withBrief(viaLine, "Q?").trimEnd().endsWith("</adapt>"));
  assert.equal(withBrief({ head: "", tail: "" }, "Q?"), "Q?");
});

test("compared with last time (O9)", () => {
  const ex = compareExplain(events[0], { verdict: "solid", miss: [] }, (id) => names.item(events[0], id));
  assert.deepEqual(ex, ["Up from partial to solid (last attempt 11 Nov).", 'Covered now: "virtual nodes spread load".']);
  const prev = { overall: events[1], phases: [events[2], events[3]] };
  const m = compareMock(prev, { overall: "sde", phases: [{ id: "p1", title: "Requirements", level: "sde", miss: [], met: [] }, { id: "p2", title: "Capacity", level: "sde", miss: ["p2.s2"], met: [] }] }, (id) => names.item(events[1], id));
  assert.equal(m[0], "Overall: up from junior to SDE (last attempt 10 Nov).");
  assert.ok(m.includes("Up on Capacity (junior → SDE)."));
  assert.ok(m.includes('Still missing: "Uses idempotency keys".'));
  assert.deepEqual(compareMock(undefined, { overall: "sde", phases: [] }, () => null), []);
  const lr = compareLabReview(ev("lab_review", "token-bucket", "issues", { c: 3, x: 4, e: 2, r: 4 }, T - DAY), { c: 5, x: 4, e: 3, r: 4 });
  assert.deepEqual(lr, ["Since your last review (11 Nov): up on correctness 3 → 5, edge cases 2 → 3."]);
});

test("the chat's digest names results, never learner words", () => {
  const d = outcomeDigest(events, names, 10);
  assert.ok(d.some((l) => /explain-back on Consistent hashing .*partial; key points missed: "virtual nodes spread load"/.test(l)));
  assert.ok(d.some((l) => /mock M3 Payments AI scorecard .*overall junior \(picked the SDE bar\); Requirements SDE, Capacity junior; missed: "Uses idempotency keys"/.test(l)));
  assert.ok(d.some((l) => /lab Token bucket .*2 hints \(up to level 2\)/.test(l)));
});
