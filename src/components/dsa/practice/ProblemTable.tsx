"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, GripVertical, Play, X } from "lucide-react";
import type { FilterRow, Status } from "@/lib/dsa/problem-filters";
import type { ProblemData } from "@/lib/dsa/problem-rows";
import { highlightParts } from "@/lib/dsa/problem-groups";
import AddToList from "./AddToList";
import type { MyLists } from "./useMyLists";

/**
 * Practice's compact table: status, title, difficulty (the word, in its token colour), the lesson it belongs to (opens
 * the lesson's Practice step), time, a play mark when the solution has a video, and Save for later. On a phone the lesson
 * and the time fold under the title.
 */

const LEVEL: Record<string, { word: string; tone: string }> = {
  easy: { word: "EASY", tone: "text-ok-text" },
  medium: { word: "MEDIUM", tone: "text-amber" },
  hard: { word: "HARD", tone: "text-bad-text" },
};

function StatusRing({ status }: { status: Status }) {
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center border-2 rounded-full ${status === "solved" ? "border-fg bg-fg text-bg" : status === "tried" ? "border-dashed border-fg-2 text-fg-2" : "border-line-strong"}`}>
      {status === "solved" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      ) : status === "tried" ? (
        <span aria-hidden className="font-mono text-[11px] leading-none">
          ·
        </span>
      ) : null}
      <span className="sr-only">{status === "solved" ? "Solved" : status === "tried" ? "Tried, not solved yet" : "Not started"}</span>
    </span>
  );
}

export type TableProps = {
  rows: FilterRow[];
  d: ProblemData;
  statusOf: (id: string) => Status;
  isSaved: (id: string) => boolean;
  onSave: (id: string) => void;
  /** a row to tag ("Today") */
  tag?: { id: string; label: string } | null;
  /** the search words, underlined in the titles */
  hl?: string;
  /** the learner's lists: adds the "Add to list" control next to the bookmark */
  myLists?: MyLists;
  /** a list page: reorder (drag the grip, or the arrow keys on it, or the Move buttons on a phone) and remove */
  /** a Core list: each problem's place in the list, shown as a numbered first column */
  nums?: ReadonlyMap<string, number>;
  manage?: { onMove: (from: number, to: number) => void; onRemove: (id: string) => void };
};

const ROW_BTN = "grid h-9 w-9 place-items-center text-fg-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";
const TXT_BTN = "inline-flex min-h-11 items-center gap-1 px-1 text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text";

export function ProblemTable({ rows, d, statusOf, isSaved, onSave, tag, hl, myLists, manage, nums }: TableProps) {
  const inAny = useMemo(() => new Set(myLists ? myLists.lists.flatMap((l) => l.ids) : []), [myLists]);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [said, setSaid] = useState("");
  const move = (i: number, to: number, title: string) => {
    if (!manage || to < 0 || to >= rows.length) return;
    manage.onMove(i, to);
    setSaid(`${title} moved to position ${to + 1} of ${rows.length}.`);
  };
  return (
    <div className="overflow-x-auto border border-line bg-surface rounded-2xl">
      <table className="w-full border-collapse text-left">
        <thead className="sr-only md:not-sr-only">
          <tr className="border-b border-line bg-surface-2 font-mono text-[11px] uppercase tracking-label text-fg-3">
            {manage ? (
              <th scope="col" className="hidden w-10 py-2 pl-3 font-medium md:table-cell">
                <span className="sr-only">Reorder</span>
              </th>
            ) : null}
            {nums ? (
              <th scope="col" className="w-10 py-2 pl-4 pr-0 text-right font-medium">
                <span aria-hidden>#</span>
                <span className="sr-only">Position in the list</span>
              </th>
            ) : null}
            <th scope="col" className={`w-12 py-2 pr-2 font-medium ${nums ? "pl-3" : "pl-4"}`}>
              <span className="sr-only">Status</span>
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Problem
            </th>
            <th scope="col" className="hidden w-[84px] py-2 pr-3 font-medium md:table-cell">
              Level
            </th>
            <th scope="col" className="hidden w-[230px] py-2 pr-3 font-medium md:table-cell">
              Lesson
            </th>
            <th scope="col" className="hidden w-[64px] py-2 pr-3 text-right font-medium md:table-cell">
              Time
            </th>
            <th scope="col" className="hidden w-9 py-2 pr-1 font-medium md:table-cell">
              <span className="sr-only">Solution video</span>
            </th>
            {myLists ? (
              <th scope="col" className="w-11 py-2 font-medium">
                <span className="sr-only">Add to list</span>
              </th>
            ) : null}
            <th scope="col" className="w-11 py-2 pr-2 font-medium">
              <span className="sr-only">Save for later</span>
            </th>
            {manage ? (
              <th scope="col" className="hidden w-10 py-2 pr-2 font-medium md:table-cell">
                <span className="sr-only">Remove from list</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const lv = LEVEL[p.level];
            const lessonHref = d.lessons[p.concept];
            const lessonTitle = d.concepts[p.concept];
            const saved = isSaved(p.id);
            return (
              <tr
                key={p.id}
                onDragOver={manage && drag ? (e) => { e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }); } : undefined}
                onDrop={manage && drag ? (e) => { e.preventDefault(); move(drag.from, i, rows[drag.from].title); setDrag(null); } : undefined}
                className={`border-b border-line last:border-b-0 hover:bg-surface-2 ${drag && drag.over === i && drag.from !== i ? "shadow-[inset_0_2px_0_0_var(--c-signal)]" : ""} ${drag?.from === i ? "opacity-50" : ""}`}
              >
                {manage ? (
                  <td className="hidden py-1 pl-3 align-middle md:table-cell">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); const tr = e.currentTarget.closest("tr"); if (tr) e.dataTransfer.setDragImage(tr, 16, 16); setDrag({ from: i, over: i }); }}
                      onDragEnd={() => setDrag(null)}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                        e.preventDefault();
                        move(i, i + (e.key === "ArrowUp" ? -1 : 1), p.title);
                        const btn = e.currentTarget;
                        requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip="${p.id}"]`)?.focus() ?? btn.focus()));
                      }}
                      data-grip={p.id}
                      aria-label={`Reorder ${p.title}, position ${i + 1} of ${rows.length}. Press the up or down arrow to move it, or drag.`}
                      title="Drag, or press the up and down arrows"
                      className={`${ROW_BTN} cursor-grab active:cursor-grabbing`}
                    >
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                ) : null}
                {nums ? <td className="w-10 py-1 pl-4 pr-0 text-right align-middle font-mono text-[12px] tabular-nums text-fg-3">{nums.get(p.id)}</td> : null}
                <td className={`py-1 pr-2 align-middle ${nums ? "pl-3" : "pl-4"}`}>
                  <StatusRing status={statusOf(p.id)} />
                </td>
                <td className="min-w-0 py-1 pr-3 align-middle">
                  <Link href={`/dsa/problems/${p.id}`} className="block text-[15px] text-fg hover:underline hover:decoration-line-strong hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
                    {hl ? highlightParts(p.title, hl).map((x, i) => (x.hit ? <mark key={i} className="bg-transparent font-semibold text-signal-text underline decoration-signal decoration-2 underline-offset-2">{x.text}</mark> : x.text)) : p.title}
                    {tag && tag.id === p.id ? <span className="ml-2 border border-signal px-1.5 py-px font-mono text-[11px] uppercase tracking-label text-signal-text">{tag.label}</span> : null}
                  </Link>
                  {manage ? (
                    <span className="flex flex-wrap items-center gap-x-3 font-mono text-[12px] md:hidden">
                      <button type="button" disabled={i === 0} onClick={() => move(i, i - 1, p.title)} className={`${TXT_BTN} disabled:opacity-40`} aria-label={`Move ${p.title} up`}>
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden /> Up
                      </button>
                      <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, i + 1, p.title)} className={`${TXT_BTN} disabled:opacity-40`} aria-label={`Move ${p.title} down`}>
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden /> Down
                      </button>
                      <button type="button" onClick={() => manage.onRemove(p.id)} className={TXT_BTN} aria-label={`Remove ${p.title} from this list`}>
                        <X className="h-3.5 w-3.5" aria-hidden /> Remove
                      </button>
                    </span>
                  ) : null}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-fg-3 md:hidden">
                    <span className={`font-semibold tracking-label ${lv.tone}`}>{lv.word}</span>
                    {lessonTitle ? <span className="max-w-[180px] truncate">{lessonTitle}</span> : null}
                    {p.minutes ? <span>{p.minutes} min</span> : null}
                    {p.video ? (
                      <span className="inline-flex items-center gap-1 text-signal-text">
                        <Play className="h-3 w-3 fill-current" aria-hidden /> video
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className={`hidden py-1 pr-3 align-middle font-mono text-[11px] font-semibold tracking-label md:table-cell ${lv.tone}`}>{lv.word}</td>
                <td className="hidden py-1 pr-3 align-middle md:table-cell">
                  {lessonHref ? (
                    <Link href={`${lessonHref}#practice`} className="inline-flex max-w-[220px] items-center truncate border border-line-strong px-2 py-0.5 text-[12.5px] text-fg-2 hover:border-signal hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text">
                      <span className="truncate">{lessonTitle || "The lesson"}</span>
                    </Link>
                  ) : lessonTitle ? (
                    <span className="block max-w-[220px] truncate text-[12.5px] text-fg-3">{lessonTitle}</span>
                  ) : (
                    <span className="text-[12.5px] text-fg-3">More practice</span>
                  )}
                </td>
                <td className="hidden py-1 pr-3 text-right align-middle font-mono text-[12px] tabular-nums text-fg-3 md:table-cell">{p.minutes ? `${p.minutes} min` : ""}</td>
                <td className="hidden py-1 pr-1 align-middle md:table-cell">
                  {p.video ? (
                    <span className="inline-flex text-signal-text" title="Has a solution video">
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                      <span className="sr-only">Has a solution video</span>
                    </span>
                  ) : null}
                </td>
                {myLists ? (
                  <td className="py-1 align-middle">
                    <AddToList problemId={p.id} title={p.title} api={myLists} inAny={inAny.has(p.id)} from={manage ? "list" : "bank"} />
                  </td>
                ) : null}
                <td className="py-1 pr-2 align-middle">
                  <button
                    type="button"
                    onClick={() => onSave(p.id)}
                    aria-pressed={saved}
                    aria-label={saved ? `Remove ${p.title} from Saved` : `Save ${p.title} for later`}
                    className={`grid h-11 w-11 place-items-center md:h-9 [@media(pointer:coarse)]:md:h-11 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text ${saved ? "text-signal-text" : "text-fg-3 hover:text-fg"}`}
                  >
                    <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} aria-hidden />
                  </button>
                </td>
                {manage ? (
                  <td className="hidden py-1 pr-2 align-middle md:table-cell">
                    <button type="button" onClick={() => manage.onRemove(p.id)} aria-label={`Remove ${p.title} from this list`} title="Remove from this list" className={ROW_BTN}>
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
