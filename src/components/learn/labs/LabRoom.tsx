"use client";

/**
 * A code lab (/learn/labs/[id]): the brief, example tests, given code, hints and solution on the
 * left; the editor, Run and the test results on the right (stacked on phones, editor first and
 * collapsible). Python runs in a Web Worker (src/lib/learn/labs/runner.ts); code autosaves per lab
 * in this browser; passing every test awards the lab's XP once (game key "lab:<id>").
 */
import Link from "next/link";
import LabTutor from "@/components/learn/ai/LabTutor";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Eye, Lightbulb, Loader2, Minus, Play, Plus, RotateCcw, X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { loadCodeEditor } from "@/lib/offline/lazy";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { HarnessError, HarnessResult, HarnessTest } from "@/lib/learn/labs/harness";
import { getRunner, retainRunner, type RunOutcome, type RuntimeStatus } from "@/lib/learn/labs/runner";
import { clearCode, FONT_SIZES, loadCode, loadFont, saveCode, saveFont, updateLab, useLabProgress } from "@/lib/learn/labs/progress";
import { PYTHON_VERSION, RUNTIME_DOWNLOAD_LABEL, RUNTIME_STORED_LABEL } from "@/lib/learn/labs/runtime";
import { DIFFICULTY_LABEL, labKey, type Lab } from "@/lib/learn/labs/types";
import type { CodeEditorHandle } from "./CodeEditor";
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";

const Editor = dynamic(() => loadCodeEditor(), {
  ssr: false,
  loading: () => <EditorPlaceholder text="Loading the editor…" />,
});

const REVEAL_AFTER_RUNS = 3;

type Tab = "brief" | "tests" | "given" | "hints" | "solution";
type Run = { outcome: RunOutcome; wallMs: number; at: number; gained: number | null };

const IDLE: RuntimeStatus = { phase: "idle" };
const noop = () => () => {};

function useRuntimeStatus(): RuntimeStatus {
  return useSyncExternalStore(
    (cb) => getRunner().onStatus(cb),
    () => getRunner().status,
    () => IDLE
  );
}

const allPassed = (r: HarnessResult | null) => !!r && !r.setup && r.tests.length > 0 && r.tests.every((t) => t.ok);

