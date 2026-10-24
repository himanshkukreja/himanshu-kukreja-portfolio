/**
 * Week 3, day 3, the whole lesson (backpressure and flow control): the Black Friday 2019 flood
 * through the three phases (absorption, exhaustion, collapse), detection (lag per partition,
 * queue wait vs processing time), the four responses (shed, rate limit, scale, spill), and the
 * trade-offs: the trilemma, gradual recovery and cascading backpressure.
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

const cy = [40, 104, 168];
const N: Record<string, Nd> = {
  pr: [16, 120, 104, 52, "Producer|Prod."],
  shed: [140, 120, 108, 52, "Shedder|Shed"],
  rl: [140, 120, 108, 52, "Limiter|Limit"],
  q: [270, 120, 124, 52, "Queue"],
  s3: [270, 232, 124, 46, "S3 / disk|S3"],
  c1: [420, cy[0], 164, 46, "Consumer 1|Cons. 1"],
  c2: [420, cy[1], 164, 46, "Consumer 2|Cons. 2"],
  c3: [420, cy[2], 164, 46, "Consumer 3|Cons. 3"],
  db: [420, 232, 164, 46, "Database|DB"],
  comp: [24, 64, 176, 52, "Completeness|Complete"],
  lat: [400, 64, 176, 52, "Latency"],
  stab: [212, 196, 176, 52, "Stability|Stable"],
  sa: [16, 120, 96, 52, "Svc A"],
  ka: [128, 120, 96, 52, "Kafka"],
  sb: [240, 120, 96, 52, "Svc B"],
  kb: [352, 120, 96, 52, "Kafka"],
  sc: [464, 120, 120, 52, "Svc C"],
};
const flow = ["pr>q", "q>c1", "q>c2", "q>c3", "c3>db"];
const depth = (v: number, tone: Tone): St["m"] => [270, 200, 124, "queue depth|depth", v, 1, tone];

const V: Vr[] = [
  {
    id: "flood",
    label: "The flood",
    s: [
      {
        c: "Black Friday 2019: a flash-sale push to 10 million users. The notification service, designed for 5,000 events a second, receives 200,000.",
        k: "09:00 · phase 1 · absorption",
        on: { pr: "bad:200,000/s|200K/s", q: "warn:absorbing|absorbs", c1: "5,000/s", c2: "", c3: "", db: "" },
        w: flow,
        go: ["pr>q:bad*3", "q>c1:ok"],
        m: depth(0.25, "warn"),
        n: "the queue buffers the gap, for now|buffers the gap, for now",
      },
      {
        c: "Queue depth climbs to 500,000, then 2 million. Consumer lag is about 2 million messages, 7 minutes of work, and growing. Memory climbs.",
        k: "09:00:30 · phase 2 · exhaustion",
        on: { pr: "bad:200,000/s|200K/s", q: "bad:2,000,000|2M", c1: "warn:memory ↑|mem ↑", c2: "warn:memory ↑|mem ↑", c3: "warn:memory ↑|mem ↑", db: "" },
        w: flow,
        go: ["pr>q:bad*3"],
        m: depth(0.7, "bad"),
        n: "warn:lag: minutes, then hours|lag grows",
      },
      {
        c: "Consumers run out of memory and crash, rebalancing adds lag, the database pool runs dry, APIs return 503s. By 09:10, a complete outage.",
        k: "09:10 · phase 3 · collapse",
        on: { pr: "bad:503s", q: "bad:5,000,000|5M", c1: "bad:OOM", c2: "bad:OOM", c3: "bad:rebalancing|rebalance", db: "bad:pool exhausted|exhausted" },
        w: ["pr>q:bad", "q>c1:bad", "q>c2:bad", "q>c3:bad", "c3>db:bad"],
        m: depth(1, "bad"),
        n: "bad:no way to say 'slow down'|no way to say slow down",
      },
    ],
  },
  {
    id: "detect",
    label: "Detect",
    s: [
      {
        c: "Detect it first. Consumer lag is the latest offset minus the consumer's: partition 0 is 4,000 behind, partition 2 is 6,500. Alert above 10,000 or 5 minutes.",
        k: "metric 1 · consumer lag",
        on: { pr: "", q: "", c1: "bad:P0 lag 4,000|P0 4,000", c2: "ok:P1 lag 100|P1 100", c3: "bad:P2 lag 6,500|P2 6,500" },
        w: flow.slice(0, 4),
        m: depth(0.45, "warn"),
        n: "queue depth alert: > 100,000|depth alert > 100,000",
      },
      {
        c: "Latency tells the same story: 8,000 ms waiting in the queue for 50 ms of processing. Throughput dropping while lag rises means consumers are struggling.",
        k: "metric 3 · processing latency",
        on: { pr: "", q: "bad:wait 8,000 ms|8,000 ms", c1: "warn:500/s", c2: "warn:500/s", c3: "warn:500/s" },
        w: flow.slice(0, 4),
        m: depth(0.6, "bad"),
        x: [[584, 250, "work: 50 ms", "s", "end"]],
        n: "bad:the wait, not the work, is the signal|wait is the signal",
      },
    ],
  },
  {
    id: "respond",
    label: "Respond",
    s: [
      {
        c: "Load shedding drops excess on purpose, low priority first or 1 in N. Only where loss is acceptable, like metrics and logs.",
        k: "strategy 1 · load shedding",
        on: { pr: "", shed: "lit:drop low|drop", q: "", c1: "ok:", c2: "ok:", c3: "ok:" },
        w: ["pr>shed", "shed>q", "q>c1", "q>c2", "q>c3"],
        go: ["pr>shed:lit*3", "shed>q:ok"],
        m: depth(0.3, "ok"),
        n: "data loss, controlled|controlled loss",
      },
      {
        c: "Rate limiting slows the source instead: the gateway answers 429, or the limiter says wait 100 ms. Adaptive limits tighten as lag grows.",
        k: "strategy 2 · rate limit producers",
        on: { pr: "warn:waits|waits", rl: "lit:429 · wait|429", q: "", c1: "ok:", c2: "ok:", c3: "ok:" },
        w: ["pr>rl", "rl>q", "q>c1", "q>c2", "q>c3"],
        go: ["rl>pr:warn", "rl>q:ok"],
        m: depth(0.3, "ok"),
        n: "no loss, higher producer latency|no loss, slower producers",
      },
      {
        c: "Scaling adds consumers for sustained load, but in Kafka consumers can't exceed partitions: 12 partitions means at most 12 consumers.",
        k: "strategy 3 · scale consumers",
        on: { pr: "", q: "", c1: "ok:P0", c2: "ok:P1 (new)|P1 new", c3: "ok:P2 (new)|P2 new" },
        w: flow.slice(0, 4),
        go: ["q>c1:ok", "q>c2:ok", "q>c3:ok"],
        m: depth(0.2, "ok"),
        n: "consumers ≤ partitions|≤ partitions",
        lp: true,
      },
      {
        c: "Spillover writes the overflow to S3 or disk while consumers catch up, then processes it later. Nothing lost, but the overflow waits.",
        k: "strategy 4 · spillover",
        on: { pr: "", q: "warn:full", s3: "sky:process later|later", c1: "", c2: "", c3: "" },
        w: flow.slice(0, 4),
        go: ["q>s3:sky*2"],
        m: depth(0.9, "warn"),
        n: "every message, eventually|all of it, eventually",
      },
    ],
  },
  {
    id: "tradeoffs",
    label: "Trade-offs",
    s: [
      {
        c: "The trilemma: completeness, latency, stability, pick two. Most systems keep completeness and stability, and accept latency during spikes.",
        k: "two of three",
        on: { comp: "ok:no data loss|no loss", lat: "warn:grows in spikes|grows", stab: "ok:no crashes" },
        w: ["comp>stab:ok", "lat~stab"],
        n: "ok:the usual choice: complete + stable|complete + stable",
      },
      {
        c: "Recovery has its own herd: 1 million queued messages. Restore the rate from 100 to 10,000 a second at once, and the backlog floods downstream.",
        k: "instant recovery",
        on: { pr: "bad:100 → 10,000|→ 10,000", q: "warn:1M backlog|1M", c1: "", c2: "", c3: "", db: "bad:overwhelmed|swamped" },
        w: flow.map((w) => `${w}:bad`),
        go: ["q>c1:bad*2", "q>c2:bad*2", "q>c3:bad*2"],
        m: depth(0.9, "warn"),
        n: "bad:a new outage|new outage",
      },
      {
        c: "So ramp up: 100, 500, 1,000, 2,500, 5,000, then 10,000 a second, checking a minute of stability before each step.",
        k: "gradual restoration",
        on: { pr: "ok:ramping|ramp", q: "ok:draining|drain", c1: "ok:", c2: "ok:", c3: "ok:", db: "ok:steady" },
        w: flow,
        go: ["q>c2:ok"],
        m: [270, 200, 124, "rate|rate", 0.5, 1, "ok"],
        x: [[16, 268, "100 · 500 · 1K · 2.5K · 5K · 10K|100 … 10K"]],
        n: "ok:each step after 60 s stable|60 s stable per step",
        lp: true,
      },
      {
        c: "Backpressure also cascades: service C slows, B backs up waiting on it, then A. Circuit breakers, per-stage buffers and bulkheads stop the spread.",
        k: "cascading backpressure",
        on: { sa: "warn:slowed", ka: "warn:backs up|full", sb: "warn:waiting|waits", kb: "bad:fills|full", sc: "bad:slow" },
        w: ["sa>ka", "ka>sb", "sb>kb", "kb>sc"],
        go: ["sc>kb:bad", "kb>sb:warn", "sb>ka:warn", "ka>sa:warn"],
        n: "rate limit at every boundary|limit every boundary",
        tw: 2200,
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["flood", "detect"], "flood", "Flood + detect"],
    [["respond"], "respond", "Respond"],
    [["tradeoffs"], "tradeoffs", "Trade-offs"],
  ]),
  N,
);
