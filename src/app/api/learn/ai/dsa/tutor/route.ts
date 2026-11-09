import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { chatLimits, chatToday, quotaFor } from "@/lib/ai/chat/quota";
import { messageLines } from "@/lib/ai/answerStyle";
import { DSA_FULL } from "@/lib/dsa/flags";
import { DSA_LANG_LABEL, DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { getProblemShard } from "@/lib/dsa/ai/search";
import { forgetUnlocks, unlocksFor } from "@/lib/dsa/ai/unlock";
import { dsaTutorSystem } from "@/lib/dsa/ai/prompts";
import { TUTOR_MODES, type TutorMode } from "@/lib/dsa/ai/modes";
import { historyMessages, streamDsa } from "@/lib/dsa/ai/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CODE = 12_000;
const VERDICTS = new Set(["AC", "WA", "TLE", "RE", "CE", "MLE", "OLE", "ERR"]);
/** Code lines an answer may show while the editorial is locked: a hint points, a fix is a line or three (text.ts capCode). */
const CAP_HINT = 3;
const CAP_LOCKED = 8;

const str = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").slice(0, n) : "");
const val = (x: unknown, n: number) => {
  if (x === undefined) return "";
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return (s ?? "").length > n ? `${s.slice(0, n)}…` : (s ?? "");
};

type Result = {
  mode: "run" | "submit";
  verdict: string;
  passed: number;
  total: number;
  message: string;
  failing: { name: string; hidden: boolean; input: string; expected: string; got: string; message: string } | null;
};

/** The room's last Run/Submit, checked and clipped. Hidden tests' inputs never come here (the room sends only their name). */
function readResult(x: unknown): Result | null {
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

function resultLine(r: Result | null): string {
  if (!r) return "<last_result>No Run or Submit yet.</last_result>";
  const parts = [`${r.mode === "submit" ? "Submit (visible + hidden tests)" : "Run (visible tests)"}: ${VERDICT_WORDS[r.verdict]}, ${r.passed}/${r.total} tests passed.`];
  if (r.failing) {
    if (r.failing.hidden) parts.push(`First failing test: a hidden test ("${r.failing.name}"; its input is not shown to the learner, so don't guess it: reason about edge cases).${r.failing.message ? ` Note: ${r.failing.message}` : ""}`);
    else parts.push(`First failing test "${r.failing.name}": input ${r.failing.input}; expected ${r.failing.expected}; their output ${r.failing.got || "(none)"}.${r.failing.message ? ` Error: ${r.failing.message}` : ""}`);
  }
  if (r.message) parts.push(`Message: ${r.message}`);
  return `<last_result>\n${parts.join("\n")}\n</last_result>`;
}

/**
 * GET /api/learn/ai/dsa/tutor → { quota } (signed in): the problem tutor's daily messages.
 *
 * POST /api/learn/ai/dsa/tutor (ChatRequest + { dsa: { problemId, mode, code, lang, result, hintsOpen } }) → server-sent
 * events (ChatEvent): the problem room's tutor (feature "dsa-tutor", its own daily messages). The problem's statement,
 * signature, target complexity and the hint ladder up to the learner's next rung go in the system prompt; the editorial and
 * the reference solution only when this learner unlocked it (read from their own rows, lib/dsa/ai/unlock.ts). While it is
 * locked, code blocks in the answer are capped (lib/dsa/ai/text.ts capCode) on top of the prompt's no-spoiler rule.
 * Hint, ask: no thinking; debug, complexity, review, dry run: Haiku 5.5 thinks first (low effort). 404 in "soon" mode.
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const [{ perDay }, t] = await Promise.all([chatLimits("dsa-tutor"), chatToday(me.id, "dsa-tutor")]);
  return NextResponse.json({ quota: quotaFor(perDay, t.total, !!ownKey(request)), memory: { available: false, paused: false, has: false }, feedback: false }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = readRequest(body);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400, headers: noStore });
  const req = parsed;
  const d = (body?.dsa && typeof body.dsa === "object" ? body.dsa : {}) as Record<string, unknown>;
  const problemId = String(d.problemId || "");
  if (!ID.test(problemId)) return NextResponse.json({ error: "Unknown problem" }, { status: 400, headers: noStore });
  const mode: TutorMode = TUTOR_MODES.includes(d.mode as TutorMode) ? (d.mode as TutorMode) : "ask";
  const lang: DsaLang = DSA_LANGS.includes(d.lang as DsaLang) ? (d.lang as DsaLang) : "python";
  const code = typeof d.code === "string" ? d.code : "";
  if (code.length > MAX_CODE) return NextResponse.json({ error: `Your code is too long for the tutor (${code.length.toLocaleString()} characters, the limit is ${MAX_CODE.toLocaleString()}).` }, { status: 413, headers: noStore });
  const result = readResult(d.result);
  const hintsOpen = Math.max(0, Math.min(10, Math.floor(Number(d.hintsOpen) || 0)));
  const shard = await getProblemShard(problemId).catch(() => null);
  if (!shard) return NextResponse.json({ error: "Unknown problem" }, { status: 404, headers: noStore });
  const admin = await isAdminEmail(me.email);
  const latest = req.messages[req.messages.length - 1].text;

  return streamDsa({
    request,
    me,
    admin,
    userKey: ownKey(request),
    feature: "dsa-tutor",
    req,
    lookup: { tool: "get_item", label: mode === "hint" ? "Reading your code and the hint ladder…" : mode === "explain" ? "Reading the problem…" : "Reading your code and the problem…", noun: "problem" },
    prepare: async () => {
      // a fresh read after an accepted submit (the solve was recorded a moment ago)
      if (result?.verdict === "AC" && result.mode === "submit") forgetUnlocks(me.id);
      const unlocks = await unlocksFor(me.id);
      const unlocked = unlocks.unlocked.has(problemId);
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
      const accepted = result?.verdict === "AC" || unlocks.solved.has(problemId);
      const modeLine = mode === "review" && !accepted ? "ASK (they asked for a review, but the code hasn't passed yet: give feedback on what's there and what to fix first, no solution)" : mode.toUpperCase();
      const codeBlock = code.trim() ? `<code language="${DSA_LANG_LABEL[lang]}">\n${code.split("\n").map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join("\n")}\n</code>` : "<code>(the editor is empty or still the starter code)</code>";
      const content = [`<mode>${modeLine}</mode>`, `<message>${latest}</message>`, ...messageLines(latest), codeBlock, resultLine(result)].join("\n\n");
      return {
        system,
        messages: historyMessages(req, content, 8),
        sources: {},
        think: mode === "debug" || mode === "complexity" || mode === "review" || mode === "dryrun",
        cap: unlocked ? null : mode === "hint" ? CAP_HINT : CAP_LOCKED,
        ask: `[${mode} · ${problemId} · ${lang}] ${latest}\n\n${code.slice(0, 4000)}`,
        followups: false,
        meta: { problem: problemId, mode, lang, unlocked, rung: hintsOpen, verdict: result?.verdict ?? null, codeChars: code.length },
      };
    },
  });
}
