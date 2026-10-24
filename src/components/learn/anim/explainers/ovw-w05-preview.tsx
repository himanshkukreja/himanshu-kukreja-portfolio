/**
 * Week 5 preview, the whole lesson: the cost of Week 4's staleness (two buyers, one item), the
 * four problems of the week (oversell, a half-done transfer, conflicting offline edits, split
 * brain), and the five days that answer them: consistency models, sagas, orchestration, conflict
 * resolution, leader election with fencing.
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

const top = 44;
const bot = 204;
const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  ua: [16, top, 130, 52, "User A"],
  ub: [16, bot, 130, 52, "User B"],
  ca: [236, top, 130, 52, "Cache"],
  inv: [236, bot, 130, 52, "Inventory|Stock"],
  aa: [16, 124, 130, 52, "Account A|Acct A"],
  ab: [446, 124, 138, 52, "Account B|Acct B"],
  tx: [236, 124, 130, 52, "Transfer"],
  doc: [300, 124, 150, 52, "Document|Doc"],
  na: [16, top, 130, 52, "Node A"],
  nb: [16, bot, 130, 52, "Node B"],
  job: [300, 124, 150, 52, "Job"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};

const V: Vr[] = [
  {
    id: "cost",
    label: "The cost",
    s: [
      {
        c: "Last week we cached inventory for 30 seconds. Users A and B both see 1 item in stock, both click Buy Now, and both orders go through: inventory reaches -1.",
        k: "the last item",
        on: { ua: "sees 1", ub: "sees 1", ca: "warn:1 in stock|1", inv: "bad:-1 ???" },
        w: ["ua>ca", "ub>ca"],
        go: ["ua>inv:lit", "ub>inv:bad@0.3"],
        n: "bad:sold 2 items when we had 1|sold 2 of 1",
      },
      {
        c: "Three ways out: lock the inventory during checkout, slower but correct; check-and-set at commit, faster with occasional failures; or detect the oversell and cancel one order.",
        k: "strong, optimistic, or compensate",
        on: { t0: "ok:1 · strong consistency · lock during checkout|1 · lock", t1: "ok:2 · optimistic · check-and-set at commit|2 · check-and-set", t2: "warn:3 · compensation · cancel one order|3 · compensate" },
        n: "the right one depends on what you need|depends on requirements",
      },
    ],
  },
  {
    id: "problems",
    label: "Hard problems",
    s: [
      {
        c: "Transfer $100: the debit from account A succeeds, the credit to account B fails because its service is down. In one database you'd roll back; across microservices there's no rollback. That's why we need sagas.",
        k: "the money transfer",
        on: { aa: "ok:-$100", tx: "warn:half done|half", ab: "bad:service down|down" },
        w: ["aa>tx:ok"],
        go: ["tx>ab:bad"],
        n: "bad:$100 disappeared|$100 disappeared",
      },
      {
        c: "Two users edit offline: A types Hello World at position 0, B types Goodbye there. Both sync, and with last-write-wins one edit is simply lost. That's why we need CRDTs.",
        k: "collaborative editing",
        on: { ua: "Hello World", ub: "Goodbye", doc: "bad:one edit lost|1 lost" },
        go: ["ua>doc:sky", "ub>doc:warn"],
        n: "expected: both edits appear|both should survive",
      },
      {
        c: "A job scheduler where node A and node B both think they're the leader: both run the same job, and the data is corrupted. Ensuring exactly one leader is why leader election is hard.",
        k: "split brain",
        on: { na: "warn:leader?", nb: "warn:leader?", job: "bad:runs twice|twice" },
        go: ["na>job:warn", "nb>job:warn"],
        n: "bad:two leaders, two different decisions|two leaders",
      },
    ],
  },
  {
    id: "week",
    label: "The week",
    s: [
      {
        c: "Day 1, consistency models: from linearizable, one copy, down to eventual, eventually converges. Cost and latency fall as you go down, and you choose per operation, not once.",
        k: "day 1 · consistency models",
        on: { t0: "bad:linearizable · \"one copy\"|linearizable", t1: "warn:sequential · all see the same order|sequential", t2: "sky:causal · cause before effect|causal", t3: "sky:read-your-writes · see your own writes|read-your-writes", t4: "ok:eventual · eventually converges|eventual" },
        n: "browse AP · order CP · history causal|per operation",
      },
      {
        c: "Day 2, sagas: run T1, T2, T3, each with a compensating action. If T3 fails, run C2 then C1. No distributed locks, unlike two-phase commit, which blocks everyone while it waits.",
        k: "day 2 · the saga pattern",
        on: { aa: "ok:T1", tx: "ok:T2", ab: "bad:T3 fails|T3 ✗" },
        w: ["aa>tx:ok", "tx>ab:bad"],
        go: ["tx>aa:warn@0.4"],
        x: [[236, 210, "warn:C2 → C1 undo the steps|C2, then C1"]],
        n: "compensate instead of rolling back|compensate, don't roll back",
      },
      {
        c: "Day 3, orchestration: model the saga as a state machine and run it on a durable engine like Temporal, so a workflow survives crashes and resumes where it stopped.",
        k: "day 3 · orchestration",
        on: { aa: "ok:step 1", tx: "lit:orchestrator|engine", ab: "step 2" },
        w: ["tx>aa:ok", "tx>ab"],
        n: "durable execution · versioned workflows|durable execution",
      },
      {
        c: "Day 4, conflict resolution: last-write-wins loses data, vector clocks detect concurrent edits, and CRDTs like G-Counters and OR-Sets merge them automatically.",
        k: "day 4 · conflict resolution",
        on: { ua: "edit A", ub: "edit B", doc: "ok:merged" },
        go: ["ua>doc:ok", "ub>doc:ok"],
        n: "ok:both edits survive|both survive",
      },
      {
        c: "Day 5, leader election: a lock has a TTL, but a slow holder can wake up still thinking it holds it. Fencing tokens let the resource reject the stale one, with ZooKeeper or etcd behind it.",
        k: "day 5 · leader election",
        on: { na: "bad:stale token|stale", nb: "ok:newer token|leader", job: "ok:rejects stale|once" },
        go: ["nb>job:ok", "na>job:bad"],
        n: "ok:make it correct, then fast|correct, then fast",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["cost", "problems"], "problems", "Hard problems"],
    [["week"], "week", "The week"],
  ]),
  N,
);
