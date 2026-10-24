/**
 * Week 5 capstone, the whole interview (multiplayer game matchmaking): requirements (ELO within
 * ±100, 2M concurrent players, < 30 s median wait), the estimate (~40,000 queued, 1,300 joins/s,
 * 4,000 at peak), the architecture, the four deep dives (fenced leader per region, strongly
 * consistent ratings, the match-creation saga, party membership as an OR-Set) and scaling.
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
  gw: [16, 124, 108, 52, "Gateway|Gate"],
  q: [146, 124, 116, 52, "Queue"],
  mm: [284, 124, 136, 52, "Matchmaker|Matcher"],
  mb: [284, 220, 136, 46, "Matchmaker B|Matcher B"],
  ed: [284, 36, 136, 44, "etcd"],
  gs: [446, 40, 138, 46, "Game server|Server"],
  rs: [446, 208, 138, 46, "Ratings"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const flow = ["gw>q", "q>mm", "mm>gs", "mm>rs"];

const V: Vr[] = [
  {
    id: "reqs",
    label: "Requirements",
    s: [
      {
        c: "Players queue and get matched on ELO, 0 to 3000, ideally within 100 points, widening after 60 seconds. 2 million concurrent players, 5v5 is 70% of matches, median wait under 30 seconds, 5 regions.",
        k: "phase 1 · requirements",
        on: { t0: "lit:ELO 0–3000 · within ±100, widen after 60 s|ELO ±100", t1: "lit:2M concurrent · 5 regions|2M players", t2: "5v5 = 70% · 1v1 · battle royale of 100|5v5 · 1v1 · BR", t3: "warn:median wait < 30 s · p95 < 2 min|wait < 30 s", t4: "party queue of 2–5 friends|parties of 2–5" },
        n: "quality versus speed|quality vs speed",
      },
      {
        c: "The consistency needs differ: ratings must be strongly consistent, visible within 500 ms, match assignment exactly-once so nobody is double-booked, and queue processing at-least-once.",
        k: "consistency requirements",
        on: { t0: "bad:ratings · strong, no stale reads|ratings · strong", t1: "bad:match assignment · exactly-once|assignment · once", t2: "warn:queue state · at-least-once|queue · ≥ once", t3: "ok:99.9% uptime · no lost players|99.9%, none lost" },
        n: "one leader per region does the matching|one matcher per region",
      },
    ],
  },
  {
    id: "estimate",
    label: "Estimate",
    s: [
      {
        c: "Of 2 million players, about 1.6 million are in 160,000 matches. Matches last 20 minutes, so 8,000 end and start each minute: about 1,300 queue joins a second, 4,000 at a 3x peak.",
        k: "phase 2 · traffic",
        on: { t0: "1.6M in matches · 160,000 matches of 10|160K matches", t1: "8,000 matches / minute · 20 min each|8K / min", t2: "lit:~1,300 joins/s · peak ~4,000|1,300 → 4,000/s", t3: "ok:Little's law: 1,300/s × 30 s ≈ 40,000 queued|≈ 40K queued" },
        n: "only ~2% of players are in a queue|~2% queued",
      },
      {
        c: "Storage is small: player profiles about 5 GB, match history 1.3 TB a year, and the whole queue just 2.4 MB in memory, 60 bytes per queued player.",
        k: "storage",
        on: { t0: "player data · 50M × 100 B = 5 GB|players · 5 GB", t1: "match history · 3.5 GB a day, 1.3 TB a year|history · 1.3 TB/yr", t2: "ok:queue state · 40K × 60 B = 2.4 MB|queue · 2.4 MB" },
        n: "the hard part is coordination, not size|coordination, not size",
      },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    s: [
      {
        c: "Players hold WebSocket connections to the gateway; the queue service keeps queue state in Redis; one matchmaker per region builds balanced matches, allocates a game server, and the rating service updates ELO in PostgreSQL.",
        k: "phase 3 · high-level design",
        on: { gw: "WebSocket", q: "Redis", mm: "lit:leader", ed: "lease", gs: "ok:allocated", rs: "PostgreSQL|Postgres" },
        w: [...flow, "ed>mm"],
        go: ["gw>q:lit", "q>mm:lit@0.3", "mm>gs:ok@0.6"],
        n: "match found pushed in < 50 ms|push in < 50 ms",
        tw: 2200,
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    s: [
      {
        c: "Deep dive 1: two matchmakers that both think they lead read the same Player1 to Player10 and create two matches. So the leader is elected in etcd and every queue change carries its fencing token.",
        k: "deep dive 1 · fenced leader",
        on: { q: "ok:token checked|checked", mm: "ok:leader · token|leader", mb: "bad:stale · rejected|rejected", ed: "lit:fencing token|token" },
        w: ["ed>mm:lit"],
        go: ["mm>q:ok", "mb>q:bad@0.3"],
        n: "if the leader crashes: 10 s lease, re-queue orphans|crash: re-queue orphans",
      },
      {
        c: "Deep dive 2: player A wins and goes from 1500 to 1520, but a replica still says 1500 and the next queue uses it: an unfair match. Updates and matchmaking reads go to the primary; leaderboards can be eventual.",
        k: "deep dive 2 · ratings",
        on: { t0: "bad:rating update · linearizable, primary|update · primary", t1: "warn:own rating · read-your-writes|own · RYW", t2: "bad:matchmaker read · primary, snapshot at join|matcher · primary", t3: "ok:leaderboard · eventual, cached replica|leaderboard · eventual" },
        n: "1500 → 1520 must be seen at once|no stale 1500",
      },
      {
        c: "Deep dive 3: creating a match is a saga: remove players from the queue, ready check, allocate a server, write the match, notify. If no server is free, compensate by putting everyone back in the queue.",
        k: "deep dive 3 · match saga",
        on: { gw: "ready ✓", q: "warn:re-queued", mm: "lit:saga", gs: "bad:none free|none" },
        w: ["gw>q", "q>mm", "mm>gs:bad"],
        go: ["mm>q:warn"],
        n: "compensation keeps players from vanishing|no player vanishes",
      },
      {
        c: "Deep dive 4: Alice kicks Carol, Carol leaves, and Bob invites Dave, all before syncing. As an OR-Set, Carol is removed by both and Dave was added with no conflicting remove: Alice, Bob, Dave.",
        k: "deep dive 4 · party as an OR-Set",
        on: { t0: "Alice kicks Carol → tombstone Carol|kick Carol", t1: "Carol leaves → tombstone Carol|Carol leaves", t2: "Bob invites Dave → add Dave|add Dave", t3: "ok:merge → {Alice, Bob, Dave}|{Alice, Bob, Dave}" },
        n: "concurrent add + remove: add wins|add wins",
      },
    ],
  },
  {
    id: "scale",
    label: "Scale",
    s: [
      {
        c: "Leaders can't be added, there's one per region. At 10x, a 500 ms matchmaking cycle can't process about 400,000 queued players, so parallelize within each region by ELO band, and add standbys.",
        k: "phase 5 · first bottleneck",
        on: { gw: "", q: "warn:~400K", mm: "bad:500 ms cycle|500 ms", mb: "ok:standby", gs: "", rs: "" },
        w: flow,
        n: "split by ELO bands, not more leaders|parallelize by ELO band",
      },
      {
        c: "When a matchmaker crashes, its etcd lease expires in about 10 seconds and the queue builds up until a new leader, with a higher token, takes over. If a game server dies, players return to the queue with no ELO change.",
        k: "failure · matchmaker crash",
        on: { gw: "", q: "warn:building up|waiting", mm: "bad:crashed", mb: "ok:new leader|leader", ed: "lit:lease expired|expired" },
        w: ["gw>q", "q>mm:bad"],
        n: "ok:no lost players, no double-booking|nobody lost or double-booked",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["reqs", "estimate"], "estimate", "Reqs + estimate"],
    [["arch", "deep.0.2"], "design", "Design"],
    [["deep.2", "scale"], "dives", "Dives + scale"],
  ]),
  N,
);
