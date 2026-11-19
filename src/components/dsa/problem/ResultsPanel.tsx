"use client";

/**
 * The editor's bottom panel (Results | Submissions): the sample-test summary and verdict, the plain-language error,
 * "Try a smaller version", the Bits receipt, printed output, and the submissions history on this device.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { DSA_LANG_LABEL, type DsaLang, type DsaTestCase } from "@/lib/dsa/types";
import { VERDICT_LABEL, fnNameFor, type JudgeOutcome } from "@/lib/dsa/harness";
import { friendlyError, friendlyWrong } from "@/lib/dsa/friendly";
import Warmup from "./Warmup";
import type { Room } from "./useProblemRoom";

const fmtVal = (v: unknown) => JSON.stringify(v);

/** The first error as a plain sentence (friendly.ts), the raw message folded under it. */
function useFriendly(outcome: JudgeOutcome, code: string, lang: DsaLang, fn: string): { text: string; raw: string } | null {
  return useMemo(() => {
    if (outcome.verdict === "AC") return null;
    const bad = outcome.cases.find((c) => !c.ok && c.message) || null;
    const raw = outcome.message || bad?.message || "";
    if (raw) {
      // a setup error (syntax) carries its line in the message; a test's error, in its deepest frame in solution.*
      const text = friendlyError({ verdict: bad?.verdict || outcome.verdict, message: raw, line: outcome.message ? null : (bad?.userLine ?? null), code, lang, fn });
      return text ? { text, raw } : null;
    }
    const wrong = outcome.cases.find((c) => !c.ok && !c.hidden);
    const text = wrong ? friendlyWrong(wrong.got, lang) : null;
    return text ? { text, raw: "" } : null;
  }, [outcome, code, lang, fn]);
}

