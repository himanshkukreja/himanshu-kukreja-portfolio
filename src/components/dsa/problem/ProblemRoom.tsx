"use client";

/**
 * The problem room (plan §7.2): the statement (Description, Hints, Editorial, Submissions) beside the code-labs editor
 * in four languages.
 *
 * - Python and JavaScript run in the browser on the code-labs workers (Pyodide, the JS worker) with drivers that follow
 *   the judge's conventions (src/lib/dsa/harness.ts). Run = the visible tests; Submit = visible + hidden
 *   (/api/dsa/tests/<id>).
 * - Java and C++ go to /api/dsa/judge (judge-lite; "coming soon" until it is configured).
 * - An accepted Submit records the solve (DSA Mastery Bits once: the level's base, +first try, +no hints; never SD
 *   Mastery XP; learning_progress course 'dsa', the streak) and unlocks the editorial; so do three failed submits or
 *   "show the editorial" (solving after that keeps a quarter of the base, src/lib/dsa/rewards.ts).
 * - The hint ladder opens one rung at a time. Code is kept per language on this device.
 * - The Tutor tab (ProblemTutor) is DSA Mastery's AI tutor for this problem: hint, debug, complexity, dry run and review,
 *   reading the code in the editor and the last result. A failed run offers "Ask the tutor why" under the verdict.
 *
 * Beginner pass (owner, 9 Nov 2026), for everyone: a three-step walkthrough on the first problem ever opened
 * (FirstProblemGuide), "Explain this problem simply" (the tutor's plain-language mode, no spoilers), errors as one plain
 * sentence with the raw message folded under it (lib/dsa/friendly), jargon tooltips on the statement, and "Save
 * offline" beside the title. The simple view also shows only the chosen language (a "switch language" link opens the
 * others) and folds the Bits, ladder step, line and hint counters into one quiet line; the full view keeps them all.
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import "../dsa.css";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodeEditorHandle } from "@/components/learn/labs/CodeEditor";
import { loadCodeEditor, loadCourseEnhancer } from "@/lib/offline/lazy";
import { getRunner, retainRunner } from "@/lib/learn/labs/runner";
import { userFetch } from "@/components/learn/progress/userFetch";
import styles from "@/components/learn/lesson/reader.module.css";
import { track } from "@/lib/track";
import { BROWSER_LANGS, DSA_LANG_LABEL, DSA_LANGS, type DsaLang, type DsaTestCase, type ProblemPage } from "@/lib/dsa/types";
import { maxSolveBits, solveBits } from "@/lib/dsa/rewards";
import { GIVEN_JS, GIVEN_PY, VERDICT_LABEL, fnNameFor, javascriptTests, outcomeFrom, pythonTests, starterCode, wireCases, type JudgeOutcome, type WireCase } from "@/lib/dsa/harness";
import { useLang } from "../concept/widgets";
import DsaHydrator from "../concept/DsaHydrator";
import DsaCrumbs from "../DsaCrumbs";
import { useDsaProgress, useRecordSolve } from "../progress/useDsaProgress";
import ProblemTutor, { type TutorRequest } from "./ProblemTutor";
import { useDailySolve, useIsDaily } from "../daily/useDsaDaily";
import { Lock, MessageCircleQuestion, NotebookPen, PlayCircle, Sparkles } from "lucide-react";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { friendlyError, friendlyWrong } from "@/lib/dsa/friendly";
import Jargon from "../glossary/Jargon";
import { ShowEverything, useDsaFull } from "../simple/view";
import FirstProblemGuide from "./FirstProblemGuide";
import SolutionVideo from "./SolutionVideo";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { SolutionVideoData } from "@/lib/dsa/media";
import { INK_EVENTS } from "@/lib/learn/ink/types";

const CodeEditor = dynamic(loadCodeEditor, { ssr: false, loading: () => <div className="grid h-full place-items-center font-mono text-[12px] text-fg-3">Loading the editor…</div> });
const CourseEnhancer = dynamic(loadCourseEnhancer, { ssr: false });

type Tab = "description" | "hints" | "tutor" | "editorial" | "submissions";
type HistoryRow = { at: number; lang: DsaLang; verdict: string; passed: number; total: number };

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

const fmtVal = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v));

function Html({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`course-content ${styles.content} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ------------------------------------------------------------------ verdict panel */

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
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-4 px-3 py-2 ${ok ? "border-ok bg-surface" : "border-bad bg-surface"}`}>
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
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 border border-signal px-2.5 font-mono text-[12px] text-signal-text hover:bg-[var(--c-dsa-hl)] [@media(pointer:coarse)]:min-h-11"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {ok ? "Get a review" : "Ask the tutor why"}
          </button>
        )}
      </div>
      {friendly ? (
        <div className="flex flex-col gap-1.5 border border-bad/40 bg-surface px-3 py-2.5" data-friendly-error>
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
                className={`min-h-9 border px-2.5 font-mono text-[12px] ${i === sel ? "border-signal text-fg" : "border-line-strong text-fg-3"}`}
              >
                {c.ok ? "✓" : "✗"} {c.name}
              </button>
            ))}
          </div>
          {cur && (
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border border-line bg-surface p-3 font-mono text-[12px]">
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

/* ------------------------------------------------------------------ the room */

/** The published solution video's length and poster, known before the editorial unlocks (the video itself stays behind it). */
export type VideoTeaser = { duration: number; poster: string };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function ProblemRoom({ p, videoTeaser = null }: { p: ProblemPage; videoTeaser?: VideoTeaser | null }) {
  const [lang, setLang] = useLang();
  const progress = useDsaProgress();
  const recordSolve = useRecordSolve();
  const dailySolve = useDailySolve();
  const isDaily = useIsDaily(p.id);
  const solved = progress.solved.has(p.id);
  const editor = useRef<CodeEditorHandle | null>(null);
  const codeKey = (l: DsaLang) => `dsa.code.${p.id}.${l}`;
  const starter = useMemo(() => Object.fromEntries(DSA_LANGS.map((l) => [l, starterCode(l, p.signature)])) as Record<DsaLang, string>, [p.signature]);
  const initialFor = useCallback((l: DsaLang) => (typeof window === "undefined" ? starter[l] : store.get(codeKey(l)) ?? starter[l]), [starter]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("description");
  const [hints, setHints] = useState(0);
  const [editorial, setEditorial] = useState<{ state: "locked" | "loading" | "ready" | "error"; html: string; video?: SolutionVideoData | null }>({ state: "locked", html: "" });
  const [seenEarly, setSeenEarly] = useState(false);
  const [fails, setFails] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState<null | "run" | "submit">(null);
  const [outcome, setOutcome] = useState<{ o: JudgeOutcome; mode: "run" | "submit"; code: string; lang: DsaLang } | null>(null);
  const full = useDsaFull();
  // the simple view shows the chosen language only; "switch language" opens the other three
  const [langsOpen, setLangsOpen] = useState(false);
  const editorBox = useRef<HTMLDivElement>(null);
  const runRow = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stdout, setStdout] = useState("");
  const [loadMsg, setLoadMsg] = useState("");
  const statementRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tutorReq, setTutorReq] = useState<TutorRequest | null>(null);
  const editorialRef = useRef<HTMLDivElement>(null);

  // device state: hints opened, editorial seen, failed submits, history
  useEffect(() => {
     
    setHints(Number(store.get(`dsa.hints.${p.id}`)) || 0);
    setFails(Number(store.get(`dsa.fails.${p.id}`)) || 0);
    setSeenEarly(store.get(`dsa.editorial.${p.id}`) === "early");
    try {
      setHistory(JSON.parse(store.get(`dsa.history.${p.id}`) || "[]") as HistoryRow[]);
    } catch {
      setHistory([]);
    }
     
  }, [p.id]);
  useEffect(() => retainRunner(), []);

  const unlocked = solved || fails >= 3 || seenEarly;
  const loadEditorial = useCallback(async () => {
    setEditorial({ state: "loading", html: "" });
    try {
      const r = await fetch(`/api/dsa/editorial/${p.id}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { html: string; video?: SolutionVideoData | null };
      setEditorial({ state: "ready", html: j.html, video: j.video ?? null });
    } catch {
      setEditorial({ state: "error", html: "" });
    }
  }, [p.id]);
  useEffect(() => {
    if (tab === "editorial" && unlocked && editorial.state === "locked") void loadEditorial();
  }, [tab, unlocked, editorial.state, loadEditorial]);

  const switchLang = (l: DsaLang) => {
    setLangsOpen(false);
    const cur = editor.current?.getValue();
    if (cur !== undefined) store.set(codeKey(lang), cur);
    setLang(l);
    setOutcome(null);
    setNotice(null);
    editor.current?.setValue(initialFor(l));
  };

  const pushHistory = (row: HistoryRow) => {
    const next = [row, ...history].slice(0, 20);
    setHistory(next);
    store.set(`dsa.history.${p.id}`, JSON.stringify(next));
  };

  const runBrowser = async (mode: "run" | "submit", code: string): Promise<JudgeOutcome | null> => {
    let cases: WireCase[] = wireCases(p.signature, p.visible, false);
    if (mode === "submit") {
      const r = await fetch(`/api/dsa/tests/${p.id}?v=${p.testsVersion}`);
      if (!r.ok) {
        setNotice("Couldn't load the hidden tests. Check your connection and try again.");
        return null;
      }
      const t = (await r.json()) as { hidden: DsaTestCase[] };
      cases = [...cases, ...wireCases(p.signature, t.hidden, true)];
    }
    const py = lang === "python";
    const runner = getRunner(py ? "py" : "js");
    if (runner.status.phase !== "ready") setLoadMsg(py ? "Starting Python in your browser (first run downloads about 6.5 MB)…" : "Starting JavaScript…");
    const src = py ? pythonTests(p.signature, cases, p.checker) : javascriptTests(p.signature, cases, p.checker);
    let out = "";
    const res = await runner.runTests({ code, ts: false, given: { code: py ? GIVEN_PY : GIVEN_JS, ts: false }, groups: [{ name: "dsa", src, ts: false }] }, mode === "submit" ? 45_000 : 20_000, (t) => {
      out += t;
      setStdout(out.slice(-8000));
    });
    setLoadMsg("");
    // Pyodide is a few times slower than CPython: the per-test budget allows for it
    return outcomeFrom(res, cases, Math.round(p.limits.timeMs * (py ? 3 : 1.5)));
  };

  const runServer = async (mode: "run" | "submit", code: string): Promise<JudgeOutcome | null> => {
    const r = await userFetch("/api/dsa/judge", { method: "POST", body: JSON.stringify({ problemId: p.id, language: lang, code, mode }) });
    const j = (await r.json().catch(() => ({}))) as JudgeOutcome & { error?: string; comingSoon?: boolean };
    if (!r.ok) {
      setNotice(j.error || "The judge couldn't run this. Please try again.");
      return null;
    }
    return j;
  };

  const go = async (mode: "run" | "submit") => {
    if (busy) return;
    const code = editor.current?.getValue() ?? initialFor(lang);
    store.set(codeKey(lang), code);
    setBusy(mode);
    setNotice(null);
    setStdout("");
    setOutcome(null);
    track(mode === "run" ? "dsa_run" : "dsa_submit_try", { problem: p.id, lang });
    let o: JudgeOutcome | null = null;
    try {
      o = BROWSER_LANGS.has(lang) ? await runBrowser(mode, code) : await runServer(mode, code);
    } catch (e) {
      setNotice((e as Error).message || "Something went wrong.");
    }
    setBusy(null);
    if (!o) return;
    setOutcome({ o, mode, code, lang });
    if (mode !== "submit") return;
    pushHistory({ at: Date.now(), lang, verdict: o.verdict, passed: o.passed, total: o.total });
    void userFetch("/api/dsa/submit", { method: "POST", body: JSON.stringify({ problemId: p.id, language: lang, verdict: o.verdict, passed: o.passed, total: o.total, judgedBy: o.judgedBy, ms: o.ms, code }) }).catch(() => {});
    if (o.verdict === "AC") {
      // first try: no failed submit on this problem before (this device); the editorial opened first keeps a quarter
      const res = await recordSolve({ id: p.id, title: p.title, level: p.level, lang, hintsUsed: hints, editorialSeen: seenEarly, firstTry: fails === 0 && !solved });
      // today's daily problem: the day counts toward the DSA daily streak (any Accepted submit that day)
      const daily = await dailySolve(p.id);
      const dailyNote = daily ? ` Daily problem #${daily} done: your daily streak is safe today.` : "";
      const how = res.parts.map((x) => `${x.label} ${x.bits}`).join(" + ");
      setNotice(
        (res.bits > 0
          ? `Accepted. +${res.bits} Bits (${how})${seenEarly ? ", fewer because the editorial was opened first" : ""}, and the editorial is open.`
          : "Accepted. You've solved this one before, so no new Bits; the editorial is open.") + dailyNote,
      );
    } else {
      const n = fails + 1;
      setFails(n);
      store.set(`dsa.fails.${p.id}`, String(n));
    }
  };

  const reset = () => {
    editor.current?.setValue(starter[lang]);
    store.set(codeKey(lang), starter[lang]);
  };

  const openHint = (to?: number, from: "ladder" | "tutor" = "ladder") => {
    const n = Math.min(p.hints.length, to ?? hints + 1);
    if (n <= hints) return;
    setHints(n);
    store.set(`dsa.hints.${p.id}`, String(n));
    track("dsa_hint", { problem: p.id, rung: n, from });
  };

  // "Ask the tutor why" / "Get a review" under a verdict: the Tutor tab, asked at once (on phones the tabs scroll into view)
  const askTutor = (mode: "debug" | "review") => {
    setTab("tutor");
    setTutorReq({ mode, key: Date.now() });
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // "Give up and show the editorial": asked in the site's own dialog (Bits trade-off), then revealed
  const [askReveal, setAskReveal] = useState(false);
  const revealEditorial = () => {
    setAskReveal(false);
    store.set(`dsa.editorial.${p.id}`, "early");
    setSeenEarly(true);
    // signed in: recorded on the account, so the AI tutor may use the editorial too (a guest's reveal stays here)
    void userFetch(`/api/dsa/editorial/${p.id}`, { method: "POST" }).catch(() => {});
  };

  // "Explain this problem simply": the tutor in its plain-language mode (what goes in, what comes out, the first example; no approach)
  const explain = () => {
    setTab("tutor");
    setTutorReq({ mode: "explain", key: Date.now() });
    track("dsa_explain_simply", { problem: p.id });
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "description", label: "Description" },
    { id: "hints", label: full ? `Hints ${hints}/${p.hints.length}` : "Hints" },
    { id: "tutor", label: "Tutor" },
    { id: "editorial", label: `Editorial${videoTeaser ? " + video" : ""}${unlocked || !full ? "" : " · locked"}` },
    { id: "submissions", label: "Submissions" },
  ];
  const line = p.lineLabel;
  const showLangs = full || langsOpen ? DSA_LANGS : [lang];

  return (
    <div className="mx-auto grid w-full max-w-[1440px] gap-6 px-4 pb-16 pt-6 sm:px-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8 lg:pb-4 lg:pt-2">
      {/* statement */}
      <section aria-label="Problem" className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-8 lg:pr-3">
        <header className="flex flex-col gap-2">
          <DsaCrumbs items={[{ href: "/dsa/problems", label: "Practice" }, { href: `/dsa/concepts/${p.concept}`, label: p.conceptTitle }]} />
          <p className="m-0 font-mono text-[12px] uppercase tracking-label text-signal-text">
            {full ? `${[p.level, line].filter(Boolean).join(" · ")} · practice problem ${p.order} of the lesson` : `Practice problem · ${p.level}`}
          </p>
          <h1 className="m-0 flex flex-wrap items-center gap-3 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[38px]">
            {p.title}
            {solved && <span className="border-2 border-ok px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-label text-ok-text">✓ Solved</span>}
            {isDaily.daily && (
              <Link href="/dsa/daily" className="border-2 border-signal px-2 py-0.5 font-mono text-[12px] font-semibold uppercase tracking-label text-signal-text hover:bg-surface-2">
                Daily #{isDaily.number}
              </Link>
            )}
          </h1>
          {full ? (
            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-fg-2">
              <Link href={`/dsa/concepts/${p.concept}`} className="text-signal-text underline decoration-line-strong underline-offset-4">
                Lesson: {p.conceptTitle}
              </Link>
              {p.minutes ? <span>~{p.minutes} min</span> : null}
              <span title="Bits for a first-try solve with no hints">up to {maxSolveBits(p.level)} Bits</span>
            </p>
          ) : (
            // the simple view: the small print in one quiet line that opens on tap
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-fg-3">
              <Link href={`/dsa/concepts/${p.concept}`} className="text-signal-text underline decoration-line-strong underline-offset-4">
                Lesson: {p.conceptTitle}
              </Link>
              {p.minutes ? <span>~{p.minutes} min</span> : null}
              <details>
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center underline decoration-line-strong underline-offset-4 hover:text-fg [&::-webkit-details-marker]:hidden">
                  more<span className="sr-only"> about this problem</span>
                </summary>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {line && <span>{line}</span>}
                  <span>practice problem {p.order} of the lesson</span>
                  <span title="Bits for a first-try solve with no hints">up to {maxSolveBits(p.level)} Bits</span>
                  <span>
                    {hints}/{p.hints.length} hints open
                  </span>
                </span>
              </details>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={explain}
              className="inline-flex min-h-10 items-center gap-1.5 border border-signal px-3 text-[14px] font-medium text-signal-text hover:bg-[var(--c-dsa-hl)]"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden />
              Explain this problem simply
            </button>
            {videoTeaser && (
              <button
                type="button"
                onClick={() => {
                  setTab("editorial");
                  if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
                className="inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 text-[14px] text-fg-2 hover:border-signal hover:text-fg"
              >
                <PlayCircle className="h-4 w-4 text-signal-text" aria-hidden />
                Solution video · {mmss(videoTeaser.duration)}
                {!unlocked && <Lock className="h-3.5 w-3.5 text-fg-3" aria-label="opens with the editorial" />}
              </button>
            )}
            {/* save for offline: the statement, visible tests and hints, with the Python runtime so Run works offline */}
            <SaveOfflineButton title={p.title} kind="dsa-problem" />
            <ShowEverything />
          </div>
        </header>
        <div ref={tabsRef} role="tablist" aria-label="Problem tabs" className="flex scroll-mt-[calc(var(--hk-header-h,61px)+8px)] flex-wrap border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 font-mono text-[12px] uppercase tracking-label ${tab === t.id ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
            >
              {t.id === "tutor" && <Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "description" && (
          <div ref={statementRef} className={`course-content ${styles.content} flex flex-col gap-2`} data-problem-statement>
            {/* "Scenario to model" is hint rung 1, so it isn't repeated here */}
            {p.sections
              .filter((s) => s.id !== "model")
              .map((s) => (
                <section key={s.id} aria-labelledby={`ps-${s.id}`}>
                  <h2 id={`ps-${s.id}`} className="!m-0 !mb-1 !mt-4 font-mono !text-[12px] font-normal uppercase tracking-label text-fg-3">
                    {s.title}
                  </h2>
                  <div className={s.id === "task" ? "border-l-4 border-signal pl-4" : ""} dangerouslySetInnerHTML={{ __html: s.html }} />
                </section>
              ))}
            <CourseEnhancer lessonKey={`dsa/${p.id}`} />
            <Jargon rootRef={statementRef} deps={tab} />
          </div>
        )}

        {tab === "hints" && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[14px] text-fg-2">Five hints, from restating the task to a skeleton with blanks. Open one at a time and try again after each.</p>
            {p.hints.slice(0, hints).map((h, i) => (
              <article key={i} className="border border-line bg-surface px-4 py-2">
                <h3 className="m-0 mt-2 font-mono text-[12px] uppercase tracking-label text-signal-text">{h.title}</h3>
                <Html html={h.html} />
              </article>
            ))}
            {hints < p.hints.length ? (
              <button type="button" onClick={() => openHint()} className="min-h-11 self-start border-2 border-signal px-4 text-[15px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)]">
                Open hint {hints + 1}: {p.hints[hints]?.title.replace(/^Rung \d+:\s*/, "")}
              </button>
            ) : (
              <p className="m-0 font-mono text-[12px] text-fg-3">All five hints are open. The editorial opens after a solve or three failed submits.</p>
            )}
          </div>
        )}

        {tab === "tutor" && (
          <ProblemTutor
            p={p}
            lang={lang}
            code={() => editor.current?.getValue() ?? initialFor(lang)}
            last={outcome}
            hintsOpen={hints}
            onHint={(n) => openHint(n, "tutor")}
            solved={solved}
            request={tutorReq}
            onRequestHandled={() => setTutorReq(null)}
          />
        )}

        <ConfirmDialog
          isOpen={askReveal}
          tone="notice"
          title="Show the editorial?"
          message={`Solving afterwards still marks the problem solved, but earns only ${solveBits({ level: p.level, firstTry: false, noHints: false, editorialFirst: true }).bits} Bits instead of up to ${maxSolveBits(p.level)}.${videoTeaser ? " The solution video opens too." : ""}`}
          confirmText="Show the editorial"
          cancelText="Keep trying"
          onConfirm={revealEditorial}
          onCancel={() => setAskReveal(false)}
        />
        {tab === "editorial" && (
          <div className="flex flex-col gap-3">
            {!unlocked ? (
              <div className="flex flex-col gap-3 border border-line bg-surface p-5">
                <p className="m-0 text-[15px] text-fg">
                  The editorial{videoTeaser ? " and the solution video open" : " opens"} when you solve the problem, or after three failed submits ({fails}/3 so far).
                </p>
                {videoTeaser && (
                  <div className="relative aspect-video w-full max-w-[560px] overflow-hidden border border-line bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={videoTeaser.poster} alt="" className="h-full w-full object-cover opacity-40 blur-[6px]" loading="lazy" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white">
                      <Lock className="h-6 w-6" aria-hidden />
                      <span className="font-mono text-[12px] uppercase tracking-label">Solution video · {mmss(videoTeaser.duration)}</span>
                      <span className="px-6 text-[13px] text-white/80">The full walkthrough, step by step, in all four languages. It opens with the editorial.</span>
                    </div>
                  </div>
                )}
                <button type="button" onClick={() => setAskReveal(true)} className="min-h-11 self-start border border-line-strong px-4 text-[14px] text-fg-2 hover:text-fg">
                  Give up and show the editorial
                </button>
              </div>
            ) : editorial.state === "ready" ? (
              <div ref={editorialRef} className="flex flex-col gap-4">
                {editorial.video && <SolutionVideo video={editorial.video} lang={lang} />}
                <Html html={editorial.html} />
                <DsaHydrator rootRef={editorialRef} deps={editorial.html.length.toString()} />
              </div>
            ) : editorial.state === "error" ? (
              <p className="m-0 text-[14px] text-bad-text">The editorial couldn&apos;t load. Please try again.</p>
            ) : (
              <p className="m-0 text-[14px] text-fg-3">Loading the editorial…</p>
            )}
          </div>
        )}

        {tab === "submissions" && (
          <div className="flex flex-col gap-2">
            {history.length === 0 ? (
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
                      <td className={`border-b border-line py-2 ${h.verdict === "AC" ? "text-ok-text" : "text-bad-text"}`}>{VERDICT_LABEL[h.verdict as keyof typeof VERDICT_LABEL] || h.verdict}</td>
                      <td className="border-b border-line py-2 text-fg-2">
                        {h.passed}/{h.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {(p.sdmLinks.length > 0 || p.prev || p.next) && (
          <aside aria-label="Related" className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            {p.sdmLinks.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Where this is used: System Design Mastery</span>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {p.sdmLinks.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 text-[13px] text-fg hover:border-signal">
                        <span className="font-mono text-[10px] uppercase tracking-label text-signal-text">{l.kind === "lab" ? "Lab" : l.kind === "problem" ? "Problem" : "Lesson"}</span>
                        {l.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap justify-between gap-3 text-[14px]">
              {p.prev ? (
                <Link href={`/dsa/problems/${p.prev.id}`} className="text-fg-2 hover:text-fg">
                  ← {p.prev.title}
                </Link>
              ) : (
                <span />
              )}
              {p.next && (
                <Link href={`/dsa/problems/${p.next.id}`} className="text-fg-2 hover:text-fg">
                  {p.next.title} →
                </Link>
              )}
            </div>
          </aside>
        )}
      </section>

      {/* editor. Desktop: the right half of the split screen (the full height; it never moves while the statement scrolls); the
          editor takes whatever the toolbar, the Run / Submit row and the results leave (no dead band under it), and the
          results scroll inside their own area. Phones: a fixed-height editor in the page flow. */}
      <section
        aria-label="Your solution"
        className="flex min-w-0 flex-col gap-3 lg:h-full lg:min-h-0"
      >
        {/* one row from 1024 px (the notebook button used to wrap onto its own row): the note truncates, the labels shorten */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap">
          <div role="tablist" aria-label="Language" className="flex shrink-0 border border-line-strong">
            {showLangs.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={l === lang}
                onClick={() => switchLang(l)}
                className={`min-h-10 px-3 font-mono text-[12px] ${l === lang ? "bg-signal text-on-signal" : "text-fg-2 hover:bg-surface-2"}`}
              >
                {DSA_LANG_LABEL[l]}
              </button>
            ))}
          </div>
          {!full && !langsOpen ? (
            <button type="button" onClick={() => setLangsOpen(true)} className="min-h-10 shrink-0 px-1 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
              switch language
            </button>
          ) : null}
          <span className="min-w-0 truncate font-mono text-[11px] text-fg-3">
            write <code className="text-fg-2">{fnNameFor(lang, p.signature.fn)}</code>
            {lang === "java" ? " in class Solution" : ""} · {BROWSER_LANGS.has(lang) ? "runs in your browser" : "judged on the server"}
          </span>
          <button type="button" onClick={reset} className="ml-auto min-h-10 shrink-0 whitespace-nowrap px-2 font-mono text-[12px] text-fg-3 underline">
            reset code
          </button>
          {/* the Notebook lives here in the problem room: a floating pen would sit over Run / Submit (the editor fills the height) */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(INK_EVENTS.open, { detail: {} }))}
            aria-label="Open the notebook"
            title="Notebook"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border border-line-strong px-2.5 font-mono text-[12px] text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            <NotebookPen className="h-3.5 w-3.5" aria-hidden />
            <span className="lg:hidden xl:inline">notebook</span>
          </button>
        </div>
        <div ref={editorBox} className="h-[380px] border border-line-strong sm:h-[440px] lg:h-auto lg:min-h-[260px] lg:flex-1">
          <CodeEditor key={`${p.id}`} handle={editor} initial={initialFor(lang)} fontSize={14} label={`${DSA_LANG_LABEL[lang]} solution`} language={lang} onRun={() => void go("run")} onFocus={() => BROWSER_LANGS.has(lang) && void getRunner(lang === "python" ? "py" : "js").warm()} />
        </div>
        <div ref={runRow} className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => void go("run")} disabled={!!busy} className="min-h-11 border-2 border-signal px-5 text-[15px] font-semibold text-signal-text disabled:opacity-50">
            {busy === "run" ? "Running…" : "Run"}
          </button>
          <button type="button" onClick={() => void go("submit")} disabled={!!busy} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-50">
            {busy === "submit" ? "Submitting…" : "Submit"}
          </button>
          <span className="font-mono text-[11px] text-fg-3">
            {full ? `Run: ${p.visible.length} visible tests · Submit: + ${p.hiddenCount} hidden · ⌘/Ctrl + Enter runs` : "Run tries the examples · Submit checks every test"}
          </span>
        </div>
        {(loadMsg || notice || outcome || stdout) && (
          <div className="flex flex-col gap-3 lg:max-h-[45%] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain">
            {loadMsg && <p className="m-0 text-[13px] text-fg-3">{loadMsg}</p>}
            {notice && (
              <p className={`m-0 border px-3 py-2 text-[14px] ${outcome?.o.verdict === "AC" ? "border-ok text-ok-text" : "border-line-strong text-fg"}`} role="status">
                {notice}
              </p>
            )}
            {outcome && <VerdictPanel outcome={outcome.o} mode={outcome.mode} visible={p.visible} onTutor={askTutor} code={outcome.code} lang={outcome.lang} fn={fnNameFor(outcome.lang, p.signature.fn)} />}
            {stdout && (
              <details className="border border-line bg-surface">
                <summary className="min-h-10 cursor-pointer px-3 py-2 font-mono text-[12px] text-fg-3">Your printed output</summary>
                <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[12px] text-fg-2">{stdout}</pre>
              </details>
            )}
          </div>
        )}
        <p className="m-0 text-[12px] text-fg-4 lg:hidden">Coding is easiest on a laptop. On a phone, read, trace and try small edits.</p>
      </section>
      <FirstProblemGuide
        fn={fnNameFor(lang, p.signature.fn)}
        editor={() => editorBox.current}
        examples={() => statementRef.current?.querySelector<HTMLElement>('[aria-labelledby="ps-examples"]') || tabsRef.current}
        run={() => runRow.current}
      />
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
