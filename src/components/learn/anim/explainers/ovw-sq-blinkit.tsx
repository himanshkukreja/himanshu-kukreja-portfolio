/**
 * The whole side quest, Blinkit: the mission and scale (2,443 dark stores, ~3.6M orders a day,
 * ~10 minutes), the order-to-door budget (10 + 20 + 150 + 20 + 370 + 30 s; ~1.5 km for a true
 * ten minutes) and load (~133 orders/s vs ~100x the reads; ~1 MB of stock per store), the
 * architecture (read plane with an H3 store index, checkout that reserves then pays, outbox to the
 * picker queue, dispatch planned early, a promise engine), the deep dives (store selection,
 * reservations, the saga, picking, batching) and scale and edge cases (store modes, a dark store,
 * rain on match night).
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
  cust: { x: 16, y: 96, w: 88, h: 52, l: "Customer", n: "App" },
  svc: { x: 136, y: 40, w: 116, h: 44, l: "Read plane", n: "Read" },
  checkout: { x: 136, y: 152, w: 116, h: 44, l: "Checkout", n: "Order" },
  promise: { x: 284, y: 40, w: 120, h: 44, l: "Promise", n: "ETA" },
  pay: { x: 284, y: 96, w: 120, h: 44, l: "Payment", n: "Pay" },
  inv: { x: 284, y: 152, w: 120, h: 44, l: "Inventory", n: "Stock" },
  picker: { x: 436, y: 96, w: 148, h: 44, l: "Picker", n: "Picker" },
  rider: { x: 436, y: 152, w: 148, h: 44, l: "Rider" },
};
const E: [string, string][] = [
  ["cust", "svc"],
  ["cust", "checkout"],
  ["promise", "svc"],
  ["checkout", "pay"],
  ["checkout", "inv"],
  ["inv", "picker"],
  ["picker", "rider"],
  ["picker", "promise"],
];
const ALL = { cust: 1, svc: 1, checkout: 1, promise: 1, pay: 1, inv: 1, picker: 1, rider: 1 } as const;
const STORE = { inv: 1, picker: 1, rider: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Blinkit · the scale", on: { cust: "lit", picker: 1, rider: 1 }, figs: [["2,443", "dark stores"], ["~3.6M", "orders a day"], ["~10 min", ["to the door", "to door"], "lit"]], note: ["one basket, one store, about 2 km away", "one store, ~2 km away"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["sell only real stock", "real stock only"], ["charge once, auto-refund", "charge once"], ["pick + pack ≈ 2.5 min", "pack 2.5 min"], ["batch when nobody is late", "smart batching"], ["honest estimates", "honest ETA"], ["never rush the rider", "no rider rush"]],
      ctn: ["bad", "bad", "lit", undefined, "ok", "ok"],
    },
    {
      k: "where ten minutes go",
      on: { checkout: 1, picker: "lit", rider: "lit", cust: 1 },
      cols: 3,
      chips: [["confirm 10 s", "confirm 10s"], ["queue 20 s", "queue 20s"], ["pick + pack 150 s", "pick 150s"], ["handover 20 s", "hand 20s"], ["ride 370 s", "ride 370s"], ["door 30 s", "door 30s"]],
      ctn: [undefined, undefined, "lit", undefined, "sky"],
      ct: "mute",
      note: ["assign the rider while the picker picks, not after", "plan the rider early"],
    },
    { k: "the honest radius", on: { picker: 1, rider: "sky" }, figs: [["10.5 min", ["average order", "average"]], ["~1.5 km", ["true 10-min radius", "10-min radius"], "lit"], ["4 min", ["per km at 15 km/h", "per km"]]], note: ["store density is the lever, not rider speed", "density, not speed"], nt: "ok" },
    { k: "the load", on: { cust: 1, svc: "sky", checkout: "lit", inv: 1 }, fl: [["cust", "svc", "sky"], ["cust", "checkout"]], figs: [["~133/s", ["orders, busiest hour", "orders/s"]], ["~40K/s", ["reads, spike nights", "reads/s"], "sky"], ["~1 MB", ["one store's stock", "store stock"]]], note: ["the hard part: keep the count equal to the shelf", "count = shelf, the hard part"] },
  ],
  arch: [
    { k: "1 · the read plane", on: { cust: 1, svc: "lit", promise: 1 }, sub: { svc: ["H3 → store", "H3"], promise: ["store mode", "mode"] }, fl: [["cust", "svc"], ["promise", "svc"]], note: ["catalog and in-stock flags, seconds stale; checkout re-checks", "seconds stale, re-checked"] },
    { k: "2 · reserve, then pay", on: { cust: 1, checkout: "lit", inv: "lit", pay: 1 }, sub: { inv: ["reserve", "hold"], pay: ["key k1", "k1"] }, fl: [["cust", "checkout"], ["checkout", "inv"], ["checkout", "pay"]], note: ["stock first: a shortfall is told before anyone pays", "stock first, money second"] },
    { k: "3 · into the store", on: { checkout: 1, inv: 1, picker: "lit", rider: "lit" }, sub: { picker: ["pack-by first", "deadline"], rider: ["planned early", "planned"] }, fl: [["inv", "picker"], ["picker", "rider"]], note: ["the confirmed event leaves through an outbox", "via a transactional outbox"] },
    { k: "4 · the promise engine", on: { svc: 1, promise: "lit", picker: 1, rider: 1 }, sub: { promise: ["p90 ETA", "p90"] }, fl: [["picker", "promise"], ["promise", "svc"]], note: ["queue + pickers + riders → the estimate customers see", "live state → the estimate"] },
  ],
  deep: [
    { k: "1 · which store?", on: { cust: 1, svc: "lit" }, fl: [["cust", "svc"]], figs: [["13.5 min", ["A: 1.2 km, backlog", "store A"], "warn"], ["12.5 min", ["B: 2.4 km, quiet", "store B"], "ok"], ["~300K", ["cell entries", "cells"]]], note: ["B also has the whole basket: coverage first, then the estimate", "coverage first, then ETA"] },
    { k: "2 · stock reservations", on: { checkout: 1, inv: "lit", picker: 1 }, sub: { inv: ["guarded", "guard"] }, fl: [["checkout", "inv"]], chips: [["reserve at checkout", "at checkout"], ["only if available ≥ qty", "guarded UPDATE"], ["holds expire in 5 min", "5-min hold"], ["empty bin → fix count", "fix the count"]], ctn: ["ok", "lit", undefined, "warn"] },
    {
      k: "3 · the order saga",
      on: { checkout: "lit", pay: "warn", inv: 1 },
      fl: [["checkout", "pay", "warn"]],
      cols: 3,
      chips: ["RESERVED", "CONFIRMED", "PICKING", ["PAYMENT_PENDING", "PENDING"], "REFUNDED", "DELIVERED"],
      ctn: [undefined, undefined, undefined, "warn", "bad", "ok"],
      ct: "mute",
    },
    { k: "4 · pick and pack", on: { inv: 1, picker: "lit" }, sub: { picker: ["~145 s", "145 s"] }, fl: [["inv", "picker"]], chips: [["fast movers by packing", "velocity slots"], ["earliest pack-by first", "deadline first"], ["ambient, then cold", "cold last"], ["7 lines × 15 s + 40 s", "7 × 15 s + 40"]] },
    { k: "5 · dispatch and batching", on: { picker: 1, rider: "lit" }, sub: { rider: ["2 bags", "batch"] }, fl: [["picker", "rider"]], chips: [["batch if detour ≤ 2 min", "detour ≤ 2 min"], ["both promises hold", "both on time"], ["a ping every 4 s", "4 s pings"], ["no countdown for riders", "no countdown"]], ctn: [undefined, "ok", undefined, "ok"] },
  ],
  scale: [
    { k: "store modes", on: { svc: 1, promise: "lit", ...STORE }, fl: [["promise", "svc"]], cols: 4, chips: ["OPEN", ["STRETCHED", "STRETCH"], ["THROTTLED", "THROTTLE"], "CLOSED"], ctn: ["ok", "lit", "warn", "bad"], note: ["outer cells close first · hysteresis stops flapping", "outer cells close first"] },
    { k: "a store goes dark", kt: "bad", on: { svc: "ok", promise: "lit", picker: "bad", inv: "bad", rider: 1 }, sub: { picker: ["no heartbeat", "dark"], promise: ["CLOSED", "CLOSED"] }, fl: [["promise", "svc"]], chips: [["neighbours take new orders", "neighbours serve"], ["never move orders silently", "no silent moves"]], ctn: ["ok", "warn"] },
    { k: "rain on match night", kt: "warn", on: { ...ALL, rider: "bad", promise: "warn" }, sub: { rider: ["~34 left", "34"] }, figs: [["~576", ["orders wanted/h", "wanted/h"], "bad"], ["25 min", ["per trip in rain", "a trip"]], ["~106", ["deliverable/h", "possible/h"], "warn"]], note: ["shed from the outside in · cap hot SKUs · estimates grow", "shed outside in"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, picker: "ok", promise: "ok" }, fl: [["checkout", "inv"], ["inv", "picker"], ["picker", "rider"]], chips: [["won in the store", "won in the store"], ["the promise moves, not the rider", "promise moves"]], ctn: ["ok", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Blinkit: 2,443 dark stores, about 3.6 million orders a day, and a basket from a store a couple of kilometres away in about ten minutes.", tween: 1400 },
      { caption: "Sell only real stock, charge once, pick and pack in about 2.5 minutes, keep promises in rain and on match nights, and never rush the riders.", tween: 1400 },
      { caption: "Where ten minutes go: 10 s to confirm, 20 queued, 150 to pick and pack, 20 to hand over, 30 at the door. That leaves about 6 minutes to ride.", tween: 1400 },
      { caption: "At 15 km/h each kilometre costs 4 minutes, so a true ten minutes only reaches ~1.5 km of road. Store density is the lever, not rider speed.", tween: 1400 },
      { caption: "Orders are few, ~133 a second at the busiest hour; reads are about 100 times that. One store's stock is ~1 MB: the hard part is the real shelf.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The read plane maps the pin's H3 cell to a store and shows its catalog and in-stock flags, a few seconds stale. Checkout re-checks.", tween: 1200, loop: true },
      { caption: "Checkout reserves every line in one transaction, then creates the payment with an idempotency key. Stock first, money second.", tween: 1200, loop: true },
      { caption: "The confirmed order reaches the store through an outbox. Pickers take the earliest pack-by time, and a rider is planned while they pick.", tween: 1200, loop: true },
      { caption: "The promise engine reads each store's queue, pickers and riders every few seconds and publishes the estimate customers see: the p90.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Nearest isn't best: store A, 1.2 km away, has a 6-minute backlog; store B, 2.4 km, is quiet and has the whole basket. B wins, 12.5 to 13.5.", tween: 1400, loop: true },
      { caption: "Reserve at checkout, not on add-to-cart, with an UPDATE guarded by on-hand minus reserved minus buffer. An empty bin corrects the count.", tween: 1400, loop: true },
      { caption: "The order is a saga. An unknown UPI result is PAYMENT_PENDING, not a failure: extend the hold, reconcile, and refund if the stock is gone.", tween: 1400, loop: true },
      { caption: "Inside the store: fast movers near packing, earliest pack-by first, ambient aisles before the cold room. Seven lines take about 145 seconds.", tween: 1400, loop: true },
      { caption: "Batch two bags when the detour is at most 2 minutes and both still arrive on time. Riders ping every 4 s and never see a countdown.", tween: 1200, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Under load a store steps down: OPEN, STRETCHED estimates, THROTTLED with outer cells closed first, then CLOSED, with hysteresis between.", tween: 1400, loop: true },
      { caption: "A store goes dark mid-rush: missing heartbeats close it within seconds and neighbours take new customers. Confirmed orders never move silently.", tween: 1200, loop: true },
      { caption: "Rain on a cricket final: ~576 orders an hour wanted, ~34 riders, 25-minute trips. About 106 can be delivered, so shed from the outside in.", tween: 1400 },
      { caption: "The lesson: the minutes are won in the store and by store density, not on the road. When the road slows, the promise moves, never the rider.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
