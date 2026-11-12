/**
 * The Low-level design (LLD track) certificate: its earning rules (all 28 design-pattern lessons and all 30 case
 * studies completed), its codes, its evidence and the migration that lets the table store it.
 *   node --test scripts/tests/lld-certificate.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported modules.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LLD_CASES_NEEDED,
  LLD_LESSONS_NEEDED,
  LLD_PATTERNS_NEEDED,
  LLD_WEEK,
  certTitle,
  certXpKey,
  certXpOfKey,
  CERT_XP,
  courseEligibility,
  courseShape,
  evidenceLine,
  evidenceSnapshot,
  generateCode,
  isValidCode,
  lldEligibility,
  lldShape,
  normalizeCode,
} from "../../src/lib/certificates/core.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pad = (n) => String(n).padStart(2, "0");
const L = (slug, title) => ({ week: LLD_WEEK, slug, title, label: title, href: `/${LLD_WEEK}/${slug}`, kind: "lld" });

/** The course map's `lld` list: patterns first (dp-NN), then case studies (lld-NN), like the real map. */
function lldList(patterns = LLD_PATTERNS_NEEDED, cases = LLD_CASES_NEEDED) {
  return [
    ...Array.from({ length: patterns }, (_, i) => L(`dp-${pad(i + 1)}-pattern-${i + 1}`, `Pattern ${i + 1}`)),
    ...Array.from({ length: cases }, (_, i) => L(`lld-${pad(i + 1)}-case-${i + 1}`, `Case ${i + 1}`)),
  ];
}

const course = (list = lldList()) => courseShape({ weeks: [], mocks: [], lld: list });
const evidence = (slugs, week = LLD_WEEK) => ({
  lessons: Object.fromEntries(slugs.map((s) => [`${week}/${s}`, { at: "2026-11-12T08:00:00.000Z", seconds: 900 }])),
  trials: {},
  bosses: {},
  offers: {},
  bestMock: null,
});
const slugs = (list) => list.map((l) => l.slug);

test("the track is 28 pattern lessons and 30 case studies", () => {
  assert.equal(LLD_PATTERNS_NEEDED, 28);
  assert.equal(LLD_CASES_NEEDED, 30);
  assert.equal(LLD_LESSONS_NEEDED, 58);
});

test("the course map's lld list splits into patterns and case studies by file name", () => {
  const shape = lldShape([...lldList(2, 3), { ...L("lld-intro", "Intro"), slug: "intro" }]);
  assert.deepEqual(slugs(shape.patterns), ["dp-01-pattern-1", "dp-02-pattern-2"]);
  assert.deepEqual(slugs(shape.cases), ["lld-01-case-1", "lld-02-case-2", "lld-03-case-3"]);
  assert.deepEqual(lldShape(undefined), { patterns: [], cases: [] });
  // courseShape carries it, as plain lesson objects
  const c = course();
  assert.equal(c.lld.patterns.length, 28);
  assert.equal(c.lld.cases.length, 30);
  assert.deepEqual(Object.keys(c.lld.cases[0]).sort(), ["href", "kind", "label", "slug", "title", "week"]);
});

test("nothing done: not eligible, 0/58, the first lesson is next", () => {
  const e = lldEligibility(course(), evidence([]));
  assert.equal(e.kind, "lld");
  assert.equal(e.world, null);
  assert.equal(e.eligible, false);
  assert.equal(e.met, 0);
  assert.equal(e.total, 2);
  assert.deepEqual(e.stats.lessons, { done: 0, total: 58 });
  assert.deepEqual(e.stats.lld, { patterns: { done: 0, total: 28 }, cases: { done: 0, total: 30 } });
  const [p, c] = e.requirements;
  assert.equal(p.id, "patterns");
  assert.equal(p.href, `/${LLD_WEEK}/dp-01-pattern-1`);
  assert.equal(p.todo.length, 28);
  assert.equal(c.id, "cases");
  assert.equal(c.todo.length, 30);
});

test("every pattern lesson and case study completed: eligible, 58/58", () => {
  const list = lldList();
  const e = lldEligibility(course(list), evidence(slugs(list)));
  assert.equal(e.eligible, true);
  assert.equal(e.met, 2);
  assert.deepEqual(e.stats.lessons, { done: 58, total: 58 });
  assert.ok(e.requirements.every((r) => r.done && r.todo.length === 0));
});

test("one lesson short in either half is not enough", () => {
  const list = lldList();
  for (const missing of ["dp-17-pattern-17", "lld-30-case-30"]) {
    const e = lldEligibility(course(list), evidence(slugs(list).filter((s) => s !== missing)));
    assert.equal(e.eligible, false, missing);
    assert.equal(e.met, 1);
    assert.equal(e.stats.lessons.done, 57);
    const r = e.requirements.find((x) => !x.done);
    assert.deepEqual(r.todo.map((t) => t.href), [`/${LLD_WEEK}/${missing}`]);
  }
});

test("all case studies but no patterns, and the other way round", () => {
  const list = lldList();
  const onlyCases = lldEligibility(course(list), evidence(slugs(list).filter((s) => s.startsWith("lld-"))));
  assert.equal(onlyCases.eligible, false);
  assert.deepEqual(onlyCases.requirements.map((r) => r.done), [false, true]);
  const onlyPatterns = lldEligibility(course(list), evidence(slugs(list).filter((s) => s.startsWith("dp-"))));
  assert.deepEqual(onlyPatterns.requirements.map((r) => r.done), [true, false]);
});

