/**
 * Interview problem 13, the whole problem (design a proximity service, Yelp-style nearby search):
 * requirements (radius search, filters, edits visible in minutes), the estimate (15,000 searches/s,
 * a ~10 GB geo index), the design (read-only location service over an in-memory index, a separate
 * write path via change events), the geo-index deep dive (why two B-trees fail, geohash cells, the
 * 9-cell search) and scaling (full copies, cache by cell, isolation from the database).
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
const cell = (c: number, r: number, label: string): Nd => [16 + c * 70, 48 + r * 60, 64, 52, label];
const N: Record<string, Nd> = {
  u: [16, 120, 96, 52, "App"],
  lbs: [136, 120, 110, 52, "Location|LBS"],
  gi: [270, 50, 120, 52, "Geo index|Index"],
  bc: [270, 190, 120, 52, "Redis"],
  bs: [470, 50, 114, 52, "Business|Biz"],
  db: [470, 130, 114, 52, "Postgres|PG"],
  k: [470, 210, 114, 52, "Kafka"],
  a1: [16, 64, 170, 60, "500M/day|500M/d"],
  a2: [215, 64, 170, 60, "5,800/s"],
  a3: [414, 64, 170, 60, "15,000/s|15K/s"],
  b1: [16, 190, 170, 60, "200 GB"],
  b2: [215, 190, 170, 60, "32 B"],
  b3: [414, 190, 170, 60, "~10 GB"],
  h1: [16, 64, 170, 60, "Host 1"],
  h2: [215, 64, 170, 60, "Host 2"],
  h3: [414, 64, 170, 60, "Host 3"],
  c0: cell(0, 0, "tdr4j|4j"),
  c1: cell(1, 0, "tdr4n|4n"),
  c2: cell(2, 0, "tdr4p|4p"),
  c3: cell(0, 1, "tdr1v|1v"),
  c4: cell(1, 1, "tdr1y|1y"),
  c5: cell(2, 1, "tdr1z|1z"),
  c6: cell(0, 2, "tdr1t|1t"),
  c7: cell(1, 2, "tdr1w|1w"),
  c8: cell(2, 2, "tdr1x|1x"),
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const grid = (center: string, around: string) => ({ c0: around, c1: around, c2: around, c3: around, c4: center, c5: around, c6: around, c7: around, c8: around });
const R = 236; // right-hand notes beside the grid

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Find businesses within a radius of the user, filter by category and open now, rank them. Owner edits only need to show up within minutes.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:search near (lat, lng), 0.5 to 20 km|near (lat, lng)", t1: "filter: category, open now · page by 20|filter + page", t2: "p99 under 200 ms|p99 < 200 ms", t3: "warn:edits visible in minutes, a day at worst|edits: minutes", t4: "don't keep users' precise locations|no stored locations" },
        n: "a huge stale-ok read path, a tiny write path|big reads, tiny writes",
      },
      {
        c: "100 million daily users times 5 searches is 500 million a day: about 5,800 a second, 15,000 at peak. Edits are about one a second.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "searches", a2: "average|avg", a3: "warn:peak" },
        w: ["a1>a2", "a2>a3"],
        n: "searches dwarf edits|searches dwarf edits",
      },
      {
        c: "200 million businesses are 200 GB of records, but an index entry is only 32 bytes: about 10 GB in all. It fits in one server's memory.",
        k: "phase 2 · the key number|key number",
        on: { a1: "", a2: "", a3: "", b1: "records", b2: "per entry|entry", b3: "ok:whole index|index" },
        w: ["a1>a2", "a2>a3", "b1>b2", "b2>b3:ok"],
        n: "ok:replicate the index, don't shard it|replicate, don't shard",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "A search goes app, location service, the in-memory geo index for candidate IDs, then Redis for names, ratings and hours. All read-only.",
        k: "phase 4 · search path|search",
        on: { u: "", lbs: "lit:stateless|read-only", gi: "ok:cell → IDs|IDs", bc: "details" },
        w: ["u>lbs", "lbs>gi:lit", "lbs>bc"],
        go: ["u>lbs:lit", "lbs>gi:lit@0.3", "lbs>bc:lit@0.55"],
        n: "no database on the hot path|no DB on the hot path",
      },
      {
        c: "Owners edit through the business service into Postgres. Change events flow through Kafka to every index copy within minutes.",
        k: "phase 4 · write path|writes",
        on: { gi: "warn:updated|update", bs: "owners", db: "truth", k: "changes" },
        w: ["bs>db", "db>k", "k>gi:warn"],
        go: ["bs>db:sky", "db>k:sky@0.3", "k>gi:warn@0.55"],
        n: "a nightly rebuild catches any missed event|nightly rebuild = safety",
      },
    ],
  },
  {
    id: "geo",
    label: "Geo index",
    s: [
      {
        c: "Two B-tree indexes on lat and lng each match a band around the planet. The database intersects millions of rows to keep a few hundred.",
        k: "deep dive 1 · why not B-trees|why not B-trees",
        on: { t0: "bad:index on lat → a strip around the whole planet|lat: planet-wide strip", t1: "bad:index on lng → a strip from pole to pole|lng: pole to pole", t2: "warn:intersect millions of rows to keep hundreds|millions → hundreds", t3: "ok:fix: map 2-D space to cells with IDs|fix: cell IDs" },
        n: "near is a circle, not a range|near is a circle",
      },
      {
        c: "Geohash interleaves latitude and longitude bits into a string. A shared prefix means a shared cell, and each extra character zooms in.",
        k: "deep dive 1 · geohash|geohash",
        on: grid("lit:you", "dim:"),
        x: [[R, 80, "length 4 ≈ 39 × 20 km|len 4 ≈ 39 km"], [R, 120, "lit:length 5 ≈ 4.9 km (tdr1y)|len 5 ≈ 4.9 km"], [R, 160, "length 6 ≈ 1.2 × 0.6 km|len 6 ≈ 1.2 km"], [R, 200, "length 7 ≈ 150 m|len 7 ≈ 150 m"]],
        n: "pick the finest cell at least as wide as the radius|cell ≥ radius",
      },
      {
        c: "Two cafés 50 metres apart can sit either side of a cell edge with no prefix in common. So search the user's cell and its 8 neighbours.",
        k: "deep dive 1 · the boundary|boundary",
        on: grid("lit:you", "ok:"),
        x: [[R, 90, "warn:north of tdr1y is tdr4n, not tdr1…|north: tdr4n"], [R, 130, "warn:neighbours can share no prefix|no shared prefix"], [R, 170, "ok:9 lookups cover the circle|9 lookups"]],
        n: "the classic interview trap|the classic trap",
      },
      {
        c: "Compute the exact distance to every candidate, drop those outside the radius or category, rank the rest. Too few? Drop a character.",
        k: "deep dive 1 · filter + rank|filter + rank",
        on: grid("ok:you", "ok:"),
        x: [[R, 90, "few hundred candidates|~100s candidates"], [R, 130, "ok:exact distance: microseconds|exact distance"], [R, 170, "rank by distance + rating|distance + rating"], [R, 210, "warn:too few → wider cells|too few → widen"]],
        n: "dense downtown? index it one level finer|dense? go finer",
      },
    ],
  },
  {
    id: "scale",
    label: "Scale",
    s: [
      {
        c: "Every location host keeps the full 10 GB index in memory. Add hosts for throughput and put a set in each region. No scatter-gather.",
        k: "deep dive 2 · full copies|full copies",
        on: { h1: "ok:full 10 GB|10 GB", h2: "ok:full 10 GB|10 GB", h3: "ok:full 10 GB|10 GB" },
        n: "ok:throughput scales with host count|scale = add hosts",
      },
      {
        c: "Cache results by category and cell, like cafe:tdr1y, for a minute. Millions of exact positions become one key, and none is stored.",
        k: "deep dive 2 · cache by cell|cache by cell",
        on: { u: "", lbs: "", gi: "", bc: "ok:cafe:tdr1y|tdr1y" },
        w: ["u>lbs", "lbs>gi", "lbs>bc:ok"],
        go: ["u>lbs:lit*3", "lbs>bc:ok@0.3"],
        n: "ok:the cell is the key, not the user|cell is the key",
      },
      {
        c: "If Postgres goes down, search keeps working from memory and only owner edits fail. The two paths are isolated on purpose.",
        k: "phase 6 · failure|failure",
        on: { u: "", lbs: "", gi: "ok:serving", bc: "ok:serving", bs: "warn:edits fail|fails", db: "bad:down", k: "" },
        w: ["u>lbs", "lbs>gi:ok", "lbs>bc:ok", "bs>db:bad"],
        go: ["u>lbs:ok"],
        n: "ok:reads never wait on writes|reads never wait",
      },
      {
        c: "The whole answer: geohash cells and a 9-cell search, a full in-memory copy per host, cache by cell, and edits via change events.",
        k: "the decision|decision",
        on: { t0: "ok:geohash cells · 9-cell search · exact filter|geohash, 9 cells", t1: "ok:full ~10 GB copy on every host|full copy per host", t2: "ok:cache by category + cell|cache by cell", t3: "ok:edits via change events, nightly rebuild|change events", t4: "warn:gave up: instant edits, perfect cell shapes|gave up: instant edits" },
        n: "a small index, copied everywhere|small index, everywhere",
      },
    ],
  },
];

export default build(V, N);
