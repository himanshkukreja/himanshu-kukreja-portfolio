/**
 * Week 5, day 1, the whole lesson (consistency models): the visibility question (A writes X=1 on
 * node 1, B reads node 2), the spectrum from linearizable to eventual with the lesson's examples,
 * CAP during a partition, tunable consistency and quorums, and choosing a level per operation.
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
  ua: [40, 228, 150, 46, "User A"],
  ub: [410, 228, 150, 46, "User B"],
  n1: [40, 110, 150, 56, "Node 1"],
  n2: [410, 110, 150, 56, "Node 2"],
  cl: [40, 110, 150, 56, "Client"],
  r1: [410, 40, 150, 46, "Replica 1"],
  r2: [410, 124, 150, 46, "Replica 2"],
  r3: [410, 208, 150, 46, "Replica 3"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const net = "n1~n2";

const V: Vr[] = [
  {
    id: "question",
    label: "The question",
    s: [
      {
        c: "Consistency answers one question: when a write happens, who sees it and when? At T=0 user A writes X=1 to node 1; at T=1 user B reads X from node 2.",
        k: "who sees a write, and when?",
        on: { ua: "lit:write X=1|X=1", n1: "ok:X = 1", n2: "warn:X = ?", ub: "reads X" },
        w: [net],
        go: ["ua>n1:lit", "n1>n2:sky@0.4", "ub>n2:lit@0.2"],
        x: [[300, 122, "network delay|delay", "s", "middle"]],
        n: "the update may not have arrived yet|update may not be there",
      },
      {
        c: "B might see X=1, strong consistency; X=0 for now, eventual; or an error, choosing consistency over availability. You can have two of instant visibility, low latency and high availability.",
        k: "pick any two",
        on: { t0: "ok:sees X=1 · strong consistency|X=1 · strong", t1: "warn:sees X=0 · eventual, for now|X=0 · eventual", t2: "bad:error · consistency over availability|error · C over A", t3: "sky:it depends · causal consistency|depends · causal" },
        n: "visibility · latency · availability: pick two|pick two of three",
      },
    ],
  },
  {
    id: "spectrum",
    label: "The spectrum",
    s: [
      {
        c: "Linearizable, the strongest, behaves like a single copy: a read that starts after a write finishes must return it. Sequential only needs every node to agree on one order.",
        k: "linearizable · sequential",
        on: { ua: "write X=1", n1: "ok:X = 1", n2: "ok:X = 1", ub: "ok:must see 1|sees 1" },
        w: ["n1>n2:ok"],
        go: ["ua>n1:lit", "n1>n2:ok@0.3", "ub>n2:ok@0.6"],
        n: "for money, inventory, locks · costs latency|money, locks · slower",
      },
      {
        c: "Causal: Bob's Congratulations comments on Alice's post, so everyone sees the post first. Carol's unrelated post is concurrent and may appear in either order.",
        k: "causal · cause before effect",
        on: { ua: "Alice: P1", n1: "P1 → C1", n2: "sky:P2, P1, C1|P2 P1 C1", ub: "ok:P1 before C1|P1 first" },
        w: [net],
        go: ["n1>n2:sky"],
        n: "no one sees C1 before P1|never C1 before P1",
      },
      {
        c: "Read-your-writes: after you change your profile picture, your own refresh shows it, via sticky sessions or reading from the leader. Monotonic reads: once you read 7, you never read 5.",
        k: "read-your-writes · monotonic reads",
        on: { ua: "ok:sees new photo|new photo", n1: "lit:leader", n2: "warn:stale replica|stale", ub: "ok:7, then ≥ 7|≥ 7" },
        w: [net],
        go: ["ua>n1:ok"],
        n: "session guarantees users expect|session guarantees",
      },
      {
        c: "Eventual, the weakest: with no new writes, replicas converge, but nothing says when. DNS can take up to 48 hours, and in between users see different IPs. Fine for caches and view counts.",
        k: "eventual · eventually converges",
        on: { ua: "new IP", n1: "ok:new IP", n2: "warn:old IP", ub: "warn:old IP" },
        w: [net],
        go: ["n1>n2:sky"],
        n: "eventually: no upper bound|no upper bound",
      },
    ],
  },
  {
    id: "cap",
    label: "CAP + quorums",
    s: [
      {
        c: "During a partition you must choose. CP systems like ZooKeeper, etcd and Spanner make the minority unavailable: better unavailable than wrong.",
        k: "partition · choose consistency",
        on: { ua: "write", n1: "ok:majority", n2: "bad:refuses", ub: "bad:error" },
        w: ["n1~n2:bad"],
        go: ["ub>n2:bad"],
        x: [[300, 122, "bad:partition", "t", "middle"]],
        n: "for money, inventory, leader election|money, inventory, leaders",
      },
      {
        c: "AP systems like Cassandra, DynamoDB's eventual reads and DNS keep answering on both sides with possibly different data, and resolve conflicts later.",
        k: "partition · choose availability",
        on: { ua: "write", n1: "ok:new value|new", n2: "warn:stale value|stale", ub: "ok:answered" },
        w: ["n1~n2:bad"],
        go: ["ub>n2:ok"],
        x: [[300, 122, "bad:partition", "t", "middle"]],
        n: "for carts, sessions, view counts|carts, sessions, counts",
      },
      {
        c: "Modern stores make it tunable per request. With N=3 replicas, writing to W=2 and reading R=2 overlap, since 2 plus 2 is more than 3, so reads see the latest acknowledged write. W=1, R=1 is eventual.",
        k: "quorums · W + R > N",
        on: { cl: "lit:W=2 · R=2", r1: "ok:v2", r2: "ok:v2", r3: "warn:v1" },
        go: ["cl>r1:ok", "cl>r2:ok", "cl>r3:warn@0.5"],
        n: "Cassandra ONE · QUORUM · ALL|ONE · QUORUM · ALL",
      },
    ],
  },
  {
    id: "choose",
    label: "Per operation",
    s: [
      {
        c: "So choose per operation: browsing and inventory display can be eventual from cache, reserving inventory and checkout must be strong, and order history needs read-your-writes.",
        k: "your application",
        on: { t0: "ok:browse products · eventual (cache)|browse · eventual", t1: "ok:inventory display · eventual|display · eventual", t2: "bad:reserve inventory · strong|reserve · strong", t3: "bad:checkout · strong|checkout · strong", t4: "sky:order history · read-your-writes|history · RYW" },
        n: "strong only where stale means wrong|strong where it matters",
      },
      {
        c: "Facebook's TAO does exactly this: your own data goes through a leader cache for read-your-writes, while your friends' data comes from any cache, typically under a second behind.",
        k: "case study · TAO",
        on: { ua: "ok:own data|own", n1: "lit:leader cache|leader", n2: "any cache", ub: "friend's data|friends" },
        w: [net],
        go: ["ua>n1:ok", "ub>n2:sky"],
        n: "ok:users notice their own data, not friends'|own data fresh",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["question", "spectrum"], "spectrum", "The spectrum"],
    [["cap", "choose"], "cap", "CAP + choosing"],
  ]),
  N,
);
