"use client";

import Link from "next/link";
import { useState } from "react";
import type { CourseLesson } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import type { LessonProgress, WeekState } from "@/lib/learn/progress";
import type { Cell } from "./derive";
import type { MockStatus } from "@/lib/learn/mock/store";
import { VERDICT_LABEL } from "@/lib/learn/mock/score";
import { SectionHead } from "./ui";

type Row = { state: WeekState; cells: Cell[] };

const STATUS_TEXT: Record<Cell["status"], string> = {
  none: "not started",
  progress: "in progress",
  done: "completed",
  passed: "passed",
  failed: "below the pass mark",
};

function CellBox({ c }: { c: Cell }) {
  const trial = c.kind === "trial";
  const look =
    c.status === "done"
      ? "bg-fg text-bg"
      : c.status === "passed"
        ? "bg-signal text-on-signal"
        : c.status === "progress"
          ? "border border-signal text-fg"
          : c.status === "failed"
            ? "border border-fg-3 text-fg-2"
            : "border border-dashed border-line-strong text-fg-4";
  const aria = `${c.label}, ${STATUS_TEXT[c.status]}${c.status === "progress" && !trial ? ` ${c.pct}%` : ""}${trial && c.score !== undefined ? `, best ${c.score}%` : ""}`;
  return (
    <Link
      href={c.href}
      title={aria}
      aria-label={aria}
      className={`relative grid h-11 shrink-0 place-items-center font-mono text-[11px] font-semibold leading-none hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-fg-3 ${trial ? "min-w-[52px] px-1" : "w-11"} ${look}`}
    >
      {c.kind === "boss" ? (
        <span aria-hidden className={`grid h-5 w-5 rotate-45 place-items-center ${c.status === "done" ? "bg-bg" : "border border-current"}`}>
          <span className={`-rotate-45 text-[10px] ${c.status === "done" ? "text-fg" : ""}`}>B</span>
        </span>
      ) : trial ? (
        <span className="flex flex-col items-center gap-1">
          <span>{c.code}</span>
          <span className="text-[9px] font-normal opacity-80">{c.score !== undefined ? `${c.score}%` : "—"}</span>
        </span>
      ) : (
        c.code
      )}
      {c.status === "progress" && !trial && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2">
          <span className="block h-[3px] bg-signal" style={{ width: `${Math.max(8, c.pct)}%` }} />
        </span>
      )}
    </Link>
  );
}

