/**
 * The whole side quest, YouTube's upload side: the mission and scale (20M+ uploads a day, 500+
 * hours a minute, 200B+ Shorts views a day), the estimate (~231 uploads/s, 30,000 s of video every
 * second, ~2.6 PB of originals a day, ~450K software cores vs ~18K with transcoding chips, 6M view
 * starts/s at peak), the architecture (resumable upload → originals → a task graph of chunks → low
 * quality first → views and recommendations as event pipelines), the deep dives (resumable sessions,
 * closed-GOP chunks and popularity tiers, counting views, two-stage recommendations) and scale and
 * edge cases (an encoder bug, a three-hour 4K upload at peak, what to degrade).
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
  creator: { x: 16, y: 40, w: 88, h: 44, l: "Asha" },
  viewer: { x: 16, y: 152, w: 88, h: 44, l: "Viewer" },
  up: { x: 128, y: 40, w: 92, h: 44, l: "Upload", n: "Up" },
  api: { x: 128, y: 152, w: 92, h: 44, l: "Watch API", n: "API" },
  orig: { x: 248, y: 40, w: 120, h: 40, l: "Originals", n: "Orig" },
  orch: { x: 248, y: 96, w: 120, h: 52, l: "Orchestrator", n: "Orch" },
  cnt: { x: 248, y: 156, w: 120, h: 40, l: "View counter", n: "Count" },
  tr: { x: 400, y: 40, w: 184, h: 44, l: "Transcode pool", n: "Transcode" },
  rend: { x: 400, y: 96, w: 184, h: 44, l: "Renditions · CDN", n: "Renditions" },
  rec: { x: 400, y: 152, w: 184, h: 44, l: "Recommendations", n: "Recs" },
};
const E: [string, string][] = [
  ["creator", "up"],
  ["up", "orig"],
  ["orig", "orch"],
  ["orch", "tr"],
  ["orch", "rend"],
  ["viewer", "api"],
  ["api", "cnt"],
  ["cnt", "rec"],
];
const ALL = { creator: 1, viewer: 1, up: 1, api: 1, orig: 1, orch: 1, cnt: 1, tr: 1, rend: 1, rec: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "YouTube · the scale", on: { creator: "lit", up: 1, orig: 1 }, figs: [["20M+", "uploads a day"], ["500+ h", ["video every minute", "a minute"], "lit"], ["200B+", ["Shorts views a day", "Shorts views"]]], note: ["20 billion+ videos uploaded since 2005", "20B+ videos since 2005"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["resumable, up to 256 GB", "resumable"], ["low quality in minutes", "fast to watch"], ["honest view counts", "honest counts"], ["recs in 100 ms", "recs 100 ms"], ["survive going viral", "viral-proof"], ["keep the original forever", "keep originals"]],
      ctn: ["lit", "lit", "bad"],
    },
    { k: "what arrives", on: { creator: 1, up: "lit", orig: 1 }, fl: [["creator", "up"], ["up", "orig"]], figs: [["~231/s", ["uploads, average", "uploads/s"]], ["30,000 s", ["of video every second", "video/s"], "lit"], ["~2.6 PB", ["originals a day", "a day"]]], note: ["~600,000 upload sessions open at once", "~600K sessions open"] },
    { k: "compute and views", kt: "warn", on: { tr: "warn", cnt: 1 }, figs: [["~450K", ["cores, software", "cores"], "warn"], ["~18K", ["with chips (25×)", "with chips"], "ok"], ["6M/s", ["view starts, peak", "views/s"]]], note: ["one codec, 15 CPU-seconds per second of video", "15 CPU-s per video-s"] },
  ],
  arch: [
    { k: "1 · resumable upload", on: { creator: "lit", up: "lit", orig: 1 }, sub: { up: ["308", "308"] }, fl: [["creator", "up"], ["up", "orig"]], note: ["the stored offset moves only after a part is durable", "offset after durable write"] },
    { k: "2 · a task graph", on: { orig: 1, orch: "lit", tr: "lit" }, sub: { orch: ["180 chunks", "180"], tr: ["in parallel", "parallel"] }, fl: [["orig", "orch"], ["orch", "tr"]], note: ["split at closed GOPs; the low ladder goes first", "low ladder first"] },
    { k: "3 · live in low quality", kt: "ok", on: { orch: 1, rend: "ok", api: 1, viewer: "lit" }, sub: { rend: ["144p–480p", "480p"] }, fl: [["orch", "rend", "ok"], ["viewer", "api"]], note: ["the manifest lists only renditions that are ready", "only ready renditions"], nt: "ok" },
    { k: "4 · views and recs", on: { viewer: 1, api: 1, cnt: "lit", rec: "lit" }, sub: { cnt: ["dedupe", "dedupe"] }, fl: [["viewer", "api", "sky"], ["api", "cnt", "sky"], ["cnt", "rec", "sky"]], note: ["view events: dedupe, filter, then count and learn", "events, not row updates"] },
  ],
  deep: [
    { k: "1 · resumable uploads", on: { creator: 1, up: "lit", orig: 1 }, fl: [["creator", "up"], ["up", "orig"]], chips: [["a session URI", "session URI"], ["256 KB chunks", "256 KB chunks"], ["308 + Range: stored bytes", "308 + Range"], ["resends are harmless", "idempotent"]], ctn: [undefined, undefined, "lit", "ok"] },
    { k: "2 · chunks and tiers", on: { orch: "lit", tr: 1, rend: 1 }, fl: [["orch", "tr"], ["orch", "rend"]], chips: [["closed-GOP chunks", "GOP chunks"], ["decode once, encode many", "decode once"], ["tier 1 first", "tier 1 first"], ["renditions earned by views", "earn renditions"]], ctn: [undefined, undefined, "lit", "ok"] },
    { k: "3 · counting views", kt: "warn", on: { viewer: 1, api: 1, cnt: "warn" }, sub: { cnt: ["64 shards", "shards"] }, fl: [["viewer", "api", "warn"], ["api", "cnt", "warn"]], figs: [["50K/s", ["one viral video", "one video"], "warn"], ["64", ["counter shards", "shards"]], ["view_id", ["the dedupe key", "dedupe"], "ok"]] },
    { k: "4 · two-stage recs", on: { cnt: 1, rec: "lit" }, sub: { rec: ["500 → 20", "500→20"] }, chips: [["20B+ → hundreds", "candidates"], ["hundreds → 20", "ranking"], ["expected watch time", "watch time"], ["fresh: example age", "freshness"]], ctn: [undefined, "lit", "ok", undefined] },
  ],
  scale: [
    { k: "an encoder bug", kt: "warn", on: { orig: "lit", orch: 1, rend: "warn" }, fl: [["orig", "orch"], ["orch", "rend"]], chips: [["encoder version in the key", "version in key"], ["find exactly what's affected", "find exactly"], ["re-encode from originals", "re-encode"], ["most-watched first", "popular first"]], ctn: [undefined, undefined, "ok", undefined] },
    { k: "a three-hour 4K upload", on: { creator: "warn", up: 1, orch: "lit", tr: "lit" }, fl: [["creator", "up", "warn"], ["orch", "tr"]], figs: [["~40 min", ["upload at 200 Mbps", "upload"], "warn"], ["27 s", ["tier 1, 2,000 workers", "tier 1"], "ok"], ["~14 min", ["tier 3, if spare", "tier 3"]]], note: ["2,700 chunks of 4 s; the upload is the slow step", "2,700 chunks"] },
    { k: "degrade in order", kt: "warn", on: { ...ALL, tr: "warn" }, chips: [["1 · tier 3 waits", "tier 3 waits"], ["2 · extra thumbnails", "thumbnails"], ["never: upload bytes", "keep bytes"], ["never: tier 1, dedupe", "keep tier 1"]], ctn: ["warn", "warn", "ok", "ok"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, orig: "ok" }, fl: [["creator", "up"], ["up", "orig", "ok"], ["orch", "rend"], ["api", "cnt", "sky"]], cols: 3, chips: [["keep the original", "keep original"], ["rebuild the rest", "rebuild rest"], ["compute follows views", "follow views"]], ctn: ["ok", "lit", "sky"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "YouTube: 20 million+ uploads on an average day, 500+ hours of video every minute, and 200 billion+ Shorts views a day.", tween: 1400 },
      { caption: "Uploads resume after a drop, a new video plays in low quality within minutes, views are counted honestly and recommendations come back in 100 ms.", tween: 1400 },
      { caption: "That is ~231 uploads a second and 30,000 seconds of video arriving every second: ~2.6 PB of originals a day.", tween: 1400, loop: true },
      { caption: "In software one codec needs ~450,000 cores; at the reported 20–33× chip efficiency, ~18,000. Views peak around 6 million starts a second.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Asha's upload drops in a cutting. Her app asks for the session's status; the 308 reply says how many bytes are stored, and she resumes from there.", tween: 1200, loop: true },
      { caption: "Upload complete: the orchestrator splits the video at closed GOPs into 180 chunks and transcodes them in parallel, low ladder first.", tween: 1200, loop: true },
      { caption: "The video goes live in 144p to 480p: the watch API lists only renditions that are ready, and HD joins as it finishes.", tween: 1200, loop: true },
      { caption: "Every play sends a view event. A pipeline dedupes and filters them before counting, and the same stream trains recommendations.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Resumable uploads: a session URI, chunks in multiples of 256 KB, and a 308 reply whose Range header says what is stored. Resending is harmless.", tween: 1400, loop: true },
      { caption: "Processing is a task graph of closed-GOP chunks, each decoded once and encoded to a whole tier. Long-tail videos earn newer codecs only when watched.", tween: 1400, loop: true },
      { caption: "A viral video gets 50,000 views a second: partition by view_id, dedupe, add one-second totals to 64 counter shards, publish verified counts.", tween: 1400, loop: true },
      { caption: "Recommendations: cheap sources narrow 20 billion+ videos to hundreds; a ranker scores them by expected watch time, not clicks.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "An encoder bug: its version is in every output key, so the affected renditions are found exactly and re-encoded from the originals.", tween: 1400, loop: true },
      { caption: "A three-hour 4K concert: ~40 minutes to upload at 200 Mbps, then 2,700 chunks: tier 1 in ~27 s on 2,000 workers, tier 3 in ~14 min if spare.", tween: 1400, loop: true },
      { caption: "At 85% load, tier 3 waits for the trough. Acknowledged upload bytes, tier 1 for every upload and view dedupe are never shed.", tween: 1400 },
      { caption: "The lesson: keep the original forever, treat renditions, counts and recommendations as rebuildable, and spend compute where the watch time is.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
