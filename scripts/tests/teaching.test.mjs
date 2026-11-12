/**
 * AI teaching features (owner-approved 12 Nov 2026): the goal chat's notes, "Teach me" and "Explain it differently"
 * (lib/ai/teaching.ts) and how they're remembered in memory prefs, and mistakes → review cards.
 *   node --test scripts/tests/teaching.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { applyOnboarding, cleanMemory, emptyMemory, mergeMemory, setPrefs, srcKey } from "../../src/lib/ai/chat/memory-model.ts";
import { endAtQuestion, hasTeachPref, isStylePref, isTeachPref, nextRestyle, restyleAsk, restyleLine, restyleOf, RESTYLES, stylePref, teachLine, TEACH_PREF, workingStyleOf } from "../../src/lib/ai/teaching.ts";
import { goalChatInput, profileNotes, readGoalReply, readProfile, readTurns, withKnown, GOAL_CHAT_MAX_TURNS } from "../../src/lib/learner/goal-chat-model.ts";
import { dsaRepeatedMistakes, mistakeCandidates, neededContent, pickNewCards, MISTAKE_CARDS_PER_DAY } from "../../src/lib/learner/mistake-cards-model.ts";

const D = new Date("2026-11-12T10:00:00Z");
const NOW = D.getTime();
const DAY = 86_400_000;
const known = (o = {}) => ({ goals: [], level: "", prefs: [], dsaExp: null, dsaGoal: null, dsaFull: false, started: [], ...o });

/* ------------------------------------------------------------------ explain it differently */

test("explain it differently rotates and never repeats the last way, skipping the one that already works", () => {
  assert.equal(nextRestyle(null), "analogy");
  for (const s of RESTYLES) assert.notEqual(nextRestyle(s), s);
  assert.equal(nextRestyle("analogy"), "steps");
  assert.equal(nextRestyle("code"), "analogy");
  // the learner's remembered way is what answers already use: the first re-explanation picks another
  assert.equal(nextRestyle(null, "analogy"), "steps");
  assert.equal(nextRestyle("diagram", "code"), "analogy");
  // a full cycle visits every way
  const seen = new Set();
  let s = null;
  for (let i = 0; i < 4; i++) seen.add((s = nextRestyle(s)));
  assert.equal(seen.size, 4);
});

test("a re-explanation's words name its way, and the line asks for that way only", () => {
  for (const s of RESTYLES) {
    assert.equal(restyleOf(restyleAsk(s)), s);
    assert.match(restyleLine(s), /<explain_differently>/);
  }
  assert.equal(restyleOf("Explain it more simply."), null);
  assert.equal(restyleLine(null), "");
  assert.match(restyleLine("code"), /never the solution/);
});

test("teach me: one question at a time, explanation only after a try or a request", () => {
  const t = teachLine();
  assert.match(t, /exactly ONE question/);
  assert.doesNotMatch(t, /give it now/);
  assert.match(t, /No headings, no tables, no bullet lists/);
  assert.match(t, /nothing after the question/);
  assert.match(teachLine({ answering: true }), /answers your last question: first say/);
  // asking to see it switches to explaining the whole topic
  const reveal = teachLine({ answering: true, topic: "Teach me how cache-aside works.", latest: "I don't know, just tell me." });
  assert.match(reveal, /give it now/);
  assert.match(reveal, /cache-aside/);
  assert.match(teachLine({ latest: "Just show me the explanation." }), /give it now/);
});

test("a teach-me reply ends at its question: a short tail goes, anything bigger stays", () => {
  assert.equal(endAtQuestion("Not quite. What has to be written first? One short answer is enough."), "Not quite. What has to be written first?");
  assert.equal(endAtQuestion("**Which parcel can you rule out?**"), "**Which parcel can you rule out?**");
  assert.equal(endAtQuestion("Which one? See [[s2]] for the lesson."), "Which one? See [[s2]] for the lesson.");
  assert.equal(endAtQuestion("No question here."), "No question here.");
});

