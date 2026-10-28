"use client";

/**
 * Progress page entry to /learn/certificate. Uses only what the page already has (no request):
 * worlds cleared from this page's merged progress, and the `cert:*` keys once certificates are
 * claimed. The real check happens on the server when the learner claims.
 */
import Link from "next/link";
import { Award } from "lucide-react";
import type { WeekState } from "@/lib/learn/progress";
import { MOCKS_NEEDED } from "@/lib/certificates/core";

export default function CertificateEntry({ states, done, signedIn }: { states: WeekState[]; done: Record<string, number>; signedIn: boolean }) {
  const certified = !!done["cert:course"];
  const worldCerts = states.filter((s) => !!done[`cert:world:${s.week.key}`]).length;
  const cleared = states.filter((s) => s.cleared).length;
  // offer keys alone (the server also checks each scorecard); enough for a progress line
  const offers = Object.keys(done).filter((k) => k.startsWith("offer:")).length;
  const offer = offers >= MOCKS_NEEDED;
  const line = certified
    ? `Certified · ${worldCerts}/${states.length} world certificates`
    : `${cleared}/${states.length} worlds cleared · ${offer ? `Hire on ${MOCKS_NEEDED} mocks ✓` : `${offers}/${MOCKS_NEEDED} Hire mocks`}${worldCerts ? ` · ${worldCerts} world certificate${worldCerts === 1 ? "" : "s"}` : ""}`;
  return (
    <section id="certificate" aria-labelledby="cert-entry-h" className="scroll-mt-28">
      <Link href="/learn/certificate" className="group flex flex-col gap-4 border border-line-strong bg-surface p-5 hover:border-signal sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <span className="flex items-start gap-4">
          <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center ${certified ? "bg-signal text-on-signal" : "border border-line-strong text-signal-text group-hover:border-signal"}`}>
            <Award className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">certificate of completion</span>
            <span id="cert-entry-h" className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-fg sm:text-[28px]">
              {certified ? "You're certified." : cleared === states.length && offer ? "Ready to claim your certificate" : "Earn your certificate"}
            </span>
            <span className="font-mono text-[12px] text-fg-3">{line}</span>
            {!signedIn && <span className="text-[13px] text-fg-3">Sign in to earn certificates; import this browser&apos;s progress below first.</span>}
          </span>
        </span>
        <span className="inline-flex min-h-11 shrink-0 items-center self-start border border-line-strong px-4 font-mono text-[13px] text-fg group-hover:border-signal sm:self-center">{certified ? "view & share →" : "see what's left →"}</span>
      </Link>
    </section>
  );
}
