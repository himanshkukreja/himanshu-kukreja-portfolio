"use client";

/**
 * A written paper's results: the total and the marks per kind of question, then every question with its score, each
 * scheme point ticked or crossed with the grader's evidence, what was missing, the model answer and links back to
 * the lesson sections. "Add missed points to review" makes a review card per question with marks lost.
 */
import Link from "next/link";
import { useState } from "react";
import { addReviewCard } from "@/lib/learn/review";
import { NOTES_COURSE_ID as COURSE_ID } from "@/lib/ai/notes";
import { BAND_LABEL, ESCALATION_TEXT, marksByKind, type QuestionGrade } from "@/lib/learn/papers/grade";
import { attemptResult, pct, type AttemptSummary, type PaperQuestionView, type PaperView, type QuestionMarks } from "@/lib/learn/papers/types";

export const MODEL_LABEL = { haiku: "Haiku 5.5", sonnet: "Sonnet 5.5" } as const;
const MONO = "font-mono text-[11px] uppercase tracking-label";

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Who graded and what it cost, honestly: the re-check by the stronger model costs more. */
export function GradedBy({ g, m }: { g?: QuestionGrade | null; m: QuestionMarks }) {
  if (m.g === "none" || g?.blank) return <span className="text-fg-3">not answered · no credits used</span>;
  const credits = g?.credits ?? m.c;
  const re = g && g.model === "sonnet" && g.escalated.length;
  return (
    <span className="text-fg-3">
      graded by {MODEL_LABEL[m.g]}
      {re ? ` · re-checked because ${g!.escalated.map((r) => ESCALATION_TEXT[r]).join(", ")}${g!.firstScore !== null && g!.firstScore !== g!.score ? ` (first mark ${g!.firstScore}/${g!.max})` : ""}` : ""}
      {g?.recheckFailed ? " · the double-check couldn't run, so this is the first grader's mark" : ""} · {credits} credit{credits === 1 ? "" : "s"}
    </span>
  );
}

