"use client";

/**
 * Daily standup (/learn/review): Leitner boxes 1-5 (1/3/7/16/35 days), card front/back,
 * Again / Hard / Good / Easy, +5 XP per card, finish screen. Cards come from review_cards
 * (signed in, when the table exists) or localStorage, via src/lib/learn/review.ts.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import type { CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import { fallbackMeta, indexLessons } from "@/lib/learn/notebook";
import {
  LEITNER_INTERVALS,
  REVIEW_XP_PER_CARD,
  addDays,
  gradeReviewCard,
  importInterviewRevealCards,
  intervalForBox,
  localDate,
  nextBox,
  type ReviewCard,
  type ReviewGrade,
  type ReviewSource,
} from "@/lib/learn/review";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { activityByDay, findResume, logReviewActivity, readReviewLog, streakFrom, useLearnProgress } from "@/lib/learn/progress";

const SRC: Record<ReviewSource, { label: string; glyph: string; title: string; desc: string }> = {
  trial_miss: { label: "MISSED IN TRIAL", glyph: "✕", title: "Missed trial questions", desc: "Every wrong answer in a trial lands here automatically, with its explanation." },
  trial_flag: { label: "FLAGGED", glyph: "⚑", title: "Flagged questions", desc: "Ones you got right but flagged as a guess." },
  highlight: { label: "HIGHLIGHT", glyph: "❝", title: "Highlights turned into cards", desc: "A sentence from a lesson with the key phrase blanked out." },
  interview: { label: "INTERVIEW · REVIEW AGAIN", glyph: "?", title: "Interview “review again”", desc: "Reveal cards you marked as not yet solid." },
};
const SOURCES: ReviewSource[] = ["trial_miss", "trial_flag", "highlight", "interview"];
const GRADES: { g: ReviewGrade; label: string }[] = [
  { g: "again", label: "Again" },
  { g: "hard", label: "Hard" },
  { g: "good", label: "Good" },
  { g: "easy", label: "Easy" },
];
const BOX_EVERY = ["every day", "every 3 days", "every 7 days", "every 16 days", "monthly"];
const BOX_TAG = ["learning", "shaky", "getting there", "solid", "mastered"];

type Result = { id: string; g: ReviewGrade; from: number; to: number; days: number };

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}
function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function ReviewSession({ map }: { map: CourseMap }) {
  const { user, profile } = useAuth();
  const { grant, done, hydrated } = useGame();
  const { cards, ready } = useReviewCards();
  const { lessons } = useLearnProgress(map.courseId);
  const index = useMemo(() => indexLessons(map), [map]);
  const today = localDate();

  const [snapshot, setSnapshot] = useState<ReviewCard[] | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [reviewLog, setReviewLog] = useState<Record<string, number>>({});

  // Interview "review again" marks from the reader become cards (idempotent).
  useEffect(() => {
    importInterviewRevealCards(map.courseId).catch(() => undefined);
    const t = window.setTimeout(() => setReviewLog(readReviewLog()), 0);
    return () => window.clearTimeout(t);
  }, [map.courseId, user]);

  const dueLive = useMemo(
    () =>
      cards
        .filter((c) => c.dueAt <= today)
        .sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt) || a.createdAt.localeCompare(b.createdAt)),
    [cards, today]
  );
  const queue = snapshot || dueLive;
  const n = queue.length;
  const finished = snapshot !== null && i >= n;
  const card = !finished && n ? queue[Math.min(i, n - 1)] : null;


  const grade = useCallback(
    async (g: ReviewGrade) => {
      if (!card || busy) return;
      setBusy(true);
      if (!snapshot) setSnapshot(dueLive);
      const from = card.box;
      const to = nextBox(g, from);
      const days = intervalForBox(to);
      await gradeReviewCard(card, g);
      grant(REVIEW_XP_PER_CARD, `${to === from ? `Stays in Box ${to}` : `Box ${from} → Box ${to}`} · back ${days === 1 ? "tomorrow" : longDate(addDays(today, days))}`);
      logReviewActivity(1);
      setReviewLog(readReviewLog());
      setResults((r) => [...r, { id: card.id, g, from, to, days }]);
      setI((x) => x + 1);
      setShown(false);
      setBusy(false);
    },
    [card, busy, snapshot, dueLive, grant, today]
  );

  // Keyboard: Space / Enter shows the answer, 1-4 grade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !card) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        if (t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        grade(GRADES[Number(e.key) - 1].g);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, shown, grade]);

  // ------------------------------------------------------------ derived

  const activity = useMemo(() => activityByDay(hydrated ? done : {}, reviewLog), [done, hydrated, reviewLog]);
  const local = streakFrom(activity);
  const remoteStreak = user && profile && typeof profile.current_streak === "number" ? profile.current_streak : 0;
  const streak = Math.max(local.current, remoteStreak);
  const best = Math.max(local.best, user && profile && typeof profile.longest_streak === "number" ? profile.longest_streak : 0, streak);
  const last7 = Array.from({ length: 7 }, (_, k) => addDays(today, k - 6));

  const boxes = [1, 2, 3, 4, 5].map((b) => {
    const inBox = cards.filter((c) => c.box === b);
    const due = inBox.filter((c) => c.dueAt <= today).length;
    const moved = results.filter((r) => r.to === b).length;
    return { b, count: inBox.length, due, moved };
  });
  const deck = cards.length;
  const solid = deck ? Math.round(((boxes[3].count + boxes[4].count) / deck) * 100) : 0;
  const doneCount = results.length;
  const dueLeft = Math.max(0, n - doneCount);
  const minLeft = Math.max(1, Math.ceil((dueLeft * 25) / 60));

  const forecast = Array.from({ length: 9 }, (_, k) => {
    if (k === 8) {
      const later = addDays(today, 7);
      return { label: "Later", n: cards.filter((c) => c.dueAt > later).length, added: results.filter((r) => r.days > 7).length, today: false };
    }
    const d = addDays(today, k);
    const base = k === 0 ? dueLeft : cards.filter((c) => c.dueAt === d).length;
    return { label: dayLabel(d, today), n: base, added: k === 0 ? 0 : results.filter((r) => r.days === k).length, today: k === 0 };
  });
  const maxF = Math.max(1, ...forecast.map((f) => f.n));

  const metaOf = (c: ReviewCard) => (c.week && c.lessonSlug ? index.get(lessonKey(c.week, c.lessonSlug)) || fallbackMeta(map.courseId, c.week, c.lessonSlug) : null);
  const hrefOf = (c: ReviewCard) => {
    const m = metaOf(c);
    if (!m) return null;
    return c.stage ? `${m.href}#${c.stage}` : m.href;
  };
  const shortOf = (c: ReviewCard) => c.detail.short || (c.front.length > 54 ? `${c.front.slice(0, 52).trim()}…` : c.front);
  const resume = useMemo(() => findResume(map, lessons), [map, lessons]);
  const nextDay = addDays(today, 1);
  const tomorrowCount = cards.filter((c) => c.dueAt <= nextDay).length;

  // ------------------------------------------------------------ render helpers

  const isCloze = (c: ReviewCard) => c.source === "highlight" && !!c.back && c.front.includes(c.back);
  const renderFront = (c: ReviewCard) => {
    if (isCloze(c)) {
      const at = c.front.indexOf(c.back);
      return (
        <blockquote className="font-display text-[clamp(22px,2.6vw,34px)] font-bold leading-[1.3] tracking-[-0.02em] text-fg">
          “{c.front.slice(0, at)}
          {shown ? (
            <span className="text-signal-text shadow-[inset_0_-3px_0_var(--c-signal)]">{c.back}</span>
          ) : (
            <span aria-label="blank" className="inline-block min-w-[6ch] bg-surface-2 align-baseline shadow-[inset_0_-3px_0_var(--c-fg-4)]" style={{ width: `${Math.max(6, Math.round(c.back.length * 0.6))}ch` }}>
              &nbsp;
            </span>
          )}
          {c.front.slice(at + c.back.length)}”
        </blockquote>
      );
    }
    return <p className="font-display text-[clamp(22px,2.6vw,34px)] font-bold leading-[1.18] tracking-[-0.02em] text-fg">{c.front}</p>;
  };

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-12 px-4 pb-24 pt-10 sm:px-6 sm:pt-12">
      {/* Hero */}
      <section aria-labelledby="rv-h" className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ review · {longDate(today).toLowerCase()}</span>
          <h1 id="rv-h" className="font-display text-[clamp(48px,7vw,96px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
            Daily standup<span className="text-signal-text">.</span>
          </h1>
          <p className="max-w-[620px] text-[17px] leading-relaxed text-fg-2 sm:text-lg">
            Five minutes on what you got wrong, flagged or highlighted. Recall it, flip it, grade yourself. Cards you know drift to bigger boxes and come back less often.
          </p>
          <div className="grid grid-cols-2 gap-px self-start border border-line bg-line sm:flex sm:flex-wrap">
            {[
              [ready ? String(n) : "·", "cards today"],
              [ready ? `~${n ? minLeft : 0}` : "·", "min"],
              [`+${REVIEW_XP_PER_CARD}`, "XP a card"],
              [ready ? String(deck) : "·", "cards in deck"],
            ].map(([a, b]) => (
              <div key={b} className="flex items-baseline gap-2 bg-bg px-4 py-3 sm:px-[18px]">
                <span className="font-mono text-[22px] font-semibold text-fg">{a}</span>
                <span className="text-[13px] text-fg-3">{b}</span>
              </div>
            ))}
          </div>
          {!user && <span className="font-mono text-xs text-fg-3">guest · your deck lives in this browser. Sign in to keep it on every device.</span>}
        </div>
        <div className="flex w-full flex-col gap-3 border border-line bg-surface p-[22px] sm:flex-[1_1_320px] lg:max-w-[420px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xs uppercase tracking-label text-fg-3">Streak</span>
            <span className="font-mono text-xs text-fg-3">best {best || "—"}</span>
          </div>
          <span className="font-display text-[44px] font-extrabold leading-none tracking-[-0.04em] text-fg">{streak ? `${streak} day${streak === 1 ? "" : "s"}` : "—"}</span>
          <div role="img" aria-label={`Activity in the last 7 days: ${last7.filter((d) => activity[d]).length} active days`} className="grid grid-cols-7 gap-1">
            {last7.map((d) => (
              <span key={d} className="flex flex-col items-stretch gap-1">
                <span className={`h-[26px] ${activity[d] ? "bg-signal" : d === today ? "border border-dashed border-signal" : "border border-line-strong"}`} />
                <span className="text-center font-mono text-[11px] text-fg-3">{(() => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "narrow" }); })()}</span>
              </span>
            ))}
          </div>
          <span className="text-[13px] leading-normal text-fg-2">
            {activity[today] ? "Today counted. Any review or any finished stage keeps the streak alive." : "Today counts after your first card, or after finishing any lesson stage."}
          </span>
        </div>
      </section>

      {/* Boxes + sources */}
      <section className="flex flex-wrap items-stretch gap-6">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-[18px] border border-line bg-raised p-5 sm:p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[28px] font-bold tracking-[-0.025em] text-fg">Leitner boxes</h2>
            <div className="flex flex-wrap items-center gap-3.5 text-xs text-fg-3">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-3.5 bg-signal" />
                due today
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-3.5 bg-fg" />
                moved here today
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-3.5 bg-line-strong" />
                scheduled
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-5 gap-2.5">
              {boxes.map((b) => {
                const cur = !!card && card.box === b.b;
                const slats = Math.min(b.count, 22);
                return (
                  <div key={b.b} className={`flex flex-col gap-2.5 bg-bg p-3.5 ${cur ? "animate-hk-pulse border border-signal" : "border border-line"}`}>
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="font-mono text-xs font-semibold tracking-label text-fg">BOX {b.b}</span>
                      <span className="font-mono text-[11px] text-fg-3">{BOX_EVERY[b.b - 1]}</span>
                    </div>
                    <div aria-hidden className="flex h-[132px] flex-col-reverse gap-[3px] overflow-hidden">
                      {Array.from({ length: slats }, (_, j) => (
                        <span key={j} className={`h-[5px] shrink-0 ${j < b.due ? "bg-signal" : j < b.due + b.moved ? "bg-fg" : "bg-line-strong"}`} />
                      ))}
                    </div>
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="font-mono text-[26px] font-semibold text-fg">{b.count}</span>
                      <span className={`font-mono text-xs ${b.due ? "text-signal-text" : b.moved ? "text-fg" : "text-fg-4"}`}>{b.due ? `${b.due} due` : b.moved ? `+${b.moved} today` : "—"}</span>
                    </div>
                    <span className={`font-mono text-[11px] uppercase tracking-[0.06em] ${cur ? "text-signal-text" : "text-fg-3"}`}>{cur ? "▶ current card" : BOX_TAG[b.b - 1]}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between gap-3 font-mono text-xs text-fg-3">
              <span>DECK · {deck} CARD{deck === 1 ? "" : "S"}</span>
              <span>{solid}% in box 4+</span>
            </div>
            <div role="img" aria-label={`Deck by box: ${boxes.map((b) => `Box ${b.b} ${b.count}`).join(", ")}`} className="flex h-3.5 gap-0.5">
              {deck ? (
                boxes.map((b, k) =>
                  b.count ? <span key={b.b} style={{ flex: `${b.count} 1 0` }} className={["bg-line-strong", "bg-fg-4", "bg-fg-3", "bg-fg-2", "bg-fg"][k]} /> : null
                )
              ) : (
                <span className="flex-1 border border-dashed border-line-strong" />
              )}
            </div>
          </div>
          <span className="text-[13px] leading-normal text-fg-3">
            Again sends a card to Box 1. Hard keeps it where it is. Good moves it up one box, Easy moves it up two. Box 5 is mastered: it comes back every {LEITNER_INTERVALS[4]} days.
          </span>
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 border border-line bg-raised p-5 sm:p-[22px]">
          <h2 className="font-display text-[28px] font-bold tracking-[-0.025em] text-fg">Where cards come from</h2>
          <div className="flex flex-col border-t border-line">
            {SOURCES.map((s) => {
              const inDeck = cards.filter((c) => c.source === s).length;
              const due = queue.filter((c) => c.source === s).length - results.filter((r) => queue.find((c) => c.id === r.id)?.source === s).length;
              const on = card?.source === s;
              return (
                <div key={s} className="flex items-start gap-3.5 border-b border-line py-3">
                  <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center font-mono text-sm ${on ? "border border-signal text-signal-text" : "border border-line-strong text-fg-3"}`}>
                    {SRC[s].glyph}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-fg">{SRC[s].title}</span>
                    <span className="text-[13px] leading-snug text-fg-3">{SRC[s].desc}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-lg font-semibold text-fg">{Math.max(0, due)} due</span>
                    <span className="font-mono text-[11px] text-fg-3">{inDeck} in deck</span>
                  </span>
                </div>
              );
            })}
          </div>
          <Link href="/learn/notebook?tab=highlights" className="inline-flex min-h-11 items-center text-sm font-semibold text-signal-text">
            Turn highlights into cards in your notebook ›
          </Link>
        </div>
      </section>

      {/* Session */}
      <section aria-labelledby="session-h" className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_680px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="session-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
              Today&apos;s session
            </h2>
            <span className="font-mono text-[13px] text-fg-2">
              {!ready ? "loading your deck…" : finished ? `${n} / ${n} · done` : n ? `${doneCount} / ${n} reviewed · ~${minLeft} min left` : "nothing due"}
            </span>
          </div>
          {n > 0 && (
            <div role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={n} aria-valuenow={doneCount} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(n, 40)}, minmax(0, 1fr))` }}>
              {queue.slice(0, 40).map((c, k) => (
                <span key={c.id} className={`h-2 ${k < doneCount ? "bg-fg" : k === i && !finished ? "bg-signal" : "border border-dashed border-line-strong"}`} />
              ))}
            </div>
          )}

          {!ready && <div aria-busy="true" className="h-[320px] animate-pulse border border-line bg-surface" />}

          {ready && card && (
            <article aria-live="polite" className="flex flex-col border border-line-strong bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-5 py-3.5 sm:px-[22px]">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <span className={`px-2 py-1 font-mono text-[11px] font-semibold tracking-label ${card.source === "trial_miss" ? "border border-bad text-bad-text" : "border border-line-strong text-fg"}`}>{SRC[card.source].label}</span>
                  <span className="font-mono text-xs text-fg-3">{card.detail.context || metaOf(card)?.tag || ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="border border-signal px-2 py-1 font-mono text-xs tracking-[0.06em] text-signal-text">BOX {card.box}</span>
                  <span className="font-mono text-xs text-fg-3">
                    card {Math.min(i + 1, n)} / {n}
                  </span>
                </div>
              </div>

              <div className="flex min-h-[150px] flex-col gap-[18px] px-5 pb-7 pt-8 sm:px-8 sm:pt-9">
                <span className="font-mono text-xs uppercase tracking-label text-fg-3">
                  {isCloze(card) ? "Fill the blank · from your highlight" : card.source === "interview" ? "Interview question · say your answer out loud" : "Question"}
                </span>
                {renderFront(card)}
                <span className="text-sm text-fg-3">
                  {isCloze(card)
                    ? card.detail.why
                      ? `Your note: ${card.detail.why}`
                      : `Highlighted in ${metaOf(card)?.title || "a lesson"}.`
                    : card.source === "interview"
                      ? "Aim for the 3-4 points a strong answer would hit."
                      : card.source.startsWith("trial")
                        ? "The trial had four options. Recall the answer without them."
                        : ""}
                </span>
              </div>

              {!shown ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-[18px] sm:px-[22px]">
                  <span className="text-sm text-fg-3">Answer it in your head first. Honesty is the whole trick.</span>
                  <button type="button" onClick={() => setShown(true)} className="min-h-[52px] bg-signal px-7 text-base font-semibold text-on-signal">
                    Show answer <span className="hidden font-mono text-xs sm:inline">space</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex animate-hk-in flex-col gap-4 border-t border-dashed border-line-strong bg-raised px-5 pb-6 pt-6 sm:px-8">
                    <span className="font-mono text-xs uppercase tracking-label text-signal-text">{isCloze(card) ? "Missing words" : card.source === "interview" ? "Strong answer · key points" : "Answer"}</span>
                    {card.detail.points && card.detail.points.length ? (
                      <ul className="flex flex-col gap-2.5">
                        {card.detail.points.map((p, k) => (
                          <li key={k} className="flex gap-3 text-base leading-relaxed text-fg-2">
                            <span aria-hidden className="mt-[9px] h-[7px] w-[7px] shrink-0 bg-signal" />
                            <span>
                              <strong className="text-fg">{p.k}</strong> {p.v}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[20px] font-semibold leading-snug text-fg sm:text-[22px]">{card.back}</p>
                    )}
                    {card.detail.picked && (
                      <span className="flex flex-wrap items-center gap-2 text-sm text-bad-text">
                        <span aria-hidden className="font-mono">
                          ✕
                        </span>
                        In the trial you picked {card.detail.picked}
                      </span>
                    )}
                    {card.detail.why && !isCloze(card) && <p className="text-base leading-relaxed text-fg-2">{card.detail.why}</p>}
                    {hrefOf(card) && (
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-1">
                        <Link href={hrefOf(card) as string} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-signal-text">
                          Open in lesson ›
                        </Link>
                        <span className="font-mono text-xs text-fg-3">
                          {metaOf(card)?.tag} · {metaOf(card)?.title}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5 border-t border-line px-5 pb-[22px] pt-[18px] sm:px-[22px]">
                    <span className="font-mono text-xs uppercase tracking-label text-fg-3">How well did you know it?</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {GRADES.map(({ g, label }, k) => {
                        const to = nextBox(g, card.box);
                        const d = intervalForBox(to);
                        const primary = g === "good";
                        return (
                          <button
                            key={g}
                            type="button"
                            disabled={busy}
                            onClick={() => grade(g)}
                            aria-label={`${label}: next review in ${d} ${d === 1 ? "day" : "days"}, card goes to Box ${to}`}
                            className={`flex min-h-16 flex-col items-start gap-1.5 px-4 py-3 text-left disabled:opacity-60 ${primary ? "border border-signal bg-signal text-on-signal" : "border border-line-strong bg-bg text-fg hover:bg-surface-2"}`}
                          >
                            <span className="text-base font-semibold">
                              {label} <span className={`hidden font-mono text-[11px] font-normal sm:inline ${primary ? "" : "text-fg-4"}`}>{k + 1}</span>
                            </span>
                            <span className={`font-mono text-xs ${primary ? "" : "text-fg-3"}`}>
                              {d}d · → Box {to}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </article>
          )}

          {ready && !card && !finished && (
            <div className="flex flex-col items-start gap-3.5 border border-dashed border-line-strong bg-raised px-6 py-9 sm:px-8">
              <span className="font-display text-[28px] font-bold tracking-[-0.02em] text-fg">{deck ? "Nothing due today." : "Your deck is empty."}</span>
              <span className="max-w-[600px] text-base leading-relaxed text-fg-2">
                {deck
                  ? `Next cards come back ${(() => {
                      const next = cards.map((c) => c.dueAt).sort()[0];
                      return next ? (next === nextDay ? "tomorrow" : `on ${longDate(next)}`) : "soon";
                    })()}. Read a stage or take a trial part in the meantime.`
                  : "Cards arrive on their own: a wrong answer in a trial, a question you flag, a highlight you turn into a card, or an interview answer you mark “review again”."}
              </span>
              <div className="flex flex-wrap gap-2.5">
                <Link href={`/learn/${map.courseId}`} className="inline-flex min-h-12 items-center bg-signal px-5 font-semibold text-on-signal">
                  Back to the skill tree
                </Link>
                <Link href="/learn/notebook?tab=highlights" className="inline-flex min-h-12 items-center border border-line-strong px-5 text-[15px] text-fg">
                  Open notebook
                </Link>
              </div>
            </div>
          )}

          {finished && (
            <section aria-labelledby="done-h" className="flex animate-hk-in flex-col gap-[22px] border border-signal bg-surface px-5 py-8 sm:px-8 sm:py-9">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex flex-col gap-2.5">
                  <span className="font-mono text-xs uppercase tracking-label text-signal-text">
                    ❯ standup complete · {n} / {n}
                  </span>
                  <h3 id="done-h" className="font-display text-[clamp(44px,8vw,64px)] font-extrabold leading-[0.92] tracking-[-0.05em] text-fg">
                    Done for today<span className="text-signal-text">.</span>
                  </h3>
                  <span className="text-base text-fg-2">
                    All {n} card{n === 1 ? "" : "s"} reviewed. {tomorrowCount ? `Next standup tomorrow: ${tomorrowCount} card${tomorrowCount === 1 ? "" : "s"}.` : "Nothing due tomorrow."}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 bg-signal px-6 py-[18px] text-on-signal">
                  <span className="font-mono text-4xl font-semibold">+{doneCount * REVIEW_XP_PER_CARD}</span>
                  <span className="font-mono text-xs tracking-label">XP · {REVIEW_XP_PER_CARD} PER CARD</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-px border border-line bg-line">
                {[
                  [doneCount, "cards"],
                  [results.filter((r) => r.g === "again").length, "again"],
                  [results.filter((r) => r.g === "hard").length, "hard"],
                  [results.filter((r) => r.g === "good").length, "good"],
                  [results.filter((r) => r.g === "easy").length, "easy"],
                ].map(([a, b]) => (
                  <div key={b} className="flex flex-[1_1_110px] flex-col gap-1 bg-bg px-4 py-3.5">
                    <span className="font-mono text-2xl font-semibold text-fg">{a}</span>
                    <span className="text-[13px] text-fg-3">{b}</span>
                  </div>
                ))}
              </div>
              <span className="text-[15px] leading-relaxed text-fg-2">
                {results.filter((r) => r.to > r.from).length} moved up a box, {results.filter((r) => r.to === r.from && r.g !== "again").length} stayed put,{" "}
                {results.filter((r) => r.g === "again").length} went back to Box 1.{streak ? ` Streak is now ${streak} day${streak === 1 ? "" : "s"}.` : ""}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link href={`/learn/${map.courseId}`} className="inline-flex min-h-[52px] items-center bg-signal px-6 text-base font-semibold text-on-signal">
                  Back to course ›
                </Link>
                {resume && resume.mode !== "start" && (
                  <Link href={resume.lesson.href} className="inline-flex min-h-[52px] items-center border border-line-strong px-5 text-[15px] text-fg">
                    Resume {resume.lesson.kind === "week-preview" ? `W${resume.lesson.tag.slice(1, 3)} Preview` : resume.lesson.label.split(" · ")[0]}
                  </Link>
                )}
                <Link href="/learn/notebook" className="inline-flex min-h-[52px] items-center border border-line-strong px-5 text-[15px] text-fg">
                  Open notebook
                </Link>
              </div>
            </section>
          )}
        </div>

        {ready && n > 0 && (
          <aside aria-labelledby="queue-h" className="flex w-full min-w-0 flex-col border border-line bg-raised lg:max-w-[380px] lg:flex-[1_1_300px]">
            <div className="flex items-baseline justify-between gap-2.5 border-b border-line px-[18px] py-4">
              <h2 id="queue-h" className="font-mono text-xs font-semibold uppercase tracking-label text-fg-2">
                Today&apos;s queue
              </h2>
              <span className="font-mono text-xs text-fg-3">{dueLeft} left</span>
            </div>
            <ol className="flex max-h-[640px] flex-col overflow-y-auto">
              {queue.map((c, k) => {
                const r = results.find((x) => x.id === c.id);
                const cur = !finished && k === i;
                return (
                  <li key={c.id} className={`flex min-h-[52px] items-center gap-3 border-b border-line px-[18px] py-1.5 ${cur ? "bg-surface-2 shadow-[inset_2px_0_0_var(--c-signal)]" : ""}`}>
                    <span
                      aria-hidden
                      className={`grid h-[26px] w-[26px] shrink-0 place-items-center font-mono text-[11px] font-semibold ${r ? "bg-fg text-bg" : cur ? "bg-signal text-on-signal" : "border border-dashed border-line-strong text-fg-3"}`}
                    >
                      {r ? "✓" : cur ? "▶" : String(k + 1).padStart(2, "0")}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`truncate text-sm ${cur ? "font-semibold text-fg" : r ? "text-fg-3" : "text-fg-2"}`}>{shortOf(c)}</span>
                      <span className="truncate font-mono text-[11px] text-fg-3">
                        {SRC[c.source].label.toLowerCase()} · box {c.box}
                      </span>
                    </span>
                    {r && <span className={`shrink-0 font-mono text-[11px] ${r.g === "again" ? "text-bad-text" : "text-fg-3"}`}>{`${r.g.toUpperCase()} · ${r.days}D`}</span>}
                  </li>
                );
              })}
            </ol>
          </aside>
        )}
      </section>

      {/* Forecast */}
      {ready && deck > 0 && (
        <section aria-labelledby="fc-h" className="flex flex-col gap-[18px] border border-line bg-raised p-5 sm:p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="fc-h" className="font-display text-[28px] font-bold tracking-[-0.025em] text-fg">
              Coming up
            </h2>
            <span className="text-[13px] text-fg-3">Cards you grade today land on these days: the top segment of each bar is this session.</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px] grid-cols-9 items-end gap-2.5">
              {forecast.map((f) => (
                <div key={f.label} className="flex flex-col items-stretch gap-1.5">
                  <span className="text-center font-mono text-sm font-semibold text-fg">{f.n}</span>
                  <div aria-hidden className="flex h-[110px] flex-col justify-end">
                    <span className="block bg-fg" style={{ height: `${Math.round((Math.min(f.added, f.n) / maxF) * 104)}px` }} />
                    <span className={`block ${f.today ? "bg-signal" : "bg-line-strong"}`} style={{ height: `${Math.max(2, Math.round((Math.max(0, f.n - f.added) / maxF) * 104))}px` }} />
                  </div>
                  <span className={`text-center font-mono text-xs ${f.today ? "text-signal-text" : "text-fg-3"}`}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

    </main>
  );
}
