/**
 * Certificates for System Design Mastery: codes, names, wording, the LinkedIn link, trial
 * re-scoring and the earning rules. Pure and self-contained (type-only imports), so the learner
 * flow, the verification page, the server and the Node tests (scripts/tests/certificates.test.mjs)
 * all use the same rules.
 *
 * Earning rules (checked on the server from the database, never from the browser):
 *   course certificate  every core lesson completed (learning_progress), every world's capstone
 *                       interview read (learning_progress for the boss lesson), every trial part
 *                       passed (trial_attempts answers re-scored against the answer key), every
 *                       world's boss beaten (game_done `boss:<week>`), and MOCKS_NEEDED different mock
 *                       interviews at Hire or better (game_done `offer:<id>` + its game_flags
 *                       `mock:<id>` scorecard)
 *   world certificate   that world's lessons, its trial parts and its boss (when it has one)
 */

/* ------------------------------------------------------------------ wording */

export const CERT_ORIGIN = "https://www.himanshukukreja.in";
export const CERT_HOST = "himanshukukreja.in";
export const ISSUER = "System Design Mastery";
export const SIGNER = "Himanshu Kukreja";
export const SIGNER_ROLE = "Creator & instructor";
export const CERT_TITLE = "Certificate of Completion";
/** Required on the certificate, the PDF and the verification page. */
export const DISCLAIMER = "This certifies completion of an online course. It is not an accredited academic qualification.";

/** XP for claiming (game keys `cert:course` / `cert:world:<week>`). */
export const CERT_XP = { course: 500, world: 150 } as const;
export const certXpKey = (kind: CertKind, worldKey?: string | null) => (kind === "course" ? "cert:course" : `cert:world:${worldKey}`);

/** Pass mark for a trial part: 80 %, rounded up (same as the trial engine). */
export const passMark = (n: number) => Math.ceil(n * 0.8);
export const TRIAL_PASS_PCT = 80;
/** Different mock interviews the course certificate needs at Hire or better. */
export const MOCKS_NEEDED = 3;
/** Mock verdicts that count (Hire or better). */
export const OFFER_VERDICTS = ["hire", "strong-hire"] as const;
const VERDICT_ORDER = ["strong-no-hire", "no-hire", "lean-no-hire", "lean-hire", "hire", "strong-hire"];
export const VERDICT_TEXT: Record<string, string> = {
  "strong-no-hire": "Strong no hire",
  "no-hire": "No hire",
  "lean-no-hire": "Lean no hire",
  "lean-hire": "Lean hire",
  hire: "Hire",
  "strong-hire": "Strong hire",
};
export const LEVEL_TEXT: Record<string, string> = { junior: "Junior", sde: "SDE", senior: "Senior", staff: "Staff" };

/* ------------------------------------------------------------------ codes */

export type CertKind = "course" | "world";

/** 32 symbols: digits 2–9 and A–Z without I and O (no 0/O, 1/I mix-ups). 32 divides 256, so bytes map without bias. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SYM = "[2-9A-HJ-NP-Z]";
export const COURSE_CODE_RE = new RegExp(`^SDM-${SYM}{4}-${SYM}{4}$`);
export const WORLD_CODE_RE = new RegExp(`^W\\d{2}-${SYM}{4}$`);

export const isValidCode = (c: string) => COURSE_CODE_RE.test(c) || WORLD_CODE_RE.test(c);

/** What a visitor typed or pasted → canonical form (upper case, no spaces); null when it can't be a code. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as is */
  }
  s = s.trim().replace(/\s+/g, "").toUpperCase();
  return isValidCode(s) ? s : null;
}

type RandomFill = (bytes: Uint8Array) => Uint8Array;
const defaultFill: RandomFill = (b) => globalThis.crypto.getRandomValues(b);

