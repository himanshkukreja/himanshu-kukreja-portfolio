/**
 * The whole side quest, BookMyShow: the mission (1.3 crore people for ~1.5 lakh Coldplay tickets,
 * 4 each), the estimate (~19 checkouts/s vs 1.3M polls/s; ~22 MB for every open seat map), the
 * architecture (stale read plane, all-or-nothing holds on one writer per show, partner chains behind
 * adapters, a hold-pay-ticket saga), the deep dives (seat holds, the partner boundary, the on-sale
 * waiting room, the live seat map) and scale and edge cases (blockbuster Friday, late money, an
 * on-sale and a blockbuster at once).
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
  users: { x: 16, y: 96, w: 84, h: 52, l: "Fans", n: "Fans" },
  map: { x: 124, y: 40, w: 116, h: 44, l: "Seat map", n: "Map" },
  room: { x: 124, y: 152, w: 116, h: 44, l: "Wait room", n: "Queue" },
  hold: { x: 268, y: 96, w: 104, h: 44, l: "Hold", n: "Hold" },
  chain: { x: 400, y: 40, w: 184, h: 44, l: "Chain system", n: "Chain" },
  store: { x: 400, y: 96, w: 184, h: 44, l: "Seat store", n: "Seats" },
  pay: { x: 400, y: 152, w: 100, h: 44, l: "Payment", n: "Pay" },
  ticket: { x: 520, y: 152, w: 64, h: 44, l: "Ticket", n: "QR" },
};
const E: [string, string][] = [
  ["users", "map"],
  ["users", "room"],
  ["room", "hold"],
  ["hold", "map"],
  ["hold", "chain"],
  ["hold", "store"],
  ["hold", "pay"],
  ["pay", "ticket"],
];
const ALL = { users: 1, map: 1, room: 1, hold: 1, chain: 1, store: 1, pay: 1, ticket: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "noon, on-sale day", kt: "bad", on: { users: "bad", room: "lit" }, figs: [["13M", ["logged in", "waiting"], "bad"], ["~1.5 lakh", "tickets", "lit"], ["4", ["per person", "each"]]], note: ["only about one person in 260 can buy", "1 in ~260 can buy"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["each seat sold once", "no double sale"], ["all seats or none", "all or none"], ["holds expire by themselves", "holds expire"], ["ticket or refund, always", "ticket or refund"], ["on-sale can't slow cinema", "isolated"], ["fair to humans, not scripts", "fair"]],
      ctn: ["bad", "lit", undefined, "ok", undefined, "ok"],
    },
    { k: "the cost of waiting", kt: "bad", on: { users: "bad", room: "bad", hold: 1 }, fl: [["users", "room", "bad"]], figs: [["~19/s", ["checkouts", "checkouts"], "ok"], ["1.3M/s", ["polls every 10 s", "naive polls"], "bad"], ["~3,300", ["in checkout", "checking out"]]], note: ["answer \"not yet\" from the edge, never the core", "\"not yet\" from the edge"] },
    { k: "space is tiny", kt: "ok", on: { hold: 1, store: "ok", map: 1 }, figs: [["~63 B", ["one show's map", "one show"]], ["~22 MB", ["every open show", "all shows"], "ok"], ["~200/s", ["peak bookings", "peak"]]], note: ["the problem is who owns a seat, not space", "ownership, not space"] },
  ],
  arch: [
    { k: "two planes", on: ALL, sub: { map: ["seconds stale", "stale"], hold: ["exact", "exact"] }, fl: [["users", "map", "sky"], ["hold", "map", "sky"]], note: ["the seat map never decides; the hold does", "the hold decides"] },
    { k: "1 · all-or-nothing hold", on: { users: 1, room: 1, hold: "lit", store: "ok" }, sub: { hold: ["8 min", "8 min"] }, fl: [["room", "hold"], ["hold", "store", "ok"]], chips: [["H5-H8 free: all 4 held", "all 4 held"], ["H7 taken: nothing held", "none held"]], ctn: ["ok", "bad"] },
    { k: "2 · seats you don't own", kt: "warn", on: { hold: 1, chain: "warn" }, sub: { chain: ["box office too", "POS"] }, fl: [["hold", "chain", "warn"]], chips: [["our hold id = their ref", "hold id as ref"], ["timeout = unknown → ask", "unknown → ask"]], ctn: [undefined, "warn"] },
    { k: "3 · pay, then ticket", kt: "ok", on: { hold: 1, pay: "lit", ticket: "ok", store: 1 }, fl: [["hold", "pay"], ["pay", "ticket", "ok"]], note: ["or release the seats and refund automatically", "or release and refund"] },
  ],
  deep: [
    { k: "1 · one writer per show", on: { hold: "lit", store: "ok" }, fl: [["hold", "store"]], chips: [["one atomic script", "atomic script"], ["expiry lives on the seat", "expiry on seat"], ["hold id sells the seat", "hold id sells"], ["retry = same hold", "same key"]], ctn: ["lit", undefined, "ok"] },
    { k: "2 · the partner boundary", kt: "warn", on: { hold: 1, chain: "warn" }, fl: [["hold", "chain", "warn"]], chips: [["status call, not a new hold", "ask status"], ["show the earlier expiry", "earlier expiry"], ["breaker per chain", "bulkhead"], ["their map is a hint", "map = hint"]], ctn: ["warn", undefined, "ok"] },
    { k: "3 · the on-sale", on: { users: 1, room: "lit", hold: 1 }, fl: [["users", "room"], ["room", "hold"]], chips: [["lottery at 12:00:00", "lottery at open"], ["then arrival order", "then in order"], ["one position per account", "1 per account"], ["admit on completions", "admit on finish"]], ctn: ["lit", undefined, "ok", "lit"] },
    { k: "4 · the live seat map", kt: "sky", on: { hold: 1, map: "lit", users: 1 }, fl: [["hold", "map", "sky"], ["users", "map", "sky"]], chips: [["layout from the CDN", "layout on CDN"], ["2-bit state per seat", "2-bit seats"], ["versioned deltas", "versioned"], ["≤ 1 delta / 500 ms", "≤ 2 a second"]], ct: "sky" },
  ],
  scale: [
    { k: "blockbuster Friday", on: { users: 1, map: "sky", hold: "lit", store: 1 }, fl: [["users", "map", "sky"]], figs: [["~3,000/s", ["seat map opens", "map opens"], "sky"], ["~260/s", ["hold attempts", "holds"]], ["1 shard", ["per hot show", "per show"], "lit"]], note: ["spread the hottest shows so none share a shard", "hot shows on own shards"] },
    { k: "late money, double taps", kt: "warn", on: { hold: 1, pay: "warn", chain: 1, ticket: 1 }, fl: [["hold", "pay", "warn"]], chips: [["paid after expiry → refund", "late → refund"], ["one idempotency key", "1 idem key"], ["box office sold it → re-pick", "sold → re-pick"], ["confirm pending → ask", "pending → ask"]], ctn: ["ok", "ok", "warn", "warn"] },
    { k: "on-sale + blockbuster", on: ALL, sub: { room: ["own capacity", "own"] }, fl: [["room", "hold"], ["hold", "store"], ["hold", "chain"]], chips: [["standing zones = counters", "zones: counters"], ["seated = best available", "best available"], ["payments capped per flow", "capped payments"], ["chains at their own pace", "per-chain pace"]] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, hold: "ok", ticket: "ok" }, fl: [["room", "hold"], ["hold", "pay"], ["pay", "ticket", "ok"]], chips: [["know who owns each seat", "who owns it"], ["tell everyone the truth", "tell the truth"]], ctn: ["ok", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "About 1.3 crore people logged in for one Coldplay sale with roughly 1.5 lakh tickets, at most 4 each: only about one in 260 could buy.", tween: 1400 },
      { caption: "Sell each seat once, hold a booking's seats all together or not at all, let holds expire, and end every payment in a ticket or a refund.", tween: 1400 },
      { caption: "Only ~19 checkouts a second complete, but 13 million browsers polling every 10 s would send 1.3 million requests a second. Waiting is the cost.", tween: 1400, loop: true },
      { caption: "Every open seat map in the country is ~22 MB at 2 bits a seat. Space isn't the problem: ownership and concurrency are.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "A read plane serves seat maps a second or two stale; a small write plane owns holds, bookings and payments. The map never decides.", tween: 1200, loop: true },
      { caption: "On our inventory, one atomic step holds all of H5 to H8 for 8 minutes, or none of them if any seat is already taken.", tween: 1200, loop: true },
      { caption: "For a chain-owned show, the chain's system decides: every call carries our hold id, and a timeout is treated as unknown and resolved by asking.", tween: 1400, loop: true },
      { caption: "The booking saga takes the payment against the held seats, sells them by hold id and issues the ticket, or releases them and refunds.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Each show has one writer. One script checks every seat and holds all or none; the expiry lives on the seat; only the hold id can sell it.", tween: 1400, loop: true },
      { caption: "Across the partner boundary: ask for status instead of re-holding, show the earlier expiry, and keep a breaker per chain so one outage stays its own.", tween: 1400, loop: true },
      { caption: "The on-sale: a lottery for everyone waiting at 12:00:00, arrival order after, one position per account, and admission only as checkouts finish.", tween: 1400, loop: true },
      { caption: "The live map: layout from the CDN, a 2-bit state per seat, and versioned deltas pushed at most twice a second. A gap means refetch.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "When a blockbuster opens, seat-map opens jump to ~3,000 a second and holds to ~260, so the hottest shows go on different shards.", tween: 1400, loop: true },
      { caption: "Money after the hold expired is refunded; a double tap reuses one key; a seat sold at the box office means pick again; a stuck confirm is asked, not guessed.", tween: 1400, loop: true },
      { caption: "An on-sale and a blockbuster at once: standing zones as counters, seated blocks as best available, capped payments and chains at their own pace.", tween: 1400, loop: true },
      { caption: "The lesson: know who owns each seat, make that one decision cheap and exact, and tell everyone else the truth early.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