test("teach me and the style that worked are remembered as prefs, one each, by the learner", () => {
  const m0 = cleanMemory({ prefs: ["short answers", "examples from Indian apps"], updatedAt: 1 });
  const on = setPrefs(m0, { drop: isTeachPref, add: TEACH_PREF, by: "you", now: D });
  assert.equal(on.prefs[0], TEACH_PREF);
  assert.ok(hasTeachPref(on.prefs));
  assert.deepEqual(on.src[srcKey("prefs", TEACH_PREF)], { by: "you", at: "2026-11-12" });
  const off = setPrefs(on, { drop: isTeachPref, add: null, by: "you", now: D });
  assert.ok(!hasTeachPref(off.prefs));
  assert.deepEqual(off.prefs, ["short answers", "examples from Indian apps"]);
  // the style that worked replaces the last one, never piles up
  const a = setPrefs(m0, { drop: isStylePref, add: stylePref("analogy"), by: "feedback", now: D });
  const b = setPrefs(a, { drop: isStylePref, add: stylePref("code"), by: "feedback", now: D });
  assert.equal(b.prefs.filter(isStylePref).length, 1);
  assert.equal(workingStyleOf(b.prefs), "code");
  assert.equal(b.src[srcKey("prefs", stylePref("code"))].by, "feedback");
  // provenance survives a save and load
  assert.equal(cleanMemory(JSON.parse(JSON.stringify(b))).src[srcKey("prefs", stylePref("code"))].by, "feedback");
  // the cap holds
  const full = cleanMemory({ prefs: ["a1", "a2", "a3", "a4", "a5"] });
  assert.equal(setPrefs(full, { drop: isTeachPref, add: TEACH_PREF, by: "you", now: D }).prefs.length, 5);
});

test("the working style reads the remembered pref first, then the onboarding's words", () => {
  assert.equal(workingStyleOf(["analogies first", "brief answers"]), "analogy");
  assert.equal(workingStyleOf(["step-by-step worked examples"]), "steps");
  assert.equal(workingStyleOf([stylePref("diagram"), "code first"]), "diagram");
  assert.equal(workingStyleOf(["short answers"]), null);
});

/* ------------------------------------------------------------------ the goal chat */

test("the goal chat's reply is one message with at most one question, its profile checked", () => {
  const r = readGoalReply(JSON.stringify({ reply: "Nice! When is the interview? And which companies?", chips: ["In 2 weeks", "No date yet", "x".repeat(60)], done: false, profile: { role: "backend engineer", level: "SDE-2", companies: ["Flipkart", "flipkart", "a@b.com"], timeline: "", experience: "3 years Java", approach: "analogies", length: "weird", courses: ["sdm", "nope"] } }));
  assert.equal(r.reply, "Nice! When is the interview?");
  assert.equal(r.chips.length, 3);
  assert.ok(r.chips.every((c) => c.length <= 32));
  assert.deepEqual(r.profile.courses, ["sdm"]);
  assert.equal(r.profile.length, "");
  assert.ok(!r.profile.companies.some((c) => c.includes("@")));
  assert.equal(readGoalReply("not json"), null);
});

test("the profile becomes goals, level and prefs notes", () => {
  const n = profileNotes(readProfile({ role: "backend engineer", level: "SDE-2", companies: ["Flipkart", "Swiggy"], timeline: "interview in about 3 weeks", experience: "3 years backend in Java, new to distributed systems", approach: "code", length: "brief", courses: ["sdm", "dsa"] }));
  assert.deepEqual(n.goals, ["Aiming for SDE-2 backend engineer at Flipkart, Swiggy", "Timeline: interview in about 3 weeks", "Studying System Design Mastery and DSA Mastery"]);
  assert.equal(n.level, "3 years backend in Java, new to distributed systems");
  assert.deepEqual(n.prefs, ["code first", "brief answers"]);
});

