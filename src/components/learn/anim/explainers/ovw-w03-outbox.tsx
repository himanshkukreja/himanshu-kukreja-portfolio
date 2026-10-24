/**
 * Week 3, day 2, the whole lesson (transactional outbox): the dual-write disaster (23 of 847 charged
 * payments with no order), the outbox in one transaction, polling vs CDC publishers, then the edge
 * cases: publisher crash duplicates, a 2-hour Kafka outage, out-of-order publishing, monitoring.
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

const N: Record<string, Nd> = {
  app: [16, 124, 112, 52, "Order Svc|App"],
  pg: [196, 204, 150, 46, "PostgreSQL|Postgres"],
  k2: [196, 50, 150, 46, "Kafka"],
  dn: [410, 50, 174, 46, "Payment, Inv.|Downstream"],
  txn: [166, 72, 172, 140, ""],
  ord: [178, 86, 148, 46, "orders"],
  obx: [178, 152, 148, 46, "outbox"],
  pub: [368, 152, 108, 46, "Poller"],
  cdc: [368, 152, 108, 46, "Debezium|CDC"],
  k: [500, 124, 84, 52, "Kafka"],
  cons: [470, 226, 114, 46, "Consumer|Cons."],
};
const box = { txn: "", ord: "", obx: "" };

const V: Vr[] = [
  {
    id: "dual",
    label: "Dual write",
    s: [
      {
        c: "Month-end at a fintech: 847 payments were charged, and 23 of them never created an order. The code saves to the database, then publishes to Kafka.",
        k: "save, then publish",
        on: { app: "", pg: "ok:INSERT ok", k2: "", dn: "" },
        go: ["app>pg:ok"],
        n: "two writes, two systems|two writes",
      },
      {
        c: "The pod is killed between the two writes. The publish never happens, so payment, inventory and email are never told about the order.",
        k: "crash between writes",
        on: { app: "bad:crashed", pg: "ok:order saved", k2: "bad:never published|never sent", dn: "dim:never notified|not told" },
        w: ["app>pg:ok", "app>k2:bad", "k2>dn"],
        n: "bad:order exists, nobody knows|order exists, nobody knows",
      },
      {
        c: "Flip the order and Kafka succeeds while the insert fails: an event for an order that does not exist. Two writes to different systems cannot be made atomic.",
        k: "publish, then save",
        on: { app: "", pg: "bad:INSERT failed|failed", k2: "warn:event sent", dn: "bad:garbage data|garbage" },
        w: ["app>pg:bad", "app>k2:warn", "k2>dn:bad"],
        n: "bad:2PC: slow, blocking, Kafka won't join|no XA for Kafka",
      },
    ],
  },
  {
    id: "outbox",
    label: "The outbox",
    s: [
      {
        c: "The outbox writes everything to the database: the order row and its event row in ONE transaction. Either both commit, or neither does.",
        k: "one transaction",
        on: { app: "", txn: "lit", ord: "ok:order 123", obx: "ok:OrderCreated|event" },
        go: ["app>ord:lit", "app>obx:lit"],
        x: [[178, 66, "BEGIN … COMMIT"]],
        n: "ok:two writes become one|two writes become one",
      },
      {
        c: "A separate poller queries for rows where published_at is null, publishes them to Kafka, then marks them published. Simple, but it adds latency and load.",
        k: "approach 1 · polling",
        on: { app: "", ...box, obx: "published_at NULL|NULL", pub: "lit:every N s|every N s", k: "ok:" },
        w: ["app>ord", "app>obx"],
        go: ["obx>pub:lit", "pub>k:lit"],
        n: "latency up to the poll interval|up to poll interval",
      },
      {
        c: "CDC with Debezium reads the write-ahead log instead: about 10 to 100 ms to Kafka, 10,000+ events a second, no polling load. Start with polling, move to CDC at volume.",
        k: "approach 2 · change data capture",
        on: { app: "", ...box, cdc: "sky:reads WAL|WAL", k: "ok:~100 ms|100 ms" },
        w: ["app>ord", "app>obx"],
        go: ["obx>cdc:sky*2", "cdc>k:sky*2"],
        n: "ok:the request waits only for the DB|request waits only for DB",
        lp: true,
      },
    ],
  },
  {
    id: "edges",
    label: "Edge cases",
    s: [
      {
        c: "The publisher sends to Kafka, then crashes before marking the row published. It restarts, sees published_at still null, and sends the event again.",
        k: "publisher crash · duplicate",
        on: { app: "", ...box, obx: "warn:still NULL", pub: "bad:restarted", k: "warn:twice", cons: "ok:dedupe by id|dedupe" },
        w: ["app>ord", "app>obx", "obx>pub"],
        go: ["pub>k:warn*2", "k>cons:ok"],
        n: "at-least-once: consumers dedupe by event_id|at-least-once + dedupe",
      },
      {
        c: "Kafka is down for 2 hours and the outbox grows to 1 million rows. Nothing is lost: the database is the buffer, and the publisher catches up when Kafka returns.",
        k: "kafka down 2 hours",
        on: { app: "", ...box, obx: "bad:1M rows", pub: "warn:backing off|backoff", k: "bad:down" },
        w: ["app>ord", "app>obx", "obx>pub", "pub>k:bad"],
        go: ["app>obx:lit*3"],
        m: [178, 238, 148, "unpublished|unpublished", 1, 1, "bad"],
        n: "scale publishers · partition by created_at|partition by created_at",
      },
      {
        c: "Two publishers using SKIP LOCKED can send OrderPaid before OrderCreated. Partition by aggregate_id, or use CDC, which reads the log in commit order.",
        k: "out of order",
        on: { app: "", ...box, obx: "1 Created · 2 Paid|1, 2", pub: "warn:A + B", k: "bad:2 then 1|2, 1", cons: "bad:Paid first|Paid 1st" },
        w: ["app>ord", "app>obx", "obx>pub", "pub>k:warn", "k>cons:bad"],
        n: "key: aggregate_id, in publisher and Kafka|key by aggregate_id",
      },
      {
        c: "Then watch it: alert when unpublished rows pass 10,000 or the oldest is over 5 minutes, and clean up published events after 7 days.",
        k: "monitor and clean up",
        on: { app: "", ...box, obx: "ok:healthy", cdc: "ok:", k: "ok:", cons: "ok:idempotent|dedupes" },
        w: ["app>ord", "app>obx"],
        go: ["obx>cdc:ok", "cdc>k:ok", "k>cons:ok"],
        m: [178, 238, 148, "alert > 10,000|> 10,000", 0.1, 1, "ok"],
        n: "ok:no payment without its event|no payment without its event",
        lp: true,
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["dual"], "dual", "Dual write"],
    [["outbox"], "outbox", "The outbox"],
    [["edges"], "edges", "Edge cases"],
  ]),
  N,
);
