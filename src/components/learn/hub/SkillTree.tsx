"use client";

import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import type { CourseLesson } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import type { LessonProgress, WeekState } from "@/lib/learn/progress";
import { hoursLabel } from "@/lib/learn/progress";
import type { MockStatus } from "@/lib/learn/mock/store";
import { LEVEL_LABEL } from "@/lib/learn/mock/types";
import { VERDICT_LABEL } from "@/lib/learn/mock/score";

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

/** The mock interview glyph: a call window (square, with a live corner). Distinct from lessons, the boss diamond and trial boxes. */
export function MockGlyph({ state, size = "md", text }: { state: MockStatus["state"]; size?: "md" | "sm"; text: string }) {
  const sm = size === "sm";
  const look =
    state === "done"
      ? "bg-fg text-bg"
      : state === "live"
        ? "animate-hk-pulse border-2 border-signal bg-bg text-signal-text"
        : state === "ready"
          ? "border-2 border-fg bg-bg text-fg"
          : "border-[1.5px] border-dashed border-fg-3 bg-bg text-fg-3";
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center font-mono font-semibold ${sm ? "h-6 w-6 text-[9px]" : "h-11 w-11 text-[11px]"} ${look}`}>
      {sm ? "" : text}
      <span className={`absolute -right-[3px] -top-[3px] ${sm ? "h-2 w-2" : "h-2.5 w-2.5"} ${state === "ahead" ? "border border-fg-3 bg-bg" : "bg-signal"}`} />
    </span>
  );
}

export function mockStateText(m: MockStatus): string {
  if (m.state === "done") return m.result ? `DONE · ${VERDICT_LABEL[m.result.best.verdict].toUpperCase()} · ${LEVEL_LABEL[m.result.best.level].toUpperCase()}` : "DONE";
  if (m.state === "live") return "IN PROGRESS";
  if (m.state === "ready") return "UP NEXT";
  return "AHEAD";
}

function MockRow({ m }: { m: MockStatus }) {
  const k = m.mock;
  return (
    <li className="flex items-center gap-3 border-b border-line bg-[repeating-linear-gradient(135deg,transparent_0_10px,color-mix(in_srgb,var(--c-signal)_6%,transparent)_10px_11px)] px-4 py-3 last:border-b-0">
      <span className="flex min-h-14 w-[210px] shrink-0 flex-col items-start justify-center gap-1 pr-2">
        <span className="font-mono text-[11px] tracking-label text-signal-text">MOCK {String(k.n).padStart(2, "0")} · INTERVIEW LOOP</span>
        <span className="text-base font-semibold leading-tight text-fg">{k.company}</span>
      </span>
      <Link
        href={k.href}
        aria-label={`Mock interview ${k.n}: ${k.company}, ${k.title}. ${k.minutes} minutes, covers ${k.coversLabel}. ${mockStateText(m).toLowerCase()}`}
        className="group flex min-w-0 flex-1 items-center gap-4 border border-line-strong bg-surface px-3 py-2 hover:border-fg-3"
      >
        <MockGlyph state={m.state} text={k.code} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold text-fg">{k.title}</span>
          <span className="truncate font-mono text-[11px] text-fg-3">
            {k.minutes} min · {k.phases} phases · {k.curveballs} curveball{k.curveballs === 1 ? "" : "s"} · covers {k.coversLabel} · with {k.interviewer}
          </span>
        </span>
        <span className={`hidden shrink-0 font-mono text-[11px] tracking-label xl:inline ${m.state === "done" ? "text-fg" : m.state === "ahead" ? "text-fg-3" : "text-signal-text"}`}>{mockStateText(m)}</span>
        <span aria-hidden className="shrink-0 font-mono text-sm text-signal-text group-hover:translate-x-0.5">
          ❯
        </span>
      </Link>
    </li>
  );
}

function MockItem({ m, last }: { m: MockStatus; last: boolean }) {
  const k = m.mock;
  return (
    <li className="relative flex gap-3.5 py-1.5">
      {!last && <span aria-hidden className={`absolute bottom-[-6px] left-[21px] top-[50px] w-0.5 ${m.state === "done" ? "bg-fg" : "bg-[repeating-linear-gradient(180deg,var(--c-line-strong)_0_4px,transparent_4px_8px)]"}`} />}
      <MockGlyph state={m.state} text={k.code} />
      <Link href={k.href} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 border border-dashed border-signal/70 px-3 py-2 text-left">
        <span className="font-mono text-[10px] tracking-label text-signal-text">
          MOCK INTERVIEW {String(k.n).padStart(2, "0")} · {mockStateText(m)}
        </span>
        <span className="text-[15px] font-semibold text-fg">
          {k.company} · {k.title}
        </span>
        <span className="font-mono text-[11px] text-fg-3">
          {k.minutes} min · covers {k.coversLabel}
        </span>
      </Link>
    </li>
  );
}

const mocksAfter = (mocks: MockStatus[] | undefined, week: string) => (mocks || []).filter((m) => m.mock.after === week);

/** Desktop: one row per world with every node. */
export function SkillTreeRows({
  states,
  lessons,
  currentKey,
  currentWeek,
  selected,
  onSelect,
  readOnly = false,
  mocks,
}: {
  states: WeekState[];
  lessons: Record<string, LessonProgress>;
  currentKey: string | null;
  currentWeek: string | null;
  selected: string;
  onSelect?: (week: string) => void;
  /** public profile: no links, no selection */
  readOnly?: boolean;
  /** mock interviews, placed after the world they follow (hub only) */
  mocks?: MockStatus[];
}) {
  return (
    <div className="overflow-x-auto border border-line bg-raised">
      <ol className="min-w-[860px]">
        {states.map((s) => {
          const on = s.week.key === selected;
          const cur = s.week.key === currentWeek;
          const nodes = nodesFor(s, lessons, currentKey);
          return [
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
            </li>,
            ...mocksAfter(mocks, s.week.key).map((m) => <MockRow key={`mock-${m.mock.id}`} m={m} />),
          ];
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
  mocks,
}: {
  states: WeekState[];
  lessons: Record<string, LessonProgress>;
  currentKey: string | null;
  currentWeek: string | null;
  onOpen?: (week: string) => void;
  /** public profile: no sheet, no links */
  readOnly?: boolean;
  /** mock interviews, placed after the world they follow (hub only) */
  mocks?: MockStatus[];
}) {
  const Row = readOnly ? "div" : "button";
  return (
    <ol className="relative flex flex-col">
      {states.map((s, i) => {
        const cur = s.week.key === currentWeek;
        const nodes = nodesFor(s, lessons, currentKey);
        const after = mocksAfter(mocks, s.week.key);
        const last = i === states.length - 1 && after.length === 0;
        return [
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
          </li>,
          ...after.map((m, j) => <MockItem key={`mock-${m.mock.id}`} m={m} last={i === states.length - 1 && j === after.length - 1} />),
        ];
      })}
    </ol>
  );
}
