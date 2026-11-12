"use client";

/**
 * /dsa/revise: DSA Mastery's revision page, in three parts.
 *   1. Re-solve: problems the learner struggled with come back after 1, 3 and 7 days (src/lib/dsa/revise.ts).
 *   2. Your cards: deck cards marked "again" join the shared review queue (review_cards, course_id 'dsa', or this
 *      browser's queue for guests) and come back on the Leitner schedule SD Mastery's standup uses (1/3/7/16/35 days).
 *   3. Pattern decks: one per built concept, from the lesson itself (src/lib/dsa/revise-load.ts).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import { dsaProgressKeys } from "@/lib/dsa/rewards";
import { istDate } from "@/lib/learn/arena/shared";
import { addReviewCard, gradeReviewCard, intervalForBox, nextBox, type ReviewCard, type ReviewGrade } from "@/lib/learn/review";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { track } from "@/lib/track";
import { DSA_COURSE_ID, type DsaLevel } from "@/lib/dsa/types";
import { DSA_REVISE_REF, RESOLVE_STEPS, failSummary, type DsaDeck, type DsaRevCard, type ResolveItem } from "@/lib/dsa/revise";
import DsaCrumbs from "../DsaCrumbs";
import { useResolves } from "./useResolves";

export type ReviseProblem = { id: string; title: string; level: DsaLevel; concept: string };

const LEVEL: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
const KIND_LABEL: Record<DsaRevCard["kind"], string> = { card: "Recall", invariant: "Invariant", signals: "Signals", ideas: "Key ideas", pitfall: "Mistake museum" };

const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

/* ------------------------------------------------------------------ re-solve */

