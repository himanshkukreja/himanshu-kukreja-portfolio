/**
 * DSA Mastery rewards (src/lib/dsa/rewards.ts): Bits amounts, belts, idempotent award keys, the sign-in merge, solve
 * modifiers, streak milestones and mastery badges over a small world spec.
 *   node --test scripts/tests/dsa-rewards.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported module.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BELTS,
  BITS_TABLE,
  LEGACY_SOLVE_BITS,
  SOLVE_BITS,
  awardKeys,
  awardsOf,
  badgeDefsFor,
  badgeProgress,
  beltFor,
  bitsBetween,
  bitsFlagOf,
  bitsOfKey,
  computeBits,
  earnedBadges,
  eventBits,
  eventKey,
  maxSolveBits,
  parseEventKey,
  solveBits,
  streakMilestones,
} from "../../src/lib/dsa/rewards.ts";

const total = (done) => computeBits(awardsOf(done)).total;

test("belts: thresholds rise, White at 0, Black last, beltFor picks the right one", () => {
  assert.equal(BELTS.map((b) => b.name).join(" "), "White Yellow Orange Green Blue Brown Black");
  for (let i = 1; i < BELTS.length; i++) assert.ok(BELTS[i].min > BELTS[i - 1].min);
  assert.equal(beltFor(0).belt.id, "white");
  assert.equal(beltFor(-5).belt.id, "white");
  assert.equal(beltFor(299).belt.id, "white");
  assert.equal(beltFor(300).belt.id, "yellow");
  assert.equal(beltFor(14_000).belt.id, "brown");
  assert.equal(beltFor(34_999).belt.id, "brown");
  const top = beltFor(1e9);
  assert.equal(top.belt.id, "black");
  assert.equal(top.next, null);
  assert.equal(top.pct, 100);
  const mid = beltFor(900);
  assert.equal(mid.next.id, "orange");
  assert.equal(mid.toNext, 600);
  assert.equal(mid.pct, 50);
});

test("phase 1 sizing: a typical finisher lands on Brown, no-bonus finisher near it, Black needs much more", () => {
  const solves = (easy, medium, hard, bonus) => easy * (SOLVE_BITS.easy.base + bonus * (SOLVE_BITS.easy.firstTry + SOLVE_BITS.easy.noHints)) + medium * (SOLVE_BITS.medium.base + bonus * (SOLVE_BITS.medium.firstTry + SOLVE_BITS.medium.noHints)) + hard * (SOLVE_BITS.hard.base + bonus * (SOLVE_BITS.hard.firstTry + SOLVE_BITS.hard.noHints));
  const learning = 85 * (6 * BITS_TABLE.beat + BITS_TABLE.lesson) + 40 * BITS_TABLE.checkpointQuiz + 25 * BITS_TABLE.lab + 70 * BITS_TABLE.lecture;
  const badges = 29 * BITS_TABLE.moduleBadge + BITS_TABLE.worldBadge;
  const daily = 120 * BITS_TABLE.daily;
  const typical = solves(160, 213, 33, 1 / 3) + learning + badges + daily + BITS_TABLE.welcome;
  const bare = solves(160, 213, 33, 0) + learning + badges + daily;
  assert.equal(beltFor(typical).belt.id, "brown", `typical ${Math.round(typical)}`);
  assert.ok(["blue", "brown"].includes(beltFor(bare).belt.id), `bare ${bare}`);
  assert.ok(BELTS.at(-1).min > typical * 2, "Black is far beyond phase 1");
});

test("event keys round-trip and carry their amount", () => {
  const k = eventKey("solve:two-sum", 35);
  assert.equal(k, "dsa:b:solve:two-sum=35");
  assert.deepEqual(parseEventKey(k), { key: "solve:two-sum", bits: 35 });
  assert.equal(parseEventKey("dsa:p:two-sum"), null);
  assert.equal(parseEventKey("dsa:b:broken"), null);
  assert.equal(parseEventKey("dsa:b:x=-3"), null);
  assert.equal(eventKey("weird=id", 4), "dsa:b:weird-id=4");
  assert.equal(bitsOfKey(k), 35);
  assert.equal(bitsOfKey("dsa:s:windows/see"), BITS_TABLE.beat);
  assert.equal(bitsOfKey("lesson:week-01/day-01"), 0, "SDM keys are worth no Bits");
});

test("progress keys are awards; SDM keys are ignored", () => {
  const done = {
    "dsa:s:windows/see": 1,
    "dsa:s:windows/shape": 2,
    "dsa:c:windows": 3,
    "dsa:cpq:cp-1": 4,
    "dsa:lab:stack-lab": 5,
    "dsa:tr:t1": 6,
    "dsa:daily:2026-11-09": 7,
    "dsa:lec:dsa--m5--windows": 8,
    "dsa:qc:concepts/windows:0:1": 9,
    "dsa:gate:academy:m5:1": 10,
    "lesson:week-01/day-01": 11,
    rush: 12,
  };
  const s = computeBits(awardsOf(done));
  assert.equal(
    s.total,
    2 * BITS_TABLE.beat + BITS_TABLE.lesson + BITS_TABLE.checkpointQuiz + BITS_TABLE.lab + BITS_TABLE.dryRun + BITS_TABLE.daily + BITS_TABLE.lecture + BITS_TABLE.quickCheck,
  );
  assert.equal(s.byKind.beat, 2 * BITS_TABLE.beat);
  assert.equal(s.byKind.daily, BITS_TABLE.daily);
  assert.ok(!awardsOf(done).some((a) => a.key.includes("week-01")));
});

test("idempotent: the same award written twice counts once, the higher amount wins", () => {
  const once = { [eventKey("solve:a", 20)]: 100, "dsa:p:a": 100 };
  assert.equal(total(once), 20);
  // a second device recorded the same solve with a different amount before syncing: the union keeps both keys
  const merged = { ...once, [eventKey("solve:a", 35)]: 200 };
  assert.equal(total(merged), 35);
  const a = awardsOf(merged).find((x) => x.key === "solve:a");
  assert.equal(a.at, 100, "earliest time is kept");
  // replaying a list of awards never double counts
  const list = awardsOf(merged);
  assert.equal(computeBits([...list, ...list]).total, 35);
  assert.equal(eventBits(merged, "solve:a"), 35);
  assert.equal(eventBits(merged, "solve:b"), -1);
});

test("a solve key without its event (solved before Bits) counts the legacy base once", () => {
  assert.equal(total({ "dsa:p:old": 5 }), LEGACY_SOLVE_BITS);
  assert.equal(total({ "dsa:p:old": 5, [eventKey("solve:old", 40)]: 6 }), 40);
});

test("solve modifiers: first try, no hints, editorial first", () => {
  assert.equal(solveBits({ level: "easy", firstTry: false, noHints: false, editorialFirst: false }).bits, 10);
  assert.equal(solveBits({ level: "medium", firstTry: true, noHints: true, editorialFirst: false }).bits, 35);
  assert.equal(solveBits({ level: "hard", firstTry: true, noHints: false, editorialFirst: false }).bits, 60);
  const ed = solveBits({ level: "hard", firstTry: true, noHints: true, editorialFirst: true });
  assert.equal(ed.bits, 10, "a quarter of the base, no bonuses");
  assert.ok(ed.bits < SOLVE_BITS.hard.base);
  assert.equal(solveBits({ level: "easy", firstTry: true, noHints: true, editorialFirst: true }).bits, 3);
  assert.equal(maxSolveBits("medium"), 35);
});

test("weekly window and the leaderboard flag", () => {
  const wk = Date.parse("2026-11-08T18:30:00.000Z"); // Monday 00:00 IST
  const done = { [eventKey("solve:a", 20)]: wk - 1000, [eventKey("solve:b", 10)]: wk + 1000, "dsa:daily:2026-11-09": wk + 2000 };
  const aw = awardsOf(done);
  assert.equal(bitsBetween(aw, wk), 15);
  assert.equal(bitsBetween(aw, 0), 35);
  const f = bitsFlagOf(aw, "2026-11-09", wk, 42);
  assert.deepEqual(f, { v: 1, b: 35, belt: "white", wk: "2026-11-09", w: 15, at: 42 });
});

test("streak milestones", () => {
  assert.deepEqual(streakMilestones(2), []);
  assert.deepEqual(streakMilestones(7).map((m) => m.days), [3, 7]);
  assert.equal(awardKeys.streak(7), "streak:7");
  assert.equal(total({ [eventKey(awardKeys.streak(3), 10)]: 1, [eventKey(awardKeys.streak(3), 10)]: 2 }), 10);
});

const node = (id, type, extra = {}) => ({ id, type, title: id, required: true, href: null, built: true, ...extra });
const spec = {
  id: "academy",
  title: "Academy",
  regions: [
    {
      id: "m5",
      code: "M5",
      title: "Window Works",
      moduleTitle: "Sliding Window",
      stretches: [
        {
          id: "s1",
          title: "s1",
          nodes: [
            node("n1", "concept", { ref: "windows" }),
            node("n2", "practice", { ref: "p1" }),
            node("cp1", "checkpoint", { problems: [{ id: "p2", title: "p2", built: true }, { id: "p3", title: "p3", built: false }] }),
            node("g1", "gate", { openedBy: "cp1" }),
            node("x", "practice", { ref: "optional", required: false }),
          ],
        },
      ],
      side: [],
      boss: null,
    },
    {
      id: "s3",
      code: "S3",
      title: "Queues",
      moduleTitle: "Queues",
      stretches: [{ id: "s1", title: "s1", nodes: [node("q1", "concept", { ref: "queues" }), node("cq", "checkpoint", { lab: { id: "ring", title: "Ring", href: "#" } })] }],
      side: [],
      boss: null,
    },
    { id: "later", code: "A9", title: "Later", moduleTitle: "Later", stretches: [{ id: "s1", title: "s1", nodes: [node("l1", "concept", { ref: "later", built: false })] }], side: [], boss: null },
  ],
};

const sig = (o = {}) => ({ concepts: new Set(o.c || []), solved: new Set(o.p || []), checkpoints: new Set(o.q || []), labs: new Set(o.l || []) });

test("badge definitions: one per module, a world badge, unbuilt modules not ready", () => {
  const defs = badgeDefsFor(spec);
  assert.deepEqual(defs.map((d) => d.id), ["module:academy:m5", "module:academy:s3", "module:academy:later", "world:academy"]);
  const m5 = defs[0];
  assert.equal(m5.name, "Sliding Window");
  assert.deepEqual(m5.need, ["c:windows", "p:p1", "q:cp1", "p:p2"], "gates, optional stops and unbuilt checkpoint problems are left out");
  assert.equal(m5.ready, true);
  assert.equal(defs[2].ready, false);
  assert.equal(defs[3].ready, false, "the world needs every module ready");
  assert.deepEqual(defs[1].need, ["c:queues", "q:cq", "l:ring"]);
});

test("earned badges: modules from signals, the world only when every module is earned", () => {
  const defs = badgeDefsFor(spec);
  assert.equal(earnedBadges(defs, sig({ c: ["windows"], p: ["p1"], q: ["cp1"] })).size, 0, "p2 missing");
  const e = earnedBadges(defs, sig({ c: ["windows", "queues"], p: ["p1", "p2"], q: ["cp1", "cq"], l: ["ring"] }));
  assert.deepEqual([...e].sort(), ["module:academy:m5", "module:academy:s3"]);
  const ready = badgeDefsFor({ ...spec, regions: spec.regions.slice(0, 2) });
  const all = earnedBadges(ready, sig({ c: ["windows", "queues"], p: ["p1", "p2"], q: ["cp1", "cq"], l: ["ring"] }));
  assert.ok(all.has("world:academy"));
  const prog = badgeProgress(ready, sig({ c: ["windows"], p: ["p1"] }));
  assert.deepEqual(prog["module:academy:m5"], { done: 2, total: 4 });
  assert.deepEqual(prog["world:academy"], { done: 0, total: 2 });
});

test("badge Bits count once per badge", () => {
  const k = eventKey(awardKeys.badge("module:academy:m5"), BITS_TABLE.moduleBadge);
  assert.equal(total({ [k]: 1 }), BITS_TABLE.moduleBadge);
  assert.equal(computeBits(awardsOf({ [k]: 1 })).byKind.badge, BITS_TABLE.moduleBadge);
});
