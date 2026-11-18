"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Status } from "@/lib/dsa/problem-filters";
import { isOpen, solvedIn, type BankGroup, type GroupingId } from "@/lib/dsa/problem-groups";
import { ProblemTable, type TableProps } from "./ProblemTable";

/**
 * The bank grouped (topic by default). Each header is a button (aria-expanded) that shows the group's name, its problem
 * count, solved so far with a thin bar, and the easy/medium/hard split. A closed group renders nothing; an open one draws
 * its rows 40 at a time, so a thousand problems cost only what is on screen.
 */
const CHUNK = 40;

function Body({ id, rows, tableProps }: { id: string; rows: BankGroup["rows"]; tableProps: Omit<TableProps, "rows"> }) {
  const [shown, setShown] = useState(CHUNK);
  const left = rows.length - shown;
  const btn = "inline-flex min-h-11 items-center border border-line-strong bg-surface px-4 font-mono text-[13px] text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]";
  return (
    <div id={id} className="flex flex-col gap-2">
      <ProblemTable rows={left > 0 ? rows.slice(0, shown) : rows} {...tableProps} />
      {left > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => setShown(shown + CHUNK)}>
            Show {Math.min(CHUNK, left)} more
          </button>
          <button type="button" className={btn} onClick={() => setShown(rows.length)}>
            Show all {rows.length}
          </button>
          <span className="font-mono text-[12px] tabular-nums text-fg-3">
            {shown} of {rows.length}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function BankGroups({
  groups,
  mode,
  firstId,
  stored,
  onToggle,
  isSolved,
  tableProps,
}: {
  groups: BankGroup[];
  mode: GroupingId;
  firstId: string | null;
  stored: Record<string, boolean> | null;
  onToggle: (key: string, open: boolean) => void;
  isSolved: (id: string) => boolean;
  tableProps: Omit<TableProps, "rows"> & { statusOf: (id: string) => Status };
}) {
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const key = `${mode}:${g.id}`;
        const open = isOpen(stored, key, g.id, firstId);
        const solved = solvedIn(g, isSolved);
        const pct = g.rows.length ? Math.round((solved / g.rows.length) * 100) : 0;
        const bodyId = `bg-${mode}-${g.id}`;
        return (
          <section key={key} className="flex flex-col gap-2">
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => onToggle(key, !open)}
                className="flex min-h-14 w-full items-center justify-between gap-3 border border-line bg-surface px-4 py-2 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text rounded-[10px]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-5">
                  <span className="min-w-0 sm:w-[220px] sm:shrink-0">
                    <span className="block truncate font-display text-[17px] font-bold tracking-[-0.01em] text-fg">{g.title}</span>
                    <span className="block font-mono text-[12px] tabular-nums text-fg-3">
                      {g.rows.length} {g.rows.length === 1 ? "problem" : "problems"}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-[12px] tabular-nums text-fg-2">
                      {solved} of {g.rows.length} solved
                    </span>
                    <span aria-hidden className="block h-1 w-full max-w-[260px] overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-3 font-mono text-[11px] font-semibold tabular-nums tracking-label">
                    <span className="text-ok-text">{g.split.easy} easy</span>
                    <span className="text-amber">{g.split.medium} medium</span>
                    <span className="text-bad-text">{g.split.hard} hard</span>
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
              </button>
            </h3>
            {open ? <Body id={bodyId} rows={g.rows} tableProps={tableProps} /> : null}
          </section>
        );
      })}
    </div>
  );
}