export default function LabRoom({ lab, next, prev }: { lab: Lab; next: { href: string; title: string } | null; prev: { href: string; title: string } | null }) {
  const { awardOnce, done, hydrated } = useGame();
  const progress = useLabProgress()[lab.id];
  const status = useRuntimeStatus();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const editor = useRef<CodeEditorHandle>(null);
  const code = useRef<string>(lab.starter);
  const saveTimer = useRef<number | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [font, setFont] = useState(14);
  const [tab, setTab] = useState<Tab>("brief");
  const [resultTab, setResultTab] = useState<"tests" | "output">("tests");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [output, setOutput] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [confirm, setConfirm] = useState<null | "reveal" | "reset" | "load">(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const cleared = (hydrated && !!done[labKey(lab.id)]) || !!progress?.passedAt;
  const runs = progress?.runs ?? 0;
  const failedRuns = progress?.failedRuns ?? 0;
  const solutionUnlocked = cleared || failedRuns >= REVEAL_AFTER_RUNS || !!progress?.revealedAt;

  // this browser's copy of the code, the font size and the Python worker (shared across labs)
  useEffect(() => {
    const saved = loadCode(lab.id);
    const t = window.setTimeout(() => {
      setInitial(saved?.code ?? lab.starter);
      code.current = saved?.code ?? lab.starter;
      setStale(!!saved && saved.version !== lab.version && saved.code !== lab.starter);
      setFont(loadFont());
    }, 0);
    return () => window.clearTimeout(t);
  }, [lab.id, lab.starter, lab.version]);
  useEffect(() => retainRunner(), []);

  // seconds counter while Python downloads, so a slow first load doesn't look stuck
  useEffect(() => {
    if (status.phase !== "loading") return;
    const since = status.since;
    const iv = window.setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 500);
    return () => window.clearInterval(iv);
  }, [status]);

  const onChange = useCallback(
    (v: string) => {
      code.current = v;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveCode(lab.id, v, lab.version), 400);
    },
    [lab.id, lab.version]
  );
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        saveCode(lab.id, code.current, lab.version);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, [lab.id, lab.version]);

  const groups = useMemo(() => [{ name: "visible", src: lab.visibleTests }, ...(lab.hiddenTests ? [{ name: "hidden", src: lab.hiddenTests }] : [])], [lab.visibleTests, lab.hiddenTests]);

  const runTests = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setOutput("");
    setResultTab("tests");
    const t0 = performance.now();
    const outcome = await getRunner().run({ code: code.current, given: lab.given, groups, timeoutMs: lab.timeoutSec * 1000 }, (text) =>
      setOutput((o) => (o + text).slice(-60_000))
    );
    const wallMs = Math.round(performance.now() - t0);
    const result = outcome.kind === "done" ? outcome.result : null;
    const passed = allPassed(result);
    let gained: number | null = null;
    updateLab(lab.id, (p) => ({ ...p, runs: p.runs + 1, failedRuns: p.failedRuns + (passed ? 0 : 1), ...(passed && !p.passedAt ? { passedAt: Date.now() } : {}) }));
    if (passed) {
      gained = awardOnce(labKey(lab.id), lab.xp, `Lab cleared · ${lab.title}`);
      track("lab_pass", { lab: lab.id, runs: runs + 1, first: gained > 0, assisted: !!progress?.revealedAt, tests: result!.tests.length, ms: result!.ms });
    }
    track("lab_run", {
      lab: lab.id,
      result: outcome.kind === "timeout" ? "timeout" : outcome.kind === "crash" ? "crash" : result?.setup ? "error" : passed ? "pass" : "fail",
      passed: result ? result.tests.filter((t) => t.ok).length : 0,
      total: result ? result.tests.length : 0,
      ms: outcome.kind === "done" ? outcome.ms : wallMs,
    });
    setRun({ outcome, wallMs, at: Date.now(), gained });
    setRunning(false);
  }, [running, lab.id, lab.given, lab.timeoutSec, lab.xp, lab.title, groups, awardOnce, runs, progress?.revealedAt]);

  // ⌘/Ctrl + Enter runs from anywhere on the page (the editor binds it too)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runTests();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runTests]);

  const reveal = () => {
    setShowSolution(true);
    setTab("solution");
    if (!progress?.revealedAt) {
      updateLab(lab.id, (p) => ({ ...p, revealedAt: Date.now() }));
      track("lab_solution", { lab: lab.id, runs, cleared });
    }
  };

  const resetToStarter = () => {
    editor.current?.setValue(lab.starter);
    code.current = lab.starter;
    clearCode(lab.id);
    setStale(false);
  };

  const loadSolution = () => {
    editor.current?.setValue(lab.solution);
    onChange(lab.solution);
    setEditorOpen(true);
  };

  const bumpFont = (d: number) => {
    const i = FONT_SIZES.indexOf(font);
    const n = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 2 : i) + d))];
    setFont(n);
    saveFont(n);
  };

  const result = run?.outcome.kind === "done" ? run.outcome.result : null;
  const passedAll = allPassed(result);
  const tabs: { id: Tab; label: string }[] = [
    { id: "brief", label: "Brief" },
    { id: "tests", label: `Tests · ${lab.tests.visible}` },
    ...(lab.given.trim() ? [{ id: "given" as const, label: "Given code" }] : []),
    ...(lab.hints.length ? [{ id: "hints" as const, label: `Hints · ${lab.hints.length}` }] : []),
    { id: "solution", label: "Solution" },
  ];

  return (
    <main className="mx-auto flex max-w-[1480px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10 lg:pb-16" data-hk-lab={lab.id}>
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-fg-3">
          <Link href="/learn/system-design-mastery" className="hover:text-fg">
            Learn
          </Link>
          <span aria-hidden>/</span>
          <Link href="/learn/labs" className="hover:text-fg">
            Code labs
          </Link>
          <span aria-hidden>/</span>
          <span className="text-fg-2">
            W{lab.weekCode} · {lab.topic}
          </span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="font-mono text-xs uppercase tracking-label text-signal-text">
              Code lab · World {lab.weekCode} · {lab.worldTitle}
            </span>
            <h1 className="font-display text-[clamp(34px,5vw,64px)] font-extrabold leading-[0.95] tracking-tightest text-fg">
              {lab.title}
              <span className="text-signal-text">.</span>
            </h1>
            {lab.summary && <p className="max-w-[760px] text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">{lab.summary}</p>}
            <div className="flex flex-wrap gap-1.5 font-mono text-[12px]">
              <span className="border border-line bg-bg px-3 py-2 text-fg">{DIFFICULTY_LABEL[lab.difficulty]}</span>
              <span className="border border-line bg-bg px-3 py-2 text-fg-2">~{lab.minutes} min</span>
              <span className="border border-line bg-bg px-3 py-2 text-fg-2">
                {lab.tests.visible} example + {lab.tests.hidden} hidden tests
              </span>
              <span className={`border bg-bg px-3 py-2 ${cleared ? "border-line text-fg" : "border-signal text-signal-text"}`}>{cleared ? "Cleared ✓" : `+${lab.xp} XP`}</span>
              <a href="#lab-code" className="border border-line-strong bg-bg px-3 py-2 text-fg lg:hidden">
                Jump to the code ↓
              </a>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1.5 lg:items-end">
            <SaveOfflineButton title={lab.title} kind="lab" />
            <span className="max-w-[300px] text-xs leading-snug text-fg-3 lg:text-right">Saving also stores the Python runtime ({RUNTIME_STORED_LABEL}, once for every lab) so this lab runs with no internet.</span>
          </div>
        </div>
        {lab.lessons.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs uppercase tracking-label text-fg-3">Practises</span>
            {lab.lessons.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-9 items-center gap-1.5 border border-line px-2.5 py-1 text-fg-2 hover:border-fg-3 hover:text-fg">
                <span className="font-mono text-[11px] text-signal-text">{l.code}</span>
                <span>{l.label ?? l.title}</span>
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ------------------------------------------------------------ left: the brief */}
        <section aria-label="Lab brief" className="flex min-w-0 flex-col border border-line-strong bg-surface">
          <div role="tablist" aria-label="Lab sections" className="flex overflow-x-auto border-b border-line [scrollbar-width:none]">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 font-mono text-xs uppercase tracking-[0.06em] ${
                  tab === t.id ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 p-4 sm:p-5">
            {tab === "brief" && <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: lab.briefHtml }} />}
            {tab === "tests" && (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm leading-relaxed text-fg-2">
                  The example tests below run on every Run, then {lab.tests.hidden} hidden tests for the edge cases. Hidden tests are listed after your first run. They ship with this page, so they aren&apos;t secret: they&apos;re for practice, not grading.
                </p>
                <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: lab.visibleTestsHtml }} />
              </div>
            )}
            {tab === "given" && (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm leading-relaxed text-fg-2">This code runs before yours on every run, so your code and the tests can use these names. It&apos;s read-only.</p>
                <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: lab.givenHtml }} />
              </div>
            )}
            {tab === "hints" && (
              <div className="flex flex-col gap-3">
                {lab.hints.slice(0, hintsShown).map((h, i) => (
                  <div key={i} className="border border-line bg-raised p-4">
                    <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                      Hint {i + 1} · {h.title}
                    </span>
                    <div className="course-content mt-2 max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: h.html }} />
                  </div>
                ))}
                {hintsShown < lab.hints.length ? (
                  <button type="button" onClick={() => setHintsShown((n) => n + 1)} className="inline-flex min-h-11 items-center gap-2 self-start border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
                    <Lightbulb className="h-4 w-4 text-signal-text" aria-hidden />
                    {hintsShown ? `Show hint ${hintsShown + 1} of ${lab.hints.length}` : `Show the first hint (${lab.hints.length} in all)`}
                  </button>
                ) : (
                  <span className="text-sm text-fg-3">That&apos;s every hint. Still stuck? The solution tab has a worked answer.</span>
                )}
              </div>
            )}
            {tab === "solution" &&
              (showSolution ? (
                <div className="flex flex-col gap-3">
                  <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: lab.solutionHtml }} />
                  {lab.solutionNotesHtml && <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: lab.solutionNotesHtml }} />}
                  <button type="button" onClick={() => setConfirm("load")} className="inline-flex min-h-11 items-center gap-2 self-start border border-line-strong px-3.5 font-mono text-xs text-fg hover:border-fg-3">
                    Load the solution into the editor
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="m-0 text-sm leading-relaxed text-fg-2">
                    {cleared
                      ? "You passed this lab. Compare your answer with the reference solution and its notes."
                      : solutionUnlocked
                        ? "Unlocked after three runs. Try reading it, closing it, and writing your own version: that's what sticks in an interview."
                        : `The solution unlocks after ${REVEAL_AFTER_RUNS} runs (${Math.min(failedRuns, REVEAL_AFTER_RUNS)}/${REVEAL_AFTER_RUNS} so far), or now if you'd rather.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => (solutionUnlocked ? reveal() : setConfirm("reveal"))}
                    className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3"
                  >
                    <Eye className="h-4 w-4" aria-hidden /> Show the solution
                  </button>
                </div>
              ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ right: editor + results */}
        <section id="lab-code" aria-label="Code and tests" className="flex min-w-0 scroll-mt-[calc(var(--hk-header-h,61px)+12px)] flex-col gap-3 lg:sticky lg:top-[calc(var(--hk-header-h,61px)+16px)]">
          <div className="flex flex-col border border-line-strong bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
              <button
                type="button"
                onClick={() => setEditorOpen((o) => !o)}
                aria-expanded={editorOpen}
                className="inline-flex min-h-10 items-center gap-1.5 px-1.5 font-mono text-xs text-fg lg:pointer-events-none"
              >
                <ChevronDown className={`h-4 w-4 transition-transform lg:hidden ${editorOpen ? "" : "-rotate-90"}`} aria-hidden />
                solution.py
              </button>
              <RuntimeBadge status={status} elapsed={elapsed} />
              <span className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => bumpFont(-1)} aria-label="Smaller code font" title="Smaller font" className="grid h-10 w-10 place-items-center text-fg-3 hover:text-fg">
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-7 text-center font-mono text-[11px] text-fg-3" aria-live="polite">
                  {font}
                </span>
                <button type="button" onClick={() => bumpFont(1)} aria-label="Larger code font" title="Larger font" className="grid h-10 w-10 place-items-center text-fg-3 hover:text-fg">
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => setConfirm("reset")} title="Reset to the starter code" className="inline-flex min-h-10 items-center gap-1.5 px-2 font-mono text-xs text-fg-3 hover:text-fg">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">reset</span>
                </button>
              </span>
            </div>
            {stale && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-raised px-3 py-2 text-xs text-fg-2">
                This lab was updated since you saved your code here. Your code is kept; reset to get the new starter.
                <button type="button" onClick={() => setStale(false)} className="ml-auto font-mono text-fg-3 hover:text-fg" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
            <div className={`${editorOpen ? "" : "max-lg:hidden"} h-[min(58vh,520px)] min-h-[300px] lg:h-[calc(100vh-var(--hk-header-h,61px)-330px)] lg:min-h-[360px]`}>
              {mounted && initial != null ? (
                <Editor handle={editor} initial={initial} fontSize={font} label={`${lab.title}: your Python code`} onChange={onChange} onRun={() => void runTests()} onFocus={() => void getRunner().warm()} />
              ) : (
                <EditorPlaceholder text="Loading the editor…" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5">
              <button
                type="button"
                onClick={() => void runTests()}
                disabled={running}
                className="inline-flex min-h-11 items-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-70"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {running ? (status.phase === "loading" ? "Loading Python…" : "Running…") : "Run tests"}
              </button>
              <span className="hidden font-mono text-[11px] text-fg-3 sm:inline">⌘/Ctrl + Enter</span>
              <span className="ml-auto font-mono text-[11px] text-fg-3">
                {runs ? `${runs} run${runs === 1 ? "" : "s"}` : "not run yet"} · {lab.timeoutSec} s limit
              </span>
            </div>
          </div>

          <Results
            lab={lab}
            run={run}
            running={running}
            output={output}
            tab={resultTab}
            setTab={setResultTab}
            passedAll={passedAll}
            cleared={cleared}
            next={next}
            onLine={(line) => {
              setEditorOpen(true);
              editor.current?.goToLine(line);
            }}
          />
          <LabTutor
            labId={lab.id}
            getCode={() => code.current}
            result={run?.outcome.kind === "done" ? run.outcome.result : null}
            passed={passedAll}
          />
          {prev && !next && (
            <Link href={prev.href} className="self-start font-mono text-xs text-fg-3 hover:text-fg">
              ← {prev.title}
            </Link>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={confirm === "reveal"}
        title="Show the solution now?"
        message={`It unlocks by itself after ${REVEAL_AFTER_RUNS} runs. Writing it yourself is what makes it stick in an interview; you can still pass the lab and earn the XP after peeking.`}
        confirmText="Show it"
        cancelText="Keep trying"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          reveal();
        }}
      />
      <ConfirmDialog
        isOpen={confirm === "reset"}
        title="Reset to the starter code?"
        message="This replaces your code in the editor with the starter. Undo (⌘/Ctrl + Z) in the editor brings it back."
        confirmText="Reset"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          resetToStarter();
        }}
      />
      <ConfirmDialog
        isOpen={confirm === "load"}
        title="Replace your code with the solution?"
        message="Your current code is replaced. Undo (⌘/Ctrl + Z) in the editor brings it back."
        confirmText="Replace"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          loadSolution();
        }}
      />
    </main>
  );
}

function EditorPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-raised font-mono text-xs text-fg-3">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      {text}
    </div>
  );
}

function RuntimeBadge({ status, elapsed }: { status: RuntimeStatus; elapsed: number }) {
  let text: string;
  let tone = "text-fg-3";
  switch (status.phase) {
    case "idle":
      text = `Python ${PYTHON_VERSION} loads on first run (${RUNTIME_DOWNLOAD_LABEL} once)`;
      break;
    case "loading":
      text = status.restart ? "Restarting Python…" : `Loading Python ${PYTHON_VERSION}… ${elapsed ? `${elapsed}s` : ""}`;
      tone = "text-signal-text";
      break;
    case "ready":
      text = `Python ${status.python} ready · loaded in ${(status.loadMs / 1000).toFixed(1)} s`;
      tone = "text-fg-2";
      break;
    case "failed":
      text = status.message;
      tone = "text-bad-text";
      break;
  }
  return (
    <span className={`min-w-0 truncate font-mono text-[11px] ${tone}`} title={text} aria-live="polite">
      {status.phase === "ready" && <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 bg-ok align-middle" />}
      {text}
    </span>
  );
}

function ErrorBody({ e, onLine, hidden }: { e: HarnessError; onLine: (line: number) => void; hidden?: boolean }) {
  const mine = (e.frames ?? []).filter((f) => f.file === "solution.py");
  const synLine = e.kind === "SyntaxError" || e.kind === "IndentationError" ? e.line : null;
  return (
    <div className="flex flex-col gap-1.5">
      <pre className="m-0 whitespace-pre-wrap break-words bg-raised p-2.5 font-mono text-[12.5px] leading-relaxed text-fg">
        <span className="text-bad-text">{e.kind}</span>
        {e.message ? `: ${e.message}` : ""}
      </pre>
      {e.code && e.kind === "AssertionError" && (
        <span className="font-mono text-[11.5px] text-fg-3">
          {hidden ? "hidden test" : "test"} line {e.line}: <span className="text-fg-2">{e.code}</span>
        </span>
      )}
      {synLine && (
        <button type="button" onClick={() => onLine(synLine)} className="self-start font-mono text-[11.5px] text-signal-text underline decoration-line-strong underline-offset-4">
          solution.py line {synLine} →
        </button>
      )}
      {mine.map((f, i) => (
        <button key={i} type="button" onClick={() => onLine(f.line)} className="self-start text-left font-mono text-[11.5px] text-fg-2 hover:text-fg">
          <span className="text-signal-text underline decoration-line-strong underline-offset-4">solution.py line {f.line}</span> in {f.fn}
          {f.code ? <span className="text-fg-3">: {f.code}</span> : null}
        </button>
      ))}
    </div>
  );
}

function TestRow({ t, onLine }: { t: HarnessTest; onLine: (line: number) => void }) {
  return (
    <li className="flex flex-col gap-2 border-b border-line px-3 py-2.5 last:border-b-0">
      <span className="flex items-start gap-2.5">
        <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center ${t.ok ? "bg-ok text-black" : "bg-bad text-white"}`}>
          {t.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug text-fg">
          <span className="sr-only">{t.ok ? "Passed: " : "Failed: "}</span>
          {t.title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-fg-4">{t.ms < 1 ? "<1" : Math.round(t.ms)} ms</span>
      </span>
      {!t.ok && t.error && (
        <div className="pl-[30px]">
          <ErrorBody e={t.error} onLine={onLine} hidden={t.group === "hidden"} />
        </div>
      )}
    </li>
  );
}