export default function CourseMapGrid({
  rows,
  side,
  lessons,
  currentWeek,
  mocks = [],
}: {
  rows: Row[];
  side: CourseLesson[];
  lessons: Record<string, LessonProgress>;
  currentWeek: string | null;
  /** mock interview loops between worlds */
  mocks?: MockStatus[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => open[k] ?? k === currentWeek;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }));

  const sideCells: Cell[] = side.map((l) => {
    const pr = lessons[lessonKey(l.week, l.slug)];
    const done = pr?.status === "completed";
    return {
      id: `${l.week}/${l.slug}`,
      code: l.code.replace("SQ-", "S"),
      label: `Side quest · ${l.title}`,
      href: l.href,
      kind: "lesson",
      status: done ? "done" : pr && pr.status !== "not_started" ? "progress" : "none",
      pct: done ? 100 : pr?.pct || 0,
      week: l.week,
      slug: l.slug,
    };
  });
  const sideDone = sideCells.filter((c) => c.status === "done").length;
  const mockCells: Cell[] = mocks.map((m) => ({
    id: `mock/${m.mock.id}`,
    code: m.mock.code,
    label: `Mock interview ${m.mock.n} · ${m.mock.company}${m.result ? ` · best ${VERDICT_LABEL[m.result.best.verdict]}` : ""}`,
    href: m.mock.href,
    kind: "lesson",
    status: m.state === "done" ? "done" : m.state === "live" ? "progress" : "none",
    pct: m.state === "done" ? 100 : m.state === "live" ? 50 : 0,
    week: m.mock.after,
    slug: m.mock.slug,
  }));
  const mocksDone = mockCells.filter((c) => c.status === "done").length;

  return (
    <section aria-labelledby="map-h" id="map" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHead
        id="map-h"
        n="01"
        kicker="course map"
        title="Every lesson, every trial"
        right={
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-fg-3" aria-label="Legend">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-3 border border-dashed border-line-strong" />
              not started
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="relative h-3 w-3 border border-signal">
                <span className="absolute inset-x-0 bottom-0 h-[2px] w-1/2 bg-signal" />
              </span>
              in progress
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-3 bg-fg" />
              completed
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-4 bg-signal" />
              trial passed
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-4 border border-fg-3" />
              trial below 80%
            </li>
          </ul>
        }
      />
      <ol className="border border-line bg-surface">
        {rows.map(({ state: s, cells }) => {
          const pct = s.nodesTotal ? Math.round((s.nodesDone / s.nodesTotal) * 100) : 0;
          const cur = s.week.key === currentWeek;
          const o = isOpen(s.week.key);
          return (
            <li key={s.week.key} id={`map-${s.week.key}`} className={`scroll-mt-28 border-b border-line last:border-b-0 lg:flex lg:items-center lg:gap-4 lg:px-4 lg:py-3 ${cur ? "shadow-[inset_3px_0_0_var(--c-signal)]" : ""}`}>
              <button
                type="button"
                onClick={() => toggle(s.week.key)}
                aria-expanded={o}
                aria-controls={`cells-${s.week.key}`}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left lg:pointer-events-none lg:w-[260px] lg:shrink-0 lg:px-0"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={`font-mono text-[11px] uppercase tracking-label ${cur ? "text-signal-text" : "text-fg-3"}`}>
                    week {s.week.code} · {s.cleared ? "cleared" : s.started ? `${pct}%` : "not started"}
                  </span>
                  <span className="truncate text-[15px] font-semibold leading-tight text-fg">{s.week.title}</span>
                </span>
                <span className="font-mono text-[12px] text-fg-3">
                  {s.nodesDone}/{s.nodesTotal}
                </span>
                <span aria-hidden className={`font-mono text-fg-3 transition-transform lg:hidden ${o ? "rotate-90" : ""}`}>
                  ›
                </span>
              </button>
              <div id={`cells-${s.week.key}`} className={`${o ? "flex" : "hidden"} flex-wrap gap-1.5 px-4 pb-4 lg:flex lg:flex-1 lg:p-0`}>
                {cells.map((c) => (
                  <CellBox key={c.id} c={c} />
                ))}
              </div>
            </li>
          );
        })}
        {mockCells.length > 0 && (
          <li id="map-mocks" className="scroll-mt-28 border-b border-line lg:flex lg:items-center lg:gap-4 lg:px-4 lg:py-3">
            <button
              type="button"
              onClick={() => toggle("mocks")}
              aria-expanded={isOpen("mocks")}
              aria-controls="cells-mocks"
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left lg:pointer-events-none lg:w-[260px] lg:shrink-0 lg:px-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">between worlds · mock interviews</span>
                <span className="truncate text-[15px] font-semibold leading-tight text-fg">Timed interview loops</span>
              </span>
              <span className="font-mono text-[12px] text-fg-3">
                {mocksDone}/{mockCells.length}
              </span>
              <span aria-hidden className={`font-mono text-fg-3 transition-transform lg:hidden ${isOpen("mocks") ? "rotate-90" : ""}`}>
                ›
              </span>
            </button>
            <div id="cells-mocks" className={`${isOpen("mocks") ? "flex" : "hidden"} flex-wrap gap-1.5 px-4 pb-4 lg:flex lg:flex-1 lg:p-0`}>
              {mockCells.map((c) => (
                <CellBox key={c.id} c={c} />
              ))}
            </div>
          </li>
        )}
        {sideCells.length > 0 && (
          <li id="map-side" className="scroll-mt-28 lg:flex lg:items-center lg:gap-4 lg:px-4 lg:py-3">
            <button
              type="button"
              onClick={() => toggle("side")}
              aria-expanded={isOpen("side")}
              aria-controls="cells-side"
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left lg:pointer-events-none lg:w-[260px] lg:shrink-0 lg:px-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">bonus · side quests</span>
                <span className="truncate text-[15px] font-semibold leading-tight text-fg">Real systems, end to end</span>
              </span>
              <span className="font-mono text-[12px] text-fg-3">
                {sideDone}/{sideCells.length}
              </span>
              <span aria-hidden className={`font-mono text-fg-3 transition-transform lg:hidden ${isOpen("side") ? "rotate-90" : ""}`}>
                ›
              </span>
            </button>
            <div id="cells-side" className={`${isOpen("side") ? "flex" : "hidden"} flex-wrap gap-1.5 px-4 pb-4 lg:flex lg:flex-1 lg:p-0`}>
              {sideCells.map((c) => (
                <CellBox key={c.id} c={c} />
              ))}
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}
