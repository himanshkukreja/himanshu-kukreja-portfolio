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
 * A generated stylesheet hides every beat outside the shown set (stepStyles.ts, the OneStage
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
  STEP_TITLE,
  stepOrderOf,
  groupStages,
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
import LessonParts from "./LessonParts";
import { StepBar, StepPills, type StepView } from "./StepRail";
import StepPreviews from "./StepPreviews";
import { CHIP, PAGE_H } from "../ui/kit";
import TryPanel from "./TryPanel";
import { useLearnMode, useWholeLesson, type LearnMode } from "./learnPrefs";
import { stepCss } from "./stepStyles";

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
  /** phase-2 widgets (inline visualiser, predict checks) slot into the Learn card, above the lesson text */
  learnSlot?: React.ReactNode;
  /** "Back" goes here instead of the checkpoint's station (a lean lesson: its station, or Practice) */
  backHref?: string;
  /** the label of that link's target, for the phone's back button */
  backLabel?: string;
};

const FOLDED = "stretch";
const FACT = CHIP;

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
  const [whole, setWhole] = useWholeLesson();
  const [sheet, setSheet] = useState(false);
  const [folded, setFolded] = useState(true);

  const groups = useMemo(() => groupStages(kind, stages), [kind, stages]);
  const beats = useMemo(() => learnBeats(kind, stages), [kind, stages]);
  const stageRef = useCallback((id: string) => stages.find((s) => s.id === id) ?? { id }, [stages]);
  const [step, setStep] = useState<StepId>("learn");
  const [beat, setBeat] = useState<string>(beats[0] ?? "");

  const readAloud = useReadAloud(contentRef, { listenKey: listenKey("dsa", props.module, props.kind === "lean" && props.id.startsWith(`${props.module}--`) ? props.id.slice(props.module.length + 2) : props.id) });
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
      const h = decodeURIComponent(window.location.hash.slice(1));
      const st = stepOfHash(h);
      if (st || !h) return setStep(st ?? "learn");
      // a link to a beat or a heading inside the lesson: open the step and beat holding it, then go there
      const sid = stageOf(document.getElementById(h));
      if (!sid) return;
      place(sid, h !== FOLDED);
      requestAnimationFrame(() => scrollToId(h));
    };
    window.addEventListener("popstate", on);
    window.addEventListener("hashchange", on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener("hashchange", on);
    };
  }, [stageOf, place]);

  // coming back: the beat they were reading
  useEffect(() => {
    if (!p.ready || moved.current) return;
    moved.current = true;
    // a finished lesson opens at its start; one in progress opens where they were
    const back = !p.completed && p.lastStage && stages.some((s) => s.id === p.lastStage) ? p.lastStage : null;
    if (!back) return;
    const s = stepOfStage(kind, stageRef(back));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(s);
    if (s === "learn") setBeat(back === "intro" ? (beats[0] ?? "") : back);
  }, [p.ready, p.completed, p.lastStage, stages, kind, stageRef, beats]);

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

  const css = stepCss({ visible, foldedStage: foldNow ? FOLDED : null });

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
  const order = stepOrderOf(kind);
  const steps: StepView[] = order.map((id, i) => ({ id, n: i + 1, title: STEP_TITLE[id], sub: stepSub(id, kind, facts), state: step === id ? "current" : doneOf[id] ? "done" : "todo" }));

  const savePlace = () => p.saveCheckpoint();
  const canAsk = !user || !!ai?.features["dsa-chat"];
  const beatName = (id: string) => (kind === "concept" ? BEAT_PLAIN[id] : "") || stages.find((s) => s.id === id)?.label || id;
  const backHref = props.backHref ?? mapHref(props.checkpoint);
  const lectureMin = props.lecture?.minutes ?? null;

  // "2.1 Arrays and strings · lesson 3 of 7" → the module for the crumbs and "Lesson 3 of 7" after it
  const [modName, modAt] = props.moduleTitle.split(" · ");
  const lessonAt = modAt ? modAt.charAt(0).toUpperCase() + modAt.slice(1) : props.nav.position;

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
      <h2 className={`m-0 text-[17px] font-semibold text-fg sm:text-[18px] ${step === "learn" ? "hidden sm:block" : ""}`}>
        {order.indexOf(step) + 1} · {STEP_TITLE[step]}
      </h2>
      {step === "learn" ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {effMode !== "watch" ? (
            <button type="button" onClick={() => setSheet(true)} className="order-2 inline-flex min-h-[38px] items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg sm:order-none">
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
      <div className="mx-auto max-w-[1248px] px-4 pb-8 pt-2 sm:px-6 lg:pt-[26px]">
        {/* header row: crumbs and prev/next on a computer; back, the lesson's place and Ask on a phone; the tools on both */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-focus-hide>
          <div className="hidden min-w-0 flex-1 lg:block">
            <DsaCrumbs items={[{ href: "/dsa", label: "Course" }, { href: backHref, label: modName }, ...(lessonAt ? [{ label: lessonAt }] : [])]} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <Link href={backHref} aria-label="Back to the course" className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-fg hover:bg-surface-2">
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
            <span className="min-w-0 truncate text-[13px] text-fg-3">
              {modName.replace(/^\d+(\.\d+)*\s+/, "")}
              {lessonAt ? ` · ${lessonAt}` : ""}
            </span>
          </div>
          <div className="hidden items-center gap-2.5 text-[13px] text-fg-3 lg:flex">
            {props.nav.prev ? (
              <Link href={props.nav.prev.href} className="max-w-[220px] truncate hover:text-fg">
                ← {props.nav.prev.title}
              </Link>
            ) : null}
            {props.nav.prev && props.nav.next ? <span aria-hidden>·</span> : null}
            {props.nav.next ? (
              <Link href={props.nav.next.href} className="max-w-[220px] truncate hover:text-fg">
                {props.nav.next.title} →
              </Link>
            ) : null}
          </div>
          {canAsk ? (
            <button
              type="button"
              onClick={() => openCourseChat()}
              aria-label="Ask the DSA Mastery tutor about this lesson"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-line bg-surface px-3 text-[13px] font-medium text-fg hover:bg-surface-2 xl:hidden [@media(pointer:coarse)]:min-h-11"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Ask
            </button>
          ) : null}
          <LessonTools title={props.title} focus={focus} onFocus={toggleFocus} onSavePlace={savePlace} />
        </div>

        {/* title block */}
        <header className="mt-2 flex flex-col gap-2.5 lg:mt-5" data-focus-hide>
          <h1 className={`${PAGE_H} max-w-[1000px]`}>{props.title}</h1>
          <p className="m-0 max-w-[760px] text-[14px] leading-normal text-fg-2 sm:text-[17px]">{props.summary}</p>
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            {chips.map((c) => (
              <span key={c} className={FACT}>
                {c}
              </span>
            ))}
            <span className={FACT}>{props.level}</span>
            {props.lineLabel ? <span className={FACT}>{props.lineLabel}</span> : null}
          </div>
        </header>

        <StepBar steps={steps} onPick={(s) => go(s)} className="mt-3.5 lg:hidden [html.hk-ask-open_&]:block [html.hk-nb-side_&]:block" />
        <StepPills steps={steps} onPick={(s) => go(s)} className="mt-5 hidden lg:block [html.hk-ask-open_&]:hidden [html.hk-nb-side_&]:hidden" />

        <div data-reader-grid data-dsa-grid className="mt-3.5 grid grid-cols-1 gap-6 lg:mt-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-9">
          <div ref={mainRef} className="flex min-w-0 scroll-mt-24 flex-col gap-4 pb-28 sm:gap-[22px]" data-lesson-main data-step={step}>
            {/* the open step: one rounded card on computers (the canvas), the bare page on phones (LessonMobile) */}
            <section aria-label={`Step ${order.indexOf(step) + 1}: ${STEP_TITLE[step]}`} className="min-w-0 sm:rounded-[18px] sm:border sm:border-line sm:bg-surface sm:p-[22px]">
            <div className="flex flex-col gap-4">
              <div data-focus-hide>{stepHeading}</div>

              {step === "learn" && effMode === "watch" && props.lecture ? (
                <div className="flex flex-col gap-4">
                  <InlineLecture lessonId={props.id} card={props.lecture} />
                  <KeyIdea idea={props.keyIdea} />
                </div>
              ) : null}

              {step === "learn" && effMode === "listen" ? (
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-4" role="group" aria-label="Listen to this lesson">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={readAloud.toggle}
                      aria-pressed={readAloud.playing && !readAloud.paused}
                      className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-signal px-4 text-[14px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))]"
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
              {step === "learn" && props.learnSlot ? <div data-slot="lesson-learn">{props.learnSlot}</div> : null}

              {step === "try" && !gateBlocksTry ? <TryPanel kind={kind} lessonId={props.id} traces={props.traces} races={props.races} visualizer={props.visualizer} hasLabBeat={hasLabBeat} /> : null}
              {step === "practice" && kind !== "lean" ? <PracticeStep problems={props.practice} intro={props.practiceIntro} module={props.module} /> : null}
              {step === "check" ? <CheckStep checkpoint={props.checkpoint} labId={props.labId ?? null} hasQuiz={props.hasQuiz} /> : null}
            </div>

            {/* Learn on one page: the parts of the lesson, following the scroll */}
            {step === "learn" && whole && effMode !== "watch" && beats.length > 1 ? (
              <LessonParts
                className="mt-4"
                rootRef={contentRef}
                parts={beats.map((id) => ({ id, name: beatName(id), locked: locked && !!gatedIds && gatedIds.hidden.has(id) }))}
                onJump={(id) => {
                  moved.current = true;
                  scrollToId(id);
                }}
              />
            ) : null}

            {/* the lesson text: one server-rendered page, its beats shown by the step styles above */}
            <div data-dsa-one className={`mt-5 max-w-[var(--read-measure,740px)] ${textHidden ? "hidden" : ""}`}>
              <LessonContentWrapper ref={contentRef} htmlContent={props.html} courseId={DSA_COURSE_ID} week={props.module} lessonSlug={props.id} lessonTitle={props.title} />
            </div>
            {props.hydrator(contentRef)}
            <Jargon rootRef={contentRef} />

            {foldNow ? (
              <div className="mt-2 flex max-w-[var(--read-measure,740px)] flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-bg p-4 sm:p-5">
                <p className="m-0 text-[15px] leading-relaxed text-fg">The tricky inputs, the common mistakes and a few interview variations. Worth reading before interviews; fine to skip on a first read.</p>
                <button
                  type="button"
                  onClick={() => setFolded(false)}
                  className="inline-flex min-h-11 items-center self-start rounded-[10px] border-2 border-signal px-4 text-[15px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)]"
                >
                  Show edge cases
                </button>
              </div>
            ) : null}

            {showGate ? <SignInGate kind={props.gateKind} className="mt-6 max-w-[var(--read-measure,740px)]" /> : null}

            {/* Read, one beat at a time: back / which beat / next */}
            {paged ? (
              <nav aria-label="Parts of the lesson" className="mt-8 flex flex-col gap-3 border-t border-line pt-5" data-focus-hide>
                <span className="text-[13px] text-fg-3" aria-live="polite">
                  Part {beatAt + 1} of {beats.length} · {beatName(beat)}
                </span>
                <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="All parts">
                  {beats.map((id, i) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => goBeat(id)}
                        aria-current={id === beat ? "step" : undefined}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] [@media(pointer:coarse)]:min-h-11 ${id === beat ? "border-signal bg-signal font-semibold text-on-signal" : "border-line text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
                      >
                        <span aria-hidden className="font-mono text-[11px] opacity-70">
                          {i + 1}
                        </span>
                        {beatName(id)}
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center gap-2.5">
                  {prevBeat ? (
                    <button type="button" onClick={() => goBeat(prevBeat)} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-strong px-4 text-[14px] font-medium text-fg hover:bg-surface-2">
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Back to </span>
                      {beatName(prevBeat)}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setWhole(true)} className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-[14px] font-medium text-signal-text underline underline-offset-4 hover:bg-surface-2">
                    Read it all on one page
                  </button>
                </div>
              </nav>
            ) : null}

            {step === "check" ? (
              <div className="mt-8">
                <CheckEnd checkpoint={props.checkpoint} next={props.nav.next} cheatsheet={props.cheatsheet} backHref={props.backHref} />
              </div>
            ) : null}
            </section>

            {/* the other three steps, each its own card (the canvas shows the whole lesson at a glance) */}
            <StepPreviews kind={kind} steps={steps} current={step} problems={props.practice} onPick={(s) => go(s)} />
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

      <StepFooter kind={kind} step={step} onNext={(s) => go(s)} nextPart={paged && nextBeat && !(showGate && locked) ? () => goBeat(nextBeat) : null} nextLesson={props.nav.next} backHref={backHref} />
      {focus ? <FocusControls stages={p.stages} size={size} onExit={() => changeFocus(false)} /> : null}
      <ContentsSheet anyWidth open={sheet} onClose={() => setSheet(false)} toc={props.toc} stages={stages} kicker={props.moduleTitle.toUpperCase()} title={props.title} />
    </>
  );
}
