"use client";

/**
 * The Review tab's "Due now": the spaced-repetition cards as flip cards. Same data and scheduler as before (the shared
 * review_cards queue, course_id 'dsa', or this browser's queue for guests; Leitner boxes in src/lib/learn/review.ts): the
 * front is the prompt, the back the answer, a link to where it is taught and Again / Hard / Got it
 * (src/lib/dsa/flip.ts maps them onto the scheduler's grades). Space flips, 1 / 2 / 3 grade; on a phone a card swipes
 * left for Again and right for Got it. With nothing due, "Practise anyway" deals random cards from the pattern decks
 * (only "Again" there writes anything: it adds the card to the queue).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import { useDsaStreak } from "@/components/dsa/daily/useDsaDaily";
import { dsaProgressKeys } from "@/lib/dsa/rewards";
import { istDate } from "@/lib/learn/arena/shared";
import { addReviewCard, gradeReviewCard, intervalForBox, localDate, nextBox, type ReviewCard } from "@/lib/learn/review";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { track } from "@/lib/track";
import { DSA_COURSE_ID } from "@/lib/dsa/types";
import { DSA_REVISE_REF, type DsaDeck, type DsaRevCard } from "@/lib/dsa/revise";
import { FLIP_CHOICES, SWIPE_AT, choiceForKey, choiceForSwipe, gradeFor, nextReviewLine, progressLabel, progressPct, sampleCards, type FlipChoice } from "@/lib/dsa/flip";
import "../dsa.css";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, FILL, KICKER, MID, TRACK } from "../ui/kit";

const KIND_LABEL: Record<DsaRevCard["kind"], string> = { card: "Recall", invariant: "Invariant", signals: "Signals", ideas: "Key ideas", pitfall: "Mistake museum" };
const PRACTICE_SIZE = 10;
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

type Item = {
  key: string;
  front: string;
  back: string;
  points?: string[];
  kind?: DsaRevCard["kind"];
  context: string;
  why?: string;
  href?: string;
  hrefLabel?: string;
  /** a queued card (grading moves it along the Leitner boxes); absent for a practice card */
  card?: ReviewCard;
  practice?: { deck: DsaDeck; c: DsaRevCard };
};

type Session = { items: Item[]; practice: boolean };
type Logged = { choice: FlipChoice; days: number; bits: number };

