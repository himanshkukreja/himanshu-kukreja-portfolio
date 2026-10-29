/**
 * Due reviews (lib/learn/review-due-core.ts): ranking, the "why" lines, misses fixed since, client-only
 * signals from localStorage, and lesson state from learning_progress + game_done.
 *   node --test scripts/tests/review-due.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported module.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { agoLabel, collectClientSignals, dayIn, lessonSignals, mergeClientSignals, rankDueReviews } from "../../src/lib/learn/review-due-core.ts";

const C = "/learn/system-design-mastery";
const W = "week-05-scaling";
const lesson = (slug, title, minutes = 40) => ({ week: W, slug, title, kind: "day-content", minutes, code: "D1", label: title, tag: "W05 · DAY 01", href: `${C}/${W}/${slug}` });
const MAP = {
  courseId: "system-design-mastery",
  title: "SDM",
  description: "",
  plan: null,
  weeks: [
    {
      key: W,
      num: 5,
      code: "05",
      title: "Scaling",
      lessons: [lesson("day-01-consistent-hashing", "Consistent hashing"), lesson("day-02-sharding", "Sharding", 60)],
      boss: null,
      trial: { week: W, slug: "week-05-mcq", title: "Trial", href: `${C}/${W}/week-05-mcq`, totalQuestions: 30, passPct: 80, parts: [{ n: 1, title: "Hashing", questions: 15, range: "", href: `${C}/${W}/week-05-mcq?part=1` }] },
      minutes: 100,
      badge: "",
    },
  ],
  sideQuests: [],
  stats: {},
};
// 29 Oct 2026, 12:00 IST
const NOW = Date.UTC(2026, 9, 29, 6, 30);
const DAY = 86_400_000;

test("dates: days in Asia/Kolkata, ago labels", () => {
  assert.equal(dayIn(Date.UTC(2026, 9, 28, 19, 0), "Asia/Kolkata"), "2026-10-29"); // 00:30 IST
  assert.equal(agoLabel(0), "today");
  assert.equal(agoLabel(1), "yesterday");
  assert.equal(agoLabel(4), "4 days ago");
  assert.equal(agoLabel(21), "3 weeks ago");
});

test("lecture checkpoint misses: the why line, and fixed misses drop out", () => {
  const at = NOW - 4 * DAY;
  const lectureQuiz = [
    { lecture: "consistent-hashing", scene: "q1", right: false, at },
    { lecture: "consistent-hashing", scene: "q2", right: false, at },
    { lecture: "consistent-hashing", scene: "q3", right: true, at },
  ];
  const r = rankDueReviews({ now: NOW, map: MAP, lectureQuiz, lectures: { "consistent-hashing": { title: "Consistent hashing", href: "/learn/lectures/consistent-hashing" } } });
  assert.equal(r.items.length, 1);
  const it = r.items[0];
  assert.equal(it.kind, "checkpoint");
  assert.equal(it.why, "you missed 2 of 3 checkpoint questions on Consistent hashing 4 days ago");
  assert.equal(it.href, "/learn/lectures/consistent-hashing");
  assert.equal(it.dueAt, "2026-10-26");
  // re-answered right later, or a right answer on record in game_done: no longer due
  const later = rankDueReviews({ now: NOW, map: MAP, lectureQuiz: [...lectureQuiz, { lecture: "consistent-hashing", scene: "q1", right: true, at: at + DAY }], done: { "lecture-quiz:consistent-hashing:q2": at } });
  assert.equal(later.items.length, 0);
});

test("ranking: overdue cards first, a cap of two per kind, about five in all", () => {
  const card = (i, week, slug, dueAt, box = 1, lastGrade = null) => ({ id: `c${i}`, source: "trial_miss", sourceRef: `r${i}`, week, lessonSlug: slug, front: `Question ${i}`, box, dueAt, lastGrade, reviews: 1 });
  const cards = [
    card(1, W, "day-01-consistent-hashing", "2026-10-20", 1, "again"),
    card(2, W, "day-01-consistent-hashing", "2026-10-29"),
    card(3, W, "day-02-sharding", "2026-10-28", 2),
    card(4, null, null, "2026-10-27", 3),
    card(5, W, "day-02-sharding", "2026-11-05"), // not due
  ];
  const quiz = [
    { qid: `quiz:system-design-mastery/${W}/day-02-sharding:0:0`, week: W, lesson: "day-02-sharding", correct: false, first: true, at: NOW - 2 * DAY },
    { qid: `quiz:system-design-mastery/${W}/day-02-sharding:0:1`, week: W, lesson: "day-02-sharding", correct: true, first: true, at: NOW - 2 * DAY },
  ];
  const trials = [{ week: W, part: 1, score: 9, total: 15, passed: false, at: NOW - 6 * DAY }];
  const lessons = { [`${W}/day-02-sharding`]: { status: "in_progress", pct: 40, lastStage: "part-2", lastAt: NOW - 3 * DAY } };
  const r = rankDueReviews({ now: NOW, map: MAP, cards, quiz, trials, lessons, prompts: { [quiz[0].qid]: "Why do shards get hot?" } });
  assert.equal(r.items.length, 5);
  const kinds = r.items.map((i) => i.kind);
  assert.equal(kinds[0], "review");
  assert.ok(kinds.filter((k) => k === "review").length <= 2);
  assert.ok(kinds.includes("quiz") && kinds.includes("weak"));
  const top = r.items[0];
  assert.equal(top.id, `review:${W}/day-01-consistent-hashing`);
  assert.match(top.why, /^2 cards due, the oldest 9 days overdue; last time you graded “Question 1” again \(4 due in all\)$/);
  const q = r.items.find((i) => i.kind === "quiz");
  assert.equal(q.why, "you missed 1 of 2 quick-check questions in Sharding 2 days ago, e.g. “Why do shards get hot?”");
  const w = r.items.find((i) => i.kind === "weak");
  assert.equal(w.why, "your best on “Hashing” is 9/15 (60%), the pass mark is 80%; last try 6 days ago");
  assert.equal(w.href, `${C}/${W}/week-05-mcq?part=1`);
  // limit
  assert.equal(rankDueReviews({ now: NOW, map: MAP, cards, quiz, trials, lessons }, { limit: 2 }).items.length, 2);
});

test("lessons started, not finished: from learning_progress rows and game_done stage keys", () => {
  const rows = [{ week: W, lesson_slug: "day-02-sharding", status: "in_progress", progress_percentage: 40, last_stage: "part-2", last_accessed_at: new Date(NOW - DAY).toISOString() }];
  const done = { [`stage:${W}/day-01-consistent-hashing/part-1`]: NOW - 10 * DAY, [`lesson:${W}/day-03-x`]: NOW };
  const ls = lessonSignals(rows, done);
  assert.equal(ls[`${W}/day-02-sharding`].status, "in_progress");
  assert.equal(ls[`${W}/day-01-consistent-hashing`].lastStage, "part-1");
  assert.equal(ls[`${W}/day-03-x`].status, "completed");
  const r = rankDueReviews({ now: NOW, map: MAP, lessons: ls, done });
  assert.deepEqual(r.items.map((i) => i.id), [`resume:${W}/day-02-sharding`, `resume:${W}/day-01-consistent-hashing`]);
  assert.equal(r.items[0].why, "you're 40% through it, last opened yesterday, at “part 2”");
  assert.equal(r.items[0].href, `${C}/${W}/day-02-sharding#part-2`);
  assert.equal(r.items[0].minutes, 36);
});

test("client signals: localStorage review queue, quick checks, verdicts, lesson records", () => {
  const data = {
    "hk.review.v1": JSON.stringify({ cards: [{ id: "local-1", source: "highlight", sourceRef: "n1", week: W, lessonSlug: "day-01-consistent-hashing", front: "A ring of hashes", box: 1, dueAt: "2026-10-28", lastGrade: null, reviews: 0, detail: { short: "The ring" } }] }),
    [`sd:quiz:system-design-mastery/${W}/day-02-sharding`]: JSON.stringify({ 0: { s: "sig", a: { 0: { p: 2, f: 0 }, 1: { p: 1, f: 1 } } } }),
    [`sd:verdict:${W}/day-01-consistent-hashing`]: JSON.stringify({ q1: "review", q2: "review", q3: "knew" }),
    "hk.lesson.v1": JSON.stringify({ [`system-design-mastery/${W}/day-02-sharding`]: { max: 55, last: "part-3", updatedAt: NOW - DAY } }),
    "hk.game.v1": "not json",
  };
  const keys = Object.keys(data);
  const storage = { length: keys.length, key: (i) => keys[i] ?? null, getItem: (k) => data[k] ?? null };
  const c = collectClientSignals(storage);
  assert.equal(c.cards.length, 1);
  assert.equal(c.cards[0].short, "The ring");
  assert.equal(c.deviceQuiz.length, 2);
  assert.deepEqual(c.verdicts, [{ lesson: `${W}/day-01-consistent-hashing`, review: 2, knew: 1 }]);
  assert.equal(c.lessons[`${W}/day-02-sharding`].pct, 55);
  assert.deepEqual(c.done, {});

  const qid = `quiz:system-design-mastery/${W}/day-02-sharding:0:0`;
  const server = { now: NOW, map: MAP, lessons: { [`${W}/day-02-sharding`]: { status: "in_progress", pct: 40, lastStage: "part-2", lastAt: NOW - 3 * DAY } } };
  const merged = mergeClientSignals(server, c);
  assert.equal(merged.lessons[`${W}/day-02-sharding`].pct, 55);
  assert.equal(merged.lessons[`${W}/day-02-sharding`].lastStage, "part-3");
  const r = rankDueReviews({ ...merged, answers: { [qid]: 1 } });
  const ids = r.items.map((i) => i.id);
  assert.ok(ids.includes(`review:${W}/day-01-consistent-hashing`));
  assert.ok(ids.includes(`checkpoint:lesson:${W}/day-01-consistent-hashing`));
  assert.ok(ids.includes(`quiz:${W}/day-02-sharding`));
  assert.match(r.items.find((i) => i.kind === "quiz").why, /\(on this device\)$/);
  // the current pick is the right answer: the miss was fixed
  const fixed = rankDueReviews({ ...merged, answers: { [qid]: 2 } });
  assert.equal(fixed.items.some((i) => i.kind === "quiz"), false);
  // a storage that throws reads as empty
  const bad = { get length() { throw new Error("blocked"); }, key: () => { throw new Error("x"); }, getItem: () => { throw new Error("x"); } };
  assert.deepEqual(collectClientSignals(bad), { cards: [], deviceQuiz: [], verdicts: [], lessons: {}, done: {} });
});

test("saved-path steps past their date, not done", () => {
  const planSteps = [
    { pathId: "pa", pathTitle: "Caching in a week", stepId: "L:a", title: "Cache aside", href: `${C}/${W}/day-01-consistent-hashing`, kind: "lesson", due: "2026-10-27", done: false },
    { pathId: "pa", pathTitle: "Caching in a week", stepId: "L:b", title: "Write-behind", href: `${C}/${W}/day-02-sharding`, kind: "lesson", due: "2026-10-28", done: false },
    { pathId: "pa", pathTitle: "Caching in a week", stepId: "L:c", title: "Later", href: "/learn/x", kind: "lesson", due: "2026-11-02", done: false },
  ];
  const r = rankDueReviews({ now: NOW, map: MAP, planSteps });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].why, "due 2 days ago in your saved path “Caching in a week” (2 steps due)");
});
