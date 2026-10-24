/**
 * The whole low-level design lesson, Design a Rate Limiter (the classes, not the distributed
 * system): the round (three algorithms, one interface, an injected clock), the classes (Decision,
 * rules, a factory, one limiter per key in a registry), a burst through the token bucket, lazy
 * refill, the OTP fixed window and its boundary flaw, then the two races and the follow-ups.
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
/** a class on the diagram: box, label, short label for narrow stages */
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an object's state, drawn as a small square: [label, tone, caption under it] */
type Tile = [Two, Tone?, Two?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** classes in play (plain 1 or a tone); every other class is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** calls flowing in this frame: [from, to, tone]; a reversed pair runs the wire backwards */
  fl?: [string, string, Tone?][];
  /** object state row (spots, seats, cache order, balances…) */
  tiles?: Tile[];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[V[0].id]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  // the lower band stacks: tiles, figures, chips, meters
  let y = 206;
  const tY = y;
  if (f.tiles) y += f.tiles.some((x) => x[2] !== undefined) ? 58 : 42;
  const fY = y;
  if (f.figs) y += 64;
  const cols = f.cols || 2;
  const cY = y;
  if (f.chips) y += Math.ceil(f.chips.length / cols) * 34;
  const bY = y;
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cw = (552 - (cols - 1) * 8) / cols;
  const nt = f.tiles?.length || 0;
  const tw = Math.min(96, (568 - (nt - 1) * 6) / Math.max(1, nt));
  const tx = (W - nt * tw - (nt - 1) * 6) / 2;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.tiles?.map(([l, tone, c], i) => {
        const x = tx + i * (tw + 6);
        return (
          <g key={i} opacity={fade(i, nt)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={tY} width={tw} height={30} />
            <Txt x={x + tw / 2} y={tY + 20} k="s" tone={tone}>
              {pick(l, nr)}
            </Txt>
            {c !== undefined && (
              <Txt x={x + tw / 2} y={tY + 46} k="s" tone={tone}>
                {pick(c, nr)}
              </Txt>
            )}
          </g>
        );
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={fY + 30} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={fY + 52} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const cy = cY + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={cy} width={cw} height={26} />
            <Txt x={x + cw / 2} y={cy + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={bY + 10 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={bY + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars || f.tiles ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  client: { x: 16, y: 40, w: 96, h: 44, l: "Request" },
  registry: { x: 144, y: 40, w: 124, h: 44, l: "Registry" },
  rules: { x: 300, y: 40, w: 124, h: 44, l: "Rule table", n: "Rules" },
  factory: { x: 456, y: 40, w: 128, h: 44, l: "Factory" },
  decision: { x: 144, y: 150, w: 124, h: 44, l: "Decision" },
  limiter: { x: 300, y: 150, w: 124, h: 44, l: "RateLimiter", n: "Limiter" },
  clock: { x: 456, y: 150, w: 128, h: 44, l: "Clock" },
};
const E: [string, string][] = [
  ["client", "registry"],
  ["registry", "rules"],
  ["rules", "factory"],
  ["factory", "limiter"],
  ["registry", "limiter"],
  ["limiter", "clock"],
  ["limiter", "decision"],
  ["decision", "client"],
];
const ALL = { client: 1, registry: 1, rules: 1, factory: 1, decision: 1, limiter: 1, clock: 1 } as const;
const CALL = { client: 1, registry: 1, limiter: "lit", decision: 1 } as const;
const FLOW: [string, string, Tone?][] = [
  ["client", "registry"],
  ["registry", "limiter"],
  ["limiter", "decision"],
  ["decision", "client"],
];

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["3", "algorithms"], ["1", ["injected clock", "clock"]], ["2×", ["fixed window at an edge", "at an edge"], "bad"]] },
    {
      k: "clarify first",
      on: { client: 1, registry: "lit", rules: 1 },
      chips: [["key = (client, endpoint)", "key: client+path"], ["rule = (tier, endpoint)", "rule: tier+path"], ["say when to retry", "retry_after"], ["a request can cost > 1", "cost > 1"], ["many threads", "threads"], ["a default rule", "default rule"]],
      ctn: [undefined, undefined, undefined, undefined, "warn"],
    },
    { k: "inject the clock", on: { limiter: 1, clock: "lit" }, fl: [["limiter", "clock"]], chips: [["MonotonicClock in production", "monotonic: prod"], ["FakeClock in tests: advance(0.5)", "FakeClock: tests"]], ct: "sky", note: ["tests never sleep; time never runs backwards", "no sleeping in tests"] },
  ],
  classes: [
    { k: "one interface", on: { limiter: "lit", decision: 1, clock: 1 }, fl: [["limiter", "decision"]], sub: { decision: ["allowed, retry", "allowed"] }, chips: ["TokenBucket", "FixedWindow", "SlidingWindowLog"], cols: 3, ct: "sky" },
    {
      k: "rules + a factory",
      on: { registry: 1, rules: "lit", factory: "lit", limiter: 1 },
      fl: [["rules", "factory"], ["factory", "limiter"]],
      chips: [["free /search: bucket, 5/s", "free search 5/s"], ["pro /search: bucket, 50/s", "pro search 50/s"], ["free /otp: window, 3/min", "OTP 3/min"], ["no rule: sliding log 10/min", "default 10/min"]],
      ct: "sky",
    },
    { k: "one limiter per key", on: { client: 1, registry: "lit", limiter: 1 }, fl: [["client", "registry"], ["registry", "limiter"]], sub: { registry: ["(client, path)", "key"] }, note: ["each limiter is tiny and has its own lock", "a lock per limiter"] },
  ],
  burst: [
    {
      k: "a burst of 7",
      on: CALL,
      fl: FLOW,
      tiles: [["1", "ok", "ok"], ["2", "ok", "ok"], ["3", "ok", "ok"], ["4", "ok", "ok"], ["5", "ok", "ok"], ["6", "bad", "no"], ["7", "bad", "no"]],
      bars: [[["tokens left: 0 of 5", "tokens 0/5"], 0.05, 5, "bad"]],
    },
    { k: "lazy refill", on: { limiter: "lit", clock: "lit", decision: 1 }, fl: [["limiter", "clock"]], tiles: [["8", "ok", "ok"], ["9", "ok", "ok"], ["10", "bad", "no"]], bars: [[["after 0.5 s: 2.5 tokens", "0.5 s: 2.5"], 2.5, 5, "sky"]], note: ["no timer thread: elapsed × rate, on each call", "elapsed × rate"] },
    { k: "OTP: 3 a minute", on: CALL, fl: FLOW, sub: { limiter: ["FixedWindow", "window"] }, tiles: [["1", "ok", "ok"], ["2", "ok", "ok"], ["3", "ok", "ok"], ["4", "bad", "no"]], figs: [["19.5 s", "retry_after", "warn"]] },
    { k: "the boundary flaw", kt: "bad", on: { limiter: "bad", clock: 1 }, figs: [["6", ["fixed window, in 2 s", "fixed, 2 s"], "bad"], ["3", ["sliding log, in 2 s", "sliding, 2 s"], "ok"]], note: ["3 just before the edge + 3 just after", "3 before + 3 after"] },
  ],
  race: [
    {
      k: "two races",
      kt: "warn",
      on: { client: "warn", registry: 1, limiter: 1 },
      fl: [["client", "registry", "warn"]],
      chips: [["both read 1 token left", "both read 1 left"], ["two first requests, two buckets", "two buckets"], ["→ a lock per limiter", "lock per limiter"], ["→ check again under the lock", "double check"]],
      ctn: ["bad", "bad", "ok", "ok"],
    },
    { k: "20 threads, 50 tokens", kt: "ok", on: { ...CALL, limiter: "ok" }, fl: FLOW, figs: [["2,000", "attempts"], ["50", "allowed", "ok"], ["0", ["extra let through", "extra"], "ok"]] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["sliding counter: O(1) memory", "sliding counter"], ["a @rate_limited decorator", "decorator"], ["Retry-After headers", "headers"], ["20 servers: Redis + Lua", "Redis + Lua"]],
      ct: "ok",
      note: ["each one behind the same interface", "same interface"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: the classes inside one process, not the distributed system. Three algorithms, one interface and a clock you control.", tween: 1200 },
      { caption: "Limit per client and endpoint, pick the rule by tier, say when to retry, let a request cost more than 1, and expect many threads.", tween: 1400 },
      { caption: "Every algorithm depends on time, so the clock is injected: monotonic in production, a FakeClock in tests that never sleep.", tween: 1200, loop: true },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "One interface, try_acquire(cost), returns a Decision: allowed, remaining and retry_after. Three algorithms implement it.", tween: 1200, loop: true },
      { caption: "Rules come from config: free search 5 a second, pro 50, OTP 3 a minute. A factory turns a rule's algorithm name into a limiter.", tween: 1400, loop: true },
      { caption: "The registry keeps one limiter per client and endpoint, created on first use, so each algorithm stays tiny with its own lock.", tween: 1200, loop: true },
    ],
  },
  {
    id: "burst",
    label: "A burst",
    steps: [
      { caption: "A free user sends 7 searches at once. The bucket of 5 allows five and rejects two, each with a retry_after.", tween: 1600, loop: true },
      { caption: "No timer thread: each call adds elapsed time × rate. After 0.5 s that's 2.5 tokens, so two more pass and the third fails.", tween: 1400, loop: true },
      { caption: "OTP uses a fixed window of 3 a minute. The fourth request fails, and retry_after says the window resets in 19.5 seconds.", tween: 1400, loop: true },
      { caption: "The fixed window's flaw: 3 just before the edge and 3 just after all pass within 2 seconds. The sliding log allows only 3.", tween: 1200 },
    ],
  },
  {
    id: "race",
    label: "Races & follow-ups",
    steps: [
      { caption: "Two races: two threads both reading 1 token left, and two first requests creating two buckets. A lock each, and a second check.", tween: 1400, loop: true },
      { caption: "The demo fires 2,000 attempts from 20 threads at a bucket of 50 with no time passing: exactly 50 are allowed.", tween: 1400, loop: true },
      { caption: "Follow-ups: a sliding window counter for memory, a decorator, standard headers, and a Redis limiter behind the same interface.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
