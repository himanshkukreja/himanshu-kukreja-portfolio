/**
 * The whole low-level design lesson, Design a Parking Lot: the round (90 minutes to running code,
 * the clarifying questions, the two behaviours that will change), the classes (ParkingLot as the
 * only stateful class, plain data, two strategies), a car's journey through them (gate → lot →
 * spot strategy → spot → ticket, then exit → pricing), and the race the lock closes plus the
 * follow-ups.
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
  gate: { x: 16, y: 40, w: 104, h: 44, l: "Entry gate", n: "Entry" },
  exit: { x: 16, y: 150, w: 104, h: 44, l: "Exit gate", n: "Exit" },
  lot: { x: 156, y: 40, w: 124, h: 44, l: "ParkingLot", n: "Lot" },
  ticket: { x: 156, y: 150, w: 124, h: 44, l: "Ticket" },
  assign: { x: 316, y: 40, w: 136, h: 44, l: "SpotStrategy", n: "Assign" },
  price: { x: 316, y: 150, w: 136, h: 44, l: "Pricing", n: "Price" },
  spots: { x: 488, y: 40, w: 96, h: 44, l: "Spots" },
};
const E: [string, string][] = [
  ["gate", "lot"],
  ["exit", "lot"],
  ["lot", "assign"],
  ["assign", "spots"],
  ["lot", "ticket"],
  ["lot", "price"],
];
const ALL = { gate: 1, exit: 1, lot: 1, ticket: 1, assign: 1, price: 1, spots: 1 } as const;
const FREE: Tile[] = [["F0-S0", "mute", "free"], ["F0-S1", "mute", "free"], ["F0-M0", "mute", "free"], ["F0-M1", "mute", "free"], ["F0-L0", "mute", "free"]];

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["90 min", ["to running code", "to code"]], ["3", ["vehicle types", "vehicles"]], ["0", ["spots given twice", "double spots"], "ok"]] },
    {
      k: "clarify first",
      on: ALL,
      chips: [["bike: small, medium, large", "bike: S/M/L"], ["car: medium or large", "car: M/L"], ["truck: large only", "truck: L"], ["lowest floor first", "nearest first"], ["every started hour billed", "per started hour"], ["several gates at once", "many gates"]],
      ctn: [undefined, undefined, undefined, undefined, undefined, "warn"],
    },
    { k: "what will change?", on: { lot: 1, assign: "lit", price: "lit" }, sub: { assign: ["where to park", "where"], price: ["what to charge", "charge"] }, chips: [["which spot → a strategy", "spot → strategy"], ["what fee → a strategy", "fee → strategy"]], note: ["everything else is plain data", "the rest is data"] },
  ],
  classes: [
    { k: "the classes", on: ALL, sub: { lot: ["holds state", "state"] }, note: ["ParkingLot is the only class that changes state: one place for one lock", "one class, one lock"] },
    { k: "plain data", on: { spots: "lit", ticket: "lit" }, chips: [["Vehicle(plate, type)", "Vehicle"], ["ParkingSpot.fits(v)", "spot.fits()"], ["Ticket keeps spot_id", "ticket: spot_id"], ["money in int rupees", "int rupees"]], ct: "sky", note: ["no Car or Bike subclasses: a type enum is enough", "no empty subclasses"] },
    { k: "two strategies, injected", on: { lot: 1, assign: "lit", price: "lit" }, fl: [["lot", "assign"], ["lot", "price"]], sub: { assign: ["smallest fit", "nearest"], price: ["HourlyPricing", "hourly"] }, note: ["a new tariff is a new class; ParkingLot isn't edited", "new tariff = new class"] },
  ],
  journey: [
    { k: "a car arrives", on: { gate: "lit", lot: 1 }, fl: [["gate", "lot"]], sub: { lot: ["park(car, at)", "park()"] }, tiles: FREE },
    {
      k: "find + occupy, one lock",
      on: { gate: 1, lot: "lit", assign: 1, spots: "lit" },
      fl: [["lot", "assign"], ["assign", "spots"]],
      tiles: [["F0-S0", "mute", "free"], ["F0-S1", "mute", "free"], ["F0-M0", "lit", "car"], ["F0-M1", "mute", "free"], ["F0-L0", "mute", "free"]],
      note: ["lowest floor, smallest spot that fits a car", "smallest fit, floor 0"],
    },
    {
      k: "ticket issued",
      on: { lot: 1, ticket: "ok", spots: 1 },
      fl: [["lot", "ticket", "ok"]],
      sub: { ticket: ["T0001 · F0-M0", "T0001"] },
      tiles: [["F0-S0", "sky", "bike"], ["F0-S1", "mute", "free"], ["F0-M0", "ok", "car"], ["F0-M1", "mute", "free"], ["F0-L0", "sky", "truck"]],
      note: ["then a bike takes F0-S0 and a truck F0-L0", "bike S0, truck L0"],
    },
    { k: "exit and pay", kt: "ok", on: { exit: "lit", lot: 1, price: "lit" }, fl: [["exit", "lot"], ["lot", "price"]], figs: [["2h 5m", "parked"], ["3 h", "billed"], ["₹120", ["car at ₹40/h", "₹40/h"], "ok"]], note: ["the spot is freed under the lock; pricing runs outside it", "price outside the lock"] },
  ],
  race: [
    { k: "two gates, one spot", kt: "bad", on: { gate: "bad", lot: "bad", spots: "bad" }, fl: [["gate", "lot", "bad"], ["lot", "assign", "bad"]], tiles: [["F0-S0", "mute"], ["F0-S1", "mute"], ["F0-M0", "bad", "2 cars?"], ["F0-M1", "mute"], ["F0-L0", "mute"]], note: ["both saw it free before either marked it taken", "check, then act: a race"] },
    { k: "40 cars, 6 spots", kt: "ok", on: { gate: "lit", lot: "ok", spots: 1 }, fl: [["gate", "lot"]], figs: [["40", ["cars racing", "cars"]], ["6", "tickets", "ok"], ["6", ["distinct spots", "spots"], "ok"]], note: ["the rest get LotFullError", "the rest: LotFullError"] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["EV spot → a new fits() rule", "EV → fits rule"], ["weekend rate → new pricing", "weekend → pricing"], ["display board → observer", "board → observer"], ["10,000 spots → heap per size", "big lot → heaps"]],
      ct: "ok",
      note: ["each one a small, local change", "small, local changes"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: design a multi-floor parking lot and have it running in 90 minutes. Three vehicle types, three spot sizes, no spot given twice.", tween: 1200 },
      { caption: "Ask questions that change the code: what fits where, which spot to give, how fees work, and whether several gates call at once.", tween: 1400 },
      { caption: "Two behaviours will change after launch: which spot to give and what to charge. Both go behind interfaces; the rest is data.", tween: 1200 },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "ParkingLot holds floors and spots and is the only class that changes state, so there is exactly one place to put a lock.", tween: 1200 },
      { caption: "Vehicle, spot and ticket are plain data. No Car or Bike subclasses: a type enum and one fits() rule decide what parks where.", tween: 1200 },
      { caption: "The two strategies are passed into the constructor. A weekend tariff is a new pricing class, and ParkingLot is never edited.", tween: 1200, loop: true },
    ],
  },
  {
    id: "journey",
    label: "A car's journey",
    steps: [
      { caption: "A car reaches the entry gate, which calls park(vehicle, at) on the lot. Time is passed in, never read from a hidden clock.", tween: 1200, loop: true },
      { caption: "Under one lock, the strategy picks the lowest floor and the smallest spot that fits, F0-M0, and the lot marks it taken.", tween: 1400, loop: true },
      { caption: "The lot issues ticket T0001 with the spot id and the entry time. A bike then gets F0-S0 and a truck F0-L0: smallest fit first.", tween: 1400, loop: true },
      { caption: "At the exit the spot is freed under the lock, then pricing runs outside it: 2 h 5 min is 3 started hours, ₹120 for a car.", tween: 1400, loop: true },
    ],
  },
  {
    id: "race",
    label: "Races & follow-ups",
    steps: [
      { caption: "Without the lock, two gates both see F0-M0 free and both park there. Finding and occupying a spot must be one atomic step.", tween: 1200, loop: true },
      { caption: "The demo races 40 cars for 6 car-sized spots: 6 tickets, 6 distinct spots, and everyone else gets a LotFullError.", tween: 1400, loop: true },
      { caption: "Follow-ups land as small changes: a fits() rule for EV spots, a new pricing class, an observer for boards, a heap per spot size.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
