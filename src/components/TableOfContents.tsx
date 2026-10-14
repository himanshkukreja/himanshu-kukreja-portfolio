"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Stage, TocItem } from "@/lib/course/types";
import { useOptionalLessonProgress, isOptionalStage } from "@/components/LessonProgressTracker";
import { headerStackBottom, scrollToId, stageRailHeight } from "@/components/learn/lesson/layout";

export type TocGroup = {
  id: string;
  title: string;
  kind: "stage" | "questions";
  stage?: Stage;
  optional: boolean;
  items: TocItem[];
};

/** Group the renderer's TOC by stage, plus an "Interview questions" group. */
export function buildTocGroups(toc: TocItem[], stages: Stage[]): TocGroup[] {
  const groups: TocGroup[] = stages.map((s) => ({
    id: s.id,
    title: s.label === s.title || !s.title ? s.label : `${s.label.replace(/^Part\s+/i, "")} · ${s.title}`,
    kind: "stage",
    stage: s,
    optional: isOptionalStage(s),
    items: toc.filter((t) => t.stageId === s.id && t.kind !== "part" && t.kind !== "question" && t.level <= 3),
  }));
  const questions = toc.filter((t) => t.kind === "question");
  if (questions.length) groups.push({ id: "interview-questions", title: "Interview questions", kind: "questions", optional: false, items: questions });
  return groups;
}

/** Id of the last heading above the reading line; elements are looked up on every pass. */
export function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string>("");
  const key = ids.join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = headerStackBottom() + stageRailHeight() + 120;
      let cur = "";
      let best = -Infinity;
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el || !el.isConnected) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= line && top > best) {
          best = top;
          cur = id;
        }
      }
      setActive((a) => (a === cur ? a : cur));
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return active;
}

type Props = {
  toc: TocItem[];
  stages: Stage[];
};

/** Right rail "On this page": collapsible per stage, current stage open. */
export default function TableOfContents({ toc, stages }: Props) {
  const groups = useMemo(() => buildTocGroups(toc, stages), [toc, stages]);
  const ids = useMemo(() => toc.map((t) => t.id), [toc]);
  const active = useActiveHeading(ids);
  const progress = useOptionalLessonProgress();
  const current = progress?.current ?? "";
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const activeRef = useRef<HTMLAnchorElement>(null);
  const boxRef = useRef<HTMLElement>(null);

  // keep the active entry visible inside the rail
  useEffect(() => {
    const a = activeRef.current;
    const box = boxRef.current;
    if (!a || !box) return;
    const ar = a.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (ar.top < br.top + 40 || ar.bottom > br.bottom - 40) box.scrollTo({ top: box.scrollTop + ar.top - br.top - br.height / 3 });
  }, [active]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToId(id);
  };

  return (
    <aside
      ref={boxRef}
      aria-label="On this page"
      data-reader-ui
      className="sticky flex flex-col gap-0.5 overflow-y-auto pb-4"
      style={{
        top: "calc(var(--reader-top, 61px) + var(--reader-rail, 90px) + 24px)",
        maxHeight: "calc(100vh - var(--reader-top, 61px) - var(--reader-rail, 90px) - 120px)",
      }}
    >
      <span className="pb-2 font-mono text-xs uppercase tracking-label text-fg-3">On this page</span>
      {groups.map((g) => {
        const hasCur = g.kind === "stage" ? g.id === current : g.items.some((i) => i.id === active);
        const open = openState[g.id] ?? (hasCur || g.kind === "questions");
        const isDone = g.stage && (progress?.completed || progress?.done.has(g.id));
        let meta = "";
        let metaTone = "text-fg-4";
        if (g.kind === "questions") {
          meta = `${g.items.length} Qs`;
          metaTone = "text-fg-3";
        } else if (g.optional) meta = "opt";
        else if (isDone) {
          meta = "✓";
          metaTone = "text-fg";
        } else if (g.stage) {
          meta = `${g.stage.minutes}m`;
          if (g.id === current) metaTone = "text-signal-text";
        }
        const headTone = hasCur ? "text-fg" : g.kind === "questions" ? "text-signal-text" : "text-fg-2";
        const wrap = g.kind === "questions" ? "mt-2.5 border-t border-line pt-2.5" : g.optional ? "mt-1" : "";
        return (
          <div key={g.id} className={wrap}>
            <button
              type="button"
              onClick={(e) => (g.items.length ? setOpenState((o) => ({ ...o, [g.id]: !open })) : go(g.id)(e))}
              aria-expanded={g.items.length ? open : undefined}
              className={`flex min-h-11 w-full items-center gap-2 px-1.5 text-left text-sm font-semibold ${headTone} hover:text-fg`}
            >
              <span aria-hidden className="w-2.5 font-mono text-[11px] text-fg-4">
                {g.items.length ? (open ? "▾" : "▸") : "·"}
              </span>
              <span className="min-w-0 flex-1 leading-snug">{g.title}</span>
              <span className={`font-mono text-[11px] font-normal ${metaTone}`}>{meta}</span>
            </button>
            {open && g.items.length > 0 && (
              <div className="flex flex-col pb-1.5 pl-5">
                {g.items.map((it) => {
                  const on = it.id === active;
                  return (
                    <a
                      key={it.id}
                      ref={on ? activeRef : undefined}
                      href={`#${it.id}`}
                      onClick={go(it.id)}
                      aria-current={on ? "location" : undefined}
                      className={`flex min-h-9 items-center gap-2.5 px-2 py-0.5 text-[13px] leading-snug ${
                        on ? "bg-surface-2 font-semibold text-fg" : "text-fg-3 hover:text-fg"
                      } ${it.level >= 3 ? "pl-4" : ""}`}
                    >
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 ${on ? "bg-signal" : "border border-line-strong"}`} />
                      <span>{it.text}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
