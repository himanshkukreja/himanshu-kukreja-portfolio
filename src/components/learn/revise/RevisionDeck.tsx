"use client";

/**
 * Interview-night revision: a full-screen deck of 5-minute cards for one lesson or a whole world.
 * Swipe (touch or mouse drag), arrow keys or the buttons flip cards; "Got it" / "Again" mark them.
 * "Again" cards join the review queue (Daily standup). Everything works offline once saved: the
 * cards ship in the page, progress lives in localStorage, XP and analytics queue like elsewhere.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle, X } from "lucide-react";
import type { DeckLesson, DeckWeek } from "@/lib/learn/revision/load";
import { plain } from "@/lib/learn/revision/parse";
import { addReviewCard } from "@/lib/learn/review";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import CardFace, { KIND_DOT, KIND_LABEL } from "./CardFace";
import { REVISE_EVENT, REVISE_WEEK_XP, recordRun, readRevise, toReviewCard, weekRevised, type ReviseState } from "./store";
import styles from "./revise.module.css";

export type DeckProps = {
  course: string;
  week: Pick<DeckWeek, "key" | "id" | "num" | "code" | "title" | "badge" | "lessons">;
  /** lesson deck: that lesson's slug; whole world when absent */
  lesson?: string;
  /** where × goes */
  exitHref: string;
  exitLabel: string;
  /** lesson deck: the next lesson's deck */
  next?: { href: string; label: string } | null;
};

type Mark = "got" | "again";
type Item = { lesson: DeckLesson; idx: number; n: number; of: number };

const SECONDS_PER_LESSON = 300;
const SWIPE_PX = 64;

