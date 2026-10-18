/**
 * Week 10 capstone (real-time bidding · latency budget, request flow, Deep Dive 2): one bid request
 * on the 100 ms budget. Edge 2–7 ms, DSP fan-out from 7 ms under one 70 ms deadline (open circuits
 * skipped, late DSPs cancelled and counted as failures), second-price auction with an atomic budget
 * reserve at 82–92 ms, response by ~95 ms, Kafka logging off the path. Then a DSP that turns slow
 * (breaker: 5 failures open, 30 s, 3 successes close) and overload (no-bid shedding, 50 ms timeout,
 * top 3 DSPs only). DSP names and bid amounts are examples.
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 316;
const X0 = 70;
const X1 = 570;
const ms = (v: number) => X0 + (v / 100) * (X1 - X0);
const BY = 56;
const LY = (i: number) => 104 + i * 24;
const PHASES: [number, number, string, string][] = [
  [0, 7, "edge", "edge"],
  [7, 82, "DSP fan-out", "fan-out"],
  [82, 92, "auction", "auction"],
  [92, 95, "", ""],
];

type Lane = { id: string; end: number; bid?: number; out: "bid" | "nobid" | "timeout" | "open" | "skip" };
const NORMAL: Lane[] = [
  { id: "A", end: 31, bid: 2.1, out: "bid" },
  { id: "B", end: 44, bid: 3.4, out: "bid" },
  { id: "C", end: 26, out: "nobid" },
  { id: "D", end: 58, bid: 2.8, out: "bid" },
  { id: "E", end: 77, out: "timeout" },
  { id: "F", end: 7, out: "open" },
];

type Frame = { now: number; deadline: number; lanes: Lane[]; phase: number; result: string; resTone?: Tone; budget: string; note: string; noteTone?: Tone; breaker?: string; brTone?: Tone };

function normal(step: number, t: number): Frame {
  const base = { deadline: 77, lanes: NORMAL, budget: "—" };
  if (step === 0) return { ...base, now: 7 * t, phase: 0, result: "—", note: "rate limit · fraud model < 1 ms · enrich", noteTone: "lit" };
  if (step === 1) return { ...base, now: 7 + 33 * t, phase: 1, result: "—", note: "one 70 ms deadline for all DSPs", noteTone: "lit" };
  if (step === 2) return { ...base, now: 40 + 42 * t, phase: 1, result: t >= 0.9 ? "3 bids · 1 no bid · 1 timeout" : "collecting…", note: "late DSP cancelled: a breaker failure", noteTone: "warn" };
  return {
    ...base,
    now: 82 + 13 * t,
    phase: t < 0.75 ? 2 : 3,
    result: t >= 0.5 ? "B wins $3.40, pays $2.80" : "second-price auction",
    resTone: t >= 0.5 ? "ok" : "lit",
    budget: t >= 0.5 ? "$2.80 reserved" : "checking lease",
    note: t >= 0.9 ? "sent at ~95 ms · Kafka log async" : "frequency caps · brand safety",
    noteTone: t >= 0.9 ? "ok" : "lit",
  };
}

function slow(step: number, t: number): Frame {
  const lanes = NORMAL.map((l): Lane => (l.id === "C" ? { id: "C", end: 77, out: "timeout" } : l.id === "E" ? { id: "E", end: 50, bid: 1.9, out: "bid" } : l.id === "F" ? { id: "F", end: 36, bid: 2.4, out: "bid" } : l));
  if (step === 0) return { now: 7 + 70 * t, deadline: 77, lanes, phase: 1, result: t >= 0.9 ? "auction closes without C" : "collecting…", budget: "—", note: "C takes 500 ms now", noteTone: "warn", breaker: "C: CLOSED", brTone: "warn" };
  if (step === 1)
    return {
      now: 77,
      deadline: 77,
      lanes: lanes.map((l) => (l.id === "C" ? { id: "C", end: 7, out: "open" } : l)),
      phase: 1,
      result: "C skipped, fails fast",
      budget: "—",
      note: "5 failures → OPEN",
      noteTone: "bad",
      breaker: t >= 0.4 ? "C: OPEN" : "C: failures 5/5",
      brTone: "bad",
    };
  return {
    now: 77,
    deadline: 77,
    lanes: lanes.map((l) => (l.id === "C" ? { id: "C", end: 33, bid: 2.2, out: "bid" } : l)),
    phase: 1,
    result: "C answers again",
    resTone: "ok",
    budget: "—",
    note: "after 30 s: HALF_OPEN trials",
    noteTone: "warn",
    breaker: t >= 0.6 ? "C: CLOSED (3 ok)" : "C: HALF_OPEN",
    brTone: t >= 0.6 ? "ok" : "warn",
  };
}

function overload(step: number, t: number): Frame {
  if (step === 0)
    return { now: 2 + 5 * t, deadline: 57, lanes: [], phase: 0, result: t >= 0.6 ? "low-value slot: no bid" : "—", resTone: "warn", budget: "—", note: "p99 > 80 ms · CPU > 80% · queue deep", noteTone: "bad" };
  const lanes: Lane[] = [NORMAL[0], NORMAL[1], { id: "C", end: 7, out: "skip" }, { id: "D", end: 57, out: "timeout" }, { id: "E", end: 7, out: "skip" }, { id: "F", end: 7, out: "skip" }];
  return { now: 7 + 50 * t, deadline: 57, lanes, phase: 1, result: t >= 0.9 ? "B wins $3.40, pays $2.10" : "collecting…", resTone: t >= 0.9 ? "ok" : undefined, budget: "—", note: "50 ms timeout · top 3 DSPs only", noteTone: "warn" };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = variant === "slow" ? slow(step, t) : variant === "overload" ? overload(step, t) : normal(step, t);
  const now = Math.max(0, f.now);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "bid request · 100 ms" : "one bid request · 100 ms budget (p99)"}
      </Txt>
      {/* budget bar */}
      <rect className="rt-bar" x={ms(0)} y={BY} width={ms(100) - ms(0)} height={18} />
      {PHASES.map(([a, b, wide, short], i) => (
        <g key={i}>
          <rect className={`rt-ph ${i === f.phase ? "on" : i < f.phase ? "past" : ""}`} x={ms(a)} y={BY} width={ms(b) - ms(a)} height={18} />
          {(narrow ? short : wide) && (
            <Txt x={(ms(a) + ms(b)) / 2} y={BY - 8} k="s" tone={i === f.phase ? "lit" : undefined}>
              {narrow ? short : wide}
            </Txt>
          )}
        </g>
      ))}
      {[0, 50, 100].map((v) => (
        <Txt key={v} x={ms(v)} y={BY + 36} k="s" anchor={v === 0 ? "start" : v === 100 ? "end" : "middle"}>
          {`${v} ms`}
        </Txt>
      ))}
      <line className="rt-now" x1={ms(now)} x2={ms(now)} y1={BY - 2} y2={LY(5) + 12} />
      {/* deadline */}
      {f.lanes.length > 0 && (
        <g>
          <line className="rt-dl" x1={ms(f.deadline)} x2={ms(f.deadline)} y1={LY(0) - 14} y2={LY(5) + 12} />
          <Txt x={ms(f.deadline) + 6} y={LY(5) + 5} k="s" anchor="start" tone="bad">
            {`${f.deadline - 7} ms`}
          </Txt>
        </g>
      )}
      {/* DSP lanes */}
      {f.lanes.map((l, i) => {
        const y = LY(i);
        const end = Math.min(l.end, now);
        const answered = now >= l.end;
        const tone = l.out === "bid" ? "ok" : l.out === "timeout" ? "bad" : l.out === "nobid" ? "mute" : "mute";
        const label = l.out === "bid" ? `$${l.bid!.toFixed(2)}` : l.out === "nobid" ? (narrow ? "204" : "no bid") : l.out === "timeout" ? (narrow ? "cut" : "cancelled") : l.out === "open" ? (narrow ? "open" : "circuit open") : narrow ? "skip" : "not top 3";
        const skip = l.out === "open" || l.out === "skip";
        return (
          <g key={l.id}>
            <Txt x={20} y={y + 5} k="s" anchor="start" tone={skip ? "mute" : undefined}>
              {narrow ? l.id : `DSP-${l.id}`}
            </Txt>
            {!skip && now > 7 && <rect className={`rt-lane ${answered ? tone : "run"}`} x={ms(7)} y={y - 6} width={Math.max(0, ms(end) - ms(7))} height={12} />}
            {(skip ? now >= 7 : answered) && (
              <Txt x={ms(skip ? 7 : l.end) + 6} y={y + 5} k="s" anchor="start" tone={tone === "mute" ? "mute" : tone}>
                {label}
              </Txt>
            )}
          </g>
        );
      })}
      {f.lanes.length === 0 && (
        <Txt x={ms(50)} y={LY(2) + 10} anchor="middle" tone="warn">
          {narrow ? "shed at the edge" : "shed at the edge: no DSP called"}
        </Txt>
      )}
      {/* readout */}
      <line className="rt-rule" x1={20} x2={W - 20} y1={H - 72} y2={H - 72} />
      <Txt x={20} y={H - 46} anchor="start" tone={f.resTone}>
        {f.result}
      </Txt>
      {f.breaker ? (
        <Txt x={W - 20} y={H - 46} k="s" anchor="end" tone={f.brTone}>
          {f.breaker}
        </Txt>
      ) : (
        !narrow && (
          <Txt x={W - 20} y={H - 46} k="s" anchor="end" tone={f.budget === "—" ? "mute" : "ok"}>
            {`budget: ${f.budget}`}
          </Txt>
        )
      )}
      <Txt x={20} y={H - 16} k="s" anchor="start" tone={f.noteTone}>
        {f.note}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.rt-bar{fill:none;stroke:var(--ax-line);stroke-width:1.5}.rt-ph{fill:var(--ax-box);stroke:var(--ax-line);stroke-width:1.5}.rt-ph.past{fill:var(--ax-line-soft)}.rt-ph.on{fill:var(--ax-accent)}.rt-now{stroke:var(--ax-fg3);stroke-width:1.5;stroke-dasharray:3 3}.rt-dl{stroke:var(--ax-bad);stroke-width:2;stroke-dasharray:6 4}.rt-lane{fill:var(--ax-accent)}.rt-lane.ok{fill:var(--ax-ok)}.rt-lane.bad{fill:var(--ax-bad)}.rt-lane.mute{fill:var(--ax-fg4)}.rt-rule{stroke:var(--ax-line-soft);stroke-width:1.5}`,
  variants: [
    {
      id: "normal",
      label: "One request",
      steps: [
        { caption: "0–7 ms: the edge rate-limits, runs the fraud model (under 1 ms), validates and enriches the request.", tween: 1200 },
        { caption: "From 7 ms all DSPs are queried in parallel under one 70 ms deadline; open circuits are skipped.", tween: 2000 },
        { caption: "Bids are collected as they arrive. At the deadline the slow DSP is cancelled and counted as a failure.", tween: 2400 },
        { caption: "82–92 ms: second-price auction, budget reserved atomically. The response leaves at ~95 ms; Kafka logging is async.", tween: 2000, ms: 3600 },
      ],
    },
    {
      id: "slow",
      label: "Slow DSP",
      steps: [
        { caption: "DSP-C starts taking 500 ms. Every auction still closes at the 70 ms deadline, just without its bid.", tween: 2400 },
        { caption: "Each miss is a breaker failure. After 5 the circuit opens, and fan-outs skip DSP-C instantly.", tween: 1400 },
        { caption: "After 30 s half-open trial requests go through; 3 successes close the circuit, a failure reopens it.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "overload",
      label: "Overload",
      steps: [
        { caption: "Overload: p99 above 80 ms, CPU above 80% or a deep queue. Low-value requests get an immediate no bid.", tween: 1200 },
        { caption: "The DSP timeout drops from 70 ms to 50 ms and only the top 3 DSPs are queried.", tween: 2000, ms: 3600 },
      ],
    },
  ],
  Scene,
});