/** One question's marks, point by point (the practice panel and the results). */
export function QuestionResult({ q, m, g, compact, answerHref }: { q: PaperQuestionView; m: QuestionMarks; g?: QuestionGrade | null; compact?: boolean; answerHref?: string | null }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const full = m.s >= m.m;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-display text-[28px] font-bold leading-none tracking-[-0.02em] ${full ? "text-ok" : m.s === 0 ? "text-bad-text" : "text-fg"}`}>
          {m.s}
          <span className="text-[18px] text-fg-3">/{m.m}</span>
        </span>
        <span className="text-[12px] leading-snug">
          <GradedBy g={g} m={m} />
        </span>
      </div>
      {g?.feedback && <p className="m-0 text-[15px] leading-relaxed text-fg">{g.feedback}</p>}
      <ol className="m-0 flex list-none flex-col gap-0 border border-line p-0">
        {q.scheme.map((pt, i) => {
          const got = m.p[i] ?? 0;
          const ok = got >= pt.marks;
          const part = got > 0 && !ok;
          const ev = g?.points[i]?.evidence;
          return (
            <li key={i} className="flex gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
              <span aria-hidden className={`mt-[1px] grid h-6 w-6 shrink-0 place-items-center font-mono text-[13px] font-bold ${ok ? "bg-ok text-[#04140B]" : part ? "border border-signal text-signal-text" : "border border-bad text-bad-text"}`}>
                {ok ? "✓" : part ? "½" : "✗"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[14px] leading-snug text-fg">
                  <span className="sr-only">{ok ? "Earned: " : part ? "Partly earned: " : "Missed: "}</span>
                  {pt.text}
                </span>
                {ev && !compact && <span className={`text-[13px] leading-snug ${ev === "not found" ? "text-fg-4" : "text-fg-3"}`}>{ev === "not found" ? "not found on your sheet" : `on your sheet: ${ev}`}</span>}
                {ev && compact && ev !== "not found" && <span className="text-[13px] leading-snug text-fg-3">on your sheet: {ev}</span>}
              </span>
              <span className={`shrink-0 font-mono text-[12px] ${ok ? "text-ok" : "text-fg-3"}`}>
                {got}/{pt.marks}
              </span>
            </li>
          );
        })}
      </ol>
      {g?.read && !compact && (
        <details className="text-[13px] text-fg-3">
          <summary className="cursor-pointer select-none py-1 font-mono text-[12px] text-fg-2">What the grader read on your sheet</summary>
          <p className="m-0 mt-1 whitespace-pre-wrap leading-relaxed">{g.read}</p>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowAnswer((v) => !v)} aria-expanded={showAnswer} className="min-h-11 border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2">
          {showAnswer ? "Hide the model answer" : "Show the model answer"}
        </button>
        {answerHref && (
          <Link href={answerHref} className="inline-flex min-h-11 items-center px-2 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            your answer in the notebook
          </Link>
        )}
      </div>
      {showAnswer && (
        <div className="flex flex-col gap-3 border-l-[3px] border-signal bg-surface-2 px-4 py-3">
          <span className={`${MONO} text-signal-text`}>Model answer</span>
          <div className="paper-md text-[15px]" dangerouslySetInnerHTML={{ __html: q.answerHtml }} />
          {q.sources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className={`${MONO} text-fg-3`}>Read it again</span>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {q.sources.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className="text-[14px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  paper: PaperView;
  last: AttemptSummary;
  details: Record<number, QuestionGrade>;
  best: { score: number; max: number } | null;
  xp: number;
  onRetry: () => void;
  onGradePending: () => void;
  grading: boolean;
};

export default function PaperResults({ paper, last, details, best, xp, onRetry, onGradePending, grading }: Props) {
  // one rule for every view (lib/learn/papers/types.ts attemptResult): a practice run that answered only some questions
  // is scored over those questions, with no pass/fail verdict; an exam or a fully answered paper gets the verdict
  const res = attemptResult(last);
  const band = res.band;
  const counted = res.full ? paper.questions : paper.questions.filter((q) => last.marks[q.n] && last.marks[q.n].g !== "none");
  const kinds = marksByKind(counted, Object.fromEntries(Object.entries(last.marks).map(([n, m]) => [n, m.s])));
  const [cards, setCards] = useState<"" | "adding" | string>("");
  const minutes = Math.max(1, Math.round((last.finishedAt - last.startedAt) / 60000));
  // answered questions that lost marks (an unanswered question isn't a missed point: it was never tried)
  const missedQs = paper.questions.filter((q) => last.marks[q.n] && last.marks[q.n].g !== "none" && last.marks[q.n].s < last.marks[q.n].m);

  const addCards = async () => {
    setCards("adding");
    let added = 0;
    let dup = 0;
    let local = 0;
    for (const q of missedQs) {
      const m = last.marks[q.n];
      const missed = q.scheme.filter((pt, i) => (m.p[i] ?? 0) < pt.marks);
      if (!missed.length) continue;
      const src = q.sources[0]?.href.match(/^\/learn\/[^/]+\/([^/]+)\/([^/#?]+)/);
      const r = await addReviewCard({
        source: "notes",
        sourceRef: `paper:${paper.key}:q${q.n}:${hashStr(missed.map((p) => p.text).join("|"))}`,
        courseId: COURSE_ID,
        week: src?.[1],
        lessonSlug: src?.[2],
        front: `${paper.code} · Q${q.n} (${q.marks} marks): ${q.promptText.length > 420 ? `${q.promptText.slice(0, 418).trim()}…` : q.promptText}`,
        back: `What a full answer includes that yours missed:\n${missed.map((p) => `- ${p.text}`).join("\n")}`,
        detail: {
          context: `Written paper · ${paper.title}`,
          short: `${paper.code} Q${q.n} · ${missed.length} missed point${missed.length === 1 ? "" : "s"}`,
          points: missed.map((p) => ({ k: `${p.marks} mark${p.marks === 1 ? "" : "s"}`, v: p.text })),
        },
      });
      if (!r.ok) continue;
      if (r.duplicate) dup++;
      else added++;
      if (r.storage === "local") local++;
    }
    setCards(`${added ? `Added ${added} card${added === 1 ? "" : "s"} to your review, due today` : "Nothing new to add"}${dup ? ` · ${dup} already there` : ""}${local ? " · saved on this device for now" : ""}.`);
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="paper-score" className="flex flex-col gap-5 border border-line-strong bg-surface p-5 sm:p-7">
        <span className={`${MONO} text-fg-3`}>
          {last.mode === "exam" ? "exam" : "practice"} · {minutes} min · {last.credits} credit{last.credits === 1 ? "" : "s"} of grading
        </span>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <h2 id="paper-score" className="m-0 font-display text-[clamp(56px,10vw,96px)] font-extrabold leading-[0.85] tracking-[-0.05em] text-fg">
            {res.score}
            <span className="text-[0.45em] text-fg-3">/{res.max}</span>
          </h2>
          <div className="flex flex-col gap-2 pb-1">
            {band ? (
              <span className={`self-start px-3 py-[7px] font-mono text-sm font-semibold tracking-label ${band === "distinction" ? "bg-signal text-on-signal" : band === "pass" ? "bg-ok text-[#04140B]" : "border border-bad text-bad-text"}`}>
                {pct(res.score, res.max)}% · {BAND_LABEL[band].toUpperCase()}
              </span>
            ) : (
              <span className="self-start border border-line-strong px-3 py-[7px] font-mono text-sm font-semibold tracking-label text-fg-2">
                {res.answered ? `ON ${res.answered} OF ${res.questions} QUESTIONS` : "NOTHING GRADED YET"}
              </span>
            )}
            <span className="text-[13px] text-fg-3">
              {band ? "Pass at 50%, distinction at 75%" : `Practice counts the questions you answered. Answer all ${res.questions}, or sit it as an exam, for a pass mark`}
              {best ? ` · your best ${best.score}/${best.max}` : ""}
              {xp ? ` · +${xp} XP` : ""}
            </span>
          </div>
        </div>
        {last.pending.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-signal px-4 py-3">
            <span className="text-[14px] text-fg">
              {last.pending.length} answer{last.pending.length === 1 ? " isn't" : "s aren't"} graded yet (Q{last.pending.join(", Q")}). Your sheets are saved.
            </span>
            <button type="button" onClick={onGradePending} disabled={grading} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal disabled:opacity-60">
              {grading ? "Grading…" : "Grade them now"}
            </button>
          </div>
        )}
        <ul className="m-0 grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {kinds.map((k) => (
            <li key={k.kind} className="flex flex-col gap-1.5 border border-line px-3 py-2.5">
              <span className={`${MONO} text-fg-3`}>{k.kind}</span>
              <span className="font-mono text-[15px] text-fg">
                {k.got}/{k.max}
              </span>
              <span aria-hidden className="h-1 bg-surface-2">
                <span className="block h-1 bg-signal" style={{ width: `${pct(k.got, k.max)}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={onRetry} className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110">
            Try the paper again
          </button>
          {missedQs.length > 0 && (
            <button type="button" onClick={() => void addCards()} disabled={cards === "adding" || (!!cards && cards !== "adding")} className="min-h-12 border border-line-strong px-5 text-[15px] text-fg hover:bg-surface-2 disabled:opacity-60">
              {cards === "adding" ? "Adding…" : "Add missed points to review"}
            </button>
          )}
          <Link href="/learn/papers" className="inline-flex min-h-12 items-center px-3 font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            all papers
          </Link>
        </div>
        {cards && cards !== "adding" && (
          <p role="status" className="m-0 text-[14px] text-fg-2">
            {cards}{" "}
            <Link href="/learn/review" className="text-signal-text underline underline-offset-4">
              Open your review
            </Link>
          </p>
        )}
      </section>

      <section aria-label="Every question" className="flex flex-col gap-4">
        {paper.questions.map((q) => {
          const m = last.marks[q.n];
          const sheets = last.pages[q.n] || [];
          return (
            <article key={q.n} aria-labelledby={`res-q${q.n}`} className="flex flex-col gap-4 border border-line bg-surface p-4 sm:p-6">
              <header className="flex flex-col gap-2">
                <span id={`res-q${q.n}`} className={`${MONO} text-signal-text`}>
                  Q{q.n} · {q.kind} · {q.marks} marks
                </span>
                <div className="paper-md text-[15px] text-fg-2" dangerouslySetInnerHTML={{ __html: q.promptHtml }} />
              </header>
              {/* a partial practice run lists the questions it skipped as skipped, not as 0 marks with every point crossed */}
              {m && (res.full || m.g !== "none") ? (
                <QuestionResult q={q} m={m} g={details[q.n]} answerHref={sheets[0] ? `/learn/notebook/page/${sheets[0]}` : null} />
              ) : (
                <p className="m-0 text-[14px] text-fg-3">{last.pending.includes(q.n) ? "Not graded yet." : res.full ? "Not answered." : "Not answered in this practice run: it doesn't count towards the score."}</p>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
