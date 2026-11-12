"use client";

/**
 * A code lab (/labs/[id]): the brief, example tests, given code, hints and solution on the left; the
 * editor, Run and the results on the right (stacked on phones, editor first and collapsible).
 *
 * Format v2 (resources/labs/README.md) adds, all optional per lab:
 * - languages: Python, JavaScript and/or TypeScript, switched in the editor bar; code is kept per language
 * - stages (projects): passing a stage unlocks the next and appends its starter to the reader's code
 * - incidents: the incident report, tests that reproduce it, and the war story after the fix
 * - follow-ups: the interviewer's next questions, some with extra tests
 * - a run visualiser, chaos tests and a scale test (their own tabs under the editor)
 * - interview mode: a timer, no hints or solution, follow-ups one at a time, a scored summary
 *
 * Python runs in Pyodide and JS/TS in a sandboxed worker (src/lib/learn/labs/runner.ts); code autosaves
 * per lab and language in this browser; passing every test awards the lab's XP once (game key "lab:<id>").
 */
import Link from "next/link";
import LabTutor from "@/components/learn/ai/LabTutor";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Eye, Lightbulb, Loader2, Lock, Minus, Play, Sparkles, Plus, RotateCcw, Timer, X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { loadCodeEditor } from "@/lib/offline/lazy";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { HarnessError, HarnessResult, HarnessTest } from "@/lib/learn/labs/harness";
import { getRunner, retainRunner, type RunOutcome, type RuntimeStatus } from "@/lib/learn/labs/runner";
import {
  clearCode,
  FONT_SIZES,
  loadCode,
  loadFont,
  loadSuggest,
  saveSuggest,
  loadLang,
  saveCode,
  saveFont,
  saveLang,
  scoreInterview,
  updateInterview,
  updateLab,
  useInterviews,
  useLabProgress,
  type InterviewFollowUp,
  type InterviewLive,
  type InterviewResult,
} from "@/lib/learn/labs/progress";
import { PYTHON_VERSION, RUNTIME_DOWNLOAD_LABEL, RUNTIME_STORED_LABEL } from "@/lib/learn/labs/runtime";
import {
  DIFFICULTY_LABEL,
  familyOf,
  INTERVIEW_PASS_SCORE,
  INTERVIEW_PASS_XP,
  labInterviewKey,
  labKey,
  LANG_FILE,
  LANG_LABEL,
  LANG_SHORT,
  TYPE_LABEL,
  type Lab,
  type LabFamily,
  type LabLang,
  type LabSrc,
} from "@/lib/learn/labs/types";
import type { CodeEditorHandle } from "./CodeEditor";
import LabViz from "./LabViz";
import LabChaos, { type ChaosRun } from "./LabChaos";
import LabScale, { type ScaleRunState } from "./LabScale";
import LabReview from "./LabReview";
import { FollowUpCard, InterviewBar, InterviewSummary } from "./LabInterview";
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";

const Editor = dynamic(() => loadCodeEditor(), {
  ssr: false,
  loading: () => <EditorPlaceholder text="Loading the editor…" />,
});

const REVEAL_AFTER_RUNS = 3;

type Tab = "brief" | "stages" | "tests" | "given" | "hints" | "solution" | "followups" | "story";
type ResultTab = "tests" | "viz" | "chaos" | "scale" | "output";
type Run = { outcome: RunOutcome; wallMs: number; at: number; gained: number | null; unlocked: number | null };
type Group = { name: string; src: LabSrc };

const IDLE: RuntimeStatus = { phase: "idle" };
const noop = () => () => {};

function useRuntimeStatus(fam: LabFamily): RuntimeStatus {
  return useSyncExternalStore(
    (cb) => getRunner(fam).onStatus(cb),
    () => getRunner(fam).status,
    () => IDLE
  );
}

const isFollow = (g: string) => g.startsWith("followup");
/** every test except follow-up tests passed (and there was at least one) */
const basePassed = (r: HarnessResult | null) => !!r && !r.setup && r.tests.some((t) => !isFollow(t.group)) && r.tests.filter((t) => !isFollow(t.group)).every((t) => t.ok);
const groupPassed = (r: HarnessResult | null, g: string) => !!r && !r.setup && r.tests.some((t) => t.group === g) && r.tests.filter((t) => t.group === g).every((t) => t.ok);

const withDelta = (code: string, delta: string) => (delta.trim() ? `${code.replace(/\s+$/, "")}\n\n${delta.replace(/\s+$/, "")}\n` : code);

