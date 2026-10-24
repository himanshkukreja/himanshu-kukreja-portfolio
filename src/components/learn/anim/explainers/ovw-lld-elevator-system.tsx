/**
 * The whole low-level design lesson, Design an Elevator System: the round (two cars, ten floors,
 * hall calls and car calls, LOOK vs press order), the classes (dispatch picks the car, each car's
 * step() picks the order, stops remember a direction, one tick), the lesson's scripted morning on
 * a 10-floor shaft (3 UP → A, 7 DOWN → B, pick-ups, 5 UP and 2 DOWN on the way), then the lock and
 * the follow-ups.
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
  button: { x: 16, y: 40, w: 104, h: 44, l: "Buttons" },
  ctl: { x: 152, y: 40, w: 140, h: 44, l: "Controller", n: "Ctrl" },
  dispatch: { x: 324, y: 40, w: 140, h: 44, l: "Dispatch" },
  display: { x: 16, y: 150, w: 104, h: 44, l: "Displays", n: "Panels" },
  carA: { x: 152, y: 150, w: 140, h: 44, l: "Car A" },
  carB: { x: 324, y: 150, w: 140, h: 44, l: "Car B" },
};
const E: [string, string][] = [
  ["button", "ctl"],
  ["ctl", "dispatch"],
  ["ctl", "display"],
  ["ctl", "carA"],
  ["ctl", "carB"],
];
const ALL = { button: 1, ctl: 1, dispatch: 1, display: 1, carA: 1, carB: 1 } as const;
/** the shaft, floors 0–9: overrides by floor → [tone, caption] */
const shaft = (o: Record<number, [Tone, Two]>): Tile[] => Array.from({ length: 10 }, (_, i) => (o[i] ? [String(i), o[i][0], o[i][1]] : [String(i), "mute"]));

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["2", "cars"], ["10", "floors"], ["0", ["duplicate stops", "duplicates"], "ok"]] },
    {
      k: "clarify first",
      on: { button: "lit", ctl: 1 },
      chips: [["hall call: floor + UP/DOWN", "hall: UP/DOWN"], ["car call: a floor, inside", "car: a floor"], ["the controller picks the car", "ctrl picks car"], ["time moves in ticks", "ticks"], ["no stop for the other way", "same way only"], ["pressed twice: nothing new", "dedupe"]],
    },
    { k: "5 → 9, 1, 8?", on: { carA: "lit" }, tiles: shaft({ 1: ["warn", "stop"], 5: ["lit", "car ↑"], 8: ["warn", "stop"], 9: ["warn", "stop"] }), figs: [["19", ["floors, press order", "press order"], "bad"], ["12", ["floors with LOOK", "LOOK"], "ok"]] },
  ],
  classes: [
    { k: "two decisions", on: ALL, sub: { dispatch: ["which car", "which car"], carA: ["which order", "order"], carB: ["LOOK", "LOOK"] }, note: ["dispatch is a strategy; LOOK lives in Elevator.step()", "strategy + step()"] },
    {
      k: "stops remember a direction",
      on: { carA: "lit" },
      chips: [["floor 5: {DOWN}, a hall call", "5: DOWN"], ["floor 6: {IDLE}, a car call", "6: car call"], ["going up past 5: no stop", "up past 5: go"], ["end of the run: turn, then stop", "turn, then stop"]],
      ctn: ["sky", "sky", "warn", "ok"],
    },
    { k: "one tick", on: { ctl: "lit", carA: 1, carB: 1 }, fl: [["ctl", "carA"], ["ctl", "carB"]], chips: [["1 · doors open? close them", "1 · close doors"], ["2 · wanted here? open", "2 · stop here?"], ["3 · stops ahead? move 1", "3 · move 1"], ["4 · else turn, or idle", "4 · turn / idle"]], ct: "sky" },
  ],
  morning: [
    { k: "hall 3 UP → A", on: { button: 1, ctl: 1, dispatch: "lit", carA: "lit", carB: 1 }, fl: [["button", "ctl"], ["ctl", "dispatch"], ["ctl", "carA"]], sub: { carA: ["cost 3", "3"], carB: ["cost 6", "6"] }, tiles: shaft({ 0: ["lit", "A"], 3: ["warn", "3↑"], 9: ["sky", "B"] }) },
    { k: "hall 7 DOWN → B", on: { button: 1, ctl: 1, dispatch: "lit", carA: 1, carB: "lit" }, fl: [["button", "ctl"], ["ctl", "dispatch"], ["ctl", "carB"]], sub: { carA: ["cost 3 + 4 = 7", "7"], carB: ["cost 2", "2"] }, tiles: shaft({ 0: ["lit", "A↑"], 3: ["warn", "3↑"], 7: ["warn", "7↓"], 9: ["sky", "B"] }) },
    { k: "pick-ups", kt: "ok", on: { ctl: 1, carA: "ok", carB: "ok", display: "lit" }, fl: [["ctl", "display"]], sub: { carA: ["rider → 8", "→ 8"], carB: ["rider → 0", "→ 0"] }, tiles: shaft({ 0: ["sky", "→ B"], 3: ["ok", "A"], 7: ["ok", "B"], 8: ["lit", "→ A"] }) },
    { k: "on the way", on: { button: 1, ctl: 1, dispatch: "lit", carA: "lit", carB: "lit" }, fl: [["button", "ctl"], ["ctl", "carA"], ["ctl", "carB"]], sub: { carA: ["5↑ cost 2", "5↑"], carB: ["2↓ cost 5", "2↓"] }, tiles: shaft({ 0: ["sky", "0"], 2: ["warn", "2↓"], 3: ["lit", "A↑"], 5: ["warn", "5↑"], 7: ["sky", "B↓"], 8: ["lit", "8"] }) },
    { k: "done", kt: "ok", on: { ctl: 1, carA: "ok", carB: "ok", display: 1 }, fl: [["ctl", "display"]], tiles: shaft({ 0: ["ok", "B"], 2: ["ok", "✓"], 5: ["ok", "✓"], 8: ["ok", "A"] }), note: ["neither car ever turned back with a rider aboard", "no rider turned back"], nt: "ok" },
  ],
  ops: [
    { k: "one lock, events after", on: { button: "lit", ctl: "lit", display: 1, carA: 1, carB: 1 }, fl: [["button", "ctl"], ["ctl", "display"]], chips: [["buttons: many threads", "buttons: threads"], ["tick(): one thread", "tick: one"], ["one lock: stops and steps", "one lock"], ["displays told after it", "notify after"]], ctn: ["warn", undefined, "ok", "ok"] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["full cars skip hall calls", "full: skip halls"], ["maintenance: filtered out", "maintenance"], ["morning peak: ZonedDispatch", "zoned dispatch"], ["fire alarm: all to ground", "fire: to ground"]],
      ct: "ok",
      note: ["each a new strategy or state, not a rewrite", "strategy or state"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: a controller for a 10-floor building with two cars. People press UP or DOWN on a floor, and a floor number inside.", tween: 1200 },
      { caption: "Clarify: hall calls carry a direction, car calls don't, a controller picks the car, time moves in ticks, and repeats add nothing.", tween: 1400 },
      { caption: "A car at 5 going up has stops at 9, 1 and 8. Press order travels 19 floors; LOOK serves 8, 9, then 1 in 12.", tween: 1400 },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "Two decisions, two homes: the controller's dispatch strategy picks which car, and each car's step() picks the order, using LOOK.", tween: 1200 },
      { caption: "Each car keeps floor → directions wanted. Going up, it passes floor 5 where someone pressed DOWN, and stops there on the way back.", tween: 1400 },
      { caption: "Each tick a car closes open doors, or stops if someone here wants its way, or moves a floor toward its stops, or turns, or idles.", tween: 1400, loop: true },
    ],
  },
  {
    id: "morning",
    label: "A morning",
    steps: [
      { caption: "Floor 3 presses UP. Both cars are idle, so cost is distance: A at the ground is 3 floors away, B at the top is 6. A gets it.", tween: 1400, loop: true },
      { caption: "Floor 7 presses DOWN. A must reach 3 first, a cost of 7; idle B at 9 is only 2 away. B takes it.", tween: 1400, loop: true },
      { caption: "A opens at 3 and B at 7. Inside, A's rider presses 8 and B's rider presses the ground floor, so each car has a direction.", tween: 1200, loop: true },
      { caption: "Floor 5 presses UP and floor 2 presses DOWN. Each lands on the car already heading that way, at a cost of 2 and 5.", tween: 1400, loop: true },
      { caption: "A stops at 5 and finishes at 8; B stops at 2 and finishes at the ground. Neither car turns back with a rider aboard.", tween: 1200, loop: true },
    ],
  },
  {
    id: "ops",
    label: "Locks & follow-ups",
    steps: [
      { caption: "Buttons fire on many threads and tick() runs on one. One lock guards stops and steps, and displays are told after it's released.", tween: 1200, loop: true },
      { caption: "Follow-ups: full cars skip hall calls, maintenance cars are filtered out, zoning is a new strategy, a fire alarm grounds every car.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
