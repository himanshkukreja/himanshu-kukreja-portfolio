"use client";

/**
 * The build-it-yourself lab (`::lab[id]`): the learner implements the structure's class in their language and runs
 * the lab's operation-sequence tests (design mode, src/lib/dsa/design-harness.ts).
 *
 * - Python and JavaScript run in the browser on the code-labs workers, like the problem room. Run = the visible
 *   cases; Check everything = visible + hidden. Each failure names the exact call that went wrong and what it
 *   returned, with the case's note (why the case exists).
 * - Java and C++ go to the server judge (/api/dsa/judge with `lab`), the same way as problems: until the judge has
 *   design mode (and is live) the route answers "coming soon", and the page says so.
 * - Code is kept per language on this device. A full pass awards the lab once (dsa:lab:<id>).
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CodeEditorHandle } from "@/components/learn/labs/CodeEditor";
import { loadCodeEditor } from "@/lib/offline/lazy";
import { getRunner, retainRunner } from "@/lib/learn/labs/runner";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { BROWSER_LANGS, DSA_LANG_LABEL, DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import { VERDICT_LABEL } from "@/lib/dsa/harness";
import { labFailureText, labJavascriptTests, labMethodName, labOutcome, labPythonTests, opText, type LabCase, type LabOutcome, type LabSpec } from "@/lib/dsa/design-harness";
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

export type LabData = { spec: LabSpec; visible: LabCase[]; hidden: LabCase[]; starters: Partial<Record<DsaLang, string>> };

const TYPE_LABEL: Record<string, Record<DsaLang, string>> = {
  int: { python: "int", javascript: "number", java: "int", cpp: "int" },
  "int[]": { python: "list[int]", javascript: "number[]", java: "int[]", cpp: "vector<int>" },
  void: { python: "None", javascript: "nothing", java: "void", cpp: "void" },
  bool: { python: "bool", javascript: "boolean", java: "boolean", cpp: "bool" },
};

export default function StructureLab({ lab, lessonId }: { lab: LabData; lessonId: string }) {
  const [lang, setLang] = useLang();
  const editor = useRef<CodeEditorHandle | null>(null);
  const { done } = useGame();
  // the build-it lab: DSA Mastery Bits once (dsa:lab:<id>), never SD Mastery XP
  const { award } = useDsaAward();
  const key = (l: DsaLang) => `dsa.lab.${lab.spec.id}.${l}`;
  const initialFor = (l: DsaLang) => (typeof window === "undefined" ? lab.starters[l] || "" : store.get(key(l)) ?? lab.starters[l] ?? "");
  const [busy, setBusy] = useState<null | "run" | "all">(null);
  const [outcome, setOutcome] = useState<{ o: LabOutcome; mode: "run" | "all"; lang: DsaLang; cases: (LabCase & { hidden: boolean })[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState("");
  const [stdout, setStdout] = useState("");
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
    setStdout("");
    track(mode === "run" ? "dsa_lab_run" : "dsa_lab_check", { lab: lab.spec.id, lang });
    const cases = [...lab.visible.map((c) => ({ ...c, hidden: false })), ...(mode === "all" ? lab.hidden.map((c) => ({ ...c, hidden: true })) : [])];
    try {
      if (!BROWSER_LANGS.has(lang)) {
        // Java and C++: the server judge, the same route as the problems (design mode is not on the judge yet)
        const r = await userFetch("/api/dsa/judge", { method: "POST", body: JSON.stringify({ lab: `${lessonId}/${lab.spec.id}`, language: lang, code, mode: mode === "all" ? "submit" : "run" }) });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setNotice(j.error || "The judge couldn't run this lab. Python and JavaScript run in your browser today.");
        return;
      }
      const py = lang === "python";
      const runner = getRunner(py ? "py" : "js");
      if (runner.status.phase !== "ready") setLoadMsg(py ? "Starting Python in your browser (the first run downloads about 6.5 MB)…" : "Starting JavaScript…");
      const src = py ? labPythonTests(lab.spec, cases) : labJavascriptTests(lab.spec, cases);
      let out = "";
      const res = await runner.runTests({ code, ts: false, given: null, groups: [{ name: "dsa", src, ts: false }] }, 30_000, (t) => {
        out += t;
        setStdout(out.slice(-6000));
      });
      setLoadMsg("");
      const o = labOutcome(res, cases, Math.round((lab.spec.limits.timeMs || 2000) * (py ? 3 : 1.5)));
      setOutcome({ o, mode, lang, cases });
      if (mode === "all" && o.verdict === "AC") {
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

  const methods = useMemo(() => lab.spec.methods, [lab.spec.methods]);

  return (
    <div className="dsa-ui flex flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-col gap-2">
        <p className="m-0 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          Build it yourself · class {lab.spec.class}
          {passed && <span className="border border-ok px-1.5 py-0.5 text-ok-text">✓ lab passed</span>}
        </p>
        <p className="m-0 text-[15px] leading-relaxed text-fg-2">{lab.spec.summary}</p>
      </div>

      {/* what to write, in the chosen language's names */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <caption className="sr-only">Methods to write</caption>
          <thead>
            <tr className="font-mono text-[11px] uppercase tracking-label text-fg-3">
              <th scope="col" className="border-b border-line py-2 pr-3 font-medium">
                Method
              </th>
              <th scope="col" className="border-b border-line py-2 pr-3 font-medium">
                What it does
              </th>
              <th scope="col" className="border-b border-line py-2 font-medium">
                Aim for
              </th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.name} className="align-top">
                <td className="border-b border-line py-2 pr-3 font-mono text-[13px] text-fg">
                  {labMethodName(lang, m.name)}({m.params.map((p) => labMethodName(lang, p.name)).join(", ")})<span className="block text-[11px] text-fg-3">→ {TYPE_LABEL[m.returns]?.[lang] ?? m.returns}</span>
                </td>
                <td className="border-b border-line py-2 pr-3 text-fg-2">{m.does}</td>
                <td className="border-b border-line py-2 font-mono text-[12px] text-fg-2">{m.cost || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Language" className="flex border border-line-strong">
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
      <div className="h-[420px] border border-line-strong sm:h-[460px]">
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
      {outcome && <LabResults outcome={outcome} spec={lab.spec} />}
      {stdout && (
        <details className="border border-line bg-surface">
          <summary className="min-h-10 cursor-pointer px-3 py-2 font-mono text-[12px] text-fg-3">Your printed output</summary>
          <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[12px] text-fg-2">{stdout}</pre>
        </details>
      )}
    </div>
  );
}

