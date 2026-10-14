"use client";

import Link from "next/link";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import BookmarkButton from "@/components/BookmarkButton";
import { scrollToId } from "./layout";
import { stagePosition, fmtMin } from "./stageText";
import type { ReaderMeta } from "./types";

/** Breadcrumb, kind badge, title, real reading time, stage position, XP, resume. */
export default function LessonHero({ meta }: { meta: ReaderMeta }) {
  const p = useLessonProgress();
  const { stages, required, current, completed, minutesLeft, lastStage, ready } = p;
  const { n, total } = stagePosition(current, required);
  const curStage = stages.find((s) => s.id === current);

  let stageChip: string;
  if (completed) stageChip = `COMPLETED · ${total}/${total} ${total === 1 ? "STAGE" : "STAGES"}`;
  else if (current === "preface" || current === "intro") stageChip = `${(curStage?.label ?? "Preface").toUpperCase()} · ~${minutesLeft} MIN LEFT`;
  else if (n && total > 1) stageChip = `STAGE ${n}/${total} · ~${minutesLeft} MIN LEFT`;
  else stageChip = `~${minutesLeft} MIN LEFT`;

  const resume = ready && !completed && lastStage && lastStage !== stages[0]?.id && lastStage !== current ? stages.find((s) => s.id === lastStage) : null;

  return (
    <section className="mx-auto flex max-w-[1320px] flex-wrap items-end justify-between gap-x-12 gap-y-6 px-4 pb-7 pt-7 sm:px-6">
      <div className="flex min-w-0 flex-[1_1_620px] flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[13px]">
          <Link href={`/learn/${meta.course}`} className="py-1.5 text-fg-3 hover:text-fg">
            course
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <Link href={`/learn/${meta.course}#${meta.week}`} className="py-1.5 text-fg-3 hover:text-fg">
            {meta.weekLabel} · {meta.weekTopic}
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <span aria-current="page" className="text-fg">
            {meta.shortLabel}
          </span>
        </nav>

        <div className="flex flex-wrap gap-2 font-mono text-xs tracking-[0.06em]">
          <span className="bg-signal px-2.5 py-1.5 font-semibold text-on-signal">{meta.kindBadge}</span>
          <span className="border border-line-strong px-2.5 py-1.5 text-fg-2">{fmtMin(meta.readingMinutes).toUpperCase()} READ</span>
          <span className="border border-signal px-2.5 py-1.5 text-signal-text">{stageChip}</span>
          <span className={`border px-2.5 py-1.5 ${completed ? "border-line-strong bg-fg text-bg" : "border-line-strong text-fg-2"}`}>
            {completed ? "+60 XP ✓" : "+60 XP"}
          </span>
        </div>

        <h1 className="m-0 break-words font-display text-[clamp(40px,6.4vw,92px)] font-extrabold leading-[0.9] tracking-[-0.05em]">
          {meta.title}
          <span className="text-signal-text">.</span>
        </h1>
        {meta.subtitle && <p className="m-0 max-w-[680px] text-lg leading-relaxed text-fg-2">{meta.subtitle}</p>}
      </div>

      <div className="flex min-w-0 flex-[0_1_420px] flex-col gap-2.5">
        {meta.stats.length > 0 && (
          <dl
            className={`m-0 grid gap-px border border-line bg-line ${meta.stats.length >= 3 ? "grid-cols-2 sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" : "[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"}`}
            style={{ ["--n" as string]: meta.stats.length }}
          >
            {meta.stats.map((s) => (
              <div key={s.label} className="flex min-w-0 flex-col-reverse gap-0.5 bg-bg px-3.5 py-2.5">
                <dt className="truncate text-xs text-fg-3">{s.label}</dt>
                <dd className="m-0 font-mono text-xl font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          {resume ? (
            <button
              type="button"
              onClick={() => scrollToId(resume.id)}
              className="min-h-11 bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90"
            >
              Resume at {resume.label} ›
            </button>
          ) : (
            <span className="text-[13px] text-fg-3">
              {completed
                ? "Cleared. Revisiting keeps it cleared."
                : ready && curStage && current !== stages[0]?.id
                  ? `Reading ${curStage.label} · ${curStage.title}`
                  : `${total > 1 ? `${total} ${stages.some((s) => s.budgetMinutes) ? "phases" : "stages"}` : "One stage"} · save a checkpoint to resume by stage on any device`}
            </span>
          )}
          <span className="flex-1" />
          <BookmarkButton courseId={meta.course} week={meta.week} lessonSlug={meta.slug} lessonTitle={meta.title} />
        </div>
      </div>
    </section>
  );
}
