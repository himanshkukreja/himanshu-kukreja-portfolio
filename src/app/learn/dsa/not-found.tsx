import Link from "next/link";
import { DsaMark } from "@/components/dsa/DsaMark";

// A missing DSA Mastery page (an unknown concept or problem id): DSA's own 404, in teal, with the way back to the map.
export default function DsaNotFound() {
  return (
    <main className="dsa-theme mx-auto flex min-h-[calc(100svh-var(--hk-header-h,61px)-120px)] max-w-[760px] flex-col justify-center gap-5 px-4 py-16 sm:px-6">
      <div className="flex items-center gap-3">
        <DsaMark className="h-9 w-9" />
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">404 · index out of range</span>
      </div>
      <h1 className="m-0 font-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.03em] text-fg sm:text-[56px]">
        Nothing at this index<span className="text-signal-text">.</span>
      </h1>
      <p className="m-0 max-w-[560px] text-[17px] leading-relaxed text-fg-2">That concept or problem isn&apos;t on the map. It may have moved, or it isn&apos;t built yet.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/dsa" className="inline-flex min-h-11 items-center bg-signal px-4 text-[15px] font-semibold text-on-signal">
          Back to the world map
        </Link>
        <Link href="/dsa/problems" className="inline-flex min-h-11 items-center border border-line-strong px-4 text-[15px] text-fg">
          All problems
        </Link>
      </div>
    </main>
  );
}