function symbols(n: number, fill: RandomFill): string {
  const bytes = fill(new Uint8Array(n));
  let out = "";
  for (let i = 0; i < n; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return out;
}

/** A fresh code: SDM-7F3K-92QX (course, 40 random bits) or W02-4QX8 (world, 20 random bits). */
export function generateCode(kind: CertKind, worldNum: number | null, fill: RandomFill = defaultFill): string {
  if (kind === "course") {
    const s = symbols(8, fill);
    return `SDM-${s.slice(0, 4)}-${s.slice(4)}`;
  }
  if (worldNum === null || !Number.isInteger(worldNum) || worldNum < 0 || worldNum > 99) throw new Error("world number required");
  return `W${String(worldNum).padStart(2, "0")}-${symbols(4, fill)}`;
}

/**
 * Pick a code that `taken` doesn't know. The database's unique index is the real guard (the insert
 * retries on a collision); this keeps the retry loop testable.
 */
export async function uniqueCode(kind: CertKind, worldNum: number | null, taken: (code: string) => boolean | Promise<boolean>, opts: { fill?: RandomFill; tries?: number } = {}): Promise<string> {
  const tries = opts.tries ?? 8;
  for (let i = 0; i < tries; i++) {
    const c = generateCode(kind, worldNum, opts.fill);
    if (!(await taken(c))) return c;
  }
  throw new Error("could not find a free certificate code");
}

/** "an 11-world course", "a 12-world course" */
export const worldsPhrase = (n: number | null | undefined): string =>
  !n ? "a multi-world course" : worldsPhraseN(n);
const worldsPhraseN = (n: number) => `${/^(8|11|18)(\D|$)/.test(String(n)) || /^8/.test(String(n)) ? "an" : "a"} ${n}-world course`;

export const certPath = (code: string) => `/cert/${code}`;
export const certUrl = (code: string) => `${CERT_ORIGIN}${certPath(code)}`;
export const certPrintPath = (code: string) => `/cert/${code}/print`;
/** "himanshukukreja.in/cert/SDM-7F3K-92QX" */
export const certDisplayUrl = (code: string) => `${CERT_HOST}${certPath(code)}`;

/* ------------------------------------------------------------------ names */

export const NAME_MAX = 80;
const clean = (s: string) => s.replace(/[\s  -​  　]+/g, " ").trim();
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;
const ALLOWED_RE = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;
const DOMAIN_RE = /[\p{L}\d-]\.(com|in|net|org|io|dev|me|co|ai|app|xyz|info|biz|edu|gov|uk|us)\b/iu;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/**
 * The name printed on a certificate (same rules as campaign names, src/lib/campaigns/names-core.ts):
 * 2–80 characters after trimming; letters of any script, spaces, apostrophes, hyphens and periods;
 * no emails, web addresses, HTML, digits or emoji.
 */
export function checkCertName(raw: unknown): NameCheck {
  if (typeof raw !== "string") return { ok: false, error: "Enter the name for your certificate." };
  const name = clean(raw);
  if (!name) return { ok: false, error: "Enter the name for your certificate." };
  if (name.length > NAME_MAX) return { ok: false, error: `That's too long (${name.length}/${NAME_MAX} characters).` };
  if (name.includes("@")) return { ok: false, error: "That looks like an email address, not a name." };
  if (/:\/\/|www\.|^https?\b/i.test(name) || DOMAIN_RE.test(name)) return { ok: false, error: "That looks like a web address, not a name." };
  if (/[<>]|&[a-z#0-9]+;/i.test(name)) return { ok: false, error: "Names can't contain HTML." };
  if (/[{}]/.test(name)) return { ok: false, error: "Names can't contain { or }." };
  if (EMOJI_RE.test(name)) return { ok: false, error: "Names can't contain emoji." };
  if (/\d/.test(name)) return { ok: false, error: "Names can't contain digits." };
  if (!ALLOWED_RE.test(name)) return { ok: false, error: "Use letters, spaces, apostrophes, hyphens and periods only." };
  if ((name.match(/\p{L}/gu) || []).length < 2) return { ok: false, error: "That's too short (at least 2 letters)." };
  return { ok: true, name };
}

/** A prefill that passes checkCertName, or "" (the learner types it). */
export function suggestCertName(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (!c) continue;
    const r = checkCertName(c);
    if (r.ok) return r.name;
  }
  return "";
}

/* ------------------------------------------------------------------ dates + LinkedIn */

const IST = "Asia/Kolkata";

/** "19 Oct 2026" (issuer's day, IST). */
export function fmtCertDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });
}

