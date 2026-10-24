/**
 * The whole low-level design lesson, Design a Logging Framework (Pub-Sub): the round (levels,
 * destinations, formats, redaction, never blocking; three patterns with three jobs), one record's
 * journey (logger → level filter → redactor → bus → console and payments alerts), failures and
 * threads (a topic that doesn't match, a broken sink, the async sink's 4,000 lines), then the rules
 * and the follow-ups.
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
  logger: { x: 16, y: 40, w: 96, h: 44, l: "Logger" },
  filter: { x: 136, y: 40, w: 120, h: 44, l: "LevelFilter", n: "Filter" },
  redact: { x: 280, y: 40, w: 96, h: 44, l: "Redactor", n: "Redact" },
  bus: { x: 400, y: 40, w: 184, h: 44, l: "LogBus" },
  app: { x: 16, y: 150, w: 96, h: 44, l: "Threads" },
  store: { x: 136, y: 150, w: 120, h: 44, l: "Slow sink", n: "Store" },
  async: { x: 280, y: 150, w: 96, h: 44, l: "AsyncSink", n: "Async" },
  console: { x: 400, y: 150, w: 88, h: 44, l: "Console", n: "Term" },
  alerts: { x: 496, y: 150, w: 88, h: 44, l: "Alerts", n: "Alert" },
};
const E: [string, string][] = [
  ["app", "logger"],
  ["logger", "filter"],
  ["filter", "redact"],
  ["redact", "bus"],
  ["bus", "async"],
  ["bus", "console"],
  ["bus", "alerts"],
  ["async", "store"],
];
const ALL = { logger: 1, filter: 1, redact: 1, bus: 1, app: 1, store: 1, async: 1, console: 1, alerts: 1 } as const;
const CHAIN = { app: 1, logger: 1, filter: 1, redact: 1, bus: 1 } as const;

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["3", "patterns"], ["2", "formatters"], ["0", ["threads blocked", "blocked"], "ok"]] },
    {
      k: "clarify first",
      on: { logger: "lit", bus: 1, console: 1, alerts: 1 },
      chips: [["DEBUG < INFO < WARN < ERROR", "4 levels"], ["global + per-sink levels", "per-sink levels"], ["alerts: payments.* only", "topic: payments"], ["plain text and JSON", "plain + JSON"], ["mask cards and UPI IDs", "mask secrets"], ["never block a request", "never block"]],
      ctn: [undefined, undefined, undefined, undefined, "warn", "warn"],
    },
    { k: "three patterns, three jobs", on: { filter: "lit", redact: "lit", bus: "lit" }, chips: [["Chain: does the record continue?", "Chain: continue?"], ["Observer: deliver to many sinks", "Observer: deliver"], ["Strategy: turn it into text", "Strategy: format"]], cols: 1, ct: "sky" },
  ],
  journey: [
    { k: "pay.error(…)", on: { app: "lit", logger: "lit" }, fl: [["app", "logger"]], sub: { logger: ["LogRecord", "record"] }, note: ["\"refund failed for card 4111111111111111\"", "card 4111111111111111"], nt: "warn" },
    { k: "1 · level filter", on: { ...CHAIN, filter: "lit" }, fl: [["logger", "filter"]], chips: [["DEBUG \"cache warm\" → stopped", "DEBUG: stopped"], ["ERROR → passes on", "ERROR: passes"]], ctn: ["bad", "ok"], note: ["below INFO never goes further", "below INFO stops"] },
    { k: "2 · redact", on: { ...CHAIN, redact: "lit" }, fl: [["filter", "redact"]], chips: [["4111111111111111 → 4111********1111", "card → 4111****1111"], ["riya.demo@upi → r***@upi", "VPA → r***@upi"]], cols: 1, ct: "ok", note: ["message and context, both cleaned", "message + context"] },
    { k: "3 · publish by topic", on: { ...CHAIN, bus: "lit", console: "lit", alerts: "lit" }, fl: [["redact", "bus"], ["bus", "console"], ["bus", "alerts"]], sub: { console: ["plain", "plain"], alerts: ["JSON", "JSON"] }, chips: [["console: INFO+, plain text", "console: INFO+"], ["alerts: payments, ERROR+, JSON", "alerts: payments"]], ct: "sky" },
  ],
  fail: [
    { k: "search error: no alert", on: { bus: 1, console: "lit", alerts: "mute" }, fl: [["bus", "console"]], sub: { alerts: ["skipped", "skip"] }, note: ["topic \"search\" isn't under \"payments\"; nor is \"paymentsx\"", "not a payments topic"] },
    { k: "a broken sink", kt: "bad", on: { bus: "lit", console: "ok" }, fl: [["bus", "console"]], chips: [["write() → OSError: disk full", "OSError: disk full"], ["caught: sink_errors = 1", "sink_errors = 1"], ["console still gets the WARN", "console still works"]], cols: 1, ctn: ["bad", "warn", "ok"] },
    { k: "the async sink", kt: "ok", on: { app: "lit", logger: 1, filter: 1, redact: 1, bus: 1, async: "lit", store: 1 }, fl: [["app", "logger"], ["bus", "async"], ["async", "store"]], figs: [["8 × 500", ["lines logged", "logged"]], ["4,000", "written", "ok"], ["0", "dropped", "ok"]] },
  ],
  rules: [
    { k: "the rules", on: ALL, chips: [["full queue → drop and count", "full: drop + count"], ["subscribers: copy on write", "copy on write"], ["sinks lock their own writes", "sinks lock"], ["close() flushes the queue", "close() flushes"]], ct: "ok" },
    { k: "chain vs levels", on: { filter: 1, redact: 1, bus: "lit" }, chips: [["textbook: Error → Warn → Info handlers", "textbook: per level"], ["here: the chain processes, the bus delivers", "chain + bus"]], cols: 1, ctn: ["mute", "ok"] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["sampling → a new link", "sampling: a link"], ["request ids → a context link", "request ids"], ["per-module levels → hierarchy", "hierarchy"], ["rotation, shipping → async sinks", "async sinks"]],
      ct: "ok",
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: a logging library with levels, several destinations, a format per destination, no card numbers, and no slow requests.", tween: 1200 },
      { caption: "Clarify: ordered levels, a global and a per-sink minimum, alerts only for payments, plain and JSON, masked secrets, never blocking.", tween: 1400 },
      { caption: "Three patterns, three jobs: a chain decides whether a record continues, pub-sub delivers it to many sinks, a strategy formats it.", tween: 1200 },
    ],
  },
  {
    id: "journey",
    label: "A record's journey",
    steps: [
      { caption: "A payments thread logs an error with a card number in it. The logger builds a LogRecord and hands it to the head of the chain.", tween: 1200, loop: true },
      { caption: "The first link drops anything below INFO, so a DEBUG 'cache warm' line stops here. The ERROR passes on to the next link.", tween: 1200, loop: true },
      { caption: "The redactor returns a cleaned copy: the card becomes 4111********1111 and the UPI ID r***@upi, in the message and the context.", tween: 1200, loop: true },
      { caption: "The bus delivers to each matching subscription: the console takes INFO and up as plain text, alerts take payments errors as JSON.", tween: 1400, loop: true },
    ],
  },
  {
    id: "fail",
    label: "Failures & threads",
    steps: [
      { caption: "An ERROR from search reaches the console but not alerts, because its topic isn't payments. 'paymentsx' wouldn't match either.", tween: 1200, loop: true },
      { caption: "A broken sink throws 'disk full'. The bus catches it, counts it and keeps delivering: the console still gets the WARN line.", tween: 1200, loop: true },
      { caption: "8 threads log 500 lines each into an AsyncSink: they enqueue and return, and one worker writes. 4,000 written, 0 dropped.", tween: 1400, loop: true },
    ],
  },
  {
    id: "rules",
    label: "Rules & follow-ups",
    steps: [
      { caption: "The rules: a full queue drops and counts, the subscriber list is copy-on-write, sinks lock their own writes, and close() flushes.", tween: 1400 },
      { caption: "The textbook chain ties destinations to levels. Here the chain processes and the bus delivers, which is how real libraries split it.", tween: 1200 },
      { caption: "Follow-ups: sampling and request ids are new links, per-module levels need a hierarchy, and rotation or shipping are async sinks.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
