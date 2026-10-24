/**
 * Week 3, day 1, the whole lesson (queue vs stream): the synchronous trap, the two mental models
 * (work to be done vs events that happened), the three patterns (point-to-point, pub-sub, consumer
 * groups), delivery and ordering guarantees, then lag and the decision framework.
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

const cell = (i: number): Nd => [148 + i * 38, 132, 32, 40, `M${i + 1}`];
const N: Record<string, Nd> = {
  co: [16, 128, 118, 48, "Create Order|Order"],
  ri: [166, 128, 118, 48, "Reserve Inv.|Inventory"],
  cp: [316, 128, 118, 48, "Charge Pay|Payment"],
  se: [466, 128, 118, 48, "Send Email|Email"],
  p: [16, 128, 104, 48, "Producer|Prod."],
  m0: cell(0),
  m1: cell(1),
  m2: cell(2),
  m3: cell(3),
  m4: cell(4),
  m5: cell(5),
  ca: [420, 40, 164, 46, "Consumer A|Cons. A"],
  cb: [420, 104, 164, 46, "Consumer B|Cons. B"],
  cc: [420, 168, 164, 46, "Consumer C|Cons. C"],
  p0: [160, 60, 200, 46, "Partition 0|P0"],
  p1: [160, 130, 200, 46, "Partition 1|P1"],
  p2: [160, 200, 200, 46, "Partition 2|P2"],
  ga: [420, 52, 164, 52, "Group A|Orders"],
  gb: [420, 128, 164, 52, "Group B|Analytics"],
  gc: [420, 204, 164, 52, "Group C|Audit"],
  b: [160, 128, 130, 48, "Broker"],
  c: [320, 128, 150, 48, "Consumer"],
  q1: [16, 52, 150, 46, "Need replay?|Replay?"],
  q2: [16, 134, 150, 46, "Many readers?|2+ readers?"],
  q3: [16, 216, 150, 46, "Job or task?|Job/task?"],
  st: [300, 92, 140, 46, "STREAM|Stream"],
  qu: [300, 216, 140, 46, "QUEUE|Queue"],
};
const all = (tone: string) => ({ m0: tone, m1: tone, m2: tone, m3: tone, m4: tone, m5: tone });
const parts = ["p0", "p1", "p2"];

const V: Vr[] = [
  {
    id: "models",
    label: "Two models",
    s: [
      {
        c: "3 AM: the email service is slow, and the timeout cascades back through payment, inventory and order creation. Every service waits for the next.",
        k: "the synchronous trap",
        on: { co: "bad:error", ri: "bad:timeout", cp: "bad:timeout", se: "bad:slow · 5 s|5 s" },
        w: ["co>ri", "ri>cp", "cp>se"],
        go: ["se>cp:bad", "cp>ri:bad", "ri>co:bad"],
        n: "bad:payment charged, order not created|charged, no order",
        tw: 2000,
      },
      {
        c: "A queue is work to be done: each message goes to exactly one worker and is removed once processed. No history, no replay.",
        k: "queue · work to be done",
        on: { p: "", m0: "", m1: "", m2: "", m3: "", ca: "ok:took M4" },
        w: ["p>m0"],
        go: ["m3>ca:lit"],
        x: [[148, 120, "queue", "k"]],
        n: "consumed and deleted|consumed, deleted",
      },
      {
        c: "A stream is events that happened: they are retained, many readers read the same events, and each tracks its own offset. Rewind to replay.",
        k: "stream · events that happened",
        on: { p: "", ...all("sky"), ca: "sky:offset 2", cb: "sky:offset 4" },
        w: ["p>m0", "m5>ca:sky", "m5>cb:sky"],
        x: [
          [148, 120, "log", "k"],
          [201, 192, "sky:A", "t", "middle"],
          [277, 192, "sky:B", "t", "middle"],
        ],
        n: "retained · each reader keeps its offset|retained, own offsets",
      },
    ],
  },
  {
    id: "patterns",
    label: "Patterns",
    s: [
      {
        c: "Point-to-point: each message goes to exactly one consumer. Consumers compete, which load-balances the work for free.",
        k: "pattern 1 · point-to-point",
        on: { p: "", m3: "", m4: "", m5: "", ca: "ok:M1", cb: "ok:M2", cc: "ok:M3" },
        w: ["p>m3"],
        go: ["m5>ca:ok", "m5>cb:ok", "m5>cc:ok"],
        n: "one consumer per message|one per message",
      },
      {
        c: "Publish-subscribe: the same message is delivered to all subscribers, each getting its own copy. New subscribers need no change to the publisher.",
        k: "pattern 2 · pub-sub",
        on: { p: "", m5: "lit", ca: "sky:copy of M6|copy", cb: "sky:copy of M6|copy", cc: "sky:copy of M6|copy" },
        w: ["p>m5"],
        go: ["m5>ca:sky", "m5>cb:sky", "m5>cc:sky"],
        n: "every subscriber gets every message|all get everything",
      },
      {
        c: "Consumer groups, Kafka's killer feature: every group gets all messages, and inside a group each partition goes to one consumer. Parallelism equals partitions.",
        k: "pattern 3 · consumer groups",
        on: { p: "", p0: "M1 · M4 · M7", p1: "M2 · M5 · M8", p2: "M3 · M6 · M9", ga: "ok:C1 C2 C3", gb: "ok:C1 C2", gc: "ok:C1" },
        w: ["p>p0", "p>p1", "p>p2", ...parts.flatMap((x) => [`${x}>ga`, `${x}>gb`, `${x}>gc`])],
        go: ["p0>ga:ok", "p1>gb:ok", "p2>gc:ok"],
        n: "fan-out across groups, balance within|fan-out + balance",
        lp: true,
      },
    ],
  },
  {
    id: "guarantees",
    label: "Guarantees",
    s: [
      {
        c: "At-most-once is fire and forget, with no ack. If the consumer crashes, the message is lost, but it is never duplicated. Fine for metrics.",
        k: "at-most-once",
        on: { p: "", b: "", c: "bad:crash!" },
        w: ["p>b", "b>c"],
        go: ["b>c:bad"],
        n: "bad:may be lost · never duplicated|lost, not duplicated",
      },
      {
        c: "At-least-once acks after processing. A consumer reads offset 100, crashes before committing it, and the next consumer reads offset 100 again.",
        k: "at-least-once",
        on: { p: "", b: "warn:offset 100", c: "warn:reads 100 again|100 again" },
        w: ["p>b"],
        go: ["b>c:warn*2"],
        n: "warn:never lost · may be duplicated|may duplicate",
      },
      {
        c: "So most systems pair at-least-once delivery with an idempotent consumer: it dedupes by message ID, and the duplicate changes nothing.",
        k: "at-least-once + idempotent",
        on: { p: "", b: "offset 100", c: "ok:seen: skip|skip" },
        w: ["p>b", "b>c:ok"],
        n: "ok:effectively once|effectively once",
      },
      {
        c: "Ordering holds within a partition. Key by user_id and all of User A's events land in one partition, in order, while users run in parallel.",
        k: "ordering · key = user_id",
        on: { p: "", p0: "sky:A: M1 M3 M5|A: M1 M3", p1: "ok:B: M2 M4 M6|B: M2 M4", ca: "sky:user A, in order|user A", cb: "ok:user B, in order|user B" },
        w: ["p>p0", "p>p1", "p0>ca:sky", "p1>cb:ok"],
        n: "order per key, parallel across keys|ordered per key",
      },
    ],
  },
  {
    id: "choose",
    label: "Choosing",
    s: [
      {
        c: "Producer at 10,000 messages a second, consumer at 1,000: lag grows by 9,000 every second, 32,400,000 behind after one hour.",
        k: "slow consumer · lag",
        on: { p: "bad:10,000/s", ...all("bad"), ca: "warn:1,000/s" },
        w: ["p>m0", "m5>ca"],
        go: ["p>m0:bad*3"],
        m: [148, 214, 220, "consumer lag", 1, 1, "bad"],
        x: [[300, 268, "bad:32.4M behind", "d", "middle"]],
        n: "bad:+9,000 messages every second|+9,000 every second",
      },
      {
        c: "Add consumers, up to the partition count, and alert on lag: over 10,000 messages behind pages someone.",
        k: "scale consumers",
        on: { p: "10,000/s", ...all(""), ca: "ok:partition 0|P0", cb: "ok:partition 1|P1", cc: "ok:partition 2|P2" },
        w: ["p>m0"],
        go: ["m5>ca:ok", "m5>cb:ok", "m5>cc:ok"],
        m: [148, 214, 220, "consumer lag", 0.15, 1, "ok"],
        n: "partitions cap consumer parallelism|partitions cap parallelism",
        lp: true,
      },
      {
        c: "The decision: need replay, or many systems reading the same data? Use a stream. A job to process? Use a queue. Unsure? Start with the simpler queue.",
        k: "decision framework",
        on: { q1: "", q2: "", q3: "", st: "sky:Kafka", qu: "ok:SQS, RabbitMQ|SQS" },
        w: ["q1>q2", "q2>q3", "q1>st:sky", "q2>st:sky", "q3>qu:ok"],
        x: [
          [176, 68, "ok:yes"],
          [176, 150, "ok:yes"],
          [176, 232, "ok:yes"],
          [100, 124, "no"],
          [100, 206, "no"],
        ],
        n: "queue = work · stream = event history|work vs history",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["models"], "models", "Two models"],
    [["patterns"], "patterns", "Patterns"],
    [["guarantees"], "guarantees", "Guarantees"],
    [["choose"], "choose", "Choosing"],
  ]),
  N,
);
