"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { track } from "@/lib/track";
import { celebrate } from "@/lib/dsa/celebrate";
import { INPUT_LIMITS, isWin, parseValue, valueText, type BreakEx, type ExLang, type RunOutcome } from "@/lib/dsa/exercises";
import { CODE, Explain, FOCUS_RING, PRIMARY, SECONDARY, Status } from "./ExerciseCard";
import { runInWorker } from "./runBreakit";

type Outcome = { wrong: RunOutcome; right: RunOutcome; win: boolean };

const TYPE_HINT: Record<string, string> = {
  int: "a whole number",
  "int[]": "a list, like [2, -1, 3]",
  "int[][]": "a list of lists, like [[1, 2], [3]]",
  string: "text",
  "string[]": 'a list, like ["ab", "c"]',
  bool: "true or false",
};

const LIMIT_HINT: Record<string, string> = {
  int: `; within ±${INPUT_LIMITS.value.toLocaleString("en")}`,
  "int[]": `; up to ${INPUT_LIMITS.items} items, each within ±${INPUT_LIMITS.value.toLocaleString("en")}`,
  "int[][]": `; up to ${INPUT_LIMITS.items} rows of up to ${INPUT_LIMITS.items} items`,
  string: `; up to ${INPUT_LIMITS.text} characters`,
  "string[]": `; up to ${INPUT_LIMITS.items} items of up to ${INPUT_LIMITS.text} characters`,
  bool: "",
};

