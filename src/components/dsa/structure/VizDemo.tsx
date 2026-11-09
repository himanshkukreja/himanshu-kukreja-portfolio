"use client";

/**
 * A lesson's scripted demo (`::viz[id]`): a structure's operations (sandbox.yml `demos:`) or an algorithm's run on a
 * grid (visualizer.yml `demos:`), as one step-by-step script on the StepPlayer.
 */
import { useMemo } from "react";
import { demoScript, gridDemoScript, isGridDemo, type GridDemo, type SandboxDemo } from "@/lib/dsa/viz/registry";
import StepPlayer from "../viz/StepPlayer";

export default function VizDemo({ demo, structure }: { demo: SandboxDemo | GridDemo; structure?: "linked-list" | "stack" | "queue" | "tree" | "heap" | "graph" }) {
  const script = useMemo(() => (isGridDemo(demo) ? gridDemoScript(demo) : demoScript(demo, structure)), [demo, structure]);
  return (
    <div className="p-3 sm:p-5">
      <StepPlayer script={script} label={demo.title} stepMs={isGridDemo(demo) ? 900 : 1300} />
    </div>
  );
}
