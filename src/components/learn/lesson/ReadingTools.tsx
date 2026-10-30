"use client";

import AppBack from "@/components/site/AppBack";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import { ReadAloudBar, type ReadAloudController } from "@/components/ReadAloud";
import { ListenIcon, PauseIcon } from "@/components/listen/icons";
import { useChromeHidden } from "@/components/site/readerChrome";
import type { Stage } from "@/lib/course/types";
import { StageSegments } from "./StageRail";
import { stagePosition, stageShort } from "./stageText";
import TermsToggle from "@/components/learn/concepts/TermsToggle";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { ASK_LESSON_EVENT } from "@/components/learn/ai/AskLessonPanel";
import { openNotebookPanel } from "@/lib/learn/ink/client";
import SnipButton from "@/components/learn/ink/capture/SnipButton";

const openAsk = () => window.dispatchEvent(new Event(ASK_LESSON_EVENT));

const AskIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
    <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </svg>
);

/** The orange "Ask AI" button: always on screen while reading (hidden while the panel is open). */
function AskPill({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={openAsk}
      data-ask-fab
      aria-label="Ask AI about this lesson"
      className={`flex items-center gap-2 bg-signal font-mono font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition hover:brightness-110 ${compact ? "h-11 px-3.5 text-[12px]" : "h-12 px-4 text-[13px]"}`}
    >
      <AskIcon />
      Ask AI
      {!compact && <span className="font-normal opacity-80">about this lesson</span>}
    </button>
  );
}

/** One line at the top of the lesson saying the AI is there (only when it is). */
export function AskPrompt() {
  const ai = useAiStatus();
  if (!(ai?.features["lesson-qa"] || ai?.features["course-chat"])) return null;
  return (
    <div data-focus-hide className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border border-line border-l-[3px] border-l-signal bg-surface px-4 py-3">
      <span className="text-signal">
        <AskIcon />
      </span>
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-fg-2">
        <strong className="text-fg">Stuck on something here?</strong> Ask the course tutor about this lesson: it answers with the sections it used. Select any text and press <em>Explain</em>, or ask the tutor.
      </p>
      <button type="button" onClick={openAsk} className="shrink-0 border border-line-strong px-3 py-1.5 font-mono text-[12px] text-fg hover:border-signal hover:text-signal">
        Ask this lesson →
      </button>
    </div>
  );
}

export const TEXT_SIZES = [17, 19, 21] as const;

type Props = {
  readAloud: ReadAloudController;
  focus: boolean;
  onFocus: () => void;
  size: number;
  onSize: () => void;
  onContents: () => void;
};

/** Notebook pages beside the lesson (a split panel on wide screens, a sheet on phones): components/learn/ink. */
const NotebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M5 3h12v18H5z" />
    <path d="M9 3v18" />
    <path d="M12.5 14.5l4.5-4.5 2 2-4.5 4.5h-2z" />
  </svg>
);

const FocusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

