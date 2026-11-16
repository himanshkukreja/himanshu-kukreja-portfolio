"use client";

/**
 * One shell for the three kinds of DSA lesson (concept, structure, algorithm). The two readers are thin adapters that
 * build these props; nothing in the lesson HTML changes (highlight offsets, gate markup, Listen sync and the widgets'
 * figures all depend on it being byte-identical). The four steps are views over the lesson's beats:
 *
 *   Learn    Watch (the lecture inline) / Read (one beat at a time, or the whole lesson per the Aa panel) / Listen
 *   Try it   the sandbox and lab beats, traces, the race, the learner's own input (TryPanel)
 *   Practice the lesson's problems in order
 *   Check    the closing beat: quiz, explain it back, the 60-second answer, review cards
 *
 * A generated stylesheet hides every beat outside the shown set (lib/dsa/lesson-steps.ts hideStagesCss, the OneStage
 * mechanism generalised), so the progress engine, highlights, Listen and the hydrators keep working on one DOM.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, List, Sparkles } from "lucide-react";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import LessonContentWrapper from "@/components/LessonContentWrapper";
import SignInGate, { useSignInGate } from "@/components/gate/SignInGate";
import { GATED_CLASS, PEEK_CLASS } from "@/lib/gate/split";
import ContentsSheet from "@/components/learn/lesson/ContentsSheet";
import { FocusControls } from "@/components/learn/lesson/ReadingTools";
import { REVEAL_EVENT, scrollToId } from "@/components/learn/lesson/layout";
import { useReadingSettings } from "@/components/learn/reading/useReading";
import { ReadAloudBar, useReadAloud } from "@/components/ReadAloud";
import { listenKey } from "@/lib/listen/manifest";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { DSA_COURSE_ID, dsaKeys, type ConceptCheckpoint, type DsaStage, type ProblemSummary, type Race, type Trace } from "@/lib/dsa/types";
import { BEAT_PLAIN } from "@/lib/dsa/words";
import { mapHref } from "@/lib/dsa/lesson-stops";
import type { VisualizerSpec } from "@/lib/dsa/viz/registry";
import {
  STEP_ORDER,
  STEP_TITLE,
  groupStages,
  hideStagesCss,
  learnBeats,
  stepOfHash,
  stepOfStage,
  stepSub,
  visibleStages,
  type LessonKind,
  type StepId,
} from "@/lib/dsa/lesson-steps";
import "../dsa.css";
import DsaCrumbs from "../DsaCrumbs";
import Jargon from "../glossary/Jargon";
import { useDsaProgress } from "../progress/useDsaProgress";
import CheckStep, { CheckEnd } from "./CheckStep";
import InlineLecture from "./InlineLecture";
import KeyIdea, { type KeyIdeaData } from "./KeyIdea";
import LearnModes from "./LearnModes";
import LessonAside, { type AsideLink } from "./LessonAside";
import LessonTools from "./LessonTools";
import PracticeStep from "./PracticeStep";
import StepFooter from "./StepFooter";
import { StepBar, StepRail, type StepView } from "./StepRail";
import TryPanel from "./TryPanel";
import { useLearnMode, useWholeLesson, type LearnMode } from "./learnPrefs";

export type LectureCardInfo = { href: string; minutes: number; checkpoints: number; chapters: number } | null;

export type LessonShellProps = {
  kind: LessonKind;
  id: string;
  module: string;
  title: string;
  summary: string;
  level: string;
  /** reading minutes */
  minutes: number;
  moduleTitle: string;
  regionTitle?: string;
  lineLabel?: string;
  html: string;
  stages: DsaStage[];
  toc: { id: string; text: string; level: 1 | 2 | 3 | 4; kind: "part" | "chapter" | "section" | "question" | "other"; stageId: string }[];
  /** the sign-in gate's kind for this lesson (lib/gate) */
  gateKind: string;
  lecture: LectureCardInfo;
  keyIdea: KeyIdeaData;
  practice: ProblemSummary[];
  practiceIntro: string;
  checkpoint: ConceptCheckpoint | null;
  traces?: Record<string, Trace>;
  races?: Record<string, Race>;
  visualizer?: VisualizerSpec | null;
  /** the structure or algorithm lab's id (game key dsa:lab:<id>) */
  labId?: string | null;
  hasQuiz: boolean;
  nav: { position: string; prev: AsideLink | null; next: AsideLink | null };
  shorts: AsideLink[];
  shortsHref: string | null;
  cheatsheet: string | null;
  buildsOn?: AsideLink[];
  usedLater?: AsideLink[];
  /** the hydrator for this kind of lesson (DsaHydrator or StructureHydrator), given the lesson text's ref */
  hydrator: (rootRef: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
};

