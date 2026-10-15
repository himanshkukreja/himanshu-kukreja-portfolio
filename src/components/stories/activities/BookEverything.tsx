"use client";

import { useState } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_GHOST, BTN_PRIMARY, ChoiceStep, ClassifyStep, Feedback, OPTION, OPT_IDLE, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

type Row = { who: string; state: string; tone: "idle" | "lock" | "bad" | "ok" };

const TICKS: { log: string; rows: Row[] }[] = [
  {
    log: "12:14:59  customer clicks “Book Everything”: JFK→NRT, Tokyo Grand Hotel, Toyota Camry",
    rows: [
      { who: "Coordinator", state: "starting", tone: "idle" },
      { who: "Flight · US-East", state: "free", tone: "idle" },
      { who: "Hotel · Europe", state: "free", tone: "idle" },
      { who: "Car · Asia-Pacific", state: "free", tone: "idle" },
    ],
  },
  {
    log: "12:15:00  phase 1 · PREPARE sent to all three services",
    rows: [
      { who: "Coordinator", state: "waiting for votes", tone: "idle" },
      { who: "Flight · US-East", state: "PREPARED · seat locked", tone: "lock" },
      { who: "Hotel · Europe", state: "PREPARED · room locked", tone: "lock" },
      { who: "Car · Asia-Pacific", state: "PREPARED · car locked", tone: "lock" },
    ],
  },
  {
    log: "12:15:01  coordinator: all services ready. Writing COMMIT… memory exhausted. CRASH.",
    rows: [
      { who: "Coordinator", state: "CRASHED", tone: "bad" },
      { who: "Flight · US-East", state: "PREPARED · seat locked", tone: "lock" },
      { who: "Hotel · Europe", state: "PREPARED · room locked", tone: "lock" },
      { who: "Car · Asia-Pacific", state: "PREPARED · car locked", tone: "lock" },
    ],
  },
];

const TONE: Record<Row["tone"], string> = {
  idle: "border-line-strong text-fg-2",
  lock: "border-fg bg-fg text-bg",
  bad: "border-bad bg-bad text-white",
  ok: "border-signal bg-signal text-on-signal",
};

function TwoPhase({ ctx }: { ctx: StepCtx }) {
  const [t, setT] = useState(0);
  const tick = TICKS[t];
  const last = t >= TICKS.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Step through WonderTravel's Black Friday, one tick at a time.">Two-phase commit, 12:15 AM.</StepPrompt>
      <div className="border border-line-strong bg-bg">
        <div className="border-b border-line px-3 py-2 font-mono text-[11px] text-fg-3">2pc-coordinator.log · tick {t + 1}/{TICKS.length}</div>
        <ol className="m-0 flex list-none flex-col gap-1 p-3 font-mono text-[12.5px] leading-[1.55]">
          {TICKS.slice(0, t + 1).map((x, i) => (
            <li key={i} className={i === t ? "text-fg" : "text-fg-3"}>
              {x.log}
            </li>
          ))}
        </ol>
        <ul className="m-0 grid list-none gap-1.5 border-t border-line p-3 sm:grid-cols-2" aria-live="polite">
          {tick.rows.map((r) => (
            <li key={r.who} className="flex flex-col gap-1">
              <span className="font-mono text-[11px] text-fg-3">{r.who}</span>
              <span className={`border px-2 py-1.5 font-mono text-[12px] font-semibold ${TONE[r.tone]}`}>{r.state}</span>
            </li>
          ))}
        </ul>
      </div>
      {!last ? (
        <button type="button" onClick={() => setT(t + 1)} className={`${BTN_GHOST} self-start`}>
          next tick →
        </button>
      ) : (
        <ChoiceStep
          ctx={ctx}
          prompt="The coordinator is gone. What do the three services do now?"
          options={[
            "Commit on their own after a timeout, since everyone voted yes.",
            "Hold their locks and wait for a commit or abort that never comes.",
            "Roll back automatically and email the customer.",
            "Elect a new coordinator and replay the log.",
          ]}
          answer={1}
          explain="That's the blocking problem. 2,000 transactions sat in the prepared state: 6,000 seats, rooms and cars locked and unusable, about $2.4M in blocked bookings, and 4 hours to find and unlock them by hand."
        />
      )}
    </div>
  );
}

const STEPS = [
  { s: "Book flight", e: "FlightBooked", ok: true },
  { s: "Book hotel", e: "HotelBooked", ok: true },
  { s: "Book car", e: "CarBookingFailed", ok: false },
];
const COMP = [
  { id: "hotel", text: "Cancel hotel" },
  { id: "car", text: "Cancel car" },
  { id: "flight", text: "Cancel flight" },
  { id: "retry", text: "Retry hotel booking" },
];
const RIGHT = ["hotel", "flight"];