/** Desktop reading tools: Ask AI above; stage indicator · Listen · Focus · Aa. Bottom right, lg and up. */
export function ReadingDock({ readAloud, focus, onFocus, size, onSize }: Props) {
  const p = useLessonProgress();
  const ai = useAiStatus();
  const listening = readAloud.playing && !readAloud.paused;
  const btn = (on: boolean) => `flex min-h-[52px] min-w-14 flex-col items-center justify-center gap-[3px] border-r border-line px-1 ${on ? "bg-signal text-on-signal" : "text-fg hover:bg-surface-2"}`;
  return (
    <div data-reader-ui data-focus-hide data-ask-shift className="fixed bottom-6 right-6 z-40 hidden flex-col items-end gap-2 lg:flex">
      {(ai?.features["lesson-qa"] || ai?.features["course-chat"]) && <AskPill />}
      <ReadAloudBar controller={readAloud} />
      <div role="toolbar" aria-label="Reading tools" className="flex items-stretch border border-line-strong bg-surface">
        <div className="flex min-w-[92px] flex-col justify-center gap-1 border-r border-line px-3 py-1.5">
          <span className="font-mono text-[11px] text-fg-3">{stageShort(p)}</span>
          <span aria-hidden className="flex gap-0.5">
            {p.stages.map((s) => (
              <span key={s.id} className={`h-1 w-3 ${p.completed || p.done.has(s.id) ? "bg-fg" : s.id === p.current ? "bg-signal" : "bg-line"}`} />
            ))}
          </span>
        </div>
        {readAloud.supported && (
          <button type="button" onClick={readAloud.toggle} aria-pressed={listening} className={btn(listening)}>
            {listening ? <PauseIcon /> : <ListenIcon />}
            <span className="font-mono text-[10px] tracking-[0.06em]">{listening ? "PAUSE" : readAloud.paused ? "RESUME" : "LISTEN"}</span>
          </button>
        )}
        <button type="button" onClick={onFocus} aria-pressed={focus} title="Focus (F)" className={btn(focus)}>
          <FocusIcon />
          <span className="font-mono text-[10px] tracking-[0.06em]">FOCUS</span>
        </button>
        <button type="button" onClick={() => openNotebookPanel()} title="Notebook: write beside this lesson" aria-label="Notebook: write beside this lesson" className={btn(false)}>
          <NotebookIcon />
          <span className="font-mono text-[10px] tracking-[0.06em]">NOTEBOOK</span>
        </button>
        <SnipButton variant="dock" />
        <TermsToggle variant="dock" />
        <button type="button" onClick={onSize} aria-label={`Text size ${size} pixels, change`} className="flex min-h-[52px] min-w-14 flex-col items-center justify-center gap-[3px] text-fg hover:bg-surface-2">
          <span aria-hidden className="font-display text-base font-bold leading-none">
            Aa
          </span>
          <span className="font-mono text-[10px] tracking-[0.06em]">{size}PX</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Phone reading toolbar: Listen · Contents · Aa · Focus · Notebook · Save, with the Ask AI pill floating above. Sits directly above the site's
 * bottom dock (its height is measured into --site-dock), never on top of it.
 */
export function MobileReadingBar({ readAloud, size, onSize, onContents, onFocus }: Props) {
  const p = useLessonProgress();
  const ai = useAiStatus();
  // slides away with the header while reading down
  const hidden = useChromeHidden();
  const { current, done, completed, stages, required, saveCheckpoint, complete, ready, canComplete } = p;
  const listening = readAloud.playing && !readAloud.paused;
  const curStage = stages.find((s) => s.id === current);
  const { n, total } = stagePosition(current, required);
  const curDone = completed || done.has(current);
  const lastRequired = required[required.length - 1]?.id === current;

  // `short` replaces `label` below ~380px so the button never truncates mid-word
  let label = "Save checkpoint";
  let short = "Save";
  let action: (() => void) | null = saveCheckpoint;
  let primary = true;
  if (completed) {
    label = "Cleared ✓";
    short = "Cleared ✓";
    action = null;
    primary = false;
  } else if (lastRequired && canComplete) {
    label = "Finish · +60 XP";
    short = "Finish";
    action = complete;
  } else if (curDone) {
    label = n ? `Stage ${n}/${total} done ✓` : `${curStage?.label ?? "Stage"} done ✓`;
    short = n ? `${n}/${total} ✓` : "Done ✓";
    action = null;
    primary = false;
  } else if (n) {
    label = `Save · stage ${n}/${total}`;
    short = `Save ${n}/${total}`;
  }

  const sq = "grid h-11 w-10 shrink-0 place-items-center border border-line-strong text-fg";
  // the pill sits just above the bar, above the read-aloud controls when they show, and drops to the
  // site dock when the bar slides away
  const lift = hidden ? 12 : 72 + (readAloud.playing || readAloud.notice ? 52 : 0);
  return (
    <>
      {(ai?.features["lesson-qa"] || ai?.features["course-chat"]) && (
        <div
          data-reader-ui
          data-focus-hide
          className="fixed right-3 z-40 transition-[bottom] duration-200 lg:hidden"
          style={{
            bottom: `calc(var(--site-dock, 0px) + env(safe-area-inset-bottom, 0px) + ${lift}px)`,
          }}
        >
          <AskPill compact />
        </div>
      )}
      <div
        data-reader-ui
        data-focus-hide
        inert={hidden || undefined}
        className={`hk-safe-x fixed inset-x-0 z-40 flex flex-col gap-1.5 border-t border-line bg-bg/95 px-2.5 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] backdrop-blur transition-transform duration-200 lg:hidden ${hidden ? "translate-y-full" : ""}`}
        style={{ bottom: "var(--site-dock, 0px)" }}
      >
        <ReadAloudBar controller={readAloud} className="self-end" />
        <div role="toolbar" aria-label="Reading tools" className="flex gap-1.5">
          {/* installed app only: no browser back button there (renders nothing in a browser tab) */}
          <AppBack className="h-11" />
          {readAloud.supported && (
            <button type="button" onClick={readAloud.toggle} aria-pressed={listening} aria-label={listening ? "Pause reading aloud" : "Listen to this lesson"} className={`${sq} ${listening ? "border-signal bg-signal text-on-signal" : ""}`}>
              {listening ? <PauseIcon /> : <ListenIcon />}
            </button>
          )}
          <button type="button" onClick={onContents} aria-label="Contents" className={sq}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
          <button type="button" onClick={onSize} aria-label={`Text size ${size} pixels, change`} className={`${sq} font-display text-[15px] font-bold`}>
            Aa
          </button>
          <button type="button" onClick={onFocus} aria-label="Focus: just the lesson, full screen" className={sq}>
            <FocusIcon />
          </button>
          <button type="button" onClick={() => openNotebookPanel()} aria-label="Notebook: write beside this lesson" className={sq}>
            <NotebookIcon />
          </button>
          <SnipButton variant="bar" />
          <button
            type="button"
            onClick={action ?? undefined}
            disabled={!action || !ready}
            className={`h-11 min-w-0 flex-1 truncate px-2 text-sm font-semibold ${primary ? "bg-signal text-on-signal" : "border border-line-strong text-fg-2"}`}
          >
            <span className="hidden min-[380px]:inline">{label}</span>
            <span className="min-[380px]:hidden">{short}</span>
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The only chrome left in focus mode: a hairline stage progress bar along the top edge and a
 * small, quiet control cluster (text size, exit) that wakes up on hover/tap.
 */
export function FocusControls({ stages, size, onSize, onExit }: { stages: Stage[]; size: number; onSize: () => void; onExit: () => void }) {
  return (
    <>
      <StageSegments stages={stages} height="h-[3px]" className="fixed inset-x-0 top-[var(--hk-top-inset,0px)] z-[60]" />
      <div
        role="toolbar"
        aria-label="Focus mode"
        className="fixed right-3 top-[calc(var(--hk-top-inset,0px)+12px)] z-[60] flex items-stretch border border-line bg-bg/80 opacity-60 backdrop-blur transition-opacity hover:opacity-100 focus-within:opacity-100"
      >
        <button type="button" onClick={onSize} aria-label={`Text size ${size} pixels, change`} className="grid h-10 w-11 place-items-center border-r border-line font-display text-[15px] font-bold text-fg hover:bg-surface-2">
          Aa
        </button>
        <button type="button" onClick={onExit} className="flex h-10 items-center gap-2 px-3 font-mono text-[11px] text-fg hover:bg-surface-2">
          exit focus
          <kbd className="hidden border border-line-strong px-1 text-[10px] text-fg-3 sm:inline">esc</kbd>
        </button>
      </div>
    </>
  );
}
