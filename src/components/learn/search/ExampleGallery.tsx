"use client";

/**
 * What smart search can do, as examples grouped by category (src/lib/search/smart/examples.ts). Each chip
 * runs its search; the AI ones (Ask) are marked, the rest are instant. Shown on the empty search page and,
 * folded, under the results.
 */
import { Route, Sparkles, Zap } from "lucide-react";
import KindIcon from "./KindIcon";
import { EXAMPLE_CATEGORIES, examplesIn, type ExampleIcon, type SearchExample } from "@/lib/search/smart/examples";

export function ExampleIconView({ icon, className = "h-4 w-4" }: { icon: ExampleIcon; className?: string }) {
  if (icon === "ask") return <Sparkles className={className} aria-hidden />;
  if (icon === "path") return <Route className={className} aria-hidden />;
  return <KindIcon kind={icon} className={className} />;
}

export function ModeBadge({ ai }: { ai: boolean }) {
  return ai ? (
    <span className="inline-flex items-center gap-1 bg-signal px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-label text-on-signal">
      <Sparkles className="h-3 w-3" aria-hidden />
      Ask · AI
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 border border-line-strong px-1.5 py-px font-mono text-[10px] uppercase tracking-label text-fg-3">
      <Zap className="h-3 w-3" aria-hidden />
      Instant
    </span>
  );
}

export default function ExampleGallery({ onPick, signedIn, compact = false }: { onPick: (x: SearchExample) => void; signedIn: boolean; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {!compact && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-fg-3">
          <span className="inline-flex items-center gap-2">
            <ModeBadge ai={false} /> results in a blink, for everyone
          </span>
          <span className="inline-flex items-center gap-2">
            <ModeBadge ai /> a direct answer and a learning path{signedIn ? "" : " (sign in free)"}
          </span>
        </p>
      )}
      <ul className={`m-0 grid list-none gap-3 p-0 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {EXAMPLE_CATEGORIES.map((c) => (
          <li key={c.id} className={`flex flex-col gap-3 border bg-surface p-4 ${c.ai ? "border-line-strong" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="m-0 flex items-center gap-2 text-[15px] font-semibold leading-snug text-fg">
                <span className="grid h-7 w-7 shrink-0 place-items-center border border-line-strong text-signal-text">
                  <ExampleIconView icon={c.icon} />
                </span>
                {c.label}
              </h3>
              <ModeBadge ai={c.ai} />
            </div>
            {!compact && <p className="m-0 text-[13px] leading-relaxed text-fg-3">{c.blurb}</p>}
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {examplesIn(c.id).map((x) => (
                <li key={x.text} className="max-w-full">
                  <button
                    type="button"
                    onClick={() => onPick(x)}
                    className="min-h-10 max-w-full border border-dashed border-line-strong px-2.5 py-1.5 text-left text-[14px] leading-snug text-fg-2 hover:border-fg-3 hover:text-fg"
                  >
                    {x.text}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