function istParts(iso: string): { year: number; month: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "numeric", timeZone: IST }).formatToParts(d);
  return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
}

/** Certification name shown on LinkedIn and in share text. */
export function certTitle(kind: CertKind, world?: { code: string; title: string } | null): string {
  if (kind === "course") return `${ISSUER} · ${CERT_TITLE}`;
  return `${ISSUER} · World ${world?.code ?? ""}: ${world?.title ?? ""}`.trim();
}

/**
 * LinkedIn "Add to profile" link (Licenses & certifications, prefilled):
 * https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=…&organizationName=…
 * &issueYear=YYYY&issueMonth=M&certUrl=…&certId=… — organizationName because the course has no
 * LinkedIn company page (organizationId and organizationName can't be combined). No expiry.
 */
export function linkedinAddUrl(c: { code: string; kind: CertKind; issuedAt: string; world?: { code: string; title: string } | null }): string {
  const { year, month } = istParts(c.issuedAt);
  const q = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: certTitle(c.kind, c.world),
    organizationName: ISSUER,
    issueYear: String(year),
    issueMonth: String(month),
    certUrl: certUrl(c.code),
    certId: c.code,
  });
  // URLSearchParams writes spaces as "+"; LinkedIn's own examples use %20
  return `https://www.linkedin.com/profile/add?${q.toString().replace(/\+/g, "%20")}`;
}

/* ------------------------------------------------------------------ course shape */

export type CertLesson = { week: string; slug: string; title: string; label: string; href: string; kind: string };
export type CertPart = { n: number; title: string; questions: number; href: string };
export type CertWorld = {
  key: string;
  num: number;
  /** "02" */
  code: string;
  title: string;
  lessons: CertLesson[];
  boss: CertLesson | null;
  trial: { week: string; slug: string; href: string; parts: CertPart[] } | null;
};
export type CertMock = { id: string; n: number; code: string; company: string; href: string };
export type CertCourse = { worlds: CertWorld[]; mocks: CertMock[] };

/** Course map → the slice the rules need (plain JSON). */
export function courseShape(map: {
  weeks: { key: string; num: number; code: string; title: string; lessons: CertLesson[]; boss: CertLesson | null; trial: { week: string; slug: string; href: string; parts: CertPart[] } | null }[];
  mocks?: { id: string; n: number; code: string; company: string; href: string }[];
}): CertCourse {
  const lesson = (l: CertLesson): CertLesson => ({ week: l.week, slug: l.slug, title: l.title, label: l.label, href: l.href, kind: l.kind });
  return {
    worlds: map.weeks.map((w) => ({
      key: w.key,
      num: w.num,
      code: w.code,
      title: w.title,
      lessons: w.lessons.map(lesson),
      boss: w.boss ? lesson(w.boss) : null,
      trial: w.trial ? { week: w.trial.week, slug: w.trial.slug, href: w.trial.href, parts: w.trial.parts.map((p) => ({ n: p.n, title: p.title, questions: p.questions, href: p.href })) } : null,
    })),
    mocks: (map.mocks || []).map((m) => ({ id: m.id, n: m.n, code: m.code, company: m.company, href: m.href })),
  };
}

/** Day topics for the world certificate (days, or the foundations parts). */
export const worldTopics = (w: CertWorld) => {
  const days = w.lessons.filter((l) => l.kind === "day-content" || l.kind === "foundations");
  return (days.length ? days : w.lessons).map((l) => l.title).slice(0, 6);
};

/* ------------------------------------------------------------------ trial re-scoring */

/** Answer key per trial: part number → question number → correct ORIGINAL letter. */
export type TrialKey = Record<number, Record<number, string>>;

export type AttemptRow = { week: string; part: number; answers: Record<string, string> | null; score: number | null; total: number | null; passed: boolean | null; started_at: string | null; finished_at: string | null };

