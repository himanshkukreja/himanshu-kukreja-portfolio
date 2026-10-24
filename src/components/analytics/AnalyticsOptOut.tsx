"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { OPTOUT_EVENT, analyticsTools, isOptedOut, privacySignal, setAnalyticsOptOut } from "@/lib/analytics/client";

const subscribe = (cb: () => void) => {
  window.addEventListener(OPTOUT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(OPTOUT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** "out" | "signal" (DNT/GPC on: third parties off, first-party anonymous) | "in"; null on the server. */
function useOptState(): "out" | "signal" | "in" | null {
  return useSyncExternalStore(
    subscribe,
    () => (isOptedOut() ? "out" : privacySignal() ? "signal" : "in"),
    () => null
  );
}

/**
 * Visitor analytics opt-out. `compact` = one-line footer variant with a link to /privacy; the full
 * variant is the switch on the privacy page. Turning it off stops PostHog (opt_out_capturing), GA
 * (consent denied + ga-disable) and the first-party tracker (localStorage hk.notrack=1).
 */
export default function AnalyticsOptOut({ compact = false }: { compact?: boolean }) {
  const state = useOptState();
  const on = state === "in" || state === "signal";
  const tools = analyticsTools();
  const what = tools.posthog ? "usage stats + session replay" : tools.ga ? "usage stats (first-party + GA4)" : "first-party usage stats";
  const status =
    state == null
      ? "…"
      : state === "signal"
        ? "limited · Do Not Track / GPC: no PostHog or Google, first-party stats without ids"
        : on
          ? `on · ${what}`
          : "off for this browser";

  if (compact)
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href="/now" className="min-h-10 content-center hover:text-fg">
          now
        </Link>
        <Link href="/privacy" className="min-h-10 content-center hover:text-fg">
          privacy &amp; analytics
        </Link>
        {state != null && (
          <button
            type="button"
            onClick={() => setAnalyticsOptOut(on)}
            className="min-h-10 border border-line px-2 text-fg-3 hover:border-signal hover:text-signal-text"
          >
            {on ? "opt out" : "opted out · undo"}
          </button>
        )}
      </span>
    );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={state == null}
      onClick={() => setAnalyticsOptOut(on)}
      className="flex min-h-14 w-full items-center justify-between gap-4 border border-line bg-surface px-4 py-3 text-left hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-fg">Analytics on this browser</span>
        <span className="block font-mono text-[11px] text-fg-3">{status}</span>
      </span>
      <span aria-hidden className={`relative h-6 w-11 shrink-0 border ${on ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}>
        <span className={`absolute top-[3px] h-4 w-4 transition-[left] ${on ? "left-[22px] bg-on-signal" : "left-[3px] bg-fg-3"}`} />
      </span>
    </button>
  );
}
