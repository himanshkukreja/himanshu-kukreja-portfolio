/**
 * Week 3, day 5, the whole lesson (audit log system): the requirements (who did what, 50,000
 * events/s, 7 years), the pipeline that combines the week (outbox, Kafka by actor, backpressure
 * without shedding, DLQ, hot / warm / cold tiers), integrity (append-only, hash chain, WORM
 * checkpoint) and the edge cases (a 2-hour Kafka outage, clock skew).
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
  app: [16, 100, 96, 52, "App"],
  db: [130, 100, 116, 52, "DB+outbox|DB"],
  k: [264, 100, 96, 52, "Kafka"],
  con: [378, 100, 100, 52, "Writer"],
  dlq: [496, 100, 88, 52, "DLQ"],
  cold: [16, 220, 168, 52, "S3 Parquet|S3"],
  warm: [204, 220, 176, 52, "ClickHouse|ClickH."],
  hot: [400, 220, 184, 52, "TimescaleDB|Timescale"],
  h0: [30, 100, 160, 56, "#1000"],
  h1: [220, 100, 160, 56, "#1001"],
  h2: [410, 100, 160, 56, "#1002"],
  worm: [220, 220, 160, 52, "WORM"],
  sa: [16, 60, 150, 52, "Server A|Srv A"],
  sb: [16, 190, 150, 52, "Server B|Srv B"],
};
const pipe = ["app>db", "db>k", "k>con"];
const tiers = { hot: "0–90 days|90 days", warm: "to 1 year|1 year", cold: "to 7 years|7 years" };
const tw = ["con>hot", "hot>warm", "warm>cold"];

const V: Vr[] = [
  {
    id: "reqs",
    label: "Requirements",
    s: [
      {
        c: "An audit log records who did what to which resource, when, and from where. For a financial company: every action, never lose one, 50,000 a second at peak, kept 7 years.",
        k: "the brief",
        on: { app: "lit:action", db: "audit event|event" },
        go: ["app>db:lit"],
        x: [
          [264, 120, "who · what · which · when · where|who what when where", "t"],
          [264, 146, "50,000 events/s peak · 7 years|50K/s · 7 years"],
          [264, 168, "immutable · queryable · tamper-evident|immutable, queryable"],
        ],
        n: "not an app log: auditors, years, immutable|for auditors, kept years",
      },
      {
        c: "Write first, process later. The delete and its audit event commit together and the user gets an instant answer; the audit pipeline runs in the background, visible within 1 to 60 seconds.",
        k: "principle 1 · write first",
        on: { app: "ok:+0 ms", db: "lit:one txn", k: "", con: "", hot: "1–60 s later|1–60 s" },
        w: ["app>db:ok"],
        go: ["db>k:sky", "k>con:sky", "con>hot:sky"],
        n: "sync would add 50–200 ms per request|sync: +50–200 ms",
      },
    ],
  },
  {
    id: "pipeline",
    label: "The pipeline",
    s: [
      {
        c: "Day 2: the outbox. Without it, a delete can succeed while its audit event fails to publish, leaving no record of the deletion. With it, both commit or neither does.",
        k: "guaranteed capture",
        on: { app: "", db: "ok:action + audit|both" },
        go: ["app>db:ok*2"],
        n: "ok:no action without its audit event|no action without audit",
      },
      {
        c: "Day 1: Kafka, not a queue. Partition by actor_id to keep each actor's actions in order, let many consumer groups read, and replay if a bug is found.",
        k: "kafka · partitioned by actor_id",
        on: { app: "", db: "", k: "sky:by actor_id|actor_id", con: "ok:", ...tiers },
        w: [...pipe, ...tw],
        go: ["db>k:sky*2", "k>con:sky*2"],
        n: "ordering per actor · replay|order per actor",
        lp: true,
      },
      {
        c: "Day 3: peak is 50,000 events a second, ten times normal. Batch harder and scale consumers, alert on lag, but never shed: audit events are not metrics.",
        k: "backpressure · 5K → 50K/s",
        on: { app: "", db: "", k: "warn:50,000/s|50K/s", con: "warn:scale up|scale", ...tiers },
        w: [...pipe, ...tw],
        go: ["k>con:warn*3"],
        m: [264, 190, 96, "lag|lag", 0.6, 1, "warn"],
        n: "warn:alert, but don't shed|alert, never shed",
      },
      {
        c: "Day 4: an event that fails, like a schema mismatch, goes to a DLQ, not the floor. Storage is tiered: TimescaleDB for 90 days, ClickHouse to a year, S3 Parquet for 7 years.",
        k: "DLQ + tiered storage",
        on: { app: "", db: "", k: "", con: "", dlq: "bad:schema err|failed", hot: "ok:0–90 days|90 days", warm: "ok:to 1 year|1 year", cold: "ok:to 7 years|7 years" },
        w: [...pipe, ...tw],
        go: ["con>dlq:bad", "con>hot:ok"],
        n: "ok:no event left behind|no event left behind",
      },
    ],
  },
  {
    id: "integrity",
    label: "Integrity",
    s: [
      {
        c: "Immutability is non-negotiable: no UPDATE or DELETE on audit tables. A mistake gets a correction event that points at the original.",
        k: "append-only",
        on: { h0: "event", h1: "event", h2: "ok:correction|fix" },
        w: ["h0>h1", "h1>h2"],
        n: "history is only ever added to|only ever appended",
      },
      {
        c: "Each event stores the previous event's hash. If event #1001 says the previous hash is xyz789 but #1000's hash is abc123, the chain is broken: check for gaps, the DLQ and Kafka.",
        k: "hash chain · break detected",
        on: { h0: "ok:hash abc123|abc123", h1: "bad:prev xyz789|xyz789", h2: "prev …" },
        w: ["h0>h1:bad", "h1>h2"],
        n: "bad:if tampering: preserve evidence, don't 'fix'|preserve the evidence",
      },
      {
        c: "Rewriting every later hash would make the chain verify again, so the latest hash is checkpointed somewhere the attacker can't change: WORM storage, S3 Object Lock in compliance mode.",
        k: "checkpoint the head",
        on: { h0: "ok:abc123", h1: "ok:prev abc123|abc123", h2: "ok:head", worm: "lit:checkpoint" },
        w: ["h0>h1:ok", "h1>h2:ok"],
        go: ["h2)worm:lit"],
        n: "a rewrite no longer matches the checkpoint|rewrites fail the check",
      },
    ],
  },
  {
    id: "edges",
    label: "Edge cases",
    s: [
      {
        c: "Kafka down for 2 hours: the outbox reaches 10 million rows. Partition it by time and alert on growth; above 1 million, pause non-critical auditing, never auth or payments.",
        k: "edge case · outbox grows",
        on: { app: "", db: "bad:10M rows", k: "bad:down", con: "idle" },
        w: ["app>db", "db>k:bad", "k>con"],
        go: ["app>db:lit*3"],
        m: [130, 190, 116, "outbox|outbox", 1, 1, "bad"],
        n: "the outbox buffers: nothing is lost|buffered, nothing lost",
      },
      {
        c: "Clock skew: server B runs 5 seconds ahead, so its event is stored after A's later one. Sort investigations by ingestion time, keep both timestamps, and keep NTP drift under 100 ms.",
        k: "edge case · clock skew",
        on: { sa: "10:00:02", sb: "warn:10:00:07 (+5 s)|+5 s", con: "ok:received_at|recv_at" },
        go: ["sa>con:sky", "sb>con:warn"],
        n: "ok:investigate by received_at|sort by received_at",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["reqs", "pipeline"], "pipeline", "Brief + pipeline"],
    [["integrity", "edges"], "integrity", "Integrity + edges"],
  ]),
  N,
);