export type TrialPass = { score: number; total: number; at: string | null; seconds: number | null; source: "attempt" | "answers" };

/**
 * Re-score finished attempts against the answer key. A part counts only if the stored answers
 * really reach the pass mark; the attempt's own `score` / `passed` (written by the browser) are not
 * trusted. Best result per `${week}|${part}`; `recordedOnly` lists parts marked passed whose answers
 * don't reproduce the pass (forged, or the questions changed since).
 */
export function rescoreAttempts(rows: AttemptRow[], keys: Record<string, TrialKey>): { passes: Record<string, TrialPass>; recordedOnly: string[] } {
  const passes: Record<string, TrialPass> = {};
  const recorded = new Set<string>();
  for (const r of rows) {
    if (!r || !r.finished_at || typeof r.week !== "string") continue;
    const id = `${r.week}|${r.part}`;
    const key = keys[r.week]?.[r.part];
    if (r.passed) recorded.add(id);
    if (!key) continue;
    const qs = Object.keys(key).map(Number);
    if (!qs.length) continue;
    let score = 0;
    for (const q of qs) if (r.answers && r.answers[String(q)] === key[q]) score++;
    if (score < passMark(qs.length)) continue;
    const started = r.started_at ? Date.parse(r.started_at) : NaN;
    const finished = Date.parse(r.finished_at);
    const seconds = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, Math.round((finished - started) / 1000)) : null;
    const prev = passes[id];
    if (!prev || score > prev.score || (score === prev.score && (prev.at || "") > r.finished_at)) passes[id] = { score, total: qs.length, at: r.finished_at, seconds, source: "attempt" };
  }
  return { passes, recordedOnly: [...recorded].filter((id) => !passes[id]) };
}

/** Saved answers of the older MCQ screen (one answer per question) scored per part. */
export function scoreSavedAnswers(week: string, answers: Record<string, string>, key: TrialKey): Record<string, TrialPass> {
  const out: Record<string, TrialPass> = {};
  for (const [p, qs] of Object.entries(key)) {
    const nums = Object.keys(qs).map(Number);
    if (!nums.length) continue;
    const score = nums.filter((q) => answers[String(q)] === qs[q]).length;
    if (score >= passMark(nums.length)) out[`${week}|${p}`] = { score, total: nums.length, at: null, seconds: null, source: "answers" };
  }
  return out;
}

/* ------------------------------------------------------------------ learner evidence */

export type MockResult = { verdict: string; level: string; pct: number; at: number };

/** Everything the rules read, already loaded from the database. */
export type LearnerEvidence = {
  /** completed core lessons (learning_progress) → completion time + tracked seconds */
  lessons: Record<string, { at: string | null; seconds: number }>;
  /** re-scored trial passes keyed `${trialWeek}|${part}` */
  trials: Record<string, TrialPass>;
  /** parts marked passed whose answers don't reach the pass mark */
  trialsRecordedOnly?: string[];
  /** game_done `boss:<week>` → epoch ms */
  bosses: Record<string, number>;
  /** game_done `offer:<id>` with a game_flags `mock:<id>` scorecard at Hire or better */
  offers: Record<string, MockResult>;
  /** best scored mock of any verdict (for "best so far") */
  bestMock: (MockResult & { id: string }) | null;
};

export const lessonKey = (week: string, slug: string) => `${week}/${slug}`;

export type TodoItem = { label: string; href: string; note?: string };

export type ReqId = "lessons" | "capstones" | "trials" | "bosses" | "mock";

export type Requirement = {
  id: ReqId;
  label: string;
  detail: string;
  done: boolean;
  have: number;
  need: number;
  /** what's left, in course order (the UI shows the first few) */
  todo: TodoItem[];
  /** where to go to finish it */
  href: string;
  hrefLabel: string;
};

export type CertStats = {
  worlds: { cleared: number; total: number };
  lessons: { done: number; total: number };
  trialParts: { passed: number; total: number };
  bosses: { beaten: number; total: number };
  mock: { id: string; n: number; company: string; verdict: string; level: string } | null;
  /** different mocks at Hire or better (course certificates issued before 28 Oct 2026 don't have it) */
  offers?: { have: number; need: number };
  /** capstone interviews read (same) */
  capstones?: { read: number; total: number };
};

