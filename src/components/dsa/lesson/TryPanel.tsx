"use client";

/**
 * Try it, the part React adds on top of the lesson's own Try beats (a structure's sandbox and lab are beats of the
 * lesson HTML, shown here by the step styles):
 * - concept lessons have no lab today: "Step through it" is a second mount of each of the lesson's traces in predict
 *   mode, then the race, then an honest "Lab coming" slot (row 72 of the inventory);
 * - algorithm lessons add the visualiser on the learner's own input (a second mount of the same component as the
 *   lesson's `::visualizer` figure; it is a component, so two mounts are safe).
 * Progress is the same as ever: finishing a trace earns `dsa:tr:<id>` exactly like the inline copy does.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { loadRaceChart, loadTracePlayer } from "@/lib/offline/lazy";
import { loadBitsVisualizer, loadDpVisualizer, loadGraphVisualizer, loadGridVisualizer, loadIntervalsVisualizer, loadStringsVisualizer } from "../structure/lazy";
import type { Race, Trace } from "@/lib/dsa/types";
import type { LessonKind } from "@/lib/dsa/lesson-steps";
import type { VisualizerSpec } from "@/lib/dsa/viz/registry";

const TracePlayer = dynamic(loadTracePlayer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the player…</p> });
const RaceChart = dynamic(loadRaceChart, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the race…</p> });
const GridVisualizer = dynamic(loadGridVisualizer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the visualiser…</p> });
const GraphVisualizer = dynamic(loadGraphVisualizer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the visualiser…</p> });
const IntervalsVisualizer = dynamic(loadIntervalsVisualizer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the visualiser…</p> });
const DpVisualizer = dynamic(loadDpVisualizer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the visualiser…</p> });
const StringsVisualizer = dynamic(loadStringsVisualizer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the visualiser…</p> });
const BitsVisualizer = dynamic(loadBitsVisualizer, { ssr: false, loading: () => <p className="p-4 text-[14px] text-fg-3">Loading the visualiser…</p> });

function OwnInput({ spec }: { spec: VisualizerSpec }) {
  return spec.view === "graph" ? (
    <GraphVisualizer spec={spec} />
  ) : spec.view === "intervals" ? (
    <IntervalsVisualizer spec={spec} />
  ) : spec.view === "dp" ? (
    <DpVisualizer spec={spec} />
  ) : spec.view === "strings" ? (
    <StringsVisualizer spec={spec} />
  ) : spec.view === "bits" ? (
    <BitsVisualizer spec={spec} />
  ) : (
    <GridVisualizer spec={spec} />
  );
}

const card = "dsa-ui border border-line bg-surface";

export default function TryPanel({
  kind,
  lessonId,
  traces,
  races,
  visualizer,
  hasLabBeat,
}: {
  kind: LessonKind;
  lessonId: string;
  traces?: Record<string, Trace>;
  races?: Record<string, Race>;
  visualizer?: VisualizerSpec | null;
  /** the lesson HTML already carries a sandbox or lab beat for this step */
  hasLabBeat: boolean;
}) {
  const traceList = useMemo(() => Object.values(traces || {}), [traces]);
  const raceList = useMemo(() => Object.values(races || {}), [races]);

  if (kind === "concept") {
    return (
      <div className="flex flex-col gap-6">
        <p className="m-0 max-w-[680px] text-[15px] leading-relaxed text-fg-2">
          {traceList.length
            ? "Step through the idea on real numbers. Predict each step before it appears: a wrong guess tells you which mistake it stands for."
            : "No lab for this lesson yet. Practice is the next step."}
        </p>
        {traceList.map((t) => (
          <section key={t.id} aria-label={`Step through: ${t.title}`} className={card}>
            <p className="m-0 border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-label text-fg-3">Step through it · {t.title}</p>
            <TracePlayer trace={t} conceptId={lessonId} mode="predict" />
          </section>
        ))}
        {raceList.map((r) => (
          <section key={r.id} aria-label={`Race: ${r.title}`} className={card}>
            <p className="m-0 border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-label text-fg-3">Brute force against the better way</p>
            <RaceChart race={r} />
          </section>
        ))}
        <section aria-label="Lab" className="border border-dashed border-line-strong bg-surface-2 px-4 py-4">
          <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">Lab</p>
          <p className="m-0 mt-1 text-[15px] text-fg-2">Lab coming. A build-it lab for this pattern is on the way; until then the practice problems are the hands-on part.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 max-w-[680px] text-[15px] leading-relaxed text-fg-2">
        {kind === "algorithm" ? "Run it on your own input, then write it yourself in the lab. Everything runs in your browser." : "Push and pull the structure with the sandbox, then build it yourself in the lab. Everything runs in your browser."}
      </p>
      {kind === "algorithm" && visualizer ? (
        <section aria-label="Visualiser on your own input" className={card}>
          <p className="m-0 border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-label text-fg-3">On your own input</p>
          <OwnInput spec={visualizer} />
        </section>
      ) : null}
      {hasLabBeat ? null : (
        <section aria-label="Lab" className="border border-dashed border-line-strong bg-surface-2 px-4 py-4">
          <p className="m-0 text-[15px] text-fg-2">Lab coming for this lesson.</p>
        </section>
      )}
    </div>
  );
}
