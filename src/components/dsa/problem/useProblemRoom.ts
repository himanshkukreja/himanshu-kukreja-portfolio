"use client";

/**
 * All of the problem room's state and logic (split out of ProblemRoom.tsx, Nov 2026 redesign): the judge calls
 * (browser workers for Python/JS, /api/dsa/judge for Java/C++), recordSolve and the daily hook, the hint ladder, the
 * editorial fetch and its reveal rule, per-language code, failed-submit count, submissions history. The layout
 * components (ProblemShell, ProblemTabs, EditorPane, ResultsPanel) only read this object.
 *
 * - Python and JavaScript run in the browser on the code-labs workers (drivers follow src/lib/dsa/harness.ts). Run = the
 *   visible tests; Submit = visible + hidden (/api/dsa/tests/<id>).
 * - An accepted Submit records the solve (DSA Mastery Bits once; learning_progress course 'dsa'; the streak) and unlocks
 *   the editorial; so do three failed submits or "show the editorial" (solving after that keeps a quarter of the base).
 * - The hint ladder opens one rung at a time. Code is kept per language on this device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodeEditorHandle } from "@/components/learn/labs/CodeEditor";
import { getRunner, retainRunner } from "@/lib/learn/labs/runner";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { BROWSER_LANGS, DSA_LANGS, type DsaLang, type DsaTestCase, type ProblemPage } from "@/lib/dsa/types";
import { GIVEN_JS, GIVEN_PY, javascriptTests, outcomeFrom, pythonTests, starterCode, wireCases, type JudgeOutcome, type WireCase } from "@/lib/dsa/harness";
import { solveBits, maxSolveBits } from "@/lib/dsa/rewards";
import { useLang } from "../concept/widgets";
import { useDsaProgress, useRecordSolve } from "../progress/useDsaProgress";
import { useDailySolve, useIsDaily } from "../daily/useDsaDaily";
import { celebrate } from "@/lib/dsa/celebrate";
import { useSignInGate } from "@/components/gate/SignInGate";
import type { SolutionVideoData } from "@/lib/dsa/media";
import type { TutorRequest } from "./ProblemTutor";
import type { Explainer } from "@/lib/dsa/explainer";
import { splitEditorial } from "./splitEditorial";

export type Tab = "problem" | "hints" | "editorial" | "solutions" | "video";
export type Drawer = "tutor" | "interview" | null;
export type HistoryRow = { at: number; lang: DsaLang; verdict: string; passed: number; total: number };
export type Outcome = { o: JudgeOutcome; mode: "run" | "submit"; code: string; lang: DsaLang };
/** The published solution video's length and poster, known before the editorial unlocks (the video itself stays behind it). */
export type VideoTeaser = { duration: number; poster: string };
/** Where this problem sits in its lesson's Practice list ("Practice 2 of 5"), computed on the server. */
export type ProblemPosition = {
  lesson: { title: string; href: string } | null;
  n: number;
  m: number;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
};
type EditorialState = { state: "locked" | "loading" | "ready" | "error"; editorial: string; solutions: string; video?: SolutionVideoData | null; explainer?: Explainer | null };

