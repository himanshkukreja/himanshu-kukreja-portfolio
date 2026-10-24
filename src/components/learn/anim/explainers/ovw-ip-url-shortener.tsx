/**
 * The whole problem, interview problem bank 01 (design a URL shortener): requirements and the estimate
 * (100M links a month, ~40 creates and ~4,000 redirects a second, 6 billion links ≈ 3 TB, 62^7 codes);
 * the create and redirect paths (block-leasing shorten service, Redis cache-aside, sharded URL store,
 * clicks to Kafka); the two deep dives (where codes come from, 302 and caching); and failure modes.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 380;
type Pt = { x: number; y: number };
type Nd = { x: number; y: number; w: number; h: number; label: string; nl?: string };
type St = { tone?: Tone; sub?: string; ns?: string; dim?: boolean };
type Row = { k: string; v: string; nv?: string; tone?: Tone; m?: number };
type Go = { r: string[]; a: number; b: number; tone?: Tone };
type Fr = { kick: string; kt?: Tone; on?: string[]; st?: Record<string, St>; rows?: Row[]; mx?: number; go?: Go[]; l: [string, string]; nl?: [string, string] };
type Sp = { c: string; f: Fr; tween?: number; ms?: number };

const N: Record<string, Nd> = {
  u: { x: 16, y: 150, w: 80, h: 52, label: "Users" },
  lb: { x: 110, y: 150, w: 66, h: 52, label: "LB" },
  ws: { x: 200, y: 70, w: 120, h: 56, label: "Shorten" },
  ka: { x: 354, y: 40, w: 112, h: 52, label: "Allocator", nl: "Alloc" },
  db: { x: 486, y: 150, w: 98, h: 56, label: "URL store", nl: "Store" },
  rs: { x: 200, y: 206, w: 120, h: 52, label: "Redirect" },
  rd: { x: 354, y: 206, w: 112, h: 52, label: "Redis" },
  kf: { x: 200, y: 272, w: 120, h: 46, label: "Kafka" },
};
const EDGES: [string, string, boolean?][] = [
  ["u", "lb"],
  ["lb", "ws"],
  ["lb", "rs"],
  ["ws", "ka"],
  ["ws", "db"],
  ["rs", "rd"],
  ["rd", "db"],
  ["rs", "kf"],
];
const CORE = ["u", "lb", "ws", "ka", "db", "rs", "rd"];
const ALLN = [...CORE, "kf"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "A URL shortener turns a long URL into a 7-character code and redirects anyone who opens it. Aliases and expiry are optional.",
        f: {
          kick: "the brief",
          rows: [
            { k: "shorten", v: "long URL → 7-char code (62 symbols)", nv: "7-char code" },
            { k: "redirect", v: "302 to the long URL, or 404", nv: "302 or 404" },
            { k: "alias", v: "optional custom alias · 409 if taken", nv: "409 if taken" },
            { k: "expiry", v: "5 years by default", nv: "5 years" },
            { k: "clicks", v: "counts may lag a minute", nv: "may lag" },
          ],
          l: ["shorten, redirect, alias, expiry, click counts", "reads vastly outnumber writes"],
          nl: ["shorten, redirect, clicks", "reads ≫ writes"],
        },
      },
      {
        c: "It is read heavy: about 100 redirects per link. Redirects need under 50 ms at p99, and codes must be unique and hard to enumerate.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "redirect", v: "< 50 ms p99 · strictest uptime", nv: "< 50 ms p99", tone: "lit" },
            { k: "ratio", v: "100 redirects per create", nv: "100 : 1" },
            { k: "codes", v: "never duplicated", nv: "unique", tone: "ok" },
            { k: "guessing", v: "not easy to enumerate", nv: "not sequential" },
          ],
          l: ["the redirect is the critical path", "a broken link breaks every page that embeds it"],
          nl: ["the redirect is critical", "broken link, broken pages"],
        },
      },
      {
        c: "100M links a month is about 40 creates and 4,000 redirects a second. Five years is 6 billion links, about 3 TB, using 0.17% of 62^7.",
        f: {
          kick: "estimate",
          mx: 12000,
          rows: [
            { k: "creates", v: "~40/s · peak ~120/s", nv: "~40/s", m: 120 },
            { k: "redirects", v: "~4,000/s · peak ~12,000/s", nv: "~4,000/s", m: 12000, tone: "lit" },
            { k: "5 years", v: "6 billion links ≈ 3 TB", nv: "6B ≈ 3 TB" },
            { k: "62^7", v: "≈ 3.5 trillion codes · 0.17% used", nv: "3.5T · 0.17%", tone: "ok" },
            { k: "cache", v: "hottest 20M links ≈ 10 GB", nv: "20M ≈ 10 GB" },
          ],
          l: ["writes are tiny; the redirect path is the problem", "62^6 would be ~11% full: too dense"],
          nl: ["writes are tiny", "62^6 would be ~11% full"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "Creating a link: the shorten service takes the next ID from its leased block, encodes it, and writes it with put-if-absent.",
        f: {
          kick: "create path",
          on: ["u", "lb", "ws", "ka", "db"],
          st: { ws: { tone: "lit", sub: "POST /urls", ns: "POST" }, ka: { sub: "ID blocks", ns: "blocks" }, db: { sub: "by code", ns: "by code" } },
          go: [{ r: ["u", "lb", "ws", "db"], a: 0.1, b: 0.95, tone: "lit" }],
          l: ["POST /api/v1/urls → 201 with the short URL", "the store is a key-value lookup by code"],
          nl: ["POST → 201 + short URL", "key-value lookup by code"],
        },
      },
      {
        c: "A redirect checks Redis first and reads the sharded URL store only on a miss, then answers 302.",
        f: {
          kick: "redirect path",
          on: CORE,
          st: { rs: { tone: "lit", sub: "GET /{code}", ns: "GET" }, rd: { tone: "ok", sub: "hot codes", ns: "hot" }, db: { sub: "on miss", ns: "miss" } },
          go: [{ r: ["u", "lb", "rs", "rd"], a: 0.05, b: 0.7, tone: "lit" }, { r: ["rd", "db"], a: 0.7, b: 0.98 }],
          l: ["cache-aside: Redis, then the store on a miss", "most redirects never touch the store"],
          nl: ["Redis, then the store", "most never reach the store"],
        },
      },
      {
        c: "Each redirect publishes a click event to Kafka without waiting, so analytics never slow the redirect. Counts lag by seconds.",
        f: {
          kick: "clicks off the critical path",
          on: ALLN,
          st: { rs: { tone: "lit", sub: "302 now", ns: "302" }, kf: { tone: "sky", sub: "clicks", ns: "clicks" } },
          go: [{ r: ["rs", "kf"], a: 0.2, b: 0.9, tone: "sky" }],
          l: ["fire-and-forget click events", "a consumer aggregates per-link counts"],
          nl: ["fire-and-forget clicks", "counts aggregated later"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "Three ways to make a code: hash and truncate collides, random needs a check on every insert, a counter never collides.",
        f: {
          kick: "1 · where codes come from",
          rows: [
            { k: "hash + truncate", v: "md5 → 7 chars: collisions, races", nv: "collides", tone: "bad" },
            { k: "random + check", v: "insert if absent · retries grow", nv: "check each", tone: "warn" },
            { k: "counter + base 62", v: "unique integer → never collides", nv: "never collides", tone: "ok" },
          ],
          l: ["the counter wins if many servers can share it", "without a round trip per link"],
          nl: ["counter wins, if shared", "without a call per link"],
        },
      },
      {
        c: "Each server leases a block of 10,000 IDs from one counter row. At 40 creates a second that row is touched a few times an hour.",
        f: {
          kick: "1 · leased ID blocks",
          on: ["u", "lb", "ws", "ka", "db"],
          st: { ka: { tone: "lit", sub: "N → N+10,000", ns: "+10,000" }, ws: { tone: "ok", sub: "local IDs", ns: "local" } },
          go: [{ r: ["ws", "ka"], a: 0.1, b: 0.5, tone: "lit" }, { r: ["ka", "ws"], a: 0.5, b: 0.9, tone: "ok" }],
          l: ["one atomic increment per 10,000 links", "a crash wastes only the rest of a block"],
          nl: ["one write per 10,000", "a crash wastes a block"],
        },
      },
      {
        c: "A reversible scramble hides the order, base 62 makes it 7 characters, and a conditional write rejects a taken alias with 409.",
        f: {
          kick: "1 · integer to code",
          rows: [
            { k: "id", v: "next integer from the block", nv: "next integer" },
            { k: "scramble", v: "× coprime to 62^7, mod 62^7", nv: "reversible" },
            { k: "encode", v: "base 62, padded to 7 characters", nv: "base 62 · 7" },
            { k: "write", v: "put-if-absent · alias taken → 409", nv: "taken → 409", tone: "ok" },
          ],
          l: ["unique in, unique out: no collisions", "the scramble hides order; it is not encryption"],
          nl: ["unique in, unique out", "hides order, not secret"],
        },
      },
      {
        c: "302 keeps every click and makes delete work at once. Redis caches hot codes and misses; an edge cache absorbs viral links.",
        f: {
          kick: "2 · a fast, cheap redirect",
          on: ALLN,
          st: { rs: { tone: "lit", sub: "302, not 301", ns: "302" }, rd: { tone: "ok", sub: "codes + 404s", ns: "+ 404s" }, kf: { sub: "clicks", ns: "clicks" } },
          go: [0, 0.2, 0.4].map((a) => ({ r: ["u", "lb", "rs", "rd"], a, b: a + 0.5, tone: "lit" as Tone })),
          l: ["301 may be cached by browsers: clicks and deletes lost", "negative caching stops scanners"],
          nl: ["301 hides clicks", "cache 404s for scanners"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "If Redis is down, redirects fall through to the store, so its read replicas must take the peak of about 12,000 reads a second.",
        f: {
          kick: "redis down",
          kt: "warn",
          on: CORE,
          st: { rd: { tone: "bad", sub: "down", ns: "down" }, db: { tone: "warn", sub: "12,000/s", ns: "12K/s" } },
          go: [{ r: ["rs", "rd", "db"], a: 0.1, b: 0.9, tone: "warn" }],
          l: ["slower, not fatal: size replicas for the peak", "the cache is an optimisation, not the source"],
          nl: ["slower, not fatal", "size replicas for peak"],
        },
      },
      {
        c: "If the allocator is down, servers keep issuing IDs from the block they already hold, so creation survives a short outage.",
        f: {
          kick: "allocator down",
          kt: "warn",
          on: CORE,
          st: { ka: { tone: "bad", sub: "down", ns: "down" }, ws: { tone: "ok", sub: "own block", ns: "block" } },
          go: [{ r: ["ws", "db"], a: 0.1, b: 0.9, tone: "ok" }],
          l: ["a block of 10,000 lasts a long time at 40/s", "creation keeps working untouched"],
          nl: ["blocks outlast an outage", "creates keep working"],
        },
      },
      {
        c: "Check new URLs against a phishing list, rate-limit creation, keep a blocklist for redirects, and check expiry on every read.",
        f: {
          kick: "abuse and expiry",
          on: ALLN,
          st: { ws: { tone: "warn", sub: "URL check", ns: "check" }, rs: { tone: "warn", sub: "blocklist", ns: "blocks" }, db: { sub: "sweeper", ns: "sweep" } },
          l: ["kill a bad link in seconds", "expired rows deleted later, in small batches"],
          nl: ["kill bad links fast", "sweep expired rows later"],
        },
      },
    ],
  },
];

const ALL = Object.keys(N);
/** orthogonal wire from box a to box b: an elbow when they sit side by side, straight when stacked */
function pts(a: string, b: string): Pt[] {
  const p = N[a];
  const q = N[b];
  const pc = p.y + p.h / 2;
  const qc = q.y + q.h / 2;
  if (q.x >= p.x + p.w) {
    const m = Math.round((p.x + p.w + q.x) / 2);
    return [{ x: p.x + p.w, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x, y: qc }];
  }
  if (q.x + q.w <= p.x) {
    const m = Math.round((q.x + q.w + p.x) / 2);
    return [{ x: p.x, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x + q.w, y: qc }];
  }
  const x = Math.round((Math.max(p.x, q.x) + Math.min(p.x + p.w, q.x + q.w)) / 2);
  return q.y >= p.y + p.h ? [{ x, y: p.y + p.h }, { x, y: q.y }] : [{ x, y: p.y }, { x, y: q.y + q.h }];
}
const path = (ps: Pt[]) => "M" + ps.map((p) => `${p.x} ${p.y}`).join("L");
function walk(ps: Pt[], k: number): Pt {
  const lens = ps.slice(1).map((q, i) => Math.abs(q.x - ps[i].x) + Math.abs(q.y - ps[i].y));
  let d = k * lens.reduce((s, v) => s + v, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(ps[i].x, ps[i + 1].x, u), y: lerp(ps[i].y, ps[i + 1].y, u) };
    }
    d -= lens[i];
  }
  return ps[ps.length - 1];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const v = V.find((x) => x.id === variant) || V[0];
  const i = Math.min(step, v.steps.length - 1);
  const f = v.steps[i].f;
  const before = i > 0 ? v.steps[i - 1].f.on || [] : [];
  const on = f.on || [];
  const l = narrow && f.nl ? f.nl : f.l;
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      {f.rows ? (
        <g>
          <rect className="ax-box lit" x={16} y={44} width={W - 32} height={Math.min(270, 24 + f.rows.length * 50)} />
          {f.rows.map((r, j) => {
            const y = 76 + j * 50;
            return (
              <g key={r.k} opacity={ease(seg(t, j * 0.12, j * 0.12 + 0.4))}>
                <Txt x={32} y={y} k="k" anchor="start" tone="mute">
                  {r.k}
                </Txt>
                <Txt x={32} y={y + 24} anchor="start" tone={r.tone}>
                  {narrow ? r.nv || r.v : r.v}
                </Txt>
                {r.m !== undefined && <Meter x={420} y={y + 12} w={148} h={14} value={r.m * ease(seg(t, 0.2, 0.9))} max={f.mx || r.m} tone={r.tone || "sky"} />}
              </g>
            );
          })}
        </g>
      ) : (
        <g>
          {EDGES.filter(([a, b]) => on.includes(a) && on.includes(b)).map(([a, b, dash]) => (
            <Wire key={a + b} d={path(pts(a, b))} arrow dash={dash} />
          ))}
          {ALL.filter((k) => on.includes(k)).map((k) => {
            const n = N[k];
            const s = f.st?.[k] || {};
            const sub = narrow ? (s.ns ?? s.sub) : s.sub;
            return (
              <g key={k} opacity={before.includes(k) ? 1 : ease(seg(t, 0, 0.4))}>
                <Box x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.nl || n.label : n.label} sub={sub || undefined} tone={s.tone} dim={s.dim} />
              </g>
            );
          })}
          {f.go?.map((g, j) => {
            const q = seg(t, g.a, g.b);
            if (q <= 0 || q >= 1) return null;
            const p = walk(g.r.slice(1).flatMap((b, n) => pts(g.r[n], b)), ease(q));
            return <Token key={j} x={p.x} y={p.y} tone={g.tone} />;
          })}
        </g>
      )}
      <Txt x={16} y={H - 34} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={16} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.steps.map((s) => ({ caption: s.c, tween: s.tween ?? 1400, ms: s.ms ?? 3600 })) })),
  Scene,
});
