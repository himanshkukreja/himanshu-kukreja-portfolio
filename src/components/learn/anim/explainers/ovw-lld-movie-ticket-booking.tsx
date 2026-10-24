/**
 * The whole low-level design lesson, Design a Movie Ticket Booking System: the round (10-minute
 * holds, 50 users for the same seats, why check-then-book races), the classes (catalogue, holds
 * behind SeatLockProvider, the sold set, a booking's life cycle), a hold becoming a booking on a
 * seat map (A2 + A3 held, paid, sold, a retried callback), then a late payment refunded, lock
 * ordering and the follow-ups.
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
  user: { x: 16, y: 40, w: 96, h: 44, l: "Users" },
  svc: { x: 144, y: 40, w: 148, h: 44, l: "BookingService", n: "Service" },
  locks: { x: 324, y: 40, w: 128, h: 44, l: "SeatLocks", n: "Locks" },
  sold: { x: 484, y: 40, w: 100, h: 44, l: "Sold set", n: "Sold" },
  show: { x: 16, y: 150, w: 96, h: 44, l: "Show" },
  booking: { x: 144, y: 150, w: 148, h: 44, l: "Booking" },
  gateway: { x: 324, y: 150, w: 128, h: 44, l: "Payment", n: "Pay" },
};
const E: [string, string][] = [
  ["user", "svc"],
  ["svc", "show"],
  ["svc", "locks"],
  ["locks", "sold"],
  ["svc", "booking"],
  ["gateway", "svc"],
];
const ALL = { user: 1, svc: 1, locks: 1, sold: 1, show: 1, booking: 1, gateway: 1 } as const;
const IDS = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
/** the seat map: overrides by seat → [tone, caption] */
const seats = (o: Record<string, [Tone, Two]>): Tile[] => IDS.map((s) => (o[s] ? [s, o[s][0], o[s][1]] : [s, "mute"]));

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["10 min", ["hold to pay", "to pay"]], ["1 of 50", ["win the same seats", "win"]], ["0", ["seats sold twice", "sold twice"], "ok"]] },
    {
      k: "clarify first",
      on: { user: 1, svc: "lit" },
      chips: [["up to 10 seats, held together", "held together"], ["a hold lasts 10 minutes", "10-min hold"], ["late payment → refund", "late → refund"], ["callbacks can repeat", "repeat callbacks"], ["regular ₹200, premium ₹350", "₹200 / ₹350"], ["cancellations: a follow-up", "cancel: later"]],
      ctn: [undefined, undefined, "warn", "warn"],
    },
    { k: "check-then-book races", kt: "bad", on: { user: "bad", svc: "bad" }, fl: [["user", "svc", "bad"]], tiles: seats({ A2: ["bad", "race"], A3: ["bad", "race"] }), note: ["and no lock can be held for 10 minutes of paying", "no 10-minute locks"] },
  ],
  classes: [
    { k: "three kinds of state", on: ALL, sub: { show: ["catalogue", "seats"], locks: ["holds + TTL", "TTL"], sold: ["for good", "final"], booking: ["the record", "record"] } },
    { k: "a booking's life", on: { svc: 1, booking: "lit" }, chips: [["HELD → CONFIRMED", "→ CONFIRMED"], ["HELD → EXPIRED", "→ EXPIRED"], ["HELD → CANCELLED", "→ CANCELLED"], ["only HELD can confirm", "HELD only"]], ctn: ["ok", "warn", "mute", "sky"] },
    { k: "the lock seam", on: { svc: 1, locks: "lit" }, fl: [["svc", "locks"]], chips: [["in the round: dict + mutex", "dict + mutex"], ["30 servers: Redis SET NX PX", "Redis NX PX"], ["check all, then take all", "all or nothing"], ["expired = free (lazy)", "lazy expiry"]], ct: "sky" },
  ],
  book: [
    { k: "50 users, A2 + A3", on: { user: "lit", svc: 1, locks: "lit", show: 1 }, fl: [["user", "svc"], ["svc", "locks"]], tiles: seats({ A2: ["warn", "BK1"], A3: ["warn", "BK1"] }), note: ["1 hold; 49 told no at once", "1 hold, 49 no"] },
    { k: "pay within 10 minutes", on: { svc: "lit", gateway: "lit", booking: 1, locks: 1 }, fl: [["gateway", "svc"]], tiles: seats({ A2: ["warn", "held"], A3: ["warn", "held"] }), figs: [["₹700", ["2 premium seats", "2 premium"]], ["pay_101", ["after 2 minutes", "at 2 min"], "sky"]] },
    { k: "confirmed", kt: "ok", on: { svc: 1, locks: 1, sold: "ok", booking: "ok" }, fl: [["locks", "sold", "ok"], ["svc", "booking", "ok"]], sub: { booking: ["CONFIRMED", "OK"] }, tiles: seats({ A2: ["ok", "sold"], A3: ["ok", "sold"] }), note: ["hold re-checked, seats sold, hold released", "re-checked, then sold"] },
    { k: "the callback again", on: { gateway: "lit", svc: 1, booking: "ok" }, fl: [["gateway", "svc"]], sub: { booking: ["no change", "same"] }, tiles: seats({ A2: ["ok", "sold"], A3: ["ok", "sold"] }), note: ["already CONFIRMED with pay_101: a no-op", "a no-op"], nt: "ok" },
  ],
  late: [
    { k: "paid 1 s late", kt: "warn", on: { gateway: "warn", svc: 1, booking: "warn" }, fl: [["gateway", "svc", "warn"]], sub: { booking: ["EXPIRED", "EXPIRED"] }, tiles: seats({ A2: ["ok", "sold"], A3: ["ok", "sold"], B1: ["mute", "free"] }), figs: [["601 s", ["after the hold", "late"], "warn"], ["₹200", "refunded", "ok"]] },
    { k: "lock order", kt: "warn", on: { user: "warn", locks: "lit" }, chips: [["user 1: A2, then A3", "1: A2 → A3"], ["user 2: A3, then A2", "2: A3 → A2"], ["→ each waits: deadlock", "deadlock"], ["sort seat ids first", "sort ids"]], ctn: ["warn", "warn", "bad", "ok"] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["30 servers: Redis + Lua", "Redis + Lua"], ["cancel: a refund policy", "refund policy"], ["offers: a pricing strategy", "pricing"], ["live seat maps: events", "seat events"]],
      ct: "ok",
      note: ["BookingService stays the same", "same service"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: users pick seats, get 10 minutes to pay, and get a booking. Fifty users race for the same two seats and one wins.", tween: 1200 },
      { caption: "Clarify: seats are held together, a hold lasts 10 minutes, a late payment is refunded, and the gateway may call back twice.", tween: 1400 },
      { caption: "Checking 'is it free?' and then booking races: others pass the same check in between. And no lock can last 10 minutes.", tween: 1200, loop: true },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "Three kinds of state: the catalogue of show, seats and prices; short-lived holds behind SeatLockProvider; and seats sold for good.", tween: 1200 },
      { caption: "A booking starts HELD and ends CONFIRMED, EXPIRED (paid late or never) or CANCELLED. Only a HELD booking can be confirmed.", tween: 1400 },
      { caption: "Holds sit behind one interface: a dict in the round, Redis SET NX PX in production. Check every seat, then take all of them.", tween: 1200, loop: true },
    ],
  },
  {
    id: "book",
    label: "Hold → booking",
    steps: [
      { caption: "Fifty threads ask for A2 and A3. Inside one lock the provider checks both, then takes both for booking BK00001. 49 are told no.", tween: 1400, loop: true },
      { caption: "BK00001 owes ₹700 for two premium seats. Two minutes in, the gateway reports payment pay_101 and confirm() checks the hold again.", tween: 1400, loop: true },
      { caption: "The hold is still BK00001's, so the seats move to the sold set, the booking becomes CONFIRMED, and the hold is released.", tween: 1400, loop: true },
      { caption: "The gateway retries its callback with the same payment reference. The booking is already CONFIRMED with it, so nothing changes.", tween: 1200, loop: true },
    ],
  },
  {
    id: "late",
    label: "Late & follow-ups",
    steps: [
      { caption: "Riya holds B1 but pays 601 seconds later, after her 10-minute hold. The booking becomes EXPIRED, ₹200 is refunded, B1 is free.", tween: 1400, loop: true },
      { caption: "With a lock per seat, two users locking A2+A3 and A3+A2 in their own order can deadlock. Always take seat locks in sorted order.", tween: 1400 },
      { caption: "Follow-ups: Redis holds across servers, a refund policy for cancellations, a pricing strategy for offers, and live seat events.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
