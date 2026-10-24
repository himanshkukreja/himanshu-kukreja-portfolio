/**
 * Interview problem 18, the whole problem (design a distributed message queue, Kafka-style log):
 * requirements (log vs work queue, consumer groups, replay), the estimate (1M msgs/s, 500 MB/s,
 * ~900 TB for 7 days at RF 3, ~50 brokers), the design (produce to the leader, followers fetch,
 * ack from in-sync replicas, consumers pull), the log deep dive (segments, offsets, page cache,
 * zero-copy) and replication (acks, min in-sync replicas, elections, delivery semantics).
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
const cell = (i: number): Nd => [16 + i * 72, 110, 64, 52, String(i)];
const N: Record<string, Nd> = {
  p: [16, 50, 104, 52, "Producers|Prod"],
  b1: [150, 50, 120, 52, "Broker 1|B1"],
  b2: [300, 130, 120, 52, "Broker 2|B2"],
  b3: [300, 210, 120, 52, "Broker 3|B3"],
  g1: [464, 50, 120, 52, "Consumers|Group"],
  ct: [16, 210, 104, 52, "Controller|Ctrl"],
  a1: fig(0, 64, "1M msgs/s|1M/s"),
  a2: fig(1, 64, "500 MB/s"),
  a3: fig(2, 64, "1.5 GB/s"),
  b1f: fig(0, 190, "302 TB"),
  b2f: fig(1, 190, "~900 TB"),
  b3f: fig(2, 190, "~50 brokers|~50"),
  l0: cell(0),
  l1: cell(1),
  l2: cell(2),
  l3: cell(3),
  l4: cell(4),
  l5: cell(5),
  l6: cell(6),
  l7: cell(7),
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { p: "", b1: "", b2: "", b3: "", g1: "", ct: "" };
const wires = ["p>b1", "b1)b2", "b1)b3", "b1>g1", "ct~b1"];
const log = (tail: string) => ({ l0: "dim:old|old", l1: "dim:old|old", l2: "", l3: "", l4: "", l5: "", l6: "", l7: tail });

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Billing, analytics and search each read one order stream at their own pace, and replay yesterday. That's a log, not a work queue.",
        k: "phase 1 · log or queue|log or queue",
        on: { t0: "warn:work queue: one reader, deleted on ack|queue: deleted on ack", t1: "ok:log: messages stay for the retention period|log: messages stay", t2: "ok:each consumer group keeps its own offset|offset per group", t3: "ok:replay = move the offset back|replay = rewind", t4: "order per partition · same key, same partition|order per partition" },
        n: "consuming never deletes anything|reading never deletes",
      },
      {
        c: "A million messages a second at 500 bytes is 500 MB/s in. Three replicas make 1.5 GB/s of disk writes across the cluster.",
        k: "phase 2 · throughput|throughput",
        on: { a1: "in", a2: "ingress|in", a3: "warn:× 3 replicas|× 3" },
        w: ["a1>a2", "a2>a3"],
        n: "about 30 MB/s per broker: easy if sequential|~30 MB/s per broker",
      },
      {
        c: "Seven days of that is 302 TB, about 900 TB with three replicas. At 20 TB of disk per broker that's around 50 brokers.",
        k: "phase 2 · storage|storage",
        on: { a1: "", a2: "", a3: "", b1f: "7 days", b2f: "warn:× 3 replicas|× 3", b3f: "ok:20 TB each|20 TB" },
        w: ["a1>a2", "a2>a3", "b1f>b2f", "b2f>b3f"],
        n: "storage, not throughput, sets the broker count|storage sets the count",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "The producer hashes the key order_42 to partition orders-0 and sends a batch to its leader, Broker 1, which appends it to the log.",
        k: "phase 4 · produce|produce",
        on: { ...all, p: "batch", b1: "lit:appends|leader" },
        w: wires,
        go: ["p>b1:lit*3"],
        n: "same key → same partition → ordered|same key = same order",
      },
      {
        c: "Followers on Brokers 2 and 3 fetch the new data. Once every in-sync replica has it, the leader acknowledges: the message is committed.",
        k: "phase 4 · replicate + ack|replicate",
        on: { ...all, b1: "leader", b2: "ok:in sync|ISR", b3: "ok:in sync|ISR" },
        w: wires,
        go: ["b1)b2:ok", "b1)b3:ok@0.2"],
        n: "ok:acks=all: committed on every in-sync replica|acks=all = on all ISR",
      },
      {
        c: "Consumers pull from their committed offset, process, and commit the new one. A slow consumer only falls behind; it never slows the broker.",
        k: "phase 4 · consume|consume",
        on: { ...all, b1: "leader", g1: "ok:pull|pull", ct: "metadata|meta" },
        w: wires,
        go: ["b1>g1:ok*3"],
        lp: true,
        n: "the controller holds metadata, never messages|controller: metadata only",
      },
    ],
  },
  {
    id: "log",
    label: "The log",
    s: [
      {
        c: "A partition is a set of segment files. Writes only append to the end of the newest one, the fastest thing a disk can do.",
        k: "deep dive 1 · segments|segments",
        on: log("lit:new|new"),
        x: [[16, 92, "offsets →|offsets →"], [16, 196, "ok:appends only · old segments never change|append-only"], [16, 226, "sparse index: offset → byte position|sparse offset index"]],
        n: "retention = delete whole old segment files|retention = delete files",
      },
      {
        c: "Each consumer group is just an offset. Billing has read up to 3, analytics up to 6. Replay means moving an offset back.",
        k: "deep dive 1 · offsets|offsets",
        on: { ...log(""), l3: "lit:billing|bill", l6: "sky:stats" },
        x: [[16, 196, "lit:billing → offset 3|billing → 3"], [16, 226, "sky:analytics → offset 6|analytics → 6"]],
        n: "many readers, one stored copy|many readers, one copy",
      },
      {
        c: "Speed comes from batching, sequential appends, the OS page cache for recent reads, and zero-copy sendfile from cache to socket.",
        k: "deep dive 1 · why it's fast|why it's fast",
        on: { t0: "ok:batches: one request, one append, hundreds of messages|batches", t1: "ok:sequential appends, never random writes|sequential appends", t2: "ok:caught-up readers hit the page cache|page cache reads", t3: "ok:sendfile: page cache → socket, no copies|zero-copy sendfile", t4: "compressed batches stay compressed end to end|stays compressed" },
        n: "a log is the friendliest thing for a disk|disks love logs",
      },
    ],
  },
  {
    id: "repl",
    label: "Replication",
    s: [
      {
        c: "With acks=1 the leader replies after its own append. If it dies before followers fetch, an acknowledged message is simply gone.",
        k: "deep dive 2 · acks=1|acks=1",
        on: { ...all, b1: "bad:died|dead", b2: "warn:missing|gap", b3: "warn:missing|gap" },
        w: ["p>b1", "b1)b2:bad", "b1)b3:bad", "ct~b1"],
        n: "bad:fast, but not durable|fast, not durable",
      },
      {
        c: "acks=all with min.insync.replicas=2: every ack means at least two copies. If fewer than two are in sync, the partition stops taking writes.",
        k: "deep dive 2 · acks=all|acks=all",
        on: { ...all, b1: "ok:leader", b2: "ok:in sync|ISR", b3: "warn:lagging|slow" },
        w: ["p>b1", "b1)b2:ok", "b1)b3:warn", "b1>g1", "ct~b1"],
        go: ["b1)b2:ok"],
        n: "consistency over availability, on purpose|durable over available",
      },
      {
        c: "Broker 1 dies. The controller picks a new leader from the in-sync set and bumps the leader epoch; old-epoch writes are rejected.",
        k: "deep dive 2 · election|election",
        on: { ...all, b1: "bad:down", b2: "ok:new leader|leader", ct: "lit:epoch 8" },
        w: ["ct~b2:sky", "p>b1:bad"],
        go: ["ct~b2:sky"],
        n: "consumers only read below the high watermark|read ≤ high watermark",
      },
      {
        c: "Delivery is decided at the edges: commit after processing for at-least-once, before for at-most-once, transactions for exactly-once.",
        k: "deep dive 2 · semantics|semantics",
        on: { t0: "ok:idempotent producer · retries don't duplicate|idempotent producer", t1: "ok:commit after processing → at-least-once|commit after: ≥ 1", t2: "warn:commit before processing → at-most-once|commit before: ≤ 1", t3: "lit:transactions: output + offset together|transactions: = 1" },
        n: "pick per consumer, not per cluster|per consumer",
      },
      {
        c: "The whole answer: partitioned append-only logs, replicated three ways, acks from in-sync replicas, a Raft controller, pulling consumers.",
        k: "the decision|decision",
        on: { t0: "ok:partitioned, append-only segment logs|append-only logs", t1: "ok:RF 3 · acks=all · min in-sync 2|RF 3 · acks=all", t2: "ok:Raft controller: leaders, epochs, ISR|Raft controller", t3: "ok:pull consumers with their own offsets|pull + offsets", t4: "warn:gave up: per-message acks, global order|gave up: global order" },
        n: "a simple structure, carefully replicated|simple log, careful copies",
      },
    ],
  },
];

export default build(V, N);
