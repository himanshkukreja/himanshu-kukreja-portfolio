/**
 * Week 4, day 4, the whole lesson (feed caching): the feed problem's three numbers (5 s pull, 5 TB
 * of cached feeds, 50 million writes per celebrity post), fan-out on write vs on read, the hybrid
 * (push for regular users, pull for celebrities, merged at read), and running it at scale.
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
  au: [16, 124, 104, 52, "Author"],
  fo: [150, 124, 110, 52, "Fan-out"],
  f1: [300, 40, 130, 46, "feed:A"],
  f2: [300, 104, 130, 46, "feed:B"],
  f3: [300, 168, 130, 46, "feed:C"],
  rd: [470, 124, 114, 52, "Reader"],
  ps: [150, 232, 110, 46, "Posts"],
  cel: [16, 232, 104, 46, "Celebrity|Celeb"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const feeds = { f1: "", f2: "", f3: "" };
const push = ["au>fo", "fo>f1", "fo>f2", "fo>f3"];

const V: Vr[] = [
  {
    id: "problem",
    label: "The problem",
    s: [
      {
        c: "100 million users, each with a personal feed. Build it on request: fetch posts from the 500 accounts you follow at 10 ms each, and the feed takes 5 seconds. Users leave.",
        k: "compute it on open?",
        on: { rd: "bad:5 seconds|5 s", ps: "500 × 10 ms|500 ×" },
        go: ["rd)ps:bad*5"],
        n: "bad:target is under 200 ms|target < 200 ms",
      },
      {
        c: "Cache every feed instead? 100 million feeds of 50 posts at 1 KB each is 5 terabytes of RAM, which is why real systems cache post IDs, not whole posts.",
        k: "cache every feed?",
        on: { f1: "50 KB", f2: "50 KB", f3: "50 KB", rd: "ok:instant" },
        w: ["rd>f2:ok"],
        x: [[300, 244, "warn:100M × 50 KB = 5 TB|100M × 50 KB = 5 TB", "t"]],
        n: "store IDs, not posts|store IDs, not posts",
      },
      {
        c: "And when a celebrity with 50 million followers posts, that's 50 million cached feeds to update, for one post. This is the feed caching problem.",
        k: "and when someone posts",
        on: { cel: "bad:50M fans|50M", fo: "bad:50M writes|50M", ...feeds },
        w: ["fo>f1:bad", "fo>f2:bad", "fo>f3:bad"],
        go: ["cel>fo:bad", "fo>f1:bad*2", "fo>f2:bad*2", "fo>f3:bad*2"],
        n: "bad:read latency vs write fan-out|reads vs fan-out",
      },
    ],
  },
  {
    id: "two",
    label: "Push vs pull",
    s: [
      {
        c: "Fan-out on write, push: when A posts, the post goes into every follower's feed cache, so when B opens the app, the feed is one cache read.",
        k: "approach 1 · fan-out on write",
        on: { au: "lit:posts", fo: "lit:N writes", f1: "ok:+ post", f2: "ok:+ post", f3: "ok:+ post", rd: "ok:1 read" },
        w: push,
        go: ["au>fo:lit", "fo>f1:lit", "fo>f2:lit", "fo>f3:lit", "rd>f2:ok"],
        n: "fast, predictable reads · write amplification|fast reads, heavy writes",
        tw: 2000,
      },
      {
        c: "Fan-out on read, pull: a post is saved once; the feed is computed on open by querying each followed account, then merged and sorted. Cheap writes, slow reads.",
        k: "approach 2 · fan-out on read",
        on: { au: "posts", ps: "ok:saved once|once", rd: "warn:N queries" },
        go: ["au>ps:ok", "rd)ps:warn*4"],
        n: "fresh and small · read amplification|cheap writes, slow reads",
      },
    ],
  },
  {
    id: "hybrid",
    label: "Hybrid",
    s: [
      {
        c: "Kim Kardashian posts to 300 million followers. At 100,000 cache writes a second, fan-out takes 50 minutes, and she posts again before it's done.",
        k: "the celebrity problem",
        on: { cel: "bad:300M", fo: "bad:50 min", ...feeds },
        w: ["fo>f1", "fo>f2", "fo>f3"],
        go: ["cel>fo:bad*3"],
        m: [150, 200, 110, "backlog|backlog", 1, 1, "bad"],
        n: "bad:pure push doesn't scale|pure push fails",
      },
      {
        c: "So split by follower count: a regular user with 200 followers is pushed, 200 writes and done. Above a threshold of 10K to 100K, the post is just stored, to be pulled.",
        k: "push regular, pull celebrities",
        on: { au: "ok:200 fans|200", fo: "ok:200 writes", ...feeds, cel: "sky:stored once|stored", ps: "sky:celeb posts|celebs" },
        w: push,
        go: ["au>fo:ok", "fo>f1:ok", "fo>f2:ok", "fo>f3:ok", "cel>ps:sky"],
        n: "threshold: 10K–100K followers|10K–100K threshold",
      },
      {
        c: "Reading a feed that follows 500 accounts: one cache read covers the 490 regular ones, plus 10 small parallel pulls for the celebrities, merged together. Still fast.",
        k: "merge at read time",
        on: { ...feeds, f2: "ok:490 accounts|490", ps: "sky:10 celebs", rd: "ok:merge" },
        w: ["fo>f2"],
        go: ["rd>f2:ok", "rd)ps:sky*2"],
        n: "ok:1 cache read + 10 pulls|1 read + 10 pulls",
        lp: true,
      },
    ],
  },
  {
    id: "scale",
    label: "At scale",
    s: [
      {
        c: "Most feeds are ranked, not chronological: the score combines recency, engagement and affinity, with negative signals pushing posts down.",
        k: "ranked feeds",
        on: { t0: "lit:recency · decays over time|recency", t1: "lit:engagement · likes, comments, shares|engagement", t2: "lit:affinity · how often you interact|affinity", t3: "content type · video, images|content type", t4: "bad:negative · hidden, low engagement|negative" },
        n: "score = f(recency, engagement, affinity)|score = f(...)",
      },
      {
        c: "Keep it bounded: shard feeds by crc32 of user_id across Redis instances, trim each feed to 500 to 1,000 posts, skip inactive users in fan-out and warm active ones.",
        k: "shard, trim, skip, warm",
        on: { t0: "sky:shard · crc32(user_id) % N|shard by user", t1: "sky:trim · 500–1,000 posts|trim 500–1K", t2: "sky:skip inactive users|skip inactive", t3: "sky:warm active users|warm active", t4: "sky:parallel fetches, async fan-out|parallel + async" },
        n: "bounded storage and fan-out|bounded storage",
      },
      {
        c: "In practice: Twitter is mostly push, merging very large accounts at read time; Instagram is mostly push; LinkedIn pulls, because second-degree content can't be pushed.",
        k: "industry",
        on: { t0: "ok:Twitter · mostly push + pull for huge accounts|Twitter · push", t1: "ok:Instagram · mostly push|Instagram · push", t2: "sky:LinkedIn · pull (2nd-degree content)|LinkedIn · pull", t3: "sky:TikTok · pull (algorithmic)|TikTok · pull" },
        n: "ok:push the many, pull the few|push many, pull few",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["problem", "two"], "problem", "Push vs pull"],
    [["hybrid"], "hybrid", "Hybrid"],
    [["scale"], "scale", "At scale"],
  ]),
  N,
);
