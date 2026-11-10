"use client";

/**
 * An algorithm lesson's visualizer for strings (`::visualizer[id]`, dsa-mastery visualizer.yml with view: strings): pick a small problem
 * (a naive pattern search, counting the letters of a word with 26 slots, or a palindrome check that ignores case and punctuation),
 * change its text, then step through it forwards and back on the StepPlayer. The search slides the pattern along the text and stops each
 * shift at the first mismatch; the count adds 1 to a letter's slot; the palindrome check moves a pointer in from each end. Auto-play
 * stops at the predict questions.
 */
import { useState } from "react";
import type { StringsPreset, StringsVisualizerSpec } from "@/lib/dsa/viz/registry";
import { methodOf, stringsScript, STRINGS_METHOD_LABEL, type StringsProblem } from "@/lib/dsa/viz/strings";
import type { Script } from "@/lib/dsa/viz/types";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

const METHOD_NOTE: Record<ReturnType<typeof methodOf>, string> = {
  "slide-compare": "Put the pattern at the start of the text and compare letter by letter. At the first mismatch, slide the pattern one place right and start again.",
  "count-letters": "A fixed array of 26 slots, one for each letter. Each letter of the word adds 1 to its own slot, found by letter minus a.",
  "two-ends": "A pointer at each end. Skip anything that is not a letter or a digit, compare the rest ignoring case, and move both pointers inwards.",
};
const KIND_LABEL: Record<StringsProblem["kind"], string> = { search: "Pattern search", count: "Counting letters", palindrome: "Palindrome check" };

const copy = (p: StringsProblem): StringsProblem => JSON.parse(JSON.stringify(p));

export default function StringsVisualizer({ spec }: { spec: StringsVisualizerSpec }) {
  const presets = spec.presets;
  const first = presets[0];
  const L = spec.limits;
  const [preset, setPreset] = useState(first?.id || "custom");
  const [problem, setProblem] = useState<StringsProblem>(first ? copy(first.problem) : { kind: "search", text: "abcabd", pattern: "abd" });
  const [predict, setPredict] = useState(true);
  const [auto, setAuto] = useState(false);
  const [script, setScript] = useState<Script | null>(null);

  const method = methodOf(problem);
  const load = (p: StringsPreset) => {
    setPreset(p.id);
    setProblem(copy(p.problem));
    setScript(null);
  };
  const edit = (next: StringsProblem) => {
    setProblem(next);
    setPreset("custom");
    setScript(null);
  };
  const valid = problem.kind === "search" ? problem.pattern.length >= L.pattern[0] && problem.text.length >= L.text[0] && problem.pattern.length <= problem.text.length : problem.kind === "count" ? problem.word.length >= L.word[0] : problem.text.replace(/[^A-Za-z0-9]/g, "").length >= 2;

  const run = () => {
    setScript(stringsScript(problem, { predict, title: STRINGS_METHOD_LABEL[method] }));
    track("dsa_visualizer_run", { visualizer: spec.id, algo: method, predict, preset });
  };

  const note = presets.find((p) => p.id === preset)?.note;
  const editing = !script;
  const sel = "min-h-11 border border-line-strong bg-surface px-2 text-[15px] font-normal text-fg focus:border-signal focus:outline-none";
  const txt = "min-h-11 w-52 max-w-full border border-line-strong bg-surface px-2 font-mono text-[15px] text-fg focus:border-signal focus:outline-none";

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Problem
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
            {preset === "custom" && <option value="custom">Your own text</option>}
          </select>
        </label>
      </div>
      {note && <p className="m-0 text-[14px] text-fg-2">{note}</p>}
      <p className="m-0 text-[14px] text-fg-3">{METHOD_NOTE[method]}</p>

      {editing ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold text-fg-2">{KIND_LABEL[problem.kind]}: change the text.</legend>
          {problem.kind === "search" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-fg-2">
              <label className="flex items-center gap-2">
                Text ({L.text[0]} to {L.text[1]} letters)
                <input type="text" value={problem.text} maxLength={L.text[1]} onChange={(e) => edit({ ...problem, text: e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, L.text[1]) })} aria-label="Text" className={txt} />
              </label>
              <label className="flex items-center gap-2">
                Pattern ({L.pattern[0]} to {L.pattern[1]} letters)
                <input type="text" value={problem.pattern} maxLength={L.pattern[1]} onChange={(e) => edit({ ...problem, pattern: e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, L.pattern[1]) })} aria-label="Pattern" className={txt} />
              </label>
            </div>
          )}
          {problem.kind === "count" && (
            <label className="flex flex-wrap items-center gap-2 text-[14px] text-fg-2">
              Word ({L.word[0]} to {L.word[1]} lowercase letters)
              <input type="text" value={problem.word} maxLength={L.word[1]} onChange={(e) => edit({ kind: "count", word: e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, L.word[1]) })} aria-label="Word" className={txt} />
            </label>
          )}
          {problem.kind === "palindrome" && (
            <label className="flex flex-wrap items-center gap-2 text-[14px] text-fg-2">
              Text (up to {L.text[1]} characters; letters, digits, spaces and punctuation)
              <input type="text" value={problem.text} maxLength={L.text[1]} onChange={(e) => edit({ kind: "palindrome", text: e.target.value.replace(/[^A-Za-z0-9 ,.!?'-]/g, "").slice(0, L.text[1]) })} aria-label="Text" className={txt} />
            </label>
          )}
        </fieldset>
      ) : (
        <StepPlayer script={script} autoPlay={auto} label={`${STRINGS_METHOD_LABEL[method]}: ${KIND_LABEL[problem.kind]}`} stepMs={1000} />
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <button type="button" disabled={!valid} onClick={run} className="min-h-11 bg-signal px-5 text-[15px] font-semibold text-on-signal disabled:opacity-40">
              Run {STRINGS_METHOD_LABEL[method].toLowerCase()} step by step →
            </button>
          ) : (
            <button type="button" onClick={() => setScript(null)} className="min-h-11 border-2 border-signal px-4 text-[14px] font-semibold text-signal-text">
              ✎ Change the text
            </button>
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
