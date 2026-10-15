"use client";

import { useEffect, useRef, useState } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_PRIMARY, ChoiceStep, ClassifyStep, Feedback, OPTION, OPT_DIM, OPT_IDLE, OPT_RIGHT, OPT_WRONG, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

const INT_MAX = 2_147_483_647;

// The case file's automated response triggers.
const ACTIONS = [
  "Generate a migration planning ticket",
  "Page the on-call engineer",
  "Trigger emergency response procedures",
  "Implement immediate protective measures",
];
const ALERTS = [
  { pct: 50, answer: 0 },
  { pct: 70, answer: 1 },
  { pct: 90, answer: 2 },
  { pct: 95, answer: 3 },
];

function band(p: number): { name: string; cls: string } {
  if (p >= 80) return { name: "RED · emergency response", cls: "text-bad-text" };
  if (p >= 50) return { name: "ORANGE · active migration planning", cls: "text-signal-text" };
  if (p >= 25) return { name: "YELLOW · start planning", cls: "text-fg" };
  return { name: "GREEN", cls: "text-fg-2" };
}

function BurnDown({ ctx }: { ctx: StepCtx }) {
  const [value, setValue] = useState(0.18 * INT_MAX);
  const [stage, setStage] = useState(0); // index into ALERTS; ALERTS.length = overflow
  const [phase, setPhase] = useState<"idle" | "climb" | "alert" | "over">("idle");
  const [picks, setPicks] = useState<number[]>([]);
  const raf = useRef(0);
  const picksRef = useRef<number[]>([]);
  const target = stage < ALERTS.length ? (ALERTS[stage].pct / 100) * INT_MAX : INT_MAX;
  const pct = (value / INT_MAX) * 100;
  const b = band(pct);
  const answered = picks.length > stage;

  // Climb to the next threshold (instant with reduced motion).
  useEffect(() => {
    if (phase !== "climb") return;
    const from = value;
    const to = target;
    const done = () => {
      setValue(to);
      if (stage < ALERTS.length) {
        setPhase("alert");
      } else {
        setPhase("over");
        ctx.done(picksRef.current.filter((p, i) => p === ALERTS[i].answer).length);
      }
    };
    if (ctx.reduced) {
      // reduced motion: jump straight to the end state
      done();
      return;
    }
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setValue(from + (to - from) * e);
      if (k < 1) raf.current = window.requestAnimationFrame(tick);
      else done();
    };
    raf.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf.current);
    // `value` is only this climb's start point and ctx is rebuilt every render: neither should restart the climb.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, target, stage, ctx.reduced]);

  const choose = (k: number) => {
    if (phase !== "alert" || answered) return;
    const next = [...picks, k];
    picksRef.current = next;
    setPicks(next);
  };
  const resume = () => {
    setStage(stage + 1);
    setPhase("climb");
  };

  const alert = ALERTS[Math.min(stage, ALERTS.length - 1)];

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="50 million events a day are landing in event_log. Run the ingest and answer each automated alert as it fires.">
        Watch the ID climb. Respond to every alert.
      </StepPrompt>
      <div className="flex flex-col gap-3 border border-line-strong bg-bg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span>SELECT MAX(id) FROM event_log</span>
          <span className={b.cls}>{b.name}</span>
        </div>
        <div
          className={`font-mono text-[clamp(30px,9vw,52px)] font-semibold leading-none tracking-[-0.02em] tabular-nums ${phase === "over" ? "text-bad-text" : "text-fg"}`}
          aria-live="off"
        >
          {Math.round(value).toLocaleString("en-US")}
        </div>
        <div className="relative h-3 border border-line-strong bg-surface-2" role="meter" aria-label="ID space used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <span className={`absolute inset-y-0 left-0 ${pct >= 80 ? "bg-bad" : "bg-signal"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          {[25, 50, 80].map((m) => (
            <span key={m} aria-hidden className="absolute inset-y-0 w-px bg-fg-3" style={{ left: `${m}%` }} />
          ))}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-fg-3">
          <span>{pct.toFixed(1)}% of INT</span>
          <span>max 2,147,483,647</span>
        </div>
      </div>

      {phase === "idle" && (
        <button type="button" onClick={() => setPhase("climb")} className={`${BTN_PRIMARY} self-start`}>
          ▶ run ingest
        </button>
      )}

      {phase === "alert" && (
        <div className="flex flex-col gap-3 border-l-[3px] border-signal bg-surface-2 p-4" role="alert">
          <span className="font-mono text-[12px] font-semibold text-signal-text">PAGER · event_log.id at {alert.pct}% of INT</span>
          <span className="text-[16px] font-semibold text-fg">What’s the automated response at {alert.pct}%?</span>
          <div className="flex flex-col gap-2" role="group" aria-label="Responses">
            {ACTIONS.map((a, k) => {
              const cls = !answered ? OPT_IDLE : k === alert.answer ? OPT_RIGHT : k === picks[stage] ? OPT_WRONG : OPT_DIM;
              return (
                <button key={a} type="button" disabled={answered} onClick={() => choose(k)} className={`${OPTION} ${cls}`}>
                  {a}
                </button>
              );
            })}
          </div>
          {answered && (
            <>
              <span className="text-[14.5px] text-fg-2" aria-live="polite">
                {picks[stage] === alert.answer ? "Correct. " : `At ${alert.pct}% it's: ${ACTIONS[alert.answer].toLowerCase()}. `}
                {["Half the space is gone: plan the migration while it's boring.", "Now a human owns it.", "No more planning: run the playbook.", "Buy time: stop non-essential writes, move ID generation if you can."][stage]}
              </span>
              <button type="button" onClick={resume} className={`${BTN_PRIMARY} self-start`}>
                keep ingesting →
              </button>
            </>
          )}
        </div>
      )}

      <div aria-live="polite">
        {phase === "over" && (
          <Feedback ok={null} title="2,147,483,647. INSERT INTO event_log … has nowhere left to count.">
            Reads still answer, connections stay open and the dashboards say stable. Analytics, the recommendation engine and revenue tracking quietly stop. You answered{" "}
            {picks.filter((p, i) => p === ALERTS[i].answer).length} of {ALERTS.length} alerts right.
          </Feedback>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "decision",
  title: "ID burn-down",
  blurb:
    "Ride event_log's auto-increment ID all the way to 2,147,483,647, answering the pager at every threshold, then triage three tables and size a Snowflake ID.",
  minutes: 3,
  steps: [
    { id: "burn", label: "Answer the pager", max: 4, render: (ctx) => <BurnDown ctx={ctx} /> },
    {
      id: "silent",
      label: "Why nobody noticed",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="On MySQL, why did the overflow look like nothing at all?"
          options={[
            "Inserts fail quietly while reads, connections and metrics look healthy.",
            "MySQL wrapped the ID back to −2,147,483,648 and kept going.",
            "The database crashed and restarted itself.",
            "PagerDuty was misconfigured.",
          ]}
          answer={0}
          explain="MySQL silently fails the INSERTs (duplicate key errors) while reads keep working, so the application and monitoring see “stable”. PostgreSQL and SQL Server throw explicit errors instead; the case file says Oracle cycles back to the minimum value."
        />
      ),
    },
    {
      id: "triage",
      label: "Pick the fix",
      max: 3,
      render: (ctx) => (
        <ClassifyStep
          ctx={ctx}
          prompt="Three tables just hit the wall. Pick each one's fix from the decision matrix."
          buckets={[
            { id: "bigint", label: "BIGINT migration", hint: "brief downtime · permanent" },
            { id: "split", label: "Table split / UUID", hint: "zero downtime · complex" },
            { id: "reset", label: "Reset and restart", hint: "minutes · data lost" },
          ]}
          items={[
            {
              label: "orders",
              text: "orders · critical production table",
              bucket: "bigint",
              explain: "Critical tables get the clean, permanent fix: INT → BIGINT, tested on a replica first, with an online schema change tool, in the lowest-traffic window.",
            },
            {
              label: "event_log",
              text: "event_log · analytics and logging",
              bucket: "split",
              explain: "Zero downtime matters more than complexity: create event_log_v2 with a BIGINT ID, dual-write, union reads, migrate history later.",
            },
            {
              label: "scratch",
              text: "debug_events · non-critical, already archived elsewhere",
              bucket: "reset",
              explain: "Replaceable data: truncate and restart the counter. Fastest recovery, acceptable data loss.",
            },
          ]}
        />
      ),
    },
    {
      id: "snowflake",
      label: "Snowflake math",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="A Snowflake ID packs 41 bits of timestamp, 10 bits of machine ID and 12 bits of sequence. How many IDs can one machine mint per millisecond?"
          options={["1,024", "4,096", "41", "2^41"]}
          answer={1}
          explain="The sequence field is 12 bits: 2^12 = 4,096 IDs per millisecond per machine, across up to 1,024 machines (2^10). Still a 64-bit integer, so it indexes well and sorts roughly by time."
        />
      ),
    },
  ],
};

export default function IdBurnDown({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
