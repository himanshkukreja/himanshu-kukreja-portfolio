"use client";

/** A lesson's scripted demo (`::viz[id]`, sandbox.yml `demos:`): the demo's operations as one step-by-step script. */
import { useMemo } from "react";
import { demoScript, type SandboxDemo } from "@/lib/dsa/viz/registry";
import StepPlayer from "../viz/StepPlayer";

export default function VizDemo({ demo }: { demo: SandboxDemo }) {
  const script = useMemo(() => demoScript(demo), [demo]);
  return (
    <div className="p-3 sm:p-5">
      <StepPlayer script={script} label={demo.title} />
    </div>
  );
}
