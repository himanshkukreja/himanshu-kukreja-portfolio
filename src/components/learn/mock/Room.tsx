"use client";

/**
 * The interview room: a sticky call bar (interviewer, phase clock, total clock, phase strip),
 * the call transcript (prompts, follow-ups, curveballs, hints, time-keeping) and the workspace
 * (curveball answers, notes per phase, a shared plain-text whiteboard, Done / Next).
 */
import AiInterviewer from "@/components/learn/ai/AiInterviewer";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MockInterview, MockPhase } from "@/lib/learn/mock/types";
import { mmss } from "@/lib/learn/mock/types";
import type { MockRun } from "@/lib/learn/mock/store";
import { firedCurveballs, firstName, pendingOnSubmit, placeholderFor, totalUsed, transcript, type FeedItem } from "@/lib/learn/mock/engine";
import { words } from "@/lib/learn/mock/score";
import { Avatar, CourseHtml, InlineHtml, LABEL, Pad } from "./ui";

// the drawing board is a big library: load it only when the whiteboard tab is opened
const BoardCanvas = dynamic(() => import("./BoardCanvas"), {
  ssr: false,
  loading: () => <div className="grid h-[min(560px,68vh)] place-items-center border border-line-strong font-mono text-xs text-fg-3">loading the whiteboard…</div>,
});

type Props = {
  mock: MockInterview;
  run: MockRun;
  running: boolean;
  away: boolean;
  skipWarn: boolean;
  onToggle: () => void;
  onDone: () => void;
  onGo: (k: number) => void;
  onHint: () => void;
  onEnd: () => void;
  onLobby: () => void;
  /** start this round again from phase 1 (clears this round's answers) */
  onRestart: () => void;
  setNote: (pid: string, v: string) => void;
  setAnswer: (cid: string, v: string) => void;
  setBoard: (v: string) => void;
  setSketch: (v: string) => void;
};

