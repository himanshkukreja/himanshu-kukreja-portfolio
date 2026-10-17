"use client";

/**
 * A slim line under the site header while offline ("Offline · saved copy") and for a moment after
 * the connection comes back ("Back online · 3 progress updates synced"). In the page flow, so it
 * scrolls away with the page instead of covering the reader. (Under, not above: in the installed
 * app the header is the window's title bar and sits under the iPhone status bar.)
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pathOf } from "@/lib/offline/store";
import { useOffline } from "./OfflineProvider";

export default function OfflineStrip() {
  const pathname = usePathname() || "/";
  const { offline, source, saved, supported } = useOffline();
  const [back, setBack] = useState<string | null>(null);

  useEffect(() => {
    let t: number | null = null;
    const show = (text: string) => {
      setBack(text);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => setBack(null), 5000);
    };
    const onBack = () => show("Back online");
    const onSynced = (e: Event) => {
      const n = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      show(`Back online · ${n} offline progress ${n === 1 ? "update" : "updates"} synced`);
    };
    window.addEventListener("hk:reconnected", onBack);
    window.addEventListener("hk:synced", onSynced);
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener("hk:reconnected", onBack);
      window.removeEventListener("hk:synced", onSynced);
    };
  }, []);

  if (!offline && !back) return null;
  if (pathname.startsWith("/admin")) return null;
  const isSaved = supported && saved.has(pathOf(pathname));
  const text = !offline
    ? back
    : source === "saved" || isSaved
      ? "Offline · saved copy"
      : source === "recent"
        ? "Offline · recently opened copy (not saved)"
        : source === "fallback"
          ? "Offline · this page isn't saved on this device"
          : "Offline · saved lessons still open";

  return (
    <div role="status" aria-live="polite" data-focus-hide className="border-b border-line bg-surface-2">
      <div className="mx-auto flex max-w-[1320px] items-center gap-2.5 px-4 py-1.5 font-mono text-[12px] text-fg-2 sm:px-6">
        <span aria-hidden className={`h-2 w-2 shrink-0 ${offline ? "bg-signal" : "bg-ok"}`} />
        <span className="min-w-0 flex-1 truncate">{text}</span>
        {offline && !pathname.startsWith("/learn/offline") && (
          <Link href="/learn/offline" className="shrink-0 py-1 text-signal-text underline decoration-line-strong underline-offset-4">
            offline library →
          </Link>
        )}
      </div>
    </div>
  );
}
