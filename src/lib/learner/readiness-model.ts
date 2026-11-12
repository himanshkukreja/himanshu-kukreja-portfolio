/**
 * The interview-readiness estimate (AI audit 12 Nov 2026, O12; owner-approved 12 Nov 2026), per track: System Design
 * Mastery's core course, the low-level design (LLD) track and DSA Mastery. Deterministic: plain arithmetic over the
 * learner's own records, no AI in it. Pure, with no imports, so the route, the card and the tests share it.
 *
 * It is an estimate and says so: the card shows a band ("Getting there", "Interview-ready on most topics"), never a
 * percentage, and every input beside it, so a learner can see why. Each input is a 0-1 value with a weight; the
 * weighted sum picks the band, and two gates keep it honest:
 *   - the top two bands need interview evidence: a mock round (system design or LLD) at SDE level or better, or for DSA
 *     enough solved problems across enough patterns; without it the band stops at "Getting there"
 *   - "Interview-ready" also needs most of the track covered (≥ 75% of the coverage input)
 * An input with no evidence (no mock taken, no quick check answered) counts as 0 and is marked, so "no data" never
 * reads as "weak at it" in the words, only in the band.
 *
 * `levers`: the inputs that would raise the estimate most (weight × room left), each with a link the server chose; the
 * optional AI reading (FEATURES "readiness-reading") is built from them and may link only to them.
 */

export type Track = "sdm" | "lld" | "dsa";
export const TRACKS: Track[] = ["sdm", "lld", "dsa"];
export const TRACK_LABEL: Record<Track, string> = { sdm: "System design", lld: "Low-level design", dsa: "DSA" };

export type Ratio = { done: number; total: number };
/** one scored mock round: its level ("below-junior" … "staff", "none"), newest first; `self`: the room's self-assessment */
export type MockRun = { slug: string; title?: string; level: string; at: number; self?: boolean };
export type Link = { label: string; href: string };

export type SdmInput = {
  lessons: Ratio;
  /** the interview problem bank's design walkthroughs */
  cases: Ratio;
  /** trial parts: passed of the released total, and how many were attempted */
  trials: { passed: number; attempted: number; total: number };
  /** lesson quick checks, first attempts: right of answered (the last 120 days) */
  quickChecks: { right: number; answered: number };
  mocks: MockRun[];
  /** system design code labs passed */
  labs: Ratio;
  links?: Partial<Record<InputId, Link>>;
};
export type LldInput = {
  patterns: Ratio;
  cases: Ratio;
  mocks: MockRun[];
  /** LLD labs passed (machine-coding builds and pattern refactors) */
  labs: Ratio;
  links?: Partial<Record<InputId, Link>>;
};
export type DsaInput = {
  lessons: Ratio;
  /** patterns (modules) with at least two solved problems */
  patterns: Ratio;
  solved: number;
  /** solved problems that never had a failed submit */
  firstTry: Ratio;
  /** DSA explain-it-back verdicts: solid of graded */
  explains: Ratio;
  links?: Partial<Record<InputId, Link>>;
};

export type InputId = "lessons" | "cases" | "trials" | "quickChecks" | "mocks" | "labs" | "patterns" | "solved" | "firstTry" | "explains";

export type ReadinessInput = {
  id: InputId;
  label: string;
  /** what the learner sees: "34 of 60 lessons", "latest SDE, up from Junior" */
  value: string;
  /** 0-1 */
  score: number;
  weight: number;
  /** nothing recorded for this input yet */
  none: boolean;
};

export const BANDS = [
  { id: "not-started", label: "Not started yet", min: 0 },
  { id: "early", label: "Early days", min: 0.02 },
  { id: "building", label: "Building the foundations", min: 0.2 },
  { id: "getting-there", label: "Getting there", min: 0.42 },
  { id: "most", label: "Interview-ready on most topics", min: 0.62 },
  { id: "ready", label: "Interview-ready", min: 0.8 },
] as const;
export type BandId = (typeof BANDS)[number]["id"];

export type Lever = { id: InputId; label: string; why: string; link: Link | null };

