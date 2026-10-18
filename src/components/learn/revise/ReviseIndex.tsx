"use client";

import Link from "next/link";
import { SaveGroupButton } from "@/components/offline/SaveOfflineButton";
import { useRevisedState } from "./RevisionDeck";
import { weekRevised } from "./store";

export type ReviseWeekSummary = {
  key: string;
  id: string;
  code: string;
  title: string;
  cards: number;
  missing: number;
  lessons: { slug: string; short: string; title: string; cards: number }[];
};

/** /learn/revise: every world's deck, its lesson decks and cheat sheet, with what this browser revised. */
export default function ReviseIndex({ weeks }: { weeks: ReviseWeekSummary[] }) {
  const s = useRevisedState();
  return (
    <ol className="flex flex-col gap-3">
      {weeks.map((w) => {
        const has = w.lessons.length > 0;
        const all = weekRevised(
          s,
          w.key,
          w.lessons.map((l) => l.slug)
        );
        return (
          <li key={w.key} className={`flex flex-col gap-4 border bg-surface p-4 sm:p-5 ${all ? "border-line-strong" : has ? "border-line-strong" : "border-dashed border-line"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                  World {w.code}
                  {all ? " · revised ✓" : ""}
                </span>
                <h2 className="font-display text-[24px] font-bold leading-[1.05] tracking-[-0.02em] text-fg sm:text-[28px]">{w.title}</h2>
                <span className="font-mono text-xs text-fg-3">
                  {has ? `${w.lessons.length} lesson${w.lessons.length === 1 ? "" : "s"} · ${w.cards} cards · ~${w.lessons.length * 5} min` : "cards on the way"}
                  {has && w.missing > 0 ? ` · ${w.missing} more coming` : ""}
                </span>
              </div>
              {has && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Link href={`/learn/revise/${w.id}`} className="flex min-h-[48px] items-center justify-center bg-signal px-5 text-[15px] font-semibold text-on-signal">
                    Revise this world
                  </Link>
                  <Link href={`/learn/cheatsheet/${w.id}`} className="flex min-h-[48px] items-center justify-center border border-line-strong px-5 text-[15px] font-semibold text-fg hover:border-fg-3">
                    Cheat sheet
                  </Link>
                </div>
              )}
            </div>
            {has && (
              <div className="flex flex-wrap gap-1.5">
                {w.lessons.map((l) => {
                  const done = !!s.lessons[`${w.key}/${l.slug}`];
                  return (
                    <Link
                      key={l.slug}
                      href={`/learn/revise/${w.id}/${l.slug}`}
                      title={`${l.title} · ${l.cards} cards`}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 border px-3 font-mono text-xs ${done ? "border-fg-3 text-fg" : "border-line text-fg-2 hover:border-fg-3 hover:text-fg"}`}
                    >
                      {done && <span aria-hidden>✓</span>}
                      {l.short}
                      <span className="sr-only">
                        {" "}
                        · {l.title}
                        {done ? " (revised)" : ""}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            {has && <SaveGroupButton group={w.key} label="Save this world offline" className="self-start" />}
          </li>
        );
      })}
    </ol>
  );
}
