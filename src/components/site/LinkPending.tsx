"use client";

/**
 * Pending marks for nav links (must render inside a next/link <Link>): while that link's
 * navigation is in flight the tab grows a running stage bar and the dock dot blinks, so the
 * clicked item itself answers "yes, I heard you".
 */
import { useLinkStatus } from "next/link";
import { StageBar } from "@/components/ui/loader";

/** Thin running bar along the bottom edge of a tab. The <Link> needs `relative`. */
export function TabPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-2 bottom-0 flex">
      <StageBar segments={6} className="h-[2px] w-full" />
    </span>
  );
}

/** The dock's square indicator: lit when current, blinking while the link is loading. */
export function DockDot({ on }: { on: boolean }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`h-1.5 w-1.5 ${pending ? "animate-hk-blink bg-signal" : on ? "bg-signal" : "bg-transparent"}`} />;
}