export type Eligibility = {
  kind: CertKind;
  world: string | null;
  eligible: boolean;
  met: number;
  total: number;
  requirements: Requirement[];
  stats: CertStats;
};

const partLabel = (w: CertWorld, p: CertPart) => `W${w.code} · Part ${p.n} · ${p.title}`;
const trialPassedIn = (ev: LearnerEvidence, w: CertWorld, n: number) => !!w.trial && (!!ev.trials[`${w.trial.week}|${n}`] || !!ev.trials[`${w.key}|${n}`]);
const recordedIn = (ev: LearnerEvidence, w: CertWorld, n: number) => !!w.trial && !!ev.trialsRecordedOnly?.some((id) => id === `${w.trial!.week}|${n}` || id === `${w.key}|${n}`);

function worldProgress(w: CertWorld, ev: LearnerEvidence) {
  const lessonsDone = w.lessons.filter((l) => !!ev.lessons[lessonKey(l.week, l.slug)]);
  const parts = w.trial?.parts || [];
  const partsPassed = parts.filter((p) => trialPassedIn(ev, w, p.n));
  const bossDone = !w.boss || !!ev.bosses[w.key];
  const cleared = lessonsDone.length === w.lessons.length && partsPassed.length === parts.length && bossDone && w.lessons.length + parts.length > 0;
  return { lessonsDone, partsPassed, bossDone, cleared };
}

function lessonsReq(worlds: CertWorld[], ev: LearnerEvidence, scope: "course" | "world"): Requirement {
  const all = worlds.flatMap((w) => w.lessons.map((l) => ({ w, l })));
  const done = all.filter(({ l }) => !!ev.lessons[lessonKey(l.week, l.slug)]).length;
  return {
    id: "lessons",
    label: scope === "course" ? `Read all ${all.length} core lessons` : `Read all ${all.length} lessons of the world`,
    detail: `${done}/${all.length} ${scope === "course" ? "core lessons" : "lessons"} read`,
    done: all.length > 0 && done === all.length,
    have: done,
    need: all.length,
    todo: all.filter(({ l }) => !ev.lessons[lessonKey(l.week, l.slug)]).map(({ w, l }) => ({ label: `W${w.code} · ${l.label}`, href: l.href })),
    href: all.find(({ l }) => !ev.lessons[lessonKey(l.week, l.slug)])?.l.href || "/learn/system-design-mastery",
    hrefLabel: "Continue reading",
  };
}

function trialsReq(worlds: CertWorld[], ev: LearnerEvidence, scope: "course" | "world"): Requirement {
  const all = worlds.flatMap((w) => (w.trial?.parts || []).map((p) => ({ w, p })));
  const passed = all.filter(({ w, p }) => trialPassedIn(ev, w, p.n)).length;
  const todo = all
    .filter(({ w, p }) => !trialPassedIn(ev, w, p.n))
    .map(({ w, p }) => ({ label: partLabel(w, p), href: p.href, note: recordedIn(ev, w, p.n) ? "retake: the saved answers don't reach 80% on the current questions" : undefined }));
  return {
    id: "trials",
    label: scope === "course" ? `Pass every trial part at ${TRIAL_PASS_PCT}%+` : `Pass its ${all.length} trial parts at ${TRIAL_PASS_PCT}%+`,
    detail: `${passed}/${all.length} parts passed`,
    done: all.length > 0 && passed === all.length,
    have: passed,
    need: all.length,
    todo,
    href: todo[0]?.href || "/learn/system-design-mastery",
    hrefLabel: "Take the next part",
  };
}

