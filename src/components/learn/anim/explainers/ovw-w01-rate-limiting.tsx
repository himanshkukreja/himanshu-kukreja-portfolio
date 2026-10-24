/**
 * The whole lesson, week 1 day 3 (Rate limiting at scale): why limit, then fixed window (20 in
 * 10 s at the boundary), sliding log, sliding counter (8 × 75% + 3 = 9) and token bucket; counting
 * across 50 servers (uncoordinated, central Redis, local + sync, sticky); and the design: 10,000
 * req/s, multi-level limits and headers, a Redis node dying, fail open vs closed, local fallback.
 */
import type { ReactNode } from "react";
import { Box, defineExplainer, ease, lerp, seg, Meter, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 350;
type Lines = [string, string];
const show = (t: number, a = 0, b = 0.5) => ease(seg(t, a, b));

function Readout({ l, tone }: { l: Lines; tone?: Tone }) {
  return (
    <g>
      <Txt x={20} y={H - 34} k="s" anchor="start" tone={tone}>
        {l[0]}
      </Txt>
      <Txt x={20} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- algorithms: flow on top, the state below */
const AX0 = 40;
const AX1 = 560;
const AY = 262;

function Axis({ ticks, span }: { ticks: [number, string][]; span: number }) {
  const sx = (s: number) => AX0 + ((AX1 - AX0) * s) / span;
  return (
    <g>
      <line className="rl-axis" x1={AX0} x2={AX1} y1={AY} y2={AY} />
      {ticks.map(([s, l]) => (
        <g key={l}>
          <line className="rl-axis" x1={sx(s)} x2={sx(s)} y1={AY} y2={AY + 5} />
          <Txt x={sx(s)} y={AY + 20} k="s" anchor={s === 0 ? "start" : s === span ? "end" : "middle"}>
            {l}
          </Txt>
        </g>
      ))}
    </g>
  );
}

function Algos({ step, t, narrow }: SceneProps) {
  const p = show(t, 0, 0.6);
  const flowTone: Tone = step === 0 ? "bad" : "lit";
  const kick = ["why rate limit", "fixed window", "sliding window log", "sliding window counter", "token bucket"][step];
  const limSub = ["N per second", "count per minute", "log of timestamps", "two counters", "50 tokens, +10/s"][step];
  let panel: ReactNode = null;
  let l: Lines = ["", ""];
  let lt: Tone;
  if (step === 0) {
    l = narrow ? ["botnets · runaway scripts", "cost control · fair share"] : ["DoS botnets · a script making 1M calls · cost · fairness", "a contract: e.g. 100 requests/min per API key"];
    panel = [0, 1, 2, 3, 4, 5].map((i) => {
      const q = seg(t, i * 0.1, i * 0.1 + 0.4);
      const pass = i % 3 === 0;
      if (q <= 0 || q >= 1) return null;
      const x = lerp(140, pass ? 460 : 300, q);
      return <Token key={i} x={x} y={98} tone={pass && x > 300 ? "ok" : x > 280 && !pass ? "bad" : "lit"} />;
    });
  } else if (step === 1) {
    const sx = (s: number) => AX0 + ((AX1 - AX0) * s) / 120;
    l = narrow ? ["10 at 00:55, 10 at 01:05", "20 in 10 s: 2× the limit"] : ["limit 10/min: 10 at 00:55, 10 at 01:05, both allowed", "20 requests in 10 seconds: 2× at the boundary"];
    lt = "bad";
    panel = (
      <g>
        <rect className="rl-win" x={sx(0)} y={190} width={sx(60) - sx(0) - 2} height={60} />
        <rect className="rl-win" x={sx(60) + 2} y={190} width={sx(120) - sx(60) - 2} height={60} />
        <Txt x={sx(4)} y={208} k="s" anchor="start">window 1 · 10</Txt>
        <Txt x={sx(64)} y={208} k="s" anchor="start">window 2 · 10</Txt>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} className="ax-fill bad" x={sx(54) + i * 2.2} y={250 - 34 * Math.min(1, p * 2)} width={1.6} height={34 * Math.min(1, p * 2)} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={`b${i}`} className="ax-fill bad" x={sx(64) + i * 2.2} y={250 - 34 * seg(p, 0.5, 1)} width={1.6} height={34 * seg(p, 0.5, 1)} />
        ))}
        <path className="rl-brk" d={`M${sx(54)} 182V176H${sx(66)}V182`} opacity={seg(t, 0.7, 1)} />
        <Axis span={120} ticks={[[0, "00:00"], [60, "01:00"], [120, "02:00"]]} />
      </g>
    );
  } else if (step === 2) {
    const sx = (s: number) => AX0 + ((AX1 - AX0) * s) / 90;
    const ts: [number, string][] = [[25, "04:25"], [40, "04:40"], [60, "05:00"], [70, "05:10"], [75, "05:15"]];
    l = narrow ? ["4 in the window: allowed", "exact, but every timestamp"] : ["window 12:04:30–12:05:30: 4 requests < 10 · allowed", "exact, but stores every request's timestamp"];
    lt = "ok";
    panel = (
      <g>
        <rect className="rl-slide" x={sx(30 * p)} y={186} width={sx(90) - sx(30)} height={64} />
        {ts.map(([s, lab], i) => (
          <g key={lab}>
            <Token x={sx(s)} y={230} tone={s < 30 ? "mute" : "ok"} />
            {(!narrow || i % 2 === 0) && <Txt x={sx(s)} y={i % 2 ? 200 : 214} k="s" tone={s < 30 ? "mute" : undefined}>{lab}</Txt>}
          </g>
        ))}
        <Axis span={90} ticks={[[0, "12:04:00"], [30, "04:30"], [90, "12:05:30"]]} />
      </g>
    );
  } else if (step === 3) {
    const sx = (s: number) => AX0 + ((AX1 - AX0) * s) / 120;
    l = narrow ? ["8 × 75% + 3 = 9 < 10", "two counters, approximate"] : ["at 12:01:15: 8 × 75% + 3 = 9 < 10 · allowed", "two counters per key: the production sweet spot"];
    lt = "ok";
    panel = (
      <g>
        <rect className="rl-win" x={sx(0)} y={196} width={sx(60) - sx(0) - 2} height={54} />
        <rect className="rl-win" x={sx(60) + 2} y={196} width={sx(120) - sx(60) - 2} height={54} />
        <Txt x={sx(30)} y={228} anchor="middle">prev · 8</Txt>
        <Txt x={sx(90)} y={228} anchor="middle">now · 3</Txt>
        <rect className="rl-slide" x={sx(15 * p)} y={188} width={sx(60) - sx(0)} height={70} />
        <Txt x={sx(15)} y={182} k="s" anchor="start" opacity={p}>{narrow ? "75% of prev" : "sliding 60 s: 75% of prev"}</Txt>
        <Axis span={120} ticks={[[0, "12:00"], [60, "12:01"], [75, "01:15"], [120, "12:02"]]} />
      </g>
    );
  } else {
    const tok = step === 4 ? lerp(50, 20, ease(seg(t, 0.1, 0.6))) : 20;
    l = narrow ? ["burst up to 50, then 10/s", "leaky bucket: steady 10/s"] : ["10 tokens/s, capacity 50: 30 requests leave 20", "leaky bucket instead queues and drains at 10/s"];
    panel = (
      <g>
        <Txt x={AX0} y={204} k="s" anchor="start">{`tokens ${Math.round(tok)} / 50`}</Txt>
        <Meter x={AX0} y={214} w={AX1 - AX0} h={22} value={tok} max={50} ticks={5} tone="ok" />
        <Txt x={AX1} y={262} k="s" anchor="end">{narrow ? "burst allowed" : "bursts allowed up to capacity"}</Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={step === 1 ? "bad" : undefined}>
        {kick}
      </Txt>
      <Wire d="M140 98H230" arrow tone={step === 0 ? undefined : flowTone} />
      <Wire d="M370 98H460" arrow />
      <Box x={20} y={70} w={120} h={56} label={step === 0 ? "Botnet" : "User"} tone={step === 0 ? "bad" : undefined} />
      <Box x={230} y={70} w={140} h={56} label="Limiter" sub={narrow ? undefined : limSub} tone="lit" />
      <Box x={460} y={70} w={120} h={56} label="API" sub={step === 0 ? "protected" : undefined} tone={step === 0 ? "ok" : undefined} />
      {step === 0 ? panel : <g opacity={show(t, 0, 0.3)}>{panel}</g>}
      <Readout l={l} tone={lt} />
    </g>
  );
}

