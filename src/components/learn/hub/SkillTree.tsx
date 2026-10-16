"use client";

import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import type { CourseLesson } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import type { LessonProgress, WeekState } from "@/lib/learn/progress";
import { hoursLabel } from "@/lib/learn/progress";

type Node = { key: string; text: string; label: string; href: string; kind: "lesson" | "boss" | "trial"; state: "done" | "current" | "ahead" };

function nodesFor(s: WeekState, lessons: Record<string, LessonProgress>, currentKey: string | null): Node[] {
  const w = s.week;
  const lessonState = (l: CourseLesson): Node["state"] =>
    lessons[lessonKey(l.week, l.slug)]?.status === "completed" ? "done" : currentKey === lessonKey(l.week, l.slug) ? "current" : "ahead";
  const out: Node[] = w.lessons.map((l) => ({
    key: l.slug,
    text: l.code,
    label: `${l.kind === "week-preview" ? "Preview" : l.label} · ${l.minutes} min`,
    href: l.href,
    kind: "lesson",
    state: lessonState(l),
  }));
  if (w.boss)
    out.push({
      key: w.boss.slug,
      text: "B",
      label: `Boss · ${w.boss.title} · ${w.boss.minutes} min`,
      href: w.boss.href,
      kind: "boss",
      state: s.bossDone ? "done" : currentKey === lessonKey(w.boss.week, w.boss.slug) ? "current" : "ahead",
    });
  w.trial?.parts.forEach((p) =>
    out.push({
      key: `t${p.n}`,
      text: `T${p.n}`,
      label: `Trial part ${p.n} · ${p.title} · ${p.questions} Q`,
      href: p.href,
      kind: "trial",
      state: s.partsPassed.includes(p.n) ? "done" : "ahead",
    })
  );
  return out;
}

