"use client";

/**
 * The daily warm-up: one quick question (about 30 seconds) from what the learner studied lately (their recent lessons' quiz
 * questions and predict exercises, else the lessons of their station, else the Toolkit; src/lib/dsa/warmup.ts). One a day,
 * the same all day: the pick is stored in this browser for the day, so finishing a lesson doesn't change it. Answering shows
 * the right answer and a one-line why, and counts as an activity day: the game key `dsa:warm:<day>` (account-synced, for the
 * Progress heatmap and streak) and record_learning_activity, the call every lesson step makes.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { recordLearningActivity } from "@/components/learn/lesson/progress";
import { localDay } from "@/lib/dsa/revise";
import { pickWarmup, shuffledOrder, warmDoneToday, warmKey, warmSeed, type WarmQ } from "@/lib/dsa/warmup";
import { track } from "@/lib/track";
import { useActivityStreak } from "../progress/useActivityStreak";
import { CARD_H, KICKER, SIDE_CARD } from "../ui/kit";

type Saved = { q: WarmQ; picked: number | null };
const storeKey = (uid: string, day: string) => `dsa.warmup.v1:${uid}:${day}`;

function readSaved(uid: string, day: string): Saved | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(storeKey(uid, day)) || "null") as Saved | null;
    return v && v.q && Array.isArray(v.q.options) ? v : null;
  } catch {
    return null;
  }
}
function writeSaved(uid: string, day: string, s: Saved) {
  try {
    window.localStorage.setItem(storeKey(uid, day), JSON.stringify(s));
    // yesterday's and older picks are not needed again
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("dsa.warmup.v1:") && !k.endsWith(`:${day}`)) window.localStorage.removeItem(k);
    }
  } catch {
    // storage unavailable: the card still works for this page view
  }
}

const OPTION = "flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

export default function WarmupCard({ recent, station, ready }: { recent: string[]; station: string[]; ready: boolean }) {
  const { user, loading } = useAuth();
  const { done, hydrated, markDone } = useGame();
  // the one main streak (the activity streak Progress and the Today card show): never a warm-up-only count
  const streak = useActivityStreak();
  const uid = user?.id || "guest";
  const day = useSyncExternalStore(
    () => () => {},
    () => localDay(Date.now()),
    () => "",
  );
  const [saved, setSaved] = useState<Saved | null>(null);
  const [state, setState] = useState<"wait" | "loading" | "ready" | "none">("wait");
  const doneToday = hydrated && !!day && warmDoneToday(done, day);
  // the question is chosen once a day, when the learner's progress and place are known; later changes don't redo it
  const asked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (loading || !hydrated || !day || !ready || asked.current) return;
    asked.current = true;
    const s = readSaved(uid, day);
    if (s) {
      setSaved(s);
      setState("ready");
      return;
    }
    // done on another device today: the same question (the pick is seeded by user and day) is shown with its answer, not asked again
    const already = warmDoneToday(done, day);
    setState("loading");
    const qs = new URLSearchParams({ recent: recent.join(","), station: station.join(",") });
    fetch(`/api/dsa/warmup?${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ tiers: WarmQ[][] }>) : null))
      .then((b) => {
        if (!alive.current) return;
        const pick = b ? pickWarmup(b.tiers, warmSeed(user?.id, day)) : null;
        if (!pick) return setState("none");
        const next = { q: pick.q, picked: already ? -1 : null }; // -1: answered somewhere else, the pick is unknown
        writeSaved(uid, day, next);
        setSaved(next);
        setState("ready");
        if (!already) track("dsa_warmup_shown", { tier: pick.tier });
      })
      .catch(() => alive.current && setState("none"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hydrated, day, uid, ready]);

  const order = useMemo(() => (saved ? shuffledOrder(saved.q.options.length, `${saved.q.id}|${warmSeed(user?.id, day)}`) : []), [saved, user?.id, day]);

  const answer = (i: number) => {
    if (!saved || saved.picked !== null) return;
    const next = { ...saved, picked: i };
    setSaved(next);
    writeSaved(uid, day, next);
    markDone([warmKey(day)]);
    if (user) void recordLearningActivity(user.id);
    track("dsa_warmup_answered", { correct: i === saved.q.answer, kind: saved.q.kind });
  };

  if (state === "wait" || (state === "none" && !doneToday)) return null;
  if (state === "loading") return <div aria-hidden className="min-h-[220px] rounded-2xl border border-line bg-surface" />;

  const days = streak?.current ?? 0;
  if (state === "none" || !saved)
    return (
      <section aria-labelledby="dsa-warm-h" className={`${SIDE_CARD} !gap-2`}>
        <h2 id="dsa-warm-h" className={CARD_H}>
          Daily warm-up
        </h2>
        <p className="m-0 flex items-center gap-2 text-[14px] font-medium text-ok-text">
          <Check className="h-4 w-4" aria-hidden /> Done for today ✓{days > 0 ? ` · ${days}-day streak` : ""}
        </p>
      </section>
    );

  const { q } = saved;
  const answered = saved.picked !== null;
  const right = answered && saved.picked === q.answer;
  return (
    <section aria-labelledby="dsa-warm-h" className={`${SIDE_CARD} !gap-3.5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="dsa-warm-h" className={CARD_H}>
          Daily warm-up
        </h2>
        <span className="font-mono text-[12px] text-fg-3">{answered ? "done today" : "about 30 s"}</span>
      </div>
      <p className={KICKER}>From {q.lesson}</p>
      <p className="m-0 text-[15.5px] font-semibold leading-snug text-fg">{q.question}</p>
      {q.code ? (
        <pre className="m-0 max-h-[220px] overflow-auto rounded-xl bg-bg p-3 font-mono text-[12.5px] leading-relaxed text-fg">
          <code>{q.code}</code>
        </pre>
      ) : null}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2 p-0" aria-label="Choose one">
        {order.map((oi) => {
          const isRight = oi === q.answer;
          const isPicked = saved.picked === oi;
          const tone = !answered ? "border-line-strong bg-surface text-fg hover:bg-surface-2" : isRight ? "border-ok bg-surface text-fg" : isPicked ? "border-bad bg-surface text-fg" : "border-line bg-surface text-fg-3";
          return (
            <li key={oi}>
              <button type="button" disabled={answered} onClick={() => answer(oi)} aria-pressed={isPicked} className={`${OPTION} ${tone} ${answered ? "cursor-default" : ""}`}>
                <span className="min-w-0 flex-1">{q.options[oi]}</span>
                {answered && isRight ? <Check className="h-4 w-4 shrink-0 text-ok-text" aria-label="correct answer" /> : answered && isPicked ? <X className="h-4 w-4 shrink-0 text-bad-text" aria-label="your answer" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {!answered ? <p className="m-0 text-[12.5px] leading-snug text-fg-3">Pick one. An answer, right or wrong, keeps today&apos;s streak going.</p> : null}
      {answered ? (
        <div className="flex flex-col gap-2.5" aria-live="polite">
          <p className="m-0 text-[13.5px] leading-snug text-fg-2">
            <span className={`font-semibold ${right ? "text-ok-text" : "text-fg"}`}>{saved.picked === -1 ? "Today's answer is marked. " : right ? "Right. " : "Not quite. "}</span>
            {q.why}
          </p>
          <p className="m-0 flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13.5px] font-medium text-fg">
            <Check className="h-4 w-4 shrink-0 text-ok-text" aria-hidden /> Done for today ✓{days > 0 ? ` · ${days}-day streak` : ""}
          </p>
          <Link href={q.href} className="self-start text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            Revisit {q.lesson} →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