function Back({ it }: { it: Item }) {
  if (it.points && it.points.length > 1)
    return it.kind === "signals" ? (
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {it.points.map((x) => (
          <li key={x} className="rounded-full border border-signal px-3 py-1 font-mono text-[13px] text-signal-text">
            {x}
          </li>
        ))}
      </ul>
    ) : (
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-fg">
        {it.points.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    );
  return <p className="m-0 text-[16px] leading-relaxed text-fg">{it.back}</p>;
}

export default function FlipReview({ decks }: { decks: DsaDeck[] }) {
  const { cards, due, ready } = useReviewCards("dsa");
  const { award } = useDsaAward();
  const streak = useDsaStreak();
  const [session, setSession] = useState<Session | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Logged[]>([]);
  const [drag, setDrag] = useState(0);
  const started = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const deckOf = useMemo(() => new Map(decks.map((d) => [d.concept, d])), [decks]);

  const itemOf = useCallback(
    (c: ReviewCard): Item => {
      const m = c.sourceRef.match(/^dsa-revise:([^:]+):(.+)$/);
      const deck = m ? deckOf.get(m[1]) : undefined;
      const dc = deck?.cards.find((x) => x.id === m?.[2]);
      // a card from the learner's own mistakes carries its key points itself
      const own = c.detail.points?.length ? c.detail.points.map((p) => (p.k ? `${p.k} ${p.v}` : p.v)) : undefined;
      const lessonId = deck?.concept || c.lessonSlug || "";
      return {
        key: c.id,
        front: c.front,
        back: c.back,
        points: dc?.points ?? own,
        kind: dc?.kind,
        context: c.detail.context || (deck ? `${deck.title} · ${KIND_LABEL[dc?.kind ?? "card"]}` : "Review card"),
        why: c.source === "mistake" ? c.detail.why : undefined,
        href: c.detail.href || (deck ? deck.href : lessonId ? `/dsa/concepts/${lessonId}` : undefined),
        hrefLabel: c.detail.href ? c.detail.hrefLabel || "the lesson" : deck ? deck.title : "the lesson",
        card: c,
      };
    },
    [deckOf],
  );

  // the session starts by itself when cards are due; the queue is a snapshot, so grading does not reshuffle it
  useEffect(() => {
    if (!ready || started.current || !due.length) return;
    started.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time snapshot of the queue when it first loads
    setSession({ items: [...due].sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt)).map(itemOf), practice: false });
    setI(0);
    setFlipped(false);
    setLog([]);
  }, [ready, due, itemOf]);

  const practise = useCallback(() => {
    const pool: Item[] = decks.flatMap((d) =>
      d.cards.map((c) => ({
        key: `p:${d.concept}:${c.id}`,
        front: c.front,
        back: c.back,
        points: c.points,
        kind: c.kind,
        context: `${d.title} · ${KIND_LABEL[c.kind]}`,
        href: d.href,
        hrefLabel: d.title,
        practice: { deck: d, c },
      })),
    );
    if (!pool.length) return;
    setSession({ items: sampleCards(pool, PRACTICE_SIZE), practice: true });
    setI(0);
    setFlipped(false);
    setLog([]);
    track("dsa_review_practise", {});
  }, [decks]);

  const items = session?.items ?? [];
  const it = session && i < items.length ? items[i] : null;
  const finished = !!session && !it && log.length > 0;

  const grade = useCallback(
    async (choice: FlipChoice) => {
      if (!it || !session || busy || !flipped) return;
      setBusy(true);
      let days = 0;
      let bits = 0;
      if (it.card) {
        days = intervalForBox(nextBox(gradeFor(choice), it.card.box));
        await gradeReviewCard(it.card, gradeFor(choice));
        // a reviewed card: DSA Mastery Bits once per card per day (dsa:rv:<day>:<card>), never SD Mastery XP
        bits = award([dsaProgressKeys.revise(istDate(), it.card.id)], `Card reviewed · back in ${days} day${days === 1 ? "" : "s"}`);
      } else if (it.practice && choice === "again") {
        days = 1;
        void addReviewCard({
          source: "interview",
          sourceRef: DSA_REVISE_REF(it.practice.deck.concept, it.practice.c.id),
          courseId: DSA_COURSE_ID,
          week: it.practice.deck.module,
          lessonSlug: it.practice.deck.concept,
          front: it.practice.c.front,
          back: it.practice.c.back,
          detail: { context: it.context, short: it.practice.c.kind === "card" ? undefined : `${KIND_LABEL[it.practice.c.kind]} · ${it.practice.deck.title}` },
        });
      }
      setLog((l) => [...l, { choice, days, bits }]);
      setFlipped(false);
      setDrag(0);
      setI((n) => n + 1);
      setBusy(false);
      if (i + 1 >= items.length) track("dsa_review_done", { cards: items.length, practice: session.practice });
    },
    [it, session, busy, flipped, award, i, items.length],
  );

  // Space flips, 1 / 2 / 3 grade. Only while a card is on screen, and never over a button, link or field
  useEffect(() => {
    if (!it) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.isContentEditable)) return;
      const r = cardRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      const c = choiceForKey(e.key);
      if (c && flipped) {
        e.preventDefault();
        void grade(c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [it, flipped, grade]);

  // swipe (touch and pen; a mouse uses the buttons): left Again, right Got it, once the card is turned over
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !flipped || busy) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - s.y)) setDrag(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const c = choiceForSwipe(e.clientX - s.x, e.clientY - s.y);
    if (c) void grade(c);
    else setDrag(0);
  };
  const dragTint = drag <= -SWIPE_AT / 2 ? "var(--c-bad)" : drag >= SWIPE_AT / 2 ? "var(--c-ok)" : "";

  const todayStr = localDate();
  const aheadDays = useMemo(() => cards.map((c) => Math.round((new Date(`${c.dueAt}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86_400_000)), [cards, todayStr]);
  const emptyLine = cards.length ? nextReviewLine(aheadDays) : "Nothing due yet";

  const total = items.length;
  const kicker = it ? `${progressLabel(i, total, session!.practice)} · ${it.context}` : "";

  return (
    <section aria-labelledby="cards-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cards-h" className="m-0 font-display text-[24px] font-bold tracking-[-0.02em] text-fg">
          {session?.practice ? "Practise" : "Due now"}
        </h2>
        <span className="text-[12.5px] text-fg-3">{ready ? `${due.length} due · ${cards.length} in your queue` : " "}</span>
      </div>

      {!ready ? (
        <div aria-busy="true" aria-label="Loading your cards" className="h-[260px] animate-pulse rounded-[18px] bg-surface-2" />
      ) : it ? (
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3.5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`${KICKER} min-w-0 truncate`}>{kicker}</span>
              {it.card ? <span className="shrink-0 text-[12px] text-fg-3">box {it.card.box}</span> : null}
            </div>
            <span
              role="progressbar"
              aria-label="Session progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={i}
              aria-valuetext={`${i} of ${total} done`}
              className={TRACK}
            >
              <span className={`${FILL} bg-signal transition-[width] duration-300`} style={{ width: `${progressPct(i, total)}%` }} />
            </span>
          </div>

          <div
            ref={cardRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              start.current = null;
              setDrag(0);
            }}
            style={{ transform: drag ? `translateX(${drag}px) rotate(${drag / 40}deg)` : undefined, transition: drag ? "none" : "transform 0.2s", touchAction: "pan-y", ...(dragTint ? { boxShadow: `0 0 0 2px ${dragTint}` } : null) }}
            className="rounded-[18px]"
          >
            <div className="dsa-flip" data-flipped={flipped}>
              <div className="dsa-flip-inner">
                <div className={`dsa-flip-face dsa-flip-front ${CARD} flex min-h-[300px] flex-col justify-between gap-6 p-6 sm:min-h-[320px] sm:p-8`} aria-hidden={flipped} inert={flipped}>
                  <span className={KICKER}>{it.kind ? KIND_LABEL[it.kind] : "Question"}</span>
                  <p className="m-0 font-display text-[22px] font-bold leading-snug tracking-[-0.01em] text-fg sm:text-[27px]">{it.front}</p>
                  <button type="button" onClick={() => setFlipped(true)} className={`${BTN_PRIMARY} ${MID} min-h-12 self-start px-5`}>
                    Flip the card
                    <kbd className="rounded-md border border-current px-1.5 font-mono text-[11px] font-normal opacity-80 max-sm:hidden">Space</kbd>
                  </button>
                </div>
                <div className={`dsa-flip-face dsa-flip-back ${CARD} flex min-h-[300px] flex-col gap-5 p-6 sm:min-h-[320px] sm:p-8`} aria-hidden={!flipped} inert={!flipped}>
                  <span className={KICKER}>Answer</span>
                  <div className="flex flex-col gap-3">
                    <Back it={it} />
                    {it.why ? <p className="m-0 text-[13.5px] leading-snug text-fg-3">{it.why}</p> : null}
                    {it.href ? (
                      <Link href={it.href} className={`self-start text-[13.5px] font-medium text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg ${FOCUS}`}>
                        Open {it.hrefLabel || "the lesson"} →
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-auto flex flex-col gap-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      {FLIP_CHOICES.map((c) => {
                        const days = it.card ? intervalForBox(nextBox(gradeFor(c.id), it.card.box)) : null;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={busy}
                            onClick={() => void grade(c.id)}
                            className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-2 text-[14px] font-semibold disabled:opacity-50 ${FOCUS} ${
                              c.id === "got" ? "bg-signal text-on-signal" : c.id === "again" ? "border border-bad bg-surface text-bad-text hover:bg-surface-2" : "border border-line-strong bg-surface text-fg hover:bg-surface-2"
                            }`}
                          >
                            <span>{c.label}</span>
                            <span className="flex items-center gap-1.5 text-[11.5px] font-normal opacity-80">
                              {days ? `${days} day${days === 1 ? "" : "s"}` : it.practice && c.id === "again" ? "adds to my cards" : " "}
                              <kbd className="rounded border border-current px-1 font-mono text-[10.5px] leading-[14px] max-sm:hidden">{c.key}</kbd>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="m-0 flex items-center justify-center gap-3 text-[12px] text-fg-3 sm:hidden" aria-hidden>
                      <span className="inline-flex items-center gap-1">
                        <ArrowLeft className="h-3 w-3" /> Again
                      </span>
                      <span className="inline-flex items-center gap-1">
                        Got it <ArrowRight className="h-3 w-3" />
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="m-0 text-center text-[12px] text-fg-3 max-sm:hidden">Space flips · 1 Again · 2 Hard · 3 Got it</p>
        </div>
      ) : finished ? (
        <div className={`${CARD} mx-auto flex w-full max-w-[720px] flex-col gap-4 p-6 sm:p-8`}>
          <span className={KICKER}>{session!.practice ? "Practice done" : "Session done"}</span>
          <p className="m-0 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[30px]">
            {log.length} card{log.length === 1 ? "" : "s"} {session!.practice ? "practised" : "reviewed"}.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {FLIP_CHOICES.map((c) => (
              <div key={c.id} className="flex flex-col gap-0.5 rounded-xl bg-bg px-3 py-3">
                <span className="font-display text-[26px] font-extrabold leading-none text-fg">{log.filter((l) => l.choice === c.id).length}</span>
                <span className="text-[12.5px] text-fg-3">{c.label}</span>
              </div>
            ))}
          </div>
          <p className="m-0 text-[14.5px] leading-relaxed text-fg-2">
            {log.some((l) => l.choice === "again") ? `${log.filter((l) => l.choice === "again").length} back tomorrow. ` : "Every card went up a box. "}
            {log.some((l) => l.bits > 0) ? `+${log.reduce((a, l) => a + l.bits, 0)} Bits. ` : ""}
            {streak ? (streak.current > 0 ? `You are on a ${streak.current}-day streak.` : "Solve today's problem to start a streak.") : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={practise} className={`${BTN_SECONDARY} ${MID}`}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Practise more
            </button>
            <Link href="/dsa/practice" className={`${BTN_SECONDARY} ${MID}`}>
              Open Practice
            </Link>
          </div>
        </div>
      ) : (
        <div className={`${CARD} mx-auto flex w-full max-w-[720px] flex-col gap-4 p-6 sm:p-8`}>
          <span className={KICKER}>Due now</span>
          <p className="m-0 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[28px]">{emptyLine}</p>
          <p className="m-0 max-w-[56ch] text-[14.5px] leading-relaxed text-fg-2">
            {cards.length ? "Cards come back on the day they are due." : "Mark a card \"Again\" in a pattern deck below and it comes back here: tomorrow, then after 3, 7, 16 and 35 days as you get it right."} Want more now? Take {Math.min(PRACTICE_SIZE, decks.reduce((a, d) => a + d.cards.length, 0))} random cards.
          </p>
          <button type="button" onClick={practise} disabled={!decks.length} className={`${BTN_PRIMARY} ${MID} min-h-12 self-start px-5 disabled:opacity-50`}>
            Practise anyway
          </button>
        </div>
      )}
    </section>
  );
}
