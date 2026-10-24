/**
 * Week 3 preview, the whole lesson: Black Friday 2018's synchronous chain (sum of latencies,
 * product of availabilities), the fix (queue the work, consumers at their own pace), then the
 * week's five days added onto that async system: queue vs log, outbox, backpressure, DLQ, audit log.
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

const cx = (i: number) => 10 + i * 98;
const N: Record<string, Nd> = {
  c0: [cx(0), 110, 88, 56, "User"],
  c1: [cx(1), 110, 88, 56, "API"],
  c2: [cx(2), 110, 88, 56, "Inventory|Inv."],
  c3: [cx(3), 110, 88, 56, "Payment|Pay"],
  c4: [cx(4), 110, 88, 56, "Shipping|Ship"],
  c5: [cx(5), 110, 88, 56, "Email"],
  u: [16, 116, 92, 52, "User"],
  a: [130, 116, 92, 52, "API"],
  db: [130, 216, 92, 52, "DB+outbox|DB"],
  q: [252, 116, 128, 52, "Queue"],
  dlq: [252, 216, 128, 52, "DLQ"],
  ic: [420, 40, 164, 46, "Inventory|Inv."],
  pc: [420, 100, 164, 46, "Payment|Pay"],
  sc: [420, 160, 164, 46, "Shipping|Ship"],
  au: [420, 220, 164, 46, "Audit log|Audit"],
};
const chain = ["c0>c1", "c1>c2", "c2>c3", "c3>c4", "c4>c5"];
const ms200 = { c1: "200 ms", c2: "200 ms", c3: "200 ms", c4: "200 ms", c5: "200 ms" };
const cons = ["q>ic", "q>pc", "q>sc"];
const base = { u: "", a: "ok:50 ms", q: "", ic: "", pc: "", sc: "" };

const V: Vr[] = [
  {
    id: "sync",
    label: "Sync chain",
    s: [
      {
        c: "Black Friday 2018: traffic hits 10x normal. Every order is a synchronous chain, so the user waits while each service calls the next.",
        k: "black friday 2018 · 10x traffic",
        on: { c0: "", ...ms200 },
        go: chain.map((w) => `${w}:lit`),
        n: "the request waits on every hop|waits on every hop",
        tw: 2400,
      },
      {
        c: "Response time is the sum of all latencies: five services at 200 ms each make 1,000 ms.",
        k: "response time = sum",
        on: { c0: "lit", ...ms200 },
        w: chain,
        m: [10, 222, 578, "response time", 1000, 1000, "warn"],
        x: [[588, 76, "warn:1,000 ms", "d", "end"]],
        n: "5 × 200 ms = 1,000 ms",
      },
      {
        c: "Availability is the product: five services at 99.9% each give 99.5%. If any step is slow or fails, the entire request fails.",
        k: "availability = product",
        on: { c0: "bad:failed", c1: "200 ms", c2: "200 ms", c3: "bad:timeout", c4: "dim", c5: "dim" },
        w: ["c0>c1:bad", "c1>c2:bad", "c2>c3:bad", "c3>c4", "c4>c5"],
        x: [[588, 76, "bad:99.5%", "d", "end"]],
        n: "bad:one slow service fails every order|one slow hop fails it all",
      },
    ],
  },
  {
    id: "async",
    label: "Queue it",
    s: [
      {
        c: "The fix: stop waiting. The API puts the order on a queue and answers at once: order created, in 50 ms.",
        k: "accept now, process later",
        on: { u: "", a: "ok:50 ms", q: "order #1" },
        go: ["u>a:lit", "a>q:lit"],
        n: "ok:order created · 50 ms",
      },
      {
        c: "Inventory, Payment and Shipping consumers each read from the queue and process at their own pace.",
        k: "consumers at their own pace",
        on: { ...base, q: "lit:#1 … #5", ic: "ok:consuming", pc: "ok:consuming", sc: "ok:consuming" },
        w: ["u>a", "a>q"],
        go: cons.map((w) => `${w}:ok*2`),
        n: "a slow consumer no longer slows the user|no cascade",
        lp: true,
      },
      {
        c: "A failure is retried, not fatal, so nothing is lost. Black Friday 2019 had zero lost orders and 50x the capacity.",
        k: "black friday 2019",
        on: { ...base, q: "#1 … #5", ic: "ok:done", pc: "warn:retrying", sc: "ok:done" },
        w: ["u>a", "a>q", "q>ic:ok", "q>sc:ok"],
        go: ["q>pc:warn"],
        x: [[300, 76, "ok:0 lost", "d", "middle"]],
        n: "ok:zero lost orders · 50x capacity|0 lost · 50x capacity",
      },
    ],
  },
  {
    id: "week",
    label: "The week",
    s: [
      {
        c: "Day 1, queue vs stream: a queue gives each message to one consumer and deletes it; a log like Kafka keeps it so it can be replayed.",
        k: "day 1 · queue vs stream",
        on: { ...base, q: "lit:queue or log?|or log?", ic: "", pc: "", sc: "" },
        w: ["u>a", "a>q", ...cons],
        n: "pick the pattern that matches your guarantees|match your guarantees",
      },
      {
        c: "Day 2, transactional outbox: save then publish can lose the event in a crash, so the event is written to an outbox table in the same transaction.",
        k: "day 2 · transactional outbox",
        on: { ...base, a: "", db: "lit:one txn", q: "" },
        w: ["u>a", ...cons],
        go: ["a>db:lit", "db>q:lit"],
        n: "both writes commit, or neither|both commit or neither",
      },
      {
        c: "Day 3, backpressure: marketing reaches 5 million users and 500K events per second hit a system designed for 10K. Shed, slow, buffer or scale.",
        k: "day 3 · backpressure",
        on: { ...base, a: "", db: "", q: "bad:500K/s in", ic: "warn:lagging", pc: "warn:lagging", sc: "warn:lagging" },
        w: ["u>a", "a>db", "db>q", ...cons],
        go: ["a>db:bad*3"],
        m: [252, 196, 128, "depth|depth", 0.95, 1, "bad"],
        n: "bad:designed for 10K/s, receiving 500K/s|10K/s design, 500K/s in",
      },
      {
        c: "Day 4, dead letters: messages that keep failing go to a DLQ with their failure context. Transient, bad data or a bug: each is handled differently.",
        k: "day 4 · dead letters",
        on: { ...base, a: "", db: "", q: "", dlq: "bad:failed msgs", ic: "", pc: "bad:fails", sc: "" },
        w: ["u>a", "a>db", "db>q", ...cons],
        go: ["q>dlq:bad"],
        n: "a DLQ is a signal, not a grave|a signal, not a grave",
      },
      {
        c: "Day 5 puts it together: an audit log where every action is recorded, immutable, queryable, tamper-evident and kept for 7 years.",
        k: "day 5 · audit log system",
        on: { ...base, a: "", db: "", q: "", dlq: "", ic: "", pc: "", sc: "", au: "ok:7 years" },
        w: ["u>a", "a>db", "db>q", ...cons, "q>dlq"],
        go: ["q>au:ok*2"],
        n: "ok:stop waiting, queue the work, handle failure|queue it, handle failure",
        lp: true,
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["sync"], "sync", "Sync chain"],
    [["async"], "async", "Queue it"],
    [["week"], "week", "The week"],
  ]),
  N,
);
