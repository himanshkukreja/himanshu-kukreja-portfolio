/**
 * Week 3 capstone, the whole interview (event-driven food delivery orders): requirements (50
 * cities, 500,000 orders/day, 7 consuming services), the estimate (100 orders/s, 800 events/s,
 * 5,600 deliveries/s, ~26 TB), the architecture (outbox + CDC, orders.events in 32 partitions),
 * the four deep dives (outbox, dinner-rush backpressure, retry topics and DLQ, audit for disputes)
 * and scaling 10x.
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
/** regroup scenes into tabs: [["scene" | "scene.from.to", ...], id, label] */
const tabs = (V: Vr[], g: [string[], string, string][]): Vr[] =>
  g.map(([specs, id, label]) => ({
    id,
    label,
    s: specs.flatMap((sp) => {
      const [vid, a, b] = sp.split(".");
      const s = V.find((v) => v.id === vid)?.s ?? [];
      return a === undefined ? s : s.slice(Number(a), b === undefined ? undefined : Number(b));
    }),
  }));
const build = (V: Vr[], N: Record<string, Nd>) =>
  defineExplainer({
    w: 600,
    h: 320,
    variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.c, tween: s.tw ?? 1400, ms: s.ms ?? 3800, loop: s.lp })) })),
    Scene: (p: SceneProps) => <Overview V={V} N={N} p={p} />,
  });
/* ---------------------------------------------------------------- this lesson */

const c = (i: number, label: string): Nd => [330, 36 + i * 31, 254, 27, label];
const N: Record<string, Nd> = {
  os: [16, 110, 108, 52, "Order Svc|Orders"],
  db: [16, 214, 108, 52, "DB+outbox|DB"],
  t: [150, 110, 140, 52, "orders.events|events"],
  rt: [150, 196, 140, 42, "orders.retry|retry"],
  dlq: [150, 246, 140, 42, "orders.dlq|DLQ"],
  pay: c(0, "Payment|Pay"),
  res: c(1, "Restaurant|Rest."),
  drv: c(2, "Driver"),
  nt: c(3, "Notify"),
  an: c(4, "Analytics|Stats"),
  sup: c(5, "Support"),
  fr: c(6, "Fraud"),
  au: c(7, "Audit DB|Audit"),
  a1: [16, 64, 170, 60, "500,000/day"],
  a2: [215, 64, 170, 60, "100/s"],
  a3: [414, 64, 170, 60, "800/s"],
  b1: [16, 190, 170, 60, "4 GB/day"],
  b2: [215, 190, 170, 60, "8 GB/day"],
  b3: [414, 190, 170, 60, "~26 TB"],
};
const svc = ["pay", "res", "drv", "nt", "an", "sup", "fr"];
const seven = Object.fromEntries(svc.map((s) => [s, ""]));
const fan = svc.map((s) => `t>${s}`);
const core = { os: "", db: "", t: "" };
const arch = ["os>db", "db>t"];