test("what DSA Mastery already knows fills the profile, and the model is told not to ask it", () => {
  const k = known({ dsaExp: "new", dsaGoal: "placements" });
  const p = withKnown(readProfile({}), k);
  assert.equal(p.experience, "new to coding");
  assert.equal(p.role, "campus placements");
  const input = goalChatInput([], k);
  assert.match(input, /from DSA Mastery's welcome\): new to coding/);
  assert.match(input, /campus placements/);
  // memory's level wins: nothing is filled over it
  assert.equal(withKnown(readProfile({}), known({ level: "5 years", dsaExp: "new" })).experience, "");
  assert.match(goalChatInput([{ role: "assistant", text: "Hi" }, ...Array.from({ length: GOAL_CHAT_MAX_TURNS }, () => ({ role: "user", text: "x" }))].slice(0, 7), known()), /last turn/);
});

test("the goal chat's turns are checked: roles, length, and no more than the cap", () => {
  assert.deepEqual(readTurns([{ role: "user", text: "  hi  " }, { role: "system", text: "x" }, { role: "assistant", text: "" }]), [{ role: "user", text: "hi" }]);
  assert.equal(readTurns(Array.from({ length: 7 }, () => ({ role: "user", text: "a" }))), null);
  assert.equal(readTurns([{ role: "user", text: "y".repeat(900) }])[0].text.length, 400);
});

test("onboarding notes are written with provenance onboarding, replacing an earlier onboarding's, keeping the tutors' and the learner's own", () => {
  let m = mergeMemory(emptyMemory(), { goals: ["Learn Kafka"], prefs: ["examples from Indian apps"], level: "student" }, "chat0001", new Date("2026-11-01T10:00:00Z"));
  m = setPrefs(m, { drop: isTeachPref, add: TEACH_PREF, by: "you", now: D });
  const a = applyOnboarding(m, { goals: ["Aiming for SDE-2 at Flipkart", "Timeline: in 3 weeks"], level: "3 years Java", prefs: ["code first", "brief answers"] }, D);
  assert.deepEqual(a.goals, ["Aiming for SDE-2 at Flipkart", "Timeline: in 3 weeks", "Learn Kafka"]);
  assert.equal(a.level, "3 years Java");
  assert.deepEqual(a.prefs, [TEACH_PREF, "code first", "brief answers", "examples from Indian apps"]);
  assert.equal(a.src[srcKey("goals", "Aiming for SDE-2 at Flipkart")].by, "onboarding");
  assert.equal(a.src[srcKey("level", "3 years Java")].by, "onboarding");
  assert.equal(a.src[srcKey("prefs", "code first")].by, "onboarding");
  assert.equal(a.src[srcKey("prefs", TEACH_PREF)].by, "you");
  assert.equal(a.src[srcKey("goals", "Learn Kafka")].by, "chat");
  // a second goal chat replaces the first one's notes
  const b = applyOnboarding(a, { goals: ["Aiming for senior at Swiggy"], prefs: ["analogies first"] }, D);
  assert.deepEqual(b.goals, ["Aiming for senior at Swiggy", "Learn Kafka"]);
  assert.deepEqual(b.prefs, [TEACH_PREF, "analogies first", "examples from Indian apps"]);
  assert.equal(b.level, "3 years Java");
  // contact details never survive
  assert.ok(!applyOnboarding(emptyMemory(), { goals: ["mail me at a@b.com"] }, D).goals.join(" ").includes("@"));
});

/* ------------------------------------------------------------------ mistakes → review cards */

const content = {
  concept: (ref) =>
    ({
      "cache-aside": { term: "Cache-aside", points: ["The app reads the cache first and loads from the DB on a miss.", "Writes go to the DB, then the cache entry is deleted.", "Deleting beats updating: no race leaves stale data for long."], week: "week-04-caching", slug: "invalidation", anchor: "s-2-4" },
      "dsa:two-pointers": { term: "Two pointers", points: ["Each step moves one pointer and never moves it back.", "Sorted input lets you discard half the pairs."], href: "/dsa/concepts/two-pointers" },
    })[ref] ?? null,
  mock: (slug) =>
    slug === "mock-01-x"
      ? { code: "M1", title: "BillBolt", phases: [{ id: "p2", title: "Capacity", question: "Estimate the QPS and storage.", signals: [{ id: "p2.s1", text: "States peak QPS from DAU with a peak factor", study: { title: "Back of the envelope", href: "/learn/w1" } }, { id: "p2.s2", text: "Sizes storage for 5 years" }] }] }
      : null,
  lab: (id) => (id === "lru-cache" ? { title: "LRU cache", href: "/labs/lru-cache", followUps: [{ q: "How would you make it thread safe?", a: "Guard get and put with one lock, or shard the map." }] } : null),
  mcq: (id) => (id === "quiz:sdm/week-04/x:1:1" ? { prompt: "Which pattern deletes on write?", answer: "Cache-aside with invalidation", explain: "Delete avoids the update race.", week: "week-04", slug: "x", label: "W04 · Caching" } : null),
};
const ev = (kind, ref, outcome, detail, ago, course = "sdm") => ({ course, kind, ref, outcome, detail, at: NOW - ago });

test("mistakes make cards from the course's own words, never the learner's", () => {
  const events = [
    ev("explain_back", "cache-aside", "partial", { miss: ["2", "3"] }, DAY),
    ev("mock_phase", "mock-01-x/p2", "junior", { run: 1, miss: ["p2.s1"], met: [] }, 2 * DAY),
    ev("lab_review", "lru-cache", "minor", { c: 4, x: 5, e: 2, r: 4, n: 1 }, 3 * DAY),
    ev("chat_quiz", "mcq:quiz:sdm/week-04/x:1:1", "wrong", { kind: "mcq" }, 4 * DAY),
    ev("chat_quiz", "mcq:quiz:sdm/week-04/x:1:1", "right", { kind: "mcq" }, 10 * DAY),
  ];
  const cards = mistakeCandidates(events, [{ concept: "two-pointers", fails: 4, problems: 2, at: NOW - 5 * DAY }], content, NOW);
  assert.deepEqual(cards.map((c) => c.ref), ["mistake:explain:cache-aside", "mistake:mock:mock-01-x/p2", "mistake:lab:lru-cache", "mistake:quiz:quiz:sdm/week-04/x:1:1", "mistake:dsa:two-pointers"]);
  const [x, mk, lab, q, dsa] = cards;
  assert.deepEqual(x.detail.points.map((p) => p.v), ["Writes go to the DB, then the cache entry is deleted.", "Deleting beats updating: no race leaves stale data for long."]);
  assert.equal(x.week, "week-04-caching");
  assert.equal(x.stage, "s-2-4");
  assert.equal(mk.front, "Estimate the QPS and storage.");
  assert.equal(mk.detail.href, "/learn/w1");
  assert.match(lab.detail.why, /edge cases/);
  assert.equal(lab.back, "Guard get and put with one lock, or shard the map.");
  assert.equal(q.back, "Cache-aside with invalidation");
  assert.equal(dsa.course, "dsa");
  assert.equal(dsa.detail.points[0].k, "Invariant:");
});

test("the latest result decides: improved since means no card; unanswered and clean ones make none", () => {
  const events = [
    ev("explain_back", "cache-aside", "solid", { miss: [] }, DAY),
    ev("explain_back", "cache-aside", "misconception", { miss: ["1"] }, 2 * DAY),
    ev("mock_phase", "mock-01-x/p2", "none", { miss: ["p2.s1", "p2.s2"] }, DAY),
    ev("lab_review", "lru-cache", "clean", { c: 5, x: 5, e: 4, r: 5 }, DAY),
    ev("explain_back", "unknown-concept", "partial", { miss: ["1"] }, DAY),
    ev("chat_quiz", "cp:week-04/x#1", "answered", {}, DAY),
  ];
  assert.deepEqual(mistakeCandidates(events, [], content, NOW), []);
  // and nothing older than the window
  assert.deepEqual(mistakeCandidates([ev("explain_back", "cache-aside", "partial", { miss: ["1"] }, 40 * DAY)], [], content, NOW), []);
});

test("an LLD round's misses become one card per phase; a DSA explain-back and repeated fails share one card", () => {
  const cards = mistakeCandidates([ev("lld_mock", "mock-01-x", "junior", { run: 2, phases: { p2: "junior" }, miss: ["p2.s1", "p2.s2"] }, DAY), ev("explain_back", "dsa:two-pointers", "partial", { miss: ["2"] }, DAY, "dsa")], [{ concept: "two-pointers", fails: 3, problems: 1, at: NOW - 2 * DAY }], content, NOW);
  assert.deepEqual(cards.map((c) => c.ref).sort(), ["mistake:dsa:two-pointers", "mistake:mock:mock-01-x/p2"]);
  assert.equal(cards.find((c) => c.kind === "mock").detail.points.length, 2);
});

test("cards are deduplicated and capped per day, newest mistakes first", () => {
  const cands = ["a", "b", "c", "d", "e", "f", "g"].map((x, i) => ({ ref: `mistake:${x}`, at: NOW - i }));
  assert.deepEqual(pickNewCards(cands, new Set(["mistake:a"]), 0).map((c) => c.ref), ["mistake:b", "mistake:c", "mistake:d", "mistake:e", "mistake:f"]);
  assert.equal(pickNewCards(cands, new Set(), 3).length, MISTAKE_CARDS_PER_DAY - 3);
  assert.equal(pickNewCards(cands, new Set(), MISTAKE_CARDS_PER_DAY).length, 0);
});

test("DSA repeated mistakes: 3+ failed submits or 2+ problems on one concept, recent only", () => {
  const ix = { problems: new Map([["p1", { concept: "two-pointers" }], ["p2", { concept: "two-pointers" }], ["p3", { concept: "bfs" }], ["p4", { concept: "heaps" }]]) };
  const sub = (problem_id, verdict, ago) => ({ problem_id, verdict, language: "python", created_at: new Date(NOW - ago).toISOString() });
  const out = dsaRepeatedMistakes({ subs: [sub("p1", "WA", DAY), sub("p2", "TLE", DAY), sub("p3", "WA", DAY), sub("p3", "AC", DAY), sub("p4", "WA", 40 * DAY), sub("p4", "WA", 41 * DAY), sub("p4", "WA", 42 * DAY)] }, ix, NOW);
  assert.deepEqual(out.map((x) => x.concept), ["two-pointers"]);
  assert.deepEqual(neededContent([], out, NOW).concepts, ["dsa:two-pointers"]);
});
