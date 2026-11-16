"use client";

/**
 * Runnable lesson snippets. Mounted by the DSA lesson hydrators (DsaHydrator for concept lessons, StructureHydrator for
 * structure and algorithm lessons) beside their own widgets. Every code figure in a runnable language (a `:::tabs`
 * pane or a plain fence) gets, in its own chrome (data-sd-chrome: never course text, so highlight offsets hold):
 *
 *   - in the code head (beside Copy): Edit, Run, Open in Playground;
 *   - under the code: the editor while editing (the static code hides), the output, Reset and Ask the tutor.
 *
 * A snippet that is one function runs with its example call (src/lib/dsa/playground/snippet.ts: the lesson's trace for
 * that template, else defaults); a program runs as it is; a fragment (a loop body, a "bug:" line) has no Run, only Edit
 * and Open in Playground. A `:::tabs` block keeps its language tabs (CodeTabs): each pane is its own snippet.
 *
 * Running is signed-in only: a guest sees "Sign in to run", which opens the sign-in dialog. Python and JavaScript run in
 * the browser, Java and C++ on the server judge.
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Lock, Pencil, Play, RotateCcw, Sparkles } from "lucide-react";
import type { CodeEditorHandle } from "@/components/learn/labs/CodeEditor";
import { loadCodeEditor } from "@/lib/offline/lazy";
import { retainRunner } from "@/lib/learn/labs/runner";
import { useAuth } from "@/contexts/AuthContext";
import { useSignInGate } from "@/components/gate/SignInGate";
import { track } from "@/lib/track";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { exampleFromTraces, exampleLabel, findFunction, programFromSnippet, snippetLang, type TraceLike } from "@/lib/dsa/playground/snippet";
import { INCOMING_KEY } from "@/lib/dsa/playground/drafts";
import ProgramOutput, { type OutputState } from "./ProgramOutput";
import { isRunFailure, runProgram, runtimeNote, warmRuntime } from "./runProgram";
import { askTutorAbout } from "./askTutor";
import "./runnable.css";

const CodeEditor = dynamic(loadCodeEditor, { ssr: false, loading: () => <div className="grid h-40 place-items-center font-mono text-[12px] text-fg-3">Loading the editor…</div> });

type Host = { fig: HTMLElement; bar: HTMLElement; below: HTMLElement; lang: DsaLang; code: string; template: string | null; title: string; key: string };

const hostsOf = new WeakMap<HTMLElement, Host>();
let seq = 0;

/** The code figures under `root` that can run, each with its two chrome hosts (made once per figure). */
function scan(root: HTMLElement): Host[] {
  const out: Host[] = [];
  for (const fig of Array.from(root.querySelectorAll<HTMLElement>("figure.sd-code[data-lang]"))) {
    if (fig.classList.contains("sd-code-plain")) continue;
    const pane = fig.closest<HTMLElement>(".dsa-pane");
    const lang = snippetLang(pane?.dataset.lang || fig.dataset.lang);
    if (!lang) continue;
    // only lesson text and :::tabs panes (not a problem's editorial, a quiz or a cheat sheet)
    const tabs = fig.closest<HTMLElement>("figure[data-dsa]");
    if (tabs && tabs.dataset.dsa !== "tabs") continue;
    let h = hostsOf.get(fig);
    if (!h || !fig.contains(h.bar) || !fig.contains(h.below)) {
      const head = fig.querySelector<HTMLElement>(":scope > .sd-code-head");
      const pre = fig.querySelector<HTMLElement>(":scope > pre");
      if (!head || !pre) continue;
      const bar = document.createElement("span");
      bar.setAttribute("data-sd-chrome", "");
      bar.setAttribute("data-pg-bar", "");
      head.appendChild(bar);
      const below = document.createElement("div");
      below.setAttribute("data-sd-chrome", "");
      below.setAttribute("data-pg-below", "");
      fig.appendChild(below);
      const caption = tabs?.querySelector("figcaption")?.textContent?.replace(/Code in four languages/i, "").trim() || "";
      h = { fig, bar, below, lang, code: (pre.textContent || "").replace(/\n$/, ""), template: tabs?.dataset.tabsId || null, title: caption, key: `pg-${++seq}` };
      hostsOf.set(fig, h);
      fig.setAttribute("data-runnable", "");
    }
    out.push(h);
  }
  return out;
}

