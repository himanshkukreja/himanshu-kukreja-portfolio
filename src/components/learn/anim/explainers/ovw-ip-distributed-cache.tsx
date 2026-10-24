/**
 * Interview problem 11, the whole problem (design a distributed cache): requirements (get / set with
 * TTL / delete, 1M ops/s, p99 < 1 ms), the estimate (~1 TB, 20 shards, 40 nodes, a hot key worth
 * 90K ops/s), the design (hash slots, a smart client, cache-aside), the two deep dives (resizing
 * without a cold cache; hot keys and the stampede) and failover with an epoch.
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
const N: Record<string, Nd> = {
  l1: [16, 40, 110, 46, "L1 cache|L1"],
  app: [16, 110, 110, 52, "App servers|Apps"],
  cfg: [16, 236, 110, 46, "etcd map|etcd"],
  sa: [220, 50, 120, 46, "Shard A|A"],
  sb: [220, 116, 120, 46, "Shard B|B"],
  st: [220, 182, 120, 46, "Shard T|T"],
  db: [220, 236, 120, 46, "Database|DB"],
  ra: [464, 50, 120, 46, "A replica|A rep"],
  rb: [464, 116, 120, 46, "B replica|B rep"],
  nu: [464, 116, 120, 46, "Shard U|U"],
  a1: [16, 64, 170, 60, "~1 TB"],
  a2: [215, 64, 170, 60, "20 shards|20"],
  a3: [414, 64, 170, 60, "40 nodes|40"],
  b1: [16, 190, 170, 60, "50K ops/s|50K/s"],
  b2: [215, 190, 170, 60, "0.8 Gbps"],
  b3: [414, 190, 170, 60, "90K ops/s|90K/s"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const fan = ["app>sa", "app>sb", "app>st"];

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "A cache, not a database: get, set with a TTL, delete, and eviction when full. The database stays the source of truth.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:get · set(ttl) · delete · evict when full|get · set · delete", t1: "1M ops/s at peak, 90% reads|1M ops/s", t2: "p99 under 1 ms inside the region|p99 < 1 ms", t3: "warn:losing a node loses a slice, briefly|lose a slice only", t4: "eventual is fine: TTL bounds staleness|TTL bounds staleness" },
        n: "a miss is fine; a flood of misses is not|misses ok, floods not",
      },
      {
        c: "Half a billion keys at about 2 KB each is roughly 1 TB. At 50 GB usable per node that's 20 primaries, 40 nodes with replicas.",
        k: "phase 2 · memory|memory",
        on: { a1: "lit:hot data|hot", a2: "50 GB each", a3: "ok:with 1 replica|+ replicas" },
        w: ["a1>a2", "a2>a3"],
        n: "memory decides the node count|memory sets node count",
      },
      {
        c: "Each primary then takes about 50,000 ops a second and 0.8 Gbps, well inside one node. Unless one key takes 10% of all reads.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "", a2: "", a3: "", b1: "ok:per primary|each", b2: "ok:per primary NIC|NIC", b3: "bad:one hot key|hot key" },
        w: ["a1>a2", "a2>a3", "b2>b3:bad"],
        n: "bad:one hot key outweighs a whole shard|hot key > a shard",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "The client hashes the key to one of 16,384 slots and looks the slot up in its copy of the cluster map, kept in etcd.",
        k: "phase 4 · routing|routing",
        on: { app: "lit:hash → slot|hashes", cfg: "slot → node|map", sa: "slots 0–819|0–819", sb: "820–1,638|820+", st: "… 20 shards|…" },
        w: ["cfg~app:sky", ...fan],
        go: ["cfg~app:sky"],
        n: "a few KB of map, refreshed on change|small map, pushed",
      },
      {
        c: "Then one hop, straight to the shard's primary over a pooled connection. No proxy in the path, so a hit stays under a millisecond.",
        k: "phase 4 · one hop|one hop",
        on: { app: "", sa: "ok:hit · < 1 ms|hit", sb: "", st: "", ra: "async copy|async", rb: "async copy|async" },
        w: ["app>sa:lit", "app>sb", "app>st", "sa>ra", "sb>rb"],
        go: ["app>sa:lit"],
        n: "ok:smart client: one hop, no proxy fleet|one hop, no proxy",
      },
      {
        c: "On a miss the app reads the database and writes the value back with a TTL: cache-aside. The database never knows the cache exists.",
        k: "phase 4 · miss path|miss path",
        on: { app: "", sa: "warn:miss", sb: "", st: "", db: "truth" },
        w: ["app>sa:warn", "app>sb", "app>st", "app>db:lit"],
        go: ["app>sa:warn", "app>db:lit@0.4"],
        n: "cache-aside: read DB, set with TTL|read DB, set + TTL",
      },
    ],
  },
  {
    id: "dives",
    label: "Deep dives",
    s: [
      {
        c: "Deep dive 1: with hash mod N, growing from 20 nodes to 21 remaps about 95% of keys. The cache goes cold and the database takes it all.",
        k: "deep dive 1 · resizing|resizing",
        on: { app: "", sa: "bad:misses", sb: "bad:misses", st: "bad:misses", nu: "new node|new", db: "bad:flooded" },
        w: [...fan, "app>db:bad"],
        go: ["app>db:bad*3"],
        n: "bad:mod N: adding capacity causes an outage|mod N: growth = outage",
      },
      {
        c: "Fixed slots fix it: the new node takes a few slot ranges from the others, and only about 1 key in 21 moves. The rest stays warm.",
        k: "deep dive 1 · hash slots|hash slots",
        on: { app: "", sa: "ok:warm", sb: "ok:warm", st: "ok:warm", nu: "lit:slots in|slots in", db: "ok:calm" },
        w: [...fan, "sb>nu:lit"],
        go: ["sb>nu:lit*2"],
        n: "ok:~5% of keys move, not 95%|~5% move, not 95%",
      },
      {
        c: "Deep dive 2: one product key takes 10% of reads, about 90,000 a second on one shard. More shards don't help: it's still one key.",
        k: "deep dive 2 · hot key|hot key",
        on: { app: "", sa: "bad:90K ops/s|90K/s", sb: "", st: "" },
        w: ["app>sa:bad", "app>sb", "app>st"],
        go: ["app>sa:bad*4"],
        m: [380, 262, 196, "shard A load|A load", 100, 100, "bad"],
        n: "",
        lp: true,
      },
      {
        c: "Fix it with a local cache in each app server for 1 to 5 seconds, plus replica reads. 90,000 reads a second become about 200.",
        k: "deep dive 2 · L1 + replicas|L1 + replicas",
        on: { l1: "ok:1–5 s TTL|1–5 s", app: "", sa: "ok:~200/s", ra: "ok:reads too|reads", sb: "", st: "" },
        w: ["app>sa:ok", "app>sb", "app>st", "sa>ra:ok"],
        m: [380, 262, 196, "shard A load|A load", 12, 100, "ok"],
        n: "ok:cost: a few seconds of staleness|cost: seconds stale",
      },
      {
        c: "When that key expires, thousands of misses would hit the database at once. One request takes a lock and reloads; the rest wait.",
        k: "deep dive 2 · stampede|stampede",
        on: { app: "", sa: "warn:expired", sb: "", st: "", db: "ok:1 query" },
        w: ["app>sa:warn", "app>sb", "app>st", "app>db:ok"],
        go: ["app>sa:warn*3", "app>db:ok@0.5"],
        n: "ok:single flight + jittered TTLs|single flight + jitter",
      },
    ],
  },
  {
    id: "fail",
    label: "Failure",
    s: [
      {
        c: "A primary dies. Heartbeats stop, the failure detector promotes A's replica and bumps the map's epoch, and clients follow the new map.",
        k: "phase 6 · failover|failover",
        on: { app: "", cfg: "lit:epoch 8", sa: "bad:down", ra: "ok:promoted|primary", sb: "", rb: "" },
        w: ["cfg~app:sky", "app>sb", "sb>rb", "sa>ra:bad"],
        go: ["cfg~app:sky"],
        n: "warn:unreplicated writes are lost: fine for a cache|recent writes lost: ok",
      },
      {
        c: "In a partition the old primary may still take writes. Requests carry the epoch and nodes reject stale ones, like a fencing token.",
        k: "phase 6 · split brain|split brain",
        on: { app: "", cfg: "epoch 8", sa: "bad:old epoch 7|stale", ra: "ok:epoch 8", sb: "", rb: "" },
        w: ["cfg~app:sky", "app>sb", "sb>rb"],
        n: "ok:one owner per slot, always|one owner per slot",
      },
      {
        c: "The whole answer: fixed slots to partition, a smart client for one hop, async replicas for failover, local caches for hot keys.",
        k: "the decision|decision",
        on: { t0: "ok:fixed hash slots · ~5% move on resize|fixed slots", t1: "ok:smart client · one hop, no proxy|smart client", t2: "ok:async replica · fast failover|async replica", t3: "ok:L1 cache + single flight for hot keys|L1 + single flight", t4: "warn:gave up: strong consistency with the DB|gave up: strong reads" },
        n: "a cache trades durability for speed|speed over durability",
      },
    ],
  },
];

export default build(V, N);
