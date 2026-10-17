/**
 * Parser for mock interview files (resources/mock-interviews/mock-NN-*.md; format documented in
 * that folder's README.md). Pure: markdown in, structure with markdown strings out. Rendering to
 * HTML and resolving study links happen in load.ts.
 */
import matter from "gray-matter";
import { MOCK_LEVELS, type MockLevel, type MockTrigger } from "./types";

export type RawMessage = { trigger: MockTrigger; md: string; title?: string };
export type RawSignal = { level: MockLevel; md: string; study: string[] };
export type RawPhase = {
  n: number;
  title: string;
  minutes: number;
  prompts: RawMessage[];
  curveballs: RawMessage[];
  hints: string[];
  answer: string;
  rubric: RawSignal[];
};

export type RawMock = {
  id: string;
  title: string;
  heading: string;
  after: string;
  covers: string[];
  level: MockLevel;
  badge: string;
  minutes: number | null;
  company: { name: string; tagline: string; location: string; about: string };
  role: string;
  interviewer: { name: string; title: string; style: string };
  brief: string;
  problem: string;
  phases: RawPhase[];
  levels: Partial<Record<MockLevel, string>>;
  closing: string;
  /** problems found while parsing (shown in dev logs, never fatal) */
  warnings: string[];
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : fallback);
const isLevel = (v: unknown): v is MockLevel => typeof v === "string" && (MOCK_LEVELS as readonly string[]).includes(v);

/** Split markdown into heading-led blocks at one level, ignoring headings inside code fences. */
function splitHeadings(md: string, level: 2 | 3): { head: string | null; body: string }[] {
  const marker = "#".repeat(level) + " ";
  const out: { head: string | null; body: string[] }[] = [{ head: null, body: [] }];
  let fence: string | null = null;
  md.split(/\r?\n/).forEach((line) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    if (!fence && line.startsWith(marker)) out.push({ head: line.slice(marker.length).trim(), body: [] });
    else out[out.length - 1].body.push(line);
  });
  return out.map((b) => ({ head: b.head, body: b.body.join("\n").trim() }));
}

