/**
 * The whole side quest, ChatGPT serving: the mission and scale (1.2B weekly users, 2.5B prompts a
 * day, ~1 s to the first token), the estimate (~100K messages/s, 50M output tokens/s; 140 GB of
 * weights vs 148 GB of KV cache → ~225 sequences a replica; ~75,000 GPUs, ~115 MW, ~$2 per million
 * tokens), the path (edge → context → router → replica, tokens streamed back through a token log),
 * the deep dives (memory-bound decode, continuous batching and paged KV, tier lanes, cold starts,
 * resumable streams) and overload (a dead replica, the degradation ladder, launch day at 5×).
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
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
  const f = at(step, F[variant] || F[Object.keys(F)[0]]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
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
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  app: { x: 16, y: 96, w: 80, h: 52, l: "App" },
  gw: { x: 116, y: 40, w: 84, h: 40, l: "Quotas", n: "Quota" },
  edge: { x: 116, y: 96, w: 84, h: 52, l: "Edge" },
  safe: { x: 220, y: 40, w: 100, h: 40, l: "Safety", n: "Safe" },
  conv: { x: 220, y: 96, w: 100, h: 52, l: "Context", n: "Ctx" },
  hist: { x: 220, y: 156, w: 100, h: 40, l: "History", n: "Hist" },
  lanes: { x: 340, y: 40, w: 84, h: 40, l: "Lanes" },
  router: { x: 340, y: 96, w: 84, h: 52, l: "Router", n: "Route" },
  mini: { x: 340, y: 156, w: 84, h: 40, l: "Mini" },
  fleet: { x: 444, y: 40, w: 140, h: 40, l: "Fleet mgr", n: "Fleet" },
  rep: { x: 444, y: 96, w: 140, h: 52, l: "GPU replica", n: "GPUs" },
  log: { x: 444, y: 156, w: 140, h: 40, l: "Token log", n: "Log" },
};
const E: [string, string][] = [
  ["app", "edge"],
  ["edge", "gw"],
  ["edge", "conv"],
  ["conv", "safe"],
  ["conv", "hist"],
  ["conv", "router"],
  ["router", "lanes"],
  ["router", "mini"],
  ["router", "rep"],
  ["fleet", "rep"],
  ["rep", "log"],
];
const PATH = { app: 1, edge: 1, conv: 1, router: 1, rep: 1 } as const;
const ALL = { ...PATH, gw: 1, safe: 1, hist: 1, lanes: 1, mini: 1, fleet: 1, log: 1 } as const;
const BACK: [string, string, Tone?][] = [
  ["rep", "router", "ok"],
  ["router", "conv", "ok"],
  ["conv", "edge", "ok"],
  ["edge", "app", "ok"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "ChatGPT · the scale", on: { app: "lit", rep: 1 }, figs: [["1.2B", "weekly users"], ["2.5B", "prompts a day"], ["~1 s", ["to the first token", "first token"], "lit"]], note: ["then one token per step, for every reply in flight", "one token per step"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["first token < 1 s (paid)", "TTFT < 1 s"], ["< 50 ms per token", "TPOT < 50 ms"], ["no stall over 2 s", "no 2 s stalls"], ["fair across tiers", "fair tiers"], ["safety in the stream", "safety inline"], ["survive 5× launches", "5× launches"]],
      ctn: ["lit", "lit", undefined, undefined, "ok", "warn"],
    },
    { k: "count tokens, not requests", on: { ...PATH, rep: "lit" }, fl: [["app", "edge"], ["conv", "router"], ["router", "rep"]], figs: [["~100K/s", ["messages, peak", "msgs/s"]], ["50M/s", ["tokens out", "out/s"], "lit"], ["200M/s", ["tokens in", "in/s"]]], note: ["4.3B messages a day × 500 tokens out, 2,000 in", "500 out, 2,000 in each"] },
    {
      k: "what fills a replica",
      on: { rep: "lit" },
      sub: { rep: ["4 × H100", "4 GPUs"] },
      bars: [[["weights: 140 GB", "weights 140 GB"], 140, 320, "warn"], [["KV cache: 148 GB", "KV 148 GB"], 148, 320, "lit"], [["runtime: 32 GB", "runtime 32 GB"], 32, 320, "mute"]],
      note: ["0.33 MB of KV a token → ~225 conversations of 2,000", "→ ~225 conversations"],
    },
    { k: "the fleet", on: { rep: "lit", fleet: 1 }, figs: [["~75,000", ["H100-class GPUs", "GPUs"]], ["~115 MW", ["of power", "power"], "warn"], ["~$2", ["per M output tokens", "per M tokens"]]], note: ["~1,500 tokens a second per GPU, if one 70B model ran everything", "~1,500 tokens/s per GPU"] },
  ],
  arch: [
    { k: "1 · the message arrives", on: { app: 1, edge: "lit", gw: 1, conv: "lit", safe: 1, hist: 1 }, sub: { conv: ["2K tokens", "2K"] }, fl: [["app", "edge"], ["edge", "gw"], ["edge", "conv"], ["conv", "safe"], ["conv", "hist"]], note: ["auth, quota, input check, context assembly", "auth, quota, context"] },
    { k: "2 · route and admit", on: { conv: 1, router: "lit", lanes: 1, rep: "lit", mini: 1 }, sub: { router: ["prefix", "prefix"], rep: ["225 seqs", "225"] }, fl: [["conv", "router"], ["router", "lanes"], ["router", "rep"]], note: ["model, region, and the replica holding this prefix", "model, region, warm replica"] },
    { k: "3 · stream the tokens", kt: "ok", on: { ...PATH, app: "ok", rep: "lit", log: 1 }, sub: { rep: ["~35 ms/step", "35 ms"], app: ["words", "words"] }, fl: [...BACK, ["rep", "log"]], note: ["each step adds one token to every reply in the batch", "a token per step, for all"], nt: "ok" },
    { k: "4 · finish", on: { conv: 1, hist: "ok", rep: 1, log: "lit" }, sub: { log: ["for reconnects", "replay"], hist: ["saved", "saved"] }, fl: [["rep", "log"], ["conv", "hist", "ok"]], note: ["KV blocks freed the moment the reply ends", "KV blocks freed"] },
  ],
  deep: [
    { k: "1 · decode is memory-bound", on: { rep: "lit" }, bars: [[["1 user: ~95 tok/s, 0.3% busy", "1 user: 0.3% busy"], 95, 10500, "bad"], [["225 users: ~10,500 tok/s", "225: 10,500/s"], 10500, 10500, "ok"]], note: ["one read of the weights serves the whole batch: 110× more", "batching is the economics"], nt: "ok" },
    { k: "2 · batching and paged KV", on: { lanes: 1, rep: "lit" }, sub: { rep: ["per step", "step"] }, fl: [["router", "rep"]], chips: [["static: 1 of 8 for 97.5%", "static waste"], ["continuous: join each step", "continuous"], ["paged KV: 16-token blocks", "16-token blocks"], ["prefix cache: shared blocks", "prefix cache"]], ctn: ["bad", "ok", "ok", "ok"] },
    { k: "3 · lanes and quotas", on: { gw: 1, router: "lit", lanes: "lit", mini: 1, rep: 1 }, fl: [["router", "lanes"], ["router", "mini", "warn"]], cols: 3, chips: [["1 · paid", "paid"], ["2 · free", "free"], ["3 · background", "background"]], ctn: ["lit", "sky", "mute"], note: ["quotas in tokens · a busy warm replica overflows", "quotas in tokens"] },
    { k: "4 · GPUs start slowly", kt: "warn", on: { fleet: "warn", rep: 1 }, fl: [["fleet", "rep", "warn"]], figs: [["3–10 min", ["to start a replica", "cold start"], "warn"], ["70 s", ["140 GB at 2 GB/s", "weights"]], ["2 min", ["spot notice", "spot notice"]]], note: ["scale on the daily forecast, not on the queue", "scale on the forecast"] },
    { k: "5 · resumable streams", kt: "warn", on: { app: "warn", edge: 1, conv: 1, log: "lit", rep: 1 }, sub: { app: ["resume", "resume"], log: ["from 213", "213+"] }, fl: [["app", "edge", "warn"], ["rep", "log"]], note: ["Last-Event-ID 212 on any edge · Stop frees KV at the next step", "Last-Event-ID 212"] },
  ],
  scale: [
    { k: "a replica dies", kt: "bad", on: { router: "lit", rep: "bad", log: "lit", conv: 1, lanes: 1 }, sub: { rep: ["failed", "down"], log: ["225 replies", "225"] }, fl: [["conv", "router"], ["router", "lanes"]], note: ["resume each as a continuation: a 1–2 s pause", "resume: a 1–2 s pause"] },
    { k: "the degradation ladder", kt: "warn", on: { ...ALL, mini: "warn", lanes: "warn" }, cols: 3, chips: [["pause background", "pause batch"], ["shorter free replies", "shorter free"], ["fall back to mini", "mini model"], ["queue with an ETA", "honest ETA"], ["shed free, clearly", "shed free"]], ctn: [undefined, undefined, "warn", undefined, "bad"] },
    { k: "launch day at 5×", kt: "bad", on: { ...PATH, rep: "bad", fleet: "lit" }, fl: [["app", "edge", "bad"], ["fleet", "rep"]], figs: [["500/s", ["images, 8,000 GPUs", "capacity"]], ["2,500/s", "demand", "bad"], ["12,000", ["GPUs, batch paused", "GPUs"], "ok"]], note: ["paid at full quality · free in fast mode, 3 a day", "paid full · free fast, 3/day"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, router: "ok", rep: "ok" }, fl: [["conv", "router"], ["router", "rep"], ...BACK.slice(2)], chips: [["schedule by tokens", "tokens, not requests"], ["and by KV memory", "and KV memory"]], ct: "ok", note: ["overload becomes a choice, not a spinner", "a choice, not a spinner"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "ChatGPT: 1.2 billion weekly users, 2.5 billion prompts a day, and each reply must start in about a second, then stream one token at a time.", tween: 1400 },
      { caption: "First token in under 1 s for paid users and 2 s for free, then under 50 ms a token, no stalls over 2 s, fair tiers, and safety in the stream.", tween: 1400 },
      { caption: "Design for 4.3 billion messages a day: ~100,000 a second at peak. At 500 tokens out each that is 50 million a second, plus 200 million read in.", tween: 1400, loop: true },
      { caption: "A 70B model on 4 H100s: 140 GB of weights, 148 GB left for KV cache at 0.33 MB a token, about 225 conversations of 2,000 tokens.", tween: 1600 },
      { caption: "At ~1,500 output tokens a second per GPU, the fleet is ~75,000 H100-class GPUs and ~115 MW. All-in, about $2 per million output tokens.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Meera's message: the edge checks auth and quota, then the conversation service runs an input check and assembles a 2,000-token context.", tween: 1400, loop: true },
      { caption: "The router picks the model, region and replica, preferring the one that already holds this conversation's prefix; a tier lane admits it.", tween: 1200, loop: true },
      { caption: "Prefill reads the prompt, then every ~35 ms a decode step adds one token to each of ~225 replies. Tokens stream back as numbered events.", tween: 1400, loop: true },
      { caption: "A short token log keeps each reply in flight for reconnects. When it ends, its KV blocks are freed and the conversation is saved.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Decode is memory-bound: one user leaves 99.7% of the compute idle. 225 users share each read of the weights, so the replica writes 110× more.", tween: 1600 },
      { caption: "Static batching idles 7 of 8 slots for 97.5% of a batch. Continuous batching refills slots every step; paged KV hands out 16-token blocks.", tween: 1400, loop: true },
      { caption: "Lanes by tier: paid, then free, then background. Quotas count tokens, not requests, and a busy warm replica overflows to a cold one.", tween: 1200, loop: true },
      { caption: "A new replica takes 3 to 10 minutes: a machine, the image, ~70 s of weights, warm-up. So scale on the daily forecast, not on the queue.", tween: 1400, loop: true },
      { caption: "Wi-Fi drops at token 212: the app reconnects with Last-Event-ID 212 and the log resends from 213. Tapping Stop frees the KV blocks.", tween: 1200, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Overload & failure",
    steps: [
      { caption: "A GPU dies with 225 replies in flight. Each resumes on another replica from its context plus the tokens already streamed: a short pause.", tween: 1200, loop: true },
      { caption: "Overload, cheapest first: pause background work, shorten free replies, switch to the mini model, queue with an honest ETA, then shed free work.", tween: 1400 },
      { caption: "An image launch at 5× demand: 8,000 GPUs make 500 images a second. Pause background to reach 12,000; paid get full quality, free get fast mode.", tween: 1400, loop: true },
      { caption: "The lesson: schedule by tokens and KV memory, not requests. Then overload becomes a choice about who gets which model, not a spinner.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
