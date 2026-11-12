/**
 * LLD (machine-coding) mock interviews: one of the low-level design case studies (resources/low-level-design/
 * lld-NN-*.md) run as a timed round in the mock interview room (/mock/lld-NN-*), with the same engine, store,
 * room and debrief as the system design mocks (a MockInterview with kind "lld").
 *
 * The pure parts live here (no runtime imports but steps.ts, so node --test runs them: scripts/tests/lld-mock.test.mjs):
 * - parseLldCase: the pieces of a case study the round needs (the interviewer's opening, the requirements table and
 *   scope, the classes, patterns, concurrency and code sections, the follow-ups and the Interview checklist);
 * - lldPhasePlan: five phases on the walkthrough's seven steps, with their minutes for a 60–75 minute round;
 * - buildLldRubric: the rubric, from the lesson's own "## Interview checklist" (each line placed in the phase it
 *   belongs to) plus one line per walkthrough step, so every phase is graded;
 * - pickRequirementChange: the one requirement change the interviewer brings midway through the code phase, taken
 *   from the lesson's own follow-ups ("## Extending it"), different from one attempt to the next;
 * - withChange: a built mock with the chosen change in its code phase (the client and the API routes apply the same one).
 */
import type { MockInterview, MockLevel, MockMessage } from "./types";
// the .ts extension lets node --test load this file (the app's bundler resolves it too); tsc only allows it with a flag
// @ts-expect-error TS5097
import { splitSections, findMermaid, STEP_BY_KEY } from "../lld/steps.ts";
import type { Section, StepKey } from "../lld/steps";

export const isLldMockSlug = (slug: string) => /^lld-\d{2}-[a-z0-9-]+$/.test(slug);

/* ------------------------------------------------------------------ the case study */

export type LldQa = { ask: string; answer: string; changes: string };
export type LldFollowUp = { ask: string; answer: string };

export type LldCase = {
  /** the H1: "Design a Parking Lot" */
  title: string;
  /** the italic line under the H1 */
  deck: string;
  /** the :::mission block: its title and body (markdown) */
  mission: { title: string; body: string } | null;
  /** the interviewer's opening line from "How the round runs", without the quotes */
  opening: string;
  /** the requirements table (You ask | They answer | What it changes) */
  qa: LldQa[];
  inScope: string[];
  outScope: string[];
  /** markdown of each part (empty when the lesson has none) */
  requirementsMd: string;
  classesMd: string;
  patternsMd: string;
  concurrencyMd: string;
  codeMd: string;
  followupsMd: string;
  /** class names in the class diagram */
  classNames: string[];
  followups: LldFollowUp[];
  /** the "## Interview checklist" lines, without the "- [ ] " */
  checklist: string[];
};

