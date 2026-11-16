"use client";

/**
 * One module of the course outline: a button row (code, title, meta, thin bar, status) that opens to its lessons,
 * checkpoint rows, and the planned "Skip ahead" and "Module review" rows. State is always a glyph or a word, never
 * colour alone: a ring with a tick (done), "Next", "2 of 6", "Soon".
 */
import Link from "next/link";
import { Check, ChevronDown, Play, ShieldCheck } from "lucide-react";
import { clock, useLectureSeconds, type LectureRef } from "./useLectureSeconds";
import { fmtDuration, type OutlineCheckpoint, type OutlineLesson, type OutlineModule } from "@/lib/dsa/outline";
import { readProgress, isWatched } from "@/lib/learn/lecture/progress";

export type ModuleView = {
  module: OutlineModule;
  done: number;
  current: boolean;
  open: boolean;
};

function Ring({ state }: { state: "done" | "now" | "todo" | "soon" }) {
  return (
    <span
      aria-hidden
      className={`grid h-5 w-5 shrink-0 place-items-center border-2 ${
        state === "done" ? "border-ok bg-ok text-on-ok" : state === "now" ? "border-signal" : state === "soon" ? "border-dashed border-line-strong" : "border-line-strong"
      }`}
      style={{ borderRadius: "999px" }}
    >
      {state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}

function LessonRow({
  lesson,
  done,
  now,
  lectures,
  mediaBase,
  lecturesView,
  flags,
}: {
  lesson: OutlineLesson;
  done: boolean;
  now: boolean;
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  lecturesView: boolean;
  flags: Record<string, unknown>;
}) {
  const lec = lectures[lesson.conceptId] ?? null;
  const secs = useLectureSeconds(mediaBase, lec, lecturesView && lesson.built);
  const watched = lec ? isWatched(readProgress(flags, lec.slug)) : false;
  const meta = !lesson.built
    ? "Soon"
    : lecturesView
      ? secs
        ? `${clock(secs)}${watched ? " · watched" : ""}`
        : "No lecture yet"
      : [lesson.minutes ? `${lesson.minutes} min` : "", lesson.problemCount ? `${lesson.problemCount} ${lesson.problemCount === 1 ? "problem" : "problems"}` : ""].filter(Boolean).join(" · ");
  const body = (
    <>
      <Ring state={done ? "done" : now ? "now" : lesson.built ? "todo" : "soon"} />
      <span className={`min-w-0 flex-1 text-[14.5px] ${now ? "font-semibold text-fg" : lesson.built ? "text-fg" : "text-fg-3"}`}>
        {lesson.title}
        {done ? <span className="sr-only"> (done)</span> : null}
        {now ? <span className="sr-only"> (current lesson)</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-fg-3">
        {lecturesView && lesson.built && secs ? <Play className="h-3 w-3" aria-hidden /> : null}
        {meta}
      </span>
    </>
  );
  const cls = `flex min-h-11 items-center gap-3 border-t border-line px-4 py-2 first:border-t-0 ${now ? "bg-surface-2 shadow-[inset_3px_0_0_var(--c-signal)]" : ""}`;
  if (!lesson.built || !lesson.href) return <div className={cls}>{body}</div>;
  return (
    <Link href={lecturesView && lec ? `/dsa/concepts/${lesson.conceptId}/lecture` : lesson.href} className={`${cls} hover:bg-surface-2`}>
      {body}
    </Link>
  );
}

function CheckpointRow({ cp, done }: { cp: OutlineCheckpoint; done: boolean }) {
  const body = (
    <>
      <ShieldCheck className={`h-5 w-5 shrink-0 ${done ? "text-ok-text" : "text-fg-3"}`} aria-hidden />
      <span className="min-w-0 flex-1 text-[14px] font-medium text-fg-2">
        Checkpoint: quiz{cp.problems.length ? ` + ${cp.problems.length} mixed problems` : ""}
        {cp.hasLab ? " + build-it lab" : ""}
        {done ? <span className="sr-only"> (passed)</span> : null}
      </span>
      <span className="shrink-0 text-[12.5px] text-fg-3">{done ? "Passed" : cp.built ? `about ${cp.minutes} min` : "Soon"}</span>
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 border-t border-line bg-bg px-4 py-2";
  return cp.href && cp.built ? (
    <Link href={cp.href} className={`${cls} hover:bg-surface-2`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function SoonRow({ label }: { label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 border-t border-line bg-bg px-4 py-2 text-fg-3">
      <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center">
        <span className="h-1.5 w-1.5 bg-line-strong" />
      </span>
      <span className="min-w-0 flex-1 text-[14px]">{label}</span>
      <span className="shrink-0 text-[12.5px]">Soon</span>
    </div>
  );
}

export default function ModuleRow({
  v,
  nowLesson,
  concepts,
  checkpoints,
  onToggle,
  lectures,
  mediaBase,
  lecturesView,
  flags,
  anchor,
}: {
  v: ModuleView;
  nowLesson: string | null;
  concepts: ReadonlySet<string>;
  checkpoints: ReadonlySet<string>;
  onToggle: () => void;
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  lecturesView: boolean;
  flags: Record<string, unknown>;
  anchor: string;
}) {
  const { module: m, done, current, open } = v;
  const ready = m.readyLessons;
  const pct = ready ? Math.round((done / ready) * 100) : 0;
  const finished = ready > 0 && done === ready;
  const status = m.planned ? "Soon" : finished ? "Done" : current && done === 0 ? "Next" : `${done} of ${ready}`;
  const meta = m.planned
    ? `${m.lessons.length} lessons planned`
    : `${m.lessons.length} ${m.lessons.length === 1 ? "lesson" : "lessons"}${m.minutes ? ` · ${fmtDuration(m.minutes)}` : ""}`;
  const panel = `${anchor}-panel`;
  return (
    <div id={anchor} className="scroll-mt-28 border-t border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panel}
        className={`grid w-full min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text sm:grid-cols-[3rem_minmax(0,1fr)_9.5rem_7.5rem_4.5rem] sm:px-6 ${current ? "shadow-[inset_3px_0_0_var(--c-signal)]" : ""}`}
      >
        <span className="hidden font-mono text-[12px] text-fg-3 sm:block">{m.step}</span>
        <span className="sm:hidden">
          <Ring state={finished ? "done" : current ? "now" : m.planned ? "soon" : "todo"} />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[15px] ${open || current ? "font-semibold" : "font-medium"} ${m.planned ? "text-fg-2" : "text-fg"}`}>{m.title}</span>
          <span className="block truncate text-[12.5px] text-fg-3 sm:hidden">{meta}</span>
        </span>
        <span className="hidden text-[13px] text-fg-3 sm:block">{meta}</span>
        <span aria-hidden className="hidden h-1.5 bg-line dark:bg-line-strong sm:block">
          <span className={`block h-1.5 ${finished ? "bg-ok" : "bg-signal"}`} style={{ width: `${pct}%` }} />
        </span>
        <span className="flex items-center justify-end gap-1.5 text-[13px] font-medium text-fg-2">
          {finished ? <Check className="h-3.5 w-3.5 text-ok-text" aria-hidden /> : null}
          {status}
          <ChevronDown className={`h-3.5 w-3.5 text-fg-3 transition-transform sm:hidden ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {open && (
        <div id={panel} className="mx-4 mb-4 border border-line sm:ml-[4.5rem] sm:mr-6">
          {m.lessons.map((l) => (
            <div key={l.nodeId}>
              <LessonRow lesson={l} done={concepts.has(l.conceptId)} now={nowLesson === l.conceptId} lectures={lectures} mediaBase={mediaBase} lecturesView={lecturesView} flags={flags} />
              {m.checkpoints.filter((c) => c.afterLesson === l.conceptId).map((c) => (
                <CheckpointRow key={c.nodeId} cp={c} done={checkpoints.has(c.nodeId)} />
              ))}
            </div>
          ))}
          {m.checkpoints.filter((c) => !m.lessons.some((l) => l.conceptId === c.afterLesson)).map((c) => (
            <CheckpointRow key={c.nodeId} cp={c} done={checkpoints.has(c.nodeId)} />
          ))}
          <SoonRow label="Skip ahead: a short check to skip this module" />
          <SoonRow label={m.boss ? `Module review: ${m.boss.title}` : "Module review"} />
        </div>
      )}
    </div>
  );
}
