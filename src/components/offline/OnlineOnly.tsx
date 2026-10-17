"use client";

/**
 * Renders its children only with a connection; offline it says what needs one instead (and the
 * children never mount, so they don't fire requests that can only fail).
 */
import { WifiOff } from "lucide-react";
import { useConnectivity } from "@/lib/offline/connectivity";

export default function OnlineOnly({ what, note, children, className = "" }: { what: string; note?: string; children: React.ReactNode; className?: string }) {
  const { offline } = useConnectivity();
  if (!offline) return <>{children}</>;
  return (
    <div role="note" className={`my-8 flex items-start gap-3 border border-dashed border-line-strong p-5 text-[15px] leading-relaxed text-fg-2 ${className}`}>
      <WifiOff className="mt-1 h-4 w-4 shrink-0 text-fg-3" aria-hidden />
      <span>
        <b className="text-fg">{what} needs a connection.</b> {note ?? "You're reading offline. It comes back on its own when you're online again."}
      </span>
    </div>
  );
}
