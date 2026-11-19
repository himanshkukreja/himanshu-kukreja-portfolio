"use client";

/**
 * The slim "New · DSA Mastery is live" line under the SD Mastery header (in the page flow, like OfflineStrip, so it scrolls
 * away). One quiet line with a close button. Only while DSA is live (src/lib/site/dsaPromo.ts), never on /dsa or /admin, and
 * gone for good once dismissed or once the learner has opened DSA (this component also records that visit).
 */
import Link from "next/link";
import { useEffect } from "react";
import { X } from "lucide-react";
import { isDsaPath } from "@/lib/dsa/flags";
import { useDsaPromo } from "@/lib/site/dsaPromo";

export default function DsaPromoBar({ pathname }: { pathname: string }) {
  const { ready, dismissed, visited, dismiss, markVisited } = useDsaPromo();
  const onDsa = isDsaPath(pathname);
  useEffect(() => {
    if (ready && onDsa && !visited) markVisited();
  }, [ready, onDsa, visited, markVisited]);
  if (!ready || onDsa || dismissed || visited || pathname.startsWith("/admin")) return null;
  return (
    <div data-dsa-promo-bar data-focus-hide className="dsa-theme border-b border-line bg-surface-2">
      <div className="mx-auto flex max-w-[1320px] items-center gap-2.5 px-4 py-1 font-mono text-[12px] text-fg-2 sm:px-6">
        <span className="shrink-0 rounded-full border border-signal px-2 py-px text-[10px] font-semibold uppercase tracking-label text-signal-text">New</span>
        <p className="m-0 min-w-0 flex-1 truncate">
          DSA Mastery is live<span className="max-sm:hidden">: hundreds of lessons and problems, free with sign-in</span>.{" "}
          <Link href="/dsa" className="whitespace-nowrap text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            Explore →
          </Link>
        </p>
        <button type="button" onClick={dismiss} aria-label="Dismiss the DSA Mastery announcement" className="-mr-2 grid h-8 w-8 shrink-0 place-items-center text-fg-3 hover:text-fg">
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
