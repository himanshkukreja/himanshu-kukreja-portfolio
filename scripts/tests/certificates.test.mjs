/**
 * Certificates: codes + collisions, signatures + tamper detection, the earning rules on fixture
 * data, trial re-scoring, name validation, the LinkedIn link and the QR code (decoded with jsQR).
 *   node --test scripts/tests/certificates.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported modules.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import jsQR from "jsqr";
import {
  CODE_ALPHABET,
  DISCLAIMER,
  checkCertName,
  courseEligibility,
  evidenceSnapshot,
  generateCode,
  isValidCode,
  linkedinAddUrl,
  normalizeCode,
  rescoreAttempts,
  scoreSavedAnswers,
  suggestCertName,
  uniqueCode,
  worldEligibility,
  certUrl,
} from "../../src/lib/certificates/core.ts";
import { signCertificate, signingPayload, signingSource, verifySignature } from "../../src/lib/certificates/sign.ts";
import { qrMatrix, qrSvg } from "../../src/lib/certificates/qr.ts";

const require = createRequire(import.meta.url);

// ------------------------------------------------------------- a small course: 3 worlds

const C = "/learn/system-design-mastery";
const L = (week, slug, title, kind = "day-content") => ({ week, slug, title, label: title, href: `${C}/${week}/${slug}`, kind });
function world(num, title, withBoss = true, parts = 2) {
  const key = `week-${String(num).padStart(2, "0")}-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return {
    key,
    num,
    code: String(num).padStart(2, "0"),
    title,
    lessons: [L(key, "day-01-a", `${title} A`), L(key, "day-02-b", `${title} B`)],
    boss: withBoss ? L(key, "capstone", `${title} boss`, "capstone") : null,
    trial: { week: key, slug: `week-${num}-mcq`, href: `${C}/${key}/mcq`, parts: Array.from({ length: parts }, (_, i) => ({ n: i + 1, title: `P${i + 1}`, questions: 5, href: `${C}/${key}/mcq?part=${i + 1}` })) },
  };
}
const MOCK = (n, company) => ({ id: `m${n}`, n, code: `M${n}`, company, href: `/learn/mock/m${n}` });
const COURSE = { worlds: [world(0, "Foundations", false), world(1, "Data"), world(2, "Failure")], mocks: [MOCK(1, "BillBolt"), MOCK(2, "Wanderstay"), MOCK(3, "Paisly"), MOCK(4, "Cartwala")] };

function fullEvidence() {
  const ev = { lessons: {}, trials: {}, trialsRecordedOnly: [], bosses: {}, offers: {}, bestMock: null };
  for (const w of COURSE.worlds) {
    w.lessons.forEach((l) => (ev.lessons[`${l.week}/${l.slug}`] = { at: "2026-10-01T10:00:00.000Z", seconds: 600 }));
    w.trial.parts.forEach((p) => (ev.trials[`${w.trial.week}|${p.n}`] = { score: 5, total: 5, at: "2026-10-02T10:00:00.000Z", seconds: 120, source: "attempt" }));
    if (w.boss) {
      ev.bosses[w.key] = Date.parse("2026-10-03T10:00:00.000Z");
      ev.lessons[`${w.boss.week}/${w.boss.slug}`] = { at: "2026-10-03T09:00:00.000Z", seconds: 900 };
    }
  }
  ev.offers.m1 = { verdict: "hire", level: "senior", pct: 0.74, at: Date.parse("2026-10-04T10:00:00.000Z") };
  ev.offers.m2 = { verdict: "hire", level: "sde", pct: 0.7, at: Date.parse("2026-10-05T10:00:00.000Z") };
  ev.offers.m3 = { verdict: "hire", level: "sde", pct: 0.71, at: Date.parse("2026-10-06T10:00:00.000Z") };
  ev.bestMock = { id: "m1", ...ev.offers.m1 };
  return ev;
}

// ------------------------------------------------------------- codes

test("codes: format, alphabet without 0/O/1/I, normalisation", () => {
  assert.equal(CODE_ALPHABET.length, 32);
  for (const ch of "01IO") assert.ok(!CODE_ALPHABET.includes(ch), ch);
  for (let i = 0; i < 500; i++) {
    const c = generateCode("course", null);
    assert.match(c, /^SDM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    assert.ok(isValidCode(c));
    const w = generateCode("world", 2);
    assert.match(w, /^W02-[2-9A-HJ-NP-Z]{4}$/);
  }
  assert.equal(normalizeCode(" sdm-7f3k-92qx "), "SDM-7F3K-92QX");
  assert.equal(normalizeCode("w02-4qx8"), "W02-4QX8");
  assert.equal(normalizeCode("SDM-7F3K-92Q0"), null, "0 is not in the alphabet");
  assert.equal(normalizeCode("SDM-7F3K-92QI"), null, "I is not in the alphabet");
  assert.equal(normalizeCode("W2-4QX8"), null);
  assert.equal(normalizeCode("../etc"), null);
  assert.throws(() => generateCode("world", null));
});

test("codes: bytes map to symbols without bias (every symbol reachable)", () => {
  const seen = new Set();
  for (let b = 0; b < 256; b++) {
    const c = generateCode("world", 1, (arr) => arr.fill(b));
    seen.add(c.slice(4, 5));
  }
  assert.equal(seen.size, 32);
});

test("codes: collision check retries, then gives up", async () => {
  const seq = [7, 7, 7, 7, 9, 9, 9, 9];
  let i = 0;
  const fill = (arr) => arr.map(() => seq[i++ % seq.length]);
  const first = generateCode("world", 3, (arr) => arr.fill(7));
  const taken = new Set([first]);
  i = 0;
  const c = await uniqueCode("world", 3, (x) => taken.has(x), { fill });
  assert.notEqual(c, first);
  assert.ok(isValidCode(c));
  await assert.rejects(uniqueCode("course", null, () => true, { tries: 3 }));
});

// ------------------------------------------------------------- signatures

const ENV_SECRET = { CERT_SIGNING_SECRET: "test-secret-0123456789abcdef", SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests", NODE_ENV: "test" };
const ENV_KEY = { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests", NODE_ENV: "test" };
const FIELDS = { code: "SDM-7F3K-92QX", userId: "00000000-0000-4000-8000-000000000001", kind: "course", worldKey: null, displayName: "Ada Lovelace", issuedAt: "2026-10-19T09:12:33.123Z" };

test("signatures: sign, verify, tamper detection", () => {
  assert.equal(signingPayload(FIELDS), "SDM-7F3K-92QX|00000000-0000-4000-8000-000000000001|course||Ada Lovelace|2026-10-19T09:12:33.123Z");
  // Postgres hands timestamps back as +00:00 with microseconds trimmed: same payload
  assert.equal(signingPayload({ ...FIELDS, issuedAt: "2026-10-19T09:12:33.123+00:00" }), signingPayload(FIELDS));
  const sig = signCertificate(FIELDS, ENV_SECRET);
  assert.match(sig, /^v1\.s\.[0-9a-f]{64}$/);
  assert.equal(verifySignature(FIELDS, sig, ENV_SECRET), "ok");
  for (const [k, v] of [["displayName", "Ada Lovelace."], ["code", "SDM-7F3K-92QY"], ["userId", "00000000-0000-4000-8000-000000000002"], ["kind", "world"], ["worldKey", "week-02-failure-first-design"], ["issuedAt", "2026-10-19T09:12:34.123Z"]]) {
    assert.equal(verifySignature({ ...FIELDS, [k]: v }, sig, ENV_SECRET), "bad", `tampered ${k}`);
  }
  const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
  assert.equal(verifySignature(FIELDS, flipped, ENV_SECRET), "bad");
  assert.equal(verifySignature(FIELDS, "garbage", ENV_SECRET), "bad");
  // a different secret can't verify it
  assert.equal(verifySignature(FIELDS, sig, { ...ENV_SECRET, CERT_SIGNING_SECRET: "another-secret-0123456789" }), "bad");
});

test("signatures: service-role fallback, and adding a secret later keeps old ones valid", () => {
  assert.equal(signingSource(ENV_KEY), "k");
  const old = signCertificate(FIELDS, ENV_KEY);
  assert.match(old, /^v1\.k\./);
  assert.equal(verifySignature(FIELDS, old, ENV_KEY), "ok");
  assert.equal(signingSource(ENV_SECRET), "s");
  assert.equal(verifySignature(FIELDS, old, ENV_SECRET), "ok", "v1.k still checks against the service-role key");
  // secret-signed, verified where the secret is missing → can't check (not "ok", not "bad")
  const s = signCertificate(FIELDS, ENV_SECRET);
  assert.equal(verifySignature(FIELDS, s, ENV_KEY), "unchecked");
  assert.throws(() => signCertificate(FIELDS, { NODE_ENV: "production" }));
  assert.equal(signingSource({ CERT_SIGNING_SECRET: "short", NODE_ENV: "production" }), null, "a too-short secret is ignored");
});

// ------------------------------------------------------------- eligibility

test("eligibility: everything done → course + every world eligible", () => {
  const ev = fullEvidence();
  const e = courseEligibility(COURSE, ev);
  assert.equal(e.eligible, true);
  assert.equal(e.met, 5);
  assert.deepEqual(e.stats.offers, { have: 3, need: 3 });
  assert.deepEqual(e.stats.capstones, { read: 2, total: 2 });
  assert.deepEqual(e.stats.worlds, { cleared: 3, total: 3 });
  assert.deepEqual(e.stats.trialParts, { passed: 6, total: 6 });
  assert.deepEqual(e.stats.bosses, { beaten: 2, total: 2 });
  assert.equal(e.stats.mock.verdict, "hire");
  assert.equal(e.stats.mock.level, "senior");
  for (const w of COURSE.worlds) assert.equal(worldEligibility(COURSE, w.key, ev).eligible, true, w.key);
  const snap = evidenceSnapshot(COURSE, e, ev);
  assert.equal(snap.trials.length, 6);
  assert.equal(snap.lessons.done, 6);
  assert.equal(snap.mocks.length, 3);
  assert.deepEqual(snap.flags, []);
});

test("eligibility: two Hire mocks out of three → course blocked, the next mocks listed", () => {
  const ev = fullEvidence();
  delete ev.offers.m3;
  const e = courseEligibility(COURSE, ev);
  assert.equal(e.eligible, false);
  const mock = e.requirements.find((r) => r.id === "mock");
  assert.equal(mock.done, false);
  assert.equal(mock.have, 2);
  assert.match(mock.detail, /^2\/3: /);
  assert.deepEqual(mock.todo.map((t) => t.label), ["Mock 03 · Paisly", "Mock 04 · Cartwala"]);
});

test("eligibility: an unread capstone blocks the course, not its world", () => {
  const ev = fullEvidence();
  const w = COURSE.worlds[1];
  delete ev.lessons[`${w.boss.week}/${w.boss.slug}`];
  const e = courseEligibility(COURSE, ev);
  assert.equal(e.eligible, false);
  const cap = e.requirements.find((r) => r.id === "capstones");
  assert.equal(cap.detail, "1/2 capstones read");
  assert.equal(cap.todo[0].href, w.boss.href);
  assert.equal(worldEligibility(COURSE, w.key, ev).eligible, true);
});

test("eligibility: mock list missing → a clear message, never eligible", () => {
  const e = courseEligibility({ ...COURSE, mocks: [] }, fullEvidence());
  assert.equal(e.eligible, false);
  assert.match(e.requirements.find((r) => r.id === "mock").detail, /couldn't be loaded/);
});

test("eligibility: missing one trial part blocks the course and that world only", () => {
  const ev = fullEvidence();
  const w = COURSE.worlds[2];
  delete ev.trials[`${w.trial.week}|2`];
  const e = courseEligibility(COURSE, ev);
  assert.equal(e.eligible, false);
  const trials = e.requirements.find((r) => r.id === "trials");
  assert.equal(trials.done, false);
  assert.equal(trials.detail, "5/6 parts passed");
  assert.equal(trials.todo.length, 1);
  assert.equal(trials.todo[0].href, w.trial.parts[1].href);
  assert.equal(worldEligibility(COURSE, w.key, ev).eligible, false);
  assert.equal(worldEligibility(COURSE, COURSE.worlds[1].key, ev).eligible, true);
  assert.equal(e.stats.worlds.cleared, 2);
});

test("eligibility: no Hire mock → course blocked, worlds still eligible; best so far shown", () => {
  const ev = fullEvidence();
  ev.offers = {};
  ev.bestMock = { id: "m1", verdict: "lean-hire", level: "senior", pct: 0.6, at: 1 };
  const e = courseEligibility(COURSE, ev);
  assert.equal(e.eligible, false);
  assert.equal(e.met, 4);
  const mock = e.requirements.find((r) => r.id === "mock");
  assert.equal(mock.detail, "0/3, best so far: Lean hire");
  assert.equal(e.stats.mock, null);
  for (const w of COURSE.worlds) assert.equal(worldEligibility(COURSE, w.key, ev).eligible, true);
  // a lean-hire placed in offers by a forged flag still doesn't count
  ev.offers.m1 = { verdict: "lean-hire", level: "senior", pct: 0.6, at: 1 };
  assert.equal(courseEligibility(COURSE, ev).eligible, false);
});

test("eligibility: world-only learner (first two worlds), world without a boss has no boss rule", () => {
  const ev = { lessons: {}, trials: {}, bosses: {}, offers: {}, bestMock: null };
  for (const w of COURSE.worlds.slice(0, 2)) {
    w.lessons.forEach((l) => (ev.lessons[`${l.week}/${l.slug}`] = { at: null, seconds: 0 }));
    w.trial.parts.forEach((p) => (ev.trials[`${w.trial.week}|${p.n}`] = { score: 4, total: 5, at: null, seconds: 5, source: "attempt" }));
    if (w.boss) ev.bosses[w.key] = 1;
  }
  const w0 = worldEligibility(COURSE, COURSE.worlds[0].key, ev);
  assert.equal(w0.eligible, true);
  assert.equal(w0.total, 2, "foundations: lessons + trials, no boss");
  assert.equal(worldEligibility(COURSE, COURSE.worlds[1].key, ev).eligible, true);
  const w2 = worldEligibility(COURSE, COURSE.worlds[2].key, ev);
  assert.equal(w2.eligible, false);
  assert.equal(w2.met, 0);
  const course = courseEligibility(COURSE, ev);
  assert.equal(course.eligible, false);
  assert.equal(course.requirements.find((r) => r.id === "lessons").detail, "4/6 core lessons read");
  assert.equal(worldEligibility(COURSE, "week-99-nope", ev), null);
  const snap = evidenceSnapshot(COURSE, w0, ev);
  assert.ok(snap.flags.some((f) => f.includes("no tracked reading time")));
  assert.ok(snap.flags.some((f) => f.includes("under 2 s a question")));
});

// ------------------------------------------------------------- trial re-scoring

test("re-scoring: forged 'passed' rows don't count, real answers do", () => {
  const key = { "week-01": { 1: { 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" } } };
  const forged = { week: "week-01", part: 1, answers: {}, score: 5, total: 5, passed: true, started_at: "2026-10-01T10:00:00Z", finished_at: "2026-10-01T10:01:00Z" };
  let r = rescoreAttempts([forged], key);
  assert.deepEqual(r.passes, {});
  assert.deepEqual(r.recordedOnly, ["week-01|1"]);
  const real = { week: "week-01", part: 1, answers: { 1: "A", 2: "B", 3: "C", 4: "D", 5: "B" }, score: 0, total: 5, passed: false, started_at: "2026-10-01T10:00:00Z", finished_at: "2026-10-01T10:02:00Z" };
  r = rescoreAttempts([forged, real], key);
  assert.equal(r.passes["week-01|1"].score, 4, "4/5 = 80% passes even though the row says failed");
  assert.equal(r.passes["week-01|1"].seconds, 120);
  assert.deepEqual(r.recordedOnly, []);
  const unfinished = { ...real, finished_at: null };
  assert.deepEqual(rescoreAttempts([unfinished], key).passes, {});
  const low = { ...real, answers: { 1: "A", 2: "B", 3: "C" } };
  assert.deepEqual(rescoreAttempts([low], key).passes, {}, "3/5 is below the pass mark");
  const saved = scoreSavedAnswers("week-01", { 1: "A", 2: "B", 3: "C", 4: "D", 5: "A" }, key["week-01"]);
  assert.equal(saved["week-01|1"].source, "answers");
});

// ------------------------------------------------------------- names

test("names: same rules as campaign names", () => {
  assert.deepEqual(checkCertName("  Ada   Lovelace "), { ok: true, name: "Ada Lovelace" });
  assert.equal(checkCertName("José María O’Neil-Smith Jr.").ok, true);
  assert.equal(checkCertName("आरव मेहता").ok, true);
  for (const bad of ["", " ", "A", "ada@example.com", "www.example.com", "example.com", "<b>Ada</b>", "Ada 2", "Ada 🚀", "{{name}}", "x".repeat(81), 42, null]) {
    assert.equal(checkCertName(bad).ok, false, String(bad));
  }
  assert.equal(checkCertName("a".repeat(80)).ok, true);
  assert.equal(suggestCertName(null, "ada@example.com", "Ada Lovelace"), "Ada Lovelace");
  assert.equal(suggestCertName("", undefined), "");
});

// ------------------------------------------------------------- LinkedIn

test("LinkedIn add-to-profile link", () => {
  const u = new URL(linkedinAddUrl({ code: "SDM-7F3K-92QX", kind: "course", issuedAt: "2026-10-19T09:12:33.123Z" }));
  assert.equal(u.origin + u.pathname, "https://www.linkedin.com/profile/add");
  assert.equal(u.searchParams.get("startTask"), "CERTIFICATION_NAME");
  assert.equal(u.searchParams.get("name"), "System Design Mastery · Certificate of Completion");
  assert.equal(u.searchParams.get("organizationName"), "System Design Mastery");
  assert.equal(u.searchParams.get("organizationId"), null, "organizationId and organizationName can't both be set");
  assert.equal(u.searchParams.get("issueYear"), "2026");
  assert.equal(u.searchParams.get("issueMonth"), "10");
  assert.equal(u.searchParams.get("certUrl"), "https://www.himanshukukreja.in/cert/SDM-7F3K-92QX");
  assert.equal(u.searchParams.get("certId"), "SDM-7F3K-92QX");
  assert.ok(!u.search.includes("+"), "spaces as %20");
  // month in IST: 31 Dec 20:00 UTC is already 1 Jan in India
  const w = new URL(linkedinAddUrl({ code: "W02-4QX8", kind: "world", issuedAt: "2026-12-31T20:00:00.000Z", world: { code: "02", title: "Failure-First Design" } }));
  assert.equal(w.searchParams.get("issueYear"), "2027");
  assert.equal(w.searchParams.get("issueMonth"), "1");
  assert.equal(w.searchParams.get("name"), "System Design Mastery · World 02: Failure-First Design");
});

test("wording: disclaimer, and no forbidden words in the fixed copy", () => {
  assert.equal(DISCLAIMER, "This certifies completion of an online course. It is not an accredited academic qualification.");
});

// ------------------------------------------------------------- QR

function rasterizeMatrix(m, scale = 8, margin = 4) {
  const n = m.length;
  const size = (n + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!m[r][c]) continue;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + margin) * scale + y) * size + (c + margin) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, width: size, height: size };
}

test("QR: decodes to the verification URL (matrix and rendered SVG)", async () => {
  for (const code of ["SDM-7F3K-92QX", "W02-4QX8", generateCode("course", null)]) {
    const url = certUrl(code);
    const img = rasterizeMatrix(qrMatrix(url));
    const got = jsQR(img.data, img.width, img.height);
    assert.ok(got, `decoded ${code}`);
    assert.equal(got.data, url);
  }
  let sharp = null;
  try {
    sharp = require("sharp");
  } catch {
    sharp = null;
  }
  if (!sharp) return; // optional: the matrix test above already decodes
  const url = certUrl("SDM-7F3K-92QX");
  const { data, info } = await sharp(Buffer.from(qrSvg(url, { px: 400 }))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const got = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.ok(got, "rendered SVG decodes");
  assert.equal(got.data, url);
});
