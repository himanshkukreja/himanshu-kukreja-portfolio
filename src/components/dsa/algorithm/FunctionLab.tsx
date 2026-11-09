"use client";

/**
 * The build-it-yourself lab in function mode (`::lab[id]` with lab.yml `mode: function`): the algorithm lessons' labs.
 * The learner writes one or more plain functions (BFS shortest steps and DFS flood fill on a grid, for A1), and each
 * function is tested like a small problem, with the problem room's own drivers (src/lib/dsa/harness.ts), so the
 * conventions match the warm-up problems exactly.
 *
 * - Python and JavaScript run in the browser, one run per function. Run = the visible cases; Check everything = the
 *   visible and the hidden cases. A failure shows the input (a grid drawn as rows), the value returned, the value
 *   expected, why the case exists, and a plain-words reading of any error (friendly.ts).
 * - Java and C++ go to the server judge (/api/dsa/judge with `lab`), like the design-mode labs: "coming soon" until the
 *   judge has labs.
 * - Code is kept per language on this device. A full pass awards the lab once (dsa:lab:<id>), and the map counts it
 *   towards the lesson's checkpoint (quiz + lab).
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { CodeEditorHandle } from "@/components/learn/labs/CodeEditor";
import { loadCodeEditor } from "@/lib/offline/lazy";
import { getRunner, retainRunner } from "@/lib/learn/labs/runner";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { BROWSER_LANGS, DSA_LANG_LABEL, DSA_LANGS, type DsaLang, type DsaSignature } from "@/lib/dsa/types";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import { GIVEN_JS, GIVEN_PY, VERDICT_LABEL, fnNameFor, javascriptTests, outcomeFrom, pythonTests, type CaseResult, type Verdict, type WireCase } from "@/lib/dsa/harness";
import { friendlyError } from "@/lib/dsa/friendly";
import type { FunctionLabCase, FunctionLabSpec } from "@/lib/dsa/structures";
import { useLang } from "../concept/widgets";

const CodeEditor = dynamic(loadCodeEditor, { ssr: false, loading: () => <div className="grid h-full place-items-center font-mono text-[12px] text-fg-3">Loading the editor…</div> });

const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, v: string) {
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* storage blocked */
    }
  },
};

export type FunctionLabData = { spec: FunctionLabSpec; visible: FunctionLabCase[]; hidden: FunctionLabCase[]; starters: Partial<Record<DsaLang, string>> };

const TYPE_LABEL: Record<string, Record<DsaLang, string>> = {
  int: { python: "int", javascript: "number", java: "int", cpp: "int" },
  "string[]": { python: "list[str]", javascript: "string[]", java: "String[]", cpp: "vector<string>" },
  "int[][]": { python: "list[list[int]]", javascript: "number[][]", java: "int[][]", cpp: "vector<vector<int>>" },
  bool: { python: "bool", javascript: "boolean", java: "boolean", cpp: "bool" },
};

type Row = { fn: string; c: FunctionLabCase & { hidden: boolean }; r: CaseResult | null };
type Outcome = { verdict: Verdict; passed: number; total: number; rows: Row[]; message?: string; ms: number; mode: "run" | "all"; lang: DsaLang; code: string };

/** A grid-shaped value (rows of text, or rows of numbers) drawn as rows; anything else as JSON. */
function Value({ v }: { v: unknown }) {
  const rows = Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" || Array.isArray(x)) ? (v as (string | unknown[])[]) : null;
  if (!rows) return <code className="break-all font-mono text-[13px]">{JSON.stringify(v)}</code>;
  return (
    <pre className="m-0 inline-block max-h-56 max-w-full overflow-auto border border-line bg-bg px-2 py-1 font-mono text-[13px] leading-[1.35] text-fg">
      {rows.map((r) => (typeof r === "string" ? r : r.join(" "))).join("\n")}
    </pre>
  );
}

