/**
 * Interview problem 19, the whole problem (design a hotel reservation system): requirements (room
 * types, per-hotel overbooking, idempotent booking, money matching rooms), the estimate (30
 * bookings/s, 3,000 reads/s, 36.5M inventory rows), the design (cached search, one Postgres for the
 * booking decision), the last-room race (conditional update, all nights or none) and the reservation
 * saga (hold, pay, confirm or expire, double clicks, late payments).
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

/* ---------------------------------------------------------------- overview engine (shared shape) */
type K = "t" | "s" | "k" | "d";
type Nd = [x: number, y: number, w: number, h: number, label: string];
type St = {
  c: string; // caption (narrated)
  k: string; // kicker, top left
  on: Record<string, string>; // visible nodes → "tone:sub|narrow sub" (tone: lit ok bad warn sky mute dim)
  w?: string[]; // wires "a>b:tone" (">" solid, "~" dashed, ")" vertical-then-horizontal, "^" horizontal-then-vertical)
  go?: string[]; // moving tokens "a>b:tone*count@delay"
  m?: [x: number, y: number, w: number, label: string, v: number, max: number, tone?: Tone];
  x?: [x: number, y: number, text: string, k?: K, anchor?: "start" | "middle" | "end"][];
  n: string; // bottom note "tone:text|narrow"
  tw?: number;
  ms?: number;
  lp?: boolean;
};
type Vr = { id: string; label: string; s: St[] };
type P = { x: number; y: number };
const TONES = ["lit", "ok", "bad", "warn", "sky", "mute", "dim"];
const nar = (s: string, n: boolean) => {
  const i = s.indexOf("|");
  return i < 0 ? s : n ? s.slice(i + 1) : s.slice(0, i);
};
const tn = (v: string): [Tone | "dim", string] => {
  const i = v.indexOf(":");
  const h = i < 0 ? v : v.slice(0, i);
  return TONES.includes(h) ? [h as Tone | "dim", i < 0 ? "" : v.slice(i + 1)] : [undefined, v];
};
const WR = /^(\w+)([>~)^])(\w+)(?::(\w+))?(?:\*(\d+))?(?:@([\d.]+))?$/;
function route(a: Nd, b: Nd, mode: string): P[] {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  if (mode === "^") {
    const qx = bx + bw / 2;
    const down = by > ay;
    const q = { x: qx, y: down ? by : by + bh };
    if (qx > ax && qx < ax + aw) return [{ x: qx, y: down ? ay + ah : ay }, q];
    const p = { x: qx > ax ? ax + aw : ax, y: ay + ah / 2 };
    return [p, { x: qx, y: p.y }, q];
  }
  if (mode === ")") {
    const qy = by + bh / 2;
    const p = { x: ax + aw / 2, y: qy > ay ? ay + ah : ay };
    return [p, { x: p.x, y: qy }, { x: bx > ax ? bx : bx + bw, y: qy }];
  }
  if (ax + aw <= bx || bx + bw <= ax) {
    const r = bx > ax;
    const p = { x: r ? ax + aw : ax, y: ay + ah / 2 };
    const q = { x: r ? bx : bx + bw, y: by + bh / 2 };
    const mx = (p.x + q.x) / 2;
    return p.y === q.y ? [p, q] : [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
  }
  const d = by > ay;
  const p = { x: ax + aw / 2, y: d ? ay + ah : ay };
  const q = { x: bx + bw / 2, y: d ? by : by + bh };
  const my = (p.y + q.y) / 2;
  return p.x === q.x ? [p, q] : [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
}
function along(pts: P[], f: number): P {
  const ls = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let r = f * ls.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ls.length; i++) {
    if (r <= ls[i] || i === ls.length - 1) {
      const u = ls[i] ? Math.min(1, r / ls[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
    }
    r -= ls[i];
  }
  return pts[0];
}
function Overview({ V, N, p }: { V: Vr[]; N: Record<string, Nd>; p: SceneProps }) {
  const v = V.find((x) => x.id === p.variant) ?? V[0];
  const s = v.s[Math.min(p.step, v.s.length - 1)];
  const pr = p.step > 0 ? v.s[p.step - 1] : undefined;
  const e = ease(p.t);
  const wires = [...(s.w ?? []), ...(s.go ?? [])].map((w) => WR.exec(w)).filter((m): m is RegExpExecArray => !!m && m[1] in s.on && m[3] in s.on && !!N[m[1]] && !!N[m[3]]);
  const toks = (s.go ?? []).flatMap((g, gi) => {
    const m = WR.exec(g);
    if (!m || !N[m[1]] || !N[m[3]]) return [];
    const pts = route(N[m[1]], N[m[3]], m[2]);
    const c = Number(m[5] ?? 1);
    return Array.from({ length: c }, (_, i) => {
      const d = Number(m[6] ?? 0); // start delay, as a fraction of the tween
      const u = seg(p.t, d + i * 0.1, d + (1 - d) * 0.6 + i * 0.1);
      const f = s.lp ? (p.clock * 0.5 + i / c) % 1 : 0.94 * u;
      return { ...along(pts, f), tone: (m[4] ?? "lit") as Tone, key: `${gi}-${i}`, o: s.lp || (u > 0 && u < 1) ? 1 : 0 };
    });
  });
  const mv = s.m && pr?.m && pr.m[3] === s.m[3] ? lerp(pr.m[4], s.m[4], e) : s.m?.[4] ?? 0;
  const [nt, ntext] = tn(s.n);
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start">
        {nar(s.k, p.narrow)}
      </Txt>
      {wires.map((m, i) => {
        const pts = route(N[m[1]], N[m[3]], m[2]);
        const tone = m[4] as Tone;
        return <Wire key={i} d={`M${pts.map((q) => `${q.x} ${q.y}`).join("L")}`} tone={tone} dash={m[2] === "~"} arrow />;
      })}
      {Object.entries(s.on).map(([id, val]) => {
        const nd = N[id];
        if (!nd) return null;
        const [tone, sub] = tn(val);
        const fresh = pr && !(id in pr.on);
        const sb = sub ? nar(sub, p.narrow) : undefined;
        const thin = nd[3] < 36; // short boxes carry their state inline: "Payment · < 3 s"
        return (
          <Box key={id} x={nd[0]} y={nd[1]} w={nd[2]} h={nd[3]} label={thin && sb ? (nd[4] ? `${nar(nd[4], p.narrow)} · ${sb}` : sb) : nar(nd[4], p.narrow)} sub={thin ? undefined : sb} tone={tone === "dim" ? undefined : tone} dim={tone === "dim"} opacity={fresh ? e : undefined} />
        );
      })}
      {toks.map((k) => (
        <Token key={k.key} x={k.x} y={k.y} s={10} tone={k.tone} opacity={k.o} />
      ))}
      {s.m && (
        <g>
          <Txt x={s.m[0]} y={s.m[1] - 7} k="s" anchor="start">
            {nar(s.m[3], p.narrow)}
          </Txt>
          <Meter x={s.m[0]} y={s.m[1]} w={s.m[2]} h={10} value={mv} max={s.m[5]} tone={s.m[6]} />
        </g>
      )}
      {(s.x ?? []).map(([x, y, text, k, a], i) => {
        const [tone, body] = tn(text);
        return (
          <Txt key={i} x={x} y={y} k={k ?? "s"} anchor={a ?? "start"} tone={tone === "dim" ? "mute" : tone}>
            {nar(body, p.narrow)}
          </Txt>
        );
      })}
      <Txt x={16} y={304} anchor="start" tone={nt === "dim" ? "mute" : nt}>
        {nar(ntext, p.narrow)}
      </Txt>
    </g>
  );
}
const build = (V: Vr[], N: Record<string, Nd>) =>
  defineExplainer({
    w: 600,
    h: 320,
    variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.c, tween: s.tw ?? 1400, ms: s.ms ?? 3800, loop: s.lp })) })),
    Scene: (p: SceneProps) => <Overview V={V} N={N} p={p} />,
  });
