/**
 * The whole side quest, Flipkart Big Billion Days: the scale (6.3M concurrent users in a minute in the
 * 2026 opening hour; 6–8× the usual transactions; ~1,000× the payment requests), the estimate (~3.2M
 * requests/s at the edge, ~630,000/s at services; ~30,000 taps/s on one 5,000-unit deal; ~1,200 orders/s
 * at the opening), the architecture (the sale staged as a version and switched by one pointer; a line
 * and tokens per deal at the edge; stock holds and an idempotent checkout; a delivery date backed by a
 * reserved wave slot), the deep dives (the midnight switch and failing closed on prices, the 2-second
 * lottery and units × 1.3 tokens, holds with expiry, unknown payments and per-bank breakers, waves that
 * spill) and edge cases (a ₹999 typo, a dark fulfilment centre, Day 1 a month before Diwali).
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
  rohan: { x: 16, y: 40, w: 88, h: 44, l: "Rohan" },
  cdn: { x: 16, y: 96, w: 88, h: 48, l: "CDN" },
  price: { x: 16, y: 156, w: 88, h: 40, l: "Prices" },
  gw: { x: 128, y: 40, w: 92, h: 44, l: "Gateway" },
  adm: { x: 128, y: 96, w: 92, h: 48, l: "Deal line", n: "Line" },
  ops: { x: 128, y: 156, w: 92, h: 40, l: "Sale ops", n: "Ops" },
  inv: { x: 248, y: 40, w: 120, h: 44, l: "Inventory" },
  chk: { x: 248, y: 96, w: 120, h: 48, l: "Checkout" },
  prom: { x: 248, y: 156, w: 120, h: 40, l: "Promise" },
  bank: { x: 400, y: 40, w: 184, h: 44, l: "Banks · UPI, cards", n: "Banks" },
  pay: { x: 400, y: 96, w: 184, h: 48, l: "Payments" },
  fc: { x: 400, y: 156, w: 184, h: 40, l: "Fulfilment centre", n: "Centre" },
};
const E: [string, string][] = [
  ["rohan", "gw"],
  ["rohan", "cdn"],
  ["price", "cdn"],
  ["ops", "price"],
  ["gw", "adm"],
  ["adm", "chk"],
  ["chk", "inv"],
  ["chk", "pay"],
  ["pay", "bank"],
  ["chk", "prom"],
  ["prom", "fc"],
];
const ALL = { rohan: 1, cdn: 1, price: 1, gw: 1, adm: 1, ops: 1, inv: 1, chk: 1, prom: 1, bank: 1, pay: 1, fc: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Flipkart · the scale", on: { rohan: "lit", cdn: 1, gw: 1 }, figs: [["6.3M", ["users in a minute", "in a minute"], "lit"], ["6–8×", ["usual transactions", "transactions"]], ["~1,000×", ["payment requests", "payments"]]], note: ["287 million+ Early Access sessions; 7.3M shipments on a 2025 peak day", "287M+ sessions"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["open the sale at one moment", "one moment"], ["never sell a unit more", "never oversell"], ["checkout at many times usual", "checkout at peak"], ["search 150M products", "150M products"], ["charge the price shown", "price shown"], ["a delivery date you keep", "dates you keep"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~3.2 million requests a second", "~3.2M req/s"], on: { rohan: "lit", cdn: "lit", gw: "lit", price: 1 }, fl: [["rohan", "cdn"], ["rohan", "gw"], ["price", "cdn"]], figs: [["~3.2M/s", ["at the edge", "at the edge"], "lit"], ["~80%", ["answered at the edge", "edge-served"]], ["~630K/s", ["reach services", "services"]]], note: ["6.3M open apps, a call every 2 s (assumed); designed for ~1.3M a second", "design for ~1.3M/s"] },
    { k: ["one deal, 300,000 thumbs", "one hot deal"], kt: "warn", on: { rohan: 1, gw: "warn", adm: "warn", inv: 1 }, fl: [["rohan", "gw", "warn"], ["gw", "adm", "warn"]], figs: [["5,000", ["units", "units"]], ["~30K/s", ["taps on one product", "taps/s"], "warn"], ["~1,200/s", ["orders at the opening", "orders/s"]]], note: ["at most 5,000 taps can ever succeed; orders designed for 5,000 a second", "at most 5,000 win"] },
  ],
  arch: [
    { k: ["1 · the sale is a version", "1 · one switch"], on: { ops: "lit", price: "lit", cdn: "lit", rohan: 1 }, sub: { price: ["v42", "v42"] }, fl: [["ops", "price"], ["price", "cdn"], ["rohan", "cdn"]], note: ["prices, deals and pages pushed ahead; at 12:00:00 one pointer flips", "one pointer flips at 12:00"] },
    { k: ["2 · a line per deal", "2 · the deal line"], on: { rohan: 1, gw: "lit", adm: "lit", chk: 1 }, sub: { adm: ["tokens", "tokens"] }, fl: [["rohan", "gw"], ["gw", "adm"]], note: ["only the deal's Buy now queues; a token is the only way to the stock", "tokens reach the stock"] },
    { k: ["3 · hold, then charge", "3 · checkout"], on: { adm: 1, chk: "lit", inv: "lit", pay: "lit", bank: 1 }, sub: { inv: ["10-min holds", "holds"] }, fl: [["adm", "chk"], ["chk", "inv"], ["chk", "pay"], ["pay", "bank"]], note: ["one idempotency key to the bank; a second tap finds the first attempt", "one key per attempt"] },
    { k: ["4 · a date with a slot behind it", "4 · the promise"], on: { chk: 1, prom: "lit", fc: "lit" }, sub: { prom: ["wave capacity", "waves"] }, fl: [["chk", "prom"], ["prom", "fc"]], note: ["checkout reserves a wave slot; the order's date is the slot's date", "the date is a reserved slot"] },
  ],
  deep: [
    { k: ["1 · the midnight switch", "1 · midnight"], kt: "warn", on: { ops: 1, price: "lit", cdn: "lit", rohan: 1, gw: "warn" }, fl: [["ops", "price"], ["price", "cdn"], ["rohan", "cdn"]], chips: [["warm every cache before 12:00", "warm caches"], ["a new version, not a TTL", "version, not TTL"], ["shed tier-3 widgets first", "shed tier 3"], ["price unknown: no Buy button", "fail closed"]], ctn: ["lit", "ok", "warn", "bad"] },
    { k: ["2 · 5,000 phones, 300,000 thumbs", "2 · the deal line"], on: { rohan: 1, gw: 1, adm: "lit", chk: 1 }, fl: [["rohan", "gw"], ["gw", "adm"], ["adm", "chk"]], chips: [["random order in the first 2 s", "2 s lottery"], ["tokens = units × 1.3", "units × 1.3"], ["one per customer and address", "one per customer"], ["\"sold out\" published once", "sold out on CDN"]], ctn: ["sky", "lit", "ok", "warn"] },
    { k: ["3 · holding stock without overselling", "3 · stock holds"], on: { chk: 1, inv: "lit" }, fl: [["chk", "inv"]], figs: [["~6,500", ["holds, 5,000 units", "holds"], "lit"], ["10 min", ["unpaid hold expires", "hold"]], ["30 min", ["cap, money in flight", "in flight"], "warn"]], note: ["available + held + sold = on hand, per SKU per warehouse", "available + held + sold"] },
    { k: ["4 · checkout and the payment surge", "4 · payments"], kt: "warn", on: { chk: "lit", pay: "warn", bank: "warn" }, fl: [["chk", "pay"], ["pay", "bank", "warn"]], chips: [["one key, one attempt", "one key"], ["a timeout is unknown, not failed", "unknown, not failed"], ["order + outbox, one transaction", "outbox"], ["a breaker per bank", "breaker per bank"]], ctn: ["lit", "warn", "ok", "sky"] },
    { k: ["5 · promises that survive the surge", "5 · delivery dates"], on: { chk: 1, prom: "lit", fc: "lit" }, fl: [["chk", "prom"], ["prom", "fc"]], figs: [["20,000", ["units, 12:30 wave", "12:30 wave"]], ["13:30", ["truck to Bhagalpur", "truck"], "lit"], ["+1 day", ["if an order spills", "spill"], "warn"]], note: ["as the wave fills, new viewers see 14 Oct; placed orders keep 13 Oct", "new viewers see 14 Oct"] },
  ],
  scale: [
    { k: ["₹999 instead of ₹9,999", "a price typo"], kt: "bad", on: { ops: "bad", price: "warn", cdn: 1 }, fl: [["ops", "price", "bad"]], chips: [["70% below its 90-day low", "guardrail"], ["needs a second approval", "2nd approval"], ["kill switch pauses the deal", "kill switch"], ["order policy decided first", "policy first"]], ctn: ["bad", "sky", "warn", "ok"] },
    { k: ["a fulfilment centre goes dark", "a centre goes dark"], kt: "bad", on: { chk: 1, prom: "warn", fc: "bad" }, fl: [["prom", "fc", "bad"]], chips: [["wave capacity set to 0", "capacity 0"], ["new orders go elsewhere", "route elsewhere"], ["or see a later date", "later date"], ["moved dates told now", "tell customers"]], ctn: ["bad", "ok", "warn", "sky"] },
    { k: ["Day 1, a month before Diwali", "Day 1"], kt: "warn", on: { ...ALL, bank: "bad", pay: "warn", price: "warn" }, fl: [["rohan", "gw"], ["gw", "adm"], ["chk", "pay"], ["pay", "bank", "bad"]], figs: [["10M", ["users, forecast", "forecast"]], ["13,000", ["tokens, 10,000 units", "tokens"], "lit"], ["~20 s", ["one issuer's cards", "slow issuer"], "bad"]], note: ["a wrong offer is fixed as v43; placed orders keep the price they saw", "fix the offer as v43"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, adm: "ok", inv: "ok", prom: "ok" }, fl: [["rohan", "cdn"], ["gw", "adm"], ["chk", "inv", "ok"], ["chk", "prom", "ok"]], cols: 3, chips: [["queue the deal", "queue the deal"], ["cache the store", "cache the store"], ["reserve, then charge", "reserve first"]], ctn: ["sky", "lit", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Flipkart reported 6.3 million concurrent users in a minute in the opening hour of The Big Billion Days 2026; the sale brings 6–8 times the usual transactions and about 1,000 times the payment requests.", tween: 1400 },
      { caption: "Open the sale at one moment, sell limited deals fairly without one unit too many, keep checkout and payments up at many times the usual rate, search 150 million products, and keep every price and delivery date true.", tween: 1400 },
      { caption: "On stated assumptions, 6.3 million open apps making a call every 2 seconds is ~3.2 million requests a second at the edge; with ~80% answered there, ~630,000 a second reach services.", tween: 1400, loop: true },
      { caption: "One deal has 5,000 units and draws ~30,000 taps a second, of which at most 5,000 can ever succeed; orders reach ~1,200 a second at the opening, and the design is for 5,000.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The sale is a version, not an event: prices, offers, deal states and pages are built and pushed to every cache and the CDN before midnight, and at 12:00:00 one pointer flips from v41 to v42.", tween: 1200, loop: true },
      { caption: "Only a deal's Buy now button queues: deal admission at the edge hands out short-lived tokens, one per customer, and a token is the only way to reach the stock.", tween: 1200, loop: true },
      { caption: "Checkout holds a unit for 10 minutes and creates the order in PENDING_PAYMENT with an idempotency key the payment carries, so a second tap finds the first attempt instead of charging twice.", tween: 1200, loop: true },
      { caption: "The date on the order is a slot reserved in a warehouse wave at checkout, not the page's cached date, and the confirmed order goes over the message bus to the fulfilment centre.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "The worst minute is on the calendar: warm every cache, build the sale's prices as a new version instead of letting TTLs expire at midnight, shed tier-3 widgets first, and if a price can't be read, show no Buy button.", tween: 1400, loop: true },
      { caption: "Taps in the first 2 seconds count as simultaneous and are ordered randomly, so fibre doesn't beat 4G; tokens are issued for units × 1.3, one per customer, device and address, and \"sold out\" is published once on the CDN.", tween: 1400, loop: true },
      { caption: "A unit is taken when checkout starts: ~6,500 holds for 5,000 units, each lapsing after 10 minutes unless money is in flight, up to a cap; available + held + sold always equals what's on hand.", tween: 1400, loop: true },
      { caption: "A timeout is unknown, not failed: the order waits in PAYMENT_UNKNOWN while a reconciler polls the gateway, the paid state and an outbox row commit in one transaction, and a breaker per bank demotes a slow issuer.", tween: 1400, loop: true },
      { caption: "The 12:30 wave near Kolkata takes 20,000 units for the 13:30 truck; orders that don't fit spill and lose a day, so as it fills the page shows 14 October to new viewers while placed orders keep 13 October.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A typo prices a phone at ₹999 instead of ₹9,999: a price more than 70% below its 90-day low needs a second approval or the build fails, a kill switch pauses a deal in seconds, and the policy for placed orders is set before the sale.", tween: 1400, loop: true },
      { caption: "A power failure stops a fulfilment centre for six hours: its wave capacity is set to zero, new orders go to other centres or see a later date, and customers whose date moves are told.", tween: 1400, loop: true },
      { caption: "Day 1, forecast at 10 million users: 13,000 tokens for a 10,000-unit deal, a slow issuer's cards demoted behind UPI, and a wrong 25% bank offer fixed by flipping to v43 while placed orders keep their price.", tween: 1400, loop: true },
      { caption: "The lesson: queue the deal, cache the store, and split every promise into a cached hint and a reserved commitment; never accept an order against a number that was only true a moment ago.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
