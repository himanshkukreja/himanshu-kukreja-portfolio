/**
 * The whole side quest, TikTok's For You feed: the scale (1B+ people a month; on stated assumptions
 * ~45B impressions a day, ~1M/s at peak, ~175,000 feed requests/s and ~4M events/s), the model (ByteDance's
 * Monolith paper, which doesn't name TikTok: several-terabyte models with ~1,000 embedding tables, sparse
 * sync every minute, dense daily), the architecture (a retrieve, rank, re-rank funnel; session features
 * for the seconds; logged features joined with labels into an online trainer; touched rows synced to
 * serving parameter servers), the deep dives (labels from swipes, the streaming joiner and negative
 * sampling, collisionless tables, parameter sync, cold start for new users and new videos) and edge
 * cases (Aditi's first evening, a bad update spreading in minutes, a new song at 9 pm in Jakarta).
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[Object.keys(F)[0]]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}


const N: Record<string, Nd> = {
  seeds: { x: 16, y: 40, w: 88, h: 44, l: "Popular", n: "Seeds" },
  aditi: { x: 16, y: 96, w: 88, h: 48, l: "Aditi" },
  cdn: { x: 16, y: 156, w: 88, h: 40, l: "CDN" },
  sess: { x: 128, y: 40, w: 92, h: 44, l: "Session" },
  feed: { x: 128, y: 96, w: 92, h: 48, l: "Feed" },
  kafka: { x: 128, y: 156, w: 92, h: 40, l: "Kafka" },
  ret: { x: 248, y: 40, w: 120, h: 44, l: "Candidates", n: "Sources" },
  sps: { x: 248, y: 96, w: 120, h: 48, l: "Serving PS", n: "Serving" },
  join: { x: 248, y: 156, w: 120, h: 40, l: "Joiner" },
  uploads: { x: 400, y: 40, w: 184, h: 44, l: "Uploads" },
  train: { x: 400, y: 96, w: 184, h: 48, l: "Online trainer", n: "Trainer" },
  hdfs: { x: 400, y: 156, w: 184, h: 40, l: "HDFS · batch", n: "Batch" },
};
const E: [string, string][] = [
  ["seeds", "feed"],
  ["aditi", "feed"],
  ["aditi", "cdn"],
  ["aditi", "kafka"],
  ["feed", "sess"],
  ["feed", "ret"],
  ["feed", "sps"],
  ["feed", "kafka"],
  ["uploads", "ret"],
  ["kafka", "join"],
  ["join", "train"],
  ["join", "hdfs"],
  ["train", "sps"],
];
const ALL = { seeds: 1, aditi: 1, cdn: 1, sess: 1, feed: 1, kafka: 1, ret: 1, sps: 1, join: 1, uploads: 1, train: 1, hdfs: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "TikTok · the scale", on: { aditi: "lit", feed: 1, cdn: 1 }, figs: [["1B+", ["people a month", "monthly users"], "lit"], ["~45B", ["impressions a day", "impressions"]], ["~1M/s", ["impressions at peak", "at peak"]]], note: ["assumed: 500 million daily users, 30 minutes each, ~20 s a video", "assumed: 30 min a day"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["a feed from all videos", "no follow graph"], ["every swipe is a label", "swipes as labels"], ["learn within minutes", "learn in minutes"], ["new users, new videos", "cold start"], ["varied and safe", "varied, safe"], ["the next video starts at once", "instant start"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["every impression is a label", "labels for free"], on: { aditi: "lit", feed: 1, kafka: "lit" }, fl: [["aditi", "feed"], ["aditi", "kafka"], ["feed", "kafka"]], figs: [["~175K/s", ["feed requests, peak", "requests/s"]], ["~4M/s", ["events, peak", "events/s"], "lit"], ["0.4 s", ["a skip is a label", "quick skip"]]], note: ["watch time, finishes, loops and skips: a skip says as much as a like", "a skip says as much as a like"] },
    { k: ["a model of terabytes", "the model"], kt: "warn", on: { feed: 1, sps: "warn", train: "lit" }, fl: [["train", "sps"], ["feed", "sps"]], figs: [["~1,000", ["embedding tables", "tables"]], ["~52M/s", ["heavy scores, peak", "scores/s"], "warn"], ["~3.2 GB", ["synced a minute", "sync/min"], "lit"]], note: ["Monolith's production models are several terabytes, mostly sparse rows", "several TB, mostly sparse"] },
  ],
  arch: [
    { k: ["1 · retrieve, rank, re-rank", "1 · the serving loop"], on: { aditi: 1, feed: "lit", ret: "lit", sps: "lit" }, sub: { ret: ["~2,000", "~2,000"] }, fl: [["aditi", "feed"], ["feed", "ret"], ["feed", "sps"]], note: ["sources in parallel, a light model to ~300, the heavy ranker, a re-rank", "~2,000 → ~300 → 6"] },
    { k: ["2 · seconds: the session", "2 · seconds"], on: { aditi: "lit", feed: "lit", sess: "lit" }, sub: { sess: ["recent", "recent"] }, fl: [["aditi", "feed"], ["feed", "sess"]], note: ["her last actions ride on the next request; desserts rank higher", "features, not weights"] },
    { k: ["3 · log what you served", "3 · the learning loop"], on: { aditi: 1, feed: 1, kafka: "lit", join: "lit", hdfs: 1 }, fl: [["aditi", "kafka"], ["feed", "kafka"], ["kafka", "join"], ["join", "hdfs"]], note: ["the joiner pairs each impression's logged features with its labels", "features + labels"] },
    { k: ["4 · minutes: the embeddings", "4 · minutes"], on: { join: 1, train: "lit", sps: "lit", feed: 1 }, sub: { sps: ["minutes old", "minutes"] }, fl: [["join", "train"], ["train", "sps"]], note: ["touched rows go to serving about once a minute; dense weights daily", "sparse each minute, dense daily"] },
  ],
  deep: [
    { k: ["1 · turning a swipe into a label", "1 · signals"], on: { aditi: "lit", feed: 1, kafka: "lit" }, fl: [["aditi", "kafka"], ["feed", "kafka"]], chips: [["watch time vs typical length", "watch vs length"], ["a quick skip is a negative", "quick skip"], ["\"Not interested\": strongest", "not interested"], ["an impression id dedups", "impression id"]], ctn: ["lit", "warn", "bad", "ok"] },
    { k: ["2 · the real-time training loop", "2 · training loop"], on: { kafka: 1, join: "lit", train: "lit", hdfs: 1 }, fl: [["kafka", "join"], ["join", "train"], ["join", "hdfs"]], figs: [["15 min", ["features in memory", "in memory"]], ["~900 GB", ["joiner cache, peak", "joiner RAM"], "lit"], ["1 in 10", ["negatives kept, e.g.", "negatives"], "warn"]], note: ["late labels find their features on disk; sampled odds corrected at serving", "odds corrected at serving"] },
    { k: ["3 · collisionless embedding tables", "3 · embeddings"], on: { train: "lit", sps: "lit" }, fl: [["train", "sps"]], chips: [["cuckoo hashing: no shared rows", "no collisions"], ["admitted after enough sightings", "admission"], ["idle IDs expire, per table", "expiry"], ["hot rows: combine gradients", "hot rows"]], ctn: ["lit", "ok", "sky", "warn"] },
    { k: ["4 · from trainer to server", "4 · parameter sync"], on: { train: "lit", sps: "lit", feed: 1 }, fl: [["train", "sps"], ["feed", "sps"]], figs: [["~25M", ["rows touched a minute", "rows/min"]], ["1 min", ["sparse sync", "sparse"], "lit"], ["1 day", ["dense sync, snapshots", "dense"]]], note: ["only touched rows, each overwritten in place while serving continues", "touched rows only"] },
    { k: ["5 · new users and new videos", "5 · cold start"], on: { seeds: "lit", aditi: 1, feed: "lit", uploads: "lit", ret: "lit" }, fl: [["seeds", "feed"], ["aditi", "feed"], ["uploads", "ret"], ["feed", "ret"]], chips: [["first page: popular, by topic", "popular first"], ["her ID earns a row in minutes", "ID row in minutes"], ["a new video: a test pool", "test pool"], ["expand on evidence", "expand on evidence"]], ctn: ["sky", "lit", "ok", "warn"] },
  ],
  scale: [
    { k: ["Aditi's first evening", "the evening"], on: { seeds: 1, aditi: "lit", feed: 1, uploads: "lit", ret: 1, train: 1 }, fl: [["seeds", "feed"], ["aditi", "feed"], ["uploads", "ret"]], figs: [["19:02", ["popular lists", "install"]], ["19:05", ["her ID earns a row", "ID row"], "lit"], ["21:00", ["her kunafa uploaded", "upload"]]], note: ["a test pool, then wider; by morning, people who have never heard of her", "by morning: the open feed"] },
    { k: ["a bad update spreads in minutes", "a bad update"], kt: "bad", on: { train: "bad", sps: "warn", feed: 1 }, fl: [["train", "sps", "bad"]], chips: [["NaN or exploding rows", "NaN rows"], ["rejected at serving", "reject at serving"], ["the sending shard paused", "pause the shard"], ["roll back from the snapshot", "roll back"]], ctn: ["bad", "ok", "warn", "sky"] },
    { k: ["a new song at 9 pm in Jakarta", "a new song"], kt: "warn", on: { ...ALL, kafka: "warn", join: "bad", sps: "lit" }, fl: [["feed", "kafka"], ["kafka", "join", "warn"], ["join", "train"], ["train", "sps"]], figs: [["~2M", ["videos by midnight", "videos"]], ["~15%", ["impressions, one sound", "one sound"], "warn"], ["25 min", ["joiner lag", "lag"], "bad"]], note: ["partition the feature log by impression id; the sound rule holds", "partition by impression id"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, kafka: "ok", join: "ok", sps: "ok" }, fl: [["feed", "kafka", "ok"], ["kafka", "join"], ["join", "train"], ["train", "sps", "ok"]], cols: 3, chips: [["log what you served", "log served"], ["learn in minutes", "minutes"], ["three clocks", "three clocks"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "TikTok says more than a billion people come every month; on stated assumptions, 500 million daily users watching 30 minutes at ~20 seconds a video is ~45 billion impressions a day, ~1 million a second at peak.", tween: 1400 },
      { caption: "Serve an endless personalised stream from all eligible videos, not a follow graph, turn every play, replay and skip into a label, learn from it within minutes, handle new users and new videos, keep the feed varied and safe, and start each video at once.", tween: 1400 },
      { caption: "Every impression ends in a number, how long the thumb stayed still, so labels come for free: ~175,000 feed requests a second at peak bring ~4 million events a second, and a skip at 0.4 s is as informative as a like.", tween: 1400, loop: true },
      { caption: "ByteDance's Monolith paper, which doesn't name TikTok, describes production models of several terabytes, mostly sparse embeddings; this design scores ~52 million candidates a second at peak and syncs ~3.2 GB a minute to each serving copy.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The serving loop: candidate sources in parallel return ~2,000 videos, a light model cuts them to ~300, the heavy ranker scores those, and a re-rank keeps the same creator or sound from appearing twice in a row.", tween: 1200, loop: true },
      { caption: "Seconds: the app attaches Aditi's last actions to the next request and a session feature store updates from the event stream, so the same model, given \"desserts finished, dance skipped\", ranks desserts higher.", tween: 1200, loop: true },
      { caption: "The learning loop: swipes, and the features each video was ranked with, go to Kafka, and a joiner pairs them into training examples for the online trainer, with a copy dumped for batch retraining.", tween: 1200, loop: true },
      { caption: "Minutes: the online trainer updates the embeddings the examples touch and pushes only those rows to the serving parameter servers about once a minute; the dense weights move daily.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Not one label but several: watch time judged against what's typical for the video's length, finishes, loops, quick skips as negatives, taps, and \"Not interested\" as the strongest; an impression id makes resent events harmless.", tween: 1400, loop: true },
      { caption: "The joiner keeps 15 minutes of features in memory, ~900 GB at peak, and a follow 45 minutes later finds its features on disk; negatives are sampled, and the predicted odds are corrected at serving.", tween: 1400, loop: true },
      { caption: "Hashing IDs into a fixed table blends a viral video with spam, so Monolith's tables use cuckoo hashing and never collide; IDs are admitted after enough sightings, expire when idle, and a hot row's gradients are combined per batch.", tween: 1400, loop: true },
      { caption: "Only rows touched since the last sync are pushed, ~25 million a minute at peak, each overwritten in place while serving continues; dense weights sync daily and parameter servers are snapshotted daily, which Monolith found tolerable.", tween: 1400, loop: true },
      { caption: "A new user starts on cached popular lists for her topics, region and language, and her ID earns a row within minutes; a new video gets a test pool of a few hundred viewers and expands only when its labels beat its category.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Aditi installs at 19:02 and gets popular lists, her ID reaches serving by 19:05, and her kunafa, uploaded at 21:00, is scanned, tested on a few hundred viewers, widened, and by morning reaches people who have never heard of her.", tween: 1400, loop: true },
      { caption: "A training bug produces NaN embeddings, and with minute-level sync every region would serve them a minute later: serving validates each sync batch, rejects bad rows, pauses the shard and rolls back from the daily snapshot.", tween: 1400, loop: true },
      { caption: "A new song is in ~2 million videos within three hours and ~15% of a region's impressions: its row is a hot key, a feature log partitioned by video id lets the joiner fall 25 minutes behind, and the same-sound rule still holds.", tween: 1400, loop: true },
      { caption: "The lesson: log exactly the features each impression was ranked with, turn every impression into a training example as soon as its labels settle, and let three clocks, seconds, minutes and a day, cover for each other.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
