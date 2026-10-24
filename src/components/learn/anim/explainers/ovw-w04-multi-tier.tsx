/**
 * Week 4, day 5, the whole lesson (multi-tier caching): the five layers a request falls through
 * and what belongs in each, browser and CDN caching (Cache-Control, hashed filenames, ETags, Vary),
 * the gateway and Redis layers, invalidating a $99 → $79 change across all of them (closest to the
 * database first), and anonymous vs authenticated requests.
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

const L = (i: number, label: string): Nd => [16 + i * 116, 124, 104, 52, label];
const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  u: [16, 34, 104, 46, "User"],
  br: L(0, "Browser"),
  cdn: L(1, "CDN"),
  gw: L(2, "Gateway|Gate"),
  r: L(3, "Redis"),
  db: L(4, "Database|DB"),
  org: [248, 228, 104, 46, "Origin"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const chain = ["br>cdn", "cdn>gw", "gw>r", "r>db"];
const all = (a: string, b: string, c: string, d: string, e: string) => ({ br: a, cdn: b, gw: c, r: d, db: e });

const V: Vr[] = [
  {
    id: "layers",
    label: "The layers",
    s: [
      {
        c: "A request for product 12345 falls through up to five caches: browser at 0 ms, CDN edge 20 ms, gateway 5 ms, Redis 2 ms, then the database's buffer pool at 10 ms, or disk at 50.",
        k: "five layers, first hit answers",
        on: { u: "", ...all("0 ms", "20 ms", "5 ms", "2 ms", "10 / 50 ms|10/50 ms") },
        w: ["u>br", ...chain],
        go: ["u>br:lit", "br>cdn:lit@0.15", "cdn>gw:lit@0.3", "gw>r:lit@0.45", "r>db:lit@0.6"],
        n: "down the chain: slower, fresher, bigger|slower, fresher, bigger",
        tw: 2400,
      },
      {
        c: "Each layer holds different things: the browser static assets and preferences, the CDN public responses and media, the gateway auth checks and rate limits, Redis the business data.",
        k: "what belongs where",
        on: { t0: "sky:browser · static assets, preferences|browser · assets", t1: "sky:CDN · public API responses, media|CDN · public, media", t2: "sky:gateway · auth validation, rate limits, dedup|gateway · auth, limits", t3: "sky:Redis · sessions, profiles, products, flags|Redis · business data", t4: "database · buffer pool, materialized views|DB · buffer pool" },
        n: "personalized data never goes in the CDN|no personal data in CDN",
      },
    ],
  },
  {
    id: "edge",
    label: "Browser + CDN",
    s: [
      {
        c: "The browser follows Cache-Control: public max-age=86400 lets anyone cache for a day, private keeps it to the browser, no-store caches nothing. Hashed filenames like app.abc123.js can be cached for a year.",
        k: "browser · cache-control",
        on: { u: "", br: "ok:max-age", cdn: "public only|public" },
        w: ["u>br", "br>cdn"],
        x: [[248, 150, "app.abc123.js · max-age=31536000, immutable|hashed: 1 year", "s"]],
        n: "new content, new filename: no stale JS|new content, new name",
      },
      {
        c: "When it expires, the browser revalidates with If-None-Match and the ETag. If nothing changed, the server answers 304 Not Modified, with no body.",
        k: "conditional requests",
        on: { u: "", br: "lit:ETag abc123|ETag", cdn: "", gw: "", r: "ok:304" },
        w: ["u>br", "br>cdn", "cdn>gw", "gw>r"],
        go: ["br>cdn:lit", "cdn>gw:lit@0.2", "gw>r:lit@0.4"],
        n: "ok:saves bandwidth when unchanged|saves bandwidth",
      },
      {
        c: "A Tokyo user hits the nearest edge: 20 ms on a hit, about 200 ms the first time while it fetches from origin. Vary: Accept-Language splits the cache per language; Vary: Cookie destroys it.",
        k: "cdn · edge, origin, vary",
        on: { u: "Tokyo", br: "", cdn: "ok:20 ms hit|20 ms", org: "200 ms miss|200 ms" },
        w: ["u>br", "br>cdn"],
        go: ["cdn>org:warn", "org>cdn:ok@0.4"],
        n: "bad:Vary: Cookie = a cache per user|Vary: Cookie kills it",
      },
    ],
  },
  {
    id: "inner",
    label: "Gateway + Redis",
    s: [
      {
        c: "The gateway caches what every request needs: token validation with a short TTL, rate-limit counters shared across instances, and collapsed duplicate requests. Not user data.",
        k: "api gateway",
        on: { br: "", cdn: "", gw: "lit:auth, limits|auth", r: "", db: "" },
        w: chain,
        go: ["cdn>gw:lit*3"],
        n: "skip the auth service on every call|auth checked once",
      },
      {
        c: "Redis holds the business data from this week: cache-aside product details, sessions with sliding expiry, computed counts and ratings, feature flags.",
        k: "application cache",
        on: { br: "", cdn: "", gw: "", r: "ok:products|data", db: "" },
        w: chain,
        go: ["gw>r:ok*2"],
        n: "near real-time, invalidated by events|event-invalidated",
        lp: true,
      },
    ],
  },
  {
    id: "inval",
    label: "Invalidation",
    s: [
      {
        c: "A price drops from $99 to $79. The database's buffer pool is updated by the write itself, but Redis, the gateway and every CDN edge still hold $99, and browsers too.",
        k: "one change, five copies",
        on: { ...all("bad:$99", "bad:$99", "bad:$99", "bad:$99", "ok:$79") },
        w: chain,
        n: "bad:any stale layer serves the old price|any stale layer wins",
      },
      {
        c: "Invalidate closest to the database first: delete the Redis key, then the gateway cache, then purge the CDN asynchronously. Purge the CDN first and it refills from stale Redis.",
        k: "order: app → gateway → CDN",
        on: { ...all("warn:$99 · stale|$99", "ok:purged", "ok:cleared", "ok:deleted", "ok:$79") },
        w: chain,
        go: ["db>r:ok", "r>gw:ok@0.3", "gw>cdn:ok@0.6"],
        n: "ok:closest to the database first|closest to DB first",
        tw: 2400,
      },
      {
        c: "Browsers can't be told: they keep $99 until max-age expires. So staleness is bounded, not zero, and checkout always reads the real price.",
        k: "browsers wait out max-age",
        on: { ...all("warn:max-age", "ok:$79", "ok:$79", "ok:$79", "ok:$79") },
        w: chain,
        n: "bounded staleness, not perfect consistency|bounded staleness",
      },
    ],
  },
  {
    id: "who",
    label: "Who's asking",
    s: [
      {
        c: "Anonymous users all see the same content, so cache aggressively at every layer: marketing pages in the browser, product pages at the CDN, API responses at the gateway.",
        k: "anonymous requests",
        on: { u: "ok:anonymous", ...all("ok:cache", "ok:cache all|all", "ok:responses|resp.", "ok:shared data|shared", "") },
        w: ["u>br", ...chain],
        go: ["u>br:ok"],
        n: "ok:one copy serves everyone|one copy for all",
      },
      {
        c: "Logged-in users see their own content: mark responses private so the CDN never caches them, cache user data in Redis, and send no-store for PII and payment data.",
        k: "authenticated requests",
        on: { u: "warn:logged in|logged in", ...all("assets only|assets", "bad:private", "auth, limits|auth", "ok:user data|user", "") },
        w: ["u>br", ...chain],
        go: ["cdn>gw:warn"],
        n: "warn:never cache user data at the CDN|no user data at the CDN",
      },
      {
        c: "Clients differ too: a web browser can use its full cache with stale-while-revalidate, a native app keeps its own local cache and syncs with ETags, and mobile web wants small payloads and short TTLs.",
        k: "mobile vs web",
        on: { t0: "ok:web browser · full caching, stale-while-revalidate|web · swr", t1: "sky:native app · own local cache, ETag sync|app · local + ETag", t2: "warn:mobile web · small payloads, short TTLs|mobile web · small" },
        n: "server sends hints, client decides|hints from the server",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["layers", "edge"], "layers", "Layers + edge"],
    [["inner", "inval"], "inval", "Invalidation"],
    [["who"], "who", "Who's asking"],
  ]),
  N,
);
