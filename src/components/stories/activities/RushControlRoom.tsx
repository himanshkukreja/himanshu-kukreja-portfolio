"use client";

import { useEffect, useState } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_GHOST, BTN_PRIMARY, ChoiceStep, ClassifyStep, Feedback, OPTION, OPT_IDLE, OPT_RIGHT, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

type Design = {
  id: "row" | "bouncer" | "room";
  name: string;
  stages: string[];
  hot: number; // index of the stage that melts (−1: none)
  meters: { label: string; value: number; text: string }[];
  verdict: string;
};

// Qualitative toy model of the three designs the case file walks through.
const DESIGNS: Design[] = [
  {
    id: "row",
    name: "Every click updates the seat-count row",
    stages: ["2,000,000 clicks", "seat_count row", "booking"],
    hot: 1,
    meters: [
      { label: "time to hear “no”", value: 1, text: "after a timeout" },
      { label: "load on the seat row", value: 1, text: "everyone, at once" },
      { label: "booking system load", value: 0.9, text: "blocked behind the row" },
    ],
    verdict: "One row became a hot key: the bottleneck for the whole system, not because the data is complicated but because everyone touches it at once. Frozen loading screens for millions.",
  },
  {
    id: "bouncer",
    name: "Bouncer counter (starts at 500) in front of booking",
    stages: ["2,000,000 clicks", "bouncer · 500", "booking"],
    hot: 1,
    meters: [
      { label: "time to hear “no”", value: 0.55, text: "fast, once you reach the door" },
      { label: "load on the bouncer", value: 1, text: "trampled at 10:00:00" },
      { label: "booking system load", value: 0.1, text: "~500 people" },
    ],
    verdict: "Much better: the booking system only sees ~500 people. But even a fast bouncer gets trampled if two million people rush the door at the exact same instant.",
  },
  {
    id: "room",
    name: "Waiting room → bouncer counter → booking",
    stages: ["2,000,000 clicks", "waiting room", "bouncer · 500", "booking"],
    hot: -1,
    meters: [
      { label: "time to hear “no”", value: 0.06, text: "milliseconds" },
      { label: "load on the bouncer", value: 0.35, text: "a steady trickle" },
      { label: "booking system load", value: 0.1, text: "~500 people" },
    ],
    verdict: "“You are number 84,213.” The waiting room admits a trickle and breathes with database health; the bouncer answers yes or no from one number; only ~500 people ever reach booking.",
  },
];

