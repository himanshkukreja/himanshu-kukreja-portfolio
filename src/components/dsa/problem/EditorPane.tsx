"use client";

/**
 * The right pane of the problem page: the toolbar (language, editor theme menu, suggestions, font size, "Saved"), the
 * editor, the Results | Submissions panel and the footer (Run, Submit, Ask the tutor). CodeEditor.tsx and the editor
 * theme menu are used as they are (owned by the editor-themes work).
 *
 * The editor gets the height: the results panel is a slim bar until a run, then opens to the height the learner last
 * dragged it to (the handle above it; arrow keys work on it too). Hide folds it back to the bar.
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Lock, Minus, NotebookPen, Plus, Sparkles } from "lucide-react";
import EditorThemeMenu from "@/components/learn/labs/EditorThemeMenu";
import { loadCodeEditor } from "@/lib/offline/lazy";
import { getRunner } from "@/lib/learn/labs/runner";
import { BROWSER_LANGS, DSA_LANG_LABEL, DSA_LANGS, type DsaLang } from "@/lib/dsa/types";
import { fnNameFor } from "@/lib/dsa/harness";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import ResultsPanel from "./ResultsPanel";
import { store, type Room } from "./useProblemRoom";

const CodeEditor = dynamic(loadCodeEditor, { ssr: false, loading: () => <div className="grid h-full place-items-center font-mono text-[12px] text-fg-3">Loading the editor…</div> });

const RESULTS_H = { min: 120, initial: 240, key: "dsa.editor.resultsH" };

const TOOL = "inline-flex min-h-[30px] shrink-0 items-center justify-center gap-1.5 rounded-[7px] border border-line px-2 text-[12px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40 [@media(pointer:coarse)]:min-h-11";

export default function EditorPane({ room }: { room: Room }) {
  const { p, lang, gate, busy, go, editor, editorBox, runRow, fontSize, setFontSize, suggestions, setSuggestions, drawer, setDrawer, setPane, initialFor, resetCode } = room;
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // the results panel: shut (a bar) until the first run, open on every run; its height is kept on this device
  const [resultsOpen, setResultsOpen] = useState(false);
  // the kept height is only used once the panel opens (after a click), so reading it here can't differ from the server's render
  const [resultsH, setResultsH] = useState(() => {
    const kept = Number(store.get(RESULTS_H.key));
    return kept >= RESULTS_H.min ? kept : RESULTS_H.initial;
  });
  const [lastBusy, setLastBusy] = useState(busy);
  if (busy !== lastBusy) {
    setLastBusy(busy);
    if (busy) setResultsOpen(true);
  }
  const pane = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const fitResults = (h: number) => {
    // leave the editor at least 200 px (plus the footer and gaps)
    const room = (pane.current?.clientHeight ?? 900) - 300;
    return Math.round(Math.max(RESULTS_H.min, Math.min(h, room)));
  };
  const keepResults = (h: number) => store.set(RESULTS_H.key, String(h));
  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: resultsOpen ? resultsH : RESULTS_H.min };
    setResultsOpen(true);
  };
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setResultsH(fitResults(drag.current.h - (e.clientY - drag.current.y)));
  };
  const onDragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    keepResults(resultsH);
  };
  const onDragKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowUp" ? 24 : e.key === "ArrowDown" ? -24 : 0;
    if (!step) return;
    e.preventDefault();
    const h = fitResults((resultsOpen ? resultsH : RESULTS_H.min) + step);
    setResultsOpen(true);
    setResultsH(h);
    keepResults(h);
  };

  // the code is kept per language on this device as you type
  const onChange = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSaved(false);
    timer.current = setTimeout(() => {
      store.set(`dsa.code.${p.id}.${lang}`, v);
      setSaved(true);
    }, 500);
  };

  return (
    <section ref={pane} aria-label="Your solution" className="flex min-h-0 min-w-0 flex-col gap-3 [container:pane/inline-size] lg:h-full">
      {/* the editor card (the canvas): its toolbar on top, the editor below, one 14 px frame in every theme (a manual
          editor theme can differ in tone from the page) */}
      <div className="flex shrink-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface lg:min-h-[200px] lg:flex-1 lg:shrink">
      <div className="flex min-h-[46px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 sm:px-3.5" data-guide="toolbar">
        <label className="flex items-center gap-2 text-[13px] text-fg-3">
          <span className="sr-only sm:not-sr-only">Language</span>
          <select
            value={lang}
            onChange={(e) => room.switchLang(e.target.value as DsaLang)}
            className="min-h-[30px] rounded-[7px] border border-line-strong bg-bg px-2 text-[13px] font-medium text-fg [@media(pointer:coarse)]:min-h-11"
          >
            {DSA_LANGS.map((l) => (
              <option key={l} value={l}>
                {DSA_LANG_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <EditorThemeMenu />
          <button type="button" onClick={() => setSuggestions(!suggestions)} aria-pressed={suggestions} title="Basic code suggestions as you type (off in interview mode)" className={TOOL}>
            Suggest: {suggestions ? "on" : "off"}
          </button>
          <span className="hidden items-center sm:inline-flex" role="group" aria-label="Font size">
            <button type="button" onClick={() => setFontSize(fontSize - 1)} aria-label="Smaller text" className={`${TOOL} px-1.5`}>
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="min-w-7 text-center font-mono text-[12px] text-fg-3">{fontSize}</span>
            <button type="button" onClick={() => setFontSize(fontSize + 1)} aria-label="Larger text" className={`${TOOL} px-1.5`}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
          <button type="button" onClick={resetCode} className={TOOL}>
            Reset code
          </button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(INK_EVENTS.open, { detail: {} }))} aria-label="Open the notebook" title="Notebook" className={TOOL}>
            <NotebookPen className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="text-[12px] text-fg-4" role="status" aria-live="polite">
            {saved ? "Saved" : ""}
          </span>
        </div>
      </div>

      <div ref={editorBox} className="h-[320px] shrink-0 sm:h-[380px] lg:h-auto lg:min-h-0 lg:flex-1">
        <CodeEditor
          key={p.id}
          handle={editor}
          initial={initialFor(lang)}
          fontSize={fontSize}
          label={`${DSA_LANG_LABEL[lang]} solution`}
          language={lang}
          suggestions={suggestions && drawer !== "interview"}
          onChange={onChange}
          onRun={() => void go("run")}
          onFocus={() => BROWSER_LANGS.has(lang) && void getRunner(lang === "python" ? "py" : "js").warm()}
        />
      </div>
      </div>

      <div className="-my-3 hidden h-3 shrink-0 cursor-row-resize touch-none items-center justify-center lg:flex [&:hover>span]:bg-fg-4 focus-visible:[&>span]:bg-signal"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the results panel"
        aria-valuenow={resultsOpen ? resultsH : 0}
        tabIndex={0}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onKeyDown={onDragKey}
        onDoubleClick={() => setResultsOpen(!resultsOpen)}
      >
        <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden />
      </div>

      <div className="flex shrink-0 flex-col" style={resultsOpen ? { height: resultsH, maxHeight: "calc(100% - 300px)", minHeight: RESULTS_H.min } : undefined}>
        <ResultsPanel room={room} open={resultsOpen} onOpen={setResultsOpen} />
      </div>

      <div ref={runRow} className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-[14px] border border-line bg-surface px-4 py-2.5 pane-wide:flex-nowrap pane-wide:gap-3" data-guide="run">
        <p className="m-0 w-full min-w-0 text-[13px] leading-snug text-fg-3 pane-wide:w-auto pane-wide:flex-1">
          {gate.locked ? (
            <>
              <button type="button" onClick={() => gate.ask("run")} className="text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                Sign in
              </button>{" "}
              (free for now) to run and submit your code
            </>
          ) : (
            <>
              write <code className="text-fg-2">{fnNameFor(lang, p.signature.fn)}</code>
              {lang === "java" ? " in class Solution" : ""} · {BROWSER_LANGS.has(lang) ? "runs in your browser" : "judged on the server"} · ⌘/Ctrl + Enter runs
            </>
          )}
        </p>
        <button type="button" onClick={() => void go("run")} disabled={!!busy} className="inline-flex min-h-[38px] items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-[14px] font-medium text-fg hover:bg-surface-2 disabled:opacity-50 ml-auto pane-wide:ml-0 [@media(pointer:coarse)]:min-h-11">
          {gate.locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
          {busy === "run" ? "Running…" : "Run"}
        </button>
        <button type="button" onClick={() => void go("submit")} disabled={!!busy} className="inline-flex min-h-[38px] items-center gap-2 rounded-[10px] bg-signal px-5 text-[14px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))] disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
          {gate.locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
          {busy === "submit" ? "Submitting…" : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => {
            // the tutor drawer lives over the Problem pane: on a phone the Code pane is showing, so bring the Problem pane forward with it
            if (drawer !== "tutor") setPane("problem");
            setDrawer(drawer === "tutor" ? null : "tutor");
          }}
          aria-pressed={drawer === "tutor"}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 text-[14px] font-medium text-fg hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11"
        >
          <Sparkles className="h-4 w-4 text-signal-text" aria-hidden />
          Ask the tutor
        </button>
      </div>
      <p className="m-0 text-[12px] text-fg-3 lg:hidden">Reading and hints work here; the code editor opens best on a laptop.</p>
    </section>
  );
}