export type Readiness = {
  track: Track;
  band: BandId;
  bandLabel: string;
  /** 0-5, for the card's step meter (the band's place, not a percentage) */
  step: number;
  inputs: ReadinessInput[];
  /** why the band stopped where it did (a gate), if one did */
  capped: string | null;
  levers: Lever[];
  /** how many inputs have any evidence, of all */
  evidence: { have: number; of: number };
};

/* ------------------------------------------------------------------ helpers */

const LEVEL_VALUE: Record<string, number> = { none: 0, "below-junior": 0.1, junior: 0.35, sde: 0.65, senior: 0.85, staff: 1 };
const LEVEL_NAME: Record<string, string> = { none: "not answered", "below-junior": "below Junior", junior: "Junior", sde: "SDE", senior: "Senior", staff: "Staff" };
export const levelValue = (l: string) => LEVEL_VALUE[l] ?? 0;
const levelName = (l: string) => LEVEL_NAME[l] ?? l;
const frac = (r: Ratio) => (r.total > 0 ? Math.max(0, Math.min(1, r.done / r.total)) : 0);
const of = (r: Ratio, what: string) => `${r.done} of ${r.total} ${what}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The mock input: the latest round's level weighted over the best (0.6 / 0.4), and the trend against the round before. */
export function mockScore(runs: MockRun[]): { score: number; value: string; trend: "up" | "down" | "same" | null; best: string | null; latest: string | null } {
  const rs = runs.filter((r) => r.level && r.level in LEVEL_VALUE).sort((a, b) => b.at - a.at);
  if (!rs.length) return { score: 0, value: "no scored round yet", trend: null, best: null, latest: null };
  const latest = rs[0];
  const best = rs.reduce((a, b) => (levelValue(b.level) > levelValue(a.level) ? b : a));
  const prev = rs[1];
  const trend = !prev ? null : levelValue(latest.level) > levelValue(prev.level) ? "up" : levelValue(latest.level) < levelValue(prev.level) ? "down" : "same";
  const score = 0.6 * levelValue(latest.level) + 0.4 * levelValue(best.level);
  const t = trend === "up" ? `, up from ${levelName(prev!.level)}` : trend === "down" ? `, down from ${levelName(prev!.level)}` : trend === "same" ? ", same as the round before" : "";
  const b = best !== latest && levelValue(best.level) > levelValue(latest.level) ? `; best ${levelName(best.level)}` : "";
  const self = latest.self ? " (self-assessed)" : "";
  return { score, value: `latest ${levelName(latest.level)}${self}${t}${b} · ${plural(rs.length, "round")}`, trend, best: best.level, latest: latest.level };
}

function bandOf(score: number): (typeof BANDS)[number] {
  let b: (typeof BANDS)[number] = BANDS[0];
  for (const x of BANDS) if (score >= x.min) b = x;
  return b;
}

const WHY: Record<InputId, string> = {
  lessons: "finish more of the lessons",
  cases: "work through more case studies",
  trials: "pass more trial parts",
  quickChecks: "get more quick checks right first time",
  mocks: "take a scored mock round and move its level up",
  labs: "pass more code labs",
  patterns: "solve problems across more patterns",
  solved: "solve more problems",
  firstTry: "get more problems right on the first submit",
  explains: "explain more concepts back solidly",
};

const whyOf = (track: Track, id: InputId) => (track === "lld" && id === "patterns" ? "finish more of the design-pattern lessons" : track === "lld" && id === "mocks" ? "run a case study as a scored LLD mock round" : WHY[id]);

function finish(track: Track, inputs: ReadinessInput[], gate: { evidence: boolean; evidenceWhy: string; coverage: number }, links: Partial<Record<InputId, Link>> = {}): Readiness {
  const total = inputs.reduce((a, i) => a + i.weight, 0) || 1;
  const score = inputs.reduce((a, i) => a + i.weight * i.score, 0) / total;
  let band = bandOf(score);
  let capped: string | null = null;
  const idx = (id: BandId) => BANDS.findIndex((b) => b.id === id);
  if (idx(band.id) >= idx("most") && !gate.evidence) {
    band = BANDS[idx("getting-there")];
    capped = gate.evidenceWhy;
  } else if (band.id === "ready" && gate.coverage < 0.75) {
    band = BANDS[idx("most")];
    capped = "Interview-ready needs most of the track covered first.";
  }
  if (score === 0 && inputs.every((i) => i.none || i.score === 0)) band = BANDS[0];
  const levers = inputs
    .map((i) => ({ i, gain: i.weight * (1 - i.score) }))
    .filter((x) => x.gain > 0.01)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3)
    .map(({ i }) => ({ id: i.id, label: i.label, why: whyOf(track, i.id), link: links[i.id] ?? null }));
  // a gate that capped the band is the first thing to fix
  if (capped && !gate.evidence) {
    const id: InputId = track === "dsa" ? "solved" : "mocks";
    const at = levers.findIndex((l) => l.id === id);
    const lv = at >= 0 ? levers.splice(at, 1)[0] : { id, label: inputs.find((i) => i.id === id)?.label ?? id, why: whyOf(track, id), link: links[id] ?? null };
    levers.unshift(lv);
    levers.splice(3);
  }
  return {
    track,
    band: band.id,
    bandLabel: band.label,
    step: idx(band.id),
    inputs,
    capped,
    levers,
    evidence: { have: inputs.filter((i) => !i.none).length, of: inputs.length },
  };
}

/* ------------------------------------------------------------------ the tracks */

/** An input while it is built: `n`, the content's count (0: the content isn't there, e.g. not published: left out, so
 *  "0 of 0" never counts against anyone). */
type Draft = ReadinessInput & { n?: number };
const present = (d: Draft): boolean => d.n === undefined || d.n > 0;
const strip = (d: Draft): ReadinessInput => {
  const { n: _n, ...rest } = d;
  void _n;
  return rest;
};

export function sdmReadiness(x: SdmInput): Readiness {
  const m = mockScore(x.mocks);
  const trialRate = x.trials.total > 0 ? x.trials.passed / x.trials.total : 0;
  const qc = x.quickChecks.answered > 0 ? x.quickChecks.right / x.quickChecks.answered : 0;
  // a pass rate from a handful of answers says little: it counts in full from 10 answers
  const qcScore = qc * Math.min(1, x.quickChecks.answered / 10);
  const inputs: ReadinessInput[] = ([
    { id: "lessons", label: "Lessons", value: of(x.lessons, "core lessons done"), score: frac(x.lessons), weight: 0.25, none: x.lessons.done === 0, n: x.lessons.total },
    { id: "cases", label: "Case studies", value: of(x.cases, "design case studies done"), score: frac(x.cases), weight: 0.1, none: x.cases.done === 0, n: x.cases.total },
    {
      id: "trials",
      label: "Trials",
      value: x.trials.attempted ? `${x.trials.passed} of ${x.trials.total} trial parts passed (${x.trials.attempted} tried)` : `none tried yet (${x.trials.total} parts)`,
      score: trialRate,
      weight: 0.2,
      none: x.trials.attempted === 0,
      n: x.trials.total,
    },
    {
      id: "quickChecks",
      label: "Quick checks",
      value: x.quickChecks.answered ? `${x.quickChecks.right} of ${x.quickChecks.answered} right first time` : "none answered yet",
      score: qcScore,
      weight: 0.1,
      none: x.quickChecks.answered === 0,
    },
    { id: "mocks", label: "Mock interviews", value: m.value, score: m.score, weight: 0.27, none: !x.mocks.length },
    { id: "labs", label: "Code labs", value: of(x.labs, "labs passed"), score: Math.min(1, frac(x.labs) * 2), weight: 0.08, none: x.labs.done === 0, n: x.labs.total },
  ] as Draft[]).filter(present).map(strip);
  const evidence = !!m.best && levelValue(m.best) >= levelValue("sde");
  return finish("sdm", inputs, { evidence, evidenceWhy: "The top bands need a mock round scored at SDE level or better.", coverage: frac(x.lessons) }, x.links);
}

export function lldReadiness(x: LldInput): Readiness {
  const m = mockScore(x.mocks);
  const inputs: ReadinessInput[] = ([
    { id: "patterns", label: "Design patterns", value: of(x.patterns, "pattern lessons done"), score: frac(x.patterns), weight: 0.2, none: x.patterns.done === 0, n: x.patterns.total },
    { id: "cases", label: "Case studies", value: of(x.cases, "case studies done"), score: frac(x.cases), weight: 0.3, none: x.cases.done === 0, n: x.cases.total },
    { id: "mocks", label: "LLD mock rounds", value: m.value, score: m.score, weight: 0.3, none: !x.mocks.length },
    // half the labs passed counts in full: nobody needs every build to be ready
    { id: "labs", label: "LLD labs", value: of(x.labs, "labs passed"), score: Math.min(1, frac(x.labs) * 2), weight: 0.2, none: x.labs.done === 0, n: x.labs.total },
  ] as Draft[]).filter(present).map(strip);
  const evidence = !!m.best && levelValue(m.best) >= levelValue("sde");
  const coverage = (frac(x.patterns) + frac(x.cases)) / 2;
  return finish("lld", inputs, { evidence, evidenceWhy: "The top bands need an LLD mock round scored at SDE level or better.", coverage }, x.links);
}

/** The DSA problem count that reads as a full input (about what interview prep lists ask for). */
export const DSA_SOLVED_TARGET = 120;

export function dsaReadiness(x: DsaInput): Readiness {
  const inputs: ReadinessInput[] = ([
    { id: "lessons", label: "Lessons", value: of(x.lessons, "lessons done"), score: frac(x.lessons), weight: 0.15, none: x.lessons.done === 0, n: x.lessons.total },
    { id: "patterns", label: "Patterns", value: of(x.patterns, "patterns with 2+ solves"), score: frac(x.patterns), weight: 0.3, none: x.patterns.done === 0, n: x.patterns.total },
    { id: "solved", label: "Problems solved", value: `${x.solved} solved (the full mark is ${DSA_SOLVED_TARGET})`, score: Math.min(1, x.solved / DSA_SOLVED_TARGET), weight: 0.3, none: x.solved === 0 },
    { id: "firstTry", label: "First-submit solves", value: x.firstTry.total ? of(x.firstTry, "solves with no failed submit") : "no solves yet", score: frac(x.firstTry), weight: 0.1, none: x.firstTry.total === 0 },
    { id: "explains", label: "Explain-it-back", value: x.explains.total ? of(x.explains, "explained solidly") : "none graded yet", score: frac(x.explains), weight: 0.15, none: x.explains.total === 0 },
  ] as Draft[]).filter(present).map(strip);
  const evidence = x.solved >= 50 && frac(x.patterns) >= 0.5;
  return finish("dsa", inputs, { evidence, evidenceWhy: "The top bands need 50+ solved problems across at least half the patterns.", coverage: Math.min(frac(x.patterns), x.solved / DSA_SOLVED_TARGET) }, x.links);
}

/* ------------------------------------------------------------------ the AI reading's input */

/** The facts the reading gets (numbers and labels only, never the learner's words), and the links it may use as [L1]… */
export function readingInput(r: Readiness): { text: string; links: Link[] } {
  const links = r.levers.map((l) => l.link).filter((l): l is Link => !!l);
  const lines = [
    `Track: ${TRACK_LABEL[r.track]}`,
    `Estimate band: ${r.bandLabel}${r.capped ? ` (held here: ${r.capped})` : ""}`,
    "Inputs:",
    ...r.inputs.map((i) => `- ${i.label}: ${i.value}${i.none ? " [no evidence yet]" : ""}`),
    "What would raise it most, in order:",
    ...r.levers.map((l) => `- ${l.label}: ${l.why}${l.link ? ` [L${links.indexOf(l.link) + 1}] ${l.link.label}` : ""}`),
  ];
  return { text: lines.join("\n"), links };
}

/** The reading's text with its [L1] markers kept only when they name a link it was given. */
export function cleanReading(text: string, links: Link[]): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/\[L(\d+)\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= links.length ? m : ""))
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 900);
}