const fmt = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, "0")}`;

function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export default function RevisionDeck({ course, week, lesson, exitHref, exitLabel, next }: DeckProps) {
  const router = useRouter();
  const { awardOnce } = useGame();
  const lessons = useMemo(() => (lesson ? week.lessons.filter((l) => l.slug === lesson) : week.lessons), [week.lessons, lesson]);
  const items: Item[] = useMemo(() => lessons.flatMap((l) => l.cards.map((_, i) => ({ lesson: l, idx: i, n: i + 1, of: l.cards.length }))), [lessons]);
  const natural = useMemo(() => items.map((_, i) => i), [items]);
  const mode: "lesson" | "week" = lesson ? "lesson" : "week";
  const target = SECONDS_PER_LESSON * Math.max(1, lessons.length);

  const [order, setOrder] = useState<number[]>(natural);
  const [pos, setPos] = useState(0);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [isShuffled, setIsShuffled] = useState(false);
  const [round, setRound] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [elapsed, setElapsed] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [queued, setQueued] = useState(0);
  const [xp, setXp] = useState(0);
  const finishedOnce = useRef(false);
  const drag = useRef<{ x: number; y: number; id: number; h: boolean | null; dx: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const done = pos >= order.length;
  const cur = done ? null : items[order[pos]];
  const curIdx = done ? -1 : order[pos];
  const label = mode === "lesson" ? lessons[0]?.short || "Lesson" : `World ${week.code}`;

  // lock the page behind the deck
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    track("revise_open", { week: week.key, mode, ...(lesson ? { lesson } : {}), cards: items.length });
    // once per deck page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the five-minute fuse: runs while the deck is visible and unfinished
  useEffect(() => {
    if (done) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setElapsed((e) => e + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [done]);

  const go = useCallback(
    (step: 1 | -1) => {
      setDir(step);
      setDx(0);
      setPos((p) => Math.max(0, Math.min(order.length, p + step)));
    },
    [order.length]
  );

  const mark = useCallback(
    (m: Mark) => {
      if (curIdx < 0 || !cur) return;
      setMarks((s) => ({ ...s, [curIdx]: m }));
      if (m === "again") {
        const c = cur.lesson.cards[cur.idx];
        void addReviewCard(toReviewCard(c, { course, week: week.key, slug: cur.lesson.slug, tag: cur.lesson.tag, lesson: cur.lesson.short })).then((r) => {
          if (r.ok && !r.duplicate) setQueued((q) => q + 1);
        });
      }
      go(1);
    },
    [cur, curIdx, course, week.key, go]
  );

  const reveal = useCallback(() => {
    if (curIdx >= 0) setRevealed((r) => ({ ...r, [curIdx]: true }));
  }, [curIdx]);

  const toggleShuffle = useCallback(() => {
    const seen = order.slice(0, pos);
    const rest = isShuffled ? natural.filter((i) => !seen.includes(i)) : shuffled(order.slice(pos));
    setOrder([...seen, ...rest]);
    setIsShuffled(!isShuffled);
  }, [order, pos, natural, isShuffled]);

  const restart = useCallback(
    (only?: number[]) => {
      const base = only && only.length ? only : natural;
      setOrder(isShuffled ? shuffled(base) : base);
      setPos(0);
      setDir(1);
      setRevealed({});
      setRound((r) => r + 1);
      if (only) setMarks((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !only.includes(Number(k)))));
      else setMarks({});
    },
    [natural, isShuffled]
  );

  const gotCount = Object.values(marks).filter((m) => m === "got").length;
  const againIdx = order.filter((i) => marks[i] === "again");

  // first time through: progress, XP, analytics
  useEffect(() => {
    if (!done || finishedOnce.current || !items.length) return;
    finishedOnce.current = true;
    const run = { at: Date.now(), got: gotCount, again: againIdx.length, seconds: elapsed };
    const state = recordRun(
      week.key,
      lessons.map((l) => l.slug),
      run,
      mode === "week"
    );
    if (weekRevised(state, week.key, week.lessons.map((l) => l.slug))) {
      setXp(awardOnce(`revise:${week.key}`, REVISE_WEEK_XP, `World ${week.code} revised · ${week.title}`));
    }
    track("revise_complete", {
      week: week.key,
      mode,
      ...(lesson ? { lesson } : {}),
      cards: items.length,
      got: gotCount,
      again: againIdx.length,
      seconds: elapsed,
      on_time: elapsed <= target,
      shuffled: isShuffled,
      round,
    });
  }, [done, items.length, gotCount, againIdx.length, elapsed, week, lessons, mode, lesson, awardOnce, target, isShuffled, round]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        e.preventDefault();
        router.push(exitHref);
      } else if (done) {
        if (k === "enter" || k === "r") restart();
      } else if (k === "arrowright" || k === "j") {
        e.preventDefault();
        go(1);
      } else if (k === "arrowleft" || k === "k") {
        e.preventDefault();
        go(-1);
      } else if (k === "g" || k === "enter" || k === "arrowup") {
        e.preventDefault();
        mark("got");
      } else if (k === "a" || k === "arrowdown") {
        e.preventDefault();
        mark("again");
      } else if (k === " ") {
        e.preventDefault();
        if (cur && cur.lesson.cards[cur.idx].kind === "ask" && !revealed[curIdx]) reveal();
        else go(1);
      } else if (k === "s") {
        toggleShuffle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, go, mark, reveal, restart, toggleShuffle, router, exitHref, cur, curIdx, revealed]);

  // swipe: horizontal drags flip cards, vertical ones scroll the card
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, table")) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, h: null, dx: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (d.h === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      d.h = Math.abs(mx) > Math.abs(my);
      if (d.h) {
        setDragging(true);
        try {
          cardRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // pointer already gone
        }
      }
    }
    d.dx = mx;
    if (d.h) setDx(pos === 0 && mx > 0 ? mx / 3 : mx);
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || !d.h) return;
    // the last move, not the end event: a cancelled pointer reports clientX 0
    const mx = e.type === "pointercancel" ? d.dx : e.clientX - d.x || d.dx;
    if (mx <= -SWIPE_PX) go(1);
    else if (mx >= SWIPE_PX && pos > 0) go(-1);
    else setDx(0);
  };

  const left = target - elapsed;
  const fuse = Math.max(0, Math.min(100, (elapsed / target) * 100));
  const card = cur ? cur.lesson.cards[cur.idx] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Revision deck · ${label}`}
      className="fixed inset-0 z-[58] flex flex-col bg-bg pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] text-fg"
    >
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-line px-2 sm:px-4">
        <Link href={exitHref} aria-label={`Exit revision · back to ${exitLabel}`} className="grid h-12 w-12 shrink-0 place-items-center text-fg-3 hover:text-fg">
          <X className="h-5 w-5" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col py-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
            Revise · W{week.code}
            {cur && mode === "week" ? ` · ${cur.lesson.short}` : mode === "lesson" ? ` · ${label}` : ""}
          </span>
          <span className="truncate text-[14px] font-medium text-fg">{cur ? cur.lesson.title : mode === "week" ? week.title : lessons[0]?.title}</span>
        </div>
        <button
          type="button"
          onClick={toggleShuffle}
          aria-pressed={isShuffled}
          title="Shuffle the cards left (S)"
          className={`grid h-11 w-11 shrink-0 place-items-center border ${isShuffled ? "border-signal text-signal-text" : "border-transparent text-fg-3 hover:text-fg"}`}
        >
          <Shuffle className="h-[18px] w-[18px]" aria-hidden />
          <span className="sr-only">Shuffle</span>
        </button>
        <span
          className={`min-w-[64px] shrink-0 text-right font-mono text-[15px] font-semibold tabular-nums ${left < 0 ? "text-fg-3" : "text-fg"}`}
          title={`${fmt(target)} target`}
          aria-label={left >= 0 ? `${fmt(left)} left of ${fmt(target)}` : `${fmt(left)} over the ${fmt(target)} target`}
        >
          {left >= 0 ? fmt(left) : `+${fmt(left)}`}
        </span>
      </div>
      {/* fuse */}
      <div className="h-[3px] bg-surface-2" aria-hidden>
        <div className={`h-[3px] ${left < 0 ? "bg-fg-3" : "bg-signal"} ${styles.fuse}`} style={{ width: `${fuse}%` }} />
      </div>

      {/* progress: one segment per card, gaps between lessons */}
      <div
        role="progressbar"
        aria-label="Cards"
        aria-valuemin={0}
        aria-valuemax={order.length}
        aria-valuenow={Math.min(pos, order.length)}
        className="flex items-center gap-[3px] px-3 pt-3 sm:px-5"
      >
        {order.map((i, k) => {
          const m = marks[i];
          const gap = !isShuffled && k > 0 && items[order[k - 1]].lesson.slug !== items[i].lesson.slug;
          return (
            <span
              key={`${round}-${i}`}
              className={`h-[6px] min-w-[3px] flex-1 ${gap ? "ml-[5px]" : ""} ${
                k === pos ? "bg-signal" : m === "again" ? "bg-signal/40" : m === "got" ? "bg-fg" : k < pos ? "bg-fg-3" : "bg-surface-2"
              }`}
            />
          );
        })}
      </div>

      {/* card */}
      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden px-3 py-3 sm:items-center sm:px-6 sm:py-5">
        {card && cur ? (
          <div
            key={`${round}-${pos}`}
            ref={cardRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 60}deg)` } : undefined}
            className={`${styles.card} ${dragging ? "" : styles.settle} ${dx ? "" : dir === 1 ? styles.fromRight : styles.fromLeft} flex max-h-full w-full max-w-[720px] flex-col border border-line-strong bg-surface`}
            aria-live="polite"
            aria-roledescription="card"
            aria-label={`${KIND_LABEL[card.kind]} · card ${pos + 1} of ${order.length}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
              <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-label text-fg">
                <span aria-hidden className={`h-2.5 w-2.5 ${KIND_DOT[card.kind]}`} />
                {KIND_LABEL[card.kind]}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-fg-3">
                {cur.lesson.short} · {cur.n}/{cur.of}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
              <CardFace card={card} revealed={!!revealed[curIdx]} onReveal={reveal} />
            </div>
            {marks[curIdx] && (
              <div className="border-t border-line px-4 py-2 font-mono text-[11px] uppercase tracking-label text-fg-3 sm:px-6">
                marked {marks[curIdx] === "got" ? "got it" : "again"}
              </div>
            )}
          </div>
        ) : (
          <EndScreen
            label={label}
            mode={mode}
            week={week}
            lessonHref={mode === "lesson" ? lessons[0]?.href : undefined}
            seconds={elapsed}
            target={target}
            got={gotCount}
            again={againIdx.map((i) => items[i])}
            total={order.length}
            queued={queued}
            xp={xp}
            next={next}
            onAgain={() => restart(againIdx)}
            onRestart={() => restart()}
          />
        )}
      </div>

      {/* controls */}
      {!done && (
        <div className="flex flex-col gap-2 border-t border-line px-3 pb-3 pt-3 sm:px-6">
          <div className="mx-auto grid w-full max-w-[720px] grid-cols-[48px_1fr_1fr_48px] gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={pos === 0}
              aria-label="Previous card"
              className="grid h-[52px] place-items-center border border-line-strong text-fg-2 hover:text-fg disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => mark("again")}
              className="h-[52px] border border-line-strong px-3 text-[15px] font-semibold text-fg hover:border-signal hover:text-signal-text"
            >
              Again <span className="hidden font-mono text-[11px] font-normal text-fg-3 sm:inline">A</span>
            </button>
            <button type="button" onClick={() => mark("got")} className="h-[52px] bg-signal px-3 text-[15px] font-semibold text-on-signal hover:brightness-110">
              Got it <span className="hidden font-mono text-[11px] font-normal opacity-70 sm:inline">G</span>
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next card" className="grid h-[52px] place-items-center border border-line-strong text-fg-2 hover:text-fg">
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <p className="mx-auto hidden w-full max-w-[720px] justify-between font-mono text-[11px] text-fg-4 sm:flex">
            <span>← → flip · space next / show answer · S shuffle · esc exit</span>
            <span className="tabular-nums">
              {pos + 1} / {order.length}
            </span>
          </p>
          <p className="text-center font-mono text-[11px] text-fg-4 sm:hidden">swipe to flip · {pos + 1} / {order.length}</p>
        </div>
      )}
    </div>
  );
}

