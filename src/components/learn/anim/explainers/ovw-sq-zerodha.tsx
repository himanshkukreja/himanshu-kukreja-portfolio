/**
 * The whole side quest, Zerodha Kite: the mission and scale (34.5M orders in a day, 1M+
 * concurrent users, the 9:15 open), the estimate (~670 orders/s average, 7,500/s in the first
 * minute, ~15,000 at the peak second; ~30M packets/s, ~12 Gbps binary vs 60 as JSON), three paths
 * (orders: gateway → order service → RMS → exchange gateway; reads from a hot cache; prices via
 * feed handlers and ticker servers), the deep dives (idempotency and UNKNOWN, the RMS, tick
 * coalescing, the open spike, failures) and Budget day (Little's law, retries, edge cases).
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
  app: { x: 16, y: 96, w: 84, h: 52, l: "App" },
  gw: { x: 124, y: 96, w: 96, h: 52, l: "Gateway", n: "Gate" },
  oms: { x: 248, y: 40, w: 100, h: 44, l: "Orders", n: "OMS" },
  cache: { x: 248, y: 96, w: 100, h: 44, l: "Hot cache", n: "Cache" },
  rms: { x: 372, y: 40, w: 88, h: 44, l: "RMS" },
  egw: { x: 484, y: 40, w: 100, h: 44, l: "Exch GW", n: "Exch GW" },
  exch: { x: 484, y: 96, w: 100, h: 44, l: "Exchange", n: "NSE" },
  tick: { x: 124, y: 152, w: 96, h: 44, l: "Ticker" },
  feed: { x: 372, y: 152, w: 212, h: 44, l: "Feed handlers", n: "Feeds" },
};
const E: [string, string][] = [
  ["app", "gw"],
  ["gw", "oms"],
  ["gw", "cache"],
  ["oms", "rms"],
  ["rms", "egw"],
  ["egw", "exch"],
  ["exch", "feed"],
  ["feed", "tick"],
  ["tick", "app"],
];
const ALL = { app: 1, gw: 1, oms: 1, cache: 1, rms: 1, egw: 1, exch: 1, tick: 1, feed: 1 } as const;
const ORDER: [string, string, Tone?][] = [
  ["app", "gw"],
  ["gw", "oms"],
  ["oms", "rms"],
  ["rms", "egw"],
  ["egw", "exch"],
];
const TICKS: [string, string, Tone?][] = [
  ["exch", "feed", "sky"],
  ["feed", "tick", "sky"],
  ["tick", "app", "sky"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Kite · the scale", on: { app: "lit", exch: 1 }, figs: [["34.5M", ["orders in a day", "orders/day"]], ["1M+", ["users at once", "concurrent"]], ["9:15", ["the peak, every day", "the peak"], "lit"]], note: ["election results day, 4 June 2024 · 8 million+ logins", "4 June 2024, results day"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["never lose an order", "no lost orders"], ["never send one twice", "no duplicates"], ["margin checked first", "margin first"], ["honest order states", "honest states"], ["prices to 1M+ screens", "1M+ screens"], ["8 years of records", "8-year audit"]],
      ctn: ["bad", "bad", "lit", "ok", "sky"],
    },
    { k: "the 9:15 tower", kt: "bad", on: { app: "bad", gw: "bad", oms: 1 }, fl: [["app", "gw", "bad"], ["gw", "oms", "bad"]], figs: [["~670/s", ["day average", "average"]], ["7,500/s", ["first minute", "1st minute"], "warn"], ["~15,000/s", ["busiest second", "peak second"], "bad"]], note: ["3% of 15 million orders land in the first 60 seconds", "3% in the first minute"] },
    { k: "the price stream", on: { exch: 1, feed: 1, tick: "sky", app: 1 }, fl: TICKS, figs: [["~30M", ["packets/s out", "packets/s"]], ["~12 Gbps", "binary", "ok"], ["~60 Gbps", "as JSON", "bad"]], note: ["1.5M sockets × 50 instruments × 40% changing a second", "1.5M sockets × 50 × 40%"] },
  ],
  arch: [
    { k: "1 · the order path", on: { app: 1, gw: 1, oms: "lit", rms: "lit", egw: 1, exch: 1 }, sub: { oms: ["key k7", "k7"], rms: ["block", "block"] }, fl: ORDER, note: ["exact, durable, audited for 8 years", "exact and audited"] },
    { k: "the exchange answers", kt: "ok", on: { app: "ok", gw: 1, egw: "ok", exch: "ok" }, sub: { exch: ["the truth", "truth"], egw: ["ack, fill", "ack"] }, fl: [["exch", "egw", "ok"]], note: ["pushed to the app: OPEN, then COMPLETE", "OPEN, then COMPLETE"], nt: "ok" },
    { k: "2 · the read path", on: { app: 1, gw: 1, cache: "lit" }, sub: { cache: ["views", "views"] }, fl: [["app", "gw"], ["gw", "cache"]], note: ["~167,000 reads/s at the open, never on the order service", "~167K reads/s, from memory"] },
    { k: "3 · the price path", on: { app: "sky", exch: 1, feed: "lit", tick: "lit" }, sub: { tick: ["1 flush/s", "1/s"], feed: ["latest only", "latest"] }, fl: TICKS, note: ["lossy by design; order updates are sequenced, not lossy", "lossy prices, exact orders"] },
  ],
  deep: [
    { k: "1 · one tap, one order", kt: "warn", on: { app: 1, gw: 1, oms: "lit", rms: 1, egw: "warn", exch: 1 }, sub: { egw: ["UNKNOWN", "?"] }, fl: [["rms", "egw"], ["egw", "exch", "warn"]], chips: [["one key per tap", "1 key per tap"], ["mark SENT, then send", "SENT first"], ["no answer → UNKNOWN", "UNKNOWN"], ["reconcile, never resend", "reconcile"]], ctn: [undefined, undefined, "warn", "ok"] },
    { k: "2 · the RMS", on: { oms: 1, rms: "lit" }, sub: { rms: ["1 owner", "owner"] }, fl: [["oms", "rms"]], chips: [["one thread per account", "1 owner"], ["16 partitions in memory", "16 partitions"], ["journal before OK", "journal first"], ["2nd ₹70,000 rejected", "2nd rejected"]], ctn: [undefined, undefined, "ok", "bad"], note: ["two ₹70,000 orders on ₹1,00,000 available", "₹70,000 × 2 on ₹1,00,000"] },
    { k: "3 · ticks to a million", on: { feed: 1, tick: "lit", app: "warn" }, sub: { app: ["slow", "slow"] }, fl: [["feed", "tick", "sky"], ["tick", "app", "warn"]], chips: [["44-byte binary quotes", "44-byte quotes"], ["coalesce to latest", "coalesce"], ["encode once, copy many", "encode once"], ["skip slow, close at ~10 s", "skip slow ones"]] },
    { k: "4 · the open spike", on: { app: 1, gw: "lit", oms: 1, egw: 1 }, sub: { gw: ["10/s each", "10/s"] }, fl: [["app", "gw"], ["gw", "oms"]], chips: [["pre-warm by 8:45", "pre-warm"], ["10 orders/s per client", "10/s each"], ["cancels jump the queue", "cancels first"], ["new orders expire at 2 s", "2 s deadline"]], ctn: [undefined, undefined, "ok", "warn"] },
    { k: "5 · when things break", kt: "warn", on: { ...ALL, egw: "warn", feed: "warn" }, sub: { feed: ["stale?", "stale"] }, chips: [["frozen feed → say so", "flag stale"], ["flapping line = down", "flap = down"], ["never move in-flight orders", "no moves"], ["the exchange wins", "exchange wins"]], ctn: ["warn", "warn", "bad", "ok"] },
  ],
  scale: [
    { k: "Budget day", kt: "bad", on: { app: "bad", gw: 1, oms: 1, rms: 1, egw: "warn", exch: "warn" }, sub: { exch: ["800 ms", "800 ms"] }, fl: [["app", "gw", "bad"], ["egw", "exch", "warn"]], figs: [["30,000/s", "demand", "bad"], ["18,000", "in flight, max"], ["22,500/s", ["ceiling = 18,000 ÷ 0.8", "the ceiling"], "warn"]], note: ["Little's law: throughput = in flight ÷ latency", "Little's law"] },
    { k: "the queue grows", kt: "warn", on: { app: "warn", gw: "lit", oms: 1, cache: 1, tick: "ok" }, sub: { gw: ["same key", "key"], tick: ["still live", "live"] }, fl: [["app", "gw", "warn"], ["tick", "app", "sky"]], chips: [["late new orders: not sent", "expire, not sent"], ["retries read, not create", "retries = reads"], ["protect cancels, exits", "protect exits"], ["shed charts and depth", "shed charts"]], ctn: ["warn", "ok", "ok", "mute"] },
    { k: "edge cases", on: { oms: "lit", rms: "warn", exch: 1, egw: 1 }, sub: { rms: ["standby", "standby"] }, cols: 3, chips: [["fill beats cancel", "fill wins"], ["pre-check bands", "price bands"], ["RMS standby", "RMS standby"]], ctn: ["ok", "lit", "warn"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, oms: "ok", tick: "ok", cache: "ok" }, fl: [...ORDER, ["gw", "cache"], ...TICKS.slice(1)], cols: 3, chips: [["orders: exact", "orders exact"], ["prices: perishable", "prices lossy"], ["reads: from memory", "reads cached"]], ctn: ["ok", "sky", "lit"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Kite took 34.5 million orders on election results day 2024, serves a million+ users at once, and its busiest second is 9:15:00, every day.", tween: 1400 },
      { caption: "Never lose an order or send one twice, check margin before it leaves, show every state honestly, stream prices, keep records 8 years.", tween: 1400 },
      { caption: "15 million orders over a 22,500-second session is ~670 a second, but 3% land in the first minute: 7,500 a second, peaking near 15,000.", tween: 1400, loop: true },
      { caption: "1.5 million sockets × 50 instruments, 40% changing a second: ~30 million packets a second, ~12 Gbps in binary, 60 as JSON.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Asha's order: the gateway admits it, the order service inserts it once per key, the RMS blocks margin, and the exchange gateway sends it.", tween: 1600, loop: true },
      { caption: "The exchange matches, and it is the source of truth. Its acknowledgement and fill are pushed to Asha's screen: OPEN, then COMPLETE.", tween: 1200, loop: true },
      { caption: "Reads, ~167,000 a second at the open, come from per-user views in a hot cache, rebuilt from events, never from the order service.", tween: 1200, loop: true },
      { caption: "Prices take their own road: feed handlers to ticker servers, latest snapshot only, flushed once a second. Lossy by design, unlike orders.", tween: 1400, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "A double tap reuses one key, so it is one order. A sent order with no answer is UNKNOWN, never resent: reconcile with the exchange first.", tween: 1400, loop: true },
      { caption: "Two ₹70,000 orders on ₹1,00,000: one RMS partition owns the account, checks and blocks in one step, journals it, and rejects the second.", tween: 1200, loop: true },
      { caption: "Ticks are 44-byte binary packets, coalesced to the latest per instrument and encoded once. A slow phone is skipped, then closed after ~10 s.", tween: 1400, loop: true },
      { caption: "9:15 is on the calendar: pre-warm by 8:45, don't autoscale. Then 10 orders a second per client, cancels first, new orders expire after 2 s.", tween: 1400, loop: true },
      { caption: "If a feed freezes, say prices are delayed. Treat a flapping line as down and move new orders, never in-flight ones. The exchange wins disputes.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Budget day & edges",
    steps: [
      { caption: "Budget day: 30,000 orders a second while exchange acks slow from 5 ms to 800 ms. Little's law: 18,000 in flight ÷ 0.8 s = 22,500 a second.", tween: 1400, loop: true },
      { caption: "The queue grows 7,500 a second, so some new orders expire: not sent, nothing placed. Retries with the same key are cheap reads, not orders.", tween: 1400, loop: true },
      { caption: "A fill that beats a cancel is COMPLETE, said plainly. Out-of-band prices are pre-checked; a crashed RMS partition's standby takes over.", tween: 1200 },
      { caption: "The lesson: orders are few and exact, prices many and perishable, reads most and a moment stale. Give each its own path, and tell the truth.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
