/**
 * The whole side quest, Google Maps routing, traffic and tiles: the scale (2B+ monthly users, 1 trillion
 * km of directions in 2024, 100M map updates a day, ETAs accurate for 97%+ of trips), the estimate (~3M
 * phones navigating at peak, ~600K probe points/s, ~61K route queries/s; Dijkstra's 2.2 s per
 * continental query would need ~134K cores), the architecture (a slow loop rebuilding the partitioned
 * graph, its overlay and versioned tiles when the map changes → a fast loop map-matching probes into
 * per-segment speeds and re-customizing overlay costs → routing on the overlay in ~2 ms), the deep
 * dives (CH vs CRP and regions, probes to speeds, time-dependent ETAs, quadkeys and vector tiles) and
 * scale and edge cases (herding, thin and fake probes, closures, a monsoon evening in Mumbai).
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
  ananya: { x: 16, y: 40, w: 88, h: 44, l: "Ananya" },
  drivers: { x: 16, y: 152, w: 88, h: 44, l: "Drivers", n: "Cars" },
  api: { x: 128, y: 96, w: 92, h: 52, l: "API" },
  route: { x: 248, y: 40, w: 120, h: 40, l: "Routing", n: "Route" },
  match: { x: 248, y: 96, w: 120, h: 52, l: "Map matching", n: "Match" },
  tiles: { x: 248, y: 156, w: 120, h: 40, l: "Tile builder", n: "Tiles" },
  overlay: { x: 400, y: 40, w: 184, h: 44, l: "Graph · overlay", n: "Overlay" },
  speeds: { x: 400, y: 96, w: 184, h: 44, l: "Live speeds", n: "Speeds" },
  cdn: { x: 400, y: 152, w: 184, h: 44, l: "Tile store · CDN", n: "CDN" },
};
const E: [string, string][] = [
  ["ananya", "api"],
  ["drivers", "api"],
  ["api", "route"],
  ["api", "match"],
  ["api", "tiles"],
  ["route", "overlay"],
  ["match", "speeds"],
  ["speeds", "overlay"],
  ["tiles", "cdn"],
];
const ALL = { ananya: 1, drivers: 1, api: 1, route: 1, match: 1, tiles: 1, overlay: 1, speeds: 1, cdn: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Google Maps · the scale", on: { ananya: "lit", api: 1, route: 1 }, figs: [["2B+", ["monthly users", "monthly"], "lit"], ["1T km", ["directions in 2024", "directions"]], ["100M", ["map updates a day", "updates/day"]]], note: ["Google doesn't publish request rates: the estimates assume them", "rates assumed"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["a map at every zoom level", "every zoom"], ["routes in < 300 ms", "routes < 300 ms"], ["traffic fresh in ~2 min", "fresh traffic"], ["ETAs right for 97% of trips", "ETA 97%"], ["reroute around closures", "reroutes"], ["a poor network still works", "poor network"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: "probes dwarf requests", on: { drivers: "lit", api: 1, match: "lit", speeds: 1 }, fl: [["drivers", "api"], ["api", "match"], ["match", "speeds"]], figs: [["~3M", ["navigating at peak", "navigating"]], ["600K/s", ["probe points", "probes/s"], "lit"], ["61K/s", ["route queries", "routes/s"], "warn"]], note: ["1 billion km a day at an assumed 40 km/h, a 3× peak hour", "1B km/day at 40 km/h (assumed)"] },
    { k: "Dijkstra can't keep up", kt: "warn", on: { route: "warn", overlay: "warn" }, fl: [["route", "overlay", "warn"]], figs: [["2.2 s", ["Dijkstra, one query", "Dijkstra"], "warn"], ["~134K", ["cores at peak", "cores"], "bad"], ["1.65 ms", ["on an overlay (CRP)", "CRP"], "ok"]] },
  ],
  arch: [
    { k: "1 · the slow loop", on: { route: 1, overlay: "lit", tiles: "lit", cdn: "lit" }, sub: { overlay: ["cells + shortcuts", "cells"], tiles: ["dirty tiles", "dirty"] }, fl: [["route", "overlay"], ["tiles", "cdn"]], note: ["when the map changes: partition, overlay shape, tiles by version", "map changes: rebuild"] },
    { k: "2 · the fast loop", on: { drivers: "lit", api: 1, match: "lit", speeds: "lit", overlay: 1 }, sub: { speeds: ["per segment", "segments"] }, fl: [["drivers", "api"], ["api", "match"], ["match", "speeds"], ["speeds", "overlay"]], note: ["fixes every 5 s, map-matched, one speed per segment, costs re-customized", "probes → speeds → costs"] },
    { k: "3 · Ananya asks for the airport", kt: "ok", on: { ananya: "lit", api: 1, route: "lit", overlay: 1 }, sub: { route: ["3 routes", "3"] }, fl: [["ananya", "api"], ["api", "route"], ["overlay", "route", "ok"]], note: ["source cell, overlay, target cell: a few thousand junctions in ~2 ms", "~2 ms on the overlay"], nt: "ok" },
    { k: "4 · the map on screen", on: { ananya: 1, api: 1, tiles: 1, cdn: "lit" }, sub: { cdn: ["by map version", "versioned"] }, fl: [["api", "tiles"], ["tiles", "cdn"]], note: ["vector tiles cached at the edge; traffic is a separate overlay", "tiles + a traffic overlay"] },
  ],
  deep: [
    { k: "1 · routing on an overlay", on: { api: 1, route: "lit", overlay: "lit" }, fl: [["api", "route"], ["route", "overlay"]], chips: [["partition into cells", "cells"], ["boundary shortcuts", "shortcuts"], ["re-customize in 0.37 s", "0.37 s"], ["one region per server", "by region"]], ctn: [undefined, undefined, "lit", "sky"] },
    { k: "2 · CH or CRP?", kt: "ok", on: { route: "lit", overlay: 1, speeds: 1 }, figs: [["0.11 ms", ["CH query", "CH"], "lit"], ["~2 min", ["CH, contract again", "recontract"], "warn"], ["0.37 s", ["CRP, re-customize", "customize"], "ok"]], note: ["Western Europe benchmark: 18 million junctions, 42.5 million segments", "18M junctions, 42.5M segments"] },
    { k: "3 · probes to speeds", on: { drivers: "lit", api: 1, match: "lit", speeds: "lit" }, fl: [["drivers", "api"], ["api", "match"], ["match", "speeds"]], chips: [["HMM map matching", "HMM match"], ["1-minute windows", "1-min windows"], ["at least 3 devices", "≥ 3 devices"], ["trip ends deleted", "ends deleted"]], ctn: ["lit", undefined, "ok", "ok"] },
    { k: "4 · the ETA", on: { ananya: 1, api: 1, route: "lit", overlay: 1, speeds: 1 }, fl: [["speeds", "overlay"], ["overlay", "route", "ok"]], figs: [["97%+", ["trips on time, 2020", "accurate"], "ok"], ["50%", ["better ETAs, some cities", "GNN gain"], "lit"], ["2–4 wks", ["history weighted, 2020", "recent"]]], note: ["each road timed for when she'll reach it: live near, history far", "speed at arrival time"] },
    { k: "5 · vector tiles", on: { ananya: 1, api: 1, tiles: "lit", cdn: "lit" }, fl: [["tiles", "cdn"]], chips: [["quadkeys: a digit per level", "quadkeys"], ["vector: 100× less data", "vector"], ["immutable by version", "versioned"], ["traffic in its own overlay", "overlay"]], ctn: ["lit", undefined, "ok", "sky"] },
  ],
  scale: [
    { k: "everyone onto one side street", kt: "warn", on: { ananya: 1, api: 1, route: "warn", overlay: 1 }, chips: [["20,000 drivers, one road", "herding"], ["count assigned routes", "count routes"], ["add their load to costs", "load in costs"], ["spread over alternatives", "spread"]], ctn: ["warn", "lit", undefined, "ok"] },
    { k: "thin and fake probes", on: { drivers: "lit", api: 1, match: "lit", speeds: 1 }, chips: [["one old probe: use history", "thin: history"], ["99 phones in a handcart", "fake jam"], ["weight devices by trust", "trust"], ["closed, or just jammed?", "closed?"]], ctn: [undefined, "bad", "ok", "warn"] },
    { k: "monsoon evening, Mumbai", kt: "warn", on: { ...ALL, speeds: "warn", route: "warn" }, fl: [["drivers", "api", "warn"], ["api", "match", "warn"], ["api", "route"]], figs: [["60K/s", ["probe points", "probes/s"]], ["~7,300/s", ["route queries", "routes/s"], "warn"], ["~73", ["cores", "cores"], "ok"]], note: ["closures become infinite costs in seconds; alternatives degrade first", "closures first"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, route: "ok", speeds: "ok" }, fl: [["drivers", "api"], ["api", "match"], ["match", "speeds", "ok"], ["speeds", "overlay", "ok"]], cols: 3, chips: [["precompute the map", "precompute"], ["stream the traffic", "stream"], ["time it for arrival", "arrival"]], ctn: ["sky", "lit", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Google Maps: over 2 billion users a month, 1 trillion km of directions in 2024 and 100 million map updates a day.", tween: 1400 },
      { caption: "Draw the map at every zoom, route in under 300 ms, keep traffic fresh within about 2 minutes, get ETAs right for 97% of trips and reroute around closures.", tween: 1400 },
      { caption: "At an assumed 40 km/h, 1 billion km a day is ~3 million phones navigating at peak: ~600,000 probe points and ~61,000 route queries a second.", tween: 1400, loop: true },
      { caption: "Plain Dijkstra takes 2.2 s on a continental graph, ~134,000 cores at peak; on a precomputed overlay (CRP) a query takes 1.65 ms.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The slow loop: when the map changes, partition the road graph into cells, build the shortcut overlay, and rebuild the dirty tiles under a new version.", tween: 1200, loop: true },
      { caption: "The fast loop: phones send a fix every 5 s; map matching turns them into one speed per segment, and the overlay's costs are re-customized.", tween: 1200, loop: true },
      { caption: "Ananya asks for the airport: her region's routing server searches the two end cells and the overlay between, a few thousand junctions in ~2 ms.", tween: 1200, loop: true },
      { caption: "The map comes from vector tiles cached at CDN edges by map version; traffic colours are a small separate overlay.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Routing: partition into cells with few boundary roads, add boundary shortcuts, re-customize costs in 0.37 s, and keep one region per server.", tween: 1400, loop: true },
      { caption: "Contraction hierarchies answer in 0.11 ms but must contract again when speeds change (~2 min); CRP only re-customizes, in 0.37 s.", tween: 1400 },
      { caption: "Traffic: HMM map matching, 1-minute windows, at least 3 devices per segment, and the start and end of every trip deleted.", tween: 1400, loop: true },
      { caption: "ETA: each road timed for when Ananya reaches it, live speeds near and history far; Google reported 97%+ accurate, and graph neural networks up to 50% better.", tween: 1400, loop: true },
      { caption: "Tiles: quadkeys with one digit per level, vector tiles needing 100× less data, immutable URLs by map version, traffic in its own overlay.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "20,000 drivers rerouted onto one side street would jam it: count the routes already assigned, add their load to costs, spread drivers out.", tween: 1400 },
      { caption: "One old probe isn't traffic: fall back to history. 99 phones in a handcart once faked a jam: weight devices by trust, and tell closures from jams.", tween: 1400 },
      { caption: "A monsoon evening in Mumbai: 60,000 probe points and ~7,300 route queries a second on ~73 cores. Closures are applied in seconds; alternatives degrade first.", tween: 1400, loop: true },
      { caption: "The lesson: precompute what depends on the map, stream what depends on traffic, and time every road for when you'll reach it.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