/* ---------------------------------------------------------------- 50 servers, and the design: one shared layout */
const SRV = [0, 1, 2, 3].map((i) => ({ x: 176, y: 44 + i * 58, w: 136, h: 44 }));
const CL = { x: 20, y: 128, w: 120, h: 56 };
const RN = [0, 1, 2].map((i) => ({ x: 400, y: 52 + i * 74, w: 176, h: 48 }));
const RB = { x: 400, y: 104, w: 176, h: 96 };

function Dist({ step, t, narrow }: SceneProps) {
  const k = ["no coordination", "centralized Redis", "local + sync", "sticky sessions"][step];
  const sub = [["2 · allow", "3 · allow", "2 · allow", "2 · allow"], ["checks Redis", "checks Redis", "checks Redis", "checks Redis"], ["local 5", "local 3", "local 2", "local 2"], ["users A, D", "users B, E", "users C, F", "…"]][step];
  const tone: Tone = step === 0 ? "bad" : step === 1 ? "ok" : step === 2 ? "warn" : "sky";
  const ls: Lines[] = [
    narrow ? ["limit 10: 100 allowed", "each server sees 2–3"] : ["limit 10/min · 100 requests across 50 servers", "each sees 2 or 3 and allows all: 100 allowed"],
    narrow ? ["one shared counter", "+1–2 ms · Redis is a SPOF"] : ["accurate: every server shares one counter", "+1–2 ms per request · if Redis dies, then what?"],
    narrow ? ["fast local checks", "can overshoot between syncs"] : ["local checks are fast and survive a Redis blip", "approximate: can exceed the limit between syncs"],
    narrow ? ["no coordination needed", "uneven load · failover"] : ["route each user to one server: no coordination", "uneven load, and a dead server loses its counts"],
  ];
  const l = ls[step];
  const p = ease(seg(t, 0, 0.8));
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={step === 0 ? "bad" : undefined}>
        {k}
      </Txt>
      <Box {...CL} label={step === 3 ? "LB" : "User"} sub={narrow ? undefined : step === 3 ? "sticky by user" : "100 requests"} tone={step === 0 ? "warn" : undefined} />
      {SRV.map((s, i) => (
        <g key={i}>
          <Wire d={`M140 156H158V${s.y + 22}H${s.x}`} />
          {step !== 0 && step !== 3 && <Wire d={`M${s.x + s.w} ${s.y + 22}H380V152H${RB.x}`} dash={step === 2} />}
          <Box {...s} label={i === 3 ? "Server 50" : `Server ${i + 1}`} sub={narrow ? undefined : sub[i]} tone={tone} />
          {p > 0 && p < 1 && <Token x={p < 0.5 ? lerp(140, s.x, p * 2) : step === 0 || step === 3 ? s.x + s.w / 2 : lerp(s.x + s.w, RB.x, p * 2 - 1)} y={p < 0.5 ? lerp(156, s.y + 22, p * 2) : step === 0 || step === 3 ? s.y + 22 : lerp(s.y + 22, 152, p * 2 - 1)} tone={tone} />}
        </g>
      ))}
      {step !== 0 && step !== 3 && <Box {...RB} label="Redis" sub={step === 2 ? "global, synced" : "the counters"} tone={step === 1 ? "ok" : undefined} />}
      {step === 0 && <Box {...RB} label="100 allowed" sub="should be 10" tone="bad" opacity={seg(t, 0.6, 1)} />}
      {step === 3 && <Box {...RB} label="no Redis" sub={narrow ? "per server" : "per-server counts"} tone="sky" />}
      <Readout l={l} tone={step === 0 ? "bad" : undefined} />
    </g>
  );
}