const FENCE = /^\s*(`{3,}|~{3,})/;
const body = (s: Section | undefined) => (s ? s.lines.join("\n").trim() : "");
const unquote = (s: string) => s.trim().replace(/^["“]|["”]$/g, "").trim();

/** The rows of the first markdown table in `md` (header and separator dropped). */
function tableRows(md: string): string[][] {
  const rows: string[][] = [];
  let started = false;
  for (const line of md.split("\n")) {
    if (/^\s*\|/.test(line)) {
      started = true;
      // split on pipes that are not escaped (`V \| None`)
      const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      rows.push(cells);
    } else if (started) break;
  }
  return rows.slice(1);
}

/** The bullets inside `:::col[In scope]` / `:::col[Out of scope…]` blocks. */
function scopeLists(md: string): { inScope: string[]; outScope: string[] } {
  const out = { inScope: [] as string[], outScope: [] as string[] };
  let into: string[] | null = null;
  for (const line of md.split("\n")) {
    const col = /^\s*:::col\[([^\]]*)\]/.exec(line);
    if (col) {
      into = /^out/i.test(col[1].trim()) ? out.outScope : /^in\b/i.test(col[1].trim()) ? out.inScope : null;
      continue;
    }
    if (/^\s*:{3,}\s*$/.test(line)) {
      into = null;
      continue;
    }
    const b = /^\s*[-*]\s+(.+)$/.exec(line);
    if (into && b) into.push(b[1].trim());
  }
  return out;
}

function missionOf(head: string[]): LldCase["mission"] {
  const start = head.findIndex((l) => /^\s*:::mission\[/.test(l));
  if (start < 0) return null;
  const title = /^\s*:::mission\[([^\]]*)\]/.exec(head[start])![1];
  const end = head.findIndex((l, i) => i > start && /^\s*:{3,}\s*$/.test(l));
  return { title, body: head.slice(start + 1, end < 0 ? undefined : end).join("\n").trim() };
}

export function parseLldCase(md: string): LldCase {
  const { head, sections } = splitSections(md.replace(/\r\n/g, "\n"));
  const find = (re: RegExp) => sections.find((s: Section) => re.test(s.title));
  const title = (head.find((l) => /^#\s+/.test(l)) || "").replace(/^#\s+/, "").trim();
  const deck = (head.find((l) => /^\*[^*].*\*\s*$/.test(l.trim())) || "").trim().replace(/^\*|\*$/g, "");

  const round = body(find(/^how the (round|interview) runs/i));
  const opening = unquote((/^\*\*Interviewer\*\*\s*:\s*(.+)$/m.exec(round)?.[1] || "").trim());

  const reqSec = find(/^(requirements|clarif)/i);
  const requirementsMd = body(reqSec);
  const qa = tableRows(requirementsMd)
    .filter((r) => r.length >= 2 && r[0] && r[1])
    .map((r) => ({ ask: r[0], answer: r[1], changes: r[2] || "" }));

  const classes = find(/^(the )?(classes|entities)\b/i);
  const classesMd = body(classes);
  const m = classes ? findMermaid(classes.lines) : null;
  const diagram = m && classes ? classes.lines.slice(m.start, m.end).join("\n") : "";
  const classNames = [...new Set([...diagram.matchAll(/^\s*class\s+([A-Za-z_][\w]*)/gm)].map((x) => x[1]))];

  const followupsMd = body(find(/^extending\b|^follow-?ups?\b/i));
  const followups: LldFollowUp[] = [];
  for (const line of followupsMd.split("\n")) {
    const f = /^\s*[-*]\s+\*\*(["“])(.+?)(["”])\*\*\s*(.*)$/.exec(line);
    if (f) followups.push({ ask: f[2].trim(), answer: f[4].trim() });
  }

  const checklist = body(find(/^interview checklist/i))
    .split("\n")
    .map((l) => /^\s*[-*]\s+\[[ xX]?\]\s+(.+)$/.exec(l)?.[1]?.trim() || "")
    .filter(Boolean);

  // the code: every section the walkthrough puts in step 5 (the interfaces, the code, the deep dives between them)
  const codeParts = sections.filter((s: Section) => !/^how the|^(requirements|clarif)|^(the )?(classes|entities)\b|^the states\b|^(the )?state machine|^(the )?patterns\b|^concurrency|^edge cases|^extending\b|^follow-?ups?\b|^common mistakes|^interview checklist|^what interviewers/i.test(s.title.replace(/[`*_]/g, "")));

  return {
    title,
    deck,
    mission: missionOf(head),
    opening,
    qa,
    ...scopeLists(requirementsMd),
    requirementsMd,
    classesMd,
    patternsMd: body(find(/^(the )?patterns\b/i)),
    concurrencyMd: body(find(/^concurrency|^edge cases/i)),
    codeMd: codeParts.map((s: Section) => `## ${s.title}\n\n${body(s)}`).join("\n\n"),
    followupsMd,
    classNames,
    followups,
    checklist,
  };
}

/** The interviewer's opening with the round's own length: the lessons say "90 minutes" (or 45, or 60); a mock runs 60–75. */
export const openingFor = (opening: string, minutes: number) => opening.replace(/\b\d{2,3} minutes\b/g, `${minutes} minutes`);

/** Markdown → plain text for prompts: no fences' bodies, no block syntax, no links' targets. */
export function mdPlain(md: string, keepCode = false): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (line.trim() === fence || line.trim().startsWith(fence[0].repeat(fence.length))) fence = null;
      if (keepCode) out.push(line);
      continue;
    }
    if (fence) {
      if (keepCode) out.push(line);
      continue;
    }
    if (/^\s*:{2,}/.test(line)) continue;
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ the phases and their time */

export type LldPhaseKey = "clarify" | "design" | "patterns" | "code" | "concurrency";

export type LldPhaseDef = {
  key: LldPhaseKey;
  title: string;
  /** the walkthrough steps (lld/steps.ts) this phase covers */
  steps: StepKey[];
  /** share of the round */
  share: number;
};

/** The round on the walkthrough's seven steps: steps 2 and 3 are one phase, step 7 is the requirement change in the code phase. */
export const LLD_PHASES: LldPhaseDef[] = [
  { key: "clarify", title: "Clarify the requirements", steps: ["requirements"], share: 0.12 },
  { key: "design", title: "Entities and the class diagram", steps: ["entities", "diagram"], share: 0.2 },
  { key: "patterns", title: "Patterns and their trade-offs", steps: ["patterns"], share: 0.1 },
  { key: "code", title: "Code it", steps: ["code", "followups"], share: 0.43 },
  { key: "concurrency", title: "Concurrency and edge cases", steps: ["concurrency"], share: 0.15 },
];

