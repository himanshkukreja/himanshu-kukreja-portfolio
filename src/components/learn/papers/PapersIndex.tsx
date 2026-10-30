"use client";

/** /learn/papers: every written paper, weeks then side quests, with the learner's best score (from the game flags). */
import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { BAND_LABEL, bandOf } from "@/lib/learn/papers/grade";
import { paperFlagKey, pct, readRecord, type PaperSummary } from "@/lib/learn/papers/types";

export function ScoreBadge({ score, max, small }: { score: number; max: number; small?: boolean }) {
  const band = bandOf(score, max);
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono ${small ? "text-[11px]" : "text-[12px]"} ${band === "not-yet" ? "text-fg-3" : band === "pass" ? "text-ok" : "text-signal-text"}`}>
      <span aria-hidden className={`h-2 w-2 ${band === "not-yet" ? "border border-fg-3" : band === "pass" ? "bg-ok" : "bg-signal"}`} />
      best {score}/{max} · {pct(score, max)}% · {BAND_LABEL[band]}
    </span>
  );
}

function PaperTile({ p }: { p: PaperSummary }) {
  const { flags, hydrated } = useGame();
  const rec = readRecord(flags[paperFlagKey(p.key)]);
  const kinds = Object.entries(p.kinds)
    .map(([k, n]) => `${n} ${k}`)
    .join(" · ");
  return (
    <li className="flex">
      <Link href={p.href} className="group flex w-full flex-col gap-3 border border-line bg-surface p-4 hover:border-fg-4 sm:p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{p.label}</span>
          <span className="whitespace-nowrap font-mono text-[11px] text-fg-3">{p.minutes} min</span>
        </span>
        <span className="font-display text-[22px] font-bold leading-[1.08] tracking-[-0.02em] text-fg group-hover:text-signal-text">{p.ownerTitle}</span>
        <span className="text-[14px] leading-snug text-fg-2">
          {p.questions} questions · {p.marks} marks
          <span className="block text-[13px] text-fg-3">{kinds}</span>
        </span>
        <span className="mt-auto flex min-h-6 flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {!hydrated ? (
            <span className="font-mono text-[11px] text-fg-4">·</span>
          ) : rec.open ? (
            <span className="font-mono text-[12px] text-signal-text">● {rec.open.mode === "exam" ? "exam" : "practice"} in progress</span>
          ) : rec.best ? (
            <ScoreBadge score={rec.best.score} max={rec.best.max} />
          ) : (
            <span className="font-mono text-[12px] text-fg-3">not tried yet</span>
          )}
          <span aria-hidden className="font-mono text-sm text-signal-text">
            ❯
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function PapersIndex({ papers }: { papers: PaperSummary[] }) {
  const weeks = papers.filter((p) => p.kind === "week");
  const quests = papers.filter((p) => p.kind === "quest");
  if (!papers.length) return <p className="m-0 border border-dashed border-line p-5 text-[15px] text-fg-3">The first papers are being set. Check back soon.</p>;
  const grid = "m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]";
  return (
    <div className="flex flex-col gap-10">
      {weeks.length > 0 && (
        <section aria-labelledby="papers-weeks" className="flex flex-col gap-4">
          <h2 id="papers-weeks" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
            Course weeks · {weeks.length}
          </h2>
          <ul className={grid}>
            {weeks.map((p) => (
              <PaperTile key={p.key} p={p} />
            ))}
          </ul>
        </section>
      )}
      {quests.length > 0 && (
        <section aria-labelledby="papers-quests" className="flex flex-col gap-4">
          <h2 id="papers-quests" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
            Side quests · {quests.length}
          </h2>
          <ul className={grid}>
            {quests.map((p) => (
              <PaperTile key={p.key} p={p} />
            ))}
          </ul>
        </section>
      )}
      <p className="m-0 max-w-[700px] text-[14px] leading-relaxed text-fg-3">
        Your answers are pages in your notebook (the &ldquo;Written papers&rdquo; notebook), so you can look back at them any time. Grading uses your daily AI credits: about one
        credit an answer, more when a drawn or borderline answer is double-checked by a stronger model.
      </p>
    </div>
  );
}