/** A node link; a plain span on the read-only (public profile) tree. */
function Box({ readOnly, href, children, ...rest }: { readOnly: boolean; href: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return readOnly ? (
    <span {...rest}>{children}</span>
  ) : (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}

function NodeBox({ n, size = "md", readOnly = false }: { n: Node; size?: "md" | "sm"; readOnly?: boolean }) {
  const sm = size === "sm";
  if (n.kind === "boss") {
    return (
      <Box
        readOnly={readOnly}
        href={n.href}
        title={n.label}
        aria-label={`${n.label}${n.state === "done" ? ", defeated" : ""}`}
        className={`grid shrink-0 place-items-center ${sm ? "h-6 w-6" : "h-11 w-11"}`}
      >
        <span
          className={`grid rotate-45 place-items-center font-mono font-semibold ${sm ? "h-4 w-4 text-[0px]" : "h-[30px] w-[30px] text-[11px]"} ${
            n.state === "done" ? "bg-fg text-bg" : n.state === "current" ? "animate-hk-pulse border-2 border-signal text-signal-text" : "border-[1.5px] border-fg text-fg"
          }`}
        >
          <span className="-rotate-45">{sm ? "" : "B"}</span>
        </span>
      </Box>
    );
  }
  const base = `grid shrink-0 place-items-center font-mono font-semibold ${sm ? "h-6 min-w-6 px-0.5 text-[9px]" : n.kind === "trial" ? "h-9 min-w-[38px] px-1 text-[11px]" : "h-10 w-10 text-[11px]"}`;
  const look =
    n.kind === "trial"
      ? n.state === "done"
        ? "bg-signal text-on-signal"
        : "border border-signal text-signal-text"
      : n.state === "done"
        ? "bg-fg text-bg"
        : n.state === "current"
          ? "animate-hk-pulse border-2 border-signal text-signal-text"
          : "border border-dashed border-line-strong text-fg-4";
  return (
    <Box readOnly={readOnly} href={n.href} title={n.label} aria-label={`${n.label}${n.state === "done" ? ", done" : n.state === "current" ? ", current" : ""}`} className={`${base} ${look} ${readOnly ? "" : "hover:outline hover:outline-1 hover:outline-fg-3"}`}>
      {n.text}
    </Box>
  );
}

/** Desktop: one row per world with every node. */
export function SkillTreeRows({
  states,
  lessons,
  currentKey,
  currentWeek,
  selected,
  onSelect,
  readOnly = false,
}: {
  states: WeekState[];
  lessons: Record<string, LessonProgress>;
  currentKey: string | null;
  currentWeek: string | null;
  selected: string;
  onSelect?: (week: string) => void;
  /** public profile: no links, no selection */
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-x-auto border border-line bg-raised">
      <ol className="min-w-[860px]">
        {states.map((s) => {
          const on = s.week.key === selected;
          const cur = s.week.key === currentWeek;
          const nodes = nodesFor(s, lessons, currentKey);
          return (
            <li
              key={s.week.key}
              className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${on ? "bg-surface-2 shadow-[inset_3px_0_0_var(--c-signal)]" : ""} ${s.status === "ahead" ? "text-fg-2" : ""}`}
            >
              {readOnly ? (
                <span className="flex min-h-14 w-[210px] shrink-0 flex-col items-start justify-center gap-1 pr-2 text-left">
                  <span className={`font-mono text-[11px] tracking-label ${cur ? "text-signal-text" : "text-fg-3"}`}>
                    WEEK {s.week.code} · {s.status.toUpperCase()}
                  </span>
                  <span className="text-base font-semibold leading-tight text-fg">{s.week.title}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect?.(s.week.key)}
                  aria-pressed={on}
                  className="flex min-h-14 w-[210px] shrink-0 flex-col items-start justify-center gap-1 pr-2 text-left"
                >
                  <span className={`font-mono text-[11px] tracking-label ${cur ? "text-signal-text" : "text-fg-3"}`}>
                    WEEK {s.week.code} · {cur && s.status === "ahead" ? "START HERE" : s.status.toUpperCase()}
                  </span>
                  <span className="text-base font-semibold leading-tight text-fg">{s.week.title}</span>
                </button>
              )}
              <div className="flex flex-1 items-center">
                {nodes.map((n, k) => (
                  <span key={n.key} className="contents">
                    {k > 0 && (
                      <span
                        aria-hidden
                        className={`h-0.5 min-w-1.5 flex-1 ${n.state === "done" ? "bg-fg" : "bg-[repeating-linear-gradient(90deg,var(--c-line-strong)_0_4px,transparent_4px_8px)]"}`}
                      />
                    )}
                    <NodeBox n={n} readOnly={readOnly} />
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Phones: a vertical path of worlds; the current one shows its node strip. Tapping opens the world sheet. */
export function SkillTreeList({
  states,
  lessons,
  currentKey,
  currentWeek,
  onOpen,
  readOnly = false,
}: {
  states: WeekState[];
  lessons: Record<string, LessonProgress>;
  currentKey: string | null;
  currentWeek: string | null;
  onOpen?: (week: string) => void;
  /** public profile: no sheet, no links */
  readOnly?: boolean;
}) {
  const Row = readOnly ? "div" : "button";
  return (
    <ol className="relative flex flex-col">
      {states.map((s, i) => {
        const cur = s.week.key === currentWeek;
        const nodes = nodesFor(s, lessons, currentKey);
        const last = i === states.length - 1;
        return (
          <li key={s.week.key} className="relative flex gap-3.5 py-1.5">
            {!last && (
              <span
                aria-hidden
                className={`absolute bottom-[-6px] left-[21px] top-[50px] w-0.5 ${s.cleared ? "bg-fg" : "bg-[repeating-linear-gradient(180deg,var(--c-line-strong)_0_4px,transparent_4px_8px)]"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative grid h-11 w-11 shrink-0 place-items-center font-mono text-xs font-semibold ${
                s.cleared ? "bg-fg text-bg" : cur ? "animate-hk-pulse border-2 border-signal bg-bg text-signal-text" : "border border-dashed border-line-strong bg-bg text-fg-4"
              }`}
            >
              {s.cleared ? "✓" : s.week.code}
            </span>
            <Row
              {...(readOnly ? {} : { type: "button" as const, onClick: () => onOpen?.(s.week.key) })}
              className={`flex min-h-11 min-w-0 flex-1 flex-col gap-2 text-left ${cur ? "border border-line-strong bg-surface px-3 py-2.5" : "justify-center"}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className={`font-mono text-[10px] tracking-label ${cur ? "text-signal-text" : "text-fg-3"}`}>
                  WORLD {s.week.code} · {s.cleared ? "CLEARED" : s.started ? `IN PROGRESS · ${s.nodesDone}/${s.nodesTotal}` : cur ? `START HERE · ${s.nodesTotal} NODES` : `${s.week.lessons.length + (s.week.boss ? 1 : 0)} LESSONS · ${hoursLabel(s.week.minutes).toUpperCase()}`}
                  {s.bossDone ? " · BOSS ◆" : ""}
                </span>
                <span className={`text-base ${cur ? "text-[17px] font-bold text-fg" : s.started ? "font-semibold text-fg" : "text-fg-2"}`}>{s.week.title}</span>
              </span>
              {cur && (
                <span aria-hidden className="flex flex-wrap items-center gap-1">
                  {nodes.map((n) => (
                    <span
                      key={n.key}
                      className={`grid h-6 min-w-6 place-items-center px-0.5 font-mono text-[9px] font-semibold ${
                        n.kind === "boss"
                          ? "mx-1 h-4 min-w-4 rotate-45 border-[1.5px] border-fg " + (n.state === "done" ? "bg-fg" : "")
                          : n.kind === "trial"
                            ? n.state === "done"
                              ? "bg-signal text-on-signal"
                              : "border border-signal text-signal-text"
                            : n.state === "done"
                              ? "bg-fg text-bg"
                              : n.state === "current"
                                ? "border-2 border-signal text-signal-text"
                                : "border border-dashed border-line-strong text-fg-4"
                      }`}
                    >
                      {n.kind === "boss" ? "" : n.text}
                    </span>
                  ))}
                </span>
              )}
              {cur && !readOnly && <span className="text-xs text-fg-3">Tap for lessons, boss and trial parts</span>}
            </Row>
          </li>
        );
      })}
    </ol>
  );
}