export const LLD_MIN_MINUTES = 60;
export const LLD_MAX_MINUTES = 75;

/** How long the mock runs for a case study whose real round is `roundMinutes` (60–90): kept to 60–75. */
export const lldRoundMinutes = (roundMinutes: number) => Math.min(LLD_MAX_MINUTES, Math.max(LLD_MIN_MINUTES, Math.round(roundMinutes || LLD_MIN_MINUTES)));

export type LldPhasePlan = LldPhaseDef & { id: string; n: number; minutes: number };

/**
 * Each phase's minutes: its share of the round, rounded, with the rounding put on the code phase so the phases add up
 * to the round exactly. `changeAtSec`: when the requirement change arrives, halfway through the code phase.
 */
export function lldPhasePlan(roundMinutes: number): { minutes: number; phases: LldPhasePlan[]; changeAtSec: number } {
  const minutes = lldRoundMinutes(roundMinutes);
  const phases = LLD_PHASES.map((p, i) => ({ ...p, id: `p${i + 1}`, n: i + 1, minutes: Math.max(3, Math.round(minutes * p.share)) }));
  const code = phases.find((p) => p.key === "code")!;
  code.minutes += minutes - phases.reduce((a, p) => a + p.minutes, 0);
  return { minutes, phases, changeAtSec: Math.round((code.minutes * 60) / 2) };
}

/* ------------------------------------------------------------------ the rubric */

export type LldSignal = { id: string; phase: LldPhaseKey; level: MockLevel; text: string; source: "checklist" | "step"; step?: StepKey };

const SENIOR = /lock per|per[- ](floor|seat|key|account|flight|shard)[- ]lock|\bshard|throughput|\bO\(1\)|\bscale\b|servers\b|\bredis\b|deadlock|sorted (seat |lock )?order|lock order|idempoten|re-?entrant|monotonic|trade-?off/i;

/** Which phase a checklist line belongs to (the lines are written as "I asked…", "I put … behind …", "I held one lock…"). */
export function checklistPhase(item: string): LldPhaseKey {
  const t = item.replace(/[`*_]/g, "");
  if (/^I (answered|absorbed|handled the follow|took the follow)|follow-?up/i.test(t)) return "code";
  if (/^I (asked|agreed|clarified|pinned|scoped|checked whether|confirmed whether)\b/i.test(t) && !/\block(s|ed|ing)?\b|\brace\b|thread/i.test(t)) return "clarify";
  if (/\block(s|ed|ing)?\b|\bmutex|\brace\b|thread|concurren|atomic|deadlock|\bat once\b|same moment|simultaneous|in parallel|two (gates|callers|requests|users|buyers|threads)/i.test(t)) return "concurrency";
  if (/^I (asked|agreed|clarified|pinned|scoped)\b|out of scope|in scope/i.test(t)) return "clarify";
  if (/\b(strategy|pattern|observer|decorator|singleton|factory|state pattern|command|adapter|facade|fa[cç]ade|composite|visitor|template method|chain of|builder|proxy|memento|mediator|iterator|flyweight|bridge)\b|\binterface\b|\binject|\bbehind\b|open\/closed/i.test(t)) return "patterns";
  if (/\breject|\braise|\berror|exception|edge case|\bclamp|invalid|duplicate|unknown|\bfull\b|negative|\bempty\b|\bzero\b|overflow|twice|refus|expir|\bfail/i.test(t)) return "concurrency";
  if (/\bclass(es)?\b|entit|\bmodel|\benum\b|\bnoun|diagram|one job|data ?class|value object|state machine|\bstates?\b/i.test(t)) return "design";
  return "code";
}

const PHASE_LEVEL: Record<LldPhaseKey, MockLevel> = { clarify: "junior", design: "sde", patterns: "sde", code: "sde", concurrency: "sde" };

/** The level a checklist line is expected at: senior for the scaling, ordering and follow-up lines, else by phase. */
export function checklistLevel(item: string, phase: LldPhaseKey = checklistPhase(item)): MockLevel {
  const t = item.replace(/[`*_]/g, "");
  if (/^I (answered|absorbed)|follow-?up/i.test(t)) return "senior";
  if (SENIOR.test(t)) return "senior";
  return PHASE_LEVEL[phase];
}