/** Top-level list items ("- " or "* " at column 0); indented lines continue the item. */
export function listItems(md: string): string[] {
  const items: string[][] = [];
  let fence = false;
  md.split(/\r?\n/).forEach((line) => {
    const fenceLine = /^\s*(```|~~~)/.test(line);
    const inside = fence || fenceLine;
    if (fenceLine) fence = !fence;
    const top = !inside && /^[-*]\s+/.test(line);
    if (top) items.push([line.replace(/^[-*]\s+/, "")]);
    else if (items.length && (line.trim() === "" || /^\s{2,}/.test(line) || inside)) items[items.length - 1].push(line.replace(/^ {2}/, ""));
  });
  return items.map((l) => l.join("\n").trim()).filter(Boolean);
}

/** "[2m]", "[90s]", "[2:30]", "[start]", "[submit]" at the start of an item. */
export function readTrigger(text: string): { trigger: MockTrigger; rest: string } {
  const m = text.match(/^\[\s*(start|submit|\d+(?:\.\d+)?\s*(?:m|min|s|sec)|\d+:\d{2})\s*\]\s*/i);
  if (!m) return { trigger: { kind: "start" }, rest: text };
  const t = m[1].toLowerCase();
  const rest = text.slice(m[0].length);
  if (t === "start") return { trigger: { kind: "start" }, rest };
  if (t === "submit") return { trigger: { kind: "submit" }, rest };
  if (t.includes(":")) {
    const [mm, ss] = t.split(":").map(Number);
    return { trigger: { kind: "at", sec: mm * 60 + ss }, rest };
  }
  const n = parseFloat(t);
  return { trigger: { kind: "at", sec: Math.round(/s/.test(t.replace(/min/, "")) ? n : n * 60) }, rest };
}

/** Strip one pair of wrapping quotes ("…" or “…”). */
export function unquote(text: string): string {
  const t = text.trim();
  if (t.length > 1 && /^["“]/.test(t) && /["”]$/.test(t)) return t.slice(1, -1).trim();
  return t;
}

function message(item: string): RawMessage {
  const { trigger, rest } = readTrigger(item);
  let body = rest;
  let title: string | undefined;
  const tm = body.match(/^\*\*(.+?)\*\*\s*/);
  if (tm) {
    title = tm[1]
      .trim()
      .replace(/^["“]|["”]$/g, "")
      .replace(/[.:]\s*$/, "")
      .trim();
    body = body.slice(tm[0].length);
  }
  return { trigger, md: unquote(body), title };
}

function signal(item: string, warnings: string[]): RawSignal | null {
  const m = item.match(/^\[\s*([a-z]+)\s*\]\s*([\s\S]+)$/i);
  if (!m || !isLevel(m[1].toLowerCase())) {
    warnings.push(`rubric line without a level tag: "${item.slice(0, 60)}"`);
    return null;
  }
  let md = m[2].trim();
  let study: string[] = [];
  const s = md.match(/\s*\(study:\s*([^)]*)\)\s*$/i);
  if (s) {
    study = s[1]
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean);
    md = md.slice(0, s.index).trim();
  }
  return { level: m[1].toLowerCase() as MockLevel, md, study };
}

const PHASE_RE = /^Phase\s+(\d+)\s*[:·.\-–—]\s*(.+?)\s*(?:\((\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\))?\s*$/i;

export function parseMock(source: string): RawMock {
  const { data, content } = matter(source);
  const warnings: string[] = [];
  const fm = (data || {}) as Record<string, unknown>;
  const company = (fm.company || {}) as Record<string, unknown>;
  const interviewer = (fm.interviewer || {}) as Record<string, unknown>;
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";

  const out: RawMock = {
    id: str(fm.id),
    title: str(fm.title) || heading,
    heading,
    after: str(fm.after),
    covers: Array.isArray(fm.covers) ? fm.covers.map((c) => str(c)).filter(Boolean) : [],
    level: isLevel(fm.level) ? fm.level : "sde",
    badge: str(fm.badge),
    minutes: typeof fm.minutes === "number" ? fm.minutes : null,
    company: { name: str(company.name), tagline: str(company.tagline), location: str(company.location), about: str(company.about) },
    role: str(fm.role),
    interviewer: { name: str(interviewer.name), title: str(interviewer.title), style: str(interviewer.style) },
    brief: "",
    problem: "",
    phases: [],
    levels: {},
    closing: "",
    warnings,
  };
  if (!out.id) warnings.push("front matter has no id");

  splitHeadings(content, 2).forEach(({ head, body }) => {
    if (!head) return;
    const name = head.toLowerCase();
    const pm = head.match(PHASE_RE);
    if (pm) {
      const phase: RawPhase = {
        n: parseInt(pm[1], 10),
        title: pm[2].trim(),
        minutes: pm[3] ? parseFloat(pm[3]) : 5,
        prompts: [],
        curveballs: [],
        hints: [],
        answer: "",
        rubric: [],
      };
      if (!pm[3]) warnings.push(`phase ${phase.n} has no "(N min)" budget; using 5`);
      splitHeadings(body, 3).forEach((part) => {
        const k = (part.head || "").toLowerCase();
        if (!part.head) return;
        if (k.startsWith("interviewer")) phase.prompts = listItems(part.body).map(message);
        else if (k.startsWith("curveball")) phase.curveballs = listItems(part.body).map(message);
        else if (k.startsWith("hint")) phase.hints = listItems(part.body).map(unquote);
        else if (k.startsWith("model answer") || k === "answer") phase.answer = part.body;
        else if (k.startsWith("rubric")) phase.rubric = listItems(part.body).map((i) => signal(i, warnings)).filter((x): x is RawSignal => !!x);
        else warnings.push(`phase ${phase.n}: unknown part "### ${part.head}"`);
      });
      if (!phase.prompts.length) warnings.push(`phase ${phase.n} has no interviewer prompt`);
      if (!phase.rubric.length) warnings.push(`phase ${phase.n} has no rubric`);
      out.phases.push(phase);
    } else if (name === "brief") out.brief = body;
    else if (name === "problem") out.problem = body;
    else if (name === "levels") {
      listItems(body).forEach((i) => {
        const m = i.match(/^\[\s*([a-z]+)\s*\]\s*([\s\S]+)$/i);
        if (m && isLevel(m[1].toLowerCase())) out.levels[m[1].toLowerCase() as MockLevel] = m[2].trim();
      });
    } else if (name === "closing") out.closing = unquote(body);
  });
  out.phases.sort((a, b) => a.n - b.n);
  if (!out.phases.length) warnings.push("no '## Phase N: …' sections");
  return out;
}
