/**
 * Whole-lesson overview (week 11, day 5 · cost, caching and operations), on MegaMart Assist. Sale
 * week: a clock on line one, 429s at the peak, a 40-call loop, a 529 failover, 2.8× the forecast.
 * What you pay: four meters ($2 / $2.50 / $0.10 / $10 on Sonnet 5.5), 23,010 in and 1,500 out =
 * $0.061 a conversation, the 15-turn seller (~$0.19, ~3.2×). Prompt cache: stable-to-volatile
 * layout, the timestamp that kills it, ~3.45M vs ~290K counted input a minute, $0.061 → $0.022.
 * Caches and routing: semantic-cache false hits, the cascade (~95% break-even, ≈ $0.010 at 40%),
 * routing to $0.0096 (~$17,200 a month), the Batch API at half price. Budgets and failover: reserve
 * then settle, the spend ladder (80 / 95 / 100%), the step cap, one retry layer (6 × 3 = 18), the
 * cold-cache 529 failover (~3×) shifted in steps. See and run: OTel GenAI spans, the input-token
 * mapping trap, cost by feature, the 20:45 dashboard and the runbooks.
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
  redis: nd(2, 0, "Redis"),
  big: nd(3, 0, "Sonnet 5.5", "Sonnet"),
  tool: nd(0, 1, "Lookup"),
  night: nd(1, 1, "Nightly job", "Nightly"),
  gw: nd(2, 1, "LLM gateway", "Gateway"),
  small: nd(3, 1, "Haiku 5.5", "Haiku"),
  fin: nd(0, 2, "Finance", "Bill"),
  dash: nd(1, 2, "Dashboards", "Charts"),
  otel: nd(2, 2, "OTel spans", "Spans"),
  fb: nd(3, 2, "Fallback provider", "Fallback"),
};
const E: Ed[] = [
  ["cust", "assist"],
  ["assist", "gw", 0, -8],
  ["night", "gw", 8, 8],
  ["gw", "redis"],
  ["gw", "big", -10, 0],
  ["gw", "small"],
  ["gw", "fb", 10, 0],
  ["gw", "otel"],
  ["otel", "dash"],
  ["dash", "fin"],
  ["assist", "tool"],
];

const F: Record<string, Fr[]> = {
  pay: [
    {
      k: ["sale week at MegaMart Assist", "sale week"],
      kt: "warn",
      on: { cust: 1, assist: 1, gw: "warn", big: "bad", tool: "warn", fb: "warn", fin: "bad" },
      fl: [
        ["cust", "assist"],
        ["assist", "gw"],
        ["gw", "big", "bad"],
      ],
      chips: [
        ["Mon 10:30 · a clock on line one", "Mon · a clock on line 1"],
        ["Mon 20:30 · 429s at the peak", "Mon · 429s at peak"],
        ["Tue 02:00 · 40 calls, one chat", "Tue · a 40-call loop"],
        ["Thu 14:10 · 529s, the hour ×3", "Thu · failover costs 3×"],
        ["Fri 10:00 · 2.8× the forecast", "Fri · 2.8× forecast"],
        ["logs say only model, tokens", "no labels in the logs"],
      ],
      ctn: ["bad", "bad", "warn", "warn", "bad", "sky"],
    },
    {
      k: ["four meters per model", "four meters"],
      on: { gw: "lit", big: "lit" },
      sub: { big: ["per million tokens", "per MTok"] },
      fl: [["gw", "big"]],
      bars: [
        [["input · $2 / MTok", "input $2"], 2, 10, "sky"],
        [["5-min cache write · $2.50", "cache write $2.50"], 2.5, 10, "warn"],
        [["cache read · $0.10", "cache read $0.10"], 0.1, 10, "ok"],
        [["output · $10 / MTok", "output $10"], 10, 10, "lit"],
      ],
    },
    {
      k: ["one conversation, no caching", "per conversation"],
      on: { cust: 1, assist: 1, gw: 1, big: "lit" },
      sub: { assist: ["6 turns", "6 turns"] },
      fl: [
        ["cust", "assist"],
        ["assist", "gw"],
        ["gw", "big"],
      ],
      figs: [
        ["23,010", ["input tokens", "input tokens"]],
        ["1,500", ["output tokens", "output tokens"]],
        ["$0.061", ["on Sonnet 5.5", "on Sonnet"], "lit"],
      ],
      note: ["three quarters of it input: each turn resends everything before it", "¾ input: history resent"],
    },
    {
      k: ["the seller who never stops typing", "a 15-turn seller"],
      kt: "warn",
      on: { cust: "warn", assist: 1, gw: 1, big: "lit" },
      sub: { cust: ["15 turns", "15"] },
      fl: [
        ["cust", "assist", "warn"],
        ["assist", "gw", "warn"],
        ["gw", "big", "warn"],
      ],
      figs: [
        ["~78,500", ["input, 15 turns", "input, 15 turns"]],
        ["~$0.19", ["a conversation", "a conversation"], "warn"],
        ["~3.2×", ["a 6-turn one, not 2.5×", "not 2.5×"], "bad"],
      ],
      note: ["history grows with the square of the turns: budget per conversation", "budget per conversation"],
    },
  ],
  cache: [
    {
      k: ["stable first, volatile last", "prompt layout"],
      on: { assist: 1, gw: "lit", big: "ok" },
      sub: { big: ["prefix cached", "cached"] },
      fl: [
        ["assist", "gw"],
        ["gw", "big", "ok"],
      ],
      chips: [
        ["1 · tool definitions", "1 · tools"],
        ["2 · system prompt, ~3,000", "2 · system prompt"],
        ["3 · earlier turns", "3 · earlier turns"],
        ["breakpoint: above it, a read", "breakpoint"],
        ["4 · chunks, time, new message", "4 · this turn"],
      ],
      ctn: ["ok", "ok", "ok", "lit", "warn"],
      note: ["exact prefix match, 512 tokens minimum, 5 min refreshed on use", "exact prefix, 5 min"],
    },
    {
      k: ["Mon 10:30 · the clock on line one", "the clock on line one"],
      kt: "bad",
      on: { assist: "warn", gw: "bad", big: "bad" },
      sub: { assist: ["prompt v14", "v14"], big: ["every call a write", "writes"] },
      fl: [
        ["assist", "gw", "bad"],
        ["gw", "big", "bad"],
      ],
      bars: [
        [["cache-read share before · ~90%", "read share ~90%"], 90, 100, "ok"],
        [["after 10:35 · almost zero", "after: ~0%"], 1, 100, "bad"],
      ],
      note: ["18,000 system-prompt tokens a chat go from $0.10 to $2.50 per MTok", "$0.10 → $2.50 per MTok"],
      nt: "bad",
    },
    {
      k: ["cache reads don't count toward ITPM", "caching is capacity"],
      on: { gw: "lit", big: "ok" },
      fl: [["gw", "big", "ok"]],
      figs: [
        ["~3.45M", ["input a minute, uncached", "uncached / min"], "bad"],
        ["~290K", ["counted, cached", "counted, cached"], "ok"],
      ],
      note: ["why a 10:30 deploy became a 20:30 rate-limit incident", "10:30 deploy → 20:30 429s"],
    },
    {
      k: ["$0.061 → $0.022 a conversation", "cached: −64%"],
      kt: "ok",
      on: { cust: 1, assist: 1, gw: "lit", big: "ok" },
      fl: [
        ["cust", "assist"],
        ["assist", "gw"],
        ["gw", "big", "ok"],
      ],
      bars: [
        [["A · no caching · $0.061", "A · $0.061"], 0.061, 0.061, "bad"],
        [["B · prompt caching · $0.022", "B · $0.022"], 0.022, 0.061, "ok"],
      ],
      note: ["~$110,000 → ~$39,600 a month; alert on cache-read share", "$110K → $39.6K a month"],
    },
  ],
  cheaper: [
    {
      k: ["a false hit skips the model and the guards", "semantic cache risks"],
      kt: "warn",
      on: { assist: 1, gw: "lit", redis: "warn" },
      sub: { redis: ["answer cache", "answers"] },
      fl: [["gw", "redis", "warn"]],
      chips: [
        ["opened vs unopened earphones", "opened vs unopened"],
        ["order 4411 vs order 4471", "4411 vs 4471"],
        ["\"my refund\": depends who asks", "personal answers"],
        ["10 → 7 days: a stale answer", "a stale policy"],
        ["no user in the key: a leak", "no user: a leak"],
      ],
      ctn: ["bad", "bad", "warn", "warn", "bad"],
      note: ["only general, non-personal questions; scoped keys; purged from sources", "non-personal only, scoped"],
    },
    {
      k: ["a cascade: small first, then escalate", "cascade break-even"],
      on: { gw: "lit", small: "ok", big: 1 },
      sub: { gw: ["scorer", "scorer"] },
      fl: [
        ["gw", "small", "ok"],
        ["gw", "big"],
      ],
      figs: [
        ["$0.0012", ["Haiku, cached", "Haiku, cached"], "ok"],
        ["$0.022", ["Sonnet, cached", "Sonnet, cached"]],
        ["~95%", ["break-even escalation", "break-even"], "lit"],
      ],
      note: ["at 40% escalation ≈ $0.010, ~55% less; escalated turns wait twice", "40% → $0.010, −55%"],
    },
    {
      k: ["route on the first message", "caching + routing"],
      kt: "ok",
      on: { assist: 1, gw: "lit", small: "ok", big: 1 },
      sub: { gw: ["router", "router"], small: ["60% of chats", "60%"] },
      fl: [
        ["assist", "gw"],
        ["gw", "small", "ok"],
        ["gw", "big"],
      ],
      bars: [
        [["A · no caching · $0.061", "A · $0.061"], 0.061, 0.061, "bad"],
        [["B · caching · $0.022", "B · $0.022"], 0.022, 0.061, "sky"],
        [["C · + routing · $0.0096", "C · $0.0096"], 0.0096, 0.061, "ok"],
      ],
      note: ["~$17,200 a month (−84%); keep a conversation on one model", "~$17,200 a month, −84%"],
    },
    {
      k: ["the nightly job: the Batch API", "batch: half price"],
      on: { night: "lit", gw: 1, big: 1 },
      sub: { night: ["02:00, ~60,000", "02:00"] },
      fl: [
        ["night", "gw"],
        ["gw", "big"],
      ],
      chips: [
        ["50% of standard prices", "half price"],
        ["most within an hour, 24 h max", "within 24 h"],
        ["custom_id = conversation id", "custom_id: idempotent"],
        ["never for anyone waiting", "not for live turns"],
      ],
      ctn: ["ok", "sky", "lit", "warn"],
    },
  ],
  limits: [
    {
      k: ["reserve the worst case, then settle", "budget governor"],
      on: { assist: 1, gw: "lit", redis: "lit", big: 1 },
      sub: { gw: ["budget governor", "governor"], redis: ["spend counters", "spend"] },
      fl: [
        ["assist", "gw"],
        ["gw", "redis"],
        ["gw", "big"],
      ],
      chips: [
        ["per feature, tenant, user, chat", "feature, tenant, user"],
        ["reserve: input + max_tokens", "reserve the worst case"],
        ["settle: actual cost from usage", "settle from usage"],
        ["provider caps stop everyone", "provider caps: all stop"],
      ],
      ctn: ["sky", "lit", "ok", "warn"],
    },
    {
      k: ["degrade before you cut off", "the spend ladder"],
      on: { gw: "lit", small: "ok", night: "warn" },
      sub: { night: ["Thrifty", "Thrifty"] },
      fl: [["gw", "small", "ok"]],
      bars: [
        [["80% · Thrifty: small model", "80% · Thrifty"], 80, 100, "sky"],
        [["95% · Minimal: pause, batch", "95% · Minimal"], 95, 100, "warn"],
        [["100% · a polite handoff", "100% · Handoff"], 100, 100, "bad"],
      ],
      note: ["per feature: when qa.nightly_tags runs out, the chat keeps going", "per feature: chat goes on"],
    },
    {
      k: ["Tue 02:00 · 40 calls, one conversation", "the 40-call loop"],
      kt: "bad",
      on: { assist: "warn", tool: "bad", gw: 1, big: "warn" },
      sub: { tool: ["failing", "fails"] },
      fl: [
        ["assist", "tool", "bad"],
        ["assist", "gw", "warn"],
        ["gw", "big", "warn"],
      ],
      cols: 1,
      chips: [
        ["1 · a step cap: 5 tool calls a turn, then hand off", "1 · step cap, then hand off"],
        ["2 · a per-conversation budget", "2 · per-conversation budget"],
        ["3 · user and feature budgets; last, the provider's cap", "3 · feature, then provider"],
      ],
      ctn: ["ok", "lit", "warn"],
    },
    {
      k: ["retry in one layer", "one retry layer"],
      kt: "warn",
      on: { assist: 1, gw: "lit", big: "warn" },
      sub: { gw: ["retries here", "retries"] },
      fl: [
        ["assist", "gw"],
        ["gw", "big", "warn"],
      ],
      figs: [
        ["6 × 3", ["(1 + 5) × (1 + 2)", "yours × SDK's"], "warn"],
        ["18", ["calls, one failing turn", "calls, one turn"], "bad"],
        ["0", ["max_retries in the SDK", "SDK max_retries"], "ok"],
      ],
      note: ["the gateway retries with retry-after, jitter and a retry budget", "retry-after, jitter, a budget"],
    },
    {
      k: ["Thu 14:10 · 529s for 40 minutes", "the 529 failover"],
      kt: "warn",
      on: { gw: "lit", big: "bad", fb: "warn" },
      sub: { gw: ["breaker open", "breaker"], big: ["529 overloaded", "529"], fb: ["cold cache", "cold"] },
      fl: [["gw", "fb", "warn"]],
      bars: [
        [["cached primary · ~$0.022", "primary · $0.022"], 0.022, 0.061, "ok"],
        [["cold fallback · ~$0.061, ~3×", "cold · $0.061, 3×"], 0.061, 0.061, "bad"],
      ],
      note: ["shift in steps (10%, 25%, 50%), or the fallback answers 429 too", "shift 10%, 25%, 50%"],
    },
  ],
  run: [
    {
      k: ["one span per model call", "OTel GenAI spans"],
      on: { gw: "lit", otel: "lit", dash: 1 },
      fl: [
        ["gw", "otel"],
        ["otel", "dash"],
      ],
      cols: 1,
      chips: [
        ["chat claude-sonnet-5-5 · provider, model, error.type", "chat claude-sonnet-5-5"],
        ["usage: input, output, cache_read, cache_write, reasoning", "input, output, cache, reasoning"],
        ["+ feature, tenant, prompt version, route, cost in USD", "+ feature, tenant, cost"],
      ],
      ctn: ["lit", "sky", "ok"],
    },
    {
      k: ["OTel input includes cached tokens", "the mapping trap"],
      kt: "warn",
      on: { gw: 1, otel: "warn" },
      fl: [["gw", "otel", "warn"]],
      cols: 1,
      chips: [
        ["Anthropic input_tokens: only after the last breakpoint", "Anthropic: after breakpoint"],
        ["OTel input = input + cache_read + cache_write", "OTel: input + read + write"],
        ["get it wrong: totals off by the size of your cache", "off by your cache's size"],
      ],
      ctn: ["warn", "lit", "bad"],
    },
    {
      k: ["Fri 10:00 · who spent it? a group-by", "who spent it?"],
      kt: "ok",
      on: { gw: 1, otel: 1, dash: "lit", fin: "ok" },
      fl: [
        ["gw", "otel"],
        ["otel", "dash"],
        ["dash", "fin", "ok"],
      ],
      cols: 3,
      chips: [
        ["assist.chat", "assist.chat"],
        ["assist.router", "assist.router"],
        ["guard.screen", "guard.screen"],
        ["guard.judge", "guard.judge"],
        ["qa.nightly_tags", "qa.nightly_tags"],
      ],
      ctn: ["lit", "sky", "ok", "ok", "warn"],
      note: ["reconcile with the invoice monthly: a gap is a missing label", "reconcile with the invoice"],
    },
    {
      k: ["20:45 on a sale evening", "the dashboard, 20:45"],
      kt: "ok",
      on: { gw: 1, otel: 1, dash: "lit", big: 1, small: "ok" },
      fl: [
        ["gw", "otel"],
        ["otel", "dash"],
      ],
      figs: [
        ["$88/h", ["spend rate", "spend rate"]],
        ["91%", ["cache-read share, v15", "cache-read share"], "ok"],
        ["36%", ["escalated to Sonnet", "escalated"], "lit"],
      ],
      note: ["$0.0098 a conversation · 6.5% handoffs · qa.nightly_tags Thrifty", "$0.0098 a chat, 6.5% handoffs"],
    },
    {
      k: "runbooks",
      on: { assist: 1, gw: "lit", redis: "warn", big: "bad", fb: 1, tool: "warn", dash: 1 },
      chips: [
        ["provider outage: stepped shift", "outage: stepped shift"],
        ["429 storm: cache share by version", "429s: check cache share"],
        ["runaway loop: caps, kill switch", "loop: caps, kill switch"],
        ["quiet regression: per version", "a quiet quality drop"],
        ["cache forgot the user: privacy", "leaky cache: privacy"],
      ],
      ctn: ["warn", "bad", "warn", "sky", "bad"],
      note: ["no service calls a provider directly: the gateway sees every call", "every call via the gateway"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "pay",
    label: "What you pay",
    steps: [
      {
        caption:
          "Sale week: prompt v14 puts the clock on the first line and the cache-read share falls from ~90% to almost zero; the evening peak gets 429s; a failing tool loops 40 model calls; a 529 failover triples an hour's cost; finance projects 2.8× the forecast and the logs can't say who spent it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "An LLM API bills per token on four meters: fresh input, cache write, cache read and output. On Sonnet 5.5 (October 2026 list prices, per million tokens) that's $2, $2.50, $0.10 and $10. Everything in the lesson moves tokens to a cheaper meter or stops sending them.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 1's conversation: a ~3,000-token system prompt, ~60-token messages and ~250-token replies over 6 turns is 23,010 input and 1,500 output tokens, about $0.061 on Sonnet 5.5. Three quarters of that is input, because every turn resends everything before it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A seller's 15-turn conversations send ~78,500 input tokens each: ~$0.19 a conversation, ~$7.80 for 40 a month, and ~3.2× a 6-turn one, not 2.5×, because resent history grows with the square of the turns. Budget per user and per conversation, not only per request.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "cache",
    label: "Prompt cache",
    steps: [
      {
        caption:
          "Prompt caching keeps a prefix's processed states, built in the order tools, system, messages, and a hit needs a 100% identical prefix. So order the prompt from most stable to most volatile: tools, the ~3,000-token system prompt, earlier turns, the breakpoint, then this turn's chunks, time and message.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Prompt v14 put 'Current time: 10:30:07 IST' above 3,000 tokens of policy, so every request had a new prefix: nothing was read from cache, and each conversation's 18,000 system-prompt tokens moved from $0.10 to $2.50 per million. Put the time in the newest turn, below the breakpoint.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Caching is capacity too: for most Claude models only uncached input counts toward the input-tokens-per-minute limit. At MegaMart's peak that's ~3.45 million counted input tokens a minute without caching and ~290,000 with it, which is how Monday's 10:30 deploy became a 20:30 incident.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "With the system prompt always warm and 90% of follow-up turns inside the 5-minute lifetime, a conversation drops from $0.061 to $0.022, about $110,000 to $39,600 a month (−64%), at no cost in quality. So cache-read share per prompt version is the first thing to alert on.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "cheaper",
    label: "Caches & routing",
    steps: [
      {
        caption:
          "A semantic cache answers a similar question from storage, and a false hit is a confident wrong answer that skipped the model and Day 4's guardrails: opened vs unopened, order 4411 vs 4471, personal or stale answers, a key without the user. Cache only general, non-personal questions, scoped and purged from sources.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A cascade asks Haiku 5.5 first and escalates to Sonnet 5.5 only when a scorer is unsure. Cached, a conversation costs ~$0.0012 on Haiku and $0.022 on Sonnet, so the cascade wins unless ~95% escalate; at 40% it's ≈ $0.010, about 55% less, though escalated turns wait for two models.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Route on the first message and keep the conversation on one model, since switching reprocesses the history on a cold cache. With 60% of conversations on Haiku (an assumption Day 4's evals must confirm), it's about $0.0096 a conversation, ~$17,200 a month: −84% from the uncached $0.061.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The nightly job tags ~60,000 closed conversations nobody is waiting for, so it goes to the Batch API at 50% of standard prices: most batches finish within an hour, and custom_id, the conversation id, keeps the upserts idempotent. Day 4's offline evals and backfills fit too.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "limits",
    label: "Budgets & failover",
    steps: [
      {
        caption:
          "A budget governor is a rate limiter whose unit is money, keyed by feature, tenant, user and conversation. A call's cost is unknown until it ends, so it reserves the worst case (all input at full price plus max_tokens of output) before the call and settles the real cost from usage after.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Degrade before cutting off: at 80% of a feature's daily budget go Thrifty (the small model, lower effort, shorter replies), at 95% Minimal (pause optional features, defer work to batch), and when it's spent, a polite message and a human, never a raw error. Alert at the first step.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Tuesday 02:00: the order-lookup tool fails and the model keeps calling it, 40 model calls each resending a growing history. A step cap per turn (say 5 tool calls, then hand off) stops it first; a per-conversation budget catches loops you didn't predict; the provider's cap is last and stops everyone.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The SDK already retries transient failures twice; wrap it in your own 5-retry loop and one failing turn makes up to 6 × 3 = 18 calls, and a retrying gateway multiplies again. Retry only in the gateway, with retry-after, jitter and a retry budget, and build its clients with max_retries=0.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Thursday's 529s: moving 100% of traffic to a second provider at once meets a cold cache, so every input token is fresh and a conversation costs about the uncached $0.061 instead of ~$0.022, roughly 3×, while the jump trips the fallback's own limits. Shift in steps: 10%, 25%, 50%.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "run",
    label: "See & run",
    steps: [
      {
        caption:
          "Every model call is a span named after its operation and model, like 'chat claude-sonnet-5-5', carrying OpenTelemetry's GenAI attributes (tokens per meter, finish reasons, error type) plus your own: feature, tenant, prompt version, route and cost in USD from the dated price table.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "One trap: OpenTelemetry's input count includes cached tokens, while Anthropic's input_tokens counts only tokens after the last breakpoint. The mapping adds cache_read_input_tokens and cache_creation_input_tokens to input_tokens; get it wrong and your totals are off by the size of your cache.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Label every call with its feature: assist.chat, assist.router, guard.screen, guard.judge, qa.nightly_tags. Friday's 'which feature spent it?' becomes a group-by, Day 4's screens and judges show what safety costs, and a monthly reconciliation with the invoice exposes missing labels and stale prices.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "20:45 on a sale evening: $88 an hour, $0.0098 a conversation, 91% of input read from cache on prompt v15, 36% escalated to the large model, the nightly tagging job Thrifty and 6.5% of turns handed off. Cache-read share per prompt version and spend rate per feature would have caught Monday and Tuesday early.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The runbooks: a provider outage (breaker, stepped shift, pause optional work), a 429 storm after a deploy (check cache-read share by prompt version first), a runaway loop, a quiet quality regression like Anthropic's 2025 infrastructure bugs, and an answer cache that forgot the user, run as a privacy incident.",
        tween: 1400,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