function bossesReq(worlds: CertWorld[], ev: LearnerEvidence, scope: "course" | "world"): Requirement {
  const all = worlds.filter((w) => w.boss);
  const beaten = all.filter((w) => !!ev.bosses[w.key]).length;
  const todo = all.filter((w) => !ev.bosses[w.key]).map((w) => ({ label: `W${w.code} boss · ${w.boss!.title}`, href: w.boss!.href }));
  return {
    id: "bosses",
    label: scope === "course" ? `Beat all ${all.length} interview bosses` : "Beat the world's boss",
    detail: scope === "course" ? `${beaten}/${all.length} bosses` : beaten ? "Boss beaten" : "Boss not beaten yet",
    done: beaten === all.length,
    have: beaten,
    need: all.length,
    todo,
    href: todo[0]?.href || "/learn/system-design-mastery",
    hrefLabel: "Fight the boss",
  };
}

function capstonesReq(worlds: CertWorld[], ev: LearnerEvidence): Requirement {
  const all = worlds.filter((w) => w.boss);
  const unread = all.filter((w) => !ev.lessons[lessonKey(w.boss!.week, w.boss!.slug)]);
  const read = all.length - unread.length;
  return {
    id: "capstones",
    label: `Read all ${all.length} capstone interviews`,
    detail: `${read}/${all.length} capstones read`,
    done: all.length > 0 && !unread.length,
    have: read,
    need: all.length,
    todo: unread.map((w) => ({ label: `W${w.code} capstone · ${w.boss!.title}`, href: w.boss!.href })),
    href: unread[0]?.boss!.href || "/learn/system-design-mastery",
    hrefLabel: "Read the next capstone",
  };
}

/** Mocks at Hire or better, best first. */
function offersIn(ev: LearnerEvidence, mocks: CertMock[]): { mock: CertMock; r: MockResult }[] {
  return mocks
    .filter((m) => ev.offers[m.id] && (OFFER_VERDICTS as readonly string[]).includes(ev.offers[m.id].verdict))
    .map((m) => ({ mock: m, r: ev.offers[m.id] }))
    .sort((a, b) => VERDICT_ORDER.indexOf(b.r.verdict) - VERDICT_ORDER.indexOf(a.r.verdict) || b.r.pct - a.r.pct);
}

function bestOffer(ev: LearnerEvidence, mocks: CertMock[]): { mock: CertMock; r: MockResult } | null {
  let best: { mock: CertMock; r: MockResult } | null = null;
  for (const m of mocks) {
    const r = ev.offers[m.id];
    if (!r || !(OFFER_VERDICTS as readonly string[]).includes(r.verdict)) continue;
    if (!best || VERDICT_ORDER.indexOf(r.verdict) > VERDICT_ORDER.indexOf(best.r.verdict) || (r.verdict === best.r.verdict && r.pct > best.r.pct)) best = { mock: m, r };
  }
  return best;
}

function mockReq(course: CertCourse, ev: LearnerEvidence): Requirement {
  const offers = offersIn(ev, course.mocks);
  const have = Math.min(offers.length, MOCKS_NEEDED);
  const so = ev.bestMock ? `best so far: ${VERDICT_TEXT[ev.bestMock.verdict] || ev.bestMock.verdict}` : "no scored mock interview yet";
  // the mock list failed to load (or the course has too few): say so instead of an impossible checklist
  const missing = course.mocks.length < MOCKS_NEEDED;
  return {
    id: "mock",
    label: `Score Hire or better on ${MOCKS_NEEDED} different mock interviews`,
    detail: missing
      ? "The mock interviews couldn't be loaded. Try again in a few minutes."
      : offers.length
        ? `${have}/${MOCKS_NEEDED}: ${offers
            .slice(0, MOCKS_NEEDED)
            .map((o) => `Mock ${String(o.mock.n).padStart(2, "0")} · ${o.mock.company} · ${VERDICT_TEXT[o.r.verdict]}`)
            .join(", ")}`
        : `0/${MOCKS_NEEDED}, ${so}`,
    done: !missing && offers.length >= MOCKS_NEEDED,
    have,
    need: MOCKS_NEEDED,
    todo: course.mocks.filter((m) => !offers.some((o) => o.mock.id === m.id)).map((m) => ({ label: `Mock ${String(m.n).padStart(2, "0")} · ${m.company}`, href: m.href })),
    href: "/learn/mock",
    hrefLabel: "Sit a mock interview",
  };
}

