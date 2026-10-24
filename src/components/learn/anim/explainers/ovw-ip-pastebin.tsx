/**
 * Interview problem 12, the whole problem (design Pastebin): requirements (immutable pastes, expiry,
 * unguessable unlisted links), the estimate (12 writes/s, 10 GB/day, ~18 TB in 5 years), the design
 * (metadata in Postgres, content in S3, reads at the CDN), the ID deep dive (counter vs random,
 * collisions and retry) and expiry (check on read, TTL capped, a background sweeper).
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
  u: [16, 120, 104, 52, "Browser|User"],
  cdn: [140, 120, 104, 52, "CDN"],
  api: [264, 120, 104, 52, "Service|Svc"],
  r: [480, 48, 104, 46, "Redis"],
  pg: [480, 120, 104, 52, "Postgres|PG"],
  s3: [480, 200, 104, 46, "S3"],
  sw: [264, 228, 104, 46, "Sweeper|Sweep"],
  a1: [16, 64, 170, 60, "12/s"],
  a2: [215, 64, 170, 60, "116/s"],
  a3: [414, 64, 170, 60, "~600/s"],
  b1: [16, 190, 170, 60, "10 GB/day|10 GB/d"],
  b2: [215, 190, 170, 60, "18 TB"],
  b3: [414, 190, 170, 60, "365 GB"],
  i1: [16, 64, 170, 60, "aZ3k9QxP"],
  i2: [215, 64, 170, 60, "aZ3k9QxQ"],
  i3: [414, 64, 170, 60, "aZ3k9QxR"],
  q1: [16, 64, 170, 60, "x7Qp2LmA"],
  q2: [215, 64, 170, 60, "Kd93vZtE"],
  q3: [414, 64, 170, 60, "0bW5nRyq"],
  sp: [130, 190, 340, 60, "62^8 ≈ 2.2 × 10^14|2.2 × 10^14"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const net = { u: "", cdn: "", api: "", r: "", pg: "", s3: "" };
const path = ["u>cdn", "cdn>api", "api>r", "api>pg", "api>s3"];

const V: Vr[] = [
  {
    id: "ask",
    label: "Ask + size",
    s: [
      {
        c: "Paste text, get a short link. No edits, optional expiry, and unlisted pastes are protected only by a link nobody can guess.",
        k: "phase 1 · requirements|requirements",
        on: { t0: "lit:create · read · delete, up to 10 MB|create · read · delete", t1: "ok:immutable: no edits after creation|immutable", t2: "expiry: 10 min · 1 day · 1 month · never|expiry options", t3: "warn:unlisted = the link is the only lock|link is the lock", t4: "durable until expiry, reads < 200 ms|durable, reads < 200 ms" },
        n: "immutable content can be cached forever|immutable = cacheable",
      },
      {
        c: "A million pastes a day is only 12 writes a second and 116 reads, about 600 at peak. One server could take the traffic.",
        k: "phase 2 · traffic|traffic",
        on: { a1: "writes", a2: "reads", a3: "warn:peak reads|peak" },
        w: ["a1>a2", "a2>a3"],
        n: "traffic is the easy part|traffic is easy",
      },
      {
        c: "At 10 KB each that's 10 GB a day, about 18 TB in five years, plus 365 GB of metadata. Blobs that size don't belong in a database.",
        k: "phase 2 · storage|storage",
        on: { a1: "", a2: "", a3: "", b1: "content", b2: "lit:in 5 years|5 years", b3: "ok:metadata|meta" },
        w: ["a1>a2", "a2>a3", "b1>b2", "b2>b3"],
        n: "split: rows in a DB, bytes in object storage|rows in DB, bytes in S3",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    s: [
      {
        c: "Create uploads the text to S3 under its new ID first, then inserts the metadata row, so a row never points at a missing blob.",
        k: "phase 4 · create|create",
        on: { ...net, api: "lit:create", s3: "ok:1 · blob", pg: "ok:2 · row" },
        w: path,
        go: ["u>cdn:lit", "cdn>api:lit@0.15", "api>s3:lit@0.3", "api>pg:lit@0.55"],
        n: "an orphan blob is harmless; a dangling row is not|orphans are harmless",
        tw: 2000,
      },
      {
        c: "Pastes never change, so the CDN can keep each one until it expires. Most reads end at the edge and never reach the service.",
        k: "phase 4 · read at the edge|edge read",
        on: { ...net, cdn: "ok:hit" },
        w: path,
        go: ["u>cdn:ok*3"],
        lp: true,
        n: "ok:a viral paste is the CDN's problem|viral = CDN's job",
      },
      {
        c: "On a miss the service checks Redis, then Postgres: does it exist, has it expired, may you see it? Then it streams the blob.",
        k: "phase 4 · read on a miss|miss",
        on: { ...net, cdn: "warn:miss", r: "metadata|meta", pg: "metadata|meta", s3: "lit:content|blob" },
        w: path,
        go: ["cdn>api:warn", "api>r:lit@0.2", "api>pg:lit@0.35", "api>s3:lit@0.5"],
        n: "small pastes can live inline in the row|tiny pastes inline",
      },
    ],
  },
  {
    id: "ids",
    label: "IDs",
    s: [
      {
        c: "A counter in base62 is short and collision-free, but it's sequential: try the next ID and you can read every unlisted paste.",
        k: "deep dive 1 · counter|counter",
        on: { i1: "bad:paste 1", i2: "bad:paste 2", i3: "bad:paste 3" },
        w: ["i1>i2:bad", "i2>i3:bad"],
        n: "bad:enumerable IDs break the unlisted promise|enumerable = leaked",
      },
      {
        c: "Eight random base62 characters give 2.2 × 10^14 IDs, about 120,000 for every paste we'll store in five years. Nobody can guess one.",
        k: "deep dive 1 · random|random",
        on: { q1: "ok:random", q2: "ok:random", q3: "ok:random", sp: "lit:the ID space|ID space" },
        n: "use a cryptographically secure generator|secure RNG only",
      },
      {
        c: "Collisions still happen, about 1 in 120,000. Insert with ON CONFLICT DO NOTHING; if no row comes back, pick a new ID and retry.",
        k: "deep dive 1 · collisions|collisions",
        on: { ...net, api: "warn:retry", pg: "warn:conflict|clash" },
        w: path,
        go: ["api>pg:warn", "api>pg:ok@0.5"],
        n: "ok:60 writes/s: a rare retry beats a key service|retry > key service",
      },
    ],
  },
  {
    id: "expiry",
    label: "Expiry",
    s: [
      {
        c: "Expiry is exact because every read checks expires_at and returns 404 once it has passed, however far behind cleanup is.",
        k: "deep dive 2 · check on read|check on read",
        on: { ...net, cdn: "miss", api: "ok:404|404", pg: "expires_at|expiry" },
        w: path,
        go: ["cdn>api:lit", "api>pg:lit@0.3"],
        n: "ok:correctness never waits for the sweeper|correct without sweeper",
      },
      {
        c: "Every cache TTL is capped at the time left: a paste expiring in 10 minutes is never cached, at the edge or in Redis, for longer.",
        k: "deep dive 2 · capped TTLs|capped TTLs",
        on: { ...net, cdn: "ok:TTL ≤ 10 min|≤ 10m", r: "ok:TTL ≤ 10 min|≤ 10m" },
        w: path,
        n: "TTL = min(default, expires_at − now)|TTL ≤ time left",
      },
      {
        c: "A sweeper wakes every minute, takes a batch of expired IDs from the expires_at index, and deletes the blobs, then the rows.",
        k: "deep dive 2 · the sweeper|sweeper",
        on: { ...net, sw: "lit:every minute|1/min", pg: "warn:batch|batch", s3: "warn:delete|delete" },
        w: ["u>cdn", "cdn>api", "api>pg", "sw>pg:warn", "sw^s3:warn"],
        go: ["sw^s3:warn", "sw>pg:warn@0.4"],
        n: "one sweeper at a time, safe to run twice|one at a time, idempotent",
      },
      {
        c: "The whole answer: random IDs, rows in Postgres, bytes in S3, reads at the edge, and expiry checked on every read, then swept.",
        k: "the decision|decision",
        on: { t0: "ok:8 random base62 chars + retry on conflict|random IDs + retry", t1: "ok:metadata in Postgres, content in S3|rows PG · bytes S3", t2: "ok:CDN for immutable pastes, TTL ≤ expiry|CDN, TTL ≤ expiry", t3: "ok:check on read, sweep in the background|check + sweep", t4: "warn:gave up: instant deletion at the edge|gave up: instant purge" },
        n: "boring storage, careful edges|boring storage, careful edges",
      },
    ],
  },
];

export default build(V, N);
