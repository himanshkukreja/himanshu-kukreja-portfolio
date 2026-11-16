"use client";

/**
 * One run's output, shared by the Playground and the lessons' runnable snippets: stdout, then stderr (in the error
 * colour), then the facts line (language · exit code · time · memory, and where it ran). Live while a browser run
 * streams. Theme tokens only.
 */
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { resultLine, type ProgramResult } from "@/lib/dsa/playground/program";

export type OutputState =
  | { kind: "idle" }
  | { kind: "running"; lang: DsaLang; stdout: string; note: string | null }
  | { kind: "done"; lang: DsaLang; result: ProgramResult }
  | { kind: "failed"; lang: DsaLang; error: string; comingSoon?: boolean };

const VERDICT: Record<string, string> = { RE: "Runtime error", TLE: "Time limit", MLE: "Memory limit", OLE: "Output limit", CE: "Compile error", ERR: "Didn't run" };

export function FactsLine({ lang, result, compact = false }: { lang: DsaLang; result: ProgramResult; compact?: boolean }) {
  const bad = result.verdict !== "OK";
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-fg-3">
      <span className="text-fg-2">{DSA_LANG_LABEL[lang]}</span>
      <span aria-hidden>·</span>
      <span className={bad ? "text-bad-text" : ""}>{resultLine(result)}</span>
      {!compact && (
        <>
          <span aria-hidden>·</span>
          <span>{result.where === "browser" ? "ran in your browser" : "ran on the server"}</span>
        </>
      )}
      {bad && VERDICT[result.verdict] ? <span className="rounded-full border border-bad px-2 py-px text-[11px] text-bad-text">{VERDICT[result.verdict]}</span> : null}
    </p>
  );
}

export default function ProgramOutput({ state, empty, className = "", maxHeight = "" }: { state: OutputState; empty?: React.ReactNode; className?: string; maxHeight?: string }) {
  if (state.kind === "idle") return <div className={`text-[13px] text-fg-3 ${className}`}>{empty ?? "Run the code to see its output here."}</div>;
  if (state.kind === "failed")
    return (
      <div className={`text-[13px] ${state.comingSoon ? "text-fg-2" : "text-bad-text"} ${className}`} role="alert">
        {state.error}
      </div>
    );
  const stdout = state.kind === "running" ? state.stdout : state.result.stdout;
  const stderr = state.kind === "done" ? state.result.stderr : "";
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`} aria-live="polite" aria-busy={state.kind === "running"}>
      <div className={`min-h-0 overflow-auto ${maxHeight}`}>
        {stdout ? <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-fg">{stdout}</pre> : null}
        {stderr ? <pre className="m-0 mt-1 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-bad-text">{stderr}</pre> : null}
        {state.kind === "done" && !stdout && !stderr ? <p className="m-0 font-mono text-[12.5px] text-fg-3">(no output)</p> : null}
        {state.kind === "running" && !stdout ? <p className="m-0 font-mono text-[12.5px] text-fg-3">{state.note || "Running…"}</p> : null}
      </div>
      {state.kind === "done" ? (
        <div className="flex flex-col gap-1">
          <FactsLine lang={state.lang} result={state.result} />
          {state.result.note ? <p className="m-0 font-mono text-[12px] text-fg-3">{state.result.note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
