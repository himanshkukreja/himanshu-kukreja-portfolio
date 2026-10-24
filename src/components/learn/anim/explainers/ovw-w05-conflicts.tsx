/**
 * Week 5, day 4, the whole lesson (conflict resolution): the offline cart edited on two devices and
 * the lost update, last-write-wins and when it's fine, vector clocks to detect concurrency, CRDTs
 * (merge rules, G-Counter, OR-Set) to merge automatically, and choosing per data type.
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
  ph: [16, 44, 150, 52, "Phone"],
  lp: [16, 204, 150, 52, "Laptop"],
  sv: [240, 124, 150, 52, "Sync"],
  ct: [440, 124, 144, 52, "Cart"],
  ua: [16, 44, 150, 52, "User A"],
  ub: [16, 204, 150, 52, "User B"],
  xa: [16, 44, 150, 52, "Node A"],
  xb: [16, 204, 150, 52, "Node B"],
  cn: [440, 124, 144, 52, "Counter"],
  na: [40, 44, 150, 52, "Node A"],
  nb: [410, 44, 150, 52, "Node B"],
  nc: [40, 204, 150, 52, "Node C"],
  cm: [410, 204, 150, 52, "Compare"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const sync = ["ph>sv", "lp>sv", "sv>ct"];

const V: Vr[] = [
  {
    id: "problem",
    label: "The problem",
    s: [
      {
        c: "One cart, two devices, both offline. The phone adds A and B and removes C; the laptop removes A, adds D and sets C's quantity to 5. Then both come online and sync.",
        k: "the offline cart",
        on: { ph: "+A +B −C", lp: "−A +D C×5", sv: "warn:both sync|sync" },
        go: ["ph>sv:lit", "lp>sv:lit"],
        n: "what should the cart contain?|what's in the cart?",
      },
      {
        c: "Last-write-wins: the phone synced last, so its version wins. Item D, the removal of A and the quantity change are simply lost, and the user is confused.",
        k: "option 1 · last write wins",
        on: { ph: "ok:wins", lp: "bad:discarded|lost", sv: "LWW", ct: "bad:no D|lost D" },
        w: sync,
        go: ["sv>ct:bad"],
        n: "bad:how do you merge remove C with C×5?|remove C vs C×5?",
      },
      {
        c: "The same happens to a counter: it's 100, users A and B both read 100 and both write 101. The result is 101, not 102: one increment was lost.",
        k: "the lost update",
        on: { ua: "read 100 → 101|→ 101", ub: "read 100 → 101|→ 101", cn: "bad:101, not 102|101" },
        go: ["ua>cn:lit", "ub>cn:bad@0.3"],
        n: "bad:both computed from the same read|same read, one lost",
      },
    ],
  },
  {
    id: "lww",
    label: "Last write wins",
    s: [
      {
        c: "LWW stamps each write and keeps the highest timestamp: A at 1000 loses to B at 1001. It's simple, but clock skew, ties and blindness to causality all lose data.",
        k: "how LWW works",
        on: { ph: "A @ 1000", lp: "B @ 1001", sv: "highest wins|max ts", ct: "ok:B" },
        w: sync,
        n: "concurrent writes: one is discarded|one write discarded",
      },
      {
        c: "So LWW only fits where latest is best and losing a concurrent write is harmless: current location, a profile picture, last seen, cache entries.",
        k: "when LWW is acceptable",
        on: { t0: "ok:current location|location", t1: "ok:profile picture|profile pic", t2: "ok:\"last seen\" timestamp|last seen", t3: "ok:cache entries · can re-fetch|cache entries", t4: "bad:not counters or carts|not counters, carts" },
        n: "latest is best → LWW|latest is best",
      },
    ],
  },
  {
    id: "vc",
    label: "Vector clocks",
    s: [
      {
        c: "Vector clocks track causality. Node A writes and its clock becomes A:1; it sends to B, which merges and ticks to A:1, B:1. Meanwhile C writes on its own: C:1.",
        k: "vector clocks",
        on: { na: "lit:{A:1, B:0, C:0}|A1 B0 C0", nb: "{A:1, B:1, C:0}|A1 B1 C0", nc: "warn:{A:0, B:0, C:1}|A0 B0 C1" },
        go: ["na>nb:lit"],
        n: "max of each counter, then increment|merge = max, then tick",
      },
      {
        c: "Compare A's write with C's: neither clock is less than or equal to the other in every position, so they are concurrent, a real conflict. If one were, it would simply supersede.",
        k: "concurrent = conflict",
        on: { na: "{A:1, B:0, C:0}|A1 B0 C0", nc: "{A:0, B:0, C:1}|A0 B0 C1", cm: "bad:A ∥ C · conflict|conflict" },
        go: ["na>cm:warn", "nc>cm:warn"],
        n: "detects conflicts; the app resolves|detect, then resolve",
      },
    ],
  },
  {
    id: "crdt",
    label: "CRDTs",
    s: [
      {
        c: "CRDTs are data types whose merge is commutative, associative and idempotent, so replicas can merge in any order, any number of times, and still converge.",
        k: "conflict-free by design",
        on: { t0: "ok:commutative · merge(A, B) = merge(B, A)|commutative", t1: "ok:associative · grouping doesn't matter|associative", t2: "ok:idempotent · merge(A, A) = A|idempotent", t3: "sky:state-based ships state · op-based ships operations|state or ops" },
        n: "ok:all replicas converge|replicas converge",
      },
      {
        c: "A G-Counter gives each node its own counter and the value is the sum, so two concurrent increments both count: 100 becomes 102. A PN-Counter adds decrements.",
        k: "G-Counter",
        on: { xa: "ok:A: +1", xb: "ok:B: +1", cn: "ok:sum = 102|102" },
        go: ["xa>cn:ok", "xb>cn:ok"],
        n: "ok:no increment lost|no lost increment",
      },
      {
        c: "An OR-Set merges the cart: adds and removes are tracked per element, and a concurrent add wins over a remove. Collaborative text uses a sequence CRDT like RGA.",
        k: "OR-Set · add wins",
        on: { ph: "+A +B", lp: "−A +D", sv: "merge", ct: "ok:A B D" },
        w: sync,
        go: ["sv>ct:ok"],
        n: "ok:no edit silently lost|nothing silently lost",
      },
    ],
  },
  {
    id: "choose",
    label: "Choosing",
    s: [
      {
        c: "Pick per data type: an OR-Set for carts, a PN-Counter for counters and votes, LWW for simple fields, RGA or Yjs for collaborative text, vector clocks plus app logic for complex merges.",
        k: "default approach",
        on: { t0: "ok:shopping cart → OR-Set|cart → OR-Set", t1: "ok:counters, votes → PN-Counter|counters → PN", t2: "ok:simple fields → LWW|fields → LWW", t3: "ok:collaborative text → RGA / Yjs|text → RGA", t4: "sky:complex merge → vector clocks + app logic|complex → VC + app" },
        n: "keep clocks per server node, GC tombstones|server clocks, GC tombstones",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["problem"], "problem", "The problem"],
    [["lww", "vc"], "detect", "LWW + clocks"],
    [["crdt", "choose"], "crdt", "CRDTs"],
  ]),
  N,
);