function VerdictPanel({
  outcome,
  mode,
  visible,
  onTutor,
  code,
  lang,
  fn,
}: {
  outcome: JudgeOutcome;
  mode: "run" | "submit";
  visible: DsaTestCase[];
  onTutor?: (mode: "debug" | "review") => void;
  code: string;
  lang: DsaLang;
  fn: string;
}) {
  const ok = outcome.verdict === "AC";
  const [sel, setSel] = useState(0);
  const shown = outcome.cases.filter((c) => !c.hidden);
  const firstHiddenFail = outcome.cases.find((c) => c.hidden && !c.ok);
  const cur = shown[Math.min(sel, Math.max(0, shown.length - 1))];
  const tc = visible.find((v) => v.name === cur?.name);
  const friendly = useFriendly(outcome, code, lang, fn);
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[10px] border-l-4 bg-bg px-3 py-2 ${ok ? "border-ok" : "border-bad"}`}>
        <span className={`font-display text-[20px] font-bold ${ok ? "text-ok-text" : "text-bad-text"}`}>
          {ok ? "✓" : "✗"} {VERDICT_LABEL[outcome.verdict]}
        </span>
        <span className="font-mono text-[12px] text-fg-3">
          {outcome.passed}/{outcome.total} tests {mode === "submit" ? "(visible + hidden)" : "(visible)"} · {Math.round(outcome.ms)} ms · {outcome.judgedBy === "server" ? "judge server" : "in your browser"}
        </span>
        {onTutor && (!ok || mode === "submit") && (
          <button
            type="button"
            onClick={() => onTutor(ok ? "review" : "debug")}
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-signal px-2.5 text-[13px] font-medium text-signal-text hover:bg-[var(--c-dsa-hl)] [@media(pointer:coarse)]:min-h-11"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {ok ? "Get a review" : "Ask the tutor why"}
          </button>
        )}
      </div>
      {friendly ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-bad/40 bg-surface px-3 py-2.5" data-friendly-error>
          <p className="m-0 text-[15px] leading-snug text-fg">{friendly.text}</p>
          {friendly.raw ? (
            <details>
              <summary className="min-h-8 cursor-pointer font-mono text-[12px] text-fg-3 hover:text-fg">Show the full error</summary>
              <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-bad-text">{friendly.raw}</pre>
            </details>
          ) : null}
        </div>
      ) : (
        outcome.message && <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap border border-line bg-surface p-3 font-mono text-[12px] text-bad-text">{outcome.message}</pre>
      )}
      {firstHiddenFail && (
        <p className="m-0 text-[14px] text-fg-2">
          A hidden test failed: <span className="font-mono">{firstHiddenFail.name.replace(/^hidden · /, "")}</span>
          {firstHiddenFail.message ? ` (${firstHiddenFail.message})` : ""}. Think about edge cases: the smallest input, ties, the largest values.
        </p>
      )}
      {shown.length > 0 && (
        <div className="flex flex-col gap-2">
          <div role="tablist" aria-label="Test cases" className="flex flex-wrap gap-1">
            {shown.map((c, i) => (
              <button
                key={c.name}
                type="button"
                role="tab"
                aria-selected={i === sel}
                onClick={() => setSel(i)}
                className={`min-h-9 rounded-full border px-3 font-mono text-[12px] ${i === sel ? "border-signal text-fg" : "border-line-strong text-fg-3"}`}
              >
                {c.ok ? "✓" : "✗"} {c.name}
              </button>
            ))}
          </div>
          {cur && (
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-[10px] bg-bg p-3 font-mono text-[12px]">
              {tc &&
                Object.entries(tc.input).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-fg-3">{k}</dt>
                    <dd className="m-0 min-w-0 break-all text-fg">
                      <CaseValue v={v} />
                    </dd>
                  </div>
                ))}
              <dt className="text-fg-3">expected</dt>
              <dd className="m-0 min-w-0 break-all text-fg">{tc ? <CaseValue v={tc.output} /> : "–"}</dd>
              <dt className="text-fg-3">output</dt>
              <dd className={`m-0 min-w-0 break-all ${cur.ok ? "text-ok-text" : "text-bad-text"}`}>
                {cur.got !== undefined ? <CaseValue v={parseGot(cur.got)} /> : cur.ok ? tc ? <CaseValue v={tc.output} /> : "–" : "–"}
              </dd>
              {cur.message && (
                <>
                  <dt className="text-fg-3">note</dt>
                  <dd className="m-0 whitespace-pre-wrap break-words text-bad-text">{cur.message}</dd>
                </>
              )}
              <dt className="text-fg-3">time</dt>
              <dd className="m-0 text-fg-2">{cur.ms.toFixed(1)} ms</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

/** A grid (rows of text, or rows of numbers, two or more rows) drawn as rows; anything else as one line of JSON. */
function asGrid(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  if (v.every((r) => typeof r === "string")) return v as string[];
  if (v.every((r) => Array.isArray(r) && r.every((x) => typeof x === "number"))) {
    const w = Math.max(1, ...(v as number[][]).flat().map((x) => String(x).length));
    return (v as number[][]).map((r) => r.map((x) => String(x).padStart(w)).join(" "));
  }
  return null;
}

function parseGot(got: string): unknown {
  try {
    return JSON.parse(got);
  } catch {
    return got;
  }
}

function CaseValue({ v }: { v: unknown }) {
  const rows = asGrid(v);
  if (!rows) return <>{fmtVal(v)}</>;
  return <pre className="m-0 max-h-64 overflow-auto whitespace-pre leading-[1.35]">{rows.join("\n")}</pre>;
}

/* ------------------------------------------------------------------ the panel */

/** `open` false folds the panel to its tab bar (EditorPane opens it on every run); the bar then carries the last verdict */
export default function ResultsPanel({ room, open = true, onOpen }: { room: Room; open?: boolean; onOpen?: (open: boolean) => void }) {
  const { p, outcome, notice, loadMsg, stdout, bottom, setBottom, history, solved, fails, askTutor } = room;
  const hint = `Run tries the ${p.visible.length} sample test${p.visible.length === 1 ? "" : "s"}. Submit also runs ${p.hiddenCount} hidden test${p.hiddenCount === 1 ? "" : "s"}; when it says Accepted, the problem is solved.`;
  const tabs = [
    { id: "results" as const, label: "Results" },
    { id: "submissions" as const, label: `Submissions${history.length ? ` · ${history.length}` : ""}` },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-surface" data-results-panel>
      <div role="tablist" aria-label="Results and submissions" className={`flex shrink-0 items-center ${open ? "border-b border-line" : ""}`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`rp-tab-${t.id}`}
            aria-selected={bottom === t.id}
            aria-controls={`rp-${t.id}`}
            onClick={() => {
              setBottom(t.id);
              onOpen?.(true);
            }}
            className={`inline-flex min-h-10 shrink-0 items-center border-b-2 px-3.5 text-[13px] font-medium [@media(pointer:coarse)]:min-h-11 ${bottom === t.id && open ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
        {!open && (
          <button type="button" onClick={() => onOpen?.(true)} className="min-w-0 flex-1 truncate px-2 text-left text-[12px] text-fg-3 hover:text-fg" title={outcome ? undefined : hint}>
            {outcome ? (
              <span className={outcome.o.verdict === "AC" ? "text-ok-text" : "text-bad-text"}>
                {outcome.o.verdict === "AC" ? "✓" : "✗"} {VERDICT_LABEL[outcome.o.verdict]} · {outcome.o.passed}/{outcome.o.total} tests
              </span>
            ) : (
              hint
            )}
          </button>
        )}
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Hide the results panel" : "Show the results panel"}
            className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 px-3 text-[12px] text-fg-3 hover:text-fg [@media(pointer:coarse)]:min-h-11"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {open && <div role="tabpanel" id={`rp-${bottom}`} aria-labelledby={`rp-tab-${bottom}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {bottom === "results" ? (
          <div className="flex flex-col gap-3">
            {loadMsg && <p className="m-0 text-[13px] text-fg-3">{loadMsg}</p>}
            {notice && (
              <p data-dsa-verdict className={`m-0 rounded-[10px] border px-3 py-2 text-[14px] ${outcome?.o.verdict === "AC" ? "border-ok text-ok-text" : "border-line-strong text-fg"}`} role="status">
                {notice}
              </p>
            )}
            {outcome && <VerdictPanel outcome={outcome.o} mode={outcome.mode} visible={p.visible} onTutor={askTutor} code={outcome.code} lang={outcome.lang} fn={fnNameFor(outcome.lang, p.signature.fn)} />}
            {outcome && outcome.o.verdict !== "AC" && !solved && fails >= 3 && <Warmup problem={p.id} concept={p.conceptTitle} />}
            {stdout && (
              <details className="rounded-[10px] border border-line bg-bg">
                <summary className="min-h-10 cursor-pointer px-3 py-2 font-mono text-[12px] text-fg-3">Your printed output</summary>
                <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[12px] text-fg-2">{stdout}</pre>
              </details>
            )}
            {!outcome && !notice && !loadMsg && !stdout && (
              <p className="m-0 flex items-start gap-2 text-[14px] text-fg-3">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-text" aria-hidden />
                <span>{hint}</span>
              </p>
            )}
          </div>
        ) : history.length === 0 ? (
          <p className="m-0 text-[14px] text-fg-3">No submissions on this device yet.</p>
        ) : (
          <table className="w-full border-collapse text-left font-mono text-[12px]">
            <thead>
              <tr className="text-fg-3">
                <th className="border-b border-line py-2 font-medium">When</th>
                <th className="border-b border-line py-2 font-medium">Language</th>
                <th className="border-b border-line py-2 font-medium">Verdict</th>
                <th className="border-b border-line py-2 font-medium">Tests</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.at}>
                  <td className="border-b border-line py-2 text-fg-2">{new Date(h.at).toLocaleString()}</td>
                  <td className="border-b border-line py-2 text-fg-2">{DSA_LANG_LABEL[h.lang]}</td>
                  <td className={`border-b border-line py-2 ${h.verdict === "AC" ? "text-ok-text" : "text-bad-text"}`}>
                    {h.verdict === "AC" ? "✓ " : "✗ "}
                    {VERDICT_LABEL[h.verdict as keyof typeof VERDICT_LABEL] || h.verdict}
                  </td>
                  <td className="border-b border-line py-2 text-fg-2">
                    {h.passed}/{h.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  );
}
