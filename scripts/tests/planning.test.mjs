/**
 * AI planning (12 Nov 2026): struggles, the living plan's recap slots, the quiet nudge, chat-plan re-dating, the company
 * plan's order and the cross-course connections. All deterministic.
 *   node --test scripts/tests/planning.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  cleanCompanyPlan,
  cleanNudgePrefs,
  companyBrief,
  dateInText,
  findStruggles,
  interleave,
  pickNudge,
  planLine,
  recapItems,
  redatePath,
  trackWeights,
  weekOf,
  withNudge,
} from "../../src/lib/learner/planning-model.ts";
import { connections } from "../../src/lib/learner/connections-model.ts";
import { schedule } from "../../src/lib/learn/plan/schedule.ts";

const NOW = Date.UTC(2026, 10, 12, 12);
const H = 3600_000;
const D = 24 * H;
const conceptOf = (id) => ({ "max-window": "sliding-window", "longest-run": "sliding-window", "two-sum": "hashing" })[id] ?? null;

test("classify: explain-back, chat quiz and DSA submits as misses, successes or neither", () => {
  assert.deepEqual(classify({ kind: "explain_back", ref: "consistent-hashing", outcome: "partial" }, conceptOf), { key: "sdm:consistent-hashing", unit: "sdm:consistent-hashing", miss: true });
  assert.equal(classify({ kind: "explain_back", ref: "dsa:sliding-window", outcome: "solid" }, conceptOf).miss, false);
  assert.equal(classify({ kind: "chat_quiz", ref: "cp:week-04-caching/day-01-caching-patterns#2", outcome: "wrong" }, conceptOf).key, "lesson:week-04-caching/day-01-caching-patterns");
  assert.equal(classify({ kind: "chat_quiz", ref: "drill:foo#a1", outcome: "wrong" }, conceptOf), null);
  assert.equal(classify({ kind: "dsa_submit", ref: "max-window", outcome: "CE" }, conceptOf).miss, null, "a compile error is not a miss");
  assert.equal(classify({ kind: "dsa_submit", ref: "max-window", outcome: "WA" }, conceptOf).unit, "dsa:sliding-window|max-window");
  assert.equal(classify({ kind: "mock_phase", ref: "mock-01/p2", outcome: "junior" }, conceptOf), null);
});

test("findStruggles: twice in 14 days, cleared by a later success, a DSA problem once a day", () => {
  const ev = [
    { kind: "explain_back", ref: "consistent-hashing", outcome: "partial", at: NOW - 2 * H },
    { kind: "explain_back", ref: "consistent-hashing", outcome: "partial", at: NOW - 1 * H },
    // old: outside the window
    { kind: "explain_back", ref: "idempotency", outcome: "partial", at: NOW - 20 * D },
    { kind: "explain_back", ref: "idempotency", outcome: "partial", at: NOW - 3 * D },
    // cleared by a solid after
    { kind: "explain_back", ref: "quorum", outcome: "misconception", at: NOW - 5 * D },
    { kind: "explain_back", ref: "quorum", outcome: "partial", at: NOW - 4 * D },
    { kind: "explain_back", ref: "quorum", outcome: "solid", at: NOW - 3 * D },
    // ten quick resubmits on one day: one miss
    ...Array.from({ length: 10 }, (_, i) => ({ kind: "dsa_submit", ref: "max-window", outcome: "WA", at: NOW - 6 * D + i * 60_000 })),
    // another problem of the same concept, another day: the concept reaches two
    { kind: "dsa_submit", ref: "longest-run", outcome: "TLE", at: NOW - 2 * D },
    // a solved problem's misses don't count
    { kind: "dsa_submit", ref: "two-sum", outcome: "WA", at: NOW - 3 * D },
    { kind: "dsa_submit", ref: "two-sum", outcome: "WA", at: NOW - 2 * D },
    { kind: "dsa_submit", ref: "two-sum", outcome: "AC", at: NOW - 1 * D },
  ];
  const s = findStruggles(ev, NOW, conceptOf);
  assert.deepEqual(
    s.map((x) => [x.key, x.misses]),
    [
      ["sdm:consistent-hashing", 2],
      ["dsa:sliding-window", 2],
    ],
  );
  assert.equal(s[1].course, "dsa");
  assert.equal(findStruggles(ev, NOW, conceptOf, { min: 1 }).some((x) => x.key === "sdm:idempotency"), true, "one miss inside the window");
});

const named = (key, misses, lastAt, course = "sdm") => ({ key, course, misses, lastAt, firstAt: lastAt - H, label: key.split(":")[1], href: `/concepts/${key.split(":")[1]}`, recap: true });

test("nudge prefs: dismiss until a new miss; a recap opened marks it done", () => {
  let p = cleanNudgePrefs(null);
  const s = [named("sdm:consistent-hashing", 2, NOW - H)];
  let n = pickNudge({ struggles: s, prefs: p, plan: null, today: "2026-11-12" });
  assert.equal(n.kind, "struggle");
  assert.match(n.text, /missed consistent-hashing twice/);
  p = withNudge(p, "off", "sdm:consistent-hashing", NOW);
  assert.equal(pickNudge({ struggles: s, prefs: p, plan: null, today: "2026-11-12" }), null, "dismissed");
  // a new miss after the dismissal brings it back
  assert.equal(pickNudge({ struggles: [named("sdm:consistent-hashing", 3, NOW + H)], prefs: p, plan: null, today: "2026-11-12" }).misses, 3);
  const q = withNudge(cleanNudgePrefs(null), "done", "sdm:consistent-hashing", NOW);
  assert.equal(pickNudge({ struggles: s, prefs: q, plan: null, today: "2026-11-12" }), null, "recap opened");
  // garbage from another device is cleaned
  assert.deepEqual(cleanNudgePrefs({ updatedAt: "x", off: { "bad key!": 1, ok: 5 }, done: [] }), { updatedAt: 0, off: { ok: 5 }, done: {} });
});

test("nudge: at most one; the course's own topic first; then the plan line, dismissed for the week", () => {
  const s = [named("sdm:quorum", 3, NOW - H), named("dsa:sliding-window", 2, NOW - 2 * H, "dsa")];
  assert.equal(pickNudge({ struggles: s, prefs: cleanNudgePrefs(null), plan: null, today: "2026-11-12" }).key, "sdm:quorum");
  assert.equal(pickNudge({ struggles: s, prefs: cleanNudgePrefs(null), plan: null, today: "2026-11-12", course: "dsa" }).key, "dsa:sliding-window");
  const fmt = (d) => d;
  const behind = planLine({ status: "behind", days: 2, fits: true, target: "2026-12-15", past: false }, fmt);
  assert.match(behind.text, /2 study days behind your plan to 2026-12-15/);
  const n = pickNudge({ struggles: [], prefs: cleanNudgePrefs(null), plan: behind, today: "2026-11-12" });
  assert.equal(n.kind, "plan");
  assert.equal(n.key, "plan:behind@2026-11-09");
  const off = withNudge(cleanNudgePrefs(null), "off", n.key, NOW);
  assert.equal(pickNudge({ struggles: [], prefs: off, plan: behind, today: "2026-11-13" }), null, "same week");
  assert.equal(pickNudge({ struggles: [], prefs: off, plan: behind, today: "2026-11-16" }).kind, "plan", "next week");
  const ok = planLine({ status: "on-track", days: 0, fits: true, target: "2026-12-15", past: false }, fmt);
  assert.equal(pickNudge({ struggles: [], prefs: cleanNudgePrefs(null), plan: ok, today: "2026-11-12" }), null, "on track says nothing by default");
  assert.equal(planLine({ status: "behind", days: 2, fits: true, target: "2026-11-01", past: true }, fmt), null);
  assert.equal(weekOf("2026-11-15"), "2026-11-09");
});

test("living plan: a recap slot goes first in the live plan and drops out once opened", () => {
  const items = [
    { id: "lesson:w1/a", kind: "lesson", week: "w1", title: "A", tag: "", href: "/w1/a", minutes: 50, splittable: true },
    { id: "lesson:w1/b", kind: "lesson", week: "w1", title: "B", tag: "", href: "/w1/b", minutes: 50, splittable: true },
  ];
  const settings = { target: "2026-11-30", days: [0, 1, 2, 3, 4], minutes: 60, time: "20:00", include: { core: true, bosses: true, trials: true, sideQuests: false, mocks: true }, mocksAt: "worlds", revision: 1, buffer: false, startWeek: null, reminder: 0 };
  const s = [named("sdm:consistent-hashing", 2, NOW - H)];
  const r = recapItems(s, cleanNudgePrefs(null));
  assert.equal(r.items[0].id, "recap:sdm:consistent-hashing");
  const sch = schedule({ items: [...r.items, ...items], stretch: [], status: r.status, settings, from: "2026-11-12", cutoff: 0 });
  assert.deepEqual(
    sch.days[0].entries.map((e) => e.id),
    ["recap:sdm:consistent-hashing", "lesson:w1/a"],
  );
  const opened = recapItems(s, withNudge(cleanNudgePrefs(null), "done", "sdm:consistent-hashing", NOW));
  assert.equal(opened.status["recap:sdm:consistent-hashing"].done, true);
  const after = schedule({ items: [...opened.items, ...items], stretch: [], status: opened.status, settings, from: "2026-11-13", cutoff: Date.UTC(2026, 10, 13) });
  assert.equal(after.days[0].entries[0].id, "lesson:w1/a", "an opened recap drops out the next day");
});

test("redatePath: overdue undone steps move to today, the spacing stays, done steps keep their dates", () => {
  const steps = [
    { id: "a", due: "2026-11-08" },
    { id: "b", due: "2026-11-09" },
    { id: "c", due: "2026-11-11" },
    { id: "d", due: "2026-11-14" },
    { id: "e" },
  ];
  const r = redatePath(steps, (id) => id === "a", "2026-11-12");
  assert.equal(r.slipped, 3);
  assert.deepEqual(r.dues, { b: "2026-11-12", c: "2026-11-14", d: "2026-11-17" });
  assert.deepEqual(redatePath(steps, () => false, "2026-11-01"), { dues: {}, slipped: 0 });
});

test("company plan: weights from rounds and readiness; interleaved by weight; recaps first", () => {
  const w = trackWeights(["Coding", "System design", "Googleyness and leadership"], { sdm: 0.6, dsa: 0.1 }, { sdm: 5 });
  assert.equal(w.lld, 0, "no LLD round, no LLD question");
  assert.ok(w.dsa > w.sdm, "the weaker tested track gets more");
  const w2 = trackWeights(["Machine coding", "System design"], {}, { sdm: 3, lld: 2 });
  assert.equal(w2.dsa, 0, "machine coding is not a DSA round");
  assert.ok(w2.lld > 0);
  const mk = (t, n) => Array.from({ length: n }, (_, i) => ({ id: `${t}${i}`, kind: "lesson", week: null, title: `${t}${i}`, tag: "", href: "/", minutes: 30, splittable: true, track: t, why: "", priority: n - i }));
  const out = interleave({ sdm: mk("sdm", 4), lld: [], dsa: mk("dsa", 4) }, { sdm: 1, lld: 0, dsa: 1 }, [{ ...mk("sdm", 1)[0], id: "recap:x" }]);
  assert.equal(out[0].id, "recap:x");
  assert.deepEqual(
    out.slice(1, 5).map((i) => i.id),
    ["sdm0", "dsa0", "sdm1", "dsa1"],
  );
  const heavy = interleave({ sdm: mk("sdm", 6), lld: [], dsa: mk("dsa", 6) }, { sdm: 0.5, lld: 0, dsa: 1.5 });
  assert.equal(heavy.slice(0, 4).filter((i) => i.track === "dsa").length, 3, "3:1 by weight");
  assert.equal(cleanCompanyPlan({ company: "google", target: "2026-12-20", minutes: 9999, days: [9, 1] }).minutes, 480);
  assert.equal(cleanCompanyPlan({ company: "Google!", target: "2026-12-20" }), null);
  const brief = companyBrief({ company: "Google", rounds: ["Coding"], focus: ["caching"], target: "2026-12-20", today: "2026-11-12", bands: { dsa: "Early days" }, weights: { sdm: 0, lld: 0, dsa: 1 }, struggles: [], first: [{ title: "Sliding window", track: "dsa", why: "x" }], fits: false });
  assert.match(brief, /38 days from today/);
  assert.match(brief, /DSA 100%/);
  assert.match(brief, /does not fit/);
});

test("dateInText: a future interview date in a goal note", () => {
  assert.equal(dateInText("Amazon SDE2 loop on 15 Dec", "2026-11-12"), "2026-12-15");
  assert.equal(dateInText("interview March 3rd", "2026-11-12"), "2027-03-03");
  assert.equal(dateInText("onsite 2026-12-01", "2026-11-12"), "2026-12-01");
  assert.equal(dateInText("onsite 2026-10-01", "2026-11-12"), null, "past");
  assert.equal(dateInText("learn caching", "2026-11-12"), null);
  assert.equal(dateInText("31 feb", "2026-11-12"), null);
});

test("connections: only what the learner did or has next, at most three, nothing for an unconnected page", () => {
  const ix = {
    concepts: [
      { id: "sliding-window", title: "Sliding window", href: "/dsa/concepts/sliding-window", sdm: ["week-01-data-at-scale/day-03-rate-limiting-at-scale", "problem-bank/problem-02-rate-limiter"], labs: ["sliding-window-counter"] },
      { id: "linked-lists", title: "Linked lists", href: "/dsa/structures/linked-lists", sdm: ["week-04-caching/day-01-caching-patterns"], labs: ["lru-cache"] },
    ],
    labs: [
      { id: "lru-cache", title: "LRU cache", href: "/labs/lru-cache", lessons: ["low-level-design/lld-03-lru-cache"] },
      { id: "sliding-window-counter", title: "Sliding window counter", href: "/labs/sliding-window-counter", lessons: ["week-01-data-at-scale/day-03-rate-limiting-at-scale"] },
    ],
    lessons: {
      "week-01-data-at-scale/day-03-rate-limiting-at-scale": { title: "Rate limiting at scale", href: "/week-01-data-at-scale/day-03-rate-limiting-at-scale" },
      "week-04-caching/day-01-caching-patterns": { title: "Caching patterns", href: "/week-04-caching/day-01-caching-patterns" },
    },
  };
  const pr = { sdmDone: new Set(["week-04-caching/day-01-caching-patterns"]), sdmNext: new Set(["week-01-data-at-scale/day-03-rate-limiting-at-scale"]), labsDone: new Set(["lru-cache"]), dsaDone: new Set(), dsaSolved: new Map([["sliding-window", 3]]), dsaNext: new Set(["linked-lists"]) };
  const sdm = connections({ kind: "sdm", key: "week-01-data-at-scale/day-03-rate-limiting-at-scale", title: "Rate limiting at scale" }, ix, pr);
  assert.equal(sdm[0].text, "You solved 3 Sliding window problems in DSA Mastery: Rate limiting at scale uses the same idea.");
  assert.equal(sdm.length, 1, "the lab wasn't passed");
  const lld = connections({ kind: "sdm", key: "low-level-design/lld-03-lru-cache", title: "LRU cache" }, ix, pr);
  assert.deepEqual(
    lld.map((c) => c.text),
    ["Your LRU cache lab used Linked lists from DSA Mastery.", "Coming up in DSA Mastery: Linked lists, the structure under this lesson."],
  );
  const dsa = connections({ kind: "dsa-concept", id: "linked-lists" }, ix, pr);
  assert.deepEqual(
    dsa.map((c) => [c.state, c.text]),
    [
      ["done", "You read Caching patterns in System Design Mastery: it runs on this lesson's idea."],
      ["done", "Your LRU cache lab used this lesson's idea."],
    ],
  );
  const prob = connections({ kind: "dsa-problem", id: "max-window", concept: "sliding-window", sdm: [], labs: [] }, ix, pr);
  assert.equal(prob[0].state, "next");
  assert.deepEqual(connections({ kind: "sdm", key: "week-09-x/day-01-y", title: "Y" }, ix, pr), []);
  const none = { ...pr, sdmDone: new Set(), sdmNext: new Set(), labsDone: new Set(), dsaSolved: new Map(), dsaNext: new Set() };
  assert.deepEqual(connections({ kind: "dsa-concept", id: "linked-lists" }, ix, none), [], "nothing done or next: hidden");
});
