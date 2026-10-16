"use client";

/** Shown only to the learner looking at their own public page. */
import Link from "next/link";
import ShareButton from "./ShareButton";
import { useShare } from "./useShare";

export default function OwnerBar({ handle }: { handle: string }) {
  const { state } = useShare();
  if (state?.settings?.handle !== handle) return null;
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-signal bg-surface px-4 py-3">
      <span className="text-[14px] text-fg-2">
        <span className="mr-2 font-mono text-[11px] uppercase tracking-label text-signal-text">your page</span>
        This is exactly what visitors see.
      </span>
      <span className="flex flex-wrap gap-2">
        <Link href="/learn/dashboard#share" className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12px] text-fg hover:bg-surface-2">
          Edit what&apos;s visible
        </Link>
        <ShareButton kind="profile" variant="solid" label="Share" className="min-h-10" />
      </span>
    </div>
  );
}
