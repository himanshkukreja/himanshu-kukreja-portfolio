"use client";

/**
 * Runs one program (the Playground, a lesson's runnable snippet): Python and JavaScript in this browser on the code-labs
 * workers, Java and C++ on the server judge (/api/dsa/program). Callers check sign-in first (running is signed-in only).
 */
import { getRunner } from "@/lib/learn/labs/runner";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import type { DsaLang } from "@/lib/dsa/types";
import { BROWSER_PROGRAM_LANGS, PROGRAM_LIMITS, browserProgramGroups, checkProgramSize, programResultFromHarness, type BrowserOutcome, type ProgramResult } from "@/lib/dsa/playground/program";

export type RunRequest = { lang: DsaLang; code: string; stdin: string; from: "playground" | "snippet" | "compare" };
/** a run that couldn't start (a size limit, the server judge not set up, a rate limit): a message, no result */
export type RunFailure = { error: string; comingSoon?: boolean };

export const isRunFailure = (r: ProgramResult | RunFailure): r is RunFailure => "error" in r;

/** Status while a browser runtime loads (first Python run downloads Pyodide). */
export function runtimeNote(lang: DsaLang): string | null {
  if (!BROWSER_PROGRAM_LANGS.has(lang)) return null;
  const r = getRunner(lang === "python" ? "py" : "js");
  if (r.status.phase === "ready") return null;
  return lang === "python" ? "Starting Python in your browser (the first run downloads about 6.5 MB)…" : "Starting JavaScript…";
}

export function warmRuntime(lang: DsaLang) {
  if (BROWSER_PROGRAM_LANGS.has(lang)) void getRunner(lang === "python" ? "py" : "js").warm();
}

export async function runProgram(req: RunRequest, onStdout?: (text: string) => void): Promise<ProgramResult | RunFailure> {
  const bad = checkProgramSize(req.code, req.stdin);
  if (bad) return { error: bad };
  const t0 = Date.now();
  let out: ProgramResult | RunFailure;
  if (req.lang === "python" || req.lang === "javascript") {
    const runner = getRunner(req.lang === "python" ? "py" : "js");
    if (runner.busy) return { error: "Another run is still going. Wait for it to finish." };
    let stdout = "";
    const res = await runner.runTests({ code: "", ts: false, given: null, groups: browserProgramGroups(req.lang, req.code, req.stdin) }, PROGRAM_LIMITS.browserTimeoutMs, (t) => {
      stdout += t;
      onStdout?.(stdout);
    });
    out = programResultFromHarness(res as BrowserOutcome, stdout);
  } else {
    try {
      const r = await userFetch("/api/dsa/program", { method: "POST", body: JSON.stringify({ language: req.lang, code: req.code, stdin: req.stdin }) });
      const j = (await r.json().catch(() => ({}))) as ProgramResult & { error?: string; comingSoon?: boolean };
      out = r.ok ? j : { error: j.error || "The server couldn't run this. Please try again.", comingSoon: !!j.comingSoon };
    } catch {
      out = { error: "Couldn't reach the server. Check your connection and try again." };
    }
  }
  track("dsa_program_run", { lang: req.lang, from: req.from, ok: !isRunFailure(out) && out.verdict === "OK", verdict: isRunFailure(out) ? "error" : out.verdict, ms: Date.now() - t0 });
  return out;
}