function ResolveRow({ it, p }: { it: ResolveItem; p: ReviseProblem | undefined }) {
  const why = [it.editorialEarly ? "editorial opened before solving" : "", failSummary(it.fails) ? `${failSummary(it.fails)} before ${it.solved ? "Accepted" : "giving up"}` : ""].filter(Boolean).join(" · ");
  return (
    <li className="bg-surface">
      <Link href={`/dsa/problems/${it.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 hover:bg-surface-2">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15.5px] font-semibold text-fg">{p?.title || it.id}</span>
          <span className="text-[13px] text-fg-3">{why || "struggled the first time"}</span>
        </span>
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{p ? LEVEL[p.level] : ""}</span>
        <span className="font-mono text-[12px] text-fg-2">
          {it.solved ? `re-solve ${Math.min(it.step + 1, RESOLVE_STEPS.length)} of ${RESOLVE_STEPS.length}` : "not solved yet"}
        </span>
        <span className="inline-flex min-h-10 items-center border border-signal px-3 font-mono text-[12.5px] font-semibold text-signal-text">{it.solved ? "Re-solve →" : "Try again →"}</span>
      </Link>
    </li>
  );
}

function Resolves({ problems }: { problems: Map<string, ReviseProblem> }) {
  const r = useResolves();
  return (
    <section aria-labelledby="resolve-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="resolve-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
          Re-solve
        </h2>
        <span className="font-mono text-[12px] text-fg-3">{r.ready ? `${r.due.length} due · ${r.upcoming.length} coming back · ${r.done.length} done` : " "}</span>
      </div>
      <p className="m-0 max-w-[720px] text-[14.5px] leading-relaxed text-fg-2">
        A problem you failed (Wrong Answer, Time Limit, Runtime Error) or opened the editorial for comes back 1, 3 and 7 days after you solve it. Solving it cold again is what makes the pattern stick.
      </p>
      {!r.ready ? (
        <div aria-busy="true" aria-label="Loading your re-solves" className="h-[90px] animate-pulse bg-surface-2" />
      ) : r.due.length ? (
        <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
          {r.due.map((it) => (
            <ResolveRow key={it.id} it={it} p={problems.get(it.id)} />
          ))}
        </ul>
      ) : (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[14px] text-fg-2">
          {r.upcoming.length ? "Nothing due today." : "Nothing to re-solve yet."} Problems you struggle with show up here on the day they come back.
        </p>
      )}
      {r.ready && r.upcoming.length ? (
        <ul aria-label="Coming back" className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
          {r.upcoming.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-bg px-4 py-2.5">
              <Link href={`/dsa/problems/${it.id}`} className="min-w-0 flex-1 basis-[14rem] text-[14px] text-fg-2 underline decoration-line underline-offset-4 hover:text-fg">
                {problems.get(it.id)?.title || it.id}
              </Link>
              <span className="font-mono text-[12px] text-fg-3">
                {it.solved ? `re-solve ${it.step + 1} of ${RESOLVE_STEPS.length}` : "retry"} · back {it.dueAt ? fmtDay(it.dueAt) : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ card faces */

function Face({ card, side }: { card: { kind?: DsaRevCard["kind"]; front: string; back: string; points?: string[] }; side: "front" | "back" }) {
  if (side === "front") return <p className="m-0 font-display text-[19px] font-semibold leading-snug tracking-[-0.01em] text-fg sm:text-[22px]">{card.front}</p>;
  if (card.points && card.points.length > 1)
    return card.kind === "signals" ? (
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {card.points.map((x) => (
          <li key={x} className="border border-signal px-2.5 py-1 font-mono text-[13px] text-signal-text">
            {x}
          </li>
        ))}
      </ul>
    ) : (
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-fg">
        {card.points.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    );
  return <p className="m-0 text-[15.5px] leading-relaxed text-fg">{card.back}</p>;
}

/* ------------------------------------------------------------------ your cards (spaced repetition) */

function DueCards({ decks }: { decks: DsaDeck[] }) {
  const { cards, due, ready } = useReviewCards("dsa");
  // a reviewed card: DSA Mastery Bits once per card per day (dsa:rv:<day>:<card>), never SD Mastery XP
  const { award } = useDsaAward();
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ g: ReviewGrade; days: number; bits: number }[]>([]);
  const list = queue || due;
  const card = queue && i < queue.length ? queue[i] : null;
  const deckOf = useMemo(() => new Map(decks.map((d) => [d.concept, d])), [decks]);
  const points = (c: ReviewCard) => {
    const m = c.sourceRef.match(/^dsa-revise:([^:]+):(.+)$/);
    const deck = m ? deckOf.get(m[1])?.cards.find((x) => x.id === m[2]) : undefined;
    // a card from the learner's own mistakes (lib/learner/mistake-cards-model.ts) carries its key points itself
    return deck ?? (c.detail.points?.length ? { points: c.detail.points.map((p) => (p.k ? `${p.k} ${p.v}` : p.v)), kind: undefined } : undefined);
  };

  const grade = async (g: ReviewGrade) => {
    if (!card || busy) return;
    setBusy(true);
    const to = nextBox(g, card.box);
    const days = intervalForBox(to);
    await gradeReviewCard(card, g);
    const bits = award([dsaProgressKeys.revise(istDate(), card.id)], `Card reviewed · back in ${days} day${days === 1 ? "" : "s"}`);
    setLog((l) => [...l, { g, days, bits }]);
    setShown(false);
    setI((n) => n + 1);
    setBusy(false);
    if (queue && i + 1 >= queue.length) track("dsa_review_done", { cards: queue.length });
  };

  return (
    <section aria-labelledby="cards-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cards-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
          Your cards
        </h2>
        <span className="font-mono text-[12px] text-fg-3">{ready ? `${due.length} due · ${cards.length} in your queue` : " "}</span>
      </div>
      {!ready ? (
        <div aria-busy="true" className="h-[90px] animate-pulse bg-surface-2" />
      ) : card ? (
        <div className="flex flex-col gap-4 border-2 border-signal bg-surface p-5 sm:p-6">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            card {i + 1} of {queue!.length} · box {card.box}
            {card.detail.context ? ` · ${card.detail.context}` : ""}
          </span>
          <Face card={{ ...card, points: points(card)?.points, kind: points(card)?.kind }} side="front" />
          {shown ? (
            <>
              <div className="flex flex-col gap-2.5 border-t border-line pt-4">
                <Face card={{ ...card, points: points(card)?.points, kind: points(card)?.kind }} side="back" />
                {card.source === "mistake" && card.detail.why && <p className="m-0 text-[13.5px] leading-snug text-fg-3">{card.detail.why}</p>}
                {card.source === "mistake" && card.detail.href && (
                  <Link href={card.detail.href} className="self-start font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-4">
                    Open {card.detail.hrefLabel || "the lesson"} ›
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["again", "hard", "good", "easy"] as ReviewGrade[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={busy}
                    onClick={() => void grade(g)}
                    className={`flex min-h-12 flex-col items-center justify-center border px-2 font-mono text-[13px] ${g === "again" ? "border-bad text-bad-text" : g === "good" ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg"} disabled:opacity-50`}
                  >
                    <span className="font-semibold capitalize">{g}</span>
                    <span className="text-[11px] opacity-80">{intervalForBox(nextBox(g, card.box))}d</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setShown(true)} className="inline-flex min-h-11 items-center self-start bg-signal px-4 font-mono text-[13.5px] font-semibold text-on-signal">
              Show the answer
            </button>
          )}
        </div>
      ) : queue && log.length ? (
        <div className="flex flex-col gap-2 border border-ok bg-surface p-5">
          <span className="font-display text-[20px] font-bold text-fg">Done: {log.length} card{log.length === 1 ? "" : "s"} reviewed.</span>
          <span className="text-[14px] text-fg-2">
            {log.filter((l) => l.g === "again").length} back tomorrow, the rest later.{log.some((l) => l.bits > 0) ? ` +${log.reduce((a, l) => a + l.bits, 0)} Bits.` : ""}
          </span>
        </div>
      ) : list.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-5">
          <span className="text-[15px] text-fg-2">
            {list.length} card{list.length === 1 ? "" : "s"} due today, about {Math.max(1, Math.round(list.length / 3))} min.
          </span>
          <button
            type="button"
            onClick={() => {
              setQueue([...list].sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt)));
              setI(0);
              setShown(false);
              setLog([]);
            }}
            className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13.5px] font-semibold text-on-signal"
          >
            Start the review →
          </button>
        </div>
      ) : (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[14px] text-fg-2">
          {cards.length ? "No cards due today." : "No cards yet."} Mark a card &quot;again&quot; in a pattern deck below and it comes back here: tomorrow, then after 3, 7, 16 and 35 days as you get it right.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ pattern decks */

function DeckViewer({ deck, onClose }: { deck: DsaDeck; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [again, setAgain] = useState<string[]>([]);
  const card = deck.cards[i] || null;

  const next = useCallback(
    async (mark: "again" | "ok") => {
      if (!card) return;
      if (mark === "again") {
        setAgain((a) => [...a, card.id]);
        void addReviewCard({
          source: "interview",
          sourceRef: DSA_REVISE_REF(deck.concept, card.id),
          courseId: DSA_COURSE_ID,
          week: deck.module,
          lessonSlug: deck.concept,
          front: card.front,
          back: card.back,
          detail: { context: `${deck.title} · ${KIND_LABEL[card.kind]}`, short: card.kind === "card" ? undefined : `${KIND_LABEL[card.kind]} · ${deck.title}` },
        });
      }
      setShown(false);
      setI((n) => n + 1);
      if (i + 1 >= deck.cards.length) track("dsa_deck_done", { concept: deck.concept, again: again.length + (mark === "again" ? 1 : 0) });
    },
    [card, deck, i, again.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "Escape") onClose();
      else if (!card) return;
      else if (e.key === " " && !shown) {
        e.preventDefault();
        setShown(true);
      } else if (shown && (e.key === "1" || e.key === "ArrowLeft")) void next("again");
      else if (shown && (e.key === "2" || e.key === "ArrowRight")) void next("ok");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, shown, next, onClose]);

  return (
    <section aria-labelledby="deck-h" className="flex flex-col gap-4 border-2 border-signal bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{deck.moduleCode}</span>
          <h3 id="deck-h" className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
            {deck.title}
          </h3>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12.5px] text-fg-2 hover:text-fg">
          Close deck
        </button>
      </div>
      <div aria-hidden className="h-1 bg-surface-2">
        <div className="h-1 bg-signal transition-[width] duration-300" style={{ width: `${(Math.min(i, deck.cards.length) / deck.cards.length) * 100}%` }} />
      </div>
      {card ? (
        <div className="flex min-h-[220px] flex-col gap-4" aria-live="polite">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            {KIND_LABEL[card.kind]} · card {i + 1} of {deck.cards.length}
          </span>
          <Face card={card} side="front" />
          {shown ? (
            <>
              <div className="border-t border-line pt-4">
                <Face card={card} side="back" />
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2 sm:max-w-[420px]">
                <button type="button" onClick={() => void next("again")} className="min-h-12 border border-bad px-3 font-mono text-[13px] font-semibold text-bad-text">
                  Again <span className="font-normal opacity-75">· to my cards</span>
                </button>
                <button type="button" onClick={() => void next("ok")} className="min-h-12 bg-signal px-3 font-mono text-[13px] font-semibold text-on-signal">
                  Got it
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setShown(true)} className="mt-auto inline-flex min-h-11 items-center self-start bg-signal px-4 font-mono text-[13.5px] font-semibold text-on-signal">
              Show the answer
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="font-display text-[20px] font-bold text-fg">Deck done.</span>
          <span className="text-[14.5px] text-fg-2">
            {again.length ? `${again.length} card${again.length === 1 ? "" : "s"} went to your cards: they come back tomorrow.` : "You knew every card. It's worth a re-solve next."}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setI(0);
                setAgain([]);
              }}
              className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12.5px] text-fg"
            >
              Go again
            </button>
            <Link href={deck.href} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12.5px] text-fg">
              Open the lesson
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function Decks({ decks }: { decks: DsaDeck[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const { cards } = useReviewCards("dsa");
  const inQueue = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) if (c.lessonSlug) m.set(c.lessonSlug, (m.get(c.lessonSlug) || 0) + 1);
    return m;
  }, [cards]);
  const deck = decks.find((d) => d.concept === open) || null;
  const total = decks.reduce((a, d) => a + d.cards.length, 0);
  return (
    <section aria-labelledby="decks-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="decks-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
          Pattern decks
        </h2>
        <span className="font-mono text-[12px] text-fg-3">
          {decks.length} concepts · {total} cards
        </span>
      </div>
      <p className="m-0 max-w-[720px] text-[14.5px] leading-relaxed text-fg-2">
        Each concept boiled down to its recall questions, its invariant, the signals that point to it, its key ideas and the mistakes in its museum. Five minutes a deck.
      </p>
      {deck ? <DeckViewer key={deck.concept} deck={deck} onClose={() => setOpen(null)} /> : null}
      <ul className="m-0 grid list-none grid-cols-1 border-l border-t border-line p-0 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((d) => (
          <li key={d.concept} className="flex border-b border-r border-line">
            <button
              type="button"
              onClick={() => {
                setOpen(d.concept);
                track("dsa_deck_open", { concept: d.concept });
                requestAnimationFrame(() => document.getElementById("decks-h")?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}
              aria-pressed={open === d.concept}
              className={`flex w-full flex-col items-start gap-1.5 p-4 text-left ${open === d.concept ? "bg-surface-2 shadow-[inset_3px_0_0_var(--c-signal)]" : "bg-surface hover:bg-surface-2"}`}
            >
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{d.moduleCode}</span>
              <span className="text-[16px] font-semibold text-fg">{d.title}</span>
              <span className="font-mono text-[12px] text-fg-3">
                {d.cards.length} cards{inQueue.get(d.concept) ? ` · ${inQueue.get(d.concept)} in your cards` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DsaRevise({ decks, problems }: { decks: DsaDeck[]; problems: ReviseProblem[] }) {
  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <DsaCrumbs items={[{ href: "/dsa", label: "DSA Mastery" }, { label: "Revise" }]} />
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Revise · re-solve, recall, repeat</span>
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            Revise<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-fg-2">
            The problems that tripped you up come back until you can solve them cold, and every concept has a deck of cards from its lesson.
          </p>
        </header>
        <Resolves problems={byId} />
        <DueCards decks={decks} />
        <Decks decks={decks} />
      </main>
    </div>
  );
}
