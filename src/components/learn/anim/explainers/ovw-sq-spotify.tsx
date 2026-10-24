/**
 * The whole side quest, Spotify: the mission and scale (777M users, 100M+ tracks, < 200 ms to
 * audio), the estimate (5B streams a day, ~175K/s at peak, ~5.5 Tbps; 2.5 PB of audio vs ~10 PB
 * of events a year), the play path (authorize once → signed URL → CDN edge, origin only on a miss,
 * events async to Pub/Sub), the deep dives (hybrid recommendations and cold start, three cache
 * layers, the event pipeline, breakers) and scale and edge cases (album drops, licensing and
 * tunnels, exactly-once royalty counts).
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
  app: { x: 16, y: 100, w: 88, h: 52, l: "App" },
  gw: { x: 136, y: 40, w: 120, h: 40, l: "Gateway" },
  stream: { x: 288, y: 40, w: 140, h: 40, l: "Stream svc", n: "Stream" },
  cdn: { x: 136, y: 100, w: 120, h: 40, l: "CDN edge", n: "CDN" },
  origin: { x: 288, y: 100, w: 140, h: 40, l: "GCS origin", n: "GCS" },
  ps: { x: 136, y: 160, w: 120, h: 40, l: "Pub/Sub" },
  flow: { x: 288, y: 160, w: 140, h: 40, l: "Dataflow" },
  reco: { x: 460, y: 160, w: 124, h: 40, l: "Recs" },
};
const E: [string, string][] = [
  ["app", "gw"],
  ["app", "cdn"],
  ["app", "ps"],
  ["gw", "stream"],
  ["cdn", "origin"],
  ["ps", "flow"],
  ["flow", "reco"],
];
const ALL = { app: 1, gw: 1, stream: 1, cdn: 1, origin: 1, ps: 1, flow: 1, reco: 1 } as const;
const EVENTS: [string, string, Tone?][] = [
  ["app", "ps", "sky"],
  ["ps", "flow", "sky"],
  ["flow", "reco", "sky"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Spotify · the scale", on: { app: "lit" }, figs: [["777M", "monthly users"], ["100M+", "tracks"], ["< 200 ms", ["tap to first audio", "to audio"], "lit"]], note: ["184 markets · 300M Premium subscribers", "184 markets · 300M Premium"] },
    {
      k: "requirements",
      on: { app: 1, gw: 1, stream: 1, cdn: 1, reco: 1 },
      chips: [["< 200 ms to first audio", "< 200 ms play"], ["search < 100 ms", "search < 100 ms"], ["96–320 kbps tiers", "96–320 kbps"], ["offline for Premium", "offline"], ["99.99% playback", "99.99%"], ["recs may fail, play must not", "recs can fail"]],
      ctn: ["lit", undefined, undefined, undefined, "ok", "warn"],
    },
    { k: "back of the envelope", on: { app: 1, cdn: "lit" }, fl: [["cdn", "app"]], figs: [["5B", "streams a day"], ["~175K", ["starts/s at peak", "peak/s"], "lit"], ["~5.5 Tbps", ["peak egress", "egress"]]], note: ["250M daily listeners × 20 songs × ~4 MB", "250M × 20 songs"] },
    { k: "storage", on: { origin: 1, ps: "warn", flow: "warn" }, figs: [["2.5 PB", ["audio catalogue", "audio"]], ["~39 TB", "user data"], ["~10 PB", ["events a year", "events/yr"], "warn"]], note: ["500 billion events a day drive storage, not audio", "events drive storage"], nt: "warn" },
  ],
  arch: [
    { k: "1 · authorize once", on: { app: 1, gw: 1, stream: "lit" }, sub: { stream: ["tier, rights", "rights"] }, fl: [["app", "gw"], ["gw", "stream"]], note: ["returns a signed URL that expires in 1 hour", "signed URL, 1 hour"] },
    { k: "2 · audio from the edge", kt: "ok", on: { app: "ok", cdn: "ok" }, sub: { cdn: ["99%+ hits", "99%+"] }, fl: [["cdn", "app", "ok"]], note: ["the edge verifies the token itself: no backend call", "token checked at the edge"], nt: "ok" },
    { k: "a cache miss", kt: "warn", on: { app: 1, cdn: 1, origin: "warn" }, sub: { origin: ["all 100M+", "all"] }, fl: [["origin", "cdn", "warn"], ["cdn", "app", "warn"]], note: ["long-tail tracks pay the origin round trip", "long tail only"] },
    { k: "3 · events, off the path", on: { app: 1, ps: "sky", flow: "sky", reco: "sky" }, fl: EVENTS, note: ["history · royalties · recommendations", "history, royalties, recs"] },
  ],
  deep: [
    { k: "1 · three models", on: { flow: 1, reco: "lit" }, sub: { reco: ["ensemble", "blend"] }, fl: [["flow", "reco"]], chips: [["collaborative: users like you", "collaborative"], ["content: tags, NLP", "content tags"], ["audio CNN: sounds alike", "audio CNN"], ["vectors: 128 dimensions", "128-dim"]] },
    { k: "cold start", kt: "warn", on: { reco: "lit" }, chips: [["new user: onboarding picks", "new user: onboard"], ["new song: audio features", "new song: audio"], ["Discover Weekly: 30 tracks", "30 tracks"], ["20% exploration: 6", "6 to explore"]], ctn: [undefined, undefined, undefined, "ok"] },
    { k: "2 · three cache layers", on: { app: "ok", cdn: "lit", origin: 1 }, sub: { app: ["prefetched", "cached"], cdn: ["top 20%", "top 20%"] }, fl: [["cdn", "app"]], cols: 3, chips: [["device: 1–10 GB", "device"], ["edge: 80% of plays", "edge"], ["origin: all 100M+", "origin"]], ctn: ["ok", "lit", "mute"] },
    { k: "3 · the event pipeline", on: { app: 1, ps: "lit", flow: "lit", reco: 1 }, fl: EVENTS, figs: [["500B", "events a day"], ["~250 TB", "a day, raw"], ["−0.5", ["a skip under 30 s", "early skip"], "warn"]], note: ["Dataflow: trending in real time · Dataproc: batch training", "stream + batch paths"] },
    { k: "4 · 2,000+ services", kt: "warn", on: { app: "ok", gw: 1, stream: "ok", reco: "bad" }, sub: { reco: ["breaker open", "open"], stream: ["still plays", "plays"] }, fl: [["app", "gw"], ["gw", "stream", "ok"]], chips: [["a squad owns each service", "squads"], ["Backstage catalog", "Backstage"], ["recs fall back to popular", "fallback"], ["play never waits on recs", "play first"]], ctn: [undefined, undefined, "warn", "ok"] },
  ],
  scale: [
    { k: "a huge album drop", on: { app: 1, gw: 1, stream: 1, cdn: "ok", origin: 1 }, sub: { cdn: ["pre-cached", "warm"], gw: ["2–3x", "2–3x"] }, fl: [["cdn", "app", "ok"]], chips: [["pre-cache on all CDN nodes", "pre-cache all"], ["scale the API 2–3x", "API 2–3x"], ["pre-compute recs", "pre-compute"], ["rate-limit the backends", "rate limits"]] },
    { k: "licensing and tunnels", on: { app: "lit", gw: 1, stream: "bad", cdn: 1 }, sub: { stream: ["no URL", "no URL"], app: ["buffer", "buffer"] }, chips: [["rights checked at auth", "rights at auth"], ["20+ s buffer", "20 s buffer"], ["prefetch next songs", "prefetch"], ["offline cache", "offline"]], ctn: ["bad"] },
    { k: "count every play once", on: { app: 1, ps: 1, flow: "lit" }, sub: { flow: ["dedupe", "dedupe"] }, fl: [["app", "ps"], ["ps", "flow"]], chips: [["a play ID fixed at playback", "play ID"], ["count by event time", "event time"], ["30 s minimum", "30 s min"], ["filter bots before payout", "fraud filter"]], ct: "ok" },
    { k: "the takeaway", kt: "ok", on: { ...ALL, stream: "ok", cdn: "ok" }, fl: [["app", "gw"], ["cdn", "app", "ok"], ...EVENTS], chips: [["a tiny play path", "tiny play path"], ["everything else async", "the rest async"]], ctn: ["ok", "sky"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Spotify: 777 million monthly users, 100 million+ tracks, and every tap should start music within 200 ms, with picks that feel hand-made.", tween: 1400 },
      { caption: "Play in under 200 ms at 99.99%, search in under 100 ms, offline for Premium. Recommendations may fail; playback must not.", tween: 1400 },
      { caption: "250 million daily listeners × 20 songs is 5 billion streams: ~58,000 a second, ~175,000 at peak, ~5.5 Tbps, about a tenth of video.", tween: 1400, loop: true },
      { caption: "Audio is only 2.5 PB and user data ~39 TB. Analytics events, 500 billion a day, add ~10 PB a year: the pipeline drives storage.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Tap to play: the Stream Service checks tier, region and licensing once, then returns a signed URL that expires in 1 hour.", tween: 1200, loop: true },
      { caption: "The client fetches audio from the CDN edge, which verifies the token itself; popular tracks hit cache over 99% of the time.", tween: 1200, loop: true },
      { caption: "An obscure track missing at the edge is fetched from the GCS origin, so its first play is slower. The origin is only for the long tail.", tween: 1200, loop: true },
      { caption: "Play and skip events go to Pub/Sub asynchronously, off the play path, feeding listening history, royalties and recommendations.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Recommendations blend three models: collaborative filtering on 128-dimension vectors, content tags, and a CNN on the audio itself.", tween: 1400, loop: true },
      { caption: "Cold start: new users get onboarding and editorial picks; new songs get audio features. Discover Weekly keeps 6 of 30 tracks to explore.", tween: 1400 },
      { caption: "Three layers, fastest first: the device (prefetched next tracks), the edge (the top 20% of songs, 80% of plays), then the origin.", tween: 1400, loop: true },
      { caption: "500 billion events a day: Dataflow computes trending in real time, Dataproc trains in batch, and a skip under 30 s scores −0.5.", tween: 1400, loop: true },
      { caption: "2,000+ services, each owned by a squad and listed in Backstage. If recommendations fail, a breaker opens and play keeps working.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A huge album drop: a week before, pre-cache it on every CDN node and scale the API 2 to 3x, so release-moment plays stay at the edge.", tween: 1400, loop: true },
      { caption: "Unlicensed here? No signed URL is issued. In a tunnel? A 20+ second buffer, prefetched songs and the offline cache keep the music playing.", tween: 1400 },
      { caption: "Royalties need exact counts: dedupe on a play ID fixed at playback, count offline plays by event time, and filter bots before payout.", tween: 1400, loop: true },
      { caption: "The lesson: keep the play path tiny. Authorize once, serve from the edge or the device, and push analytics and recommendations off it.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
