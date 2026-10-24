/**
 * The whole side quest, Swiggy: the mission and scale (19.2M food customers a month, 2.66 lakh
 * restaurants, 6.48 lakh riders), the estimate (dispatch at ~7.5 min, not at once; ~83 orders/s at
 * dinner, ~200 on New Year's Eve, ~30K pings/s), the architecture (read plane, order saga and kitchen,
 * just-in-time assignment in 20 s city rounds, live tracking), the deep dives (the kitchen as a
 * partner, joint assignment and batching, the ETA as a distribution, location ingest) and scale and
 * edge cases (rain, kitchens that can't cook, New Year's Eve in the rain).
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
  cust: { x: 16, y: 96, w: 84, h: 52, l: "Customer", n: "App" },
  read: { x: 124, y: 40, w: 116, h: 44, l: "Read plane", n: "Read" },
  order: { x: 124, y: 152, w: 116, h: 44, l: "Order saga", n: "Order" },
  pred: { x: 268, y: 40, w: 104, h: 44, l: "Prediction", n: "ETA" },
  rest: { x: 268, y: 152, w: 104, h: 44, l: "Kitchen", n: "Kitchen" },
  loc: { x: 400, y: 40, w: 184, h: 44, l: "Rider locations", n: "GPS" },
  asg: { x: 400, y: 96, w: 88, h: 44, l: "Assign", n: "Assign" },
  rider: { x: 504, y: 96, w: 80, h: 44, l: "Rider" },
};
const E: [string, string][] = [
  ["cust", "read"],
  ["cust", "order"],
  ["pred", "read"],
  ["order", "rest"],
  ["rest", "asg"],
  ["pred", "asg"],
  ["loc", "asg"],
  ["asg", "rider"],
];
const ALL = { cust: 1, read: 1, order: 1, pred: 1, rest: 1, loc: 1, asg: 1, rider: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Swiggy · the scale", on: { cust: "lit", rest: 1, rider: 1 }, figs: [["19.2M", ["food customers / month", "customers"], "lit"], ["2.66 lakh", ["restaurants", "kitchens"]], ["6.48 lakh", ["riders / month", "riders"]]], note: ["three sides, and none of them is ours", "three sides, none ours"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["an arrival time you can keep", "honest ETA"], ["no order left hanging", "no hanging orders"], ["rider arrives as food is ready", "rider on time"], ["batch only if both on time", "safe batching"], ["charge once, auto-refund", "charge once"], ["never rush the rider", "no rider rush"]],
      ctn: ["lit", "bad", "lit", undefined, "ok", "ok"],
    },
    { k: "when to dispatch", kt: "warn", on: { rest: "warn", asg: "lit", rider: 1 }, figs: [["15 min", ["food ready", "ready"]], ["6 min", ["rider away", "ride"]], ["9 min", ["idle if sent now", "idle"], "bad"]], note: ["send at ~7.5 minutes, not the moment it's accepted", "send at ~7.5 min"] },
    { k: "the load", on: { cust: 1, order: "lit", loc: "sky", asg: 1 }, fl: [["loc", "asg", "sky"]], figs: [["~83/s", ["dinner orders", "dinner"]], ["~200/s", ["New Year's Eve", "NYE"], "warn"], ["~30K/s", ["GPS pings", "pings"], "sky"]], note: ["the real work: ~10,000 pairs scored per city round", "~10K pairs a round"] },
  ],
  arch: [
    { k: "1 · the read plane", on: { cust: 1, read: "lit", pred: 1 }, sub: { read: ["open now", "now"] }, fl: [["cust", "read"], ["pred", "read"]], note: ["restaurants that can deliver here now, each with an ETA", "deliverable now, with ETA"] },
    { k: "2 · order and kitchen", on: { cust: 1, order: "lit", rest: "warn" }, sub: { rest: ["≤ 3 min", "3 min"] }, fl: [["cust", "order"], ["order", "rest", "warn"]], chips: [["no answer → cancel, refund", "no answer: refund"], ["events via an outbox", "outbox"]], ctn: ["warn", undefined] },
    { k: "3 · just in time", on: { rest: 1, pred: 1, asg: "lit", rider: "ok" }, sub: { asg: ["20 s", "20 s"] }, fl: [["rest", "asg"], ["pred", "asg"], ["asg", "rider", "ok"]], note: ["dispatch = ready time − ride to kitchen − buffer", "ready − ride − buffer"] },
    { k: "4 · live tracking", kt: "sky", on: { loc: "lit", asg: 1, rider: 1, cust: 1 }, sub: { loc: ["every 4 s", "4 s"] }, fl: [["loc", "asg", "sky"]], note: ["latest position per rider; the customer gets a push every 3 s", "push every 3 s"] },
  ],
  deep: [
    {
      k: "1 · the kitchen is a partner",
      kt: "warn",
      on: { order: "lit", rest: "warn" },
      fl: [["order", "rest", "warn"]],
      cols: 3,
      chips: ["PLACED", "ACCEPTED", ["ITEM_ISSUE", "ITEM"], ["PICKED_UP", "PICKED"], ["CANCELLED", "REFUND"], ["DELIVERED", "DONE"]],
      ctn: [undefined, undefined, "warn", undefined, "bad", "ok"],
      ct: "mute",
    },
    { k: "2 · rounds, not greed", on: { asg: "lit", rider: 1, loc: 1, pred: 1 }, fl: [["asg", "rider"]], chips: [["every 20 s, per city", "20 s per city"], ["score every pair", "score all pairs"], ["solve the round jointly", "solve jointly"], ["batch if both stay on time", "safe batches"]], ctn: [undefined, undefined, "lit", "ok"] },
    { k: "3 · the ETA is a spread", on: { pred: "lit", read: 1, cust: 1 }, fl: [["pred", "read"]], figs: [["31 min", ["model mean", "mean"]], ["~40 min", ["shown (≈ p90)", "shown"], "lit"], ["90%", ["kept per zone", "kept"], "ok"]], note: ["calibrate the quantile per zone and hour", "quantile per zone"] },
    { k: "4 · 30,000 pings a second", kt: "sky", on: { loc: "lit", asg: 1, rider: 1 }, fl: [["loc", "asg", "sky"]], chips: [["newest ping wins", "newest wins"], ["cell index for 'who is near'", "cell index"], ["every ping to the trail", "trail stream"], ["silent 60 s = unknown", "silent = unknown"]], ct: "sky" },
  ],
  scale: [
    { k: "rain at 9:10 PM", kt: "warn", on: { ...ALL, rider: "warn", pred: "lit" }, cols: 4, chips: [["stretch ETA", "stretch"], ["batch more", "batch"], ["shrink radius", "shrink"], ["raise pay", "pay"]], ctn: ["ok", "lit", "warn", "warn"], note: ["cheapest first: the estimate grows, never the speed", "the estimate grows"] },
    { k: "kitchens that can't cook", kt: "bad", on: { order: 1, rest: "bad", read: "ok", cust: 1 }, chips: [["pause failing kitchens", "pause kitchens"], ["cancel + auto-refund", "auto refund"], ["pay before the kitchen", "pay first"], ["declined trips: pay more", "re-offer"]], ctn: ["warn", "ok", "ok", undefined] },
    { k: "New Year's Eve + rain", kt: "bad", on: { ...ALL, rest: "warn", rider: "bad" }, figs: [["~7×", ["an average minute", "avg min"], "bad"], ["× 0.5", ["rider capacity", "riders"], "warn"], ["far first", ["what you shed", "shed"]]], note: ["kitchens are the bottleneck at 7:45, riders at 8:15", "kitchens, then riders"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, asg: "ok", pred: "ok" }, fl: [["rest", "asg"], ["pred", "asg"], ["asg", "rider", "ok"]], chips: [["right rider, right minute", "right minute"], ["a time you can keep", "a kept promise"]], ctn: ["ok", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Swiggy: 19.2 million food customers a month, 2.66 lakh restaurants and 6.48 lakh riders. The platform owns only the software between them.", tween: 1400 },
      { caption: "Show a time you can keep, never leave an order hanging, get the rider there as the food is ready, batch safely, and never rush riders.", tween: 1400 },
      { caption: "Food is ready in 15 minutes and a rider is 6 away. Sent now, the rider waits 9 minutes at the counter, so dispatch at about 7.5 instead.", tween: 1400 },
      { caption: "About 83 orders a second at dinner, ~200 on New Year's Eve, and ~30,000 GPS pings a second. The heavy work is scoring order-rider pairs.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The read plane lists restaurants that can deliver to this address now, each with an arrival time from the prediction service.", tween: 1200, loop: true },
      { caption: "The order saga sends the order to the kitchen, which must accept within 3 minutes or the order is cancelled and refunded. Events leave via an outbox.", tween: 1400, loop: true },
      { caption: "Assignment runs every 20 seconds per city and dispatches when ready time minus the ride to the kitchen comes due.", tween: 1200, loop: true },
      { caption: "Riders ping every 4 seconds; the location service keeps the latest position per rider and pushes the customer's map every 3 seconds.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "The kitchen is a partner: every step has a clock, a late message is checked against the saga's state, and every cancel carries its refund.", tween: 1400, loop: true },
      { caption: "Greedy nearest-rider choices are locally best and globally worse. Score every due order against every nearby rider and solve the round together.", tween: 1400, loop: true },
      { caption: "Predict the spread of delivery time, not one number: show about the 90th percentile, calibrated per zone and hour so each keeps 90%.", tween: 1400 },
      { caption: "Locations: the newest ping wins, a cell index answers who is near, every ping goes to the trail, and 60 s of silence means unknown.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "In the rain the ladder starts cheap: stretch the estimate, batch more, shrink the radius, raise pay for short zones. Speeds never change.", tween: 1400 },
      { caption: "When kitchens can't cook, pause them so new customers don't order there, cancel and refund placed orders, and send orders only after payment.", tween: 1400 },
      { caption: "New Year's Eve with rain: ~7× an average minute, then half the rider capacity. Kitchens are the bottleneck first, riders next; shed far orders first.", tween: 1400 },
      { caption: "The lesson: send the right rider at the right minute to a kitchen you understand, and promise a time you can keep.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
