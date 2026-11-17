"use client";

/**
 * Mounts a lean lesson's interactive pieces (street, camp tent, set; src/lib/dsa/kinds.ts) into its server-rendered
 * figures: code tabs, polls, the exercises, in-article clips, explain-back, the checkpoint quiz, review cards and the ladder.
 * Same contract as StructureHydrator (each figure holds an empty `[data-dsa-stage]` that gets a portal; a MutationObserver
 * re-targets when the lesson HTML is re-injected), without the sandbox, visualiser and lab a lean lesson doesn't have.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DsaExplainBack from "@/components/dsa/rewards/DsaExplainBack";
import type { LeanPage } from "@/lib/dsa/kinds-load";
import { CheckpointGate, CodeTabs, Poll, ReviewCards } from "../concept/widgets";
import RunnableSnippets from "../playground/RunnableSnippets";
import LessonClip from "../clip/LessonClip";
import Exercise from "../lesson/exercises/Exercise";
import Ladder from "../lesson/Ladder";

type Host = { fig: HTMLElement; stage: HTMLElement; kind: string; key: string };

function scan(root: HTMLElement): Host[] {
  return Array.from(root.querySelectorAll<HTMLElement>("figure[data-dsa]"))
    .map((fig, i) => {
      const stage = fig.querySelector<HTMLElement>(":scope > [data-dsa-stage]");
      return stage ? { fig, stage, kind: fig.dataset.dsa || "", key: `${fig.dataset.dsa}-${fig.dataset.id || fig.dataset.tabsId || fig.dataset.pollId || ""}-${i}` } : null;
    })
    .filter((h): h is Host => !!h);
}

function Hydrated({ fig, children }: { fig: HTMLElement; children: React.ReactNode }) {
  useEffect(() => {
    fig.setAttribute("data-hydrated", "");
  }, [fig]);
  return <>{children}</>;
}

const NO_TRACES: never[] = [];

export default function LeanHydrator({ rootRef, page }: { rootRef: React.RefObject<HTMLElement | null>; page: LeanPage }) {
  const [hosts, setHosts] = useState<Host[]>([]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const rescan = () => {
      const next = scan(root);
      setHosts((prev) => (prev.length === next.length && prev.every((h, i) => h.stage === next[i].stage) ? prev : next));
    };
    rescan();
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => r.addedNodes.length || r.removedNodes.length)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(rescan);
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [rootRef]);

  const cards = useMemo(() => page.reviewCards, [page.reviewCards]);
  return (
    <>
      {hosts.map((h) => {
        const id = h.fig.dataset.id || "";
        let el: React.ReactNode = null;
        if (h.kind === "tabs") el = <CodeTabs fig={h.fig} />;
        else if (h.kind === "poll") el = <Poll fig={h.fig} conceptId={page.key} />;
        else if (h.kind === "exercise") el = <Exercise fig={h.fig} lessonId={page.key} lessonTitle={page.title} />;
        else if (h.kind === "clip" && page.clips?.[id])
          el = (
            <Hydrated fig={h.fig}>
              <LessonClip clip={page.clips[id]} fig={h.fig} />
            </Hydrated>
          );
        else if (h.kind === "ladder" && page.ladder.length)
          el = (
            <Hydrated fig={h.fig}>
              <Ladder items={page.ladder} />
            </Hydrated>
          );
        else if (h.kind === "explainback")
          el = (
            <div className="dsa-ui px-4 pb-4">
              <DsaExplainBack conceptId={page.key} term={page.title} />
            </div>
          );
        else if (h.kind === "checkpoint") el = <CheckpointGate fig={h.fig} checkpoint={page.checkpoint} />;
        else if (h.kind === "cards" && cards.length)
          el = (
            <Hydrated fig={h.fig}>
              <ReviewCards cards={cards} />
            </Hydrated>
          );
        return el ? createPortal(el, h.stage, h.key) : null;
      })}
      <RunnableSnippets rootRef={rootRef} traces={NO_TRACES} lesson={page} />
    </>
  );
}
