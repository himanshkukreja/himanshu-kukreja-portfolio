"use client";

/**
 * Mounts DSA Mastery's interactive pieces into the lesson's server-rendered figures (src/lib/course/detect/dsa.ts):
 * `<figure data-dsa="trace|handsolve|race|tabs|poll|reorder|explainback|checkpoint|cards">` each hold an empty
 * `[data-dsa-stage]` chrome element that gets a React portal (inside the page's tree, so sign-in, the game and the
 * AI status all work). The lesson HTML can be re-injected (highlights): a MutationObserver rescans and re-targets.
 *
 * Heavy pieces load on demand (next/dynamic, ssr:false): the trace player and the race chart are their own chunks.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ConceptPage } from "@/lib/dsa/types";
import ExplainBack from "@/components/learn/ai/ExplainBack";
import { CheckpointGate, CodeTabs, Poll, Reorder, ReviewCards } from "./widgets";

const TracePlayer = dynamic(() => import("../trace/TracePlayer"), { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the player…</p> });
const RaceChart = dynamic(() => import("../trace/RaceChart"), { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the race…</p> });

type Host = { fig: HTMLElement; stage: HTMLElement; kind: string; key: string };

function scan(root: HTMLElement): Host[] {
  return Array.from(root.querySelectorAll<HTMLElement>("figure[data-dsa]"))
    .map((fig, i) => {
      const stage = fig.querySelector<HTMLElement>(":scope > [data-dsa-stage]");
      return stage ? { fig, stage, kind: fig.dataset.dsa || "", key: `${fig.dataset.dsa}-${fig.dataset.id || fig.dataset.tabsId || fig.dataset.pollId || ""}-${i}` } : null;
    })
    .filter((h): h is Host => !!h);
}

export default function DsaHydrator({ rootRef, concept }: { rootRef: React.RefObject<HTMLElement | null>; concept: ConceptPage }) {
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

  return (
    <>
      {hosts.map((h) => {
        const el = widgetFor(h, concept);
        return el ? createPortal(el, h.stage, h.key) : null;
      })}
    </>
  );
}

/** Marks the figure hydrated (its static fallback hides) once its widget mounts. */
function Hydrated({ fig, children }: { fig: HTMLElement; children: React.ReactNode }) {
  useEffect(() => {
    fig.setAttribute("data-hydrated", "");
  }, [fig]);
  return <>{children}</>;
}

function widgetFor(h: Host, c: ConceptPage): React.ReactNode {
  const id = h.fig.dataset.id || "";
  switch (h.kind) {
    case "tabs":
      return <CodeTabs fig={h.fig} />;
    case "poll":
      return <Poll fig={h.fig} conceptId={c.id} />;
    case "trace":
    case "handsolve": {
      const t = c.traces[id];
      if (!t) return null;
      return (
        <Hydrated fig={h.fig}>
          <TracePlayer trace={t} conceptId={c.id} mode={h.kind === "handsolve" ? "hand" : h.fig.dataset.predict ? "predict" : "watch"} />
        </Hydrated>
      );
    }
    case "race": {
      const r = c.races[id];
      return r ? (
        <Hydrated fig={h.fig}>
          <RaceChart race={r} />
        </Hydrated>
      ) : null;
    }
    case "reorder": {
      const code = c.templates[id];
      return code ? (
        <Hydrated fig={h.fig}>
          <Reorder code={code} tabsId={id} />
        </Hydrated>
      ) : null;
    }
    case "explainback":
      // the fallback line stays: it explains the box, and ExplainBack renders nothing when AI is off
      return (
        <div className="dsa-ui px-4 pb-4">
          <ExplainBack conceptId={c.id} term={c.title} course="dsa" />
        </div>
      );
    case "checkpoint":
      return <CheckpointGate fig={h.fig} checkpoint={c.checkpoint} />;
    case "cards":
      return c.reviewCards.length ? (
        <Hydrated fig={h.fig}>
          <ReviewCards cards={c.reviewCards} />
        </Hydrated>
      ) : null;
    default:
      return null;
  }
}
