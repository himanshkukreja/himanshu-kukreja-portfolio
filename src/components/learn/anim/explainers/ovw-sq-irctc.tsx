/**
 * The whole side quest, IRCTC Tatkal: the mission (2M attempts for ~500 seats in a minute,
 * 4,000:1), the estimate (~280,000 req/s in the first 5 s; 0 bytes for losers), the two planes
 * (cached read plane; waiting room → atomic counter → single-writer allocator → hold, pay, PNR),
 * the deep dives (the hot row, adaptive admission, the booking saga, bots and agents) and scale and
 * edge cases (the 10:00 playbook, late payments and double taps, fifty hot trains at once).
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
  users: { x: 16, y: 96, w: 84, h: 52, l: "Users" },
  read: { x: 124, y: 40, w: 116, h: 44, l: "Read plane", n: "Read" },
  room: { x: 124, y: 152, w: 116, h: 44, l: "Wait room", n: "Queue" },
  fraud: { x: 268, y: 40, w: 104, h: 44, l: "Risk gate", n: "Risk" },
  gate: { x: 268, y: 152, w: 104, h: 44, l: "Counter", n: "Gate" },
  pay: { x: 400, y: 40, w: 184, h: 44, l: "Payment", n: "Pay" },
  alloc: { x: 400, y: 152, w: 100, h: 44, l: "Allocator", n: "Alloc" },
  pnr: { x: 520, y: 152, w: 64, h: 44, l: "PNR" },
};
const E: [string, string][] = [
  ["users", "read"],
  ["users", "room"],
  ["room", "fraud"],
  ["room", "gate"],
  ["gate", "alloc"],
  ["alloc", "pay"],
  ["alloc", "pnr"],
];
const ALL = { users: 1, read: 1, room: 1, fraud: 1, gate: 1, pay: 1, alloc: 1, pnr: 1 } as const;
const WRITE = { users: 1, room: 1, gate: 1, alloc: 1, pay: 1, pnr: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Tatkal at 10:00:00", kt: "bad", on: { users: "bad", gate: "lit" }, figs: [["2M", ["attempts in a minute", "in a minute"]], ["~500", "seats", "lit"], ["4,000:1", ["requests per seat", "per seat"], "bad"]], note: ["99.975% must fail: instantly, honestly, fairly", "99.975% must fail, fast"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["each seat sold once", "no double seat"], ["each winner charged once", "no double charge"], ["say no in < 200 ms", "no in < 200 ms"], ["search → PNR in < 15 s", "PNR < 15 s"], ["resist bots and touts", "resist bots"], ["other trains unaffected", "isolate trains"]],
      ctn: ["bad", "bad", "lit"],
    },
    { k: "where the load lands", kt: "bad", on: { users: "bad", room: "bad" }, fl: [["users", "room", "bad"]], figs: [["~33K", ["req/s if smooth", "if smooth"]], ["~280K", ["req/s, first 5 s", "first 5 s"], "bad"], ["~620", ["national record/s", "record/s"]]], note: ["70% of 2 million arrive in the first 5 seconds", "70% in the first 5 s"] },
    { k: "storage is trivial", kt: "ok", on: { alloc: 1, pnr: "ok" }, figs: [["~350 KB", ["500 winners", "winners"], "ok"], ["0 bytes", ["1,999,500 losers", "losers"]], ["~2.5 TB", ["7-year audit", "7 years"]]], note: ["an admission-control problem, not a storage problem", "admission, not storage"] },
  ],
  arch: [
    { k: "two planes", on: ALL, sub: { read: ["1–2 s stale", "stale"], gate: ["write plane", "write"] }, fl: [["users", "read", "sky"], ["users", "room"]], note: ["search can never take booking down: they share nothing", "they share nothing"] },
    { k: "1 · the waiting room", on: { users: 1, room: "lit", fraud: 1 }, sub: { room: ["shuffled", "shuffle"], fraud: ["OTP, bots", "OTP"] }, fl: [["users", "room"], ["room", "fraud"]], note: ["250 ms buckets, shuffled, so scripts don't win", "shuffled 250 ms buckets"] },
    { k: "2 · the counter", on: { room: 1, gate: "lit", alloc: "ok" }, sub: { gate: ["500 → 0", "500"] }, fl: [["room", "gate"], ["gate", "alloc", "ok"]], chips: [["TICKET_TO_TRY × 500", "500 tickets"], ["1,999,500 rejected in ms", "rest: no, in ms"]], ctn: ["ok", "bad"] },
    { k: "3 · hold, pay, PNR", kt: "ok", on: { gate: 1, alloc: "lit", pay: 1, pnr: "ok" }, sub: { alloc: ["1 writer", "1 writer"], pay: ["5-minute hold", "hold"] }, fl: [["gate", "alloc"], ["alloc", "pay"], ["alloc", "pnr", "ok"]], note: ["or release the seat and refund automatically", "or release and refund"] },
  ],
  deep: [
    { k: "1 · the hottest row", kt: "bad", on: { room: 1, gate: "lit", alloc: 1 }, sub: { gate: ["atomic Lua", "Lua"] }, fl: [["room", "gate"]], chips: [["UPDATE: one row lock", "one row lock"], ["10 shards = 10 hot rows", "10 hot rows"], ["a dumb atomic counter", "atomic counter"], ["DB sees ~500, not 2M", "DB sees ~500"]], ctn: ["bad", "bad", "ok", "ok"] },
    { k: "2 · adaptive admission", on: { room: "lit", gate: 1, alloc: 1 }, fl: [["room", "gate"]], bars: [[["healthy: 1,000/s", "healthy 1,000"], 1000, 1000, "ok"], [["DB > 50 ms: halved", "slow: halved"], 500, 1000, "warn"], [["floor: 100/s", "floor 100"], 100, 1000, "bad"]], note: ["the core reports CPU, DB latency, payment success every second", "health reported every 1 s"] },
    {
      k: "3 · the booking saga",
      on: { alloc: "lit", pay: "warn", pnr: 1, gate: 1 },
      fl: [["alloc", "pay", "warn"]],
      cols: 3,
      chips: [["SEAT_HELD 5 min", "HELD"], ["PAYMENT_INITIATED", "PAYING"], ["PNR_CONFIRMED", "PNR"], ["HOLD_EXPIRED", "EXPIRED"], ["COMPENSATING", "REFUND"], ["DEEMED_PENDING", "PENDING"]],
      ctn: [undefined, undefined, "ok", "bad", "bad", "warn"],
      ct: "mute",
    },
    { k: "4 · bots and touts", kt: "warn", on: { users: "warn", room: 1, fraud: "lit" }, sub: { fraud: ["step up", "step up"] }, fl: [["room", "fraud"]], chips: [["Aadhaar OTP (Jul 2025)", "Aadhaar OTP"], ["agents barred 30 min", "agents: 30 min"], ["one session per device", "1 session"], ["fill speed, IP, velocity", "behaviour"]], note: ["30.3 million suspicious IDs deactivated in 2025", "30.3M IDs deactivated"] },
  ],
  scale: [
    { k: "the Tatkal-day playbook", on: WRITE, chips: [["09:30 pre-scale, warm", "09:30 pre-scale"], ["09:55 set the counters", "09:55 counters"], ["10:00 adaptive admit", "10:00 admit"], ["10:15 scale back down", "10:15 down"]], ctn: [undefined, undefined, "lit"] },
    { k: "late payments, double taps", kt: "warn", on: { alloc: 1, pay: "warn", pnr: 1, users: "warn", room: 1, gate: 1 }, sub: { pay: ["after expiry", "late"] }, fl: [["alloc", "pay", "warn"]], chips: [["late payment → refund", "late → refund"], ["one idempotency key", "1 idem key"]], ct: "ok", note: ["every captured rupee ends as a PNR or a refund", "PNR or refund, always"] },
    { k: "fifty hot trains", on: ALL, sub: { gate: ["× 50", "× 50"], alloc: ["× 50", "× 50"] }, fl: [["room", "gate"], ["gate", "alloc"], ["users", "read", "sky"]], chips: [["a counter per pool", "per-pool counter"], ["hottest on own shards", "own shards"], ["bulkheads per train", "bulkheads"], ["sell-outs → read plane", "read plane"]] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, gate: "ok", alloc: "ok" }, fl: [["users", "room"], ["room", "gate"], ["gate", "alloc", "ok"]], chips: [["fail instantly, fairly", "fail fast"], ["only real contention", "real contention"]], ctn: ["bad", "ok"], note: ["almost every request must fail", "most requests must fail"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Tatkal opens at 10:00:00: about 2 million people try for one hot train's ~500 seats within a minute, 4,000 requests for every seat.", tween: 1400 },
      { caption: "Sell each seat once, charge each winner once, tell the other 99.975% no in under 200 ms, resist bots, and leave other trains untouched.", tween: 1400 },
      { caption: "70% arrive in the first 5 seconds: ~280,000 requests a second for one train. The whole country's record is ~620 bookings a second.", tween: 1400, loop: true },
      { caption: "Storage is trivial: the 500 winners need ~350 KB, the 1,999,500 losers zero bytes. This is admission control, not a storage problem.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Two planes: a cached read plane for search, a second or two stale, and a tiny write plane for booking. They share nothing.", tween: 1200, loop: true },
      { caption: "A virtual waiting room takes everyone first, shuffles arrivals in 250 ms buckets so scripts don't win, and admits only what booking can absorb.", tween: 1200, loop: true },
      { caption: "An atomic Lua counter per pool, starting at 500, hands out TICKET_TO_TRY and rejects everyone else in milliseconds, storing nothing.", tween: 1200, loop: true },
      { caption: "Only the admitted reach a single-writer allocator: hold a berth for 5 minutes, take payment, issue the PNR, or release the seat and refund.", tween: 1400, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "A plain UPDATE puts 280,000 requests a second on one row lock, and 10 shards just make 10 hot rows. So put a dumb atomic counter in front.", tween: 1400, loop: true },
      { caption: "Admission adapts every second to the core's health: 1,000 a second when healthy, halved once DB latency passes 50 ms, never below 100.", tween: 1600, loop: true },
      { caption: "The saga: a held seat is gone from the pool; a failed payment releases it and refunds; a timed-out payment is reconciled, never guessed.", tween: 1400, loop: true },
      { caption: "Bots and touts: Aadhaar OTP since July 2025, agents barred for the first 30 minutes, one session per device, and fill-speed and IP checks.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "The playbook: pre-scale and warm caches at 9:30, freeze deploys and set counters at 9:55, admit adaptively at 10:00, scale down by 10:15.", tween: 1400 },
      { caption: "A payment confirming after the 5-minute hold expired is refunded with priority; a double tap reuses one idempotency key and charges once.", tween: 1200, loop: true },
      { caption: "Fifty hot trains at 10:00: a counter and an allocator per pool, the hottest on dedicated shards, and bulkheads so one can't sink another.", tween: 1400, loop: true },
      { caption: "The lesson: almost every request must fail. Make failing instant, honest and fair, and let only real contention reach real inventory.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
