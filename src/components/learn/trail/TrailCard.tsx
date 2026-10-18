"use client";

/** One reading-trail entry: publisher, title, type and minutes, the 3-line summary, the concept it illustrates, a link out and a "read" toggle. */
import { ArrowUpRight, Check, WifiOff } from "lucide-react";
import { track } from "@/lib/track";
import { TRAIL_TYPE_LABEL, type TrailEntry } from "@/lib/learn/trail/types";

type Props = {
  entry: TrailEntry;
  /** "<week>/<slug>" of the lesson the card belongs to */
  lesson: string;
  read: boolean;
  onToggleRead: () => void;
  offline: boolean;
  /** where the card is shown, for analytics */
  surface: "lesson" | "index";
};

const LINES: { key: keyof TrailEntry["summary"]; label: string }[] = [
  { key: "what", label: "What" },
  { key: "idea", label: "Key idea" },
  { key: "connects", label: "Why here" },
];

export default function TrailCard({ entry, lesson, read, onToggleRead, offline, surface }: Props) {
  const byline = [entry.authors.length > 3 ? `${entry.authors.slice(0, 2).join(", ")} et al.` : entry.authors.join(", "), entry.year ? String(entry.year) : ""].filter(Boolean).join(" · ");
  const open = () => track("trail_open", { lesson, url: entry.url, id: entry.id, company: entry.company, surface, offline });
  return (
    <article
      className={`flex h-full flex-col gap-3 border bg-surface p-[18px] text-fg ${read ? "border-line" : "border-line-strong"}`}
      data-hk-trail-entry={entry.id}
    >
      <header className="flex flex-col gap-2">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-label">
          <span className="text-signal-text">{entry.company}</span>
          <span className="text-fg-3">
            {TRAIL_TYPE_LABEL[entry.type]} · ~{entry.minutes} min
          </span>
        </span>
        <h3 className="m-0 font-display text-[21px] font-bold leading-[1.12] tracking-[-0.015em] text-fg">{entry.title}</h3>
        {byline && <span className="text-xs text-fg-3">{byline}</span>}
      </header>

      <dl className="m-0 flex flex-col gap-2 text-sm leading-normal text-fg-2">
        {LINES.map((l) => (
          <div key={l.key} className="grid gap-x-3 sm:grid-cols-[76px_1fr]">
            <dt className="pt-[3px] font-mono text-[10.5px] uppercase tracking-label text-fg-3">{l.label}</dt>
            <dd className="m-0">{entry.summary[l.key]}</dd>
          </div>
        ))}
      </dl>

      <span className="self-start border border-line px-2 py-1 font-mono text-[11px] text-fg-2">
        taught here: <span className="text-fg">{entry.concept}</span>
      </span>

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={open}
            onAuxClick={(e) => e.button === 1 && open()}
            className="font-mono text-[13px] leading-snug text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg"
            aria-label={`Read ${entry.title} on ${entry.publisher} (opens in a new tab${offline ? ", needs internet" : ""})`}
          >
            Read on {entry.publisher}
            <ArrowUpRight className="ml-1 inline-block h-3.5 w-3.5 align-[-2px]" aria-hidden />
          </a>
          {offline ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-3">
              <WifiOff className="h-3 w-3" aria-hidden /> needs internet
            </span>
          ) : (
            <span className="font-mono text-[11px] text-fg-4">opens online · new tab</span>
          )}
        </span>
        <button
          type="button"
          onClick={onToggleRead}
          aria-pressed={read}
          className={`inline-flex min-h-11 items-center gap-1.5 border px-3 font-mono text-[12px] ${
            read ? "border-line bg-surface-2 text-ok" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"
          }`}
        >
          {read ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden /> Read
            </>
          ) : (
            "Mark read"
          )}
        </button>
      </footer>
      {entry.note && <p className="sr-only">{entry.note}</p>}
    </article>
  );
}
