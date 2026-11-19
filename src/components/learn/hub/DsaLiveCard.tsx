import Link from "next/link";
import { DsaMark } from "@/components/dsa/DsaMark";
import { DSA_FULL } from "@/lib/dsa/flags";

/**
 * The hub's featured "Now live: DSA Mastery" card: one compact row right under the hero (the Continue card above stays
 * the first thing on screen), in DSA's own teal (.dsa-theme). Renders only while DSA is live (DSA_FULL, src/lib/dsa/flags.ts),
 * so it never points at the coming-soon page.
 */
export default function DsaLiveCard() {
  if (!DSA_FULL) return null;
  return (
    <Link
      href="/dsa"
      data-dsa-live-card
      className="dsa-theme group -mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border border-signal/60 bg-surface p-4 hover:border-signal sm:-mt-6 sm:p-5"
    >
      <DsaMark className="h-12 w-12 sm:h-14 sm:w-14" />
      <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">now live · new course</span>
        <span className="font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-fg group-hover:text-signal-text sm:text-[26px]">Now live: DSA Mastery</span>
        <span className="text-[14px] leading-snug text-fg-2">A metro map of data structures and algorithms, an AI tutor, exercises in every lesson and problems in Python, Java, C++ and JavaScript. Free with sign-in.</span>
      </span>
      <span className="inline-flex min-h-10 items-center border border-signal bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal group-hover:opacity-90">Start DSA Mastery →</span>
    </Link>
  );
}