/** One rubric line per walkthrough step, from its ask (lld/steps.ts), so a phase is graded even with no checklist line. */
const STEP_SIGNALS: { step: StepKey; level: MockLevel; text: string }[] = [
  { step: "requirements", level: "junior", text: "Asked the questions whose answers change the code, and agreed what is in and out of scope before modelling." },
  { step: "entities", level: "junior", text: "Named the entities as the nouns of the problem, each class with one job." },
  { step: "diagram", level: "sde", text: "Drew the classes and how they connect (composition, association, interfaces) before writing code." },
  { step: "patterns", level: "sde", text: "Named each pattern used with the trade-off it buys, not only its name." },
  { step: "code", level: "junior", text: "Wrote code bottom-up that would run, with a small main that proves the rules and time passed in as a parameter." },
  { step: "followups", level: "senior", text: "Absorbed the requirement change as a small, local change, without rewriting the core class." },
  { step: "concurrency", level: "sde", text: "Said where two callers can collide, where the lock goes and why, and listed the edge cases handled." },
];

/**
 * The round's rubric: the lesson's Interview checklist, each line in its phase at its level, plus one line per step.
 * Ids are stable per phase ("p4.s3"): checklist lines first, in the lesson's order, then the step lines.
 */
export function buildLldRubric(checklist: string[], plan: Pick<LldPhasePlan, "id" | "key" | "steps">[] = lldPhasePlan(LLD_MIN_MINUTES).phases): LldSignal[] {
  const out: LldSignal[] = [];
  for (const p of plan) {
    const mine = checklist.filter((c) => checklistPhase(c) === p.key).map((text) => ({ text, level: checklistLevel(text, p.key), source: "checklist" as const }));
    const steps = STEP_SIGNALS.filter((s) => p.steps.includes(s.step)).map((s) => ({ text: s.text, level: s.level, source: "step" as const, step: s.step }));
    [...mine, ...steps].forEach((s, i) => out.push({ id: `${p.id}.s${i + 1}`, phase: p.key, ...s }));
  }
  return out;
}

/** The step a rubric line studies on the case-study page ("#step-4"). */
export const stepAnchor = (s: LldSignal) => STEP_BY_KEY[s.step ?? (s.phase === "clarify" ? "requirements" : s.phase === "design" ? "entities" : s.phase === "patterns" ? "patterns" : s.phase === "concurrency" ? "concurrency" : "code")].id as string;

/* ------------------------------------------------------------------ the requirement change */

/** Follow-ups that leave the one process (more servers, a database, a restart): system design questions, not a code change. */
const OUT_OF_PROCESS = /\bservers?\b|machines|database|\bmillions?\b|\bthousands\b|distributed|process dies|restart|power cut|\bredis\b|\bshard|several services|over a network|multiplayer over|survive/i;

/** The follow-ups that make a good mid-round change: ones the code in front of the candidate has to absorb. */
export function changeCandidates(followups: LldFollowUp[]): LldFollowUp[] {
  const local = followups.filter((f) => !OUT_OF_PROCESS.test(f.ask));
  return local.length ? local : followups;
}

/**
 * The one requirement change for an attempt: a follow-up of the lesson's own, chosen by `seed` (the attempt number plus
 * the case's number on the client), so a second attempt usually gets a different one. Returns its index in `followups`.
 */
export function pickRequirementChange(followups: LldFollowUp[], seed: number): number {
  if (!followups.length) return -1;
  const pool = changeCandidates(followups);
  const s = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0));
  return followups.indexOf(pool[s % pool.length]);
}

/** The change as the interviewer says it: the follow-up's ask, then one question. */
export function changeText(f: LldFollowUp): string {
  const ask = f.ask.replace(/\s+$/, "");
  return `New requirement from the product team: "${ask}" Walk me through what you change in your code to support it.`;
}

/**
 * The mock with the chosen change in its code phase (the only curveball an LLD round has). `changeId` is one of
 * mock.lld.changes' ids; unknown or missing → the round's default (the first candidate).
 */
export function withChange(mock: MockInterview, changeId: string | null | undefined): MockInterview {
  const l = mock.lld;
  if (!l || !l.changes.length) return mock;
  const change = l.changes.find((c) => c.id === changeId) ?? l.changes.find((c) => c.id === l.defaultChange) ?? l.changes[0];
  return { ...mock, phases: mock.phases.map((p) => (p.id === l.codePhase ? { ...p, curveballs: [change] } : p)) };
}

/** The change id for an attempt (client: at the start of a round). */
export function changeForAttempt(mock: MockInterview, attempt: number): string | null {
  const l = mock.lld;
  if (!l || !l.changes.length) return null;
  const k = pickRequirementChange(l.followups, attempt + l.n);
  return l.changes.find((c) => c.followup === k)?.id ?? l.changes[0].id;
}

export type LldChange = MockMessage & { followup: number };
