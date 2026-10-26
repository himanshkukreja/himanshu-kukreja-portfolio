/**
 * The whole side quest, Airbnb stays marketplace: the scale (9M+ active listings from 5.5M+ hosts;
 * 533M nights and seats booked in 2025 for $91.3B; ~10,000 listing updates a second), the estimate
 * (~14,000 searches/s at peak against ~13 reservations/s; availability for every listing in ~0.4 GB of
 * bits; ~$6.9B held, about 28 days of bookings), the architecture (search leaves holding geo cells,
 * availability bits and prices in memory, fed by calendar and pricing events; one uniqueness key per
 * listing-night at Reserve; a double-entry ledger paying hosts the business day after check-in), the
 * deep dives (where-then-when filtering, retrieve-rank-re-rank and map pins, iCal import with a ~1.5 h
 * average blind window, Smart Pricing guardrails, idempotent payouts, risk friction and blind reviews)
 * and edge cases (feeds that lie, prices moving at checkout, New Year's week in North Goa).
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
  guest: { x: 16, y: 40, w: 88, h: 44, l: "Rohan" },
  other: { x: 16, y: 96, w: 88, h: 52, l: "iCal" },
  risk: { x: 16, y: 152, w: 88, h: 44, l: "Risk" },
  search: { x: 128, y: 40, w: 92, h: 44, l: "Search" },
  poller: { x: 128, y: 96, w: 92, h: 52, l: "Poller" },
  reserve: { x: 128, y: 152, w: 92, h: 44, l: "Reserve" },
  leaves: { x: 248, y: 40, w: 120, h: 44, l: "Leaves" },
  cal: { x: 248, y: 96, w: 120, h: 52, l: "Calendar" },
  ledger: { x: 248, y: 152, w: 120, h: 44, l: "Ledger" },
  price: { x: 400, y: 40, w: 184, h: 44, l: "Smart Pricing", n: "Pricing" },
  host: { x: 400, y: 96, w: 184, h: 52, l: "Meera · host", n: "Meera" },
  bank: { x: 400, y: 152, w: 184, h: 44, l: "Meera's bank", n: "Bank" },
};
const E: [string, string][] = [
  ["guest", "search"],
  ["search", "leaves"],
  ["guest", "reserve"],
  ["other", "poller"],
  ["poller", "cal"],
  ["cal", "leaves"],
  ["price", "cal"],
  ["host", "cal"],
  ["reserve", "ledger"],
  ["reserve", "risk"],
  ["ledger", "bank"],
];
const ALL = { guest: 1, other: 1, risk: 1, search: 1, poller: 1, reserve: 1, leaves: 1, cal: 1, ledger: 1, price: 1, host: 1, bank: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Airbnb · the scale", on: { guest: "lit", host: 1, leaves: 1 }, figs: [["9M+", ["active listings", "listings"]], ["533M", ["nights booked, 2025", "nights, 2025"], "lit"], ["~10K/s", ["listing updates", "updates/s"]]], note: ["5.5 million hosts in 220+ countries; $91.3 billion booked in 2025", "5.5M hosts, $91.3B booked"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["map search, free dates only", "free dates only"], ["rank 18 out of thousands", "rank to 18"], ["calendars other sites write", "outside calendars"], ["prices that follow demand", "dynamic prices"], ["hold money until check-in", "hold to check-in"], ["never pay a host twice", "never pay twice"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~14,000 searches a second at peak", "~14K searches/s"], on: { guest: "lit", search: "lit", leaves: 1, reserve: 1 }, fl: [["guest", "search"], ["search", "leaves"]], figs: [["~14K/s", ["searches at peak", "searches/s"], "lit"], ["~13/s", ["reservations at peak", "bookings/s"]], ["0.4 GB", ["of availability bits", "free bits"]]], note: ["400M search requests a day (assumed) against ~365,000 reservations", "search dwarfs bookings"] },
    { k: "money held for weeks", kt: "warn", on: { reserve: 1, ledger: "warn", bank: 1 }, fl: [["reserve", "ledger", "warn"]], figs: [["$6.9B", ["held, end of 2025", "held"], "warn"], ["~28", ["days of bookings", "days held"]], ["~50", ["currencies", "currencies"]]], note: ["paid at booking, paid out the business day after check-in", "paid out after check-in"] },
  ],
  arch: [
    { k: ["1 · search reads a copy in memory", "1 · search"], on: { guest: "lit", search: "lit", leaves: "lit" }, sub: { leaves: ["bits + prices", "in RAM"] }, fl: [["guest", "search"], ["search", "leaves"]], note: ["the root fans out to leaves; each filters by place and dates, then ranks", "root fans out to leaves"] },
    { k: ["2 · calendars and prices stream in", "2 · changes stream in"], on: { other: 1, poller: "lit", cal: "lit", price: 1, host: 1, leaves: 1 }, sub: { cal: ["owns nights", "nights"] }, fl: [["other", "poller"], ["poller", "cal"], ["price", "cal"], ["host", "cal"], ["cal", "leaves"]], note: ["~10,000 updates a second reach the leaves within about a minute", "~10K updates/s, ~1 min"] },
    { k: ["3 · one strict write", "3 · reserve"], on: { guest: 1, reserve: "lit", cal: "lit", risk: 1 }, sub: { cal: ["unique night", "unique"] }, fl: [["guest", "reserve"], ["reserve", "risk"]], note: ["a key on (listing, night): a second insert for the same night fails", "2nd insert for a night fails"] },
    { k: ["4 · money on its own clock", "4 · money"], on: { reserve: 1, ledger: "lit", bank: "lit", host: 1 }, sub: { bank: ["day after check-in", "after check-in"] }, fl: [["reserve", "ledger"], ["ledger", "bank"]], note: ["charge, hold as a liability, then pay out through a double-entry ledger", "hold, then pay out"] },
  ],
  deep: [
    { k: ["1 · where, then when", "1 · where, when"], on: { guest: 1, search: 1, leaves: "lit" }, fl: [["guest", "search"], ["search", "leaves"]], chips: [["geo cells: 9M → ~2,500", "9M → 2,500"], ["3 nights: one bit mask", "3-bit mask"], ["min stay, check-in days", "stay rules"], ["±3 days = 49 date pairs", "49 date pairs"]], ctn: ["lit", "ok", undefined, "sky"] },
    { k: ["2 · retrieve, rank, re-rank", "2 · ranking funnel"], on: { search: "lit", leaves: "lit" }, fl: [["search", "leaves"]], bars: [[["free homes, a Goa weekend", "free homes"], 20000, 20000, "sky"], [["kept by retrieval", "retrieved"], 1000, 20000, "lit"], [["cards on the page", "on screen"], 18, 20000, "ok"]], note: ["IVF clusters are just a filter; mini-pins get ~8× fewer clicks", "mini-pins: 8× fewer clicks"] },
    { k: ["3 · calendars other sites write", "3 · iCal"], kt: "warn", on: { other: "warn", poller: "lit", cal: "lit" }, fl: [["other", "poller", "warn"], ["poller", "cal"]], figs: [["3 h", ["import cycle", "cycle"]], ["~1.5 h", ["blind on average", "avg blind"], "warn"], ["~370/s", ["feeds fetched", "fetches/s"]]], note: ["tag blocks by source, poll by risk, refresh when a guest presses Reserve", "refresh at Reserve"] },
    { k: ["4 · Smart Pricing, with guardrails", "4 · pricing"], on: { price: "lit", cal: 1, host: 1, leaves: 1 }, fl: [["price", "cal"], ["cal", "leaves"]], bars: [[["model suggests ₹19,000", "model"], 19000, 20000, "warn"], [["host maximum ₹16,000", "host max"], 16000, 20000, "sky"], [["next step from ₹11,000: ₹12,650", "next step"], 12650, 20000, "ok"]], note: ["clamped to the host's range, ±15% a step, open quotes left alone", "host range, gradual steps"] },
    { k: ["5 · money and trust", "5 · money, trust"], on: { reserve: 1, ledger: "lit", bank: 1, risk: "lit" }, fl: [["reserve", "ledger"], ["reserve", "risk"], ["ledger", "bank"]], chips: [["double entry, append-only", "double entry"], ["payout key before the call", "payout key"], ["risk score, then friction", "friction"], ["reviews sealed up to 14 days", "blind reviews"]], ctn: ["lit", "ok", "warn", "sky"] },
  ],
  scale: [
    { k: "a feed that lies", kt: "bad", on: { other: "bad", poller: "warn", cal: "ok" }, fl: [["other", "poller", "bad"]], chips: [["empty file from a broken site", "empty feed"], ["keep the last good snapshot", "keep last good"], ["big drops seen twice first", "confirm drops"], ["alert the host", "alert host"]], ctn: ["bad", "ok", "lit", "sky"] },
    { k: ["the price moves at checkout", "price vs quote"], kt: "warn", on: { guest: 1, reserve: "lit", price: "warn", cal: 1 }, fl: [["guest", "reserve"], ["price", "cal", "warn"]], chips: [["search returns a signed quote", "signed quote"], ["checkout charges the quote", "charge the quote"], ["pricing skips open quotes", "skip open quotes"], ["expired: show the new total", "show new total"]], ctn: ["lit", "ok", "warn", "sky"] },
    { k: ["New Year's week in North Goa", "New Year in Goa"], kt: "warn", on: { ...ALL, other: "warn", risk: "warn" }, fl: [["other", "poller", "warn"], ["guest", "reserve"], ["reserve", "risk", "warn"]], figs: [["~36K", ["Goa feeds", "feeds"]], ["40/s", ["polled every 15 min", "15-min poll"], "warn"], ["25K", ["next-day payouts", "payouts"]]], note: ["Goa spreads over every leaf; last-minute new accounts get friction", "no hot shard; friction"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, leaves: "ok", cal: "ok", ledger: "ok" }, fl: [["guest", "search"], ["search", "leaves"], ["reserve", "ledger", "ok"], ["ledger", "bank", "ok"]], cols: 3, chips: [["search a copy", "copy"], ["decide on the source", "exact source"], ["ledger every rupee", "ledger"]], ctn: ["sky", "lit", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Airbnb has more than 9 million active listings and booked 533 million nights and seats in 2025; its listings change about 10,000 times a second.", tween: 1400 },
      { caption: "Show only homes free for the guest's dates, rank 18 out of thousands, keep calendars in step with other sites, price by demand, and hold money until check-in without ever paying twice.", tween: 1400 },
      { caption: "On stated assumptions that is ~14,000 searches a second at peak against ~13 reservations a second, and every listing's availability fits in ~0.4 GB of bits.", tween: 1400, loop: true },
      { caption: "Guests pay at booking and hosts are paid the business day after check-in: $6.9 billion was held at the end of 2025, about 28 days of bookings, in ~50 currencies.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Search reads a copy: the root fans each request out to leaves that hold every listing's location, availability bits and prices in memory, filter by place and dates, then rank.", tween: 1200, loop: true },
      { caption: "The calendar service owns nights; the iCal poller, Smart Pricing and the host's own edits change it, and ~10,000 updates a second reach the leaves within about a minute.", tween: 1200, loop: true },
      { caption: "Reserve is the one strict write: a key on listing and night makes the second booking of a night fail, and every booking is risk-scored.", tween: 1200, loop: true },
      { caption: "Money runs on its own clock: the charge is held as a liability in a double-entry ledger and paid to Meera's bank the business day after check-in.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Where, then when: geo cells cut 9 million listings to ~2,500 in the map, one bit mask checks three free nights, and stay rules and ±3 days (49 date pairs) follow.", tween: 1400, loop: true },
      { caption: "From ~20,000 free homes, two-tower retrieval with IVF clusters keeps ~1,000, a deep model ranks them, and the root re-ranks the page to 18 cards; weaker pins become mini-pins.", tween: 1400, loop: true },
      { caption: "Imported calendars refresh every 3 hours, so a booking on another site is unseen for ~1.5 hours on average: tag blocks by source, poll by risk and refresh when a guest presses Reserve.", tween: 1400, loop: true },
      { caption: "Smart Pricing suggests ₹19,000 for a night, but the host's maximum is ₹16,000 and each update moves at most 15%, so today's ₹11,000 becomes ₹12,650 next.", tween: 1400, loop: true },
      { caption: "Money and trust: append-only double-entry postings, a payout key written before the call, risk scores answered with targeted friction, and reviews sealed until both are in or 14 days pass.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A broken site serves an empty calendar: keep the last good snapshot, confirm big drops on a second fetch and alert the host, rather than freeing nights that are taken.", tween: 1400, loop: true },
      { caption: "Smart Pricing raises a night while Rohan checks out: he pays the signed quote he saw, pricing skips nights in open quotes, and an expired quote shows the new total first.", tween: 1400, loop: true },
      { caption: "New Year's week in North Goa: ~36,000 feeds polled every 15 minutes is 40 fetches a second, Goa spreads over every leaf, and last-minute new accounts get friction.", tween: 1400, loop: true },
      { caption: "The lesson: search fast on a copy, decide exactly on the source, and account for every unit of money you hold for someone else.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
