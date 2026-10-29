/**
 * The whole side quest, Amazon's Prime Day checkout: the scale (59T+ DynamoDB requests over Prime Day
 * 2026, a 192M/s peak; 100,000+ items a minute in 2022), the estimate (~5,000 orders and ~100,000 cart
 * operations a second at an assumed peak; a hot deal counter at ~5,000 writes a second), the architecture
 * (an always-writable cart with an add-log fallback; customer cells; placement by purchase id with stock
 * reserved at shared counters; an order pipeline behind an outbox), the deep dives (tagged cart lines, hot
 * keys and pre-warming, cells and shuffle shards, exactly-once placement, sub-counters, fresh-first queues)
 * and the day (Prime Day 2026, the edge cases, Prime Day 2027 with a zone down).
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
  app: { x: 16, y: 40, w: 88, h: 44, l: "Shoppers", n: "App" },
  gw: { x: 16, y: 96, w: 88, h: 48, l: "Gateway", n: "Edge" },
  price: { x: 16, y: 156, w: 88, h: 40, l: "Prices" },
  cart: { x: 128, y: 40, w: 92, h: 44, l: "Cart" },
  rt: { x: 128, y: 96, w: 92, h: 48, l: "Router" },
  chk: { x: 128, y: 156, w: 92, h: 40, l: "Checkout", n: "Order" },
  addlog: { x: 248, y: 40, w: 120, h: 44, l: "Add-log" },
  tables: { x: 248, y: 96, w: 120, h: 48, l: "Cell tables", n: "Tables" },
  inv: { x: 248, y: 156, w: 120, h: 40, l: "Stock", n: "Stock" },
  q: { x: 400, y: 40, w: 184, h: 44, l: "Order queues", n: "Queues" },
  orch: { x: 400, y: 96, w: 184, h: 48, l: "Orchestrator" },
  pay: { x: 400, y: 156, w: 84, h: 40, l: "Payments", n: "Pay" },
  fc: { x: 492, y: 156, w: 92, h: 40, l: "Warehouse", n: "FC" },
};
const E: [string, string][] = [
  ["app", "gw"],
  ["gw", "rt"],
  ["rt", "cart"],
  ["rt", "chk"],
  ["cart", "addlog"],
  ["cart", "tables"],
  ["chk", "tables"],
  ["chk", "inv"],
  ["chk", "price"],
  ["tables", "q"],
  ["q", "orch"],
  ["orch", "pay"],
  ["orch", "fc"],
];
const ALL = { app: 1, gw: 1, price: 1, cart: 1, rt: 1, chk: 1, addlog: 1, tables: 1, inv: 1, q: 1, orch: 1, pay: 1, fc: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Amazon · Prime Day", on: { tables: "lit", q: 1, orch: 1 }, figs: [["192M", ["DynamoDB req/s, peak", "req/s, peak"], "lit"], ["59T+", ["requests in four days", "in four days"]], ["100K+", ["items a minute, 2022", "items/min, 2022"]]], note: ["all of Amazon's systems on AWS, not the cart alone", "all of Amazon, not the cart"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["never refuse an add", "never refuse an add"], ["re-price, show the true total", "true total"], ["one order per intent", "one order per intent"], ["never oversell a deal", "never oversell"], ["authorise, release once", "release once"], ["a failure hits a few, not all", "small blast radius"]],
      ctn: ["lit", "sky", "lit"],
    },
    { k: ["~5,000 orders a second", "~5K orders/s"], on: { app: 1, gw: 1, rt: 1, cart: "lit", chk: "lit" }, fl: [["app", "gw"], ["gw", "rt"], ["rt", "cart"], ["rt", "chk"]], figs: [["~5K/s", ["orders, peak · 20K design", "orders, peak"], "lit"], ["~100K/s", ["cart ops · 400K design", "cart ops"]], ["≥10", ["cart requests a checkout", "cart per order"]]], note: ["1.5× growth since 2022, 2 items an order, a 4× peak hour: assumptions", "rates assumed"] },
    { k: ["the tail and the hot key", "tail and hot key"], kt: "warn", on: { chk: 1, inv: "warn", price: 1 }, figs: [["150+", ["services on one page", "services a page"]], ["~14%", ["pages hit a slow call", "slow pages"], "warn"], ["~5K/s", ["on one deal's counter", "one counter"], "bad"]], note: ["a partition takes ~1,000 writes/s; no split helps one item", "can't split one item"] },
  ],
  arch: [
    { k: ["1 · the cart never says no", "1 · the cart"], on: { app: 1, gw: 1, rt: 1, cart: "lit", tables: "lit", addlog: 1 }, sub: { tables: ["by customer", "by customer"] }, fl: [["app", "gw"], ["gw", "rt"], ["rt", "cart"], ["cart", "tables"]], note: ["a conditional write on the cart's version; an add-log if it's slow", "slow? the add-log"] },
    { k: ["2 · cells by customer", "2 · cells"], on: { gw: 1, rt: "lit", cart: 1, chk: 1, tables: 1 }, sub: { rt: ["id → cell", "→ cell"] }, fl: [["gw", "rt"]], figs: [["~40", ["cells, assumed", "cells"], "lit"], ["8M", ["customers a cell, at most", "per cell, max"]], ["2.5%", ["one cell's share", "one cell"]]], note: ["the router maps from memory, even with the control plane down", "map in memory"] },
    { k: ["3 · place the order once", "3 · placement"], on: { rt: 1, chk: "lit", price: 1, inv: "lit", tables: "lit" }, sub: { chk: ["purchase id", "once"] }, fl: [["rt", "chk"], ["chk", "price"], ["chk", "inv"], ["chk", "tables"]], note: ["re-price, reserve, then token + order + outbox in one transaction", "one transaction"] },
    { k: ["4 · the page doesn't wait for the bank", "4 · after the page"], on: { tables: 1, q: "lit", orch: "lit", pay: 1, fc: 1 }, fl: [["tables", "q"], ["q", "orch"], ["orch", "pay"], ["orch", "fc"]], note: ["authorise now, capture at shipping; one release per centre", "authorise, then release"] },
  ],
  deep: [
    { k: ["1 · tags, not a union", "1 · the cart merge"], on: { app: 1, cart: "lit", tables: 1, addlog: "lit" }, fl: [["cart", "tables"], ["cart", "addlog"]], chips: [["Dynamo, 2007: merge by union", "Dynamo: union"], ["a removed item can resurface", "removes come back"], ["every add gets a unique tag", "tagged adds"], ["a remove names the tags it saw", "observed removes"]], ctn: ["sky", "warn", "lit", "ok"] },
    { k: ["2 · rehearse the peak", "2 · hot keys"], on: { cart: 1, chk: 1, tables: "lit", inv: "warn" }, fl: [["chk", "tables"], ["chk", "inv", "warn"]], figs: [["2×", ["previous peak, at once", "2× at once"]], ["minutes", ["to split for traffic", "to split"], "warn"], ["1 item", ["no split can help it", "can't split"], "bad"]], note: ["above 2× its own history? load-test it there before the day", "pre-warm by rehearsal"] },
    { k: ["3 · one in forty", "3 · cells, shuffle shards"], on: { rt: "lit", chk: "warn", price: "lit", tables: 1 }, sub: { price: ["4 of 32", "4 of 32"] }, fl: [["rt", "chk"], ["chk", "price"]], figs: [["2.5%", ["one bad cell, worst case", "one bad cell"], "lit"], ["4 of 32", ["price groups a cell", "groups a cell"]], ["35,960", ["combinations", "combinations"]]], note: ["no two cells share more than 2 groups", "≤ 2 groups shared"] },
    { k: ["4 · one intent, one order", "4 · exactly once"], on: { app: 1, rt: 1, chk: "lit", tables: "lit", inv: 1 }, fl: [["rt", "chk"], ["chk", "tables"], ["chk", "inv"]], chips: [["id minted when the page renders", "id per page"], ["token, order, outbox: one write", "one transaction"], ["same id, other cart: mismatch", "mismatch: reject"], ["retry at one layer, not five", "retry at one layer"]], ctn: ["lit", "ok", "warn", "sky"] },
    { k: ["5 · stock that can't oversell", "5 · deal stock"], on: { chk: 1, inv: "lit" }, sub: { inv: ["20 counters", "20 counters"] }, fl: [["chk", "inv"]], figs: [["20,000", ["units in one deal", "deal units"]], ["20", ["sub-counters of 1,000", "sub-counters"], "lit"], ["~250/s", ["each, at the start", "each"]]], note: ["decrement only while positive; \"% claimed\" is a cached sum", "only while positive"] },
    { k: ["6 · drain fresh first", "6 · the pipeline"], kt: "warn", on: { tables: 1, q: "warn", orch: "lit", pay: "bad", fc: 1 }, fl: [["tables", "q"], ["q", "orch", "warn"], ["orch", "pay", "bad"]], figs: [["~2.2M", ["backlog after 1 hour", "backlog"], "warn"], ["~1 h", ["more to drain at 2×", "to drain"]], ["unknown", ["a timeout, not a failure", "not failed"], "lit"]], note: ["fresh orders to the live queue, the backlog to a sideline", "fresh first"] },
  ],
  scale: [
    { k: ["Prime Day 2026", "Prime Day 2026"], on: { ...ALL, tables: "lit", rt: "lit" }, fl: [["app", "gw"], ["gw", "rt"], ["rt", "cart"], ["rt", "chk"], ["chk", "inv"]], figs: [["23–26", ["June 2026, four days", "four days"]], ["44,000+", ["fault-injection runs", "fault tests"], "lit"], ["6×", ["as many as in 2025", "vs 2025"]]], note: ["the dates and the count are published; the plan is ours", "the plan is ours"] },
    {
      k: "the cases that bite",
      kt: "warn",
      on: { app: "warn", gw: "lit", cart: 1, chk: 1, price: "warn", tables: 1 },
      chips: [["guest cart: merged as new tags", "guest cart merges"], ["price changed: review, not charge", "price changed: review"], ["bots: throttled and shed first", "bots shed first"], ["zone lost: two zones carry it", "zone lost: holds"]],
      ctn: ["lit", "warn", "bad", "ok"],
    },
    { k: ["Prime Day 2027, a zone down", "2027, a zone down"], kt: "bad", on: { ...ALL, chk: "warn", inv: "lit", tables: "ok" }, fl: [["rt", "chk", "warn"], ["chk", "inv"]], figs: [["~244M", ["req/s if +27% again", "2027, assumed"]], ["2 of 40", ["cells on a new build", "new build"], "warn"], ["~45/s", ["per sub-counter, 50", "per counter"]]], note: ["the zone loss holds on its own; roll the two cells back first", "roll back first"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, cart: "ok", chk: "ok", rt: "ok" }, fl: [["rt", "cart", "ok"], ["rt", "chk", "ok"], ["chk", "tables", "ok"]], cols: 3, chips: [["never refuse an add", "never refuse"], ["one intent, one order", "one order"], ["one in forty", "one in forty"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Over Prime Day 2026 (23 to 26 June) Amazon's systems made 59 trillion+ requests to DynamoDB, peaking at 192 million a second, and in 2022 shoppers bought 100,000+ items a minute; those are platform totals, not the cart's own load.", tween: 1400 },
      { caption: "Accept adds and removes from any device even while disks, networks and data centres fail; re-price the cart and show the true total; place each order exactly once however often it's retried; never oversell a deal; authorise and hand off once; and keep any failure to a small share of shoppers.", tween: 1400 },
      { caption: "100,000+ items a minute is ~1,700 a second; assuming 1.5× growth since 2022, ~2 items an order and a 4× peak hour, that's ~5,000 orders a second (designed for 20,000) and, at ~20 cart operations an order, ~100,000 cart operations a second (designed for 400,000).", tween: 1400, loop: true },
      { caption: "In 2007 one page called 150+ services, measured at p99.9: if each is slow 0.1% of the time, ~14% of pages hit a slow call. And one deal's stock counter would take ~5,000 writes a second, where the DynamoDB paper's example partition takes 1,000 and no split helps a single item.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Ishaan's add goes through the gateway and the cell router to the cart service, which writes his cart, keyed by customer, with a conditional update on its version; if that partition can't answer in time, the add goes to an add-log in the same cell and is merged on the next read.", tween: 1200, loop: true },
      { caption: "Customers are split into cells by customer id, each a full copy of cart, checkout and orders with its own tables: on our assumptions ~40 cells of up to 8 million customers, so one cell failing is ~2.5% of shoppers. The router maps from memory, so it works with the control plane down.", tween: 1200, loop: true },
      { caption: "Placing the order re-prices the cart at the shared price service, reserves the lines at a fulfilment centre's stock counters, and commits the page's purchase id, the order and an outbox row in one transaction.", tween: 1200, loop: true },
      { caption: "A relay moves the outbox row onto the cell's order queue; the orchestrator authorises the card (a hold, captured when the shipment leaves) and releases one shipment to each fulfilment centre, every step keyed by the order id. The page never waits for the bank.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Dynamo merged divergent carts by union, so an add was never lost but a removed item could resurface; 99.94% of cart requests saw one version. Our cart gives every add a unique tag and lets a remove delete only the tags it saw, with tombstones, so the headphones stay and the removed phone case stays gone.", tween: 1400, loop: true },
      { caption: "An on-demand DynamoDB table absorbs up to twice its previous peak at once, and splitting for traffic takes minutes, so any table forecast above 2× its own history is driven there in a load test before the day. A single hot item can't be split, so it's split in the data model instead.", tween: 1400, loop: true },
      { caption: "Replicas run the same bug, so isolation bounds a bad deploy: builds go out one cell at a time, and the shared price service gives each cell its own 4 of 32 server groups (35,960 combinations, no two cells sharing more than 2), so a poison request from one cell takes out only that cell's capacity.", tween: 1400, loop: true },
      { caption: "The checkout page mints a purchase id when it renders, so a double press and an app retry are one intent: the token, the order and the outbox row commit together and a retry gets the same order, while the same id with a different cart is rejected as a mismatch. Retry at one layer: three tries at five layers is 243× the load.", tween: 1400, loop: true },
      { caption: "Stock is reserved at \"Place your order\", never at add to cart. The deal's 20,000 units sit in 20 sub-counters of 1,000 on different keys, each decremented only while it has stock, so ~5,000 writes a second become ~250 per counter and the deal can't oversell; \"% claimed\" is a cached sum.", tween: 1400, loop: true },
      { caption: "If a processor taking 40% of 1,500 orders a second stops for an hour, ~2.2 million orders wait, and at 50% headroom they need another hour to drain. Fresh orders go to the live queue and the backlog to a sideline queue; a timeout is unknown, retried later with the same key, never as a new authorisation.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Amazon ran 44,000+ fault-injection experiments for Prime Day 2026, more than six times as many as in 2025. In our plan each cell is load-tested past its forecast weeks before, tables forecast above 2× their history are driven to their peak, and days before, deploys slow down and deal stock is split into sub-counters.", tween: 1400, loop: true },
      { caption: "A guest cart merges into the account cart as new tags; a total that changed since the page rendered is rejected for review rather than charged; bots get per-customer limits and are shed before humans; and each cell can carry its peak in two of three zones.", tween: 1400 },
      { caption: "Prime Day 2027, with 2025-to-2026 growth repeated (~244 million requests a second, assumed): a zone lost at the peak holds on its own, the new build in 2 of 40 cells is rolled back first, and a 50,000-unit deal in 50 sub-counters sees ~45 attempts a second on each.", tween: 1400, loop: true },
      { caption: "The lesson: the cart is availability-first and merges, the order is correctness-first behind one atomic write, and cells turn a bad deploy from everyone into one shopper in forty.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
