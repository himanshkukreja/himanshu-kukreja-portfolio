"use client";

/**
 * A lesson's scripted demo (`::viz[id]`): a structure's operations (sandbox.yml `demos:`), an algorithm's run on a
 * grid or a weighted map (visualizer.yml `demos:`), as one step-by-step script on the StepPlayer.
 */
import { useMemo } from "react";
import { demoScript, gridDemoScript, intervalsDemoScript, isGridDemo, isIntervalsDemo, isPathDemo, pathDemoScript, type GridDemo, type IntervalsDemo, type PathDemo, type SandboxDemo } from "@/lib/dsa/viz/registry";
import StepPlayer from "../viz/StepPlayer";

export default function VizDemo({ demo, structure }: { demo: SandboxDemo | GridDemo | PathDemo | IntervalsDemo; structure?: "linked-list" | "stack" | "queue" | "tree" | "heap" | "graph" | "trie" }) {
  const script = useMemo(() => (isPathDemo(demo) ? pathDemoScript(demo) : isIntervalsDemo(demo) ? intervalsDemoScript(demo) : isGridDemo(demo) ? gridDemoScript(demo) : demoScript(demo, structure)), [demo, structure]);
  return (
    <div className="p-3 sm:p-5">
      <StepPlayer script={script} label={demo.title} stepMs={isPathDemo(demo) || isGridDemo(demo) || isIntervalsDemo(demo) ? 1000 : 1300} />
    </div>
  );
}
