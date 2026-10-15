"use client";

import Link from "next/link";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import BookmarkButton from "@/components/BookmarkButton";
import { scrollToId } from "./layout";
import { stagePosition, fmtMin } from "./stageText";
import type { ReaderMeta } from "./types";

/** Phone labels for the inline stat row ("29 code" instead of "29 code blocks"). */
const SHORT_STAT: Record<string, string> = { "code blocks": "code", "code block": "code", "interview Qs": "Qs", "timed phases": "phases" };

/**
 * Breadcrumb, kind badge, title, real reading time, stage position, XP, resume.
 *
 * Phones and tablets (< lg) get a compact hero so the first paragraph is on the first screen:
 * a one-line breadcrumb with an icon bookmark, one meta line, a sane title size and the stats as
 * a single inline row. The two desktop columns collapse with `display: contents` into one grid,
 * so every control (the bookmark especially) exists once.
 */
export default function LessonHero({ meta }: { meta: ReaderMeta }) {
  const p = useLessonProgress();
  const { stages, required, current, completed, minutesLeft, lastStage, ready } = p;
  const { n, total } = stagePosition(current, required);
  const curStage = stages.find((s) => s.id === current);
  const warm = current === "preface" || current === "intro";

  let stageChip: string;
  if (completed) stageChip = `COMPLETED · ${total}/${total} ${total === 1 ? "STAGE" : "STAGES"}`;
  else if (warm) stageChip = `${(curStage?.label ?? "Preface").toUpperCase()} · ~${minutesLeft} MIN LEFT`;
  else if (n && total > 1) stageChip = `STAGE ${n}/${total} · ~${minutesLeft} MIN LEFT`;
  else stageChip = `~${minutesLeft} MIN LEFT`;

  // phone meta line: "40 min · Preface · +60 XP"
  const started = ready && !completed && current !== stages[0]?.id;
  const phoneTime = started ? `~${minutesLeft} min left` : fmtMin(meta.readingMinutes);
  const phoneStage = completed ? "cleared" : warm ? (curStage?.label ?? "Preface") : n && total > 1 ? `Stage ${n}/${total}` : null;

  const resume = ready && !completed && lastStage && lastStage !== stages[0]?.id && lastStage !== current ? stages.find((s) => s.id === lastStage) : null;
  const phoneWeek = meta.weekCode.startsWith("W") ? `${meta.weekCode} · ${meta.weekTopic}` : meta.weekLabel;
  // a long subtitle is the lesson's own first paragraph (lede): phones skip it, the article starts right below
  const longSubtitle = (meta.subtitle?.length ?? 0) > 110 || !!meta.subtitle?.endsWith("…");

  return (
    <section className="mx-auto grid max-w-[1320px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 pb-5 pt-2 sm:px-6 sm:pb-6 sm:pt-4 lg:flex lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-12 lg:gap-y-6 lg:pb-7 lg:pt-7">
      <div className="contents lg:flex lg:min-w-0 lg:flex-[1_1_620px] lg:flex-col lg:gap-4">
        <nav
          aria-label="Breadcrumb"
          className="col-start-1 row-start-1 flex min-w-0 items-center gap-x-2 whitespace-nowrap font-mono text-[12px] sm:text-[13px] lg:flex-wrap lg:gap-x-2.5 lg:gap-y-1 lg:whitespace-normal"
        >
          <Link href={`/learn/${meta.course}`} className="shrink-0 py-3 text-fg-3 hover:text-fg lg:py-1.5">
            course
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <Link href={`/learn/${meta.course}#${meta.week}`} className="min-w-0 truncate py-3 text-fg-3 hover:text-fg lg:py-1.5">
            <span className="lg:hidden">{phoneWeek}</span>
            <span className="hidden lg:inline">
              {meta.weekLabel} · {meta.weekTopic}
            </span>
          </Link>
          <span aria-hidden className="hidden text-line-strong lg:inline">›</span>
          <span aria-current="page" className="hidden text-fg lg:inline">
            {meta.shortLabel}
          </span>
        </nav>

        {/* phones: one meta line */}
        <p className="col-span-2 row-start-2 m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-fg-2 lg:hidden">
          <span className="bg-signal px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] text-on-signal">{meta.shortLabel}</span>
          <span>{phoneTime}</span>
          {phoneStage && (
            <>
              <span aria-hidden className="text-fg-4">·</span>
              <span className={completed ? "text-fg" : "text-signal-text"}>{phoneStage}</span>
            </>
          )}
          <span aria-hidden className="text-fg-4">·</span>
          <span className={completed ? "text-fg" : ""}>{completed ? "+60 XP ✓" : "+60 XP"}</span>
        </p>

        {/* desktop: chips */}
        <div className="hidden flex-wrap gap-2 font-mono text-xs tracking-[0.06em] lg:flex">
          <span className="bg-signal px-2.5 py-1.5 font-semibold text-on-signal">{meta.kindBadge}</span>
          <span className="border border-line-strong px-2.5 py-1.5 text-fg-2">{fmtMin(meta.readingMinutes).toUpperCase()} READ</span>
          <span className="border border-signal px-2.5 py-1.5 text-signal-text">{stageChip}</span>
          <span className={`border px-2.5 py-1.5 ${completed ? "border-line-strong bg-fg text-bg" : "border-line-strong text-fg-2"}`}>
            {completed ? "+60 XP ✓" : "+60 XP"}
          </span>
        </div>

        <h1 className="col-span-2 row-start-3 m-0 mt-3 break-words font-display text-[clamp(30px,8.6vw,46px)] font-extrabold leading-[0.95] tracking-[-0.04em] lg:mt-0 lg:text-[clamp(40px,6.4vw,92px)] lg:leading-[0.9] lg:tracking-[-0.05em]">
          {meta.title}
          <span className="text-signal-text">.</span>
        </h1>
        {meta.subtitle && (
          <p
            className={`col-span-2 row-start-4 m-0 mt-2 line-clamp-2 max-w-[680px] text-[15px] leading-snug text-fg-2 sm:text-base lg:mt-0 lg:line-clamp-none lg:text-lg lg:leading-relaxed ${
              longSubtitle ? "hidden lg:block" : ""
            }`}
          >
            {meta.subtitle}
          </p>
        )}
      </div>

      <div className="contents lg:flex lg:min-w-0 lg:flex-[0_1_420px] lg:flex-col lg:gap-2.5">
        {meta.stats.length > 0 && (
          <>
            {/* phones: one inline row */}
            <p className="col-span-2 row-start-5 m-0 mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[13px] text-fg-3 lg:hidden">
              {meta.stats.map((s) => (
                <span key={s.label} className="whitespace-nowrap">
                  <span className="font-mono font-semibold text-fg">{s.value}</span> {SHORT_STAT[s.label] ?? s.label}
                </span>
              ))}
            </p>
            <dl
              className={`m-0 hidden gap-px border border-line bg-line lg:grid ${meta.stats.length >= 3 ? "grid-cols-2 sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" : "[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"}`}
              style={{ ["--n" as string]: meta.stats.length }}
            >
              {meta.stats.map((s) => (
                <div key={s.label} className="flex min-w-0 flex-col-reverse gap-0.5 bg-bg px-3.5 py-2.5">
                  <dt className="truncate text-xs text-fg-3">{s.label}</dt>
                  <dd className="m-0 font-mono text-xl font-semibold">{s.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <div className="contents lg:flex lg:flex-wrap lg:items-center lg:gap-2.5">
          {resume ? (
            <button
              type="button"
              onClick={() => scrollToId(resume.id)}
              className="col-span-2 row-start-6 mt-3 min-h-11 justify-self-start bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90 lg:mt-0"
            >
              Resume at {resume.label} ›
            </button>
          ) : (
            <span className="hidden text-[13px] text-fg-3 lg:inline">
              {completed
                ? "Cleared. Revisiting keeps it cleared."
                : ready && curStage && current !== stages[0]?.id
                  ? `Reading ${curStage.label} · ${curStage.title}`
                  : `${total > 1 ? `${total} ${stages.some((s) => s.budgetMinutes) ? "phases" : "stages"}` : "One stage"} · save a checkpoint to resume by stage on any device`}
            </span>
          )}
          <span className="hidden flex-1 lg:block" />
          {/* phones: icon-only bookmark beside the breadcrumb */}
          <div className="col-start-2 row-start-1 max-lg:[&>button>span]:sr-only max-lg:[&>button]:h-11 max-lg:[&>button]:w-11 max-lg:[&>button]:justify-center max-lg:[&>button]:px-0">
            <BookmarkButton courseId={meta.course} week={meta.week} lessonSlug={meta.slug} lessonTitle={meta.title} />
          </div>
        </div>
      </div>
    </section>
  );
}