export default function RunnableSnippets({ rootRef, traces, lesson, deps = "" }: { rootRef: React.RefObject<HTMLElement | null>; traces: Record<string, TraceLike> | TraceLike[]; lesson: { title: string }; deps?: string }) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const list = useMemo(() => (Array.isArray(traces) ? traces : Object.values(traces || {})), [traces]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const rescan = () => {
      const next = scan(root);
      setHosts((prev) => (prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next));
    };
    rescan();
    const mo = new MutationObserver((records) => {
      // our own hosts going in don't need a rescan
      if (!records.some((r) => Array.from(r.addedNodes).some((n) => !(n instanceof HTMLElement && (n.hasAttribute("data-pg-bar") || n.hasAttribute("data-pg-below")))) || r.removedNodes.length)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(rescan);
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [rootRef, deps]);

  useEffect(() => (hosts.length ? retainRunner() : undefined), [hosts.length]);

  return (
    <>
      {hosts.map((h) => (
        <RunnableSnippet key={h.key} host={h} traces={list} lessonTitle={lesson.title} />
      ))}
    </>
  );
}

const BTN = "pg-btn inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium";

function RunnableSnippet({ host, traces, lessonTitle }: { host: Host; traces: TraceLike[]; lessonTitle: string }) {
  const { lang } = host;
  const router = useRouter();
  const { user, loading } = useAuth();
  const gate = useSignInGate("dsa-snippet");
  const program = useMemo(() => {
    const fn = findFunction(lang, host.code);
    return programFromSnippet(lang, host.code, fn ? exampleFromTraces(fn, traces, host.template) : null);
  }, [lang, host.code, host.template, traces]);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(false);
  const [out, setOut] = useState<OutputState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const editor = useRef<CodeEditorHandle | null>(null);
  const current = useRef(program.code);
  const [seed, setSeed] = useState(program.code);
  const locked = !loading && !user;

  // the static code hides while the editor is open
  useEffect(() => {
    if (editing) host.fig.setAttribute("data-pg-editing", "");
    else host.fig.removeAttribute("data-pg-editing");
  }, [editing, host.fig]);

  const code = () => (editing ? editor.current?.getValue() ?? current.current : current.current);

  const edit = () => {
    setSeed(current.current);
    setEditing(true);
    warmRuntime(lang);
    track("dsa_snippet_edit", { lang });
    window.setTimeout(() => editor.current?.focus(), 80);
  };

  const run = async () => {
    if (busy) return;
    if (!user) {
      if (!loading) gate.ask("run");
      return;
    }
    const src = code();
    current.current = src;
    setBusy(true);
    setOut({ kind: "running", lang, stdout: "", note: runtimeNote(lang) });
    const r = await runProgram({ lang, code: src, stdin: "", from: "snippet" }, (s) => setOut({ kind: "running", lang, stdout: s, note: null }));
    setOut(isRunFailure(r) ? { kind: "failed", lang, error: r.error, comingSoon: r.comingSoon } : { kind: "done", lang, result: r });
    setBusy(false);
  };

  const reset = () => {
    current.current = program.code;
    setSeed(program.code);
    setEdited(false);
    setEditing(false);
    setOut({ kind: "idle" });
    setEditorKey((k) => k + 1);
  };

  const openInPlayground = () => {
    try {
      const href = `${window.location.pathname}${host.fig.closest("[id]")?.id ? `#${host.fig.closest("[id]")?.id}` : ""}`;
      window.localStorage.setItem(INCOMING_KEY, JSON.stringify({ lang, code: code(), stdin: "", from: { title: lessonTitle, href }, at: Date.now() }));
    } catch {
      /* storage blocked: the Playground opens on its drafts */
    }
    track("dsa_snippet_open_playground", { lang, runnable: program.runnable });
    router.push("/dsa/playground");
  };

  const ask = () => askTutorAbout({ lang, code: code(), stdin: "", result: out.kind === "done" ? out.result : null, where: "snippet", heading: host.title || lessonTitle });

  const bar = (
    <span className="dsa-ui pg-bar flex shrink-0 items-center gap-1">
      {!editing ? (
        <button type="button" onClick={edit} className={`${BTN} pg-quiet`} title="Edit this code and run your version">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          <span className="max-sm:sr-only">Edit</span>
        </button>
      ) : null}
      {program.runnable || edited ? (
        <button type="button" onClick={() => void run()} disabled={busy} className={`${BTN} pg-run`} title={locked ? "Sign in to run code" : `Run this ${DSA_LANG_LABEL[lang]} code`}>
          {locked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {locked ? <span>Sign in to run</span> : <span>{busy ? "Running…" : "Run"}</span>}
        </button>
      ) : null}
      <button type="button" onClick={openInPlayground} className={`${BTN} pg-quiet`} title="Open this code in the Playground" aria-label="Open in Playground">
        <span className="max-md:sr-only">Playground</span>
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );

  const showBelow = editing || out.kind !== "idle";
  const below = showBelow ? (
    <div className="dsa-ui pg-below flex flex-col">
      {editing ? (
        <div className="pg-editor h-[min(60vh,420px)] min-h-[200px]">
          <CodeEditor
            key={editorKey}
            handle={editor}
            initial={seed}
            fontSize={13}
            label={`${DSA_LANG_LABEL[lang]} code from the lesson`}
            language={lang}
            onChange={(v) => {
              current.current = v;
              if (!edited) setEdited(true);
            }}
            onRun={() => void run()}
            onFocus={() => warmRuntime(lang)}
          />
        </div>
      ) : null}
      {out.kind !== "idle" ? (
        <div className="pg-out flex flex-col gap-1.5 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Output</span>
          <ProgramOutput state={out} maxHeight="max-h-72" />
          {program.example && !edited && out.kind === "done" ? <p className="m-0 font-mono text-[11.5px] text-fg-3">Example input: {exampleLabel(program.example)}</p> : null}
        </div>
      ) : null}
      <div className="pg-actions flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
        {editing || edited ? (
          <button type="button" onClick={reset} className={`${BTN} pg-quiet`} title="Back to the lesson's code">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </button>
        ) : null}
        <button type="button" onClick={ask} className={`${BTN} pg-quiet`}>
          <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />
          Ask the tutor about this code
        </button>
        {editing && program.wrapped && program.runnable ? <span className="text-[12px] text-fg-3">The example call is at the bottom: change the input and run again.</span> : null}
        {editing && !program.runnable && !edited ? <span className="text-[12px] text-fg-3">A part of a bigger program: add what it needs, then run it.</span> : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(bar, host.bar)}
      {below ? createPortal(below, host.below) : null}
    </>
  );
}