export default function FunctionLab({ lab, lessonId }: { lab: FunctionLabData; lessonId: string }) {
  const [lang, setLang] = useLang();
  const editor = useRef<CodeEditorHandle | null>(null);
  const { done } = useGame();
  // the build-it lab: DSA Mastery Bits once (dsa:lab:<id>), never SD Mastery XP
  const { award } = useDsaAward();
  const key = (l: DsaLang) => `dsa.lab.${lab.spec.id}.${l}`;
  const initialFor = (l: DsaLang) => (typeof window === "undefined" ? lab.starters[l] || "" : store.get(key(l)) ?? lab.starters[l] ?? "");
  const [busy, setBusy] = useState<null | "run" | "all">(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState("");
  const xpKey = `dsa:lab:${lab.spec.id}`;
  const passed = !!done[xpKey];
  useEffect(() => retainRunner(), []);

  const switchLang = (l: DsaLang) => {
    const cur = editor.current?.getValue();
    if (cur !== undefined) store.set(key(lang), cur);
    setLang(l);
    setOutcome(null);
    setNotice(null);
    editor.current?.setValue(initialFor(l));
  };

  const go = async (mode: "run" | "all") => {
    if (busy) return;
    const code = editor.current?.getValue() ?? initialFor(lang);
    store.set(key(lang), code);
    setBusy(mode);
    setNotice(null);
    setOutcome(null);
    track(mode === "run" ? "dsa_lab_run" : "dsa_lab_check", { lab: lab.spec.id, lang });
    const all = [...lab.visible.map((c) => ({ ...c, hidden: false })), ...(mode === "all" ? lab.hidden.map((c) => ({ ...c, hidden: true })) : [])];
    try {
      if (!BROWSER_LANGS.has(lang)) {
        const r = await userFetch("/api/dsa/judge", { method: "POST", body: JSON.stringify({ lab: `${lessonId}/${lab.spec.id}`, language: lang, code, mode: mode === "all" ? "submit" : "run" }) });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setNotice(j.error || "The judge couldn't run this lab. Python and JavaScript run in your browser today.");
        return;
      }
      const py = lang === "python";
      const runner = getRunner(py ? "py" : "js");
      if (runner.status.phase !== "ready") setLoadMsg(py ? "Starting Python in your browser (the first run downloads about 6.5 MB)…" : "Starting JavaScript…");
      const rows: Row[] = [];
      let ms = 0;
      let setup: string | undefined;
      let setupVerdict: Verdict | null = null;
      for (const f of lab.spec.functions) {
        const cases = all.filter((c) => c.fn === f.fn);
        if (!cases.length) continue;
        const sig: DsaSignature = { fn: f.fn, params: f.params, returns: f.returns };
        // every case is sent as visible, so a failing edge case still shows what the function returned
        const wire: WireCase[] = cases.map((c) => ({ name: c.name, args: sig.params.map((p) => c.input[p.name]), expected: c.output, hidden: false }));
        const src = py ? pythonTests(sig, wire, "exact") : javascriptTests(sig, wire, "exact");
        const res = await runner.runTests({ code, ts: false, given: { code: py ? GIVEN_PY : GIVEN_JS, ts: false }, groups: [{ name: "dsa", src, ts: false }] }, 30_000, () => {});
        setLoadMsg("");
        const o = outcomeFrom(res, wire, Math.round((lab.spec.limits.timeMs || 2000) * (py ? 3 : 1.5)));
        ms += o.ms;
        if (!o.cases.length && o.verdict !== "AC") {
          // the code did not load (syntax error, missing function) or the run timed out: every case of this function fails
          setup = setup || o.message;
          setupVerdict = setupVerdict || o.verdict;
          cases.forEach((c) => rows.push({ fn: f.fn, c, r: null }));
          continue;
        }
        cases.forEach((c, i) => rows.push({ fn: f.fn, c, r: o.cases[i] || null }));
      }
      const passedN = rows.filter((x) => x.r?.ok).length;
      const firstBad = rows.find((x) => !x.r?.ok);
      const verdict: Verdict = !firstBad ? "AC" : firstBad.r ? firstBad.r.verdict : setupVerdict || "ERR";
      setOutcome({ verdict, passed: passedN, total: rows.length, rows, message: setup, ms, mode, lang, code });
      if (mode === "all" && verdict === "AC") {
        if (!passed) award([xpKey], `Lab: ${lab.spec.title}`);
        track("dsa_lab_pass", { lab: lab.spec.id, lang });
      }
    } catch (e) {
      setNotice((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(null);
      setLoadMsg("");
    }
  };

  const reset = () => {
    const s = lab.starters[lang] || "";
    editor.current?.setValue(s);
    store.set(key(lang), s);
  };

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-col gap-2">
        <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          Build it yourself · {lab.spec.functions.length} functions
          {passed && <span className="border border-ok px-1.5 py-0.5 text-ok-text">✓ lab passed</span>}
        </p>
        <p className="m-0 text-[15px] leading-relaxed text-fg-2">{lab.spec.summary}</p>
        {lab.spec.legend && <p className="m-0 font-mono text-[13px] text-fg-3">{lab.spec.legend}</p>}
      </div>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {lab.spec.functions.map((f, i) => (
          <li key={f.fn} className="flex flex-col gap-1 border border-line bg-surface px-3 py-2.5">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-fg">
                {i + 1}. {f.title}
              </span>
              {f.cost && <span className="font-mono text-[12px] text-fg-3">aim for {f.cost}</span>}
            </span>
            <code className="break-all font-mono text-[13px] text-signal-text">
              {fnNameFor(lang, f.fn)}({f.params.map((p) => fnNameFor(lang, p.name)).join(", ")}) → {TYPE_LABEL[f.returns]?.[lang] ?? f.returns}
            </code>
            <span className="text-[14px] leading-relaxed text-fg-2">{f.does}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Language" className="flex flex-wrap border border-line-strong">
          {DSA_LANGS.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={l === lang} onClick={() => switchLang(l)} className={`min-h-10 px-3 font-mono text-[12px] ${l === lang ? "bg-signal text-on-signal" : "text-fg-2 hover:bg-surface-2"}`}>
              {DSA_LANG_LABEL[l]}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-fg-3">{BROWSER_LANGS.has(lang) ? "runs in your browser" : "judged on the server"}</span>
        <button type="button" onClick={reset} className="ml-auto min-h-10 px-2 font-mono text-[12px] text-fg-3 underline">
          reset code
        </button>
      </div>
      <div className="h-[420px] border border-line-strong sm:h-[480px]">
        <CodeEditor key={lab.spec.id} handle={editor} initial={initialFor(lang)} fontSize={14} label={`${DSA_LANG_LABEL[lang]} lab code`} language={lang} onRun={() => void go("run")} onFocus={() => BROWSER_LANGS.has(lang) && void getRunner(lang === "python" ? "py" : "js").warm()} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void go("run")} disabled={!!busy} className="min-h-11 border-2 border-signal px-5 text-[15px] font-semibold text-signal-text disabled:opacity-50">
          {busy === "run" ? "Running…" : "Run"}
        </button>
        <button type="button" onClick={() => void go("all")} disabled={!!busy} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-50">
          {busy === "all" ? "Checking…" : "Check everything"}
        </button>
        <span className="font-mono text-[11px] text-fg-3">
          Run: {lab.visible.length} cases · Check everything: + {lab.hidden.length} edge cases
        </span>
      </div>

      {loadMsg && <p className="m-0 text-[13px] text-fg-3">{loadMsg}</p>}
      {notice && (
        <p className="m-0 border border-line-strong px-3 py-2 text-[14px] text-fg" role="status">
          {notice}
        </p>
      )}
      {outcome && <Results o={outcome} spec={lab.spec} />}
    </div>
  );
}

function Results({ o, spec }: { o: Outcome; spec: FunctionLabSpec }) {
  const ok = o.verdict === "AC";
  const friendly = (verdict: string, message: string | undefined, line?: number | null) =>
    message ? friendlyError({ verdict, message, line: line ?? null, code: o.code, lang: o.lang }) : null;
  const setupText = o.message ? friendly(o.verdict, o.message) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-live="polite">
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-4 bg-surface px-3 py-2 ${ok ? "border-ok" : "border-bad"}`}>
        <span className={`font-display text-[20px] font-bold ${ok ? "text-ok-text" : "text-bad-text"}`}>
          {ok ? "✓" : "✗"} {ok ? (o.mode === "all" ? "Both searches work" : "Accepted") : VERDICT_LABEL[o.verdict]}
        </span>
        <span className="font-mono text-[12px] text-fg-3">
          {o.passed}/{o.total} cases {o.mode === "all" ? "(including the edge cases)" : "(visible)"} · {Math.round(o.ms)} ms in your browser
        </span>
      </div>
      {ok && o.mode === "run" && <p className="m-0 text-[14px] text-fg-2">The visible cases pass. Now press “Check everything” for the edge cases: a sealed shelf, a one-row floor, a 60 by 60 floor that is too deep for recursion.</p>}
      {ok && o.mode === "all" && <p className="m-0 text-[14px] text-fg-2">Every case passes, edge cases included. This counts towards the checkpoint with the quiz. The warm-up problems below use the same searches.</p>}
      {o.message && (
        <div className="flex flex-col gap-1 border border-bad px-3 py-2">
          {setupText && <p className="m-0 text-[14px] text-fg">{setupText}</p>}
          <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-bad-text">{o.message}</pre>
        </div>
      )}
      {spec.functions.map((f) => {
        const mine = o.rows.filter((x) => x.fn === f.fn);
        if (!mine.length) return null;
        const good = mine.filter((x) => x.r?.ok).length;
        return (
          <section key={f.fn} className="flex min-w-0 flex-col gap-2" aria-label={f.title}>
            <h4 className="m-0 flex flex-wrap items-baseline gap-2 text-[15px] font-semibold text-fg">
              {f.title}
              <span className={`font-mono text-[12px] font-normal ${good === mine.length ? "text-ok-text" : "text-bad-text"}`}>
                {good}/{mine.length} pass
              </span>
            </h4>
            {mine.some((x) => x.r?.ok) && (
              <div className="flex flex-wrap gap-1.5" aria-label="Cases that pass">
                {mine
                  .filter((x) => x.r?.ok)
                  .map((x) => (
                    <span key={x.c.name} className="border border-line px-2 py-1 font-mono text-[11px] text-fg-2">
                      <span className="text-ok-text">✓</span> {x.c.name}
                    </span>
                  ))}
              </div>
            )}
            {mine
              .filter((x) => x.r && !x.r.ok)
              .map((x) => {
                const r = x.r!;
                const text = r.verdict === "WA" ? null : friendly(r.verdict, r.message, r.userLine ?? r.line);
                let got: unknown = undefined;
                try {
                  got = r.got !== undefined ? JSON.parse(r.got) : undefined;
                } catch {
                  got = r.got;
                }
                return (
                  <div key={x.c.name} className="flex min-w-0 flex-col gap-2 border border-bad px-3 py-2">
                    <p className="m-0 flex flex-wrap items-baseline gap-2 font-mono text-[12px]">
                      <span className="text-bad-text">✗</span>
                      <span className="text-fg">{x.c.name}</span>
                      {x.c.hidden && <span className="text-fg-3">edge case</span>}
                      <span className="text-bad-text">{VERDICT_LABEL[r.verdict]}</span>
                    </p>
                    {x.c.note && <p className="m-0 text-[14px] text-fg-2">Why this case: {x.c.note}.</p>}
                    {text && <p className="m-0 text-[14px] text-fg">{text}</p>}
                    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                      {Object.entries(x.c.input).map(([k, v]) => (
                        <div key={k} className="flex min-w-0 flex-col gap-1">
                          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{k}</span>
                          <Value v={v} />
                        </div>
                      ))}
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Expected</span>
                        <Value v={x.c.output} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-mono text-[11px] uppercase tracking-label text-bad-text">You returned</span>
                        {got !== undefined ? <Value v={got} /> : <span className="text-[13px] text-fg-3">{r.verdict === "WA" ? "nothing" : "it stopped before returning"}</span>}
                      </div>
                    </div>
                    {r.message && r.verdict !== "WA" && (
                      <details>
                        <summary className="cursor-pointer font-mono text-[12px] text-fg-3">the error message</summary>
                        <pre className="m-0 mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-bad-text">{r.message}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}