const V: Vr[] = [
  {
    id: "reqs",
    label: "Requirements",
    s: [
      {
        c: "A food delivery platform in 50 cities: 500,000 orders a day, 60% of them between 6 and 9 PM. Seven services react to every order: payment, restaurant, driver matching, notifications, analytics, support and fraud.",
        k: "phase 1 · requirements",
        on: { os: "lit:placed", ...seven },
        w: svc.map((s) => `os>${s}`),
        n: "placed → paid → accepted → assigned → delivered|placed … delivered",
      },
      {
        c: "Payment confirmed within 3 seconds, the restaurant told within 10, a driver assigned within 2 minutes. Zero order loss, and full history, because 2% of orders are disputed.",
        k: "latency and reliability",
        on: { os: "", pay: "ok:< 3 s", res: "ok:< 10 s", drv: "ok:< 2 min", sup: "sky:2% disputed|2%" },
        w: ["os>pay:ok", "os>res:ok", "os>drv:ok", "os>sup:sky"],
        n: "payment taken = order tracked|charged = tracked",
      },
    ],
  },
  {
    id: "estimate",
    label: "Estimate",
    s: [
      {
        c: "300,000 dinner-rush orders over 10,800 seconds is about 28 a second, 56 at the peak of the peak. Design for 100 orders a second.",
        k: "phase 2 · traffic",
        on: { a1: "60% in 6–9 PM|60% at dinner", a2: "lit:design target|target" },
        w: ["a1>a2"],
        x: [[300, 160, "300,000 / 10,800 s ≈ 28/s · peak ~56|≈ 28/s, peak ~56", "s", "middle"]],
        n: "headroom over the ~56/s peak|headroom over ~56/s",
      },
      {
        c: "About 8 lifecycle events per order makes 800 events a second, and with 7 consuming services that is 5,600 event deliveries a second.",
        k: "events and fan-out",
        on: { a1: "", a2: "orders/s", a3: "lit:× 8 events|×8 events" },
        w: ["a1>a2", "a2>a3"],
        x: [[584, 160, "lit:× 7 = 5,600 deliveries/s|×7 = 5,600/s", "t", "end"]],
        n: "32 partitions · 7 × 4 = 28 consumers|32 parts, 28 consumers",
      },
      {
        c: "Each event is about 1 KB: 4 million events a day is 4 GB, the detailed audit copy another 8 GB. Over 2 years with 3x replication, roughly 26 TB.",
        k: "storage",
        on: { a1: "", a2: "", a3: "", b1: "events · 1 KB|1 KB each", b2: "audit · 2 KB|2 KB each", b3: "lit:2 years, 3x|2 yrs, 3x" },
        w: ["a1>a2", "a2>a3", "b1>b2", "b2>b3"],
        n: "PostgreSQL + TimescaleDB|Postgres + Timescale",
      },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    s: [
      {
        c: "The Order Service writes the order and its outbox event in one transaction; CDC publishes it to orders.events, 32 partitions keyed by order_id. Every service gets every event.",
        k: "phase 3 · high-level design",
        on: { os: "lit:validates", db: "ok:one txn", t: "sky:key order_id|order_id", ...seven },
        w: ["os>db:lit", ...fan],
        go: ["db>t:sky", ...fan.map((f) => `${f}:sky`)],
        n: "Kafka: many readers, replay, order per order|Kafka: fan-out + replay",
        lp: true,
      },
      {
        c: "Around it: orders.retry for transient failures, orders.dlq for investigation, and audit events into TimescaleDB, immutable and queryable for support.",
        k: "retry, DLQ, audit",
        on: { ...core, rt: "warn:", dlq: "bad:", pay: "", res: "", drv: "", nt: "", an: "", sup: "", fr: "", au: "ok:TimescaleDB|Timescale" },
        w: [...arch, ...fan, "t>rt:warn", "rt>dlq:bad", "t>au:ok"],
        n: "payments: idempotency key = order_id|idempotent payments",
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    s: [
      {
        c: "Deep dive 1, the outbox: if the publisher crashes after sending but before marking, the event goes out again. Consumers dedupe on event_id, and payments use an order_id idempotency key.",
        k: "deep dive 1 · outbox",
        on: { ...core, t: "warn:sent twice|twice", pay: "ok:charged once|once", res: "ok:dedupes" },
        w: [...arch, "t>res:ok"],
        go: ["t>pay:warn*2"],
        n: "ok:at-least-once in, exactly-once effect|exactly-once effect",
      },
      {
        c: "Deep dive 2, the dinner rush: warn at 10,000 lag, at 50,000 scale consumers and shed low-priority events, at 100,000 shed normal ones too. Never shed payments or driver assignment.",
        k: "deep dive 2 · backpressure",
        on: { ...core, t: "warn:lag 50K", pay: "ok:critical", drv: "ok:critical", nt: "warn:delayed", an: "dim:shed", sup: "", fr: "ok:" },
        w: [...arch, "t>pay:ok", "t>drv:ok", "t>nt", "t>sup", "t>fr"],
        m: [150, 188, 140, "consumer lag|lag", 0.6, 1, "warn"],
        n: "warn:shed analytics, never payments|never shed payments",
      },
      {
        c: "Deep dive 3, failures: a payment gateway timeout goes through retry topics at 1, 5 and 15 minutes, then orders.dlq after 3 tries. A poison message is quarantined at once.",
        k: "deep dive 3 · dead letters",
        on: { ...core, rt: "warn:1m · 5m · 15m|1·5·15m", dlq: "bad:after 3|3 tries", pay: "warn:timeout", res: "" },
        w: [...arch, "t>pay:warn", "t>res"],
        go: ["t>rt:warn", "rt>dlq:bad"],
        n: "one failure never blocks other orders|failures don't block others",
      },
      {
        c: "Deep dive 4, disputes: 'charged but no food'. Support queries every audit event for that order_id in time order and sees exactly which step failed, in minutes, kept for 2 years.",
        k: "deep dive 4 · audit trail",
        on: { ...core, sup: "lit:by order_id|order_id", au: "ok:2 years" },
        w: [...arch, "t>au:ok"],
        go: ["au>sup:lit"],
        n: "ok:the full timeline, every state change|every state change",
      },
    ],
  },
  {
    id: "scale",
    label: "Scale 10x",
    s: [
      {
        c: "At 10x: 500 orders and 4,000 events a second. Partitions grow from 32 to 128 and consumers from 28 to 112. The first thing to break is order database writes, at 2x: shard by city.",
        k: "phase 5 · 10x",
        on: { os: "", db: "bad:shard by city|shard", t: "lit:128 partitions|128 parts", ...seven },
        w: ["os>db", "db>t", ...fan],
        go: ["db>t:lit*3"],
        n: "instances ≤ partitions per group|≤ partitions per group",
        lp: true,
      },
      {
        c: "And if Kafka is down for 30 minutes, orders keep being accepted: the outbox accumulates, an alert fires at 1 minute of lag, and the publisher catches up when Kafka returns.",
        k: "edge case · kafka down",
        on: { os: "ok:accepting|open", db: "warn:accumulating|filling", t: "bad:down", ...seven },
        w: ["os>db:ok", "db>t:bad", ...fan],
        go: ["os>db:ok*2"],
        m: [150, 196, 140, "outbox backlog|backlog", 0.8, 1, "warn"],
        n: "ok:no order lost|no order lost",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["reqs", "estimate"], "estimate", "Reqs + estimate"],
    [["arch", "deep.0.2"], "design", "Design"],
    [["deep.2", "scale"], "dives", "Dives + scale"],
  ]),
  N,
);