export const store = {
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

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const isPhone = () => window.matchMedia("(max-width: 1023px)").matches;

export function useProblemRoom(p: ProblemPage, videoTeaser: VideoTeaser | null) {
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

  // the sign-in gate (src/lib/gate): signed out, the statement and examples stay open; Run, Submit, the hints, the
  // editorial, the solutions and the solution video ask for a (free) sign-in
  const gate = useSignInGate("dsa-problem");
  const [tab, setTab] = useState<Tab>("problem");
  const [drawer, setDrawer] = useState<Drawer>(null);
  // phones: the two panes are tabs (Problem | Code)
  const [pane, setPane] = useState<"problem" | "code">("problem");
  const [bottom, setBottom] = useState<"results" | "submissions">("results");
  const [hints, setHints] = useState(0);
  const [editorial, setEditorial] = useState<EditorialState>({ state: "locked", editorial: "", solutions: "" });
  const [seenEarly, setSeenEarly] = useState(false);
  const [fails, setFails] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState<null | "run" | "submit">(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stdout, setStdout] = useState("");
  const [loadMsg, setLoadMsg] = useState("");
  const [tutorReq, setTutorReq] = useState<TutorRequest | null>(null);
  const [askReveal, setAskReveal] = useState(false);
  const [fontSize, setFontSizeState] = useState(14);
  const [suggestions, setSuggestionsState] = useState(true);
  const editorBox = useRef<HTMLDivElement>(null);
  const runRow = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const editorialRef = useRef<HTMLDivElement>(null);
  const solutionsRef = useRef<HTMLDivElement>(null);

  // device state: hints opened, editorial seen, failed submits, history, editor preferences
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setHints(Number(store.get(`dsa.hints.${p.id}`)) || 0);
    setFails(Number(store.get(`dsa.fails.${p.id}`)) || 0);
    setSeenEarly(store.get(`dsa.editorial.${p.id}`) === "early");
    try {
      setHistory(JSON.parse(store.get(`dsa.history.${p.id}`) || "[]") as HistoryRow[]);
    } catch {
      setHistory([]);
    }
    const fs = Number(store.get("dsa.editor.font"));
    if (fs >= 11 && fs <= 22) setFontSizeState(fs);
    if (store.get("dsa.editor.suggest") === "off") setSuggestionsState(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [p.id]);
  useEffect(() => retainRunner(), []);

  const setFontSize = (n: number) => {
    const v = Math.min(22, Math.max(11, n));
    setFontSizeState(v);
    store.set("dsa.editor.font", String(v));
  };
  const setSuggestions = (on: boolean) => {
    setSuggestionsState(on);
    store.set("dsa.editor.suggest", on ? "on" : "off");
  };

  const unlocked = solved || fails >= 3 || seenEarly;
  const loadEditorial = useCallback(async () => {
    setEditorial({ state: "loading", editorial: "", solutions: "" });
    try {
      const r = await fetch(`/api/dsa/editorial/${p.id}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { html: string; video?: SolutionVideoData | null; explainer?: Explainer | null };
      const split = splitEditorial(j.html);
      setEditorial({ state: "ready", editorial: split.editorial, solutions: split.solutions, video: j.video ?? null, explainer: j.explainer ?? null });
    } catch {
      setEditorial({ state: "error", editorial: "", solutions: "" });
    }
  }, [p.id]);
  const needsEditorial = tab === "editorial" || tab === "solutions" || tab === "video";
  useEffect(() => {
    if (needsEditorial && unlocked && !gate.locked && editorial.state === "locked") void loadEditorial();
  }, [needsEditorial, unlocked, gate.locked, editorial.state, loadEditorial]);

  // a link from the exported sheet (?tab=editorial, #solution-video) opens that tab on arrival; the video is scrolled to once it has loaded
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    const t: Tab | null = q === "description" || q === "problem" ? "problem" : q === "hints" || q === "editorial" || q === "solutions" || q === "video" ? q : window.location.hash === "#solution-video" ? "video" : null;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (t) setTab(t);
    if (q === "submissions") {
      setBottom("submissions");
      setPane("code");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [p.id]);

  const switchLang = (l: DsaLang) => {
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
    if (busy || gate.blocked(mode)) return;
    const code = editor.current?.getValue() ?? initialFor(lang);
    store.set(codeKey(lang), code);
    setBusy(mode);
    setNotice(null);
    setStdout("");
    setOutcome(null);
    setBottom("results");
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
      // confetti from the verdict: a first solve is the big one, a re-solve a small one (a belt-up adds its own in the toaster)
      requestAnimationFrame(() => void celebrate(res.first ? "first" : "again", document.querySelector("[data-dsa-verdict]")));
    } else {
      const n = fails + 1;
      setFails(n);
      store.set(`dsa.fails.${p.id}`, String(n));
    }
  };

  // after "Reset problem" (ResetProblem.tsx cleared the stored keys): the room is a fresh problem again
  const freshStart = () => {
    setHints(0);
    setFails(0);
    setSeenEarly(false);
    setHistory([]);
    setEditorial({ state: "locked", editorial: "", solutions: "" });
    setOutcome(null);
    setNotice(null);
    setStdout("");
    setTab("problem");
    editor.current?.setValue(starter[lang]);
  };

  const resetCode = () => {
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

  /** Phones show one pane at a time: bring the left pane (tabs) into view. */
  const showLeft = (t?: Tab) => {
    if (t) setTab(t);
    setPane("problem");
    setDrawer(null);
    if (isPhone()) requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // "Ask the tutor why" / "Get a review" under a verdict: the tutor drawer, asked at once
  const askTutor = (mode: "debug" | "review") => {
    setDrawer("tutor");
    setPane("problem"); // the drawer sits over the Problem pane; on a phone the Code pane is the one showing
    setTutorReq({ mode, key: Date.now() });
  };
  // "Explain this problem simply": the tutor in its plain-language mode (what goes in, what comes out, the first example; no approach)
  const explain = () => {
    setDrawer("tutor");
    setPane("problem");
    setTutorReq({ mode: "explain", key: Date.now() });
    track("dsa_explain_simply", { problem: p.id });
  };

  // "Give up and show the editorial": asked in the site's own dialog (Bits trade-off), then revealed
  const revealEditorial = () => {
    setAskReveal(false);
    store.set(`dsa.editorial.${p.id}`, "early");
    setSeenEarly(true);
    // signed in: recorded on the account, so the AI tutor may use the editorial too (a guest's reveal stays here)
    void userFetch(`/api/dsa/editorial/${p.id}`, { method: "POST" }).catch(() => {});
  };
  const revealText = `Solving afterwards still marks the problem solved, but earns only ${solveBits({ level: p.level, firstTry: false, noHints: false, editorialFirst: true }).bits} Bits instead of up to ${maxSolveBits(p.level)}.${videoTeaser ? " The solution video opens too." : ""}`;

  return {
    p, videoTeaser, lang, switchLang, progress, solved, isDaily, gate,
    editor, editorBox, runRow, statementRef, tabsRef, editorialRef, solutionsRef,
    initialFor, starter,
    tab, setTab, drawer, setDrawer, pane, setPane, bottom, setBottom,
    hints, openHint, editorial, unlocked, fails, seenEarly, history,
    busy, outcome, notice, stdout, loadMsg, go, freshStart, resetCode,
    tutorReq, setTutorReq, askTutor, explain, showLeft,
    askReveal, setAskReveal, revealEditorial, revealText,
    fontSize, setFontSize, suggestions, setSuggestions,
  };
}

export type Room = ReturnType<typeof useProblemRoom>;