export default function LabRoom({ lab, next, prev }: { lab: Lab; next: { href: string; title: string } | null; prev: { href: string; title: string } | null }) {
  const { awardOnce, done, hydrated } = useGame();
  const progress = useLabProgress()[lab.id];
  const ivRecord = useInterviews()[lab.id];
  const live = ivRecord?.live ?? null;
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const [lang, setLang] = useState<LabLang>(lab.languages[0]);
  const L = lab.langs[lang]!;
  const fam = familyOf(lang);
  const status = useRuntimeStatus(fam);
  const slot = live ? `${lab.id}~iv` : lab.id;
  const projectStages = lab.stages.length;
  const unlocked = projectStages ? Math.min(progress?.stage ?? 0, projectStages - 1) : 0;

  const editor = useRef<CodeEditorHandle>(null);
  const code = useRef<string>(L.starter);
  const saveTimer = useRef<number | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [font, setFont] = useState(14);
  const [suggest, setSuggest] = useState(true);
  const [tab, setTab] = useState<Tab>("brief");
  const [stageView, setStageView] = useState<number | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("tests");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [chaosRun, setChaosRun] = useState<ChaosRun | null>(null);
  const [scaleRun, setScaleRun] = useState<ScaleRunState | null>(null);
  const [output, setOutput] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [storyShown, setStoryShown] = useState(false);
  const [fuOn, setFuOn] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<null | "reveal" | "reset" | "load" | "interview" | "end">(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [summary, setSummary] = useState<InterviewResult | null>(null);

  const cleared = (hydrated && !!done[labKey(lab.id)]) || !!progress?.passedAt;
  const runs = progress?.runs ?? 0;
  const failedRuns = progress?.failedRuns ?? 0;
  const solutionUnlocked = cleared || failedRuns >= REVEAL_AFTER_RUNS || !!progress?.revealedAt;
  const ivPassed = (hydrated && !!done[labInterviewKey(lab.id)]) || !!ivRecord?.best?.passed;

  /** The code a language opens with when nothing is saved: the starter plus every unlocked stage's delta. */
  const fresh = useCallback(
    (l: LabLang) => {
      const v = lab.langs[l]!;
      let c = v.starter;
      for (let k = 1; k <= unlocked; k++) c = withDelta(c, v.stages[k]?.delta ?? "");
      return c;
    },
    [lab.langs, unlocked]
  );

  /** This browser's copy of a language's code (with any newly unlocked stage deltas appended once). */
  const codeFor = useCallback(
    (l: LabLang, codeSlot: string) => {
      const saved = loadCode(codeSlot, l);
      if (!saved) {
        if (projectStages) updateLab(lab.id, (p) => ({ ...p, deltas: { ...p.deltas, [l]: unlocked } }));
        return { code: fresh(l), stale: false };
      }
      let c = saved.code;
      if (projectStages && codeSlot === lab.id) {
        const applied = progress?.deltas?.[l] ?? 0;
        if (applied < unlocked) {
          for (let k = applied + 1; k <= unlocked; k++) c = withDelta(c, lab.langs[l]!.stages[k]?.delta ?? "");
          saveCode(codeSlot, c, lab.version, l);
          updateLab(lab.id, (p) => ({ ...p, deltas: { ...p.deltas, [l]: unlocked } }));
        }
      }
      return { code: c, stale: saved.version !== lab.version && saved.code !== lab.langs[l]!.starter };
    },
    [fresh, lab.id, lab.langs, lab.version, progress?.deltas, projectStages, unlocked]
  );

  // first load: the language the reader last used (when this lab has it), their code, the font size
  const firstLoad = useRef(false);
  useEffect(() => {
    if (firstLoad.current) return;
    const t = window.setTimeout(() => {
      firstLoad.current = true;
      const pref = loadLang();
      const l = pref && lab.langs[pref] ? pref : lab.languages[0];
      const c = codeFor(l, slot);
      setLang(l);
      code.current = c.code;
      setInitial(c.code);
      setStale(c.stale);
      setFont(loadFont());
      setSuggest(loadSuggest());
    }, 0);
    return () => window.clearTimeout(t);
  }, [codeFor, lab.langs, lab.languages, slot]);
  useEffect(() => retainRunner(), []);

  // seconds counter while a runtime downloads, so a slow first load doesn't look stuck
  useEffect(() => {
    if (status.phase !== "loading") return;
    const since = status.since;
    const iv = window.setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 500);
    return () => window.clearInterval(iv);
  }, [status]);

  // the interview clock
  useEffect(() => {
    if (!live) return;
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [live]);

  // where the editor's code is saved: refs, because replacing the code (a language or mode switch) fires the
  // editor's change event before React re-renders with the new language
  const target = useRef({ slot, lang });
  useEffect(() => {
    target.current = { slot, lang };
  }, [slot, lang]);
  const onChange = useCallback(
    (v: string) => {
      code.current = v;
      const t = target.current;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveCode(t.slot, v, lab.version, t.lang), 400);
    },
    [lab.version]
  );
  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      saveCode(target.current.slot, code.current, lab.version, target.current.lang);
    }
  }, [lab.version]);
  useEffect(() => {
    window.addEventListener("pagehide", flushSave);
    return () => {
      flushSave();
      window.removeEventListener("pagehide", flushSave);
    };
  }, [flushSave]);

  /** Put new code in the editor (a language switch, a mode switch, a stage unlock), saved under `to`. */
  const replaceCode = (c: string, to: { slot: string; lang: LabLang } = target.current) => {
    target.current = to;
    code.current = c;
    editor.current?.setValue(c);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
  };

  const switchLang = (l: LabLang) => {
    if (l === lang || running) return;
    flushSave();
    const c = codeFor(l, slot);
    setLang(l);
    saveLang(l);
    setStale(c.stale);
    setRun(null);
    setChaosRun(null);
    setScaleRun(null);
    setOutput("");
    replaceCode(c.code, { slot, lang: l });
    track("lab_lang", { lab: lab.id, lang: l });
  };

  // ------------------------------------------------------------------ what a run runs
  const groups = useMemo((): Group[] => {
    const out: Group[] = [];
    if (projectStages) {
      for (let k = 0; k <= unlocked; k++) {
        const s = L.stages[k];
        if (s?.visible) out.push({ name: `stage${k + 1}`, src: s.visible });
        if (s?.hidden) out.push({ name: `stage${k + 1}h`, src: s.hidden });
      }
    } else {
      if (L.repro) out.push({ name: "repro", src: L.repro });
      if (L.visible) out.push({ name: "visible", src: L.visible });
      if (L.hidden) out.push({ name: "hidden", src: L.hidden });
    }
    const fus = live ? (live.baseMs != null && live.followIdx < lab.followUps.length ? [live.followIdx] : []) : fuOn;
    for (const i of fus) {
      const t = L.followUps[i]?.tests;
      if (t) out.push({ name: `followup${i + 1}`, src: t });
    }
    return out;
  }, [L, projectStages, unlocked, live, fuOn, lab.followUps.length]);

  const groupTitle = useCallback(
    (g: string) => {
      if (g === "visible") return lab.type === "incident" ? "Still works" : "Example tests";
      if (g === "hidden") return "Hidden tests";
      if (g === "repro") return "Reproduces the incident";
      let m = g.match(/^stage(\d+)(h?)$/);
      if (m) return `Stage ${m[1]}${m[2] ? " · hidden" : ""} · ${lab.stages[Number(m[1]) - 1]?.title ?? ""}`;
      m = g.match(/^followup(\d+)$/);
      if (m) return `Follow-up · ${lab.followUps[Number(m[1]) - 1]?.title ?? ""}`;
      return g;
    },
    [lab.type, lab.stages, lab.followUps]
  );

  const input = () => ({ code: code.current, ts: lang === "typescript", given: L.given });

  // ------------------------------------------------------------------ interview bookkeeping
  const finishInterview = useCallback(
    (lv: InterviewLive, endAt: number) => {
      const base = { ms: lv.baseMs ?? endAt - lv.startedAt, targetMs: lab.interviewMinutes * 60_000, failedRuns: lv.failedRuns, followUps: lv.followUps };
      const scored = scoreInterview(base);
      const passedBase = lv.baseMs != null;
      const score = passedBase ? scored.score : Math.min(30, Math.round(scored.score * 0.3));
      const result: InterviewResult = {
        at: Date.now(),
        lang: lv.lang,
        // the time to working code (every test passing): what the target is for; follow-ups come after
        ms: passedBase ? base.ms : 0,
        targetMs: base.targetMs,
        runs: lv.runs,
        failedRuns: lv.failedRuns,
        followUps: lv.followUps,
        score,
        grade: passedBase ? scored.grade : "Not finished",
        passed: passedBase && score >= INTERVIEW_PASS_SCORE,
      };
      updateInterview(lab.id, (r) => ({ history: [result, ...(r.history ?? [])].slice(0, 10), best: !r.best || result.score > r.best.score ? result : r.best }));
      if (result.passed) awardOnce(labInterviewKey(lab.id), INTERVIEW_PASS_XP, `Interview pass · ${lab.title}`);
      track("lab_interview", { lab: lab.id, lang: lv.lang, score, passed: result.passed, ms: result.ms, runs: lv.runs });
      setSummary(result);
      // back to the practice copy of the code
      flushSave();
      const c = codeFor(lang, lab.id);
      replaceCode(c.code, { slot: lab.id, lang });
      setRun(null);
    },
    [awardOnce, codeFor, flushSave, lab.id, lab.interviewMinutes, lab.title, lang]
  );

  const startInterview = () => {
    flushSave();
    setSummary(null);
    const lv: InterviewLive = {
      startedAt: Date.now(),
      lang,
      runs: 0,
      failedRuns: 0,
      baseMs: null,
      followIdx: 0,
      followUps: lab.followUps.map((f, i): InterviewFollowUp => ({ title: f.title, tests: !!L.followUps[i]?.tests, passed: false, answered: false, covered: null })),
    };
    clearCode(`${lab.id}~iv`, lang);
    updateInterview(lab.id, (r) => ({ ...r, live: lv }));
    setNow(Date.now());
    setRun(null);
    setOutput("");
    setTab("brief");
    setResultTab("tests");
    replaceCode(fresh(lang), { slot: `${lab.id}~iv`, lang });
    track("lab_interview_start", { lab: lab.id, lang });
  };

  const advanceFollowUp = (patch: Partial<InterviewFollowUp>) => {
    if (!live) return;
    const fu = live.followUps.map((f, i) => (i === live.followIdx ? { ...f, ...patch } : f));
    const lv = { ...live, followUps: fu, followIdx: live.followIdx + 1 };
    if (lv.followIdx >= fu.length) {
      updateInterview(lab.id, (r) => ({ ...r, live: undefined }));
      finishInterview(lv, Date.now());
    } else updateInterview(lab.id, (r) => ({ ...r, live: lv }));
  };

  // ------------------------------------------------------------------ running
  const runTests = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setOutput("");
    setResultTab((t) => (t === "output" ? "tests" : t));
    const t0 = performance.now();
    const runner = getRunner(fam);
    const outcome = await runner.runTests({ ...input(), groups: groups.map((g) => ({ name: g.name, src: g.src.code, ts: g.src.ts })) }, lab.timeoutSec * 1000, (text) => setOutput((o) => (o + text).slice(-60_000)));
    const wallMs = Math.round(performance.now() - t0);
    const result = outcome.kind === "done" ? outcome.result : null;
    const allOk = basePassed(result);
    const finalStage = !projectStages || unlocked >= projectStages - 1;
    const passed = allOk && finalStage;
    let gained: number | null = null;
    let unlockedNow: number | null = null;
    updateLab(lab.id, (p) => ({ ...p, runs: p.runs + 1, failedRuns: p.failedRuns + (allOk ? 0 : 1), ...(passed && !p.passedAt ? { passedAt: Date.now() } : {}) }));
    if (passed) {
      gained = awardOnce(labKey(lab.id), lab.xp, `Lab cleared · ${lab.title}`);
      track("lab_pass", { lab: lab.id, lang, runs: runs + 1, first: gained > 0, assisted: !!progress?.revealedAt, tests: result!.tests.length, ms: result!.ms, interview: !!live });
    }
    // a project's stage passed: unlock the next one and append its starter (not in interview mode: the stage stays put)
    if (allOk && !finalStage && !live) {
      unlockedNow = unlocked + 1;
      const c = withDelta(code.current, L.stages[unlockedNow]?.delta ?? "");
      replaceCode(c);
      saveCode(slot, c, lab.version, lang);
      updateLab(lab.id, (p) => ({ ...p, stage: unlockedNow!, deltas: { ...p.deltas, [lang]: unlockedNow! } }));
      setStageView(null);
      track("lab_stage", { lab: lab.id, lang, stage: unlockedNow + 1 });
    }
    track("lab_run", {
      lab: lab.id,
      lang,
      result: outcome.kind === "timeout" ? "timeout" : outcome.kind === "crash" ? "crash" : result?.setup ? "error" : allOk ? "pass" : "fail",
      passed: result ? result.tests.filter((t) => t.ok).length : 0,
      total: result ? result.tests.length : 0,
      ms: outcome.kind === "done" ? outcome.ms : wallMs,
    });
    if (live) {
      const lv: InterviewLive = { ...live, runs: live.runs + 1, failedRuns: live.failedRuns + (allOk ? 0 : 1) };
      let finished = false;
      if (lv.baseMs == null && allOk && finalStage) {
        lv.baseMs = Date.now() - lv.startedAt;
        if (!lv.followUps.length) finished = true;
      } else if (lv.baseMs != null && allOk && lv.followIdx < lv.followUps.length && lv.followUps[lv.followIdx].tests && groupPassed(result, `followup${lv.followIdx + 1}`)) {
        lv.followUps = lv.followUps.map((f, i) => (i === lv.followIdx ? { ...f, passed: true, answered: true } : f));
        lv.followIdx++;
        if (lv.followIdx >= lv.followUps.length) finished = true;
      }
      updateInterview(lab.id, (r) => ({ ...r, live: finished ? undefined : lv }));
      if (finished) finishInterview(lv, Date.now());
    }
    setRun({ outcome, wallMs, at: Date.now(), gained, unlocked: unlockedNow });
    setRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, fam, groups, lab, lang, L, awardOnce, runs, progress?.revealedAt, live, projectStages, unlocked, slot, finishInterview]);

  const runChaos = async (opts: { seed?: number; test?: string }) => {
    if (running || !lab.chaos || !L.chaos) return;
    setRunning(true);
    const outcome = await getRunner(fam).runChaos(input(), L.chaos, { scenarios: lab.chaos.scenarios, runs: lab.chaos.runs, seed: opts.seed ?? null, test: opts.test ?? null }, 45_000);
    setChaosRun({ outcome, replay: opts.seed != null ? { seed: opts.seed, test: opts.test ?? "" } : null, at: Date.now() });
    const ok = outcome.kind === "done" && !outcome.result.setup && outcome.result.chaos.every((c) => c.ok);
    if (ok && opts.seed == null) updateLab(lab.id, (p) => ({ ...p, chaosAt: Date.now() }));
    track("lab_chaos", { lab: lab.id, lang, ok, replay: opts.seed != null });
    setRunning(false);
  };

  const runScale = async () => {
    if (running || !lab.scale || !L.scale) return;
    setRunning(true);
    const limit = Math.min(120_000, lab.scale.budgetSec * 1000 * lab.scale.sizes.length * 3 + 20_000);
    const outcome = await getRunner(fam).runScale(input(), L.scale, { sizes: lab.scale.sizes, budgetMs: lab.scale.budgetSec * 1000 }, limit);
    setScaleRun({ outcome, at: Date.now() });
    track("lab_scale", { lab: lab.id, lang, kind: outcome.kind });
    setRunning(false);
  };

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
    replaceCode(live ? L.starter : fresh(lang));
    clearCode(slot, lang);
    setStale(false);
  };

  const loadSolution = () => {
    const s = projectStages ? L.stages[unlocked]?.solution || L.solution : L.solution;
    replaceCode(s);
    onChange(s);
    setEditorOpen(true);
  };

  const bumpFont = (d: number) => {
    const i = FONT_SIZES.indexOf(font);
    const n = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 2 : i) + d))];
    setFont(n);
    saveFont(n);
  };

  const result = run?.outcome.kind === "done" ? run.outcome.result : null;
  const passedAll = basePassed(result) && (!projectStages || unlocked >= projectStages - 1 || run?.unlocked != null);
  const shownStage = stageView ?? unlocked;
  const fileName = LANG_FILE[lang];
  const testCount = projectStages ? L.stages.slice(0, unlocked + 1).reduce((a, s) => a + s.tests.visible, 0) : L.tests.visible + L.tests.repro;
  const hiddenCount = projectStages ? L.stages.slice(0, unlocked + 1).reduce((a, s) => a + s.tests.hidden, 0) : L.tests.hidden;

  const tabs: { id: Tab; label: string }[] = [
    { id: "brief", label: lab.incident ? "Incident" : "Brief" },
    ...(projectStages ? [{ id: "stages" as const, label: `Stages · ${unlocked + 1}/${projectStages}` }] : []),
    { id: "tests", label: `Tests · ${testCount}` },
    ...(L.given?.code.trim() ? [{ id: "given" as const, label: "Given code" }] : []),
    ...(!live && (lab.hints.length || (projectStages && lab.stages[shownStage]?.hints.length)) ? [{ id: "hints" as const, label: `Hints · ${lab.hints.length + (projectStages ? lab.stages[shownStage]?.hints.length ?? 0 : 0)}` }] : []),
    ...(!live && lab.followUps.length ? [{ id: "followups" as const, label: `Follow-ups · ${lab.followUps.length}` }] : []),
    ...(lab.incident ? [{ id: "story" as const, label: "War story" }] : []),
    ...(!live ? [{ id: "solution" as const, label: "Solution" }] : []),
  ];
  const activeTab: Tab = tabs.some((t) => t.id === tab) ? tab : "brief";
  const resultTabs: { id: ResultTab; label: string }[] = [
    { id: "tests", label: "Tests" },
    ...(lab.viz ? [{ id: "viz" as const, label: "Visualiser" }] : []),
    ...(lab.chaos && L.chaos ? [{ id: "chaos" as const, label: "Chaos" }] : []),
    ...(lab.scale && L.scale ? [{ id: "scale" as const, label: "Scale" }] : []),
    { id: "output", label: `Output${output ? " ·" : ""}` },
  ];
  const fuIdx = live && live.baseMs != null && live.followIdx < lab.followUps.length ? live.followIdx : null;
  const stageHints = projectStages ? lab.stages[shownStage]?.hints ?? [] : [];
  const allHints = [...lab.hints, ...stageHints];

  return (
    <main className="mx-auto flex max-w-[1480px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-10 lg:pb-16" data-hk-lab={lab.id} data-hk-lab-mode={live ? "interview" : "practice"}>
      {live && <InterviewBar live={live} now={now} targetMs={lab.interviewMinutes * 60_000} followTotal={lab.followUps.length} onEnd={() => setConfirm("end")} />}
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-fg-3">
          <Link href="/" className="hover:text-fg">
            Learn
          </Link>
          <span aria-hidden>/</span>
          <Link href="/labs" className="hover:text-fg">
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
              {lab.type === "lab" ? "Code lab" : TYPE_LABEL[lab.type]} · World {lab.weekCode} · {lab.worldTitle}
            </span>
            <h1 className="break-words font-display text-[clamp(34px,5vw,64px)] font-extrabold leading-[0.95] tracking-tightest text-fg">
              {lab.title}
              <span className="text-signal-text">.</span>
            </h1>
            {lab.summary && <p className="max-w-[760px] text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">{lab.summary}</p>}
            <div className="flex flex-wrap gap-1.5 font-mono text-[12px]">
              <span className="border border-line bg-bg px-3 py-2 text-fg">{DIFFICULTY_LABEL[lab.difficulty]}</span>
              <span className="border border-line bg-bg px-3 py-2 text-fg-2">~{lab.minutes} min</span>
              {projectStages > 0 && <span className="border border-line bg-bg px-3 py-2 text-fg-2">{projectStages} stages</span>}
              <span className="border border-line bg-bg px-3 py-2 text-fg-2">
                {testCount} example + {hiddenCount} hidden tests
              </span>
              <span className="border border-line bg-bg px-3 py-2 text-fg-2">{lab.languages.map((l) => LANG_SHORT[l]).join(" · ")}</span>
              <span className={`border bg-bg px-3 py-2 ${cleared ? "border-line text-fg" : "border-signal text-signal-text"}`}>{cleared ? "Cleared ✓" : `+${lab.xp} XP`}</span>
              {ivPassed && <span className="border border-ok bg-bg px-3 py-2 text-ok-text">Interview pass ✓{ivRecord?.best ? ` ${ivRecord.best.score}` : ""}</span>}
              <a href="#lab-code" className="border border-line-strong bg-bg px-3 py-2 text-fg lg:hidden">
                Jump to the code ↓
              </a>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            {!live && (
              <button type="button" onClick={() => setConfirm("interview")} className="inline-flex min-h-11 items-center gap-2 border border-signal px-4 text-sm font-semibold text-fg hover:bg-[color-mix(in_srgb,var(--c-signal)_10%,transparent)]" data-hk-interview-start="">
                <Timer className="h-4 w-4 text-signal-text" aria-hidden /> Interview mode · {lab.interviewMinutes} min
              </button>
            )}
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

      {summary && (
        <InterviewSummary
          r={summary}
          best={ivRecord?.best}
          onClose={() => setSummary(null)}
          onAgain={() => {
            setSummary(null);
            setConfirm("interview");
          }}
        />
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ------------------------------------------------------------ left: the brief */}
        <section aria-label="Lab brief" className="flex min-w-0 flex-col border border-line-strong bg-surface">
          <div role="tablist" aria-label="Lab sections" className="flex overflow-x-auto border-b border-line [scrollbar-width:none]">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={activeTab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 font-mono text-xs uppercase tracking-[0.06em] ${activeTab === t.id ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 p-4 sm:p-5">
            {activeTab === "brief" && (
              <div className="flex flex-col gap-4">
                {lab.incident && <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: lab.incident.reportHtml }} />}
                {lab.briefHtml && <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: lab.briefHtml }} />}
                {projectStages > 0 && <StageBrief lab={lab} index={unlocked} />}
                {lang !== "python" && (
                  <p className="m-0 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-fg-3">
                    In {LANG_LABEL[lang]}, tests use <code>test(&quot;…&quot;, () =&gt; …)</code> and <code>assert(…)</code> / <code>assert.equal(actual, expected)</code>.
                    {lang === "typescript" ? " TypeScript is transpiled in the browser (types are stripped, not checked), so a type error won't fail a run: a wrong value will." : ""}
                  </p>
                )}
              </div>
            )}
            {activeTab === "stages" && (
              <div className="flex flex-col gap-3">
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Stages">
                  {lab.stages.map((s, k) => {
                    const done_ = k < unlocked || (k === unlocked && cleared);
                    const locked = k > unlocked;
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => setStageView(k)}
                          aria-current={shownStage === k ? "step" : undefined}
                          className={`flex w-full min-w-0 items-center gap-3 border px-3 py-2.5 text-left ${shownStage === k ? "border-signal bg-[color-mix(in_srgb,var(--c-signal)_8%,transparent)]" : "border-line"} ${locked ? "opacity-55" : "hover:border-fg-3"}`}
                        >
                          <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center font-mono text-[12px] ${done_ ? "bg-ok text-on-ok" : locked ? "bg-line-strong text-fg-3" : "bg-signal text-on-signal"}`}>
                            {done_ ? <Check className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3" /> : k + 1}
                          </span>
                          <span className="min-w-0 flex-1 text-sm text-fg">{s.title}</span>
                          <span className="shrink-0 font-mono text-[11px] text-fg-3">{done_ ? "passed" : locked ? "locked" : "current"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <StageBrief lab={lab} index={shownStage} />
                <p className="m-0 text-[13px] leading-relaxed text-fg-3">Each run checks every stage so far, so earlier stages must keep passing. Passing the current stage unlocks the next and adds its starter (what to build next) to the end of your code.</p>
              </div>
            )}
            {activeTab === "tests" && (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm leading-relaxed text-fg-2">
                  {lab.incident
                    ? "The repro tests reproduce the incident and fail on the broken code. The other example tests check what already works, so your fix must keep them passing. "
                    : "The example tests below run on every Run, "}
                  then {hiddenCount} hidden tests for the edge cases. Hidden tests are listed after your first run. They ship with this page, so they aren&apos;t secret: they&apos;re for practice, not grading.
                </p>
                {lab.incident && L.reproHtml && <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: L.reproHtml }} />}
                {projectStages ? (
                  L.stages.slice(0, unlocked + 1).map((s, k) => (
                    <div key={k} className="flex flex-col gap-1.5">
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Stage {k + 1} · {lab.stages[k].title}</span>
                      <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: s.visibleTestsHtml }} />
                    </div>
                  ))
                ) : (
                  <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: L.visibleTestsHtml }} />
                )}
              </div>
            )}
            {activeTab === "given" && (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm leading-relaxed text-fg-2">This code runs before yours on every run, so your code and the tests can use these names. It&apos;s read-only.</p>
                <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: L.givenHtml }} />
              </div>
            )}
            {activeTab === "hints" && (
              <div className="flex flex-col gap-3">
                {allHints.slice(0, hintsShown).map((h, i) => (
                  <div key={i} className="border border-line bg-raised p-4">
                    <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                      Hint {i + 1} · {h.title}
                    </span>
                    <div className="course-content mt-2 max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: h.html }} />
                  </div>
                ))}
                {hintsShown < allHints.length ? (
                  <button type="button" onClick={() => setHintsShown((n) => n + 1)} className="inline-flex min-h-11 items-center gap-2 self-start border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
                    <Lightbulb className="h-4 w-4 text-signal-text" aria-hidden />
                    {hintsShown ? `Show hint ${hintsShown + 1} of ${allHints.length}` : `Show the first hint (${allHints.length} in all)`}
                  </button>
                ) : (
                  <span className="text-sm text-fg-3">That&apos;s every hint. Still stuck? The solution tab has a worked answer.</span>
                )}
              </div>
            )}
            {activeTab === "followups" && (
              <div className="flex flex-col gap-4">
                <p className="m-0 text-sm leading-relaxed text-fg-2">What an interviewer asks once your code works. Some come with tests: switch them on to run them with the lab&apos;s own. Interview mode asks them one at a time, against the clock.</p>
                {lab.followUps.map((f, i) => {
                  const t = L.followUps[i];
                  const on = fuOn.includes(i);
                  return (
                    <div key={i} className="flex min-w-0 flex-col gap-2 border border-line p-3.5">
                      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">follow-up {i + 1}</span>
                      <span className="font-display text-[19px] font-bold leading-tight text-fg">{f.title}</span>
                      <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: f.promptHtml }} />
                      {t?.tests && (
                        <label className="inline-flex min-h-10 items-center gap-2 self-start text-sm text-fg">
                          <input type="checkbox" checked={on} onChange={() => setFuOn((x) => (on ? x.filter((k) => k !== i) : [...x, i]))} className="h-4 w-4 accent-[var(--c-signal)]" />
                          Run its {t.count} test{t.count === 1 ? "" : "s"} with mine
                        </label>
                      )}
                      {f.answerHtml && (
                        <details className="text-sm">
                          <summary className="cursor-pointer font-mono text-xs text-fg-3 hover:text-fg">What a strong answer covers</summary>
                          <div className="course-content mt-2 max-w-none text-[14.5px]" dangerouslySetInnerHTML={{ __html: f.answerHtml }} />
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {activeTab === "story" && lab.incident && (
              <div className="flex flex-col gap-3">
                {storyShown || cleared ? (
                  <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: lab.incident.storyHtml }} />
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p className="m-0 text-sm leading-relaxed text-fg-2">The real incident this lab comes from. It names the root cause, so it opens by itself once you&apos;ve fixed the code.</p>
                    <button type="button" onClick={() => setStoryShown(true)} className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
                      <Eye className="h-4 w-4" aria-hidden /> Read it now
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === "solution" &&
              (showSolution ? (
                <div className="flex flex-col gap-3">
                  <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: L.solutionHtml }} />
                  {lab.solutionNotesHtml && <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: lab.solutionNotesHtml }} />}
                  <button type="button" onClick={() => setConfirm("load")} className="inline-flex min-h-11 items-center gap-2 self-start border border-line-strong px-3.5 font-mono text-xs text-fg hover:border-fg-3">
                    Load the {projectStages && unlocked < projectStages - 1 ? `stage ${unlocked + 1} ` : ""}solution into the editor
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
                  <button type="button" onClick={() => (solutionUnlocked ? reveal() : setConfirm("reveal"))} className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3">
                    <Eye className="h-4 w-4" aria-hidden /> Show the solution
                  </button>
                </div>
              ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ right: editor + results */}
        <section id="lab-code" aria-label="Code and tests" className={`flex min-w-0 scroll-mt-[calc(var(--hk-header-h,61px)+12px)] flex-col gap-3 ${live ? "" : "lg:sticky lg:top-[calc(var(--hk-header-h,61px)+16px)]"}`}>
          {fuIdx != null && (
            <FollowUpCard
              key={fuIdx}
              index={fuIdx}
              total={lab.followUps.length}
              title={lab.followUps[fuIdx].title}
              promptHtml={lab.followUps[fuIdx].promptHtml}
              answerHtml={lab.followUps[fuIdx].answerHtml}
              hasTests={!!L.followUps[fuIdx]?.tests}
              testsCount={L.followUps[fuIdx]?.count ?? 0}
              onAnswered={(covered, answered) => advanceFollowUp({ covered, answered })}
              onSkip={() => advanceFollowUp({})}
            />
          )}
          <div className="flex flex-col border border-line-strong bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-2 sm:px-3">
              <button type="button" onClick={() => setEditorOpen((o) => !o)} aria-expanded={editorOpen} className="inline-flex min-h-10 items-center gap-1.5 px-1.5 font-mono text-xs text-fg lg:pointer-events-none">
                <ChevronDown className={`h-4 w-4 transition-transform lg:hidden ${editorOpen ? "" : "-rotate-90"}`} aria-hidden />
                {fileName}
              </button>
              {lab.languages.length > 1 && (
                <div role="radiogroup" aria-label="Language" className="flex border border-line" data-hk-lang-switch="">
                  {lab.languages.map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={lang === l}
                      disabled={running || (!!live && l !== live.lang)}
                      onClick={() => switchLang(l)}
                      title={live && l !== live.lang ? "The language is fixed for this interview" : LANG_LABEL[l]}
                      className={`min-h-9 px-2.5 font-mono text-[11px] ${lang === l ? "bg-fg text-bg" : "text-fg-3 hover:text-fg disabled:opacity-40"}`}
                    >
                      {LANG_SHORT[l]}
                    </button>
                  ))}
                </div>
              )}
              <RuntimeBadge status={status} elapsed={elapsed} lang={lang} />
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
                {!live && (
                  <button
                    type="button"
                    onClick={() => {
                      setSuggest(!suggest);
                      saveSuggest(!suggest);
                    }}
                    aria-pressed={suggest}
                    aria-label="Code suggestions"
                    title={suggest ? "Suggestions on (turn off)" : "Suggestions off (turn on)"}
                    className={`grid h-10 w-10 place-items-center ${suggest ? "text-signal-text" : "text-fg-3 hover:text-fg"}`}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </button>
                )}
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
                <Editor handle={editor} initial={initial} fontSize={font} language={lang} suggestions={suggest && !live} label={`${lab.title}: your ${LANG_LABEL[lang]} code`} onChange={onChange} onRun={() => void runTests()} onFocus={() => void getRunner(fam).warm()} />
              ) : (
                <EditorPlaceholder text="Loading the editor…" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5">
              <button type="button" onClick={() => void runTests()} disabled={running} className="inline-flex min-h-11 items-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-70" data-hk-run="">
                {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {running ? (status.phase === "loading" ? `Loading ${fam === "py" ? "Python" : "JavaScript"}…` : "Running…") : projectStages ? `Run stage ${unlocked + 1}` : "Run tests"}
              </button>
              <span className="hidden font-mono text-[11px] text-fg-3 sm:inline">⌘/Ctrl + Enter</span>
              <span className="ml-auto font-mono text-[11px] text-fg-3">
                {runs ? `${runs} run${runs === 1 ? "" : "s"}` : "not run yet"} · {lab.timeoutSec} s limit
              </span>
            </div>
          </div>

          <div className="flex flex-col border border-line-strong bg-surface" aria-live="polite" aria-busy={running}>
            <div className="flex overflow-x-auto border-b border-line [scrollbar-width:none]" role="tablist" aria-label="Results">
              {resultTabs.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="tab"
                  onClick={() => setResultTab(k.id)}
                  aria-selected={resultTab === k.id}
                  className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3.5 font-mono text-xs uppercase tracking-[0.06em] ${resultTab === k.id ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
                >
                  {k.label}
                </button>
              ))}
              <span className="ml-auto hidden shrink-0 items-center pr-3 font-mono text-[11px] text-fg-3 sm:flex">
                {running ? "running…" : result?.setup ? "no tests ran" : result ? `${result.tests.filter((t) => t.ok).length}/${result.tests.length} passed · ${result.ms} ms` : run ? "" : "press Run tests"}
              </span>
            </div>
            {resultTab === "output" && (
              <pre className="m-0 max-h-[340px] min-h-[120px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12.5px] leading-relaxed text-fg-2">
                {output || (running ? "…" : `Nothing printed. ${lang === "python" ? "print()" : "console.log()"} output from your code shows up here.`)}
              </pre>
            )}
            {resultTab === "tests" && (
              <TestsPanel
                lab={lab}
                run={run}
                running={running}
                passedAll={passedAll}
                cleared={cleared}
                next={next}
                groupTitle={groupTitle}
                fileName={fileName}
                testCount={testCount}
                hiddenCount={hiddenCount}
                interview={!!live}
                onLine={(line) => {
                  setEditorOpen(true);
                  editor.current?.goToLine(line);
                }}
              />
            )}
            {resultTab === "viz" && lab.viz && (
              <div className="max-h-[min(640px,75vh)] overflow-y-auto overflow-x-hidden">
                <LabViz spec={lab.viz} result={result} />
              </div>
            )}
            {resultTab === "chaos" && lab.chaos && (
              <div className="max-h-[min(720px,80vh)] overflow-y-auto overflow-x-hidden">
                <LabChaos
                  spec={lab.chaos}
                  run={chaosRun}
                  running={running}
                  onRun={(o) => void runChaos(o)}
                  file={fileName}
                  onLine={(line) => {
                    setEditorOpen(true);
                    editor.current?.goToLine(line);
                  }}
                />
              </div>
            )}
            {resultTab === "scale" && lab.scale && (
              <div className="max-h-[min(720px,80vh)] overflow-y-auto overflow-x-hidden">
                <LabScale spec={lab.scale} run={scaleRun} running={running} onRun={() => void runScale()} />
              </div>
            )}
          </div>
          {!live && <LabTutor labId={lab.id} lang={lang} stage={projectStages ? unlocked : null} getCode={() => code.current} result={result} passed={passedAll} failedRuns={failedRuns} />}
          {!live && <LabReview key={lang} labId={lab.id} lang={lang} stage={projectStages ? unlocked : null} getCode={() => code.current} passed={passedAll} />}
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
      <ConfirmDialog
        isOpen={confirm === "interview"}
        title={`Start a ${lab.interviewMinutes}-minute interview?`}
        message={`You start from the starter code in ${LANG_LABEL[lang]} (your practice code is kept and comes back after). The clock runs, hints, the solution and the AI tutor are off. Once every test passes, the interviewer asks ${lab.followUps.length ? `${lab.followUps.length} follow-up${lab.followUps.length === 1 ? "" : "s"}` : "nothing more"}, and you get a score out of 100.`}
        confirmText="Start the clock"
        cancelText="Not now"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          startInterview();
        }}
      />
      <ConfirmDialog
        isOpen={confirm === "end"}
        title="End the interview now?"
        message={live?.baseMs != null ? "Your tests passed, so you'll be scored on what you've done; follow-ups you haven't reached score nothing." : "Your tests haven't all passed yet, so this counts as not finished."}
        confirmText="End it"
        cancelText="Keep going"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          if (!live) return;
          updateInterview(lab.id, (r) => ({ ...r, live: undefined }));
          finishInterview(live, Date.now());
        }}
      />
    </main>
  );
}

function StageBrief({ lab, index }: { lab: Lab; index: number }) {
  const s = lab.stages[index];
  if (!s) return null;
  return (
    <div className="flex flex-col gap-2 border-l-2 border-signal pl-3.5">
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
        Stage {index + 1} of {lab.stages.length} · {s.title}
      </span>
      <div className="course-content max-w-none text-[15px]" dangerouslySetInnerHTML={{ __html: s.briefHtml }} />
    </div>
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

function RuntimeBadge({ status, elapsed, lang }: { status: RuntimeStatus; elapsed: number; lang: LabLang }) {
  let text: string;
  let tone = "text-fg-3";
  const py = lang === "python";
  const name = LANG_LABEL[lang];
  switch (status.phase) {
    case "idle":
      text = py ? `Python ${PYTHON_VERSION} loads on first run (${RUNTIME_DOWNLOAD_LABEL} once)` : `${name} runs in a sandboxed worker${lang === "typescript" ? " (types stripped, not checked)" : ""}`;
      break;
    case "loading":
      text = status.restart ? `Restarting ${py ? "Python" : name}…` : `Loading ${py ? `Python ${PYTHON_VERSION}` : name}… ${elapsed ? `${elapsed}s` : ""}`;
      tone = "text-signal-text";
      break;
    case "ready":
      text = py ? `Python ${status.python} ready · loaded in ${(status.loadMs / 1000).toFixed(1)} s` : `${name} ready${lang === "typescript" ? " · types stripped, not checked" : ""}`;
      tone = "text-fg-2";
      break;
    case "failed":
      text = status.message;
      tone = "text-bad-text";
      break;
  }
  return (
    <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${tone}`} title={text} aria-live="polite">
      {status.phase === "ready" && <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 bg-ok align-middle" />}
      {text}
    </span>
  );
}

function ErrorBody({ e, onLine, hidden, fileName }: { e: HarnessError; onLine: (line: number) => void; hidden?: boolean; fileName: string }) {
  const mine = (e.frames ?? []).filter((f) => f.file.startsWith("solution."));
  const synLine = (e.kind === "SyntaxError" || e.kind === "IndentationError" || e.kind === "ImportError") && (!e.file || e.file.startsWith("solution.")) ? e.line : null;
  return (
    <div className="flex flex-col gap-1.5">
      <pre className="m-0 whitespace-pre-wrap break-words bg-raised p-2.5 font-mono text-[12.5px] leading-relaxed text-fg">
        <span className="text-bad-text">{e.kind}</span>
        {e.message ? `: ${e.message}` : ""}
      </pre>
      {e.code && e.kind === "AssertionError" && (
        <span className="break-words font-mono text-[11.5px] text-fg-3">
          {hidden ? "hidden test" : "test"} line {e.line}: <span className="text-fg-2">{e.code}</span>
        </span>
      )}
      {synLine && (
        <button type="button" onClick={() => onLine(synLine)} className="self-start font-mono text-[11.5px] text-signal-text underline decoration-line-strong underline-offset-4">
          {fileName} line {synLine} →
        </button>
      )}
      {mine.map((f, i) => (
        <button key={i} type="button" onClick={() => onLine(f.line)} className="self-start break-words text-left font-mono text-[11.5px] text-fg-2 hover:text-fg">
          <span className="text-signal-text underline decoration-line-strong underline-offset-4">
            {fileName} line {f.line}
          </span>{" "}
          in {f.fn}
          {f.code ? <span className="text-fg-3">: {f.code}</span> : null}
        </button>
      ))}
    </div>
  );
}

function TestRow({ t, onLine, fileName }: { t: HarnessTest; onLine: (line: number) => void; fileName: string }) {
  return (
    <li className="flex flex-col gap-2 border-b border-line px-3 py-2.5 last:border-b-0">
      <span className="flex items-start gap-2.5">
        <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center ${t.ok ? "bg-ok text-on-ok" : "bg-bad text-on-bad"}`}>
          {t.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1 break-words text-sm leading-snug text-fg">
          <span className="sr-only">{t.ok ? "Passed: " : "Failed: "}</span>
          {t.title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-fg-4">{t.ms < 1 ? "<1" : Math.round(t.ms)} ms</span>
      </span>
      {!t.ok && t.error && (
        <div className="min-w-0 pl-[30px]">
          <ErrorBody e={t.error} onLine={onLine} hidden={t.group === "hidden" || /h$/.test(t.group)} fileName={fileName} />
        </div>
      )}
    </li>
  );
}

function TestsPanel({
  lab,
  run,
  running,
  passedAll,
  cleared,
  next,
  groupTitle,
  fileName,
  testCount,
  hiddenCount,
  interview,
  onLine,
}: {
  lab: Lab;
  run: Run | null;
  running: boolean;
  passedAll: boolean;
  cleared: boolean;
  next: { href: string; title: string } | null;
  groupTitle: (g: string) => string;
  fileName: string;
  testCount: number;
  hiddenCount: number;
  interview: boolean;
  onLine: (line: number) => void;
}) {
  const result = run?.outcome.kind === "done" ? run.outcome.result : null;
  const order: string[] = [];
  for (const t of result?.tests ?? []) if (!order.includes(t.group)) order.push(t.group);
  const total = result?.tests.length ?? 0;
  return (
    <div className="flex max-h-[min(520px,60vh)] flex-col overflow-auto">
      {run?.unlocked != null && (
        <div className="flex flex-col gap-1 border-b border-signal bg-[color-mix(in_srgb,var(--c-signal)_10%,transparent)] px-4 py-3">
          <span className="font-display text-[20px] font-bold leading-tight text-fg">
            Stage {run.unlocked} passed · stage {run.unlocked + 1} unlocked
          </span>
          <span className="text-sm text-fg-2">
            &ldquo;{lab.stages[run.unlocked].title}&rdquo;: its brief is on the left, and its starter was added at the end of your code. Your code carries forward.
          </span>
        </div>
      )}
      {passedAll && run && run.unlocked == null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-signal bg-[color-mix(in_srgb,var(--c-signal)_10%,transparent)] px-4 py-3">
          <span className="flex flex-col">
            <span className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">All {total} tests passed</span>
            <span className="text-sm text-fg-2">
              {run.gained ? `Lab cleared · +${run.gained} XP.` : cleared ? "Cleared · you already earned this lab's XP." : "Cleared."}{" "}
              {interview ? "The interviewer has a follow-up." : lab.incident ? "Incident fixed. Read the war story, then explain the root cause out loud." : "Now explain your design out loud, the way you would in the interview."}
            </span>
          </span>
          {next && !interview && (
            <Link href={next.href} className="ml-auto inline-flex min-h-11 items-center bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110">
              Next lab · {next.title} →
            </Link>
          )}
        </div>
      )}
      {!run && !running && (
        <p className="m-0 p-4 text-sm leading-relaxed text-fg-3">
          Write your code, then run {testCount} example tests and {hiddenCount} hidden tests. Each run is limited to {lab.timeoutSec} seconds: an infinite loop gets stopped and the runtime restarts, your code stays.
        </p>
      )}
      {running && !run && <p className="m-0 p-4 font-mono text-xs text-fg-3">Running…</p>}
      {run?.outcome.kind === "timeout" && (
        <div className="flex flex-col gap-1.5 border-b border-line p-4">
          <span className="font-semibold text-bad-text">Stopped after {Math.round(run.outcome.limitMs / 1000)} s</span>
          <span className="text-sm leading-relaxed text-fg-2">
            Your code was still running: most likely an infinite loop (a <code>while</code> whose condition never changes) or recursion without a base case. The runtime was restarted; your code is untouched. Anything it printed is in Output.
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
          <ErrorBody e={result.setup} onLine={onLine} fileName={fileName} />
        </div>
      )}
      {result && !result.setup && order.map((g) => <TestGroup key={g} title={groupTitle(g)} tests={result.tests.filter((t) => t.group === g)} onLine={onLine} fileName={fileName} />)}
    </div>
  );
}

function TestGroup({ title, tests, onLine, fileName }: { title: string; tests: HarnessTest[]; onLine: (line: number) => void; fileName: string }) {
  if (!tests.length) return null;
  return (
    <div className="flex flex-col">
      <span className="border-b border-line bg-raised px-3 py-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
        {title} · {tests.filter((t) => t.ok).length}/{tests.length}
      </span>
      <ul className="m-0 list-none p-0">
        {tests.map((t) => (
          <TestRow key={`${t.group}-${t.name}`} t={t} onLine={onLine} fileName={fileName} />
        ))}
      </ul>
    </div>
  );
}