function LabResults({ outcome, spec }: { outcome: { o: LabOutcome; mode: "run" | "all"; lang: DsaLang; cases: (LabCase & { hidden: boolean })[] }; spec: LabSpec }) {
  const { o, mode, lang, cases } = outcome;
  const ok = o.verdict === "AC";
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-4 bg-surface px-3 py-2 ${ok ? "border-ok" : "border-bad"}`}>
        <span className={`font-display text-[20px] font-bold ${ok ? "text-ok-text" : "text-bad-text"}`}>
          {ok ? "✓" : "✗"} {ok ? (mode === "all" ? `Your ${spec.thing || "linked list"} works` : "Accepted") : VERDICT_LABEL[o.verdict]}
        </span>
        <span className="font-mono text-[12px] text-fg-3">
          {o.passed}/{o.total} cases {mode === "all" ? "(including the edge cases)" : "(visible)"} · {Math.round(o.ms)} ms in your browser
        </span>
      </div>
      {ok && mode === "run" && <p className="m-0 text-[14px] text-fg-2">The visible cases pass. Now press “Check everything” for the edge cases: {spec.edges || "an empty list, one node, reversing twice"}.</p>}
      {ok && mode === "all" && <p className="m-0 text-[14px] text-fg-2">Every case passes, edge cases included. {spec.after || "The warm-up problems below use the same pointer moves."}</p>}
      {o.message && <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap border border-line bg-surface p-3 font-mono text-[12px] text-bad-text">{o.message}</pre>}
      {o.cases.some((r) => r.ok) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Cases that pass">
          {o.cases
            .filter((r) => r.ok)
            .map((r) => (
              <span key={r.name} className="border border-line px-2 py-1 font-mono text-[11px] text-fg-2">
                <span className="text-ok-text">✓</span> {r.name}
              </span>
            ))}
        </div>
      )}
      {o.cases.map((r, i) => {
        const c = cases[i];
        if (r.ok || !c) return null;
        return (
          <div key={r.name} className="border border-bad px-3 py-2">
            <p className="m-0 flex flex-wrap items-baseline gap-2 font-mono text-[12px]">
              <span className="text-bad-text">✗</span>
              <span className="text-fg">{r.name}</span>
              {r.hidden && <span className="text-fg-3">edge case</span>}
              <span className="text-bad-text">{VERDICT_LABEL[r.verdict]}</span>
            </p>
            <div className="mt-1 flex flex-col gap-1 text-[14px]">
              <p className="m-0 text-fg">{labFailureText(lang, c, r)}</p>
              {c.note && <p className="m-0 text-fg-3">Why this case: {c.note}.</p>}
              <details>
                <summary className="cursor-pointer font-mono text-[12px] text-fg-3">every call in this case</summary>
                <div className="mt-1 flex flex-col gap-0.5 font-mono text-[12px]">
                  {c.ops.map((op, k) => {
                    const bad = k === r.failAt;
                    const reached = r.got && k < r.got.length;
                    return (
                      <span key={k} className={bad ? "text-bad-text" : "text-fg-2"}>
                        {opText(lang, op, c.args[k])} → expected {JSON.stringify(c.output[k])}
                        {reached ? `, got ${JSON.stringify(r.got?.[k] ?? null)}` : bad ? ", crashed" : ""}
                      </span>
                    );
                  })}
                </div>
              </details>
            </div>
          </div>
        );
      })}
    </div>
  );
}
