/**
 * The whole side quest, Uber: the mission and scale (~43M trips a day, ~500K pings a second at
 * peak, < 3 s to match), the estimate (375K location updates/s vs ~1,000 trip requests/s; 4.3
 * TB/day of locations vs 150 GB of trips), the architecture (WebSocket pings → Location Service →
 * H3 index in Redis; request → pricing → matching → 15 s offer → trip in Spanner), the deep dives
 * (H3 rings, surge, scoring, ETAs) and scale and edge cases (city shards, silent drivers and GPS
 * drift, a region failing at rush hour, idempotent completion).
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
  driver: { x: 16, y: 40, w: 92, h: 44, l: "Driver" },
  rider: { x: 16, y: 152, w: 92, h: 44, l: "Rider" },
  gw: { x: 140, y: 96, w: 100, h: 44, l: "Gateway", n: "API" },
  loc: { x: 272, y: 40, w: 120, h: 44, l: "Location", n: "Loc" },
  match: { x: 272, y: 152, w: 120, h: 44, l: "Matching", n: "Match" },
  h3: { x: 424, y: 40, w: 160, h: 44, l: "H3 index", n: "H3" },
  price: { x: 424, y: 96, w: 160, h: 44, l: "Pricing", n: "Price" },
  trip: { x: 424, y: 152, w: 160, h: 44, l: "Trips", n: "Trips" },
};
const E: [string, string][] = [
  ["driver", "gw"],
  ["rider", "gw"],
  ["gw", "loc"],
  ["gw", "match"],
  ["loc", "h3"],
  ["match", "h3"],
  ["match", "price"],
  ["match", "trip"],
];
const ALL = { driver: 1, rider: 1, gw: 1, loc: 1, match: 1, h3: 1, price: 1, trip: 1 } as const;
const PINGS: [string, string, Tone?][] = [
  ["driver", "gw", "sky"],
  ["gw", "loc", "sky"],
  ["loc", "h3", "sky"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Uber · the scale", on: { driver: 1, rider: "lit" }, figs: [["~43M", "trips a day"], ["~500K", ["pings/s at peak", "pings/s"]], ["< 3 s", ["request to match", "to match"], "lit"]], note: ["15,000+ cities · 70+ countries", "15,000+ cities"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["match in < 3 s", "match < 3 s"], ["a ping every 4 s", "4 s pings"], ["ETA ± 3 min, 95%", "ETA ± 3 min"], ["surge pricing", "surge"], ["trips: strong, exactly once", "trips: exact"], ["locations: eventual", "locs: eventual"]],
      ctn: ["lit", undefined, undefined, undefined, "ok", "sky"],
    },
    { k: "which writes dominate?", on: { driver: "sky", gw: 1, loc: "sky", rider: 1, match: 1 }, fl: PINGS.slice(0, 2), figs: [["375K", ["updates/s", "pings/s"], "sky"], ["~500K", "at peak"], ["~1,000", ["trip requests/s", "trips/s"]]], note: ["1.5M drivers online × a ping every 4 s · locations win 500 to 1", "locations win 500 to 1"] },
    { k: "storage", on: { h3: "sky", trip: "lit" }, figs: [["4.3 TB", ["locations a day", "locs/day"], "sky"], ["~30 TB", ["kept 7 days", "7 days"]], ["150 GB", ["trips a day", "trips/day"], "lit"]], note: ["trips are small but must never be wrong", "trips: small but exact"] },
  ],
  arch: [
    { k: "1 · pings", on: { driver: "sky", gw: 1, loc: "lit", h3: "lit" }, sub: { h3: ["Redis", "Redis"], loc: ["overwrite", "write"] }, fl: PINGS, note: ["WebSockets both ways · a driver moves sets only when it changes cell", "WebSockets both ways"] },
    { k: "2 · a ride request", on: { rider: "lit", gw: 1, match: "lit", h3: 1, price: "lit" }, sub: { price: ["upfront fare", "fare"], match: ["score", "score"] }, fl: [["rider", "gw"], ["gw", "match"], ["match", "h3"], ["match", "price"]], note: ["the fare uses the pickup cell's surge", "fare uses the cell's surge"] },
    { k: "3 · the offer", kt: "warn", on: { driver: "warn", gw: 1, match: "lit" }, sub: { driver: ["15 s", "15 s"] }, fl: [["match", "gw"], ["gw", "driver"]], note: ["the < 3 s budget ends when the driver is notified", "< 3 s ends at the offer"] },
    { k: "4 · the trip", kt: "ok", on: { driver: "ok", rider: "ok", gw: 1, match: 1, trip: "ok" }, sub: { trip: ["Spanner", "Spanner"] }, fl: [["driver", "gw", "ok"], ["gw", "match", "ok"], ["match", "trip", "ok"]], note: ["matched → en route → on trip → completed · events to Kafka", "trip state machine"], nt: "ok" },
  ],
  deep: [
    { k: "1 · H3 hexagons", on: { loc: 1, h3: "lit", match: 1 }, sub: { h3: ["res 9", "res 9"] }, fl: [["match", "h3"]], chips: [["resolution 9 ≈ a street block", "res 9 ≈ block"], ["cell → set of drivers", "cell → drivers"], ["search rings k = 1, then 2", "rings k = 1, 2"], ["6 equidistant neighbours", "equal neighbours"]] },
    { k: "2 · surge", kt: "warn", on: { h3: 1, price: "warn", match: 1 }, sub: { price: ["EMA smoothed", "EMA"] }, figs: [["500/min", "requests", "bad"], ["50", "drivers"], ["1.6x", ["published (EMA)", "published"], "warn"]], note: ["counts neighbour cells as supply · capped at 5.0x", "neighbours count · cap 5.0x"] },
    {
      k: "3 · nearest isn't best",
      on: { match: "lit", h3: 1, driver: 1, gw: 1 },
      fl: [["match", "h3"]],
      bars: [[["ETA 0.4", "ETA 0.4"], 0.4, 0.4, "lit"], [["rating 0.2", "rating 0.2"], 0.2, 0.4], [["acceptance 0.2", "accept 0.2"], 0.2, 0.4], [["wait time 0.2", "wait 0.2"], 0.2, 0.4]],
    },
    { k: "4 · ETAs compound", on: { match: "lit", h3: 1 }, figs: [["10 min", "route"], ["× 1.5", "traffic"], ["16.5 min", ["× 1.1 from ML", "with ML"], "lit"]], note: ["target: within 3 minutes, 95% of the time", "within 3 min, 95%"] },
  ],
  scale: [
    { k: "shard by city", on: ALL, sub: { h3: ["per city", "city"] }, chips: [["each city is a shard", "city shards"], ["hot cells: own capacity", "hot cells"], ["every change → Kafka", "Kafka events"], ["active-active regions", "active-active"]] },
    { k: "a driver goes silent", kt: "warn", on: { driver: "bad", gw: 1, match: "lit", loc: 1 }, sub: { driver: ["silent", "silent"], match: ["next driver", "next"] }, chips: [["15 s timeout → next", "15 s → next"], ["30 s silence → gone", "30 s TTL"], ["GPS drift: Kalman filter", "Kalman filter"], ["k-ring covers drift", "k-ring"]], ctn: ["warn", "warn"] },
    { k: "a region fails at rush hour", kt: "bad", on: { ...ALL, h3: "warn", trip: "ok", loc: "warn" }, sub: { h3: ["rebuilt", "rebuild"], trip: ["replicated", "safe"] }, fl: PINGS, chips: [["trips: replicated, precious", "trips: precious"], ["index: soft, rebuilt by pings", "index: soft"]], ctn: ["ok", "sky"] },
    { k: "Complete, tapped twice", on: { driver: "warn", gw: 1, match: 1, trip: "ok" }, sub: { trip: ["keyed by trip ID", "trip ID"] }, fl: [["driver", "gw", "warn"], ["gw", "match"], ["match", "trip", "ok"]], note: ["one trip ID → one completion, one charge", "one completion, one charge"], nt: "ok" },
    { k: "the takeaway", kt: "ok", on: { ...ALL, h3: "sky", trip: "ok" }, fl: [...PINGS, ["match", "trip", "ok"]], chips: [["locations: hot, disposable", "locations: soft"], ["trips: few, exactly once", "trips: exact"]], ctn: ["sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Uber: ~43 million trips a day in 15,000+ cities. Track every moving car, and match each rider to a driver in under 3 seconds.", tween: 1400 },
      { caption: "Match in under 3 seconds, a ping every 4 seconds, ETAs within 3 minutes 95% of the time, surge pricing, and every trip created exactly once.", tween: 1400 },
      { caption: "1.5 million drivers online, each pinging every 4 s: 375,000 updates a second, ~500,000 at peak, against ~1,000 trip requests.", tween: 1400, loop: true },
      { caption: "Location history is 4.3 TB a day, kept 7 days, ~30 TB. Trips are only 150 GB a day, but must be strongly consistent and exactly once.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Driver apps hold a WebSocket and ping every 4 seconds. The Location Service overwrites each position in an in-memory H3 index in Redis.", tween: 1200, loop: true },
      { caption: "A rider requests: Pricing quotes an upfront fare with the cell's surge, and Matching pulls nearby drivers from the index and scores them.", tween: 1400, loop: true },
      { caption: "The best driver is offered the ride over the WebSocket and has 15 seconds to accept. The 3-second budget ends at that notification.", tween: 1200, loop: true },
      { caption: "On accept, the Trip Service creates the trip exactly once in Spanner and runs it: matched, en route, on trip, completed.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "H3 hexagons at resolution 9 are about a street block. Search the rider's cell, then rings k = 1 and k = 2; every neighbour is equidistant.", tween: 1400, loop: true },
      { caption: "Surge per cell is demand over supply, counting neighbour cells, smoothed by an EMA: a jump from 1.0x toward 3.0x publishes 1.6x.", tween: 1400 },
      { caption: "Nearest isn't best: score ETA 0.4, rating, acceptance and wait time 0.2 each, offer the top driver, and batch in 2-second windows at rush hour.", tween: 1600, loop: true },
      { caption: "ETAs compound: a 10-minute route × 1.5 for traffic × 1.1 from the ML model is 16.5 minutes. Target: within 3 minutes, 95% of the time.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Riders and drivers meet locally, so each city is a shard. Hot downtown cells get dedicated capacity, and every state change goes to Kafka.", tween: 1400 },
      { caption: "A driver goes silent: after 15 s the offer moves on, after 30 s they drop out. GPS drift is smoothed by a Kalman filter and k-ring search.", tween: 1400 },
      { caption: "A region fails at rush hour: trip state is replicated active-active and survives; the location index is soft, rebuilt from the next pings.", tween: 1400, loop: true },
      { caption: "A driver taps Complete twice during the failover. Completion and payment are keyed by trip ID, so the retry returns the same result.", tween: 1200, loop: true },
      { caption: "The lesson: match consistency to the data. Locations are hot, overwritten and disposable; trips are few, precious and exactly once.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
