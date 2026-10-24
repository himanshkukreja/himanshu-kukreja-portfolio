/**
 * The whole low-level design lesson, Design a Vending Machine: the round (four states, four events,
 * no `if state ==`), the classes (the machine as context, a base state that refuses, change made
 * from the coins actually in the box), one customer moving through IDLE → HAS_MONEY → DISPENSING →
 * IDLE, then the no-change refusal, the single lock and the follow-ups.
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
  machine: { x: 16, y: 40, w: 112, h: 44, l: "Machine" },
  idle: { x: 160, y: 40, w: 120, h: 44, l: "Idle" },
  has: { x: 312, y: 40, w: 132, h: 44, l: "HasMoney", n: "Money" },
  slots: { x: 476, y: 40, w: 108, h: 44, l: "Slots" },
  cash: { x: 16, y: 150, w: 112, h: 44, l: "Cash box", n: "Cash" },
  sold: { x: 160, y: 150, w: 120, h: 44, l: "SoldOut", n: "Empty" },
  disp: { x: 312, y: 150, w: 132, h: 44, l: "Dispensing", n: "Vend" },
  tray: { x: 476, y: 150, w: 108, h: 44, l: "Tray" },
};
const E: [string, string][] = [
  ["machine", "idle"],
  ["machine", "cash"],
  ["idle", "has"],
  ["has", "slots"],
  ["has", "disp"],
  ["disp", "idle"],
  ["disp", "sold"],
  ["sold", "idle"],
  ["disp", "tray"],
];
const ALL = { machine: 1, idle: 1, has: 1, slots: 1, cash: 1, sold: 1, disp: 1, tray: 1 } as const;
const STATES = { idle: 1, has: 1, sold: 1, disp: 1 } as const;

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["4", "states"], ["4", ["events each", "events"]], ["0", ["if state == …", "ifs"], "ok"]] },
    {
      k: "clarify first",
      on: { machine: "lit", cash: 1, tray: 1 },
      chips: [["₹1, 2, 5, 10 coins, ₹20 notes", "₹1–10, ₹20 note"], ["too little: say how much more", "say how much"], ["change from coins in the box", "change from box"], ["no change: exact amount only", "exact amount"], ["cancel returns the same coins", "cancel: same coins"], ["dispensing: ignore input", "busy: ignore"]],
      ctn: [undefined, undefined, "warn", "warn"],
    },
    { k: "draw the states first", on: STATES, fl: [["idle", "has"], ["has", "disp"], ["disp", "idle"]], note: ["4 states × 4 events = 16 answers", "16 answers"] },
  ],
  classes: [
    { k: "context + states", on: ALL, sub: { machine: ["data + lock", "data"], has: ["the rules", "rules"] }, note: ["the machine forwards; the state decides", "machine forwards"] },
    { k: "the base state refuses", on: STATES, chips: [["insert → coin returned", "insert: return"], ["select → can't now", "select: no"], ["cancel → nothing to cancel", "cancel: no-op"], ["item dropped → ignored", "dropped: ignore"]], ct: "mute", note: ["each state overrides only what it handles", "override what you handle"] },
    { k: "change from the box", kt: "warn", on: { cash: "lit", has: 1 }, tiles: [["₹5", "sky"], ["₹2", "sky"], ["₹2", "sky"], ["₹2", "sky"]], chips: [["greedy: 5, then stuck", "greedy: stuck"], ["search: 2 + 2 + 2 = ₹6", "search: 2+2+2"]], ctn: ["bad", "ok"] },
  ],
  sale: [
    { k: "insert ₹10, then ₹5", on: { machine: 1, idle: 1, has: "lit" }, fl: [["machine", "idle"], ["idle", "has"]], sub: { has: ["₹15", "₹15"] }, tiles: [["₹10", "lit", "in"], ["₹5", "lit", "in"]], note: ["chips are ₹20: \"add ₹5\", still HAS_MONEY", "\"add ₹5\""] },
    { k: "select A1 with ₹25", on: { machine: 1, has: "lit", slots: 1, cash: 1 }, fl: [["has", "slots"], ["machine", "cash"]], sub: { has: ["₹25", "₹25"], slots: ["A1: 2 left", "A1"] }, tiles: [["₹10", "lit"], ["₹5", "lit"], ["₹10", "lit"]], note: ["stock, money and ₹5 change: checked before committing", "checked first"] },
    { k: "dispensing", on: { has: 1, disp: "lit", tray: "warn" }, fl: [["has", "disp"], ["disp", "tray", "warn"]], tiles: [["₹5", "ok", "change"], ["₹10", "warn", "returned"]], note: ["a coin pushed in now goes straight to the tray", "busy: coin returned"] },
    { k: "item dropped", kt: "ok", on: { disp: 1, idle: "ok", sold: 1 }, fl: [["disp", "idle", "ok"]], chips: [["stock left → IDLE", "→ IDLE"], ["last item → SOLD_OUT", "→ SOLD_OUT"]], ctn: ["ok", "warn"] },
  ],
  edge: [
    { k: "no change possible", kt: "bad", on: { has: "bad", cash: "lit" }, tiles: [["₹5", "sky", "box"], ["₹20", "lit", "in"]], figs: [["₹6", ["change needed", "needed"], "bad"]], note: ["\"exact amount only\": never short-change", "exact amount only"], nt: "bad" },
    { k: "one lock", on: { machine: "lit", cash: 1, slots: 1, tray: 1 }, chips: ["coin acceptor", "keypad", "drop sensor", ["remote refill", "refill"]], ct: "sky", note: ["one lock in the machine serialises every event", "one lock, every event"] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["UPI → an AwaitingUpi state", "UPI: new state"], ["maintenance → a new state", "maintenance"], ["telemetry → observer events", "telemetry"], ["power cut → persist escrow", "persist escrow"]],
      ct: "ok",
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: a coin machine where every event (insert, select, cancel, the item dropping) means something different in each state.", tween: 1200 },
      { caption: "Clarify: which coins, what 'too little' says, that change comes from coins in the box, and that no change means no sale.", tween: 1400 },
      { caption: "Draw the states first: idle, has money, dispensing, sold out. Four states times four events is sixteen answers: one class per state.", tween: 1400, loop: true },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "The machine is the context: slots, cash box, escrow, tray and the current state. It forwards each event; the state decides.", tween: 1200 },
      { caption: "The base State refuses every event politely, so each state overrides only the events it handles and nothing crashes.", tween: 1400 },
      { caption: "Change comes from coins in the box. ₹6 from a ₹5 and three ₹2s: greedy takes the 5 and gets stuck; the search finds 2 + 2 + 2.", tween: 1400 },
    ],
  },
  {
    id: "sale",
    label: "A sale",
    steps: [
      { caption: "In IDLE, a ₹10 coin moves the machine to HAS_MONEY. A ₹5 makes ₹15; selecting ₹20 chips says add ₹5, and it stays put.", tween: 1400, loop: true },
      { caption: "Another ₹10 makes ₹25. Select A1: in stock, enough money, ₹5 change possible, all checked before the sale is committed.", tween: 1400, loop: true },
      { caption: "In DISPENSING the motor runs. A coin pushed in now goes straight to the tray, next to the ₹5 change.", tween: 1200, loop: true },
      { caption: "The drop sensor fires and the machine returns to IDLE, or to SOLD_OUT once the last item is gone, where every coin is returned.", tween: 1200, loop: true },
    ],
  },
  {
    id: "edge",
    label: "Edges & follow-ups",
    steps: [
      { caption: "With only a ₹5 in the box, ₹20 for ₹14 biscuits needs ₹6 change it can't make, so the machine refuses rather than short-change.", tween: 1200 },
      { caption: "One customer, many threads: coin acceptor, keypad, drop sensor and remote refills. One lock in the machine serialises every event.", tween: 1200 },
      { caption: "Follow-ups: UPI is a new AwaitingUpi state, maintenance is another, telemetry is an observer, and escrow is persisted for power cuts.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