function EndScreen({
  label,
  mode,
  week,
  lessonHref,
  seconds,
  target,
  got,
  again,
  total,
  queued,
  xp,
  next,
  onAgain,
  onRestart,
}: {
  label: string;
  mode: "lesson" | "week";
  week: DeckProps["week"];
  lessonHref?: string;
  seconds: number;
  target: number;
  got: number;
  again: Item[];
  total: number;
  queued: number;
  xp: number;
  next?: DeckProps["next"];
  onAgain: () => void;
  onRestart: () => void;
}) {
  const unmarked = total - got - again.length;
  return (
    <div className={`flex max-h-full w-full max-w-[720px] flex-col gap-5 overflow-y-auto border border-line-strong bg-surface p-5 sm:p-8 ${styles.fromRight}`}>
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Deck cleared · W{week.code}</span>
      <h2 className="font-display text-[34px] font-bold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">{label} revised.</h2>
      <div className="grid grid-cols-3 border border-line">
        {[
          { k: "time", v: fmt(seconds), s: seconds <= target ? `under ${fmt(target)}` : `target ${fmt(target)}` },
          { k: "got it", v: String(got), s: unmarked > 0 ? `${unmarked} unmarked` : "cards" },
          { k: "again", v: String(again.length), s: again.length ? "to review" : "none" },
        ].map((x, i) => (
          <div key={x.k} className={`flex flex-col gap-1 p-3 sm:p-4 ${i ? "border-l border-line" : ""}`}>
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{x.k}</span>
            <span className="font-mono text-[26px] font-semibold leading-none tabular-nums text-fg sm:text-[30px]">{x.v}</span>
            <span className="text-xs text-fg-3">{x.s}</span>
          </div>
        ))}
      </div>
      {xp > 0 && (
        <div className="flex items-center justify-between gap-3 border border-signal px-4 py-3">
          <span className="text-[15px] font-semibold text-fg">World {week.code} revised</span>
          <span className="font-mono text-[13px] text-signal-text">+{xp} XP</span>
        </div>
      )}
      {again.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Marked again</span>
          <ul className="flex flex-col">
            {again.map((it) => {
              const c = it.lesson.cards[it.idx];
              return (
                <li key={`${it.lesson.slug}-${c.id}`} className="flex items-baseline gap-3 border-b border-line py-2 text-[15px] text-fg-2">
                  <span className="w-[64px] shrink-0 font-mono text-[11px] uppercase text-fg-3">{it.lesson.short}</span>
                  <span className="min-w-0">{c.kind === "numbers" || c.kind === "mistakes" ? KIND_LABEL[c.kind] : plain(c.title)}</span>
                </li>
              );
            })}
          </ul>
          <span className="text-sm text-fg-3">
            {queued > 0 ? `${queued} card${queued === 1 ? "" : "s"} added to ` : "They're in "}
            <Link href="/learn/review" className="text-signal-text underline decoration-line-strong underline-offset-4">
              your Daily standup review queue
            </Link>{" "}
            with spaced repetition.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {again.length > 0 && (
          <button type="button" onClick={onAgain} className="min-h-[52px] bg-signal px-5 text-[15px] font-semibold text-on-signal">
            Run the {again.length} again card{again.length === 1 ? "" : "s"}
          </button>
        )}
        {next && (
          <Link href={next.href} className={`flex min-h-[52px] items-center justify-center px-5 text-[15px] font-semibold ${again.length ? "border border-line-strong text-fg" : "bg-signal text-on-signal"}`}>
            {next.label} →
          </Link>
        )}
        <Link href={`/learn/cheatsheet/${week.id}`} className="flex min-h-[52px] items-center justify-center border border-line-strong px-5 text-[15px] font-semibold text-fg hover:border-fg-3">
          World {week.code} cheat sheet
        </Link>
        {mode === "lesson" && (
          <Link href={`/learn/revise/${week.id}`} className="flex min-h-[52px] items-center justify-center border border-line-strong px-5 text-[15px] font-semibold text-fg hover:border-fg-3">
            Flip the whole world
          </Link>
        )}
        <button type="button" onClick={onRestart} className="flex min-h-[52px] items-center justify-center gap-2 border border-line-strong px-5 text-[15px] text-fg-2 hover:text-fg">
          <RotateCcw className="h-4 w-4" aria-hidden /> Flip again
        </button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-xs">
        {lessonHref && (
          <Link href={lessonHref} className="text-fg-3 hover:text-fg">
            ← back to the lesson
          </Link>
        )}
        <Link href="/learn/revise" className="text-fg-3 hover:text-fg">
          all revision decks
        </Link>
      </div>
    </div>
  );
}

export function useRevisedState() {
  const [s, setS] = useState<ReviseState>({ lessons: {}, weeks: {} });
  useEffect(() => {
    const read = () => setS(readRevise());
    read();
    window.addEventListener(REVISE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(REVISE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return s;
}