const FOLDED = "stretch";
const FACT = "border border-line-strong px-2 py-1";

export default function LessonShell(props: LessonShellProps) {
  const { kind, stages } = props;
  const p = useLessonProgress();
  const contentRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const { size } = useReadingSettings();
  const { user } = useAuth();
  const ai = useAiStatus();
  const game = useGame();
  const dsa = useDsaProgress();
  const [mode, setMode] = useLearnMode();
  const [whole] = useWholeLesson();
  const [sheet, setSheet] = useState(false);
  const [folded, setFolded] = useState(true);

  const groups = useMemo(() => groupStages(kind, stages), [kind, stages]);
  const beats = useMemo(() => learnBeats(kind, stages), [kind, stages]);
  const stageRef = useCallback((id: string) => stages.find((s) => s.id === id) ?? { id }, [stages]);
  const [step, setStep] = useState<StepId>("learn");
  const [beat, setBeat] = useState<string>(beats[0] ?? "");

  const readAloud = useReadAloud(contentRef, { listenKey: listenKey("dsa", props.module, props.id) });
  const { locked } = useSignInGate(props.gateKind);

  const canWatch = !!props.lecture;
  const effMode: LearnMode = mode === "watch" && !canWatch ? "read" : mode;

  /* ---------------------------------------------------------------- focus (the article alone) */
  const [focus, setFocus] = useState(false);
  const focusRef = useRef(false);
  const changeFocus = useCallback((on: boolean) => {
    focusRef.current = on;
    setFocus(on);
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const fsEl = document.fullscreenElement || doc.webkitFullscreenElement;
    try {
      if (on && !fsEl) {
        if (el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
        else el.webkitRequestFullscreen?.();
      } else if (!on && fsEl) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else doc.webkitExitFullscreen?.();
      }
    } catch {
      /* fullscreen unsupported: focus still hides the chrome */
    }
  }, []);
  const toggleFocus = useCallback(() => changeFocus(!focusRef.current), [changeFocus]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("hk-focus", focus);
    window.dispatchEvent(new Event("hk:chrome"));
    return () => root.classList.remove("hk-focus");
  }, [focus]);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && focusRef.current) changeFocus(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && focusRef.current) return changeFocus(false);
      if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // the lecture player owns F (full screen) while Watch is open
      if (document.querySelector("[data-hk-lecture]")) return;
      e.preventDefault();
      changeFocus(!focusRef.current);
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [changeFocus]);

  /* ---------------------------------------------------------------- where the learner is */
  const settle = useCallback(() => {
    // after a step or beat change: bring the top of the lesson column back into view if it scrolled away
    requestAnimationFrame(() => {
      const el = mainRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 72) window.scrollBy({ top: top - 96, behavior: "instant" as ScrollBehavior });
    });
  }, []);

  const place = useCallback(
    (stageId: string, deep = false) => {
      const s = stepOfStage(kind, stageRef(stageId));
      flushSync(() => {
        setStep(s);
        if (s === "learn") setBeat(stageId === "intro" ? (beats[0] ?? "") : stageId);
        if (stageId === FOLDED && deep) setFolded(false);
      });
    },
    [kind, stageRef, beats],
  );

  const stageOf = useCallback((el: Element | null): string | null => {
    const sec = el?.closest<HTMLElement>('section[data-sd="stage"]');
    if (!sec || !contentRef.current?.contains(sec)) return null;
    return sec.dataset.stageId || sec.id;
  }, []);

  const go = useCallback(
    (s: StepId, push = true) => {
      moved.current = true;
      flushSync(() => setStep(s));
      if (push) {
        try {
          window.history.pushState(null, "", `#${s}`);
        } catch {
          /* a sandboxed frame: the step still changes */
        }
      }
      settle();
    },
    [settle],
  );

  const goBeat = useCallback(
    (id: string) => {
      moved.current = true;
      flushSync(() => setBeat(id));
      settle();
    },
    [settle],
  );

  // every jump in the reader (contents, search hits, a #link) announces its target first: open the step and beat holding it
  useEffect(() => {
    const onReveal = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; el?: Element }>).detail || {};
      const el = d.el || (d.id ? document.getElementById(d.id) : null);
      const sid = stageOf(el);
      if (!sid) return;
      moved.current = true;
      const deep = !!el && !el.matches('section[data-sd="stage"]') && !el.closest("header");
      // a jump to lesson text leaves Watch: the text is what was asked for
      if (effMode === "watch") setMode("read");
      place(sid, deep);
    };
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, [stageOf, place, effMode, setMode]);

  // a #link on arrival: #try and the other step names, or any beat or heading inside the lesson
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (!h) return;
    const st = stepOfHash(h);
    moved.current = true;
    if (st) {
      // the hash is only readable in the browser
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(st);
      return;
    }
    const sid = stageOf(document.getElementById(h));
    if (!sid) return;
    place(sid, h !== FOLDED);
    requestAnimationFrame(() => scrollToId(h, "instant"));
  }, [stageOf, place]);

  // Back and Forward move between steps
  useEffect(() => {
    const on = () => {
      const st = stepOfHash(window.location.hash);
      setStep(st ?? "learn");
    };
    window.addEventListener("popstate", on);
    window.addEventListener("hashchange", on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener("hashchange", on);
    };
  }, []);

  // coming back: the beat they were reading
  useEffect(() => {
    if (!p.ready || moved.current) return;
    moved.current = true;
    const back = p.lastStage && stages.some((s) => s.id === p.lastStage) ? p.lastStage : null;
    if (!back) return;
    const s = stepOfStage(kind, stageRef(back));
    if (s === "learn") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBeat(back === "intro" ? (beats[0] ?? "") : back);
    }
  }, [p.ready, p.lastStage, stages, kind, stageRef, beats]);

  // Listen reads on through the lesson: open the step and beat of the line it reads
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        const t = r.target as HTMLElement;
        if (!t.classList?.contains("reading-highlight")) continue;
        const sid = stageOf(t);
        if (!sid) continue;
        const s = stepOfStage(kind, stageRef(sid));
        const b = sid === "intro" ? (beats[0] ?? "") : sid;
        setStep((cur) => (cur === s ? cur : s));
        if (s === "learn") {
          setBeat((cur) => {
            if (cur === b) return cur;
            requestAnimationFrame(() => t.scrollIntoView({ behavior: "smooth", block: "center" }));
            return b;
          });
        }
        if (sid === FOLDED) setFolded(false);
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
    return () => mo.disconnect();
  }, [stageOf, kind, stageRef, beats]);

  /* ---------------------------------------------------------------- the sign-in gate (src/lib/gate) */
  const hasGate = props.html.includes(PEEK_CLASS);
  const [gatedIds, setGatedIds] = useState<{ hidden: Set<string>; peek: Set<string> } | null>(null);
  useEffect(() => {
    const root = contentRef.current;
    if (!root || !root.querySelector(`.${PEEK_CLASS}`)) return;
    const hidden = new Set<string>();
    const peek = new Set<string>();
    root.querySelectorAll<HTMLElement>('section[data-sd="stage"]').forEach((sec) => {
      const id = sec.dataset.stageId || sec.id;
      if (sec.classList.contains(GATED_CLASS) && !sec.classList.contains(PEEK_CLASS)) hidden.add(id);
      else if (sec.classList.contains(PEEK_CLASS) || sec.querySelector(`.${PEEK_CLASS}`)) peek.add(id);
    });
    // read once from the server's markup after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGatedIds({ hidden, peek });
  }, []);

  /* ---------------------------------------------------------------- what is shown */
  const visible = useMemo(() => visibleStages({ kind, stages, step, beat, whole }), [kind, stages, step, beat, whole]);
  const beatAt = Math.max(0, beats.indexOf(beat));
  const prevBeat = beats[beatAt - 1];
  const nextBeat = beats[beatAt + 1];
  const paged = step === "learn" && !whole && effMode !== "watch";
  const textHidden = visible.length === 0 || (step === "learn" && effMode === "watch");
  const foldNow = paged && folded && beat === FOLDED && kind === "concept";

  const hasLabBeat = groups.try.length > 0;
  let showGate = false;
  if (hasGate && gatedIds && locked) {
    if (step === "learn") showGate = whole || visible.some((id) => gatedIds.peek.has(id) || gatedIds.hidden.has(id)) || (!!nextBeat && gatedIds.hidden.has(nextBeat));
    else if (step === "practice") showGate = false;
    else if (groups[step].length) showGate = groups[step].every((id) => gatedIds.hidden.has(id) || gatedIds.peek.has(id));
    else showGate = step === "try" && kind === "concept";
  }
  // a guest on a gated concept lesson gets the sign-in card in place of Try it's widgets (they are the lesson's text, as widgets)
  const gateBlocksTry = step === "try" && kind === "concept" && hasGate && locked;

  const css =
    hideStagesCss(visible) +
    // the practice ladder inside the closing beat is the Practice step's list now
    `[data-dsa-one] #practice-ladder,[data-dsa-one] #practice-ladder + .sd-table{display:none!important}` +
    (foldNow ? `[data-dsa-one] section[data-sd="stage"][data-stage-id="${FOLDED}"]>:not(header){display:none!important}` : "");

  /* ---------------------------------------------------------------- the rail */
  const solvedAll = props.practice.length > 0 && props.practice.every((x) => dsa.solved.has(x.id));
  const stageDone = (id: string) => p.completed || p.done.has(id);
  const doneOf: Record<StepId, boolean> = {
    learn: groups.learn.filter((id) => id !== "intro").length > 0 && groups.learn.filter((id) => id !== "intro").every(stageDone),
    try:
      (props.labId ? !!game.done[dsaKeys.lab(props.labId)] : false) ||
      (kind === "concept" ? Object.values(props.traces || {}).some((t) => !!game.done[dsaKeys.trace(t.id)]) : groups.try.length > 0 && groups.try.every(stageDone)),
    practice: solvedAll,
    check: (props.checkpoint && props.hasQuiz ? !!game.done[dsaKeys.checkpointQuiz(props.checkpoint.nodeId)] : false) || (groups.check.length > 0 && groups.check.every(stageDone)),
  };
  const facts = {
    learnBeats: beats.length,
    tryBeats: groups.try.length,
    traces: Object.keys(props.traces || {}).length,
    races: Object.keys(props.races || {}).length,
    hasVisualizer: !!props.visualizer,
    practice: props.practice.length,
    checkBeats: groups.check.length,
  };
  const steps: StepView[] = STEP_ORDER.map((id, i) => ({ id, n: i + 1, title: STEP_TITLE[id], sub: stepSub(id, kind, facts), state: step === id ? "current" : doneOf[id] ? "done" : "todo" }));

  const savePlace = () => p.saveCheckpoint();
  const canAsk = !user || !!ai?.features["dsa-chat"];
  const beatName = (id: string) => (kind === "concept" ? BEAT_PLAIN[id] : "") || stages.find((s) => s.id === id)?.label || id;
  const backHref = mapHref(props.checkpoint);
  const lectureMin = props.lecture?.minutes ?? null;

  const chips: string[] = [];
  if (lectureMin) chips.push(`${lectureMin} min lecture`);
  chips.push(`${props.minutes} min read`);
  if (props.visualizer && props.labId) chips.push("Visualiser + lab");
  else if (props.labId) chips.push("Sandbox + lab");
  else if (props.visualizer) chips.push("Visualiser");
  if (props.practice.length) chips.push(`${props.practice.length} practice problem${props.practice.length === 1 ? "" : "s"}`);
  if (props.checkpoint && props.hasQuiz) chips.push("Checkpoint quiz");

  const stepHeading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="m-0 font-display text-[26px] font-extrabold leading-none tracking-[-0.02em] text-fg sm:text-[30px]">
        <span className="text-fg-3">{STEP_ORDER.indexOf(step) + 1} · </span>
        {STEP_TITLE[step]}
      </h2>
      {step === "learn" ? (
        <div className="flex flex-wrap items-center gap-2">
          {effMode !== "watch" ? (
            <button type="button" onClick={() => setSheet(true)} className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-3 font-mono text-[13px] text-fg-2 hover:bg-surface-2 hover:text-fg">
              <List className="h-4 w-4" aria-hidden />
              Contents
            </button>
          ) : null}
          <LearnModes
            mode={effMode}
            canWatch={canWatch}
            canListen={readAloud.supported}
            watchMinutes={lectureMin}
            readMinutes={props.minutes}
            onPick={(m) => {
              if (m !== "listen") readAloud.stop();
              setMode(m);
            }}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className="mx-auto max-w-[1320px] px-4 pb-8 pt-4 sm:px-6 lg:pt-6">
        {/* header row: crumbs and prev/next on a computer; back, the lesson's place and Ask on a phone; the tools on both */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-focus-hide>
          <div className="hidden min-w-0 flex-1 lg:block">
            <DsaCrumbs items={[{ href: backHref, label: "Course" }, { label: props.moduleTitle }]} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <Link href={backHref} aria-label="Back to the course" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-fg hover:bg-surface-2">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
            <span className="min-w-0 truncate font-mono text-[12px] text-fg-2">{props.moduleTitle}</span>
          </div>
          <div className="hidden items-center gap-3 font-mono text-[12px] text-fg-3 lg:flex">
            {props.nav.prev ? (
              <Link href={props.nav.prev.href} className="max-w-[220px] truncate underline decoration-line-strong underline-offset-4 hover:text-fg">
                ← {props.nav.prev.title}
              </Link>
            ) : null}
            {props.nav.prev && props.nav.next ? <span aria-hidden>·</span> : null}
            {props.nav.next ? (
              <Link href={props.nav.next.href} className="max-w-[220px] truncate underline decoration-line-strong underline-offset-4 hover:text-fg">
                {props.nav.next.title} →
              </Link>
            ) : null}
          </div>
          {canAsk ? (
            <button
              type="button"
              onClick={() => openCourseChat()}
              aria-label="Ask the DSA Mastery tutor about this lesson"
              className="inline-flex min-h-11 items-center gap-2 border border-signal px-3 font-mono text-[13px] font-semibold text-signal-text hover:bg-signal hover:text-on-signal lg:hidden"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Ask
            </button>
          ) : null}
          <LessonTools title={props.title} focus={focus} onFocus={toggleFocus} onSavePlace={savePlace} />
        </div>

        {/* title block */}
        <header className="mt-5 flex flex-col gap-3" data-focus-hide>
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-mono text-[12px] uppercase tracking-label text-signal-text">
            Lesson · {props.moduleTitle}
            {props.regionTitle ? <span className="normal-case tracking-normal text-fg-3">{props.regionTitle}</span> : null}
          </p>
          <h1 className="m-0 max-w-[900px] font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[48px]">{props.title}</h1>
          <p className="m-0 max-w-[760px] text-[16px] leading-relaxed text-fg-2 sm:text-[18px]">{props.summary}</p>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-fg-3">
            {chips.map((c) => (
              <span key={c} className={FACT}>
                {c}
              </span>
            ))}
            <span className={FACT}>{props.level}</span>
            {props.lineLabel ? <span className={FACT}>{props.lineLabel}</span> : null}
          </div>
        </header>

        <StepBar steps={steps} onPick={(s) => go(s)} className="mt-5 lg:hidden" />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_300px] xl:gap-8">
          <div className="hidden lg:block" data-focus-hide>
            <StepRail steps={steps} onPick={(s) => go(s)} className="sticky top-[calc(var(--hk-header-h,64px)+16px)]" />
          </div>

          <div ref={mainRef} className="min-w-0 scroll-mt-24 pb-28" data-lesson-main data-step={step}>
            <div className="flex flex-col gap-5">
              <div data-focus-hide>{stepHeading}</div>

              {step === "learn" && effMode === "watch" && props.lecture ? (
                <div className="flex flex-col gap-4">
                  <InlineLecture lessonId={props.id} card={props.lecture} />
                  <KeyIdea idea={props.keyIdea} />
                </div>
              ) : null}

              {step === "learn" && effMode === "listen" ? (
                <div className="flex flex-col gap-2 border border-line bg-surface p-4" role="group" aria-label="Listen to this lesson">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={readAloud.toggle}
                      aria-pressed={readAloud.playing && !readAloud.paused}
                      className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))]"
                    >
                      {readAloud.playing && !readAloud.paused ? "❚❚ Pause" : readAloud.paused ? "▶ Resume" : "▶ Listen to this lesson"}
                    </button>
                    <ReadAloudBar controller={readAloud} />
                  </div>
                  <p className="m-0 font-mono text-[12px] text-fg-3">
                    {readAloud.recorded ? "Recorded narration. The text below follows along." : "Read aloud by your browser's voice. The text below follows along."}
                  </p>
                </div>
              ) : null}

              {step === "learn" && effMode !== "watch" && (whole || beat === beats[0]) ? <KeyIdea idea={kind === "concept" ? props.keyIdea : null} /> : null}

              {step === "try" && !gateBlocksTry ? <TryPanel kind={kind} lessonId={props.id} traces={props.traces} races={props.races} visualizer={props.visualizer} hasLabBeat={hasLabBeat} /> : null}
              {step === "practice" ? <PracticeStep problems={props.practice} intro={props.practiceIntro} module={props.module} /> : null}
              {step === "check" ? <CheckStep checkpoint={props.checkpoint} labId={props.labId ?? null} hasQuiz={props.hasQuiz} /> : null}
            </div>

            {/* the lesson text: one server-rendered page, its beats shown by the step styles above */}
            <div data-dsa-one className={`mt-5 max-w-[var(--read-measure,740px)] ${textHidden ? "hidden" : ""}`}>
              <LessonContentWrapper ref={contentRef} htmlContent={props.html} courseId={DSA_COURSE_ID} week={props.module} lessonSlug={props.id} lessonTitle={props.title} />
            </div>
            {props.hydrator(contentRef)}
            <Jargon rootRef={contentRef} />

            {foldNow ? (
              <div className="mt-2 flex max-w-[var(--read-measure,740px)] flex-col gap-3 border border-dashed border-line-strong bg-surface-2 p-4 sm:p-5">
                <p className="m-0 text-[15px] leading-relaxed text-fg">The tricky inputs, the common mistakes and a few interview variations. Worth reading before interviews; fine to skip on a first read.</p>
                <button
                  type="button"
                  onClick={() => setFolded(false)}
                  className="inline-flex min-h-11 items-center self-start border-2 border-signal px-4 text-[15px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)]"
                >
                  Show edge cases
                </button>
              </div>
            ) : null}

            {showGate ? <SignInGate kind={props.gateKind} className="mt-6 max-w-[var(--read-measure,740px)]" /> : null}

            {/* Read, one beat at a time: back / which beat / next */}
            {paged ? (
              <nav aria-label="Parts of the lesson" className="mt-8 flex flex-col gap-3 border-t border-line pt-5" data-focus-hide>
                <span className="font-mono text-[12px] text-fg-3" aria-live="polite">
                  Part {beatAt + 1} of {beats.length} · {beatName(beat)}
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {prevBeat ? (
                    <button type="button" onClick={() => goBeat(prevBeat)} className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 text-[15px] text-fg hover:border-fg">
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Back to </span>
                      {beatName(prevBeat)}
                    </button>
                  ) : null}
                  {nextBeat && !(showGate && locked) ? (
                    <button type="button" onClick={() => goBeat(nextBeat)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border-2 border-signal px-5 text-[15px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:flex-none">
                      Next: {beatName(nextBeat)}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </nav>
            ) : null}

            {step === "check" ? (
              <div className="mt-8">
                <CheckEnd checkpoint={props.checkpoint} next={props.nav.next} cheatsheet={props.cheatsheet} />
              </div>
            ) : null}
          </div>

          {/* the aside: a third column on wide screens; below that it folds into the end of Learn */}
          <LessonAside
            lessonId={props.id}
            rootRef={contentRef}
            shorts={props.shorts}
            shortsHref={props.shortsHref}
            buildsOn={props.buildsOn}
            usedLater={props.usedLater}
            cheatsheet={props.cheatsheet}
            className={step === "learn" ? "flex pb-24 xl:pb-0" : "hidden xl:flex"}
          />
        </div>
      </div>

      <StepFooter step={step} onNext={(s) => go(s)} nextLesson={props.nav.next} backHref={backHref} />
      {focus ? <FocusControls stages={p.stages} size={size} onExit={() => changeFocus(false)} /> : null}
      <ContentsSheet open={sheet} onClose={() => setSheet(false)} toc={props.toc} stages={stages} kicker={props.moduleTitle.toUpperCase()} title={props.title} />
    </>
  );
}
