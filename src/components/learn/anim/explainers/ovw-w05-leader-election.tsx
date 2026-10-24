/**
 * Week 5, day 5, the whole lesson (leader election and coordination): split brain after a
 * partition, why timeouts alone fail (a 6-second GC pause), fencing tokens rejecting a zombie
 * leader's write, consensus (Raft terms, FLP), coordination services (ZooKeeper, etcd, leases),
 * and production: Kafka's leader epoch and the default settings.
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

const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  na: [16, 44, 150, 52, "Node A"],
  nb: [16, 204, 150, 52, "Node B"],
  co: [228, 124, 150, 52, "etcd / ZK|etcd/ZK"],
  st: [440, 124, 144, 52, "Storage"],
  b1: [16, 44, 150, 52, "Broker1"],
  b2: [16, 204, 150, 52, "Broker2"],
  ct: [228, 124, 150, 52, "Controller|Control"],
  b3: [440, 124, 144, 52, "Broker3"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};

const V: Vr[] = [
  {
    id: "split",
    label: "Split brain",
    s: [
      {
        c: "Many systems need exactly one node in charge: a database primary, a job scheduler, a lock holder, a Kafka partition leader. Node A leads, node B follows.",
        k: "exactly one leader",
        on: { na: "ok:leader", nb: "follower", st: "" },
        w: ["na~nb"],
        go: ["na^st:ok"],
        n: "one node accepts the writes|one writer",
      },
      {
        c: "A partition cuts A off from B. Is A dead, or is it the network? B becomes leader, and now both accept writes. When the partition heals there are two versions of the data.",
        k: "partition · two leaders",
        on: { na: "bad:leader", nb: "bad:leader too|leader", st: "bad:two versions|2 versions" },
        w: ["na~nb:bad"],
        go: ["na^st:bad", "nb^st:bad@0.3"],
        n: "bad:split brain: data loss or corruption|split brain",
      },
      {
        c: "Timeouts alone can't decide. Elect a new leader after 5 seconds of silence, and a leader in a 6-second GC pause comes back still leading. Slow networks, clock skew and paused processes do the same.",
        k: "the timeout trap",
        on: { t0: "bad:network delay · alive but slow|slow network", t1: "bad:GC pause · 6 s > 5 s timeout|6 s GC pause", t2: "bad:clock skew · its lease looks unexpired|clock skew", t3: "bad:process pause · swapped out by the OS|process pause" },
        n: "each one ends with two leaders|→ two leaders",
      },
    ],
  },
  {
    id: "fence",
    label: "Fencing tokens",
    s: [
      {
        c: "Fencing tokens: every election hands out a strictly increasing number. Leader A is elected with token 1, and its write with token 1 is accepted.",
        k: "T=0 · token 1",
        on: { na: "ok:token 1", co: "issues 1", st: "ok:highest: 1|max 1" },
        go: ["co>na:lit", "na^st:ok@0.4"],
        n: "resources remember the highest token|storage tracks max",
      },
      {
        c: "A hits a GC pause and looks dead. B is elected with token 2, and its write with token 2 is accepted: storage now remembers 2.",
        k: "T=3 · token 2",
        on: { na: "warn:GC pause|paused", nb: "ok:token 2", co: "issues 2", st: "ok:highest: 2|max 2" },
        go: ["co>nb:lit", "nb^st:ok@0.4"],
        n: "A doesn't know it was replaced|A doesn't know",
      },
      {
        c: "A wakes up and sends a write with token 1. It's lower than the highest seen, so storage rejects it. Without the token, that zombie write would corrupt the data.",
        k: "T=5 · the zombie write",
        on: { na: "bad:token 1", nb: "ok:token 2", st: "ok:rejects 1|rejects" },
        go: ["na^st:bad"],
        n: "ok:stale token → REJECTED|stale token rejected",
      },
    ],
  },
  {
    id: "consensus",
    label: "Consensus",
    s: [
      {
        c: "Raft elects safely: followers expect heartbeats; with none before the election timeout, one becomes a candidate, increments the term and asks for votes. A majority makes it leader.",
        k: "raft",
        on: { t0: "follower · expects heartbeats|follower", t1: "lit:candidate · term + 1, requests votes|candidate · term+1", t2: "ok:majority of votes → leader|majority → leader", t3: "sky:at most one leader per term|one leader per term" },
        n: "terms act like fencing tokens|terms = fencing tokens",
      },
      {
        c: "There's a hard limit, FLP: if even one process may crash, no algorithm can guarantee both safety and progress in an asynchronous network. In practice, favor safety and accept brief unavailability.",
        k: "FLP impossibility",
        on: { t0: "ok:safety · at most one leader|safety", t1: "warn:liveness · eventually a leader|liveness", t2: "lit:favor safety, accept brief unavailability|favor safety" },
        n: "unavailable beats two leaders|unavailable > two leaders",
      },
    ],
  },
  {
    id: "coord",
    label: "Coordination",
    s: [
      {
        c: "Don't build your own: ZooKeeper candidates create ephemeral sequential znodes, the lowest number leads, and when its session expires the node vanishes and the next one takes over.",
        k: "zookeeper · ephemeral sequential",
        on: { na: "ok:…0001 · leader|leader", nb: "…0002 · watching|watch", co: "lit:/leader-election|ZooKeeper" },
        go: ["na>co:ok", "nb>co:sky"],
        n: "watches signal the change|watch, then take over",
      },
      {
        c: "etcd does the same with leases, and Kubernetes controllers hold a Lease object with a holder and renewal time. The leader renews; if it stops, the lease expires and a standby takes it.",
        k: "etcd · leases",
        on: { na: "ok:renews lease|renews", nb: "standby", co: "lit:lease · holder A|holder A" },
        go: ["na>co:ok"],
        n: "time-limited leadership|time-limited leadership",
        lp: true,
      },
    ],
  },
  {
    id: "prod",
    label: "In production",
    s: [
      {
        c: "Kafka: Broker1 leads partition 0 and fails. The controller picks Broker2 from the in-sync replicas and bumps the epoch to 2. When Broker1 returns acting on epoch 1, it's rejected and becomes a follower.",
        k: "case study · kafka epoch",
        on: { b1: "bad:epoch 1 · rejected|epoch 1", b2: "ok:leader · epoch 2|epoch 2", ct: "lit:picks from ISR|ISR", b3: "ok:follows 2" },
        w: ["ct>b2:ok", "ct>b3"],
        go: ["b1^b3:bad"],
        n: "the epoch is Kafka's fencing token|epoch = fencing token",
      },
      {
        c: "The defaults: use etcd or ZooKeeper, put fencing tokens on every protected resource, require a quorum for elections, use leases of 10 to 30 seconds renewed at a third of that, and test partitions.",
        k: "default approach",
        on: { t0: "ok:etcd or ZooKeeper · don't build your own|etcd / ZooKeeper", t1: "ok:fencing tokens on every resource|fencing tokens", t2: "ok:quorum for elections|quorum", t3: "ok:lease 10–30 s · renew at 1/3|lease 10–30 s", t4: "ok:test partitions, monitor transitions|test partitions" },
        n: "ok:exactly one leader, provably|exactly one leader",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["split"], "split", "Split brain"],
    [["fence"], "fence", "Fencing tokens"],
    [["consensus", "coord", "prod"], "practice", "In practice"],
  ]),
  N,
);