function Compensate({ ctx }: { ctx: StepCtx }) {
  const [queue, setQueue] = useState<string[]>([]);
  const [ran, setRan] = useState(false);
  const exact = queue.length === 2 && queue[0] === RIGHT[0] && queue[1] === RIGHT[1];
  const sameSet = queue.length === 2 && RIGHT.every((r) => queue.includes(r));
  const score = exact ? 2 : sameSet ? 1 : 0;
  const add = (id: string) => {
    if (ran || queue.includes(id) || queue.length >= 2) return;
    setQueue([...queue, id]);
  };
  const run = () => {
    if (ran || queue.length !== 2) return;
    setRan(true);
    ctx.done(score);
  };
  const label = (id: string) => COMP.find((c) => c.id === id)?.text ?? id;
  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Queue two compensating actions, in the order they should run. Tap a queued one to remove it.">
        Same booking, now as a saga. The car just failed.
      </StepPrompt>
      <ol className="m-0 flex list-none flex-col gap-1 border border-line-strong bg-bg p-3 font-mono text-[12.5px]">
        {STEPS.map((x, i) => (
          <li key={x.s} className="flex flex-wrap justify-between gap-x-3">
            <span className="text-fg">
              {i + 1}. {x.s} {x.ok ? "✓" : "✗"}
            </span>
            <span className={x.ok ? "text-fg-3" : "text-bad-text"}>publish {x.e}</span>
          </li>
        ))}
        {queue.map((id, k) => (
          <li key={id}>
            <button
              type="button"
              disabled={ran}
              onClick={() => setQueue(queue.filter((q) => q !== id))}
              className={`flex min-h-10 w-full items-center justify-between gap-3 text-left disabled:cursor-default ${
                ran ? (RIGHT[k] === id ? "text-signal-text" : "text-bad-text") : "text-signal-text hover:underline"
              }`}
              aria-label={`Compensation ${k + 1}: ${label(id)}${ran ? "" : ". Tap to remove"}`}
            >
              <span>
                {STEPS.length + k + 1}. {label(id)} {ran ? (RIGHT[k] === id ? "✓" : "✗") : ""}
              </span>
              {!ran && <span className="text-fg-4">remove</span>}
            </button>
          </li>
        ))}
        {!ran && queue.length < 2 && <li className="text-fg-4">{STEPS.length + queue.length + 1}. ____</li>}
      </ol>
      {!ran && (
        <>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Compensating actions">
            {COMP.map((c) => (
              <button key={c.id} type="button" disabled={queue.includes(c.id) || queue.length >= 2} onClick={() => add(c.id)} className={`${OPTION} ${OPT_IDLE} disabled:opacity-45`}>
                {c.text}
              </button>
            ))}
          </div>
          <button type="button" onClick={run} disabled={queue.length !== 2} className={`${BTN_PRIMARY} self-start`}>
            run compensations
          </button>
        </>
      )}
      <div aria-live="polite">
        {ran && (
          <Feedback ok={exact} title={exact ? "System self-heals." : sameSet ? "Right undo actions, wrong order." : "That leaves a partial booking."}>
            Undo what actually succeeded, newest first: cancel hotel (publish HotelCancelled), then cancel flight (FlightCancelled). The car never booked, so there is
            nothing to cancel, and retrying the hotel is not compensation. No locks were held at any point: each service committed locally and knows how to undo.
          </Feedback>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "step-through",
  title: "Book everything",
  blurb:
    "Replay WonderTravel's Black Friday: watch two-phase commit freeze when its coordinator dies, then save the same booking with a saga. Finish by picking the pattern for four real systems.",
  minutes: 3,
  steps: [
    { id: "2pc", label: "2PC at 12:15 AM", max: 1, render: (ctx) => <TwoPhase ctx={ctx} /> },
    { id: "saga", label: "Compensate", max: 2, render: (ctx) => <Compensate ctx={ctx} /> },
    {
      id: "which",
      label: "2PC or saga?",
      max: 4,
      render: (ctx) => (
        <ClassifyStep
          ctx={ctx}
          prompt="2PC still has rare, valid uses. Pick the pattern for each system."
          buckets={[
            { id: "2pc", label: "Two-phase commit", hint: "consistency over availability" },
            { id: "saga", label: "Saga", hint: "availability + compensation" },
          ]}
          items={[
            {
              label: "bank",
              text: "Transfer $10,000 from Bank A to Bank B",
              bucket: "2pc",
              explain: "Interbank transfers need absolute consistency (no partial transfers), are lower volume and can tolerate blocking: one of the story's rare cases for 2PC.",
            },
            {
              label: "travel",
              text: "Flight + hotel + car package",
              bucket: "saga",
              explain: "Services are independent and cancellation is natural, so compensation fits. Eventual consistency is fine for travel; WonderTravel moved to a saga.",
            },
            {
              label: "vip",
              text: "Exactly 100 VIP concert tickets, never oversold",
              bucket: "2pc",
              explain: "Critical inventory allocation in a short window at manageable scale: the story accepts the slowdown to never oversell.",
            },
            {
              label: "order",
              text: "Online order: payment + inventory + shipping",
              bucket: "saga",
              explain: "Payment failures are handled gracefully, inventory is reserved but recoverable and shipping is cancellable: the story's e-commerce saga.",
            },
          ]}
        />
      ),
    },
    {
      id: "idem",
      label: "Retry storm",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="A network blip makes the orchestrator retry book_flight with the same idempotency key. The first call already COMPLETED. What happens?"
          options={[
            "A second seat is booked; compensation cleans it up later.",
            "The service returns the cached result of the first call.",
            "The request is rejected as a duplicate and the saga fails.",
            "The service waits 5 seconds and books again.",
          ]}
          answer={1}
          explain="The operation log is checked first: a COMPLETED key returns the cached result, an IN_PROGRESS key returns “retry after 5 s”. That's what makes retries safe in a saga."
        />
      ),
    },
  ],
};

export default function BookEverything({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
