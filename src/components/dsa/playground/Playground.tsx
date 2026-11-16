"use client";

/**
 * DSA's code Playground (/dsa/playground, the header's Playground tab): whole programs in Python, Java, C++ and
 * JavaScript with a stdin box, and an output panel with stdout, stderr, the exit code, the time and the memory.
 *
 * - Python and JavaScript run in this browser (the code-labs workers), Java and C++ on the server judge
 *   (/api/dsa/program). Running is for signed-in learners; a guest can read and edit, and Run opens the sign-in dialog.
 * - Drafts: one per language, saved as you type, to the account for signed-in learners (usePlaygroundDrafts).
 * - Named files and read-only share links need the dsa_playground_files table (supabase/migrations/
 *   20261116_dsa_playground_files.sql, not applied): until the owner applies it and sets DSA_PLAYGROUND_FILES=on the
 *   list shows the drafts only and Share is hidden (`filesEnabled`).
 * - "Compare with another language" runs the same input through a second program side by side.
 * - "Ask the tutor about this code" opens DSA's tutor with the code and the last output attached.
 * - "Open in Playground" from a lesson snippet arrives through localStorage (drafts.ts INCOMING_KEY); the draft it
 *   replaces can be brought back.
 *
 * "Visualise my run" isn't here: the course's step players replay pre-generated traces of its own templates
 * (TracePlayer, generated/traces) and can't trace arbitrary code.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Columns2, Lock, Play, RotateCcw, Sparkles } from "lucide-react";
import EditorThemeMenu from "@/components/learn/labs/EditorThemeMenu";
import type { CodeEditorHandle } from "@/components/learn/labs/CodeEditor";
import { loadCodeEditor } from "@/lib/offline/lazy";
import { retainRunner } from "@/lib/learn/labs/runner";
import { useSignInGate } from "@/components/gate/SignInGate";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/track";
import { DSA_LANG_LABEL, DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { sameOutput, type ProgramResult } from "@/lib/dsa/playground/program";
import { ago, decodeIncoming, FILE_NAME, INCOMING_KEY, isLang, LANG_LOCAL_KEY, STARTERS, type Incoming } from "@/lib/dsa/playground/drafts";
import ProgramOutput, { FactsLine, type OutputState } from "./ProgramOutput";
import { isRunFailure, runProgram, runtimeNote, warmRuntime } from "./runProgram";
import { usePlaygroundDrafts } from "./usePlaygroundDrafts";
import { askTutorAbout } from "./askTutor";
import PlaygroundFiles, { type OpenFile } from "./PlaygroundFiles";

const CodeEditor = dynamic(loadCodeEditor, { ssr: false, loading: () => <div className="grid h-full place-items-center font-mono text-[12px] text-fg-3">Loading the editor…</div> });

const CARD = "rounded-2xl border border-line bg-surface";
const PILL = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border px-3 text-[13px] font-medium";
const QUIET = `${PILL} border-line-strong bg-surface text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-50`;

const browserFamily = (l: DsaLang) => (l === "python" ? "py" : l === "javascript" ? "js" : null);

function readLocal(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeLocal(k: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
}

type Buf = { code: string; stdin: string };

export default function Playground({ filesEnabled }: { filesEnabled: boolean }) {
  const d = usePlaygroundDrafts();
  const gate = useSignInGate("dsa-playground");
  const { loading: authLoading } = useAuth();
  const [lang, setLang] = useState<DsaLang>("python");
  const [compare, setCompare] = useState(false);
  const [other, setOther] = useState<DsaLang>("java");
  const [stdin, setStdin] = useState("");
  const [version, setVersion] = useState(0);
  const [out, setOut] = useState<OutputState>({ kind: "idle" });
  const [outB, setOutB] = useState<OutputState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState<(Incoming & { replaced: boolean }) | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bufs = useRef<Partial<Record<DsaLang, Buf>>>({});
  const editor = useRef<CodeEditorHandle | null>(null);
  const editorB = useRef<CodeEditorHandle | null>(null);
  const lastResult = useRef<ProgramResult | null>(null);
  /** the draft time each buffer started from, and the languages edited in this visit (an account copy that arrives
   *  later, after the sign-in merge, replaces only an untouched buffer) */
  const seeded = useRef<Partial<Record<DsaLang, number>>>({});
  const touched = useRef(new Set<DsaLang>());

  useEffect(() => retainRunner(), []);

  const bufFor = useCallback(
    (l: DsaLang): Buf => {
      const b = bufs.current[l];
      if (b) return b;
      const c = d.codeFor(l);
      const nb = { code: c.code, stdin: c.stdin };
      bufs.current[l] = nb;
      seeded.current[l] = c.updatedAt;
      return nb;
    },
    [d],
  );

  // first load: the language last used, the drafts, and a snippet handed over from a lesson
  useEffect(() => {
    if (!d.ready || loaded) return;
    const inc = decodeIncoming(readLocal(INCOMING_KEY));
    writeLocal(INCOMING_KEY, null);
    const saved = readLocal(LANG_LOCAL_KEY);
    let l: DsaLang = isLang(saved) ? saved : "python";
    if (inc) {
      l = inc.lang;
      const replaced = d.keepPrevious(l);
      bufs.current[l] = { code: inc.code, stdin: inc.stdin };
      touched.current.add(l);
      d.saveNow(l, inc.code, inc.stdin);
      setIncoming({ ...inc, replaced });
      track("dsa_playground_open_snippet", { lang: l });
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setLang(l);
    setOther(l === "java" ? "python" : "java");
    setStdin(bufFor(l).stdin);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [d, d.ready, loaded, bufFor]);

  // the account's copy can land after the page has loaded (the sign-in merge): show it if nothing was edited yet
  useEffect(() => {
    if (!loaded) return;
    for (const l of DSA_LANGS) {
      const dr = d.drafts[l];
      if (!dr || touched.current.has(l) || !bufs.current[l] || dr.updatedAt <= (seeded.current[l] ?? 0)) continue;
      bufs.current[l] = { code: dr.code, stdin: dr.stdin };
      seeded.current[l] = dr.updatedAt;
      if (l === lang) {
        editor.current?.setValue(dr.code);
        setStdin(dr.stdin);
      } else if (compare && l === other) editorB.current?.setValue(dr.code);
    }
  }, [d.drafts, loaded, lang, other, compare]);

  const remember = () => {
    const code = editor.current?.getValue();
    if (code !== undefined) {
      bufs.current[lang] = { code, stdin };
      d.saveNow(lang, code, stdin);
    }
    if (compare) {
      const b = editorB.current?.getValue();
      if (b !== undefined) {
        bufs.current[other] = { code: b, stdin: bufFor(other).stdin };
        d.saveNow(other, b, bufFor(other).stdin);
      }
    }
  };

  const switchLang = (l: DsaLang) => {
    if (l === lang) return;
    remember();
    setOpenFile(null);
    setLang(l);
    writeLocal(LANG_LOCAL_KEY, l);
    if (l === other) setOther(lang);
    setStdin(bufFor(l).stdin);
    setOut({ kind: "idle" });
    setOutB({ kind: "idle" });
    setVersion((v) => v + 1);
    warmRuntime(l);
  };

  const onCode = (v: string) => {
    if (v === bufs.current[lang]?.code) return;
    touched.current.add(lang);
    bufs.current[lang] = { code: v, stdin };
    d.save(lang, v, stdin);
  };
  const onStdin = (v: string) => {
    touched.current.add(lang);
    setStdin(v);
    const code = bufs.current[lang]?.code ?? bufFor(lang).code;
    bufs.current[lang] = { code, stdin: v };
    d.save(lang, code, v);
  };
  const onCodeB = (v: string) => {
    const cur = bufFor(other);
    if (v === cur.code) return;
    touched.current.add(other);
    bufs.current[other] = { code: v, stdin: cur.stdin };
    d.save(other, v, cur.stdin);
  };

  const reset = () => {
    const s = STARTERS[lang];
    editor.current?.setValue(s.code);
    onStdin(s.stdin);
    bufs.current[lang] = { ...s };
    d.saveNow(lang, s.code, s.stdin);
    setOut({ kind: "idle" });
  };

  const restorePrevious = () => {
    if (!incoming) return;
    const prev = d.takePrevious(incoming.lang);
    if (prev) {
      bufs.current[incoming.lang] = { code: prev.code, stdin: prev.stdin };
      d.saveNow(incoming.lang, prev.code, prev.stdin);
      if (incoming.lang === lang) {
        editor.current?.setValue(prev.code);
        setStdin(prev.stdin);
      }
    }
    setIncoming(null);
  };

  const loadFile = (f: OpenFile) => {
    remember();
    bufs.current[f.language] = { code: f.code, stdin: f.stdin };
    setLang(f.language);
    setStdin(f.stdin);
    setOpenFile(f);
    setOut({ kind: "idle" });
    setVersion((v) => v + 1);
  };

  const runOne = async (l: DsaLang, code: string, set: (s: OutputState) => void, from: "playground" | "compare") => {
    set({ kind: "running", lang: l, stdout: "", note: runtimeNote(l) });
    const r = await runProgram({ lang: l, code, stdin, from }, (s) => set({ kind: "running", lang: l, stdout: s, note: null }));
    if (isRunFailure(r)) {
      set({ kind: "failed", lang: l, error: r.error, comingSoon: r.comingSoon });
      return null;
    }
    set({ kind: "done", lang: l, result: r });
    return r;
  };

  const run = async () => {
    if (busy) return;
    if (!d.signedIn) {
      if (!authLoading) gate.ask("run");
      return;
    }
    remember();
    const code = editor.current?.getValue() ?? bufFor(lang).code;
    setBusy(true);
    try {
      if (!compare) {
        setOutB({ kind: "idle" });
        lastResult.current = await runOne(lang, code, setOut, "playground");
      } else {
        const codeB = editorB.current?.getValue() ?? bufFor(other).code;
        const a = browserFamily(lang);
        const b = browserFamily(other);
        // two different browser workers (or browser + server) run at once; two server runs go one after the other
        if (a !== b) {
          const [ra] = await Promise.all([runOne(lang, code, setOut, "playground"), runOne(other, codeB, setOutB, "compare")]);
          lastResult.current = ra;
        } else {
          lastResult.current = await runOne(lang, code, setOut, "playground");
          await runOne(other, codeB, setOutB, "compare");
        }
        track("dsa_playground_compare", { a: lang, b: other });
      }
    } finally {
      setBusy(false);
    }
  };

  const ask = () => {
    const code = editor.current?.getValue() ?? bufFor(lang).code;
    askTutorAbout({ lang, code, stdin, result: out.kind === "done" ? out.result : lastResult.current, where: "playground", heading: `Playground · ${DSA_LANG_LABEL[lang]}` });
  };

  const locked = !authLoading && !d.signedIn;
  const draftRows = DSA_LANGS.map((l) => ({ l, draft: d.drafts[l] }));
  const both = out.kind === "done" && outB.kind === "done";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3.5 px-4 py-4 lg:min-h-0 lg:flex-row lg:px-6">
      {/* the files: drafts per language (and named files once the table is applied) */}
      <aside aria-label="Your files" className={`${CARD} flex shrink-0 flex-col gap-1.5 p-3.5 lg:w-[230px]`}>
        <div className="flex items-center justify-between px-1 pb-1.5">
          <h2 className="m-0 text-[15px] font-semibold text-fg">Your files</h2>
        </div>
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 lg:flex-col lg:overflow-visible">
          {draftRows.map(({ l, draft }) => {
            const on = l === lang && !openFile;
            return (
              <li key={l} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setOpenFile(null);
                    switchLang(l);
                  }}
                  aria-current={on ? "true" : undefined}
                  className={`flex w-full flex-col gap-0.5 rounded-[10px] px-2.5 py-2 text-left ${on ? "bg-surface-2" : "hover:bg-surface-2"}`}
                >
                  <span className="font-mono text-[13px] font-medium text-fg">{FILE_NAME[l]}</span>
                  <span className="text-[11.5px] text-fg-3">{draft && draft.updatedAt ? `draft · ${ago(draft.updatedAt)}` : "starter"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {filesEnabled ? <PlaygroundFiles signedIn={d.signedIn} current={{ language: lang, code: () => editor.current?.getValue() ?? bufFor(lang).code, stdin }} open={openFile} onOpen={loadFile} onSaved={setOpenFile} /> : null}
        <p className="m-0 mt-auto hidden px-1 pt-3 text-[12px] leading-snug text-fg-3 lg:block">
          {d.signedIn ? (d.saved === "device" ? "This draft is too big to follow your account: it is kept on this device." : "Drafts save to your account automatically.") : "Drafts are kept on this device. Sign in to keep them on your account."}
        </p>
      </aside>

      <section aria-label="Code" className="flex min-w-0 flex-1 flex-col gap-3 lg:min-h-0">
        {incoming ? (
          <div className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] text-fg-2`} role="status">
            <span>
              Opened from {incoming.from ? <Link href={incoming.from.href} className="text-signal-text underline decoration-line-strong underline-offset-4">{incoming.from.title}</Link> : "a lesson"}.
            </span>
            {incoming.replaced ? (
              <button type="button" onClick={restorePrevious} className="text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                Bring back my earlier {DSA_LANG_LABEL[incoming.lang]} draft
              </button>
            ) : null}
            <button type="button" onClick={() => setIncoming(null)} className="ml-auto text-fg-3 hover:text-fg" aria-label="Dismiss">
              ×
            </button>
          </div>
        ) : null}

        {/* toolbar: languages, compare, theme, reset, run */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Language" className="flex gap-1.5 overflow-x-auto">
            {DSA_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={l === lang}
                onClick={() => switchLang(l)}
                className={`${PILL} ${l === lang ? "border-fg-2 bg-surface-2 text-fg" : "border-line-strong bg-surface text-fg-2 hover:text-fg"}`}
              >
                {DSA_LANG_LABEL[l]}
              </button>
            ))}
          </div>
          <div className="hidden flex-1 sm:block" />
          <label className="flex min-h-9 items-center gap-2 text-[13px] text-fg-2">
            <input type="checkbox" checked={compare} onChange={(e) => {
              remember();
              setCompare(e.target.checked);
              setOutB({ kind: "idle" });
              if (e.target.checked) warmRuntime(other);
            }} className="h-4 w-4 accent-[var(--c-signal)]" />
            <Columns2 className="h-3.5 w-3.5 text-fg-3" aria-hidden />
            Compare with
          </label>
          <select
            aria-label="Language to compare with"
            value={other}
            onChange={(e) => {
              remember();
              setOther(e.target.value as DsaLang);
              setOutB({ kind: "idle" });
              setVersion((v) => v + 1);
            }}
            disabled={!compare}
            className="h-9 rounded-[9px] border border-line-strong bg-surface px-2 text-[13px] text-fg disabled:opacity-50"
          >
            {DSA_LANGS.filter((l) => l !== lang).map((l) => (
              <option key={l} value={l}>
                {DSA_LANG_LABEL[l]}
              </option>
            ))}
          </select>
          <EditorThemeMenu />
          <button type="button" onClick={reset} className={QUIET} title="Back to the starter program">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className={`${PILL} min-w-[96px] border-transparent bg-signal px-4 font-semibold text-on-signal hover:brightness-110 disabled:opacity-60`}
            title={locked ? "Sign in to run code" : "Run (⌘/Ctrl + Enter)"}
          >
            {locked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {locked ? "Sign in to run" : busy ? "Running…" : "Run"}
            {!locked && !busy ? <kbd className="hidden font-mono text-[11px] font-normal opacity-80 xl:inline">⌘↵</kbd> : null}
          </button>
        </div>

        {/* the editor (two side by side when comparing) */}
        <div className={`grid min-h-0 gap-3 lg:flex-1 ${compare ? "lg:grid-cols-2" : ""}`}>
          <div className={`${CARD} flex h-[52vh] min-h-[280px] flex-col overflow-hidden lg:h-auto lg:min-h-[240px]`}>
            {compare ? <div className="border-b border-line px-4 py-2 font-mono text-[12px] text-fg-3">{openFile ? openFile.name : FILE_NAME[lang]}</div> : null}
            <div className="min-h-0 flex-1">
              {loaded ? (
                <CodeEditor
                  key={`${lang}-${version}`}
                  handle={editor}
                  initial={bufFor(lang).code}
                  fontSize={14}
                  label={`${DSA_LANG_LABEL[lang]} program`}
                  language={lang}
                  onChange={onCode}
                  onRun={() => void run()}
                  onFocus={() => warmRuntime(lang)}
                />
              ) : (
                <div className="grid h-full place-items-center font-mono text-[12px] text-fg-3">Loading your drafts…</div>
              )}
            </div>
          </div>
          {compare ? (
            <div className={`${CARD} flex h-[52vh] min-h-[280px] flex-col overflow-hidden lg:h-auto lg:min-h-[240px]`}>
              <div className="border-b border-line px-4 py-2 font-mono text-[12px] text-fg-3">{FILE_NAME[other]}</div>
              <div className="min-h-0 flex-1">
                {loaded ? (
                  <CodeEditor
                    key={`b-${other}-${version}`}
                    handle={editorB}
                    initial={bufFor(other).code}
                    fontSize={13}
                    label={`${DSA_LANG_LABEL[other]} program to compare`}
                    language={other}
                    onChange={onCodeB}
                    onRun={() => void run()}
                    onFocus={() => warmRuntime(other)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* input and output */}
        <div className="flex flex-col gap-3 lg:h-[200px] lg:shrink-0 lg:flex-row">
          <label className="flex min-h-[140px] flex-1 flex-col gap-1.5 text-[13px] text-fg-2">
            Input (stdin)
            <textarea
              value={stdin}
              onChange={(e) => onStdin(e.target.value)}
              spellCheck={false}
              placeholder="What your program reads from standard input"
              className={`${CARD} min-h-0 flex-1 resize-none p-3 font-mono text-[13px] leading-relaxed text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none`}
            />
          </label>
          <div className="flex min-h-[160px] flex-[1.4] flex-col gap-1.5">
            <span className="text-[13px] text-fg-2">Output</span>
            <div className={`${CARD} flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3`}>
              <ProgramOutput
                state={out}
                className={compare && outB.kind !== "idle" ? "shrink-0" : "min-h-0 flex-1"}
                maxHeight="max-h-[40vh] lg:max-h-none"
                empty={locked ? "Sign in (free) to run your code: Python and JavaScript run in your browser, Java and C++ on our server." : "Run the code to see its output: stdout, stderr, exit code, time and memory."}
              />
              {compare && outB.kind !== "idle" ? (
                <div className="shrink-0 border-t border-line pt-2">
                  {outB.kind === "done" ? (
                    <div className="flex flex-col gap-1">
                      {outB.result.stdout || outB.result.stderr ? (
                        <details className="text-[12px] text-fg-3">
                          <summary className="cursor-pointer">{DSA_LANG_LABEL[other]} output</summary>
                          <ProgramOutput state={outB} className="mt-1" maxHeight="max-h-40" />
                        </details>
                      ) : null}
                      <FactsLine lang={other} result={outB.result} compact />
                    </div>
                  ) : (
                    <ProgramOutput state={outB} />
                  )}
                  {both ? (
                    <p className={`m-0 mt-1 font-mono text-[12px] ${sameOutput(out.result.stdout, outB.result.stdout) ? "text-ok-text" : "text-bad-text"}`}>
                      {sameOutput(out.result.stdout, outB.result.stdout) ? "Same output" : "The outputs differ"}
                      {out.result.timeMs !== null && outB.result.timeMs !== null ? ` · ${DSA_LANG_LABEL[lang]} ${Math.round(out.result.timeMs)} ms vs ${DSA_LANG_LABEL[other]} ${Math.round(outB.result.timeMs)} ms` : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-auto flex shrink-0 flex-wrap gap-2 pt-1">
                <button type="button" onClick={ask} className={`${QUIET} h-8 rounded-lg text-[12.5px]`}>
                  <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />
                  Ask the tutor about this code
                </button>
              </div>
            </div>
          </div>
        </div>
        <p className="m-0 text-[12px] text-fg-3 lg:hidden">{d.signedIn ? "Drafts save to your account automatically." : "Drafts are kept on this device. Sign in to keep them on your account."}</p>
      </section>
    </div>
  );
}
