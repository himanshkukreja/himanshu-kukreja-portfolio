/**
 * Whole-lesson overview (week 11 preview, "Designing AI systems"): a demo vs a production AI
 * feature; Weeks 1-10 still apply; the six new failure modes and how the questions change; the
 * running example, MegaMart Assist (60,000 conversations a day, ~6 turns, 15% in the peak hour,
 * the constraints, and the 900-requests-a-minute warm-up); and the five days plus the capstone, on
 * one MegaMart Assist map shared with the week's other overviews.
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
  assist: nd(1, 0, "Assist"),
  gw: nd(2, 0, "LLM gateway", "Gateway"),
  llm: nd(3, 0, "Provider"),
  human: nd(0, 1, "Humans"),
  ret: nd(1, 1, "Retrieval", "Retrieve"),
  cache: nd(2, 1, "Caches"),
  guard: nd(3, 1, "Guardrails"),
  ing: nd(0, 2, "Ingest"),
  idx: nd(1, 2, "Vector index", "Index"),
  tools: nd(2, 2, "Order tools", "Tools"),
  evals: nd(3, 2, "Evals"),
};
const E: Ed[] = [
  ["cust", "assist"],
  ["assist", "gw"],
  ["gw", "llm"],
  ["assist", "human", 12, 0],
  ["assist", "ret"],
  ["ret", "idx"],
  ["ing", "idx"],
  ["gw", "cache"],
  ["llm", "guard"],
  ["guard", "evals"],
  ["assist", "tools", 14, 0],
];

const F: Record<string, Fr[]> = {
  why: [
    {
      k: ["a demo calls a model once", "demo vs product"],
      on: { cust: "lit", assist: 1, gw: 1, llm: "lit" },
      fl: [
        ["cust", "assist"],
        ["assist", "gw"],
        ["gw", "llm"],
      ],
      chips: [
        ["one call → millions, RPM and TPM", "millions of calls"],
        ["\"a few seconds\" → TTFT at p95", "TTFT, TPOT at p95"],
        ["rounding error → a bill per word", "a bill per word"],
        ["3 examples checked → evals", "evals, not anecdotes"],
        ["your input → strangers' input", "strangers' input"],
        ["documents, tools: instructions", "docs: instructions"],
      ],
      ctn: ["warn", "warn", "warn", "bad", "bad", "bad"],
      note: ["AI features are distributed systems with new failure modes", "new failure modes"],
    },
    {
      k: ["weeks 1–10 still apply", "weeks 1–10 apply"],
      kt: "ok",
      on: { assist: "lit", gw: "ok", cache: "ok", ret: 1, idx: 1, human: 1 },
      cols: 3,
      chips: ["timeouts", "idempotency", "queues", "caches", "rate limits", "SLOs"],
      ctn: ["ok", "ok", "ok", "ok", "ok", "ok"],
      note: ["what's new is the dependency at the centre, and the ways it fails", "new: the dependency at the centre"],
    },
  ],
  fail: [
    {
      k: ["failure modes 1–3", "modes 1–3"],
      kt: "warn",
      on: { assist: 1, gw: "warn", llm: "bad" },
      sub: { llm: "slow, metered", gw: "tokens in, out" },
      fl: [
        ["assist", "gw", "warn"],
        ["gw", "llm", "warn"],
      ],
      cols: 1,
      chips: [
        ["1 · a slow dependency: a reply is written token by token (Day 1)", "1 · slow: token by token"],
        ["2 · a bill that scales with words: history re-sent (Days 1, 5)", "2 · a bill per word"],
        ["3 · wrong but fluent: it answers anyway (Days 3, 4)", "3 · wrong but fluent"],
      ],
      ctn: ["warn", "warn", "bad"],
      note: ["a classic dependency is fast, cheap, deterministic, loud; a model isn't", "a model is none of those"],
    },
    {
      k: ["failure modes 4–6", "modes 4–6"],
      kt: "bad",
      on: { cust: "bad", ret: 1, idx: "warn", ing: "warn", guard: "bad", evals: "warn" },
      fl: [["ing", "idx", "warn"]],
      cols: 1,
      chips: [
        ["4 · input that's instructions: messages, documents, tools (Day 4)", "4 · input as instructions"],
        ["5 · a stale index: only what was last indexed (Days 2, 3)", "5 · a stale index"],
        ["6 · quality you can't unit-test: replies vary (Day 4)", "6 · can't unit-test it"],
      ],
      ctn: ["bad", "warn", "warn"],
      note: ["\"ignore your instructions\" can arrive in any text it reads", "\"ignore your instructions\""],
    },
    {
      k: ["how the questions change", "new questions"],
      on: { gw: "lit", llm: 1, evals: "lit", guard: 1 },
      chips: [
        ["requests/s → tokens a minute", "→ tokens a minute"],
        ["p99 → first word, then pace", "→ first word, pace"],
        ["servers → cost per conversation", "→ cost per conversation"],
        ["correct? → how often it's right", "→ how often right"],
        ["who may call → what text can do", "→ what text can do"],
      ],
      ctn: ["lit", "lit", "lit", "lit", "lit"],
      note: ["cost by model and by language; evals give a rate, not a yes or no", "evals give a rate"],
    },
  ],
  assist: [
    {
      k: ["design MegaMart Assist", "MegaMart Assist"],
      on: { cust: "lit", assist: "lit", ret: "lit", tools: "lit", human: "lit", gw: 1, llm: 1 },
      sub: { assist: "answers, acts", ret: "cited answers", human: "handoff", tools: "confirm first" },
      fl: [
        ["cust", "assist"],
        ["assist", "ret"],
        ["assist", "tools"],
        ["assist", "human"],
      ],
      chips: [
        ["answers from policies, cited", "answers, cited"],
        ["looks up, acts after confirming", "acts after confirming"],
        ["hands off with a summary", "hands off to a human"],
        ["English and Hindi, app and web", "English and Hindi"],
        ["streams its replies", "streams replies"],
      ],
      ctn: ["lit", "lit", "sky", "ok", "ok"],
      note: ["MegaMart is Week 2's flash-sale retailer; the capstone builds it whole", "Week 2's retailer"],
    },
    {
      k: ["illustrative scale and constraints", "scale"],
      on: { cust: "lit", assist: "lit", gw: "lit", llm: 1 },
      fl: [
        ["cust", "assist"],
        ["assist", "gw"],
      ],
      figs: [
        ["60,000", ["conversations a day", "a day"], "lit"],
        ["~6", ["customer turns each", "turns each"], "sky"],
        ["15%", ["in the evening peak hour", "peak hour"], "warn"],
      ],
      note: ["first words in ~1 s; never invent a policy or act on another's order", "first words in ~1 s"],
    },
    {
      k: ["900 requests a minute, still 429s", "tokens hit first"],
      kt: "warn",
      on: { assist: 1, gw: "warn", llm: "warn" },
      sub: { gw: "tokens bind", llm: "RPM, ITPM, OTPM" },
      fl: [
        ["assist", "gw", "warn"],
        ["gw", "llm", "warn"],
      ],
      figs: [
        ["900", ["requests a minute", "requests/min"], "ok"],
        ["TPM", ["tokens a minute: the limit", "the real limit"], "bad"],
      ],
      note: ["every turn re-sends a long prompt and the history (Day 1)", "re-sent prompt and history"],
    },
  ],
  week: [
    {
      k: ["Day 1 · LLM serving", "Day 1 · serving"],
      on: { assist: 1, gw: "lit", llm: "lit" },
      sub: { gw: "admit by tokens", llm: "TTFT · TPOT" },
      fl: [
        ["assist", "gw"],
        ["gw", "llm"],
      ],
      chips: [
        ["tokens and the context window", "tokens, context"],
        ["prefill, decode: TTFT and TPOT", "TTFT and TPOT"],
        ["batching and the KV cache", "batching, KV cache"],
        ["streaming through your stack", "streaming"],
        ["rate limits, 429s, spend caps", "limits, spend caps"],
        ["the cost arithmetic", "cost arithmetic"],
      ],
      ct: "lit",
      note: ["\"the model is a slow, metered, token-limited dependency\"", "slow, metered, token-limited"],
    },
    {
      k: ["Day 2 · embeddings, vector search", "Day 2 · vectors"],
      on: { assist: 1, ret: "lit", idx: "lit" },
      sub: { idx: "HNSW, IVF, PQ", ret: "hybrid search" },
      fl: [
        ["assist", "ret"],
        ["ret", "idx"],
      ],
      chips: [
        ["text to vectors, similarity", "text to vectors"],
        ["HNSW, IVF, product quantisation", "HNSW, IVF, PQ"],
        ["recall@k vs latency", "recall vs latency"],
        ["filters: before, during, after", "where filters run"],
        ["BM25 + vectors, fused", "hybrid search"],
        ["choosing and sizing a store", "sizing a store"],
      ],
      ct: "sky",
      note: ["\"find what the customer meant, not what they typed\"", "meant, not typed"],
    },
    {
      k: ["Day 3 · RAG systems", "Day 3 · RAG"],
      on: { ing: "lit", idx: "lit", ret: "lit", assist: 1, llm: 1, gw: 1 },
      sub: { ing: "chunk" },
      fl: [
        ["ing", "idx"],
        ["idx", "ret"],
        ["ret", "assist"],
      ],
      chips: [
        ["retrieve, generate, cite", "retrieve, generate, cite"],
        ["chunking and ingestion", "chunking"],
        ["freshness: CMS change events", "freshness"],
        ["reranking, a token budget", "reranking"],
        ["citations and grounding", "citations"],
        ["permission-aware retrieval", "permissions"],
      ],
      ct: "ok",
      note: ["\"the answer is only as good as what you retrieved\"", "only as good as retrieval"],
    },
    {
      k: ["Day 4 · evaluation, guardrails", "Day 4 · evals"],
      on: { llm: 1, guard: "lit", evals: "lit", human: 1 },
      sub: { guard: "injection, PII", evals: "golden sets" },
      fl: [
        ["llm", "guard"],
        ["guard", "evals"],
      ],
      chips: [
        ["golden sets, offline evals", "golden sets"],
        ["LLM-as-judge, calibrated", "LLM-as-judge"],
        ["canaries and A/B tests", "canaries, A/B"],
        ["prompt injection, exfiltration", "prompt injection"],
        ["PII: redact, log, retain", "PII"],
        ["fallbacks: model, cache, human", "fallbacks"],
      ],
      ct: "warn",
      note: ["\"you can't unit-test a sentence, so measure it\"", "measure it"],
    },
    {
      k: ["Day 5 · cost, caching, operations", "Day 5 · operate"],
      on: { assist: 1, gw: "lit", cache: "lit", llm: 1 },
      sub: { cache: "prompt + answer", gw: "routing" },
      fl: [
        ["assist", "gw"],
        ["gw", "cache"],
      ],
      chips: [
        ["prompt (prefix) caching", "prompt caching"],
        ["semantic caching, and its risks", "semantic caching"],
        ["routing: a cheap model first", "cheap model first"],
        ["batch APIs: nobody waiting", "batch APIs"],
        ["budgets that degrade first", "budget governors"],
        ["traces, cost per conversation", "traces, cost"],
      ],
      ct: "lit",
      note: ["runbooks: outages, 429 storms, runaway loops, prompt regressions", "runbooks for incidents"],
    },
    {
      k: ["capstone · the whole assistant", "capstone"],
      kt: "ok",
      on: { cust: "lit", assist: "lit", gw: 1, llm: 1, ret: 1, idx: 1, ing: 1, tools: "ok", human: "ok", guard: 1, cache: 1, evals: 1 },
      sub: { tools: "confirm first", human: "summary" },
      fl: [
        ["cust", "assist"],
        ["assist", "ret"],
        ["assist", "tools", "ok"],
        ["assist", "human", "ok"],
        ["assist", "gw"],
      ],
      chips: [
        ["RAG with citations", "RAG, cited"],
        ["look up an order, start a return", "order tools"],
        ["refund within policy, confirmed", "confirmed refunds"],
        ["handoff with a summary", "human handoff"],
        ["estimate tokens, cost, limits", "tokens, cost, limits"],
        ["SLOs and dashboards", "SLOs, dashboards"],
      ],
      ctn: ["lit", "ok", "ok", "sky", "lit", "sky"],
      note: ["the model is one component; the checks that matter sit outside it", "checks outside the model"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "Demo vs product",
    steps: [
      {
        caption:
          "A demo calls a model once with one happy prompt. A product calls it millions of times under request and token limits, measures time to first token at p95, pays for every word in and out, needs evals rather than three checked examples, and takes input from strangers, documents and tools that can carry instructions.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Everything from Weeks 1 to 10 still applies: timeouts, idempotency, queues, caches, rate limits and SLOs. What's new is the dependency at the centre, and the ways it fails. This week builds products on top of a model, not the model or the vendor's GPU fleet (side quest 14).",
        tween: 1400,
      },
    ],
  },
  {
    id: "fail",
    label: "New failure modes",
    steps: [
      {
        caption:
          "A classic dependency is fast, cheap per call, deterministic and fails loudly; a model is none of those. The first three failure modes: a slow dependency that writes token by token, a bill that scales with every word (a chat re-sends its history each turn), and answers that are wrong but fluent.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The other three: input that's really instructions, since a customer message, a retrieved document or a tool result can say \"ignore your instructions\"; an index that goes stale, because the model answers from what was last indexed; and quality you can't unit-test, as the same prompt gives different replies.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The questions change: tokens a minute in and out, not requests a second; how long to the first word and how fast after, not just p99; cost per conversation by model and language; how often the answer is right, as a rate; and what a message, document or tool result can make it do.",
        tween: 1400,
      },
    ],
  },
  {
    id: "assist",
    label: "MegaMart Assist",
    steps: [
      {
        caption:
          "The week's running example: MegaMart, the retailer from Week 2's flash sale, builds an assistant that answers order, return, refund and delivery questions from its policies with citations, looks things up and acts after the customer confirms, hands hard cases to a human with a summary, and streams replies in English and Hindi.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Illustrative scale: 60,000 conversations a day of ~6 customer turns, 15% of them in the evening peak hour, more on sale days. First words must appear in about a second, at a cost the support budget can carry; it must never invent a policy, act on another customer's order or leak personal data, and must survive the provider's bad evening.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Warm-up: at 900 requests a minute, MegaMart Assist can still hit the provider's rate limit, because providers also limit tokens per minute and every turn re-sends a long prompt and the history. Tokens hit the limit long before requests do (Day 1).",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "week",
    label: "Five days",
    steps: [
      {
        caption:
          "Day 1, LLM serving: tokens and the context window, prefill and decode (time to first token and time per output token), batching and the KV cache, streaming through your own stack, rate limits and spend caps, and the cost arithmetic for MegaMart Assist.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 2, embeddings and vector search: text to vectors, approximate nearest-neighbour indexes (HNSW graphs, IVF clusters, product quantisation), recall against latency, metadata filters before, during or after the search, BM25 plus vectors in one ranking, and choosing and sizing a store.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 3, RAG systems: the retrieve, assemble, generate and cite loop; chunking and a pipeline from the help-centre CMS; freshness when a policy changes; reranking and a context token budget; citations and grounding; and retrieval that respects permissions.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 4, evaluation and guardrails: golden sets and metrics, a model grading a model and calibrating it against people, canaries and A/B tests, prompt injection directly and through documents or tool results, PII redaction and retention, grounding checks, and fallbacks to another model, a cached answer or a human.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 5, cost, caching and operations: prompt and semantic caching, model routing and cascades, batch APIs for work nobody waits for, budgets that degrade before they cut off, traces and cost per conversation, and runbooks for provider outages, 429 storms, runaway loops and prompt regressions.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The capstone designs the whole of MegaMart Assist in interview format: RAG over help articles with citations, tools that look up an order, start a return and issue a refund within policy after the customer confirms, human handoff, then estimates, deep dives, SLOs and dashboards. The model is one component, not the system.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
