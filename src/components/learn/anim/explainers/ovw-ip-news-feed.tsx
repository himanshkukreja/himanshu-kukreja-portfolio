/**
 * The whole problem, interview problem bank 07 (design a news feed): requirements and the estimate
 * (100M DAU, ~11,600 feed loads a second, 2B pushed inserts a day, 800 GB of feed cache, a 50M-follower
 * post taking 8+ minutes to push); the write and read paths (post service, Kafka, fan-out, feed and post
 * caches); the deep dives (push vs pull vs hybrid, cursors, hydration, ranking); and failure modes.
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
  u: { x: 16, y: 150, w: 80, h: 56, label: "Users" },
  ps: { x: 120, y: 52, w: 112, h: 56, label: "Post svc", nl: "Post" },
  fs: { x: 120, y: 248, w: 112, h: 56, label: "Feed svc", nl: "Feed" },
  kf: { x: 256, y: 52, w: 92, h: 56, label: "Kafka" },
  fo: { x: 372, y: 52, w: 106, h: 56, label: "Fan-out" },
  gr: { x: 500, y: 52, w: 84, h: 56, label: "Graph" },
  fc: { x: 372, y: 150, w: 106, h: 56, label: "Feed cache", nl: "Feeds" },
  pc: { x: 372, y: 248, w: 106, h: 56, label: "Post cache", nl: "Cache" },
};
const EDGES: [string, string, boolean?][] = [
  ["u", "ps"],
  ["u", "fs"],
  ["ps", "kf"],
  ["kf", "fo"],
  ["fo", "gr"],
  ["fo", "fc"],
  ["fs", "fc"],
  ["fs", "pc"],
];
const WR = ["u", "ps", "kf", "fo", "gr", "fc"];
const ALLN = [...WR, "fs", "pc"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "Users follow people and see their posts in a home feed with infinite scroll. Some authors have a handful of followers, some have 50 million.",
        f: {
          kick: "the brief",
          rows: [
            { k: "publish", v: "text + image references", nv: "text + images" },
            { k: "follow", v: "follow and unfollow, no cap", nv: "no follower cap" },
            { k: "feed", v: "newest first, then ranked, paginated", nv: "newest first" },
            { k: "never show", v: "deleted posts or blocked users", nv: "deleted, blocked", tone: "bad" },
          ],
          l: ["the classic fan-out question", "a few seconds' delay for followers is fine"],
          nl: ["the fan-out question", "seconds of delay: fine"],
        },
      },
      {
        c: "Feeds must load in under 200 ms, reads vastly outnumber posts, and a slightly stale feed is better than an error page.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "fast reads", v: "feed load < 200 ms at p99", nv: "< 200 ms p99", tone: "lit" },
            { k: "read heavy", v: "far more loads than posts", nv: "loads ≫ posts" },
            { k: "eventual", v: "new posts reach feeds in seconds", nv: "seconds later" },
            { k: "available", v: "stale beats an error page", nv: "stale > error", tone: "ok" },
          ],
          l: ["precompute where you can", "the author sees their own post at once"],
          nl: ["precompute what you can", "author sees it at once"],
        },
      },
      {
        c: "100M daily users loading 10 feeds a day is ~11,600 loads a second. Pushing 10M posts to 200 followers each is 2 billion inserts a day.",
        f: {
          kick: "estimate",
          mx: 35000,
          rows: [
            { k: "feed loads", v: "~11,600/s · peak ~35,000/s", nv: "~11,600/s", m: 35000, tone: "lit" },
            { k: "posts", v: "10M a day ≈ 116/s", nv: "≈ 116/s", m: 116 },
            { k: "fan-out", v: "2B inserts a day ≈ 23,000/s", nv: "≈ 23,000/s", m: 23000 },
            { k: "feed cache", v: "500 IDs × 16 B × 100M ≈ 800 GB", nv: "≈ 800 GB" },
            { k: "one celebrity", v: "50M inserts: over 8 minutes", nv: "50M: 8+ min", tone: "bad" },
          ],
          l: ["averages say push is affordable", "the outlier says it can't be the only strategy"],
          nl: ["averages favour push", "the outlier says no"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "The post service stores the post, answers 201 at once, and publishes a post-created event to Kafka. Fan-out happens asynchronously.",
        f: {
          kick: "publish",
          on: ["u", "ps", "kf"],
          st: { ps: { tone: "lit", sub: "201", ns: "201" }, kf: { sub: "new posts", ns: "posts" } },
          go: [{ r: ["u", "ps", "kf"], a: 0.05, b: 0.95, tone: "lit" }],
          l: ["the author never waits for fan-out", "posts DB sharded by post ID"],
          nl: ["author never waits", "posts sharded by ID"],
        },
      },
      {
        c: "Fan-out workers read the author's followers from the social graph and push the post ID into each follower's feed list in Redis.",
        f: {
          kick: "fan-out on write",
          on: WR,
          st: { fo: { tone: "lit", sub: "push IDs", ns: "push" }, fc: { sub: "500 IDs/user", ns: "500 IDs" }, gr: { sub: "followers", ns: "who" } },
          go: [{ r: ["kf", "fo", "gr"], a: 0.05, b: 0.5, tone: "sky" }, ...[0.5, 0.6, 0.7].map((a) => ({ r: ["fo", "fc"], a, b: a + 0.28, tone: "lit" as Tone }))],
          l: ["a sorted set per user, trimmed to 500", "skipping celebrities and inactive users"],
          nl: ["sorted set, 500 per user", "skip celebs, inactive"],
        },
      },
      {
        c: "A feed load reads the user's precomputed ID list, then hydrates the IDs into posts with one multi-get from the post cache.",
        f: {
          kick: "read",
          on: ALLN,
          st: { fs: { tone: "lit", sub: "hydrate", ns: "hydrate" }, fc: { tone: "ok", sub: "IDs", ns: "IDs" }, pc: { tone: "ok", sub: "objects", ns: "objects" } },
          go: [{ r: ["u", "fs", "fc"], a: 0.05, b: 0.55, tone: "lit" }, { r: ["fs", "pc"], a: 0.6, b: 0.95, tone: "ok" }],
          l: ["IDs per user, each post object stored once", "an edit or delete touches one object"],
          nl: ["IDs here, posts there", "edits touch one object"],
        },
      },
      {
        c: "Celebrity posts are not pushed. The feed service pulls their newest posts at read time and merges them into the user's list.",
        f: {
          kick: "the hybrid merge",
          kt: "ok",
          on: ALLN,
          st: { fs: { tone: "lit", sub: "merge", ns: "merge" }, pc: { tone: "sky", sub: "celeb posts", ns: "celebs" } },
          go: [{ r: ["fs", "pc"], a: 0.1, b: 0.8, tone: "sky" }],
          l: ["most feeds: one cache read + a few celebrity timelines", "then filter deleted and blocked, and rank"],
          nl: ["one read + a few celebs", "filter, then rank"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "Push makes reads cheap but a 50M-follower post costly. Pull is always fresh but costs a lookup per followed account. The hybrid does both.",
        f: {
          kick: "1 · push, pull or both",
          rows: [
            { k: "push", v: "fast reads · 50M writes for one post", nv: "fast reads, costly writes", tone: "warn" },
            { k: "pull", v: "fresh · 2,000 lookups per load", nv: "fresh, costly reads", tone: "warn" },
            { k: "hybrid", v: "push ordinary authors, pull celebrities", nv: "push + pull", tone: "ok" },
          ],
          l: ["one tunable: the follower count where push stops", "tune it from fan-out lag and read cost"],
          nl: ["one tunable threshold", "tune from lag and cost"],
        },
      },
      {
        c: "Above, say, 10,000 followers an author is pulled, not pushed. Followers inactive for 30 days are skipped and rebuilt by pull on return.",
        f: {
          kick: "1 · where the line goes",
          rows: [
            { k: "threshold", v: "> 10,000 followers → pull", nv: "> 10,000 → pull", tone: "lit" },
            { k: "celebrity posts", v: "kept hot in the author's timeline", nv: "author timeline" },
            { k: "inactive 30 days", v: "not pushed; one pull on return", nv: "pull on return", tone: "ok" },
            { k: "author", v: "sees own post at once", nv: "read-your-writes" },
          ],
          l: ["a 50M push at 100,000/s would take over 8 minutes", "instead: one hot timeline, read by many"],
          nl: ["50M push: 8+ minutes", "one hot timeline instead"],
        },
      },
      {
        c: "Pages use a cursor, not an offset: new posts shift offsets and repeat items, while 'older than this timestamp and ID' stays correct.",
        f: {
          kick: "2 · the read path",
          rows: [
            { k: "1 · ids", v: "ZREVRANGEBYSCORE from the cursor", nv: "IDs from cursor" },
            { k: "2 · merge", v: "newer celebrity posts, in parallel", nv: "celebrity posts" },
            { k: "3 · hydrate", v: "one multi-get: posts, one: authors", nv: "2 multi-gets" },
            { k: "4 · filter", v: "deleted, blocked, unfollowed", nv: "filter", tone: "bad" },
            { k: "5 · return", v: "20 items + the next cursor", nv: "20 + cursor", tone: "ok" },
          ],
          l: ["an offset counts from a top that keeps moving", "under 200 ms at p99"],
          nl: ["offsets repeat items", "< 200 ms p99"],
        },
      },
      {
        c: "Ranking scores a few hundred candidates per load by recency, affinity and early engagement. Precomputed features keep it to tens of ms.",
        f: {
          kick: "2 · ranking",
          rows: [
            { k: "candidates", v: "newest 500 IDs + celebrity posts", nv: "~500 candidates" },
            { k: "signals", v: "recency, affinity, engagement", nv: "recency, affinity" },
            { k: "features", v: "precomputed and cached", nv: "precomputed", tone: "ok" },
            { k: "cost", v: "tens of ms, not hundreds", nv: "tens of ms", tone: "lit" },
          ],
          l: ["scoring is cheap; fresh features are the work", "start chronological, add ranking later"],
          nl: ["features are the work", "chronological first"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "During a big live event the fan-out backlog grows and feeds lag. Watch lag in seconds, add workers, and lower the celebrity threshold.",
        f: {
          kick: "fan-out falls behind",
          kt: "warn",
          on: ALLN,
          st: { kf: { tone: "warn", sub: "backlog", ns: "backlog" }, fo: { tone: "warn", sub: "lagging", ns: "lag" } },
          go: [0, 0.2, 0.4].map((a) => ({ r: ["u", "ps", "kf"], a, b: a + 0.5, tone: "warn" as Tone })),
          l: ["lower threshold = fewer authors pushed", "reads keep working from the cache"],
          nl: ["fewer authors pushed", "reads keep working"],
        },
      },
      {
        c: "If a feed cache shard is lost, those feeds are rebuilt by pull. Coalesce and rate-limit rebuilds so returning users don't stampede the DB.",
        f: {
          kick: "a feed shard is lost",
          kt: "bad",
          on: ALLN,
          st: { fc: { tone: "bad", sub: "shard lost", ns: "lost" }, fs: { tone: "warn", sub: "pull rebuild", ns: "rebuild" }, pc: { tone: "warn", sub: "rate-limited", ns: "limited" } },
          go: [{ r: ["fs", "pc"], a: 0.1, b: 0.9, tone: "warn" }],
          l: ["a thundering herd on the posts DB", "serve a short recent-posts fallback meanwhile"],
          nl: ["thundering herd risk", "serve a fallback"],
        },
      },
      {
        c: "A celebrity post is a hot key read by millions at once: replicate it. Filter unfollows, deletes and blocks at read time.",
        f: {
          kick: "hot posts and stale entries",
          rows: [
            { k: "hot post", v: "replicate it, or cache in-process", nv: "replicate it", tone: "warn" },
            { k: "delete", v: "post cache knows: filter at read", nv: "filter at read" },
            { k: "unfollow, block", v: "graph knows: filter, clean lazily", nv: "clean lazily" },
            { k: "author", v: "own post merged at read time", nv: "read-your-writes", tone: "ok" },
          ],
          l: ["pushed IDs can't be recalled cheaply", "so correctness lives on the read path"],
          nl: ["pushed IDs stay put", "correct at read time"],
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