function Design({ step, t, narrow }: SceneProps) {
  const dead = step >= 2;
  const k = ["the requirements", "multi-level limits", "a Redis node dies", "fail open or closed?", "local fallback"][step];
  const svcSub = (narrow ? ["50 servers", "3 limits", "counters?", "open/closed", "local"] : ["50 servers", "user, key, global", "counters?", "open or closed?", "local fallback"])[step];
  const clSub = [narrow ? "10K req/s" : "10,000 req/s", "429", "waiting", "allowed?", "served"][step];
  const ls: Lines[] = [
    narrow ? ["10,000 req/s · < 5 ms p99", "within 10% of the limits"] : ["10,000 req/s across 50 servers · check < 5 ms at p99", "per-user 100/min · per-key 1000/min · within 10%"],
    narrow ? ["X-RateLimit-Remaining", "over a limit: 429"] : ["every response: X-RateLimit-Limit, -Remaining, -Reset", "over any limit: 429 with Retry-After"],
    narrow ? ["~33% of keys unreachable", "failover: 10–30 s"] : ["~33% of the counters live on the dead node", "Redis Cluster failover takes 10–30 s"],
    narrow ? ["open: no protection", "closed: users blocked"] : ["fail open: users served, but no protection", "fail closed: backend protected, users blocked"],
    narrow ? ["66% normal · 33% local", "no one fully blocked"] : ["66% of keys normal · 33% use conservative local limits", "no one blocked; some users slightly over"],
  ];
  const l = ls[step];
  const p = ease(seg(t, 0, 0.8));
  const target = step === 2 ? 1 : 0;
  const tok = step !== 3 && p > 0 && p < 1 ? (p < 0.4 ? { x: lerp(140, 170, p / 0.4), y: 156 } : { x: lerp(320, RN[target].x, (p - 0.4) / 0.6), y: lerp(156, RN[target].y + 24, (p - 0.4) / 0.6) }) : null;
  const svcTone: Tone = step === 4 ? "ok" : step >= 2 ? "warn" : "lit";
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={dead && step < 4 ? "bad" : step === 4 ? "ok" : undefined}>
        {k}
      </Txt>
      <Wire d="M140 156H170" arrow />
      <Box {...CL} label="Client" sub={clSub} tone={step === 1 ? "warn" : step === 4 ? "ok" : undefined} />
      <Box x={170} y={118} w={150} h={76} label={narrow ? "Limiter" : "Rate limit svc"} sub={svcSub} tone={svcTone} />
      {RN.map((n, i) => {
        const bad = dead && i === 1;
        return (
          <g key={i}>
            <Wire d={`M320 156H360V${n.y + 24}H${n.x}`} tone={bad ? "bad" : undefined} dash={bad} />
            <Box {...n} label={narrow ? `Node ${i + 1}` : `Redis node ${i + 1}`} sub={bad ? (narrow ? "down" : "down · ~33% keys") : dead ? (narrow ? "normal" : "normal · ~33% keys") : "counters"} tone={bad ? "bad" : step === 4 ? "ok" : undefined} />
          </g>
        );
      })}
      {tok && <Token {...tok} tone={step === 2 ? "bad" : step === 4 ? "ok" : "lit"} />}
      <Readout l={l} tone={dead && step < 4 ? "bad" : undefined} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "dist") return <Dist {...p} />;
  if (p.variant === "design") return <Design {...p} />;
  return <Algos {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.rl-axis{stroke:var(--ax-fg4);stroke-width:1.5}.rl-win{fill:none;stroke:var(--ax-line);stroke-width:1.5}.rl-slide{fill:none;stroke:var(--ax-accent);stroke-width:2;stroke-dasharray:6 4}.rl-brk{fill:none;stroke:var(--ax-bad);stroke-width:2}`,
  variants: [
    {
      id: "algos",
      label: "Algorithms",
      steps: [
        { caption: "Rate limiting defends against botnets, a runaway script making a million calls, surprise bills and one customer hogging shared capacity. It's a contract, like 100 requests a minute per API key.", tween: 1800, ms: 3600 },
        { caption: "Fixed window counts per minute. With a limit of 10, a user sends 10 at 00:55 and 10 at 01:05: both windows allow them, so 20 requests pass in 10 seconds.", tween: 1600, ms: 3400 },
        { caption: "Sliding window log stores every timestamp. At 12:05:30 it counts the last 60 seconds: 4 requests, under 10, so allowed. Exact, but memory-heavy.", tween: 1600 },
        { caption: "Sliding window counter weights the previous minute. At 12:01:15, 8 × 75% + 3 = 9, under 10, so allowed, with just two counters. The sweet spot for most APIs.", tween: 1600, ms: 3400 },
        { caption: "Token bucket refills 10 tokens a second up to 50, so bursts are allowed: 30 requests leave 20 tokens. Leaky bucket instead drains a queue at a steady 10 a second.", tween: 1400 },
      ],
    },
    {
      id: "dist",
      label: "50 servers",
      steps: [
        { caption: "Now there are 50 servers. A user sends 100 requests against a limit of 10; each server sees 2 or 3, allows them all, and 100 get through.", tween: 1800 },
        { caption: "A centralized Redis counter fixes accuracy: every server shares one count. The price is 1 to 2 ms per request and a single point of failure.", tween: 1800 },
        { caption: "Local counters with periodic sync keep checks fast and survive a brief Redis outage, but they can exceed the global limit between syncs.", tween: 1600 },
        { caption: "Sticky sessions route each user to one server, so no coordination is needed, at the cost of uneven load and trouble when a server dies.", tween: 1400 },
      ],
    },
    {
      id: "design",
      label: "The design",
      steps: [
        { caption: "The design: 10,000 requests a second across 50 servers, per-user limits of 100 a minute and per-key limits of 1,000, a check under 5 ms at p99, within 10%.", tween: 1600, ms: 3600 },
        { caption: "One request can hit several limits: user, API key and global. Every response carries X-RateLimit headers; going over any limit returns 429 with Retry-After.", tween: 1600 },
        { caption: "The challenge: one node of a 3-node Redis cluster dies. About 33% of the counters are unreachable until failover finishes, 10 to 30 seconds later.", tween: 1600 },
        { caption: "Fail open and users keep working with no protection; fail closed and the backend is safe but users are blocked. DDoS and cost control fail closed; user-facing limits fail open.", tween: 900, ms: 3800 },
        { caption: "The recommendation: fall back to conservative local limits for the affected keys. 66% of keys run normally, no one is fully blocked, and you alert on the mode switch.", tween: 1200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
