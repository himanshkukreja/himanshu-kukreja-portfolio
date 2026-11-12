import "server-only";
/**
 * One DSA tutor turn, assembled: what the model reads for a /dsa/ask message ("dsa-chat") and for a problem-room tutor
 * message ("dsa-tutor"). Shared by the routes (/api/learn/ai/dsa/ask, /api/learn/ai/dsa/tutor), which load the learner's
 * rows by the verified user id, and the eval (scripts/ai-eval/dsa.ts), which passes fixtures, so the eval tests exactly
 * what the routes send.
 */
import { actionOf, messageLines, styleLine } from "@/lib/ai/answerStyle";
import { restyleLine, teachLine, TEACH_REVEAL_ASK } from "@/lib/ai/teaching";
import type { ApiMessage } from "@/lib/ai/chat/loop";
import { nextRef, type ChatRequest, type ChatSource } from "@/lib/ai/chat/text";
import { DSA_LANG_LABEL, type DsaLang } from "../types";
import type { Prepared } from "./answer";
import type { TutorMode } from "./modes";
import { dsaAskSystem, dsaTutorSystem } from "./prompts";
import { pageItem, plannedConcepts, searchDsa, type DsaHit, type ProblemShard } from "./search";
import { tokens } from "./text";

/** The conversation as the model sees it: the last `keep` turns as they were, then the new message with its context. */
export function historyMessages(req: ChatRequest, latestContent: string, keep = 10): ApiMessage[] {
  const turns = req.messages.slice(0, -1).slice(-keep);
  const out: ApiMessage[] = turns.map((t) => ({ role: t.role, content: t.text }));
  out.push({ role: "user", content: latestContent });
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/* ------------------------------------------------------------------ /dsa/ask */

const KIND_LABEL: Record<DsaHit["kind"], string> = { lesson: "lesson", lecture: "lecture narration", problem: "problem statement", editorial: "editorial (unlocked)" };
/** a ref this chat handed out earlier: its id is one of our chunk keys */
export const KEY_RE = /^[clpe]:[a-z0-9-]+:\d{1,4}$/;

const COMMON = new Set(["algorithm", "algorithms", "sort", "sorted", "order", "value", "values", "count", "graph", "graphs", "tree", "trees", "problem", "problems", "pattern", "patterns", "search", "array", "arrays", "string", "strings", "basics", "explain", "between", "ordering", "structure", "structures", "advanced"]);

/**
 * A topic the course has no lesson on yet, named by the learner or behind the practice problems the search found: one
 * line for the model, so it says so first instead of guessing (eval: "Dijkstra" got an invented lesson).
 */
export function gapLine(query: string, planned: { id: string; title: string }[], problemConcepts: string[], builtFound: string[] = []): string {
  const q = new Set(tokens(query));
  // a built lesson the search found shares a word with the question: it is covered (a hash map question isn't a gap
  // because "Best, average and worst case" is planned)
  if (builtFound.slice(0, 2).some((t) => tokens(t).some((w) => w.length >= 4 && q.has(w)))) return "";
  const hit = planned.find((c) => problemConcepts.slice(0, 2).includes(c.id) && tokens(c.title).some((t) => q.has(t))) ?? planned.find((c) => tokens(c.title).some((t) => t.length >= 5 && !COMMON.has(t) && q.has(t)));
  return hit ? `<gap>The course has no lesson on "${hit.title}" yet (it is planned). Say so first; a practice problem that uses it stays under the no-spoiler rule.</gap>` : "";
}

/** A follow-up that leans on the previous message ("And what breaks if…", "why that?"): it searches with that message too. */
const LEANS = /^(and|but|so|then|also|ok|okay|what about|how about|why|instead)\b|\b(that|this|it|those|these|them|there)\b/i;

export async function prepareAsk(o: {
  req: ChatRequest;
  unlocked: Set<string>;
  outline: string;
  /** the learner brief (lib/learner/brief.ts): goes in the learner's turn, never the cached system prompt */
  brief?: string;
}): Promise<Prepared> {
  const { req, unlocked } = o;
  const latest = req.messages[req.messages.length - 1].text;
  // a short follow-up ("why?", "Explain that more simply.") searches with the learner's previous question too
  const prevUser = [...req.messages.slice(0, -1)].reverse().find((m) => m.role === "user")?.text ?? "";
  const n = tokens(latest).length;
  const short = n < 5 || !!actionOf(latest) || (n < 14 && LEANS.test(latest));
  const page = pageItem(req.page?.path);
  // the page counts only on a concept, lecture or problem page (a list page's headings are noise)
  const query = [latest, short ? prevUser : "", page ? (req.page?.selection ?? "") : "", page ? `${req.page?.title ?? ""} ${req.page?.heading ?? ""}` : ""].filter(Boolean).join("\n");
  const [found, planned] = await Promise.all([searchDsa({ query, unlocked, page }), plannedConcepts().catch(() => [])]);

  // refs: the same passage keeps the ref it had earlier in this chat; new ones continue the numbering
  const earlier = req.sources ?? {};
  const byKey = new Map(Object.entries(earlier).map(([r, id]) => [id, r]));
  const keys = Object.keys(earlier);
  const sources: Record<string, ChatSource> = {};
  const blocks: string[] = [];
  for (const h of found.hits) {
    let ref = byKey.get(h.key);
    if (!ref) {
      ref = nextRef([...keys, ...Object.keys(sources)], "s");
      byKey.set(h.key, ref);
    }
    sources[ref] = { id: h.key, kind: h.kind === "editorial" ? "problem" : h.kind, title: h.title, sub: h.sub, href: h.href, at: 0 };
    blocks.push(`[${ref}] ${KIND_LABEL[h.kind]} · ${h.title}\n${h.text}`);
  }
  // the problems this question is about whose editorial stays locked: the model is told so by name
  const locked = found.problems.filter((p) => !unlocked.has(p.id)).slice(0, 3).map((p) => p.title);
  const pageLine =
    page && req.page?.path
      ? `<page>The learner is on ${req.page.title ? `"${req.page.title}"` : req.page.path}${req.page.heading ? `, at "${req.page.heading}"` : ""}.${req.page.selection ? ` They selected: "${req.page.selection.slice(0, 600)}"` : ""}</page>`
      : "";
  const gap = gapLine(latest, planned, found.problems.map((p) => p.concept ?? ""), found.concepts.map((c) => c.title));
  const context = [
    pageLine,
    gap,
    blocks.length ? `<dsa_sources>\n${blocks.join("\n\n")}\n</dsa_sources>` : "<dsa_sources>(nothing in the course matched this message)</dsa_sources>",
    locked.length ? `<locked_editorials>${locked.join("; ")}: not unlocked by this learner. No full solution or full approach for these.</locked_editorials>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  // the answer style beside the box; DSA's interview is a coding round
  // "Explain it differently" replaces the style line; "Teach me" adds its own (lib/ai/teaching.ts)
  const style = req.restyle ? restyleLine(req.restyle) : styleLine(req.style).replace("a system design round", "a coding interview");
  const teach = teachOf(req);
  const lines = messageLines(latest, req.style);
  // the length rule once more in the turn (Haiku drifts long on a long prompt), unless a style or "briefly" set its own
  const length = req.style || req.restyle || teach || lines.some((l) => l.startsWith("<length>")) || /\b(in depth|detailed|deeper|go deeper)\b/i.test(latest) ? "" : "<length>At most about 170 words (a quick question: about 80), unless <adapt> says shorter.</length>";
  const content = [latest, style, teach, ...lines, length, o.brief ?? "", context].filter(Boolean).join("\n\n");
  const known = Object.keys(earlier).filter((r) => KEY_RE.test(earlier[r]));
  return {
    system: dsaAskSystem(o.outline),
    messages: historyMessages(req, content),
    sources,
    earlierRefs: known,
    // Haiku 5.5 thinks first (low effort): the eval's traces and spoiler checks were wrong far more often without it
    think: true,
    cap: null,
    ask: latest,
    followups: true,
    meta: {
      hits: found.hits.length,
      editorials: found.hits.filter((h) => h.kind === "editorial").length,
      searchMs: found.ms,
      page: page ? `${page.kind}:${page.id}` : null,
      known: known.length,
      brief: o.brief ? o.brief.split("\n").length - 2 : 0,
      ...(req.style ? { style: req.style } : {}),
      ...(req.teach ? { teach: true } : {}),
      ...(req.restyle ? { restyle: req.restyle } : {}),
    },
  };
}

/** "Teach me"'s line for a DSA turn (none for a re-explanation or a "Just show me"). */
function teachOf(req: ChatRequest): string {
  const latest = req.messages[req.messages.length - 1].text.trim();
  if (!req.teach || req.restyle || latest === TEACH_REVEAL_ASK) return "";
  return teachLine({ answering: req.messages.some((m) => m.role === "assistant") });
}

/* ------------------------------------------------------------------ the problem room's tutor */

export type TutorResult = {
  mode: "run" | "submit";
  verdict: string;
  passed: number;
  total: number;
  message: string;
  failing: { name: string; hidden: boolean; input: string; expected: string; got: string; message: string } | null;
};

const VERDICTS = new Set(["AC", "WA", "TLE", "RE", "CE", "MLE", "OLE", "ERR"]);
const str = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").slice(0, n) : "");
const val = (x: unknown, n: number) => {
  if (x === undefined) return "";
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return (s ?? "").length > n ? `${s.slice(0, n)}…` : (s ?? "");
};

/** The room's last Run/Submit, checked and clipped. Hidden tests' inputs never come here (the room sends only their name). */
export function readResult(x: unknown): TutorResult | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const verdict = String(r.verdict || "");
  if (!VERDICTS.has(verdict)) return null;
  const f = r.failing && typeof r.failing === "object" ? (r.failing as Record<string, unknown>) : null;
  const hidden = !!f?.hidden;
  return {
    mode: r.mode === "submit" ? "submit" : "run",
    verdict,
    passed: Math.max(0, Math.min(10_000, Number(r.passed) || 0)),
    total: Math.max(0, Math.min(10_000, Number(r.total) || 0)),
    message: str(r.message, 1500),
    failing: f ? { name: str(f.name, 80), hidden, input: hidden ? "" : val(f.input, 800), expected: hidden ? "" : val(f.expected, 300), got: hidden ? "" : str(f.got, 300), message: str(f.message, 600) } : null,
  };
}

const VERDICT_WORDS: Record<string, string> = { AC: "Accepted", WA: "Wrong answer", TLE: "Time limit exceeded", RE: "Runtime error", CE: "Compile error", MLE: "Memory limit exceeded", OLE: "Output limit exceeded", ERR: "Error" };

export function resultLine(r: TutorResult | null): string {
  if (!r) return "<last_result>No Run or Submit yet.</last_result>";
  const parts = [`${r.mode === "submit" ? "Submit (visible + hidden tests)" : "Run (visible tests)"}: ${VERDICT_WORDS[r.verdict]}, ${r.passed}/${r.total} tests passed.`];
  if (r.failing) {
    if (r.failing.hidden) parts.push(`First failing test: a hidden test ("${r.failing.name}"). Its input is not shown to the learner or to you: tell them so in a few words, never guess it, and reason about the edge case it likely covers.${r.failing.message ? ` Note: ${r.failing.message}` : ""}`);
    else parts.push(`First failing test "${r.failing.name}": input ${r.failing.input}; expected ${r.failing.expected}; their output ${r.failing.got || "(none)"}.${r.failing.message ? ` Error: ${r.failing.message}` : ""}`);
  }
  if (r.message) parts.push(`Message: ${r.message}`);
  return `<last_result>\n${parts.join("\n")}\n</last_result>`;
}

/** Code lines an answer may show while the editorial is locked: a hint points, a fix is a line or three (text.ts capCode). */
export const CAP_HINT = 3;
export const CAP_LOCKED = 8;

export function prepareTutor(o: {
  req: ChatRequest;
  problemId: string;
  shard: ProblemShard;
  mode: TutorMode;
  lang: DsaLang;
  code: string;
  result: TutorResult | null;
  hintsOpen: number;
  unlocked: boolean;
  solved: boolean;
  /** failed submits on this problem so far (three open the editorial) */
  fails?: number;
  /** the learner brief (lib/learner/brief.ts), in the learner's turn */
  brief?: string;
}): Prepared {
  const { req, shard, mode, lang, code, result, hintsOpen, unlocked, problemId } = o;
  const latest = req.messages[req.messages.length - 1].text;
  const rungsOpen = [...(hintsOpen >= 1 && shard.model ? [{ title: "Scenario to model", text: shard.model }] : []), ...shard.rungs.slice(0, hintsOpen)];
  const nextRung = shard.rungs[hintsOpen] ?? null;
  const sig = shard.signature ? `${shard.signature.fn}(${shard.signature.params.map((p) => `${p.name}: ${p.type}`).join(", ")}) -> ${shard.signature.returns}` : shard.title;
  const system = dsaTutorSystem({
    title: shard.title,
    level: shard.level,
    conceptTitle: shard.conceptTitle,
    signature: sig,
    statement: shard.statement,
    target: shard.complexity ? `${shard.complexity.time} time, ${shard.complexity.space} extra space` : null,
    rungsOpen,
    nextRung,
    totalRungs: shard.rungs.length,
    editorial: unlocked ? shard.editorial : null,
    solution: unlocked ? (shard.solutions[lang] ?? null) : null,
  });
  // review is for an accepted solution; before one it is general feedback under the same no-spoiler rule
  const accepted = result?.verdict === "AC" || o.solved;
  const modeLine = mode === "review" && !accepted ? "ASK (they asked for a review, but the code hasn't passed yet: give feedback on what's there and what to fix first, no solution)" : mode.toUpperCase();
  const codeBlock = code.trim()
    ? `<code language="${DSA_LANG_LABEL[lang]}">\n${code
        .split("\n")
        .map((l, i) => `${String(i + 1).padStart(3)}| ${l}`)
        .join("\n")}\n</code>`
    : "<code>(the editor is empty or still the starter code)</code>";
  const attempts = unlocked ? "" : `<attempts>Failed submits on this problem so far: ${o.fails ?? 0}; the editorial opens at 3 (or if they solve it, or reveal it from the Editorial tab).</attempts>`;
  // "Explain it differently" and "Teach me" (lib/ai/teaching.ts); a hint is already a nudge, so it stays one
  const extra = req.restyle ? restyleLine(req.restyle) : mode === "hint" ? "" : teachOf(req);
  const content = [`<mode>${modeLine}</mode>`, `<message>${latest}</message>`, extra, ...messageLines(latest), o.brief ?? "", attempts, codeBlock, resultLine(result)].filter(Boolean).join("\n\n");
  return {
    system,
    messages: historyMessages(req, content, 8),
    sources: {},
    // every mode but "explain the problem" thinks first: without it, hints and free questions under pressure leaked the fix
    // and wrote notes to themselves (eval 12 Nov 2026)
    think: mode !== "explain",
    cap: unlocked ? null : mode === "hint" ? CAP_HINT : CAP_LOCKED,
    ask: `[${mode} · ${problemId} · ${lang}] ${latest}\n\n${code.slice(0, 4000)}`,
    followups: false,
    meta: { problem: problemId, mode, lang, unlocked, rung: hintsOpen, verdict: result?.verdict ?? null, codeChars: code.length, fails: o.fails ?? null, brief: o.brief ? o.brief.split("\n").length - 2 : 0, ...(req.teach ? { teach: true } : {}), ...(req.restyle ? { restyle: req.restyle } : {}) },
  };
}
