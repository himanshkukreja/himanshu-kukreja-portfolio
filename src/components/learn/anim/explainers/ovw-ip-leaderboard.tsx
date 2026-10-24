/**
 * Interview problem 14, the whole problem (design a real-time game leaderboard): requirements
 * (top 10, my rank and neighbours, monthly seasons), the estimate (15,000 updates/s, a 5 GB sorted
 * set), the design (game servers → score service → Kafka → ZINCRBY, reads with ZREVRANK), the rank
 * deep dive (COUNT(*) vs a skip list, ties, dedupe by match_id) and scale / failure (hash shards and
 * merged top-K, approximate ranks, rebuilding the derived set).
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
const sh = (i: number): Nd => [16 + i * 146, 64, 130, 60, `Shard ${i + 1}|S${i + 1}`];
const N: Record<string, Nd> = {
  gs: [16, 50, 100, 52, "Game svrs|Games"],
  ss: [136, 50, 100, 52, "Score svc|Score"],
  k: [256, 50, 100, 52, "Kafka"],
  w: [376, 50, 92, 52, "Writer"],
  r: [484, 50, 100, 52, "Redis"],
  db: [256, 190, 100, 52, "Postgres|PG"],
  ls: [484, 140, 100, 52, "Reads"],
  p: [484, 228, 100, 46, "Players|App"],
  a1: [16, 64, 170, 60, "2,900/s"],
  a2: [215, 64, 170, 60, "15,000/s|15K/s"],
  a3: [414, 64, 170, 60, "45,000/s|45K/s"],
  b1: [16, 190, 170, 60, "50M"],
  b2: [215, 190, 170, 60, "100 B"],
  b3: [414, 190, 170, 60, "~5 GB"],
  s0: sh(0),
  s1: sh(1),
  s2: sh(2),
  s3: sh(3),
  mg: [200, 200, 200, 52, "Merge"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const all = { gs: "", ss: "", k: "", w: "", r: "", db: "", ls: "", p: "" };
const wires = ["gs>ss", "ss>k", "k>w", "w>r", "k>db", "p>ls", "ls>r"];

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Game servers report match points. Players want the top 10, their own rank and the players around them, within seconds of a match.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:scores come from game servers, never clients|servers report scores", t1: "top 10 · my rank · 5 above and below|top 10 · my rank", t2: "ranks fresh within ~2 seconds|fresh in ~2 s", t3: "warn:a retried report must never count twice|no double counting", t4: "monthly seasons that reset to zero|monthly seasons" },
        n: "the top 10 is easy; everyone's rank is not|top 10 easy, ranks hard",
      },
      {
        c: "25 million players times 10 matches is 250 million updates a day: 2,900 a second, 15,000 at the evening peak, with three reads for each.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "updates avg|avg", a2: "warn:peak updates|peak", a3: "peak reads|reads" },
        w: ["a1>a2", "a2>a3"],
        n: "reads ≈ 3x writes|reads ≈ 3x writes",
      },
      {
        c: "50 million scored players at about 100 bytes each is a 5 GB sorted set. It fits in one machine's memory with room to spare.",
        k: "phase 2 · memory|memory",
        on: { a1: "", a2: "", a3: "", b1: "players", b2: "per entry|each", b3: "ok:whole board|board" },
        w: ["a1>a2", "a2>a3", "b1>b2", "b2>b3:ok"],
        n: "ok:size is easy; the rank query is the problem|the rank query is hard",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "A match ends: the score service checks the server and the points, then writes one event per player to Kafka. That log is the truth.",
        k: "phase 4 · report|report",
        on: { ...all, ss: "lit:validate", k: "ok:durable" },
        w: wires,
        go: ["gs>ss:lit", "ss>k:lit@0.3"],
        n: "keyed by player, so updates stay in order|keyed by player",
      },
      {
        c: "The writer applies ZINCRBY to the season's sorted set, lb:2026-10, in O(log N). Another consumer keeps season totals in Postgres.",
        k: "phase 4 · apply|apply",
        on: { ...all, w: "lit:ZINCRBY", r: "ok:lb:2026-10|2026-10", db: "totals" },
        w: wires,
        go: ["k>w:lit", "w>r:lit@0.3", "k>db:sky@0.2"],
        n: "a new season is just a new key|new season = new key",
      },
      {
        c: "Reads: ZREVRANK for my rank, ZREVRANGE for my neighbours and the top 10. The top 10 is cached for a second, because everyone asks.",
        k: "phase 4 · read|read",
        on: { ...all, ls: "ok:top 10 · 1 s|top 10", r: "ZREVRANK" },
        w: wires,
        go: ["p>ls:ok", "ls>r:ok@0.3"],
        n: "ok:both answers in well under 50 ms|well under 50 ms",
      },
    ],
  },
  {
    id: "rank",
    label: "Rank",
    s: [
      {
        c: "In SQL, rank means COUNT(*) of everyone above you. For a mid-table player that's 25 million index entries, at 45,000 reads a second.",
        k: "deep dive 1 · SQL|SQL",
        on: { t0: "bad:SELECT COUNT(*) WHERE score > 2210|COUNT(*) above me", t1: "bad:O(rank): 25M entries for the middle|O(rank)" },
        m: [16, 170, 568, "entries read per rank query|entries per query", 100, 100, "bad"],
        n: "bad:top 10 is cheap, the middle is not|the middle is costly",
      },
      {
        c: "A sorted set's skip list records how many members each link spans, so a rank takes O(log N): about 26 steps for 50 million players.",
        k: "deep dive 1 · skip list|skip list",
        on: { t0: "ok:ZREVRANK lb:2026-10 p_42 → 48,213|ZREVRANK → 48,213", t1: "ok:O(log N): ~26 steps for 50M|O(log N) ≈ 26 steps" },
        m: [16, 170, 568, "entries read per rank query|entries per query", 1, 100, "ok"],
        n: "ok:the counts live inside the structure|counts in the structure",
      },
      {
        c: "Ties go to whoever got there first: pack points and time into the 53 exact bits of the score, points × 2^22 plus time left.",
        k: "deep dive 1 · ties|ties",
        on: { t0: "p_42 · 2,210 points · reached first|p_42 · 2,210 · first", t1: "p_77 · 2,210 points · reached later|p_77 · 2,210 · later", t2: "lit:score = points × 2^22 + (season_end − t)|points × 2^22 + time", t3: "ok:31 bits of points + 22 bits of time = 53|31 + 22 = 53 bits" },
        n: "higher = more points, or the same points earlier|more, or same but earlier",
      },
      {
        c: "Kafka redelivers and servers retry. A Lua script sets applied:m_771:p_42 with NX and only increments if the key was new.",
        k: "deep dive 1 · idempotency|idempotency",
        on: { ...all, gs: "warn:retry", w: "lit:Lua · NX", r: "ok:+30 once|once" },
        w: wires,
        go: ["gs>ss:warn*2", "k>w:warn@0.3", "w>r:ok@0.6"],
        n: "ok:a redelivered match changes nothing|redelivery = no-op",
      },
    ],
  },
  {
    id: "scale",
    label: "Scale + fail",
    s: [
      {
        c: "At 500 million players, shard by player hash. The global top 10 is exact: take each shard's top 10 and merge the lists.",
        k: "deep dive 2 · sharding|sharding",
        on: { s0: "top 10", s1: "top 10", s2: "top 10", s3: "top 10", mg: "ok:global top 10|top 10" },
        w: ["s0)mg", "s1>mg", "s2>mg", "s3)mg"],
        go: ["s0)mg:ok", "s1>mg:ok", "s2>mg:ok", "s3)mg:ok"],
        n: "exact rank = sum of ZCOUNT over every shard|rank = sum of ZCOUNTs",
      },
      {
        c: "Rank 31,402,117 means nothing more than 31,402,118. Keep exact ranks for the top 10,000 and a score histogram for the rest.",
        k: "deep dive 2 · approximate|approximate",
        on: { t0: "ok:top 10,000 · exact, from the sorted set|top 10K · exact", t1: "lit:everyone else · \"top 38%\" from 1,000 buckets|rest · from a histogram", t2: "friends · fetch 200 scores and sort|friends · sort 200", t3: "per country · just another sorted-set key|country · another key" },
        n: "spend exactness where players look|exact where it matters",
      },
      {
        c: "If Redis loses everything, rebuild: the sorted set is derived. Reload season totals from Postgres, then replay Kafka from that point.",
        k: "phase 6 · failure|failure",
        on: { ...all, r: "warn:rebuilt", db: "ok:totals", k: "ok:replay" },
        w: wires,
        go: ["k>w:ok", "w>r:ok@0.3"],
        n: "ok:idempotency makes the replay safe|replays are safe",
      },
      {
        c: "The whole answer: Kafka and Postgres for truth, a Redis sorted set for ranks, dedupe by match_id, exact at the top, approximate below.",
        k: "the decision|decision",
        on: { t0: "ok:truth: Kafka events + Postgres totals|truth: Kafka + PG", t1: "ok:ranks: Redis sorted set, O(log N)|ranks: sorted set", t2: "ok:dedupe by match_id in one Lua script|dedupe by match_id", t3: "ok:exact top 10,000, histogram for the rest|exact top, approx rest", t4: "warn:gave up: exact cheap ranks for everyone|gave up: exact for all" },
        n: "a fast index over durable truth|fast index, durable truth",
      },
    ],
  },
];

export default build(V, N);