test("a track that isn't fully published can't be earned: unpublished lessons still count toward 28 and 30", () => {
  const list = lldList(19, 30);
  const e = lldEligibility(course(list), evidence(slugs(list)));
  assert.equal(e.eligible, false);
  const p = e.requirements[0];
  assert.equal(p.have, 19);
  assert.equal(p.need, 28);
  assert.match(p.detail, /19\/28 design-pattern lessons done · 9 not published yet/);
  assert.deepEqual(e.stats.lessons, { done: 49, total: 58 });
});

test("when the track grows, the new lessons count for claims made after that", () => {
  const list = lldList(28, 32);
  const e = lldEligibility(course(list), evidence(slugs(lldList(28, 30))));
  assert.equal(e.eligible, false);
  assert.equal(e.requirements[1].need, 32);
  assert.equal(e.stats.lessons.total, 60);
  assert.equal(lldEligibility(course(list), evidence(slugs(list))).eligible, true);
});

test("only completed records of the LLD folder count (same slug in another week doesn't)", () => {
  const list = lldList();
  const e = lldEligibility(course(list), evidence(slugs(list), "week-01-foundations"));
  assert.equal(e.stats.lessons.done, 0);
  // a course map without an lld list: nothing to earn
  const none = lldEligibility(courseShape({ weeks: [], mocks: [] }), evidence([]));
  assert.equal(none.eligible, false);
  assert.equal(none.stats.lessons.total, 58);
});

test("the course certificate's rules ignore the LLD track", () => {
  const list = lldList();
  const c = course(list);
  const withLld = courseEligibility(c, evidence(slugs(list)));
  const without = courseEligibility(c, evidence([]));
  assert.deepEqual(withLld.requirements.map((r) => [r.id, r.have]), without.requirements.map((r) => [r.id, r.have]));
  assert.equal(withLld.stats.lld, undefined);
});

test("LLD codes: LLD-XXXX-XXXX in the certificate alphabet, accepted by the verification page", () => {
  const fill = (b) => b.map((_, i) => i * 3);
  const code = generateCode("lld", null, fill);
  assert.match(code, /^LLD-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(isValidCode(code), true);
  assert.equal(normalizeCode(` ${code.toLowerCase()} `), code);
  assert.equal(normalizeCode("LLD-0000-1111"), null);
  assert.equal(normalizeCode("LLD-ABCD"), null);
  // the others are unchanged
  assert.match(generateCode("course", null, fill), /^SDM-/);
  assert.match(generateCode("world", 2, fill), /^W02-/);
  for (let i = 0; i < 50; i++) assert.ok(isValidCode(generateCode("lld", null)));
});

test("title, XP key and admin line", () => {
  assert.equal(certTitle("lld"), "System Design Mastery · Low-level design");
  assert.equal(certXpKey("lld"), "cert:lld");
  assert.equal(certXpOfKey("cert:lld"), CERT_XP.lld);
  assert.equal(certXpOfKey("cert:course"), CERT_XP.course);
  assert.equal(certXpOfKey("cert:world:week-02-x"), CERT_XP.world);
  const list = lldList();
  const e = lldEligibility(course(list), evidence(slugs(list)));
  assert.equal(evidenceLine("lld", { stats: e.stats }), "patterns 28/28 · case studies 30/30");
});

test("the evidence snapshot freezes the counts and flags lessons with no reading time", () => {
  const list = lldList();
  const ev = evidence(slugs(list));
  ev.lessons[`${LLD_WEEK}/lld-05-case-5`].seconds = 0;
  const c = course(list);
  const e = lldEligibility(c, ev);
  const snap = evidenceSnapshot(c, e, ev, new Date("2026-11-12T10:00:00.000Z"));
  assert.equal(snap.computedAt, "2026-11-12T10:00:00.000Z");
  assert.equal(snap.rules, "lld 28 patterns+30 case studies");
  assert.deepEqual(snap.stats.lld, { patterns: { done: 28, total: 28 }, cases: { done: 30, total: 30 } });
  assert.equal(snap.lessons.done, 58);
  assert.equal(snap.lessons.total, 58);
  assert.equal(snap.lessons.untracked, 1);
  assert.equal(snap.lessons.trackedSeconds, 57 * 900);
  assert.deepEqual(snap.trials, []);
  assert.deepEqual(snap.bosses, []);
  assert.equal(snap.mock, null);
  assert.equal(snap.flags.length, 1);
});

test("the migration only widens the checks, and its code pattern matches the generated codes", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261112_lld_certificate.sql"), "utf8");
  const body = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(body, /\b(DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|UPDATE\s+public|TRUNCATE|ALTER\s+COLUMN|POLICY|GRANT|REVOKE|DISABLE\s+ROW)/i);
  const drops = [...body.matchAll(/DROP CONSTRAINT IF EXISTS (\w+)/g)].map((m) => m[1]).sort();
  const adds = [...body.matchAll(/ADD CONSTRAINT (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(drops, ["certificates_code_format", "certificates_code_matches_kind", "certificates_kind", "certificates_world_key"]);
  assert.deepEqual(adds, drops);
  // every earlier kind and code format is still allowed
  for (const k of ["'course'", "'world'", "'dsa'", "'lld'"]) assert.ok(body.includes(k), k);
  for (const p of ["^SDM-", "^W[0-9]{2}-", "^DSA-", "^LLD-"]) assert.ok(body.includes(p), p);
  const re = new RegExp(body.match(/'(\^LLD-[^']+)'/)[1]);
  for (let i = 0; i < 50; i++) assert.match(generateCode("lld", null), re);
});
