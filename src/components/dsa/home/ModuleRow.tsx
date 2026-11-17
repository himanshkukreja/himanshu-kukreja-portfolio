"use client";

/**
 * One module of the course outline: a button row (code, title, meta, thin bar, status) that opens to its lessons,
 * checkpoint rows, and the planned "Skip ahead" and "Module review" rows. State is always a glyph or a word, never
 * colour alone: a ring with a tick (done), "Next", "2 of 6", "Soon".
 */
import Link from "next/link";
import { Check, ChevronDown, Play, ShieldCheck } from "lucide-react";
import { clock, useLectureSeconds, type LectureRef } from "./useLectureSeconds";
import { fmtDuration, type OutlineBranch, type OutlineCheckpoint, type OutlineLesson, type OutlineModule } from "@/lib/dsa/outline";
import { LEAN_BRANCH_WORD } from "@/lib/dsa/kinds";
import { readProgress, isWatched } from "@/lib/learn/lecture/progress";

export type ModuleView = {
  module: OutlineModule;
  done: number;
  current: boolean;
  open: boolean;
};

function Ring({ state, small = false }: { state: "done" | "now" | "todo" | "soon"; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center border-2 ${small ? "h-3.5 w-3.5" : "h-5 w-5"} ${
        state === "done" ? "border-ok bg-ok text-on-ok" : state === "now" ? "border-signal" : state === "soon" ? "border-dashed border-line-strong" : "border-line-strong"
      }`}
      style={{ borderRadius: "999px" }}
    >
      {state === "done" && !small ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
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
      <span className={`min-w-0 flex-1 text-[14px] sm:text-[15px] ${now ? "font-semibold text-fg" : lesson.built ? "text-fg" : "text-fg-3"}`}>
        {lesson.title}
        {done ? <span className="sr-only"> (done)</span> : null}
        {now ? <span className="sr-only"> (current lesson)</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[12px] text-fg-3 sm:text-[13px]">
        {lecturesView && lesson.built && secs ? <Play className="h-3 w-3" aria-hidden /> : null}
        {meta}
      </span>
    </>
  );
  const cls = `flex min-h-11 items-center gap-3 border-t border-line px-4 py-[9px] first:border-t-0 ${now ? "bg-bg" : ""}`;
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
      <span className="min-w-0 flex-1 text-[14px] font-medium text-fg sm:text-[15px]">
        Checkpoint: quiz{cp.problems.length ? ` + ${cp.problems.length} mixed problems` : ""}
        {cp.hasLab ? " + build-it lab" : ""}
        {done ? <span className="sr-only"> (passed)</span> : null}
      </span>
      <span className="shrink-0 text-[12px] text-fg-3 sm:text-[13px]">{done ? "Passed" : cp.built ? `about ${cp.minutes} min` : "Soon"}</span>
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 border-t border-line bg-raised px-4 py-[9px]";
  return cp.href && cp.built ? (
    <Link href={cp.href} className={`${cls} hover:bg-surface-2`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A side branch of the module (a street, camp tent or gap set): optional, lighter than the lessons, never counted in the module's totals. */
function BranchRow({ b, done }: { b: OutlineBranch; done: boolean }) {
  return (
    <Link href={b.href} className="flex min-h-11 items-center gap-3 border-t border-line bg-raised px-4 py-[9px] pl-6 hover:bg-surface-2" data-branch-row>
      <span aria-hidden className={`ml-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-fg-3 ${done ? "bg-fg-3" : "bg-surface"}`} />
      <span className="min-w-0 flex-1 text-[14px] text-fg">
        <span className="text-fg-3">{LEAN_BRANCH_WORD[b.kind]}</span> · {b.title}
        {done ? <span className="sr-only"> (done)</span> : null}
      </span>
      <span className="shrink-0 text-[12px] text-fg-3 sm:text-[13px]">{[b.minutes ? `${b.minutes} min` : "", b.problemCount ? `${b.problemCount} problems` : ""].filter(Boolean).join(" · ")}</span>
    </Link>
  );
}

function SoonRow({ label }: { label: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 border-t border-line bg-raised px-4 py-[9px] text-fg-3">
      <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center">
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
      </span>
      <span className="min-w-0 flex-1 text-[14px]">{label}</span>
      <span className="shrink-0 text-[12px] sm:text-[13px]">Soon</span>
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
    <div id={anchor} className={`scroll-mt-28 ${current ? "bg-bg sm:bg-transparent" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panel}
        className="group block w-full px-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text sm:px-6"
      >
        <span className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 border-t border-line py-2.5 group-hover:border-line sm:min-h-[50px] sm:grid-cols-[70px_minmax(0,1fr)_170px_120px_64px] sm:gap-x-3.5 sm:py-[13px]">
        <span className="hidden font-mono text-[12px] text-fg-4 sm:block">{m.step}</span>
        <span className="sm:hidden">
          <Ring small state={finished ? "done" : current ? "now" : m.planned ? "soon" : "todo"} />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[14px] group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4 sm:text-[15px] ${open || current ? "font-semibold" : "font-normal sm:font-medium"} ${m.planned ? "text-fg-2" : "text-fg"}`}>{m.title}</span>
        </span>
        <span className="hidden truncate text-[13px] text-fg-3 sm:block">{meta}</span>
        <span aria-hidden className="hidden h-1.5 overflow-hidden rounded-full bg-line dark:bg-line-strong sm:block">
          <span className={`block h-1.5 rounded-full ${finished ? "bg-ok" : "bg-signal"}`} style={{ width: `${pct}%` }} />
        </span>
        <span className={`flex items-center justify-end gap-1 text-[12px] font-medium sm:text-[13px] ${finished ? "text-ok-text" : "text-fg-2"}`}>
          <span className="sm:hidden">{finished ? "Done" : m.planned ? "Soon" : `${done} of ${ready}`}</span>
          <span className="hidden sm:inline">{status}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-fg-3 transition-transform sm:hidden ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
        </span>
      </button>
      {open && (
        <div id={panel} className="mx-4 mb-3.5 overflow-hidden rounded-xl border border-line sm:ml-[108px] sm:mr-6">
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
          {m.branches.length ? <p className="m-0 border-t border-line bg-raised px-4 pb-1 pt-2.5 font-mono text-[11px] tracking-[0.06em] text-fg-3">ALSO ON THIS STOP · OPTIONAL</p> : null}
          {m.branches.map((b) => (
            <BranchRow key={b.key} b={b} done={concepts.has(b.key)} />
          ))}
          <SoonRow label="Skip ahead: a short check to skip this module" />
          <SoonRow label={m.boss ? `Module review: ${m.boss.title}` : "Module review"} />
        </div>
      )}
    </div>
  );
}