function Results({
  lab,
  run,
  running,
  output,
  tab,
  setTab,
  passedAll,
  cleared,
  next,
  onLine,
}: {
  lab: Lab;
  run: Run | null;
  running: boolean;
  output: string;
  tab: "tests" | "output";
  setTab: (t: "tests" | "output") => void;
  passedAll: boolean;
  cleared: boolean;
  next: { href: string; title: string } | null;
  onLine: (line: number) => void;
}) {
  const result = run?.outcome.kind === "done" ? run.outcome.result : null;
  const visible = result?.tests.filter((t) => t.group === "visible") ?? [];
  const hidden = result?.tests.filter((t) => t.group !== "visible") ?? [];
  const passed = result?.tests.filter((t) => t.ok).length ?? 0;
  const total = result?.tests.length ?? 0;

  return (
    <div className="flex flex-col border border-line-strong bg-surface" aria-live="polite" aria-busy={running}>
      <div className="flex items-center border-b border-line">
        {(["tests", "output"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`min-h-11 border-b-2 px-3.5 font-mono text-xs uppercase tracking-[0.06em] ${tab === k ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
          >
            {k === "tests" ? "Tests" : `Output${output ? " ·" : ""}`}
          </button>
        ))}
        <span className="ml-auto pr-3 font-mono text-[11px] text-fg-3">
          {running ? "running…" : result?.setup ? "no tests ran" : result ? `${passed}/${total} passed · ${result.ms} ms` : run ? "" : "press Run tests"}
        </span>
      </div>

      {tab === "output" ? (
        <pre className="m-0 max-h-[340px] min-h-[120px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12.5px] leading-relaxed text-fg-2">
          {output || (running ? "…" : "Nothing printed. print() output from your code shows up here.")}
        </pre>
      ) : (
        <div className="flex max-h-[min(520px,60vh)] flex-col overflow-auto">
          {passedAll && run && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-signal bg-[color-mix(in_srgb,var(--c-signal)_10%,transparent)] px-4 py-3">
              <span className="flex flex-col">
                <span className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">All {total} tests passed</span>
                <span className="text-sm text-fg-2">
                  {run.gained ? `Lab cleared · +${run.gained} XP.` : cleared ? "Cleared · you already earned this lab's XP." : "Cleared."} Now explain your design out loud, the way you would in the interview.
                </span>
              </span>
              {next && (
                <Link href={next.href} className="ml-auto inline-flex min-h-11 items-center bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110">
                  Next lab · {next.title} →
                </Link>
              )}
            </div>
          )}
          {!run && !running && (
            <p className="m-0 p-4 text-sm leading-relaxed text-fg-3">
              Write your code, then run {lab.tests.visible} example tests and {lab.tests.hidden} hidden tests. Each run is limited to {lab.timeoutSec} seconds: an infinite loop gets stopped and Python restarts, your code stays.
            </p>
          )}
          {running && !run && <p className="m-0 p-4 font-mono text-xs text-fg-3">Running…</p>}
          {run?.outcome.kind === "timeout" && (
            <div className="flex flex-col gap-1.5 border-b border-line p-4">
              <span className="font-semibold text-bad-text">Stopped after {Math.round(run.outcome.limitMs / 1000)} s</span>
              <span className="text-sm leading-relaxed text-fg-2">
                Your code was still running: most likely an infinite loop (a <code>while</code> whose condition never changes) or recursion without a base case. Python was restarted; your code is untouched. Anything it printed is in Output.
              </span>
            </div>
          )}
          {run?.outcome.kind === "crash" && (
            <div className="flex flex-col gap-1.5 border-b border-line p-4">
              <span className="font-semibold text-bad-text">The run didn&apos;t finish</span>
              <span className="text-sm leading-relaxed text-fg-2">{run.outcome.message}</span>
            </div>
          )}
          {result?.setup && (
            <div className="flex flex-col gap-2 border-b border-line p-4">
              <span className="font-semibold text-bad-text">{result.setup.where === "given" ? "The lab's given code failed to load" : "Your code didn't load, so no tests ran"}</span>
              <ErrorBody e={result.setup} onLine={onLine} />
            </div>
          )}
          {result && !result.setup && (
            <>
              <TestGroup title={`Example tests · ${visible.filter((t) => t.ok).length}/${visible.length}`} tests={visible} onLine={onLine} />
              {hidden.length > 0 && <TestGroup title={`Hidden tests · ${hidden.filter((t) => t.ok).length}/${hidden.length}`} tests={hidden} onLine={onLine} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TestGroup({ title, tests, onLine }: { title: string; tests: HarnessTest[]; onLine: (line: number) => void }) {
  if (!tests.length) return null;
  return (
    <div className="flex flex-col">
      <span className="border-b border-line bg-raised px-3 py-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">{title}</span>
      <ul className="m-0 list-none p-0">
        {tests.map((t) => (
          <TestRow key={`${t.group}-${t.name}`} t={t} onLine={onLine} />
        ))}
      </ul>
    </div>
  );
}