function statsFor(worlds: CertWorld[], course: CertCourse, ev: LearnerEvidence, withMock: boolean): CertStats {
  const lessons = worlds.flatMap((w) => w.lessons);
  const parts = worlds.flatMap((w) => (w.trial?.parts || []).map((p) => ({ w, p })));
  const bosses = worlds.filter((w) => w.boss);
  const best = withMock ? bestOffer(ev, course.mocks) : null;
  return {
    worlds: { cleared: worlds.filter((w) => worldProgress(w, ev).cleared).length, total: worlds.length },
    lessons: { done: lessons.filter((l) => !!ev.lessons[lessonKey(l.week, l.slug)]).length, total: lessons.length },
    trialParts: { passed: parts.filter(({ w, p }) => trialPassedIn(ev, w, p.n)).length, total: parts.length },
    bosses: { beaten: bosses.filter((w) => !!ev.bosses[w.key]).length, total: bosses.length },
    mock: best ? { id: best.mock.id, n: best.mock.n, company: best.mock.company, verdict: best.r.verdict, level: best.r.level } : null,
    ...(withMock
      ? {
          offers: { have: Math.min(offersIn(ev, course.mocks).length, MOCKS_NEEDED), need: MOCKS_NEEDED },
          capstones: { read: bosses.filter((w) => !!ev.lessons[lessonKey(w.boss!.week, w.boss!.slug)]).length, total: bosses.length },
        }
      : {}),
  };
}

/** The course certificate's checklist. */
export function courseEligibility(course: CertCourse, ev: LearnerEvidence): Eligibility {
  const reqs = [lessonsReq(course.worlds, ev, "course"), capstonesReq(course.worlds, ev), trialsReq(course.worlds, ev, "course"), bossesReq(course.worlds, ev, "course"), mockReq(course, ev)];
  const met = reqs.filter((r) => r.done).length;
  return { kind: "course", world: null, eligible: course.worlds.length > 0 && met === reqs.length, met, total: reqs.length, requirements: reqs, stats: statsFor(course.worlds, course, ev, true) };
}

/** One world's checklist (no boss requirement for a world without one, e.g. the foundations). */
export function worldEligibility(course: CertCourse, worldKey: string, ev: LearnerEvidence): Eligibility | null {
  const w = course.worlds.find((x) => x.key === worldKey);
  if (!w) return null;
  const reqs = [lessonsReq([w], ev, "world"), trialsReq([w], ev, "world"), ...(w.boss ? [bossesReq([w], ev, "world")] : [])];
  const met = reqs.filter((r) => r.done).length;
  return { kind: "world", world: w.key, eligible: met === reqs.length, met, total: reqs.length, requirements: reqs, stats: statsFor([w], course, ev, false) };
}

/* ------------------------------------------------------------------ evidence snapshot */

export type EvidenceSnapshot = {
  v: 1;
  computedAt: string;
  rules: string;
  stats: CertStats;
  lessons: { done: number; total: number; trackedSeconds: number; untracked: number };
  trials: { id: string; score: number; total: number; seconds: number | null; source: TrialPass["source"]; at: string | null }[];
  bosses: { week: string; at: string }[];
  mock: (MockResult & { id: string }) | null;
  /** every mock at Hire or better at issue time (course certificates from 28 Oct 2026) */
  mocks?: (MockResult & { id: string })[];
  /** things an admin may want to look at (never shown publicly) */
  flags: string[];
};

