/**
 * The interview-readiness estimate (src/lib/learner/readiness-model.ts; AI audit 12 Nov 2026, O12): a band from plain
 * arithmetic, never a percentage; the top bands need interview evidence; "Interview-ready" needs coverage; missing
 * evidence is marked; the levers point at the biggest gaps with the server's links; the reading's input carries numbers
 * and labels only, and its [L#] markers are kept only for links it was given.
 *   node --test scripts/tests/readiness.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BANDS, cleanReading, dsaReadiness, lldReadiness, mockScore, readingInput, sdmReadiness } from "../../src/lib/learner/readiness-model.ts";

const T = Date.parse("2026-11-12T10:00:00Z");
const DAY = 86_400_000;
const r = (done, total) => ({ done, total });

const sdm = (o = {}) => ({
  lessons: r(0, 60),
  cases: r(0, 20),
  trials: { passed: 0, attempted: 0, total: 30 },
  quickChecks: { right: 0, answered: 0 },
  mocks: [],
  labs: r(0, 40),
  ...o,
});

test("nothing done reads as not started, with every input marked as no evidence", () => {
  const x = sdmReadiness(sdm());
  assert.equal(x.band, "not-started");
  assert.equal(x.step, 0);
  assert.equal(x.evidence.have, 0);
  assert.ok(x.inputs.every((i) => i.none));
});

test("the band never shows a percentage", () => {
  const x = sdmReadiness(sdm({ lessons: r(30, 60), trials: { passed: 10, attempted: 12, total: 30 } }));
  assert.ok(!/%/.test(x.bandLabel));
  assert.ok(BANDS.some((b) => b.label === x.bandLabel));
});

test("strong coverage without a mock is held at Getting there, and the mock is the first lever", () => {
  const x = sdmReadiness(sdm({ lessons: r(58, 60), cases: r(18, 20), trials: { passed: 29, attempted: 30, total: 30 }, quickChecks: { right: 90, answered: 100 }, labs: r(30, 40) }));
  assert.equal(x.band, "getting-there");
  assert.match(x.capped ?? "", /mock round/);
  assert.equal(x.levers[0].id, "mocks");
});

test("a mock at SDE or better lifts the gate", () => {
  const base = { lessons: r(58, 60), cases: r(18, 20), trials: { passed: 29, attempted: 30, total: 30 }, quickChecks: { right: 90, answered: 100 }, labs: r(30, 40) };
  const x = sdmReadiness(sdm({ ...base, mocks: [{ slug: "mock-03", level: "senior", at: T }, { slug: "mock-01", level: "sde", at: T - 5 * DAY }] }));
  assert.ok(["most", "ready"].includes(x.band), x.band);
  assert.equal(x.capped, null);
});

test("Interview-ready needs most of the lessons covered", () => {
  const x = sdmReadiness(sdm({ lessons: r(30, 60), cases: r(20, 20), trials: { passed: 30, attempted: 30, total: 30 }, quickChecks: { right: 100, answered: 100 }, labs: r(40, 40), mocks: [{ slug: "m", level: "staff", at: T }] }));
  assert.notEqual(x.band, "ready");
});

test("mock levels: the latest counts most, with the trend against the round before", () => {
  const up = mockScore([{ slug: "a", level: "junior", at: T - DAY }, { slug: "a", level: "sde", at: T }]);
  assert.equal(up.trend, "up");
  assert.match(up.value, /latest SDE, up from Junior/);
  const down = mockScore([{ slug: "a", level: "senior", at: T - DAY }, { slug: "b", level: "junior", at: T }]);
  assert.equal(down.trend, "down");
  assert.match(down.value, /best Senior/);
  assert.ok(up.score > down.score - 0.2);
  assert.equal(mockScore([]).score, 0);
  // a self-assessed fallback says so
  assert.match(mockScore([{ slug: "a", level: "sde", at: T, self: true }]).value, /self-assessed/);
});

test("quick checks count in full only from ten answers", () => {
  const few = sdmReadiness(sdm({ quickChecks: { right: 2, answered: 2 } })).inputs.find((i) => i.id === "quickChecks");
  const many = sdmReadiness(sdm({ quickChecks: { right: 20, answered: 20 } })).inputs.find((i) => i.id === "quickChecks");
  assert.ok(few.score < many.score);
  assert.equal(many.score, 1);
});

test("LLD: patterns, cases, LLD mocks and labs, with the server's links on the levers", () => {
  const x = lldReadiness({
    patterns: r(10, 28),
    cases: r(4, 30),
    mocks: [],
    labs: r(2, 50),
    links: { cases: { label: "Case study: Parking lot", href: "/low-level-design/lld-01-parking-lot" }, mocks: { label: "LLD mock round: Parking lot", href: "/mock/lld-01-parking-lot" } },
  });
  assert.equal(x.track, "lld");
  assert.ok(["early", "building"].includes(x.band), x.band);
  const cases = x.levers.find((l) => l.id === "cases");
  assert.equal(cases?.link?.href, "/low-level-design/lld-01-parking-lot");
  assert.ok(x.levers.length <= 3);
});

test("DSA: the top bands need 50+ solves across half the patterns", () => {
  const held = dsaReadiness({ lessons: r(40, 40), patterns: r(20, 20), solved: 45, firstTry: r(40, 45), explains: r(10, 10) });
  assert.equal(held.band, "getting-there");
  assert.equal(held.levers[0].id, "solved");
  const ok = dsaReadiness({ lessons: r(40, 40), patterns: r(18, 20), solved: 130, firstTry: r(100, 130), explains: r(9, 10) });
  assert.ok(["most", "ready"].includes(ok.band), ok.band);
});

test("the reading's input is numbers and labels; unknown link markers are dropped", () => {
  const x = sdmReadiness(sdm({ lessons: r(12, 60), links: { lessons: { label: "Next lesson: Cache invalidation", href: "/week-04/x" } } }));
  const { text, links } = readingInput(x);
  assert.match(text, /Estimate band: /);
  assert.match(text, /\[no evidence yet\]/);
  assert.equal(links.length, 1);
  assert.match(text, /\[L1\] Next lesson: Cache invalidation/);
  const clean = cleanReading("**Getting** there. Finish it [L1], then [L4] and [L0].", links);
  assert.equal(clean, "Getting there. Finish it [L1], then and .");
});

test("the estimate is deterministic: the same records give the same result", () => {
  const input = sdm({ lessons: r(20, 60), trials: { passed: 6, attempted: 8, total: 30 }, mocks: [{ slug: "m", level: "junior", at: T }] });
  assert.deepEqual(sdmReadiness(input), sdmReadiness(structuredClone(input)));
});

test("an input whose content isn't there (0 of 0) is left out, not counted as a gap", () => {
  const x = lldReadiness({ patterns: r(0, 0), cases: r(3, 22), mocks: [], labs: r(0, 0) });
  assert.deepEqual(x.inputs.map((i) => i.id), ["cases", "mocks"]);
  assert.ok(x.inputs.every((i) => !("n" in i)));
});

test("LLD levers speak about LLD", () => {
  const x = lldReadiness({ patterns: r(0, 28), cases: r(0, 30), mocks: [], labs: r(0, 55) });
  assert.match(x.levers.find((l) => l.id === "patterns")?.why ?? "", /design-pattern lessons/);
});
