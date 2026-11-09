"use client";

/**
 * Mounts a structure lesson's interactive pieces into its server-rendered figures (src/lib/course/detect/dsa.ts):
 * `::viz` demos and the `::sandbox` on the step engine, the `::lab`, and the widgets shared with concept pages (code
 * tabs, polls, explain-back, the checkpoint gate, review cards). Same contract as DsaHydrator: each figure holds an
 * empty `[data-dsa-stage]` that gets a portal; a MutationObserver re-targets when the lesson HTML is re-injected.
 * The sandbox and the lab are their own chunks (next/dynamic, ssr:false).
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ExplainBack from "@/components/learn/ai/ExplainBack";
import type { StructurePage } from "@/lib/dsa/structures";
import { CheckpointGate, CodeTabs, Poll, ReviewCards } from "../concept/widgets";
import { loadStructureLab, loadStructureSandbox, loadVizDemo } from "./lazy";

const Sandbox = dynamic(loadStructureSandbox, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the sandbox…</p> });
const StructureLab = dynamic(loadStructureLab, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the lab…</p> });
const VizDemo = dynamic(loadVizDemo, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the player…</p> });

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

export default function StructureHydrator({ rootRef, page }: { rootRef: React.RefObject<HTMLElement | null>; page: StructurePage }) {
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
        else if (h.kind === "poll") el = <Poll fig={h.fig} conceptId={page.id} />;
        else if (h.kind === "viz" && page.demos[id]) el = <Hydrated fig={h.fig}><VizDemo demo={page.demos[id]} /></Hydrated>;
        else if (h.kind === "sandbox" && page.sandbox && page.sandbox.id === id) el = <Hydrated fig={h.fig}><Sandbox spec={page.sandbox} /></Hydrated>;
        else if (h.kind === "lab" && page.lab && page.lab.spec.id === id) el = <Hydrated fig={h.fig}><StructureLab lab={page.lab} lessonId={page.id} /></Hydrated>;
        else if (h.kind === "explainback")
          el = (
            <div className="dsa-ui px-4 pb-4">
              <ExplainBack conceptId={page.id} term={page.title} course="dsa" />
            </div>
          );
        else if (h.kind === "checkpoint") el = <CheckpointGate fig={h.fig} checkpoint={page.checkpoint} />;
        else if (h.kind === "cards" && cards.length) el = <Hydrated fig={h.fig}><ReviewCards cards={cards} /></Hydrated>;
        return el ? createPortal(el, h.stage, h.key) : null;
      })}
    </>
  );
}
