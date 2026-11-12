"use client";

/**
 * The hero of a low-level design case study: a one-level breadcrumb (course › Low-level design ›
 * the problem; the generic reader repeated "Low-level design" and the track's name), the facts an
 * interview prep reader scans for (difficulty, round length, patterns, who asks it, code languages),
 * resume, and the "Try it first" switch.
 */
import Link from "next/link";
import BookmarkButton from "@/components/BookmarkButton";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import { scrollToId } from "@/components/learn/lesson/layout";
import { fmtMin } from "@/components/learn/lesson/stageText";
import type { ReaderMeta } from "@/components/learn/lesson/types";
import { LLD_LANGS, STEPS } from "@/lib/learn/lld/steps";
import { companyHref } from "@/lib/learn/prep/types";
import { TryFirstSwitch } from "./LldPrefs";
import { lldRoundMinutes } from "@/lib/learn/mock/lld";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

export default function LldHero({ meta }: { meta: ReaderMeta }) {
  const p = useLessonProgress();
  const lld = meta.lld;
  const name = lld?.name ?? meta.title;
  const stepNo = STEPS.findIndex((s) => s.id === p.current) + 1;
  const resume = p.ready && !p.completed && p.lastStage && p.lastStage !== "intro" && p.lastStage !== p.current ? p.stages.find((s) => s.id === p.lastStage) : null;
  const langs = LLD_LANGS.filter((l) => lld?.langs.includes(l.id));

  return (
    <section className="mx-auto max-w-[1320px] px-4 pb-5 pt-2 sm:px-6 sm:pb-6 sm:pt-4 lg:pb-7 lg:pt-7">
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-x-2 whitespace-nowrap font-mono text-[12px] sm:text-[13px]">
          <Link href="/" className="shrink-0 py-3 text-fg-3 hover:text-fg">
            course
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <Link href="/low-level-design" className="shrink-0 py-3 text-fg-3 hover:text-fg">
            Low-level design
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <span aria-current="page" className="min-w-0 truncate text-fg">
            {name}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2.5">
          <SaveOfflineButton title={meta.title} kind="lesson" compact />
          <div className="max-lg:[&>button>span]:sr-only max-lg:[&>button]:h-11 max-lg:[&>button]:w-11 max-lg:[&>button]:justify-center max-lg:[&>button]:px-0">
            <BookmarkButton courseId={meta.course} week={meta.week} lessonSlug={meta.slug} lessonTitle={meta.title} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs tracking-[0.06em]">
        <span className="bg-signal px-2.5 py-1.5 font-semibold text-on-signal">{meta.shortLabel.toUpperCase()}</span>
        {lld && <span className="border border-line-strong px-2.5 py-1.5 text-fg">{lld.difficulty.toUpperCase()}</span>}
        {lld && <span className="border border-line-strong px-2.5 py-1.5 text-fg-2">~{lld.roundMinutes} MIN ROUND</span>}
        <span className="border border-line-strong px-2.5 py-1.5 text-fg-2">{fmtMin(meta.readingMinutes).toUpperCase()} READ</span>
        {p.completed ? (
          <span className="border border-line-strong bg-fg px-2.5 py-1.5 text-bg">COMPLETED</span>
        ) : (
          stepNo > 0 && <span className="border border-signal px-2.5 py-1.5 text-signal-text">STEP {stepNo}/{STEPS.length}</span>
        )}
      </div>

      <h1 className="m-0 mt-3 break-words font-display text-[clamp(30px,8.6vw,46px)] font-extrabold leading-[0.95] tracking-[-0.04em] lg:text-[clamp(40px,6vw,84px)] lg:leading-[0.9] lg:tracking-[-0.05em]">
        {meta.title}
        <span className="text-signal-text">.</span>
      </h1>
      {meta.subtitle && <p className="m-0 mt-2 max-w-[680px] text-[15px] leading-snug text-fg-2 sm:text-base lg:text-lg lg:leading-relaxed">{meta.subtitle}</p>}

      {lld && (
        <dl className="m-0 mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,max-content))]">
          {lld.patterns.length > 0 && (
            <div className="min-w-0">
              <dt className={LABEL}>Patterns used</dt>
              <dd className="m-0 mt-1 flex flex-wrap gap-1.5">
                {lld.patterns.map((x) => (
                  <Link key={x.slug} href={x.href} className="inline-flex min-h-8 items-center border border-line-strong px-2 text-[13px] text-fg hover:border-fg">
                    {x.name}
                  </Link>
                ))}
              </dd>
            </div>
          )}
          {lld.companies.length > 0 && (
            <div className="min-w-0">
              <dt className={LABEL}>Reported at</dt>
              <dd className="m-0 mt-1 flex flex-wrap gap-1.5">
                {lld.companies.slice(0, 6).map((c) => (
                  <Link key={c.slug} href={companyHref(c.slug)} className="inline-flex min-h-8 items-center border border-line-strong px-2 text-[13px] text-fg-2 hover:border-fg hover:text-fg">
                    {c.name}
                  </Link>
                ))}
                {lld.companies.length > 6 && <span className="inline-flex min-h-8 items-center text-[13px] text-fg-3">+{lld.companies.length - 6} more</span>}
              </dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className={LABEL}>Code in</dt>
            <dd className="m-0 mt-1 text-[13px] text-fg-2">{langs.map((l) => l.label).join(", ") || "Python"}</dd>
          </div>
        </dl>
      )}

      <div className="mt-5 flex flex-wrap items-start gap-3">
        {lld && (
          // the case study as a timed machine-coding round with the AI interviewer (/mock/lld-NN-*, lib/learn/mock/lld.ts)
          <Link href={`/mock/${meta.slug}`} className="inline-flex min-h-11 items-center gap-2 bg-signal px-4 text-sm font-semibold text-on-signal hover:opacity-90">
            Mock this round
            <span className="font-mono text-[12px] font-normal opacity-80">· {lldRoundMinutes(lld.roundMinutes)} min · AI interviewer</span>
          </Link>
        )}
        {resume && (
          <button type="button" onClick={() => scrollToId(resume.id)} className="min-h-11 bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">
            Resume at {resume.label} ›
          </button>
        )}
        <div className="min-w-0 max-w-[420px]">
          <TryFirstSwitch />
        </div>
      </div>
    </section>
  );
}