export default function Room(props: Props) {
  const { mock, run } = props;
  const phase = mock.phases[run.phase];
  const items = useMemo(() => transcript(mock, run), [mock, run]);
  if (!phase) return null;
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pb-32 pt-3 sm:px-6 sm:pt-5 lg:pb-24">
      <CallBar {...props} phase={phase} />
      {props.away && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-signal bg-surface px-4 py-3 sm:px-5">
          <span className="text-[15px] text-fg-2">
            You left the call. The clock is paused at <span className="font-mono text-fg">{mmss(totalUsed(mock, run))}</span>; it starts again when you rejoin.
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={props.onToggle} className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal">
              Rejoin the call
            </button>
            <button type="button" onClick={props.onLobby} className="min-h-11 border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
              Lobby
            </button>
          </span>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Transcript mock={mock} run={run} items={items} running={props.running} />
        <Workspace {...props} phase={phase} items={items} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// Call bar

function CallBar({ mock, run, running, phase, onToggle, onGo, onEnd, onLobby, onRestart }: Props & { phase: MockPhase }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    if (!confirmEnd) return;
    const t = window.setTimeout(() => setConfirmEnd(false), 3500);
    return () => window.clearTimeout(t);
  }, [confirmEnd]);
  const used = run.used[phase.id] || 0;
  const budget = phase.minutes * 60;
  const over = used > budget;
  const total = totalUsed(mock, run);
  const totalOver = total > mock.minutes * 60;
  return (
    <div className="sticky top-[var(--hk-header-h,61px)] z-40 -mx-4 border-b border-line bg-bg/95 px-4 pb-2.5 pt-2.5 backdrop-blur sm:mx-0 sm:border sm:px-4">
      <div className="flex items-center gap-3">
        <Avatar name={mock.interviewer.name} size="sm" live={running} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-fg">
            {mock.interviewer.name}
            <span className="hidden font-normal text-fg-3 sm:inline"> · {mock.company.name}</span>
          </span>
          <span className={`truncate font-mono text-[11px] uppercase tracking-label ${running ? "text-signal-text" : "text-fg-3"}`}>
            {running ? "● on call" : "❚❚ paused"} · P{phase.n} {phase.title}
          </span>
        </div>
        <div className="flex flex-col items-end leading-none" aria-label={`Phase clock ${mmss(used)} of ${mmss(budget)}`}>
          <span className={`font-mono text-[22px] font-semibold tabular-nums sm:text-[26px] ${over ? "text-signal-text" : "text-fg"}`} aria-hidden>
            {mmss(used)}
          </span>
          <span className="mt-1 font-mono text-[10px] text-fg-3" aria-hidden>
            {over ? `+${mmss(used - budget)} over` : `of ${mmss(budget)}`}
          </span>
        </div>
        <div className="hidden flex-col items-end border-l border-line pl-3 leading-none sm:flex" aria-label={`Total ${mmss(total)} of ${mock.minutes} minutes`}>
          <span className={`font-mono text-base font-semibold tabular-nums ${totalOver ? "text-signal-text" : "text-fg-2"}`} aria-hidden>
            {mmss(total)}
          </span>
          <span className="mt-1 font-mono text-[10px] text-fg-3" aria-hidden>
            of {mock.minutes}:00
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={running ? "Pause the clock" : "Resume the clock"}
          className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong font-mono text-sm text-fg hover:border-fg-3"
        >
          {running ? "❚❚" : "▶"}
        </button>
        <CallMenu onLobby={onLobby} onRestart={onRestart} />
        <button
          type="button"
          onClick={() => (confirmEnd ? onEnd() : setConfirmEnd(true))}
          className={`min-h-11 shrink-0 px-2.5 text-sm sm:px-3 ${confirmEnd ? "bg-bad text-white" : "border border-line-strong text-fg hover:border-fg-3"}`}
        >
          {confirmEnd ? "End now?" : "End"}
        </button>
      </div>
      <div className="mt-2.5 flex gap-[3px]">
        {mock.phases.map((p, k) => {
          const u = run.used[p.id] || 0;
          const fill = Math.min(100, (u / (p.minutes * 60)) * 100);
          const isOver = u > p.minutes * 60;
          const cur = k === run.phase;
          const reachable = k <= run.maxPhase;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!reachable || cur}
              onClick={() => onGo(k)}
              title={`Phase ${p.n} · ${p.title} · ${mmss(u)} of ${p.minutes}:00`}
              aria-label={`Phase ${p.n}, ${p.title}${cur ? ", current" : reachable ? ", go back to it" : ""}`}
              className={`relative h-2.5 min-w-0 overflow-hidden disabled:cursor-default sm:h-3 ${cur ? "outline outline-2 outline-offset-1 outline-fg" : ""} ${reachable ? "bg-surface-2" : "bg-transparent border border-dashed border-line-strong"}`}
              style={{ flex: `${p.minutes} 1 0px` }}
            >
              <span className={`absolute inset-y-0 left-0 ${isOver ? "bg-signal" : "bg-fg"}`} style={{ width: `${fill}%` }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "⋯" on the call bar: leave for the lobby (the round waits), or restart the round from phase 1. */
function CallMenu({ onLobby, onRestart }: { onLobby: () => void; onRestart: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left hover:bg-surface-2";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setConfirm(false);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Call options"
        className="grid h-11 w-11 place-items-center border border-line-strong font-mono text-base text-fg hover:border-fg-3"
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 flex w-[min(300px,calc(100vw-32px))] flex-col border border-line-strong bg-raised py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onLobby();
            }}
          >
            <span className="text-sm text-fg">Leave for the lobby</span>
            <span className="text-[12px] text-fg-3">The clock pauses; your answers wait for you.</span>
          </button>
          {confirm ? (
            <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
              <span className="text-sm text-fg">Restart from phase 1?</span>
              <span className="text-[12px] text-fg-3">This round&apos;s answers, whiteboard and clock are cleared. Past results stay.</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setConfirm(false);
                    onRestart();
                  }}
                  className="min-h-10 bg-bad px-3 text-sm font-semibold text-white"
                >
                  Restart
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="min-h-10 border border-line-strong px-3 text-sm text-fg hover:border-fg-3">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" role="menuitem" className={item} onClick={() => setConfirm(true)}>
              <span className="text-sm text-fg">Restart the round</span>
              <span className="text-[12px] text-fg-3">Start again from phase 1 at the same level.</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Transcript

function Bubble({ it, who, fresh }: { it: FeedItem; who: string; fresh: boolean }) {
  if (it.kind === "enter")
    return (
      <li className="flex items-center gap-3 pt-2" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">{it.text}</span>
        <span className="h-px flex-1 bg-line" />
      </li>
    );
  const tone =
    it.kind === "curveball"
      ? "border-2 border-signal bg-surface"
      : it.kind === "hint"
        ? "border border-dashed border-line-strong bg-bg"
        : it.kind === "auto"
          ? "border border-line bg-bg text-fg-3"
          : "border border-line bg-surface-2";
  const tag = it.kind === "curveball" ? `curveball${it.title ? ` · ${it.title}` : ""}` : it.kind === "hint" ? "hint · noted by the interviewer" : it.kind === "auto" ? "keeping time" : "";
  return (
    <li className={`flex flex-col gap-1.5 ${fresh ? "animate-hk-in" : ""}`}>
      <span className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-label text-fg-3">
        <span className={`uppercase ${it.kind === "curveball" ? "font-semibold text-signal-text" : ""}`}>
          {who}
          {tag ? ` · ${tag}` : ""}
        </span>
        <span className="tabular-nums">{mmss(it.at)}</span>
      </span>
      <InlineHtml html={it.html} className={`px-3.5 py-3 text-[15px] leading-relaxed text-fg-2 ${tone}`} />
    </li>
  );
}

function Transcript({ mock, run, items, running }: { mock: MockInterview; run: MockRun; items: FeedItem[]; running: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const who = firstName(mock.interviewer.name);
  const current = mock.phases[run.phase];
  const curStart = run.fired[`enter.${current.id}`] ?? 0;
  // this phase's messages (and the overall time call); everything else is "earlier in the call"
  const isNow = (it: FeedItem) => it.at >= curStart && (it.phase === current.n || it.phase === 0);
  const earlier = items.filter((it) => !isNow(it));
  const now = items.filter(isNow);
  const last = now.filter((it) => it.kind !== "enter").slice(-1)[0];
  const count = now.length;
  // keep the newest message in view inside the (desktop) scroll box
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [count]);
  return (
    <section id="mock-transcript" aria-label="The call" className="flex scroll-mt-40 min-w-0 flex-col border border-line-strong bg-raised lg:sticky lg:top-[calc(var(--hk-header-h,61px)+104px)]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className={LABEL}>call transcript</span>
        <span className={`font-mono text-[11px] ${running ? "text-signal-text" : "text-fg-3"}`}>{running ? "live" : "paused"}</span>
      </div>
      <div ref={listRef} className="flex flex-col gap-4 px-4 py-4 lg:max-h-[calc(100vh-var(--hk-header-h,61px)-190px)] lg:overflow-y-auto">
        <details className="group border border-fg bg-surface" open={run.phase === 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2 font-mono text-[11px] uppercase tracking-label text-fg">
            whiteboard · the problem
            <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-line px-3.5 py-3">
            <CourseHtml html={mock.problemHtml} size={15} />
          </div>
        </details>
        {earlier.length > 0 && (
          <details className="group">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3 hover:text-fg">
              <span aria-hidden className="transition-transform group-open:rotate-90">
                ›
              </span>
              earlier in the call · {earlier.filter((it) => it.kind !== "enter").length} messages
            </summary>
            <ol className="m-0 mt-3 flex list-none flex-col gap-3.5 p-0">
              {earlier.map((it) => (
                <Bubble key={it.id} it={it} who={who} fresh={false} />
              ))}
            </ol>
          </details>
        )}
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {now.map((it) => (
            <Bubble key={it.id} it={it} who={who} fresh={it === last} />
          ))}
        </ol>
        <p aria-live="polite" className="sr-only">
          {last ? `${who}: ${last.text}` : ""}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Workspace

function Workspace({ mock, run, phase, items, skipWarn, onDone, onHint, setNote, setAnswer, setBoard, setSketch }: Props & { phase: MockPhase; items: FeedItem[] }) {
  const [tab, setTab] = useState<"notes" | "board">("notes");
  const latestRef = useRef<HTMLDivElement>(null);
  const wantScroll = useRef(false);
  // phones: the transcript sits above the workspace, so repeat the newest line here
  const latest = items.filter((it) => it.phase === phase.n && (it.kind === "say" || it.kind === "auto" || it.kind === "hint")).slice(-1)[0];
  const replied = !!run.submitted[phase.id];
  useEffect(() => {
    if (!wantScroll.current || !replied) return;
    wantScroll.current = false;
    // phones only (the card is hidden on desktop): bring the reply / curveball into view
    const el = latestRef.current;
    if (el && el.offsetParent !== null) window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [replied]);
  const who = firstName(mock.interviewer.name);
  const curveballs = firedCurveballs(phase, run);
  const pending = pendingOnSubmit(mock, run, run.phase);
  const isLast = run.phase + 1 >= mock.phases.length;
  const next = mock.phases[run.phase + 1];
  const hintsUsed = run.hints[phase.id] || 0;
  const hintsLeft = phase.hints.length - hintsUsed;
  const note = run.notes[phase.id] || "";
  const w = words(note);
  const openCurve = curveballs.filter((c) => words(run.answers[c.id] || "") < 5);

  const done = () => {
    if (pending.length && !run.submitted[phase.id]) wantScroll.current = true;
    onDone();
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      done();
    }
  };

  const doneLabel = !run.submitted[phase.id] && pending.length ? "Done with this part ↵" : isLast ? "End the interview" : `Next · ${next?.title} →`;

  return (
    <section aria-labelledby="ws-h" className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          Phase {phase.n} of {mock.phases.length} · {phase.minutes} min budget
        </span>
        <h2 id="ws-h" className="m-0 font-display text-[clamp(30px,4.2vw,52px)] font-extrabold leading-[0.95] tracking-[-0.045em] text-fg">
          {phase.title}
          <span className="text-signal-text">.</span>
        </h2>
      </div>

      {latest && (
        <div ref={latestRef} className="flex scroll-mt-48 flex-col gap-1.5 lg:hidden" aria-hidden>
          <span className="flex items-baseline justify-between gap-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
            <span>latest from {who}</span>
            <a href="#mock-transcript" className="normal-case tracking-normal text-signal-text underline underline-offset-4">
              full transcript ↑
            </a>
          </span>
          <InlineHtml html={latest.html} className="border border-line bg-surface-2 px-3.5 py-3 text-[15px] leading-relaxed text-fg-2" />
        </div>
      )}

      {curveballs.map((c) => {
        const v = run.answers[c.id] || "";
        return (
          <div key={c.id} className="flex flex-col gap-3 border-2 border-signal bg-surface p-4 sm:p-5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-label text-signal-text">Curveball{c.title ? ` · ${c.title}` : ""}</span>
            <InlineHtml html={c.html} className="text-[15px] leading-relaxed text-fg-2" />
            <Pad
              id={`cb-${c.id}`}
              label="❯ Your answer to this"
              value={v}
              onChange={(x) => setAnswer(c.id, x)}
              rows={5}
              mono={false}
              onKeyDown={onKey}
              placeholder="What changes, what breaks, what you'd do first. The interviewer is waiting on this one."
              right={<span className="font-mono text-xs text-fg-3">{words(v)} words</span>}
            />
          </div>
        );
      })}

      <AiInterviewer slug={mock.slug} startedAt={run.startedAt} phaseId={phase.id} interviewer={mock.interviewer.name} notes={note} />

      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Workspace" className="flex gap-1 border-b border-line">
          {(
            [
              ["notes", `Answer · P${phase.n}`],
              ["board", "Whiteboard"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              onClick={() => setTab(k)}
              className={`-mb-px min-h-11 border-b-2 px-3.5 font-mono text-[12px] uppercase tracking-label ${tab === k ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
            >
              {label}
              {k === "board" && (run.board.trim() || (run.sketch && run.sketch.length > 20)) ? " ·" : ""}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== "notes"}>
          <Pad
            id={`notes-${phase.id}`}
            label="❯ Your answer · autosaved"
            value={note}
            onChange={(v) => setNote(phase.id, v)}
            rows={13}
            onKeyDown={onKey}
            placeholder={placeholderFor(phase.title)}
            right={<span className="font-mono text-xs text-fg-3">{w} words</span>}
          />
        </div>
        <div role="tabpanel" id="panel-board" aria-labelledby="tab-board" hidden={tab !== "board"} className={tab === "board" ? "flex flex-col gap-2" : "hidden"}>
          {tab === "board" && <BoardCanvas value={run.sketch || ""} onChange={setSketch} />}
          <Pad
            id="mock-board"
            label="❯ Notes on the board · shared across phases"
            value={run.board}
            onChange={setBoard}
            rows={4}
            placeholder={"Numbers, assumptions, open questions…"}
          />
        </div>
      </div>

      {skipWarn && openCurve.length > 0 && (
        <p role="alert" className="m-0 border border-signal bg-surface px-4 py-3 text-[15px] text-fg-2">
          {who} is still waiting for your answer to the curveball. Answer it above, or press the button again to move on without it (it will show up as a red flag).
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border border-line-strong bg-surface px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={onHint}
          disabled={hintsLeft <= 0}
          className="min-h-11 border border-line-strong px-3.5 text-sm text-fg hover:border-fg-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase.hints.length === 0 ? "No hints in this phase" : hintsLeft > 0 ? `Ask for a hint (${hintsLeft} left)` : "No hints left"}
        </button>
        <div className="flex flex-1 flex-col items-stretch gap-1 sm:flex-none sm:items-end">
          <button type="button" onClick={done} className="min-h-[52px] bg-signal px-5 text-base font-semibold text-on-signal hover:opacity-90">
            {doneLabel}
          </button>
          <span className="hidden font-mono text-[11px] text-fg-3 sm:block">
            {!run.submitted[phase.id] && pending.length ? `${who} will respond before you move on` : "⌘/Ctrl + Enter"}
          </span>
        </div>
      </div>
    </section>
  );
}
