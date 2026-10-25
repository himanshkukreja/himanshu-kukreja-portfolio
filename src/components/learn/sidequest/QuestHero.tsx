"use client";

import { LOGO_NOTE } from "@/components/learn/prep/CompanyLogo";
import Link from "next/link";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import BookmarkButton from "@/components/BookmarkButton";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { LEARN_XP } from "@/lib/learn/types";
import { scrollToId } from "../lesson/layout";
import { fmtMin } from "../lesson/stageText";
import type { ReaderMeta } from "../lesson/types";
import { questBrand } from "./brands";
import QuestEmblem from "./QuestEmblem";
import { useQuestProgress } from "./useQuestProgress";

/**
 * Side quest hero: the quest's emblem and accent, a mission brief (objective, key numbers,
 * difficulty, time, XP) and a quest log of its phases. Replaces the lesson hero for kind "bonus";
 * the progress it shows is the lesson reader's own (stages) plus the page's checkpoints and quick
 * checks (useQuestProgress), so nothing new is stored.
 */
export default function QuestHero({ meta }: { meta: ReaderMeta }) {
  const p = useLessonProgress();
  const q = useQuestProgress();
  const brand = questBrand(meta.slug);
  const quest = meta.quest;
  const mission = quest?.mission ?? null;
  const { stages, required, current, completed, minutesLeft, lastStage, ready, done } = p;
  const log = required.filter((s) => s.id !== "intro" && s.id !== "preface");
  const doneN = log.filter((s) => done.has(s.id)).length;
  const started = ready && !completed && (done.size > 0 || (current !== stages[0]?.id && !!current));
  const resume = ready && !completed && lastStage && lastStage !== stages[0]?.id && lastStage !== current ? stages.find((s) => s.id === lastStage) : null;
  const firstPhase = log[0];
  const code = String(brand.n).padStart(2, "0");
  const checkpoints = q.checkpoints || quest?.checkpoints || 0;
  const quizzes = q.quizzes || quest?.quizzes || 0;
  const accent = { ["--quest-accent" as string]: brand.accent } as React.CSSProperties;

  const chips: { text: string; strong?: boolean }[] = [
    ...(mission?.level ? [{ text: mission.level.toUpperCase(), strong: true }] : []),
    { text: started ? `~${minutesLeft} MIN LEFT` : `${fmtMin(meta.readingMinutes).toUpperCase()} READ` },
    ...(quest?.phases ? [{ text: `${quest.phases} PHASES${quest.budgetMinutes ? ` · ${quest.budgetMinutes} MIN INTERVIEW` : ""}` }] : []),
    { text: completed ? `+${LEARN_XP.sideQuest} XP ✓` : `+${LEARN_XP.sideQuest} XP` },
  ];

  return (
    <section style={accent} className="mx-auto max-w-[1320px] px-4 pb-6 pt-2 sm:px-6 sm:pt-4 lg:pb-8 lg:pt-7" aria-label={`Side quest ${code}: ${meta.title}`}>
      <div className="flex items-center gap-2">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-x-2 whitespace-nowrap font-mono text-[12px] sm:text-[13px]">
          <Link href={`/learn/${meta.course}`} className="shrink-0 py-3 text-fg-3 hover:text-fg lg:py-1.5">
            course
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <Link href={`/learn/${meta.course}#side-h`} className="min-w-0 truncate py-3 text-fg-3 hover:text-fg lg:py-1.5">
            side quests
          </Link>
          <span aria-hidden className="text-line-strong">›</span>
          <span aria-current="page" className="truncate text-fg">
            SQ-{code}
          </span>
        </nav>
        <SaveOfflineButton title={meta.title} kind="sidequest" compact className="shrink-0" />
        <div className="shrink-0 max-lg:[&>button>span]:sr-only max-lg:[&>button]:h-11 max-lg:[&>button]:w-11 max-lg:[&>button]:justify-center max-lg:[&>button]:px-0">
          <BookmarkButton courseId={meta.course} week={meta.week} lessonSlug={meta.slug} lessonTitle={meta.title} />
        </div>
      </div>

      {/* identity */}
      <div className="mt-2 flex items-start gap-4 sm:gap-6 lg:mt-4">
        <div className="relative shrink-0">
          <QuestEmblem brand={brand} size={64} className="sm:hidden" />
          <QuestEmblem brand={brand} size={112} className="hidden sm:block" />
          {completed && (
            <span className="absolute -bottom-2 -right-2 bg-fg px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-label text-bg">CLEARED</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2.5">
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-label text-fg-3 sm:text-xs">
            <span className="bg-signal px-1.5 py-0.5 font-semibold text-on-signal">Side quest {code}</span>
            <span>{brand.field}</span>
          </p>
          <h1 className="m-0 break-words font-display text-[clamp(30px,8.4vw,44px)] font-extrabold leading-[0.95] tracking-[-0.04em] lg:text-[clamp(44px,5.6vw,80px)] lg:leading-[0.9] lg:tracking-[-0.05em]">
            {meta.title}
            <span className="text-signal-text">.</span>
          </h1>
          {meta.subtitle && meta.subtitle.length <= 110 && <p className="m-0 max-w-[680px] text-[15px] leading-snug text-fg-2 sm:text-lg">{meta.subtitle}</p>}
        </div>
      </div>

      <p className="m-0 mt-4 flex flex-wrap gap-1.5 font-mono text-[11px] tracking-[0.06em] sm:mt-5 sm:gap-2 sm:text-xs">
        {chips.map((c) => (
          <span key={c.text} className={c.strong ? "bg-fg px-2 py-1 font-semibold text-bg sm:px-2.5 sm:py-1.5" : "border border-line-strong px-2 py-1 text-fg-2 sm:px-2.5 sm:py-1.5"}>
            {c.text}
          </span>
        ))}
      </p>

      {/* mission brief */}
      <div className="quest-brief mt-3 grid border border-line-strong bg-surface sm:mt-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3 border-t-4 p-3.5 sm:gap-4 sm:p-6" style={{ borderTopColor: "var(--quest-accent)" }}>
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Mission brief</span>
          {mission?.objective ? (
            <p className="m-0 font-display text-[20px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[28px]">{mission.objective}</p>
          ) : (
            <p className="m-0 font-display text-[20px] font-bold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[28px]">Design {brand.product} end to end, the way a senior interview would ask it.</p>
          )}
          {mission?.brief && <p className="m-0 hidden max-w-[620px] text-[15px] leading-relaxed text-fg-2 sm:block">{mission.brief}</p>}

          <div className="flex flex-col gap-2">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
              <span>Quest log</span>
              <span className="normal-case tracking-normal">
                {doneN}/{log.length} stages
                {checkpoints > 0 && ` · ${q.checkpointsDone}/${checkpoints} checkpoints`}
                {quizzes > 0 && ` · ${q.quizzesDone}/${quizzes} quick checks`}
              </span>
            </span>
            <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Quest stages">
              {log.map((s) => {
                const isDone = done.has(s.id);
                const isCur = ready && !completed && s.id === current;
                const short = s.id === "final-challenge" ? "◆" : s.label.replace(/^Phase\s+/i, "P");
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollToId(s.id)}
                      title={`${s.label} · ${s.title}`}
                      aria-label={`${s.label}: ${s.title}${isDone ? " (done)" : isCur ? " (reading)" : ""}`}
                      className={`grid h-9 min-w-9 place-items-center px-2 font-mono text-xs font-semibold ${
                        isDone ? "bg-fg text-bg" : isCur ? "border-2 border-signal text-signal-text" : s.id === "final-challenge" ? "border border-dashed border-fg-3 text-fg" : "border border-line-strong text-fg-2 hover:border-fg-3"
                      }`}
                    >
                      {short}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {resume ? (
              <button type="button" onClick={() => scrollToId(resume.id)} className="min-h-11 bg-fg px-4 text-sm font-semibold text-bg hover:opacity-90">
                Resume at {resume.label} ›
              </button>
            ) : !completed && firstPhase && !started ? (
              <button type="button" onClick={() => scrollToId(firstPhase.id)} className="min-h-11 bg-signal px-4 text-sm font-semibold text-on-signal hover:brightness-110">
                Start the quest ›
              </button>
            ) : null}
            <span className="hidden text-[13px] leading-snug text-fg-3 sm:inline">
              {completed
                ? "Quest cleared. Replay the checkpoints any time."
                : `Clear every stage, then the final challenge. ${checkpoints ? `${checkpoints} “your turn” checkpoints` : "Quick checks"} along the way.`}
            </span>
          </div>
        </div>

        {mission && mission.numbers.length > 0 && (
          <dl className="m-0 grid grid-cols-2 gap-px border-t border-line-strong bg-line lg:border-l lg:border-t-0">
            {mission.numbers.slice(0, 6).map((n) => (
              <div key={n.value + n.label} className="flex min-w-0 flex-col-reverse justify-center gap-1 bg-surface px-3 py-2.5 sm:px-5 sm:py-4">
                <dt className="text-[12px] leading-snug text-fg-3 sm:text-[13px]">{n.label}</dt>
                <dd className="m-0 break-words font-display text-[20px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[30px]">{n.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <p className="m-0 mt-2 text-[11px] leading-snug text-fg-4">{LOGO_NOTE}</p>
    </section>
  );
}