/** Break it: typed inputs, "Run both" (the JS pair in Web Workers, 1 s each), the two outputs side by side. No sign-in needed. */
export default function BreakExercise({ ex, lang, completed, onComplete }: { ex: BreakEx; lang: ExLang; completed: boolean; onComplete: () => void }) {
  const code = ex.code[lang] || "";
  const [texts, setTexts] = useState<string[]>(ex.example);
  const [errors, setErrors] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  const [misses, setMisses] = useState(0);
  const [assisted, setAssisted] = useState(false);
  const [won, setWon] = useState(completed);
  const [showHint, setShowHint] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const reveal = won || assisted;

  const run = async (inputs = texts, helped = assisted) => {
    if (busy) return;
    const parsed = ex.inputs.map((f, i) => parseValue(f.type, inputs[i] ?? ""));
    const errs = parsed.map((p) => (p.ok ? null : p.error));
    setErrors(errs);
    if (errs.some(Boolean)) return;
    const args = parsed.map((p) => (p as { value: unknown }).value);
    setBusy(true);
    setOut(null);
    const [wrong, right] = await Promise.all([runInWorker(ex.runWrong, args), runInWorker(ex.runRight, args)]);
    const win = isWin(wrong, right);
    setOut({ wrong, right, win });
    setBusy(false);
    if (win) {
      setWon(true);
      if (!helped) {
        onComplete();
        void celebrate("again", card.current);
      }
    } else if (right.status === "ok") setMisses((m) => m + 1);
    track("dsa_exercise", { kind: "breakit", id: ex.id, result: win ? (helped ? "assisted" : "right") : right.status === "ok" ? "miss" : "invalid" });
  };

  const showOne = () => {
    const b = ex.breaks[0];
    if (!b) return;
    const next = ex.inputs.map((f, i) => valueText(f.type, b[i]));
    setTexts(next);
    setAssisted(true);
    setErrors([]);
    void run(next, true);
  };

  const resetFields = () => {
    setTexts(ex.example);
    setErrors([]);
    setOut(null);
  };

  const status = busy
    ? { tone: "plain" as const, text: "Running both versions…" }
    : out?.win
      ? { tone: "ok" as const, text: assisted && !completed ? "That input breaks it. Now try finding one yourself." : "You broke it. The two versions disagree." }
      : out
        ? out.right.status !== "ok"
          ? { tone: "bad" as const, text: "The correct version can't read that input either. Try a different one." }
          : { tone: "bad" as const, text: "Both versions agree on that input. Try another." }
        : completed
          ? { tone: "ok" as const, text: "You broke this one before. Run it again to see it fail." }
          : { tone: "plain" as const, text: "Edit the input, then run both versions." };

  return (
    <div ref={card} className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-line bg-bg">
        <p className="m-0 border-b border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">The version to break</p>
        <div role="list" className="m-0 list-none p-0 py-1.5" aria-label="Code">
          {code.split("\n").map((l, i) => (
            <div role="listitem" key={i} className="flex">
              <span aria-hidden className="w-10 shrink-0 select-none border-r border-line px-2 text-right font-mono text-[12px] leading-[1.6] text-fg-4">{i + 1}</span>
              <span className={`${CODE} px-3`}>{l || " "}</span>
            </div>
          ))}
        </div>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {ex.inputs.map((f, i) => (
            <div key={f.name} className={ex.inputs.length === 1 ? "sm:col-span-2" : ""}>
              <label htmlFor={`ex-${ex.id}-${f.name}`} className="mb-1 flex flex-wrap items-baseline gap-2 text-[13px] font-semibold text-fg">
                <span className="font-mono">{f.name}</span>
                <span className="font-mono text-[11px] font-normal text-fg-3">{f.type}</span>
              </label>
              {f.type === "bool" ? (
                <select
                  id={`ex-${ex.id}-${f.name}`}
                  value={/true/i.test(texts[i]) ? "true" : "false"}
                  onChange={(e) => setTexts((t) => t.map((x, k) => (k === i ? e.target.value : x)))}
                  className={`min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 font-mono text-[14px] text-fg ${FOCUS_RING}`}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  id={`ex-${ex.id}-${f.name}`}
                  value={texts[i] ?? ""}
                  onChange={(e) => setTexts((t) => t.map((x, k) => (k === i ? e.target.value : x)))}
                  inputMode={f.type === "int" ? "numeric" : "text"}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={errors[i] ? true : undefined}
                  aria-describedby={`ex-${ex.id}-${f.name}-help`}
                  className={`min-h-11 w-full min-w-0 rounded-xl border bg-bg px-3 font-mono text-[14px] text-fg ${errors[i] ? "border-bad" : "border-line-strong"} ${FOCUS_RING}`}
                />
              )}
              <p id={`ex-${ex.id}-${f.name}-help`} className={`m-0 mt-1 text-[12px] ${errors[i] ? "text-bad-text" : "text-fg-3"}`}>
                {errors[i] ? `${errors[i]}` : `${TYPE_HINT[f.type]}${LIMIT_HINT[f.type]}`}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className={PRIMARY}>
            <Play className="h-4 w-4" aria-hidden /> {busy ? "Running…" : "Run both"}
          </button>
          <button type="button" onClick={resetFields} className={`${SECONDARY} !border-transparent !bg-transparent text-fg-3`}>
            Reset to the example
          </button>
          {ex.hint && !reveal ? (
            <button type="button" aria-expanded={showHint} onClick={() => setShowHint((s) => !s)} className={`${SECONDARY} !border-transparent !bg-transparent text-fg-3`}>
              {showHint ? "Hide the hint" : "Hint"}
            </button>
          ) : null}
          {misses >= 3 && !reveal && ex.breaks.length ? (
            <button type="button" onClick={showOne} className={`${SECONDARY} !border-transparent !bg-transparent text-fg-3`}>
              Show me one
            </button>
          ) : null}
        </div>
      </form>
      {showHint && ex.hint && !reveal ? (
        <p className="m-0 rounded-xl bg-surface-2 p-3 text-[14px] text-fg-2">
          <strong className="font-semibold text-fg">Hint.</strong> {ex.hint}
        </p>
      ) : null}
      <Status tone={status.tone}>{status.text}</Status>
      {out ? (
        <div className="grid grid-cols-2 gap-2" aria-label="Outputs">
          {(
            [
              ["Wrong version", out.wrong, out.win],
              ["Right version", out.right, false],
            ] as const
          ).map(([label, r, flag]) => (
            <div key={label} className={`min-w-0 rounded-xl border p-3 ${r.status !== "ok" ? "border-bad bg-bad/10" : flag ? "border-bad bg-bad/10" : "border-line bg-bg"}`}>
              <p className="m-0 mb-1 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">{label}</p>
              <p className={`m-0 break-words font-mono text-[13px] leading-[1.5] ${r.status === "ok" ? "text-fg" : "text-bad-text"}`}>
                {r.status === "timeout" ? "Timed out" : r.status === "error" ? "Crashed" : r.text}
              </p>
              {r.status !== "ok" ? <p className="m-0 mt-1 break-words text-[12px] text-fg-3">{r.text}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {reveal ? <Explain lines={ex.explain} tone="ok" /> : null}
    </div>
  );
}
