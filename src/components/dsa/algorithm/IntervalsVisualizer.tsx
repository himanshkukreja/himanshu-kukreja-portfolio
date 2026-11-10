"use client";

/**
 * An algorithm lesson's visualizer for greedy choices (`::visualizer[id]`, dsa-mastery visualizer.yml with view: intervals): a list of
 * talks, each a start and an end hour, and a greedy rule that chooses talks one at a time. Pick a list (or change any hour), choose
 * a rule (earliest finish, earliest start or shortest first), then step through the run forward and back on the StepPlayer. The
 * intervals view shows each talk as a bar on an hour axis: the talks the rule takes are filled, the talks it skips are crossed out,
 * and for earliest finish a line marks the end of the last talk taken. At the end the player says how many talks the rule took and
 * how many the best plan has, found by trying every set of talks, so a rule that is not safe shows it. Auto-play stops at the predict
 * questions.
 */
import { useMemo, useState } from "react";
import type { IntervalsPreset, IntervalsVisualizerSpec } from "@/lib/dsa/viz/registry";
import { intervalsScript, RULE_LABEL, talkName, type IntervalRule, type Talk } from "@/lib/dsa/viz/intervals";
import type { Script } from "@/lib/dsa/viz/types";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const RULE_SHORT: Record<IntervalRule, string> = { "earliest-finish": "earliest finish", "earliest-start": "earliest start", "shortest-first": "shortest first" };

export default function IntervalsVisualizer({ spec }: { spec: IntervalsVisualizerSpec }) {
  const presets = spec.presets;
  const first = presets[0];
  const [preset, setPreset] = useState(first?.id || "custom");
  const [talks, setTalks] = useState<Talk[]>(first?.talks.map((t) => [...t] as Talk) ?? []);
  const [rule, setRule] = useState<IntervalRule>(spec.algorithms[0] || "earliest-finish");
  const [predict, setPredict] = useState(true);
  const [auto, setAuto] = useState(false);
  const [script, setScript] = useState<Script | null>(null);
  const [hMin, hMax] = spec.limits.hours;

  const load = (p: IntervalsPreset) => {
    setPreset(p.id);
    setTalks(p.talks.map((t) => [...t] as Talk));
    setScript(null);
  };
  /** change one end of one talk: whole hours inside the limits, with the start before the end */
  const setHour = (k: number, which: 0 | 1, raw: string) => {
    const v = Math.round(Number(raw));
    if (!Number.isFinite(v)) return;
    setTalks((ts) =>
      ts.map((t, i) => {
        if (i !== k) return t;
        const next: Talk = [t[0], t[1]];
        next[which] = Math.max(hMin, Math.min(hMax, v));
        // a talk must run for at least an hour: ignore a change that would end it before it starts
        return next[0] < next[1] ? next : t;
      }),
    );
    setPreset("custom");
    setScript(null);
  };

  const run = (r: IntervalRule = rule) => {
    setRule(r);
    setScript(intervalsScript(talks, r, { predict, title: RULE_LABEL[r] }));
    track("dsa_visualizer_run", { visualizer: spec.id, algo: r, predict, preset });
  };

  const note = presets.find((p) => p.id === preset)?.note;
  const editing = !script;
  const sel = "min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg focus:border-signal focus:outline-none";
  const num = "min-h-11 w-16 border border-line-strong bg-surface px-2 text-right font-mono text-[15px] text-fg focus:border-signal focus:outline-none";
  const ruleNote = useMemo(
    () => ({ "earliest-finish": "Takes the talk that ends first among those that fit. Proven safe in this lesson.", "earliest-start": "Takes the talk that starts first. Not safe: a long early talk can block many.", "shortest-first": "Takes the shortest talk. Not safe: a short talk across a boundary can block two." }) as Record<IntervalRule, string>,
    [],
  );

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Talks
          <select
            value={preset}
            onChange={(e) => {
              const p = presets.find((x) => x.id === e.target.value);
              if (p) load(p);
            }}
            className={`${sel} max-w-full`}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            {preset === "custom" && <option value="custom">Your own hours</option>}
          </select>
        </label>
        <div role="radiogroup" aria-label="Greedy rule" className="flex flex-wrap border border-line-strong">
          {spec.algorithms.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={a === rule} onClick={() => (script ? run(a) : setRule(a))} className={`min-h-11 px-3 text-[14px] font-semibold ${a === rule ? "bg-signal text-on-signal" : "text-fg-2 hover:bg-surface-2"}`}>
              {RULE_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      {note && <p className="m-0 text-[14px] text-fg-2">{note}</p>}
      <p className="m-0 text-[14px] text-fg-3">{ruleNote[rule]}</p>

      {editing ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold text-fg-2">Start and end hour of each talk (whole hours, {hMin} to {hMax}). Change any of them.</legend>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 sm:grid-cols-2">
            {talks.map((t, k) => (
              <li key={k} className="flex items-center justify-between gap-2 text-[14px] text-fg-2">
                <span className="font-mono font-semibold text-fg">Talk {talkName(k)}</span>
                <span className="flex items-center gap-2">
                  <input type="number" inputMode="numeric" min={hMin} max={hMax} value={t[0]} onChange={(e) => setHour(k, 0, e.target.value)} aria-label={`Start hour of talk ${talkName(k)}`} className={num} />
                  <span aria-hidden>to</span>
                  <input type="number" inputMode="numeric" min={hMin} max={hMax} value={t[1]} onChange={(e) => setHour(k, 1, e.target.value)} aria-label={`End hour of talk ${talkName(k)}`} className={num} />
                </span>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <StepPlayer script={script} autoPlay={auto} label={`${RULE_LABEL[rule]} on your talks`} stepMs={1000} />
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button type="button" onClick={() => run()} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              Run {RULE_SHORT[rule]} step by step →
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setScript(null)} className="min-h-11 border-2 border-signal px-4 text-[14px] font-semibold text-signal-text">
                ✎ Change the talks
              </button>
              {spec.algorithms
                .filter((a) => a !== rule)
                .map((a) => (
                  <button key={a} type="button" onClick={() => run(a)} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
                    Now try {RULE_SHORT[a]} on the same talks
                  </button>
                ))}
            </>
          )}
        </div>
        <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-1 border-0 p-0 text-[14px] text-fg-2">
          <legend className="sr-only">Run options</legend>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={predict} onChange={(e) => setPredict(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
            Ask me to predict
          </label>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
            Play automatically (stops at questions)
          </label>
        </fieldset>
      </div>
    </div>
  );
}
