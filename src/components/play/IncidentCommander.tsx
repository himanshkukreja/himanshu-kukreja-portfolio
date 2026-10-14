"use client";

import { useState } from "react";
import { BTN_GHOST, BTN_PRIMARY, type GameProps } from "./shared";

type Page = { sev: string; title: string; signals: string[]; opts: string[]; answer: number; why: string };

const PAGES: Page[] = [
  {
    sev: "SEV-1",
    title: "Error rate 12% and p99 tripled, 6 minutes after deploy v2.4.1",
    signals: ["deploy v2.4.1 finished 03:06", "5xx only on /checkout", "DB and cache metrics normal"],
    opts: ["Roll back to v2.4.0", "Scale the checkout service ×3", "Restart the database"],
    answer: 0,
    why: "Rollback. The timing points at the deploy and everything else is healthy. Mitigate now, read the diff in the morning.",
  },
  {
    sev: "SEV-1",
    title: "Database CPU at 98%, cache hit rate fell from 95% to 20%",
    signals: ["cache cluster restarted 03:01", "same hot keys requested thousands of times per second", "no deploy today"],
    opts: ["Add two DB read replicas", "Coalesce requests per key and warm the hot keys", "Roll back the last deploy"],
    answer: 1,
    why: "Thundering herd on a cold cache. Let one request per key go to the DB and the rest wait for it; replicas take far too long to help.",
  },
  {
    sev: "SEV-2",
    title: "API pods crash-looping on one node: “no space left on device”",
    signals: ["/var/log at 100%", "debug logging enabled yesterday", "other nodes at 70% and rising"],
    opts: ["Add more pods", "Turn debug logging off and rotate logs", "Migrate to a bigger disk"],
    answer: 1,
    why: "The cause is the debug flag. Turn it off and rotate, then add log retention limits so it can’t happen again.",
  },
  {
    sev: "SEV-1",
    title: "Checkout threads exhausted; the payment provider is timing out",
    signals: ["provider status page: degraded", "each call waits 3.5 s", "retries tripled outbound traffic"],
    opts: ["Increase the thread pool", "Open the circuit breaker and queue orders for retry", "Retry harder with no backoff"],
    answer: 1,
    why: "Fail fast and protect your own threads. Queue orders and retry with backoff once the provider recovers.",
  },
];
const TOTAL = PAGES.length;
const RIGHT_COST = 4;
const WRONG_COST = 25;
const WIN_UNDER = 40;

export default function IncidentCommander({ onWin }: GameProps) {
  const [iq, setIq] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [mttr, setMttr] = useState(0);

  const over = iq >= TOTAL;
  const cur = PAGES[Math.min(iq, TOTAL - 1)];
  const answered = pick !== null;

  const choose = (k: number) => {
    if (answered) return;
    setPick(k);
    setMttr(mttr + (k === cur.answer ? RIGHT_COST : WRONG_COST));
  };

  const next = () => {
    const n = iq + 1;
    setIq(n);
    setPick(null);
    if (n >= TOTAL && mttr < WIN_UNDER) onWin(mttr, `${mttr} min MTTR`);
  };

  const reset = () => {
    setIq(0);
    setPick(null);
    setMttr(0);
  };

  return (
    <>
      <div className="flex justify-between font-mono text-[13px] text-fg-3">
        <span>
          page {Math.min(iq + 1, TOTAL)}/{TOTAL}
        </span>
        <span>
          total MTTR <span className="font-semibold text-signal-text">{mttr} min</span>
        </span>
      </div>

      {!over && (
        <>
          <div className="flex flex-col gap-2 border border-bad bg-surface p-4 sm:p-[18px]">
            <span className="font-mono text-xs tracking-label text-bad-text">PAGERDUTY · {cur.sev} · 03:12 AM</span>
            <span className="font-display text-[22px] font-bold leading-[1.15] text-fg sm:text-[26px]">{cur.title}</span>
            <ul className="flex flex-col gap-1">
              {cur.signals.map((sg) => (
                <li key={sg} className="font-mono text-[13px] text-fg-2">
                  › {sg}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            {cur.opts.map((t, k) => {
              const style =
                answered && k === cur.answer
                  ? "border-signal bg-signal text-on-signal"
                  : answered && k === pick
                    ? "border-bad bg-bg text-fg"
                    : "border-line-strong bg-bg text-fg hover:bg-surface-2";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => choose(k)}
                  disabled={answered}
                  aria-pressed={answered ? k === pick : undefined}
                  className={`min-h-[52px] border px-4 py-2 text-left font-sans text-[15px] disabled:cursor-default ${style}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {answered && (
            <>
              <div className="border border-line bg-bg p-3.5 text-[15px] leading-[1.55] text-fg" aria-live="polite">
                {(pick === cur.answer ? "Good call. " : "That cost 25 minutes. ") + cur.why}
              </div>
              <button type="button" onClick={next} className={`${BTN_PRIMARY} min-h-12 self-start`}>
                {iq >= TOTAL - 1 ? "end of shift" : "acknowledge next page"}
              </button>
            </>
          )}
        </>
      )}

      {over && (
        <>
          <span className="font-display text-[clamp(32px,6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">
            {mttr} minutes of downtime.
          </span>
          <span className="text-base text-fg-2">
            {mttr < WIN_UNDER
              ? "Calm pager hands. You mitigated first every time."
              : "Mitigate, then diagnose. The first action should make the bleeding stop."}
          </span>
          <button type="button" onClick={reset} className={`${BTN_GHOST} min-h-12 self-start`}>
            take the pager again
          </button>
        </>
      )}
    </>
  );
}
