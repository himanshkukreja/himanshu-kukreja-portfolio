/**
 * Whole-lesson overview (week 11, day 1 · LLM serving: tokens, latency and cost). MegaMart Assist's
 * illustrative launch evening (a buffered stream, the 20:00 ITPM 429s, an error after 180 tokens,
 * turn 25 re-sending ~10,500 tokens, an input-heavy bill); prefill and decode; tokens by model and
 * language; the growing conversation (turn 20: 8,950; 20 turns ~120,000 vs 6 turns ~23,000);
 * latency = TTFT + TPOT × output; batching (4× / 14×, Orca 36.9×), the KV cache (~110 vs ~18
 * sequences), API vs vLLM; streaming through proxies and the error after the 200; the 20:00 retry
 * storm, admission by tokens, 23,010 input vs 1,500 output (78% system prompt, ~$0.061 a
 * conversation), Start-tier limits (ITPM 173%) and spend caps.
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
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

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
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
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
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
  cust: nd(0, 0, "Customer", "Cust"),
  edge: nd(1, 0, "Edge proxy", "Proxy"),
  assist: nd(2, 0, "Assist"),
  gw: nd(3, 0, "LLM gateway"),
  hist: nd(1, 1, "History"),
  buck: nd(2, 1, "Buckets"),
  prov: nd(3, 1, "Provider"),
  dash: nd(1, 2, "Dashboards", "Charts"),
  use: nd(2, 2, "Usage"),
  gpu: nd(3, 2, "GPUs · KV cache", "KV cache"),
};
const E: Ed[] = [
  ["cust", "edge"],
  ["edge", "assist"],
  ["assist", "gw"],
  ["assist", "hist", 12, 0],
  ["gw", "buck", 12, 0],
  ["gw", "prov"],
  ["prov", "gpu"],
  ["buck", "use"],
  ["use", "dash"],
];

const F: Record<string, Fr[]> = {
  evening: [
    {
      k: ["sale evening · Assist goes live", "launch evening"],
      kt: "warn",
      on: { cust: "lit", edge: "bad", assist: 1, gw: "warn", prov: "bad", hist: "warn" },
      sub: { edge: "buffers", prov: "429 · overload", hist: "half a reply" },
      fl: [["cust", "edge"]],
      chips: [
        ["19:42 · 6 s spinner, then all", "19:42 · buffered"],
        ["20:00 · ITPM limit hit, 429s", "20:00 · 429 storm"],
        ["20:07 · error after 180 tokens", "20:07 · 180 tokens"],
        ["20:30 · turn 25: ~10,500 tokens", "20:30 · ~10,500 a turn"],
        ["morning · bill is mostly input", "bill: mostly input"],
        ["morning · Hindi costs more", "Hindi costs more"],
      ],
      ctn: ["warn", "bad", "bad", "warn", "warn", "warn"],
      note: ["none is a model-quality problem: a model call isn't an API call", "not a model-quality problem"],
    },
    {
      k: ["prefill, then decode", "prefill, then decode"],
      on: { assist: 1, gw: 1, prov: "lit", gpu: "lit" },
      sub: { prov: "prefill · decode", gpu: "one token a step" },
      fl: [
        ["assist", "gw"],
        ["gw", "prov"],
      ],
      chips: [
        ["prefill: all input, one pass", "prefill: one pass"],
        ["decode: one token per step", "decode: 1 token/step"],
        ["priced per input, output token", "priced per token"],
        ["limited in requests and tokens", "RPM and tokens"],
        ["same prompt, different replies", "different replies"],
        ["fails quietly: fluent and wrong", "fluent, wrong"],
      ],
      ctn: ["sky", "lit", "warn", "warn", "sky", "bad"],
      note: ["duration, memory and price all grow with the tokens in and out", "cost grows with tokens"],
    },
  ],
  tokens: [
    {
      k: ["tokens differ by model and language", "what a token is"],
      on: { assist: "lit", gw: 1 },
      sub: { assist: "count first", gw: "provider's tokenizer" },
      chips: [
        ["~4 characters a token (Gemini)", "~4 chars a token"],
        ["Claude 4.7+: ~30% more tokens", "4.7+: ~30% more"],
        ["languages: up to 15× apart", "languages: up to 15×"],
        ["a small image: 258 tokens", "image: 258 tokens"],
      ],
      ctn: ["sky", "warn", "bad", "sky"],
      note: ["compare cost per task, not price per token; bill from usage", "compare cost per task"],
    },
    {
      k: ["the conversation that grows", "history grows"],
      kt: "warn",
      on: { assist: "lit", hist: "warn", gw: 1 },
      sub: { hist: "every turn" },
      fl: [
        ["hist", "assist", "warn"],
        ["assist", "gw"],
      ],
      bars: [
        [["6 turns · ~23,000 input", "6 turns · ~23,000"], 23000, 120000, "sky"],
        [["turn 20 alone · 8,950", "turn 20 · 8,950"], 8950, 120000, "warn"],
        [["20 turns · ~120,000 input", "20 turns · ~120,000"], 120000, 120000, "bad"],
      ],
      note: ["the model is stateless: 3.3× the turns, 5.2× the input", "3.3× turns, 5.2× input"],
    },
    {
      k: ["latency = TTFT + TPOT × output", "TTFT + TPOT × output"],
      on: { cust: "lit", edge: 1, assist: 1, gw: 1, prov: "lit" },
      fl: [
        ["prov", "gw"],
        ["gw", "assist"],
        ["assist", "edge"],
        ["edge", "cust"],
      ],
      figs: [
        ["0.8 s", ["TTFT: first words", "TTFT"], "ok"],
        ["20 ms", ["TPOT: each next token", "TPOT"], "sky"],
        ["~5 s", ["decode, 250 tokens", "250-token decode"], "warn"],
      ],
      note: ["output length dominates: queue + prefill set TTFT, decode the rest", "output length dominates"],
    },
    {
      k: ["which change buys more speed?", "which change wins?"],
      on: { assist: "lit", prov: 1 },
      bars: [
        [["now · 4,000 in, 400 out · ~8.8 s", "now · ~8.8 s"], 8.8, 8.8, "warn"],
        [["A · halve the prompt · 1–5%", "A · half prompt: 1–5%"], 8.6, 8.8, "sky"],
        [["B · reply ~200 · ~4 s less", "B · short reply: −4 s"], 4.8, 8.8, "ok"],
      ],
      note: ["latency is an output problem; cost and limits are often input", "latency: an output problem"],
    },
  ],
  gpu: [
    {
      k: ["why providers batch", "why providers batch"],
      on: { gw: 1, prov: "lit", gpu: "lit" },
      sub: { gpu: "batch 1 → 64" },
      fl: [["prov", "gpu"]],
      figs: [
        ["4×", ["latency, batch 1 → 64", "latency"], "warn"],
        ["14×", ["throughput", "throughput"], "ok"],
      ],
      note: ["MPT-7B on one A100 (Databricks): others' load raises your TPOT", "others' load raises TPOT"],
    },
    {
      k: ["static vs continuous batching", "continuous batching"],
      kt: "ok",
      on: { prov: "lit", gpu: "ok" },
      sub: { gpu: "scheduled every step" },
      fl: [["prov", "gpu", "ok"]],
      chips: [
        ["static: waits for the longest", "static: longest reply"],
        ["new requests wait: TTFT grows", "new ones wait"],
        ["continuous: swap every step", "joins every step"],
        ["Orca: 36.9× at same latency", "Orca: 36.9×"],
        ["Anyscale: 8×, 23× with vLLM", "Anyscale: 8×, 23×"],
      ],
      ctn: ["bad", "bad", "ok", "ok", "ok"],
    },
    {
      k: ["the KV cache: tokens resident", "tokens resident"],
      kt: "warn",
      on: { prov: 1, gpu: "warn" },
      sub: { gpu: "~450,000 tokens" },
      bars: [
        [["4,000-token turns · ~110 fit", "4,000 · ~110 fit"], 110, 110, "ok"],
        [["+ order history, 24,000 · ~18", "24,000 · ~18 fit"], 18, 110, "bad"],
      ],
      note: ["70B, 4 GPUs: ~148 GB of KV at ~0.33 MB a token · retrieve, don't paste", "retrieve, don't paste"],
    },
    {
      k: ["vendor API or vLLM?", "API or self-host"],
      on: { gw: "lit", prov: "lit", gpu: "sky" },
      sub: { prov: "per token, rate limits", gpu: "your GPUs, GPU-hours" },
      fl: [
        ["gw", "prov"],
        ["prov", "gpu", "sky"],
      ],
      chips: [
        ["API: per token, no idle cost", "API: per token"],
        ["self-host: GPU-hours, idle too", "self: GPU-hours"],
        ["API: overload errors at peaks", "API: peak overloads"],
        ["vLLM: OpenAI-compatible API", "vLLM: same API"],
        ["self-host: data stays in", "data stays in"],
        ["a gateway: change it in one place", "one gateway"],
      ],
      ctn: ["sky", "warn", "warn", "ok", "ok", "lit"],
      note: ["many teams use both: an API for hard work, a small model for volume", "often both"],
    },
  ],
  stream: [
    {
      k: ["stream it end to end", "stream it"],
      kt: "ok",
      on: { cust: "ok", edge: "lit", assist: "lit", gw: "lit", prov: "lit" },
      fl: [
        ["prov", "gw", "ok"],
        ["gw", "assist", "ok"],
        ["assist", "edge", "ok"],
        ["edge", "cust", "ok"],
      ],
      figs: [
        ["~5.8 s", ["wait, not streamed", "not streamed"], "bad"],
        ["~0.8 s", ["first words, streamed", "streamed"], "ok"],
      ],
      note: ["SSE: message_start, deltas, message_delta with usage, message_stop", "usage arrives last"],
    },
    {
      k: ["every hop can break the stream", "every hop"],
      kt: "warn",
      on: { cust: 1, edge: "warn", assist: "lit", gw: 1 },
      sub: { edge: "buffering off", assist: "relay + pings" },
      fl: [
        ["assist", "edge"],
        ["edge", "cust"],
      ],
      chips: [
        ["proxy_buffering on: the spinner", "buffering: spinner"],
        ["fix: X-Accel-Buffering: no", "X-Accel-Buffering: no"],
        ["idle 60 s: ping every 15 s", "ping every 15 s"],
        ["customer left: cancel upstream", "left: cancel"],
        ["save every reply's stop reason", "save stop reason"],
      ],
      ctn: ["bad", "ok", "warn", "ok", "ok"],
    },
    {
      k: ["20:07 · an error after the 200", "an error after the 200"],
      kt: "bad",
      on: { cust: "warn", assist: "lit", gw: 1, prov: "bad", hist: "lit" },
      sub: { prov: "overloaded_error", hist: "interrupted", cust: "180 tokens" },
      fl: [
        ["prov", "gw", "bad"],
        ["gw", "assist", "bad"],
        ["assist", "hist"],
      ],
      chips: [
        ["200 sent; 180 tokens on screen", "180 tokens shown"],
        ["tell the browser: interrupted", "event: interrupted"],
        ["store as interrupted, not done", "store: interrupted"],
        ["back off, jitter, then continue", "back off, continue"],
        ["or regenerate on a fallback", "or regenerate"],
        ["continuing re-sends the prompt", "re-sends the prompt"],
      ],
      ctn: ["warn", "lit", "ok", "ok", "sky", "warn"],
    },
  ],
  cost: [
    {
      k: ["20:00 · the 429 storm", "20:00 · 429 storm"],
      kt: "bad",
      on: { assist: "bad", gw: "bad", prov: "bad", buck: "warn" },
      fl: [
        ["assist", "gw", "bad"],
        ["gw", "prov", "bad"],
      ],
      figs: [
        ["~3.45M", ["input tokens a minute", "ITPM needed"], "bad"],
        ["2M", ["ITPM limit", "ITPM limit"], "warn"],
        ["4×", ["attempts, 3 retries", "attempts"], "bad"],
      ],
      note: ["requests per minute were fine: tokens bound first", "tokens bind, not requests"],
    },
    {
      k: ["admit by tokens, in the gateway", "admit by tokens"],
      kt: "ok",
      on: { assist: "lit", gw: "ok", buck: "ok", prov: 1, use: "lit" },
      sub: { buck: "input · output", gw: "count, admit, meter" },
      fl: [
        ["assist", "gw"],
        ["gw", "buck", "ok"],
        ["gw", "prov"],
        ["buck", "use"],
      ],
      chips: [
        ["shared buckets: ITPM, OTPM", "ITPM, OTPM buckets"],
        ["honour retry-after, with jitter", "retry-after + jitter"],
        ["interactive lane first", "interactive first"],
        ["deadlines, then degrade", "deadline, degrade"],
        ["retry before the first byte", "retry before 1st byte"],
        ["spend-cap 429: no retry-after", "spend cap: page"],
      ],
      ctn: ["ok", "ok", "lit", "sky", "ok", "bad"],
    },
    {
      k: ["one conversation, in tokens", "per conversation"],
      on: { gw: 1, buck: 1, use: "lit", dash: "lit" },
      sub: { use: "usage per call", dash: "by language" },
      fl: [
        ["buck", "use"],
        ["use", "dash"],
      ],
      bars: [
        [["input · 23,010 tokens", "input · 23,010"], 23010, 23010, "warn"],
        [["of it, system prompt · 78%", "prompt · 78%"], 18000, 23010, "lit"],
        [["output · 1,500 tokens", "output · 1,500"], 1500, 23010, "sky"],
      ],
      note: ["Sonnet 5.5 at $2 in, $10 out: ~$0.061 a conversation, input ≈ 75%", "~$0.061 each · input ≈ 75%"],
    },
    {
      k: ["Start tier at the peak", "Start tier at peak"],
      kt: "warn",
      on: { gw: "warn", buck: "warn", prov: 1 },
      bars: [
        [["RPM · 900 of 1,000 · 90%", "RPM · 90%"], 90, 173, "ok"],
        [["ITPM · 3.45M of 2M · 173%", "ITPM · 173%"], 173, 173, "bad"],
        [["OTPM · 225K of 400K · 56%", "OTPM · 56%"], 56, 173, "sky"],
      ],
      note: ["Start's $500 cap lasts ~3 h, Build's $1,000 ~7 h: it needs Scale", "spend: it needs Scale"],
    },
    {
      k: ["the levers are on the input side", "input-side levers"],
      kt: "ok",
      on: { assist: "ok", gw: "ok", hist: "ok", prov: 1 },
      sub: { hist: "budgeted" },
      chips: [
        ["a history budget per feature", "history budget"],
        ["retrieve, don't paste (Day 3)", "retrieve (Day 3)"],
        ["a cacheable fixed prefix (Day 5)", "cached prefix (Day 5)"],
        ["raise the tier before the sale", "raise the tier early"],
      ],
      ctn: ["ok", "ok", "ok", "lit"],
      note: ["~87 streams at peak is easy; under 2M input tokens a minute is not", "87 streams: easy · 2M ITPM: not"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "evening",
    label: "Launch evening",
    steps: [
      {
        caption:
          "An illustrative sale evening as MegaMart Assist goes live: an edge proxy buffers the stream into a 6 s spinner, input tokens per minute hit the limit at 20:00, an error lands after 180 tokens, and a turn-25 conversation re-sends ~10,500 tokens. None of it is model quality.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A model reads every input token in one parallel pass (prefill), then writes the reply one token per step (decode). Its duration, memory and price grow with the tokens in and out, it's limited in requests and tokens, and it can fail quietly with a fluent, wrong answer.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "tokens",
    label: "Tokens & time",
    steps: [
      {
        caption:
          "A token is about 4 characters of English, but each model family has its own tokenizer (Claude 4.7 and later produce ~30% more for the same text), the same text can differ up to 15× across languages, and a small image is 258 tokens. Count with the provider's tokenizer; bill from usage.",
        tween: 1400,
      },
      {
        caption:
          "The model is stateless, so every turn re-sends the 3,000-token prompt and the history: turn k sends 3,060 + (k − 1) × 310 tokens. Turn 20 alone is 8,950; a 20-turn conversation sends ~120,000 against ~23,000 for 6 turns, 5.2× the input for 3.3× the turns.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Time to first token (TTFT) covers queueing, prefill and the network; time per output token (TPOT) is decode. A 250-token reply at 20 ms a token is ~5 s of decode against under a second of TTFT, so output length dominates.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A turn with a 4,000-token prompt and a 400-token reply: decode is 399 × 20 ms ≈ 8 s of ~8.8 s. Capping the reply near 200 tokens saves ~4 s (about 45%); halving the prompt saves 1–5%, though input is usually most of the bill and the first limit hit.",
        tween: 1400,
      },
    ],
  },
  {
    id: "gpu",
    label: "Batching & KV",
    steps: [
      {
        caption:
          "A decode step that serves 64 sequences reads the weights once for all of them. Databricks measured MPT-7B on one A100 from batch 1 to 64: latency up 4×, throughput up 14×. That's why your TPOT worsens when everyone else's traffic peaks.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Static batching ends a batch when its longest reply ends, so short replies' slots idle and new requests wait. Continuous batching schedules every decode step: Orca reported 36.9× the throughput at the same latency, and Anyscale saw 8× (23× with vLLM's memory work).",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Prefill keeps a key and value per token per layer in GPU memory, so concurrency is set by tokens resident, not requests. A self-hosted 70B replica holds ~450,000 tokens: ~110 turns of 4,000 tokens, but only ~18 if every prompt pastes a 20,000-token order history.",
        tween: 1400,
      },
      {
        caption:
          "Behind a vendor API all this is the provider's problem: per-token prices, no idle cost, rate limits and overloads at peaks. Self-hosted (vLLM serves an OpenAI-compatible API) you pay GPU-hours busy or idle and keep data in. A gateway lets the choice change in one place.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "stream",
    label: "Streaming",
    steps: [
      {
        caption:
          "Without streaming the customer waits ~5.8 s; with it they read from ~0.8 s. Providers stream server-sent events: message_start, text deltas, a message_delta carrying the stop reason and cumulative usage, then message_stop. The status comes first, the usage last.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Your relay re-streams through every proxy. nginx buffers by default (the 19:42 spinner), so send X-Accel-Buffering: no; it closes a silent connection after 60 s, so send SSE heartbeats every 15 s; cancel upstream when the customer leaves; and save each reply with how it ended.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Rohan's reply gets an overloaded_error event after 180 tokens, but the browser already has a 200. Tell it in-band with an interrupted event, store the partial as interrupted (never as the answer), then after backoff with jitter continue from the partial or regenerate; continuing pays for the prompt again.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "cost",
    label: "Limits & cost",
    steps: [
      {
        caption:
          "At 20:00 Assist needs ~3.45M input tokens a minute against a 2M ITPM limit, though requests are under theirs. Each app server retries a 429 at once, up to three times: up to 4× the attempts for the same demand, Week 2's retry storm.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The gateway admits by tokens: shared input and output buckets mirror the provider's, the interactive lane keeps a reserve, requests queue with a deadline then degrade, and retries go only before the first byte, honouring retry-after with jitter. A spend-cap 429 has no retry-after: retrying never helps, so page someone.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A 6-turn conversation sends 23,010 input tokens, 78% of them the repeated system prompt, and gets 1,500 back. At Sonnet 5.5's $2 in and $10 out per million that's ~$0.061 a conversation, ~$3,660 a day, ~$110,000 a month: output costs 5× more per token, yet input is ~75% of the bill.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "At the peak hour's ~900 turns a minute, the Start tier for Sonnet 5.5 is at 90% of its 1,000 RPM and 56% of its OTPM, but 173% of its 2M ITPM. Build's limits would carry it, yet spend binds too: Start's $500 cap lasts ~3 hours, Build's $1,000 ~7, so ~$110,000 a month needs Scale.",
        tween: 1400,
      },
      {
        caption:
          "Little's law gives ~87 streams open at the peak (15 a second × ~5.8 s), which is easy; staying under 2M input tokens a minute is not. So the levers are on the input side: a history budget, retrieval instead of pasting (Day 3), a cacheable fixed prefix (Day 5), and the tier raised before the sale.",
        tween: 1400,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