function Rush({ ctx }: { ctx: StepCtx }) {
  const [runs, setRuns] = useState<Design["id"][]>([]);
  const [cur, setCur] = useState<Design["id"] | null>(null);
  const [t, setT] = useState(0); // 0..12 seconds after 10:00:00
  const [locked, setLocked] = useState<Design["id"] | null>(null);
  const d = DESIGNS.find((x) => x.id === cur);
  const playing = !!d && t < 12;

  useEffect(() => {
    if (!cur) return;
    if (ctx.reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: show the end state at once
      setT(12);
      return;
    }
    const id = window.setInterval(() => setT((x) => (x >= 12 ? x : x + 1)), 170);
    return () => window.clearInterval(id);
  }, [cur, runs.length, ctx.reduced]);

  const run = (id: Design["id"]) => {
    if (locked) return;
    setCur(id);
    setT(0);
    setRuns((r) => [...r, id]);
  };
  const lock = () => {
    if (!d || playing || locked) return;
    setLocked(d.id);
    ctx.done(d.id !== "room" ? 0 : runs[0] === "room" ? 2 : 1);
  };

  const k = t / 12;
  const seats = !d ? 0 : d.id === "row" ? Math.round(500 * Math.min(1, k * 0.25)) : Math.round(500 * Math.min(1, k * 2.4));
  const clock = `10:00:${String(t).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Run a design against the 10:00:00 burst. Try as many as you like, then lock one in. First-try picks score double.">
        2,000,000 people. 500 seats. Pick the front door.
      </StepPrompt>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Designs">
        {DESIGNS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={cur === x.id}
            disabled={!!locked}
            onClick={() => run(x.id)}
            className={`${OPTION} ${cur === x.id ? OPT_RIGHT : OPT_IDLE} justify-between`}
          >
            <span className="font-semibold">{x.name}</span>
            <span className="shrink-0 font-mono text-[11px] opacity-80">{runs.includes(x.id) ? (cur === x.id ? "running" : "ran") : "▶ run"}</span>
          </button>
        ))}
      </div>

      {d && (
        <div className="flex flex-col gap-3 border border-line-strong bg-bg p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[12px]">
            <span className="text-fg-3">toy model</span>
            <span className="text-[20px] font-semibold tabular-nums text-fg" aria-live="off">
              {clock}
            </span>
          </div>
          {/* pipeline */}
          <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 font-mono text-[11.5px]" aria-label="Request path">
            {d.stages.map((s, i) => {
              const melting = i === d.hot && t >= 1;
              return (
                <li key={s} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden className="text-fg-4">→</span>}
                  <span
                    className={`border px-2 py-1.5 ${
                      melting ? "border-bad bg-bad/15 text-bad-text" : i === d.stages.length - 1 ? "border-signal text-signal-text" : "border-line-strong text-fg"
                    } ${melting && !ctx.reduced ? "animate-pulse" : ""}`}
                  >
                    {s}
                    {melting ? " · melting" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          {d.id === "room" && t >= 1 && (
            <p className="m-0 border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-fg-2">
              You are number <span className="text-fg">84,213</span>. Estimated wait: a few seconds.
            </p>
          )}
          <dl className="m-0 grid gap-2">
            {d.meters.map((m) => (
              <div key={m.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-label text-fg-3">{m.label}</dt>
                <dd className="m-0 text-right font-mono text-[12px] text-fg">{t >= 2 ? m.text : "…"}</dd>
                <span className="col-span-2 h-2 bg-surface-2" aria-hidden>
                  <span
                    className={`block h-full ${m.value >= 0.8 ? "bg-bad" : "bg-signal"}`}
                    style={{ width: `${Math.round(m.value * Math.min(1, t / 3) * 100)}%`, transition: ctx.reduced ? undefined : "width 160ms linear" }}
                  />
                </span>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-2.5 font-mono text-[12.5px]">
            <span className="text-fg-2">
              seats confirmed <span className="font-semibold text-fg">{seats}</span>/500
            </span>
            <span className="text-fg-2">double-sold: 0</span>
          </div>
          {t >= 12 && <p className="m-0 text-[14.5px] leading-relaxed text-fg-2">{d.verdict}</p>}
        </div>
      )}

      {d && !locked && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={lock} disabled={playing} className={BTN_PRIMARY}>
            {playing ? "running…" : "lock in this design"}
          </button>
          {!playing && (
            <button type="button" onClick={() => run(d.id)} className={BTN_GHOST}>
              ↻ replay
            </button>
          )}
        </div>
      )}
      <div aria-live="polite">
        {locked && (
          <Feedback ok={locked === "room"} title={locked === "room" ? "IRCTC handled it." : "IRCTC is down again."}>
            Separate “can I even try?” from “give me the seat”. The number of people you reject is unlimited, but the work of rejecting them must cost almost nothing:
            a waiting room that adapts to the crowd, a one-number bouncer, and a booking system that only ever sees the ~500 who got a yes.
          </Feedback>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "simulation",
  title: "Rush control room",
  blurb:
    "It's 9:59:59 and you run the door. Pick the architecture that survives the 10:00:00 stampede, then sort six sessions into humans and bots using IRCTC's 2025 rules.",
  minutes: 3,
  steps: [
    { id: "rush", label: "Survive 10:00:00", max: 2, render: (ctx) => <Rush ctx={ctx} /> },
    {
      id: "bots",
      label: "Human or bot?",
      max: 6,
      render: (ctx) => (
        <ClassifyStep
          ctx={ctx}
          prompt="AC Tatkal opened at 10:00. Let each session through, or block/flag it."
          sub="Using the tells and rules in the case file."
          buckets={[
            { id: "let", label: "Let through" },
            { id: "block", label: "Block / flag" },
          ]}
          items={[
            {
              label: "speed",
              text: "Passenger form submitted 0.4 s after the page loaded",
              bucket: "block",
              explain: "No human typing on a phone fills a passenger form in under a second. That's one of the behavioural tells the system watches for.",
            },
            {
              label: "human",
              text: "Aadhaar-verified account on a mobile network, OTP entered after 9 s",
              bucket: "let",
              explain: "Verified identity, Aadhaar-linked OTP, a real mobile network and human timing: exactly who Tatkal is for.",
            },
            {
              label: "device",
              text: "37 “different” accounts logging in from the same device",
              bucket: "block",
              explain: "Dozens of accounts on one device is a classic tout tell. In 2025 Indian Railways deactivated 3.03 crore suspicious accounts.",
            },
            {
              label: "agent",
              text: "An authorized travel agent booking AC Tatkal at 10:12 AM",
              bucket: "block",
              explain: "Agents are banned from booking in the first 30 minutes of the window (10:00–10:30 for AC), so individual travellers get a fair shot at the first seats.",
            },
            {
              label: "dc",
              text: "Requests pouring in from a data-center IP range",
              bucket: "block",
              explain: "Real travellers book from homes and mobile networks, not server farms. Data-center ranges are a bot tell.",
            },
            {
              label: "aadhaar",
              text: "Website Tatkal booking in August 2025 from an account with no Aadhaar verification",
              bucket: "block",
              explain: "Aadhaar-based identity verification became mandatory for Tatkal on the website and app from 1 July 2025.",
            },
          ]}
        />
      ),
    },
    {
      id: "split",
      label: "Look vs book",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="The 2025 system was sized for ~4,00,000 availability enquiries a minute but ~32,000 tickets a minute. Why keep looking and booking on separate infrastructure?"
          options={[
            "Availability data must be strongly consistent.",
            "So a spike in looking can't drag down buying.",
            "Bookings need a different database engine.",
            "To bill travel agents separately.",
          ]}
          answer={1}
          explain="The recurring lesson of the December 2024 and October 2025 outages: when checking and booking share servers, someone refreshing a hundred times makes real booking attempts slower. Looking tolerates staleness; buying doesn't."
        />
      ),
    },
  ],
};

export default function RushControlRoom({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
