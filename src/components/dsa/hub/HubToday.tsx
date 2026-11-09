"use client";

/**
 * The hub's row under the campus: today's daily problem and streak, what's due in Revise (re-solves and cards), and
 * the certificate's progress. All per learner, so it paints in on the client.
 */
import Link from "next/link";
import { useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { DSA_CERT_NAME, foundationsEligibility, signalsFromGame } from "@/lib/dsa/cert/rules";
import type { WorldSpec } from "@/lib/dsa/types";
import DailyCard from "../daily/DailyCard";
import { useResolves } from "../revise/useResolves";
import { useDsaProgress } from "../progress/useDsaProgress";

const CARD = "flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 sm:p-5";
const H = "m-0 font-mono text-[11px] uppercase tracking-label text-signal-text";

function ReviseCard() {
  const r = useResolves();
  const { due, ready } = useReviewCards("dsa");
  const n = r.due.length + due.length;
  const loaded = r.ready && ready;
  return (
    <section aria-labelledby="hub-revise-h" className={CARD}>
      <h2 id="hub-revise-h" className={H}>
        Revise
      </h2>
      <span className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg">
        {!loaded ? " " : n ? `${n} thing${n === 1 ? "" : "s"} due today` : "Nothing due today"}
      </span>
      <span className="text-[13.5px] leading-snug text-fg-2">
        {loaded
          ? [r.due.length ? `${r.due.length} re-solve${r.due.length === 1 ? "" : "s"}` : null, due.length ? `${due.length} card${due.length === 1 ? "" : "s"}` : null, r.upcoming.length ? `${r.upcoming.length} coming back later` : null].filter(Boolean).join(" · ") ||
            "Problems you struggle with come back after 1, 3 and 7 days. Every lesson has a deck."
          : " "}
      </span>
      <Link href="/dsa/revise" className={`mt-auto inline-flex min-h-10 items-center self-start px-3.5 font-mono text-[13px] font-semibold ${n ? "bg-signal text-on-signal" : "border border-line-strong text-fg hover:border-signal"}`}>
        {n ? "Revise now →" : "Open the decks →"}
      </Link>
    </section>
  );
}

function CertCard({ spec }: { spec: WorldSpec }) {
  const { done, hydrated } = useGame();
  const p = useDsaProgress();
  const e = useMemo(() => foundationsEligibility(spec, { solved: p.solved, concepts: p.concepts, checkpoints: p.checkpoints, labs: p.labs, milestones: signalsFromGame(done).milestones }), [spec, done, p.solved, p.concepts, p.checkpoints, p.labs]);
  const ready = hydrated && p.ready;
  return (
    <section aria-labelledby="hub-cert-h" className={CARD}>
      <h2 id="hub-cert-h" className={H}>
        Certificate
      </h2>
      <span className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg">{DSA_CERT_NAME}</span>
      <div className="flex flex-col gap-1.5">
        <div aria-hidden className="h-1.5 bg-surface-2">
          <div className="h-1.5 bg-signal" style={{ width: `${ready ? e.pct : 0}%` }} />
        </div>
        <span className="font-mono text-[12px] text-fg-3">{ready ? `${e.pct}% · ${e.done} of ${e.total} Academy requirements` : " "}</span>
      </div>
      <Link href="/dsa/certificate" className="mt-auto inline-flex min-h-10 items-center self-start border border-line-strong px-3.5 font-mono text-[13px] font-semibold text-fg hover:border-signal">
        What it takes →
      </Link>
    </section>
  );
}

export default function HubToday({ academy }: { academy: WorldSpec | null }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <DailyCard />
      <ReviseCard />
      {academy ? <CertCard spec={academy} /> : null}
    </div>
  );
}