/* ---------------------------------------------------------------- this problem */

const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const fig = (i: number, y: number, label: string): Nd => [16 + i * 199, y, 170, 60, label];
const N: Record<string, Nd> = {
  g: [16, 50, 96, 52, "Guest"],
  gw: [128, 50, 100, 52, "Gateway|GW"],
  sr: [244, 50, 100, 52, "Search"],
  rc: [364, 50, 100, 52, "Redis"],
  rs: [244, 150, 100, 52, "Booking"],
  db: [364, 150, 100, 52, "Postgres|PG"],
  psp: [244, 236, 100, 46, "Payments|Pay"],
  sw: [364, 236, 100, 46, "Sweeper|Sweep"],
  a1: fig(0, 64, "233K/day"),
  a2: fig(1, 64, "30/s"),
  a3: fig(2, 64, "3,000/s|3K/s"),
  b2: fig(1, 190, "36.5M rows|36.5M"),
  n0: fig(0, 64, "Dec 24"),
  n1: fig(1, 64, "Dec 25"),
  n2: fig(2, 64, "Dec 26"),
  s1: fig(0, 64, "PENDING"),
  s2: fig(1, 64, "CONFIRMED|PAID"),
  s3: fig(1, 190, "EXPIRED"),
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { g: "", gw: "", sr: "", rc: "", rs: "", db: "", psp: "", sw: "" };
const wires = ["g>gw", "gw>sr", "sr>rc", "gw>rs", "rs>db", "rs>psp", "sw>db"];

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Guests book a room type for a range of nights and pay. Never sell more than the hotel has, plus any overbooking it allows.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:reserve a room type for check-in → check-out|room type + nights", t1: "warn:never above inventory × (1 + overbooking)|≤ inventory + overbook", t2: "one reservation per click, however many clicks|one per click", t3: "money matches rooms: no charge without a room|money = rooms", t4: "search may be stale; the booking may not|stale search ok" },
        n: "correctness, not scale, is the problem|correctness over scale",
      },
      {
        c: "A million rooms, 70% full, 3-night stays: about 233,000 bookings a day, 30 a second at peak, and about 3,000 availability reads.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "bookings|bookings", a2: "ok:peak writes|writes", a3: "peak reads|reads" },
        w: ["a1>a2", "a2>a3"],
        n: "ok:one relational database handles 30 writes/s|one database is enough",
      },
      {
        c: "Inventory is one row per hotel, room type and night: 5,000 × 20 × 365, about 36.5 million rows. A few gigabytes.",
        k: "phase 2 · data|data",
        on: { a1: "", a2: "", a3: "", b2: "lit:inventory|nights" },
        w: ["a1>a2", "a2>a3"],
        n: "the hard part: two writes, one last room|two writes, one room",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "Browsing reads hotels and a Redis availability snapshot up to a minute old. It's a hint, not a promise.",
        k: "phase 4 · browse|browse",
        on: { ...all, sr: "lit:hotels", rc: "warn:≤ 1 min old|1 min" },
        w: wires,
        go: ["g>gw:lit", "gw>sr:lit@0.2", "sr>rc:lit@0.4"],
        n: "3,000 reads/s never touch the booking table|reads skip the DB",
      },
      {
        c: "Booking is one transaction: insert a PENDING reservation with its idempotency key and reserve one unit on each night.",
        k: "phase 4 · hold|hold",
        on: { ...all, rs: "lit:hold 10 min|hold", db: "ok:1 txn" },
        w: wires,
        go: ["gw>rs:lit", "rs>db:lit@0.3"],
        n: "reservation + inventory in the same database|same DB, local txn",
      },
      {
        c: "The guest pays within the hold and the reservation is confirmed. If not, a sweeper expires the hold and releases the nights.",
        k: "phase 4 · pay or expire|pay",
        on: { ...all, psp: "ok:paid", db: "ok:confirmed|done", sw: "warn:every min|1/min" },
        w: wires,
        go: ["rs>psp:ok", "sw>db:warn@0.4"],
        n: "the payment call carries the reservation ID|charge keyed by reservation",
      },
    ],
  },
  {
    id: "race",
    label: "Last room",
    s: [
      {
        c: "Two guests read one room left, then both add one. Both updates succeed and the hotel is oversold: check-then-act.",
        k: "deep dive 1 · the race|the race",
        on: { t0: "guest A · reads 9 of 10 reserved|A reads 9/10", t1: "guest B · reads 9 of 10 reserved|B reads 9/10", t2: "bad:A writes 10 · B writes 11 → oversold|both write → 11/10", t3: "bad:read committed doesn't prevent it|read committed allows it" },
        n: "bad:the check and the write are apart|check ≠ write",
      },
      {
        c: "Put the check in the write: add one WHERE total_reserved + 1 fits the limit. The second guest's update matches zero rows.",
        k: "deep dive 1 · conditional update|conditional update",
        on: { t0: "ok:UPDATE … SET total_reserved = total_reserved + 1|UPDATE … + 1", t1: "ok:WHERE total_reserved + 1 ≤ inventory × (1 + overbook)|WHERE it still fits", t2: "ok:A → 1 row · B → 0 rows → sold out|A wins · B: sold out", t3: "a CHECK constraint as the safety net|CHECK as safety net" },
        n: "ok:one round trip, no read-then-write gap|no read-then-write gap",
      },
      {
        c: "Three nights must all succeed or none. Dec 26 is full, so only two rows update: roll back the lot and report sold out.",
        k: "deep dive 1 · all nights or none|all or none",
        on: { n0: "ok:+1 → 8/10|8/10", n1: "ok:+1 → 10/10|10/10", n2: "bad:full · 0 rows|full" },
        x: [[16, 190, "bad:rows updated 2 ≠ 3 nights → ROLLBACK|2 ≠ 3 → ROLLBACK"], [16, 222, "a New Year's Eve rush is a flash sale: gate it|a rush needs a gate"]],
        n: "the transaction protects every night together|all nights together",
      },
    ],
  },
  {
    id: "saga",
    label: "Holds + pay",
    s: [
      {
        c: "A reservation is a small saga: PENDING holds the nights, payment makes it CONFIRMED, and no payment in 10 minutes makes it EXPIRED.",
        k: "deep dive 2 · lifecycle|lifecycle",
        on: { s1: "lit:nights held|held", s2: "ok:paid", s3: "warn:released|freed" },
        w: ["s1>s2:ok", "s1)s3:warn"],
        n: "no transaction can span our DB and the payment provider|no txn spans the PSP",
      },
      {
        c: "A double click sends the same idempotency key twice. The unique constraint rejects the second insert; the first reservation is returned.",
        k: "deep dive 2 · double click|double click",
        on: { t0: "ok:click 1 · key 7d0c… · INSERT → r_9001|click 1 → r_9001", t1: "warn:click 2 · key 7d0c… · UNIQUE violation|click 2 → duplicate", t2: "ok:service returns r_9001 again|returns r_9001" },
        n: "ok:one reservation, however many clicks|one per click",
      },
      {
        c: "Payment lands 30 seconds after the hold expired. Re-reserve if the nights are still free; otherwise refund automatically.",
        k: "deep dive 2 · late payment|late payment",
        on: { ...all, psp: "warn:late|late", rs: "lit:compensate|fix", db: "nights free?|free?" },
        w: wires,
        go: ["rs>psp:warn", "rs>db:lit@0.4"],
        n: "money and rooms must always agree|money = rooms",
      },
      {
        c: "The whole answer: counts per room type per night, a conditional update in one transaction, and a hold, pay, confirm saga with expiry.",
        k: "the decision|decision",
        on: { t0: "ok:inventory: a count per room type per night|count per night", t1: "ok:conditional update + CHECK, all nights or none|conditional update", t2: "ok:unique idempotency key per booking page|idempotency key", t3: "ok:hold → pay → confirm, sweeper for expiry|hold · pay · confirm", t4: "warn:gave up: microservice per table|gave up: split DBs" },
        n: "small inventory, careful transactions|careful transactions",
      },
    ],
  },
];

export default build(V, N);