/** Fast trial runs (under 2 s a question) and lessons with no tracked reading time are flagged, not refused. */
export function evidenceSnapshot(course: CertCourse, e: Eligibility, ev: LearnerEvidence, now = new Date()): EvidenceSnapshot {
  const worlds = e.kind === "course" ? course.worlds : course.worlds.filter((w) => w.key === e.world);
  const lessons = worlds.flatMap((w) => w.lessons).map((l) => ev.lessons[lessonKey(l.week, l.slug)]).filter(Boolean) as { at: string | null; seconds: number }[];
  const trials = worlds.flatMap((w) =>
    (w.trial?.parts || []).map((p) => {
      const id = ev.trials[`${w.trial!.week}|${p.n}`] ? `${w.trial!.week}|${p.n}` : `${w.key}|${p.n}`;
      const t = ev.trials[id];
      return t ? { id, score: t.score, total: t.total, seconds: t.seconds, source: t.source, at: t.at } : null;
    })
  ).filter(Boolean) as EvidenceSnapshot["trials"];
  const bosses = worlds.filter((w) => w.boss && ev.bosses[w.key]).map((w) => ({ week: w.key, at: new Date(ev.bosses[w.key]).toISOString() }));
  const flags: string[] = [];
  const fast = trials.filter((t) => t.seconds !== null && t.seconds < t.total * 2);
  if (fast.length) flags.push(`${fast.length} trial part${fast.length === 1 ? "" : "s"} finished in under 2 s a question`);
  const untracked = lessons.filter((l) => !l.seconds).length;
  if (untracked) flags.push(`${untracked} lesson${untracked === 1 ? "" : "s"} with no tracked reading time (imported or read elsewhere)`);
  const answersOnly = trials.filter((t) => t.source === "answers").length;
  if (answersOnly) flags.push(`${answersOnly} trial part${answersOnly === 1 ? "" : "s"} from saved answers of the older quiz screen`);
  const best = e.stats.mock ? ev.offers[e.stats.mock.id] : null;
  return {
    v: 1,
    computedAt: now.toISOString(),
    rules: e.kind === "course" ? `lessons+capstones+trials+bosses+${MOCKS_NEEDED}mocks` : "world lessons+trials+boss",
    stats: e.stats,
    lessons: { done: lessons.length, total: worlds.reduce((a, w) => a + w.lessons.length, 0), trackedSeconds: lessons.reduce((a, l) => a + (l.seconds || 0), 0), untracked },
    trials,
    bosses,
    mock: best && e.stats.mock ? { ...best, id: e.stats.mock.id } : null,
    ...(e.kind === "course" ? { mocks: offersIn(ev, course.mocks).map((o) => ({ ...o.r, id: o.mock.id })) } : {}),
    flags,
  };
}

/** "66/66 · 10/10 · Hire" / "trial 6/6 · boss" for the admin table. */
export function evidenceLine(kind: CertKind, ev: Partial<EvidenceSnapshot> | null | undefined): string {
  const s = ev?.stats;
  if (!s) return "—";
  if (kind === "course") return `${s.lessons.done}/${s.lessons.total} · ${s.capstones ? `${s.capstones.read}/${s.capstones.total} · ` : ""}${s.trialParts.passed}/${s.trialParts.total} · ${s.bosses.beaten}/${s.bosses.total} · ${s.offers ? `${s.offers.have} mocks, best ` : ""}${s.mock ? VERDICT_TEXT[s.mock.verdict] || s.mock.verdict : "—"}`;
  return `lessons ${s.lessons.done}/${s.lessons.total} · trial ${s.trialParts.passed}/${s.trialParts.total}${s.bosses.total ? ` · boss ${s.bosses.beaten ? "✓" : "✕"}` : ""}`;
}

/* ------------------------------------------------------------------ shapes over the wire */

export type CertificateView = {
  code: string;
  kind: CertKind;
  world: { key: string; num: number; code: string; title: string; topics: string[]; /** worlds in the course at issue time */ of?: number } | null;
  name: string;
  issuedAt: string;
  status: "valid" | "revoked";
  revokedAt: string | null;
  isPublic: boolean;
  linkedinAddedAt: string | null;
  stats: CertStats | null;
};

/** GET /api/learn/certificates */
export type CertState = {
  /** false until the certificates migration is applied */
  available: boolean;
  /** signing secret configured on the server */
  signing: boolean;
  suggestedName: string;
  course: { eligibility: Eligibility; certificate: CertificateView | null };
  worlds: { key: string; num: number; code: string; title: string; eligibility: Eligibility; certificate: CertificateView | null }[];
};
