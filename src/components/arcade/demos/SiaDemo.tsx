"use client";

import { useRef, useState } from "react";
import { DEMO_LABEL, type DemoProps, useTicker } from "../useTicker";

const PROMPTS = [
  "Hire a senior backend engineer in Bengaluru, Python + Postgres, 6–9 yrs",
  "Find 5 product designers who have shipped B2B SaaS",
  "Screen this week’s applicants for the data engineer role",
];

const STEPS: [string, string][] = [
  ["Sourcing agent", "1,240 profiles"],
  ["Matching agent", "64 strong fits"],
  ["Profile verification", "52 verified"],
  ["Prescreening", "21 passed"],
  ["AI interviewer", "9 interviewed"],
  ["Shortlist", "5 ready for you"],
];

const CALLS = [
  "sia.search_candidates(role, location, skills)",
  "sia.match_resumes(job_id, top_k=64)",
  "sia.verify_profiles(candidate_ids)",
  'sia.schedule_prescreen(channel="whatsapp")',
  'sia.run_ai_interview(rubric="backend-senior")',
  "sia.shortlist(n=5) → ats.push()",
];

export default function SiaDemo({ clear }: DemoProps) {
  const [prompt, setPrompt] = useState(-1);
  const [step, setStep] = useState(-1);
  const stepRef = useRef(-1);
  const { start, stop } = useTicker();

  const busy = step >= 0 && step < 6;

  const run = (i: number) => {
    setPrompt(i);
    stepRef.current = 0;
    setStep(0);
    start(() => {
      const n = stepRef.current + 1;
      if (n >= 6) {
        stop();
        stepRef.current = 6;
        setStep(6);
        clear("SIA shortlist delivered");
      } else {
        stepRef.current = n;
        setStep(n);
      }
    }, 700);
  };

  const log = step < 0 ? ["waiting for a request…"] : CALLS.slice(0, Math.min(6, step + 1)).slice(-3);

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
        <span className={DEMO_LABEL}>SIA CHAT · pick a request</span>
        <div className="flex flex-col gap-1.5">
          {PROMPTS.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => run(i)}
              disabled={busy}
              aria-pressed={prompt === i}
              className={`min-h-11 border px-3 py-2 text-left text-sm leading-[1.4] disabled:cursor-not-allowed disabled:opacity-45 ${
                prompt === i ? "border-signal bg-surface-2 text-fg" : "border-line-strong bg-transparent text-fg-2 hover:bg-surface-2"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {prompt >= 0 && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="max-w-[90%] self-end bg-fg px-3 py-2.5 text-sm leading-[1.45] text-bg">{PROMPTS[prompt]}</div>
            <div className="max-w-[92%] self-start border border-line-strong px-3 py-2.5 text-sm leading-normal text-fg-2">
              {step >= 6
                ? "Done. 5 candidates are shortlisted with interview scores and evidence. Want me to book panels for Thursday?"
                : "On it. Sourcing, matching and screening now. I will come back with a shortlist."}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
        <span className={DEMO_LABEL}>AGENT PIPELINE · simulated run</span>
        <ol className="flex flex-col gap-1.5">
          {STEPS.map(([name, out], k) => {
            const dn = step > k || step === 6;
            const now = step === k;
            return (
              <li
                key={name}
                className={`flex items-center gap-2.5 border px-2.5 py-2 ${now ? "border-signal text-signal-text" : "border-line"} ${
                  dn ? "text-fg" : now ? "" : "text-fg-4"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-5 w-5 shrink-0 place-items-center text-xs ${
                    dn ? "bg-fg text-bg" : now ? "border-2 border-signal" : "border border-dashed border-line-strong"
                  }`}
                >
                  {dn ? "✓" : now ? "›" : ""}
                </span>
                <span className="grow text-sm">{name}</span>
                <span className="font-mono text-xs">{dn ? out : now ? "running…" : ""}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-1.5 min-h-[72px] border border-line bg-raised px-3 py-2.5 font-mono text-xs leading-[1.7] text-fg-3">
          {log.map((l) => (
            <div key={l}>
              <span className="text-signal-text">mcp ›</span> {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
