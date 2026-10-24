/**
 * The whole side quest, Netflix: the mission and scale (325M+ members, 190+ countries, ~15% of
 * downstream traffic), the estimate (~10M streams × 5 Mbps = 50 Tbps; 360 TB library, ~36 PB on
 * the CDN), the two planes (AWS control plane hands out a manifest, Open Connect appliances in the
 * ISP stream the bytes, filled from IXP and S3 tiers), the deep dives (the ABR ladder, Open Connect
 * economics and placement, circuit breakers) and scale and edge cases (midnight launches, a dead
 * appliance, a region outage, going live).
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
  dev: { x: 16, y: 96, w: 92, h: 52, l: "Device", n: "TV" },
  api: { x: 140, y: 48, w: 116, h: 44, l: "API gateway", n: "API" },
  svc: { x: 284, y: 48, w: 128, h: 44, l: "Services", n: "Svcs" },
  enc: { x: 440, y: 48, w: 144, h: 44, l: "Encoder", n: "Encode" },
  isp: { x: 140, y: 152, w: 116, h: 44, l: "ISP OCA", n: "ISP" },
  ixp: { x: 284, y: 152, w: 128, h: 44, l: "IXP OCA", n: "IXP" },
  origin: { x: 440, y: 152, w: 144, h: 44, l: "Origin (S3)", n: "S3" },
};
const E: [string, string][] = [
  ["dev", "api"],
  ["api", "svc"],
  ["enc", "origin"],
  ["origin", "ixp"],
  ["ixp", "isp"],
  ["isp", "dev"],
];
const ALL = { dev: 1, api: 1, svc: 1, enc: 1, isp: 1, ixp: 1, origin: 1 } as const;
const CDN = { origin: 1, ixp: 1, isp: 1 } as const;
const FILL: [string, string, Tone?][] = [
  ["origin", "ixp", "sky"],
  ["ixp", "isp", "sky"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Netflix · the scale", on: { dev: "lit" }, figs: [["325M+", "paid members"], ["190+", "countries"], ["~15%", ["of downstream traffic", "of the internet"], "lit"]], note: ["97 billion hours watched in H1 2026", "97B hours in H1 2026"] },
    {
      k: "requirements",
      on: { dev: 1, api: 1, isp: 1 },
      chips: [["240p to 4K HDR", "240p–4K HDR"], ["start in < 2 s", "start < 2 s"], ["no rebuffering", "no rebuffer"], ["DRM on every device", "DRM"], ["API < 100 ms p99", "API < 100 ms"], ["99.99% uptime", "99.99%"]],
      ctn: [undefined, "lit", "lit"],
    },
    { k: "the Friday-night peak", kt: "bad", on: { dev: "lit", isp: 1 }, fl: [["isp", "dev"]], figs: [["~10M", "streams at peak"], ["5 Mbps", "average"], ["50 Tbps", "of egress", "bad"]], note: ["300M subscribers × 3% watching at 8 PM", "300M × 3% at 8 PM"] },
    { k: "the library", on: { enc: 1, ...CDN, origin: "sky" }, figs: [["~30", ["encodes per title", "encodes"]], ["360 TB", ["one copy", "one copy"]], ["~36 PB", ["across the CDN", "on the CDN"], "sky"]], note: ["18,000 titles × ~20 GB", "18,000 titles × ~20 GB"] },
  ],
  arch: [
    { k: "two planes", on: ALL, sub: { svc: ["1,000+ services", "1,000+"], isp: ["inside ISP", "in ISP"] }, note: ["top: AWS control plane · bottom: Open Connect data plane", "top: AWS · bottom: Open Connect"] },
    { k: "press play", on: { dev: "lit", api: 1, svc: "lit" }, sub: { svc: ["manifest", "URLs"], api: ["auth", "auth"] }, fl: [["dev", "api"], ["api", "svc"]], note: ["what can this user watch, at which qualities, from where?", "what, how good, from where"] },
    { k: "bytes from the edge", kt: "ok", on: { dev: "ok", isp: "ok" }, sub: { isp: ["90%+ hits", "90%+"] }, fl: [["isp", "dev", "ok"]], note: ["100% of video comes from Open Connect", "all video from Open Connect"], nt: "ok" },
    { k: "filling the tiers", on: { enc: "lit", ...CDN }, sub: { origin: ["everything", "all"], ixp: ["most titles", "most"], isp: ["popular", "hot"] }, fl: [["enc", "origin", "sky"], ...FILL], note: ["nightly fill to IXPs, off-peak fill to ISPs", "filled off-peak"] },
  ],
  deep: [
    {
      k: "1 · adaptive bitrate",
      on: { dev: "lit", isp: 1 },
      fl: [["isp", "dev"]],
      bars: [[["240p · 235 Kbps", "240p"], 235, 25000, "warn"], [["720p · 3 Mbps", "720p"], 3000, 25000], [["1080p · 5 Mbps", "1080p"], 5000, 25000], [["4K HDR · 25 Mbps", "4K HDR"], 25000, 25000, "lit"]],
    },
    {
      k: "into the subway",
      kt: "warn",
      on: { dev: "warn", isp: 1 },
      sub: { dev: ["240p", "240p"] },
      fl: [["isp", "dev", "warn"]],
      chips: [["fits if bitrate × 1.2 ≤ bandwidth", "× 1.2 headroom"], ["buffer < 5 s → lowest", "< 5 s → lowest"], ["climb back slowly", "climb slowly"], ["per-title: up to ~20% saved", "per-title ~20%"]],
      ctn: [undefined, "warn", "ok", "sky"],
    },
    { k: "2 · Open Connect", on: { ...CDN, isp: "lit" }, sub: { isp: ["120 TB", "120 TB"] }, fl: FILL, figs: [["$7–18B", ["a year, third-party", "third-party"], "bad"], ["~200 Gbps", "per appliance"], ["~40,000", "streams each", "ok"]] },
    { k: "what goes where", on: { ...CDN, ixp: "lit", isp: "lit" }, sub: { ixp: ["by hash", "hash"], isp: ["top 20%", "top 20%"] }, fl: FILL, chips: [["top 20% on every server", "top 20% everywhere"], ["long tail by hash", "tail by hash"], ["nightly fill to IXPs", "nightly fill"], ["off-peak fill to ISPs", "off-peak fill"]] },
    { k: "3 · circuit breakers", kt: "warn", on: { dev: 1, api: 1, svc: "warn" }, sub: { svc: ["recs: OPEN", "OPEN"] }, fl: [["dev", "api"], ["api", "svc", "warn"]], chips: [["3 failures → OPEN", "3 fails → OPEN"], ["fallback: popular titles", "popular titles"], ["~80% of viewing via recs", "80% via recs"], ["chaos tests: Monkey to Kong", "chaos tests"]], ctn: ["bad", "ok"] },
  ],
  scale: [
    { k: "a season drops at midnight", kt: "warn", on: { ...ALL, isp: "ok" }, sub: { isp: ["pre-warmed", "warm"], svc: ["scaled up", "scaled"] }, fl: FILL, chips: [["pre-position on all OCAs", "pre-position"], ["pre-compute homepages", "pre-compute"], ["scale the control plane", "scale API"], ["fallback recommendations", "fallbacks"]] },
    { k: "an appliance dies", kt: "warn", on: { dev: "warn", isp: "bad", ixp: "ok", origin: 1 }, sub: { isp: ["offline", "down"], ixp: ["next in list", "next"], dev: ["brief dip", "dip"] }, note: ["the manifest already ranks the fallback appliances", "the manifest lists fallbacks"] },
    { k: "a region fails", kt: "warn", on: { dev: 1, api: "bad", svc: "warn", isp: "ok" }, sub: { api: ["failover", "failover"], svc: ["cached recs", "cache"] }, fl: [["isp", "dev", "ok"]], note: ["the two planes fail independently", "planes fail independently"] },
    { k: "going live", on: { ...ALL, enc: "lit" }, sub: { enc: ["real time", "live"] }, fl: [["enc", "origin"], ["origin", "ixp"], ["ixp", "isp"], ["isp", "dev"]], chips: [["encode the ladder live", "live encoding"], ["no pre-positioning", "no pre-fill"], ["coalesce segment misses", "coalescing"], ["cap the top bitrate", "cap bitrate"]], ctn: [undefined, "warn", "ok", "ok"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, svc: "ok", isp: "ok" }, fl: [["dev", "api"], ["isp", "dev", "ok"]], chips: [["control plane: small, consistent", "control: consistent"], ["data plane: huge bytes, nearby", "data: nearby"]], ctn: ["sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Netflix serves 325 million+ members in 190+ countries, ~15% of downstream internet traffic, and any title must start in under 2 seconds.", tween: 1400 },
      { caption: "From 240p on weak mobile data to 4K HDR on home theatres: start in under 2 seconds, never rebuffer, DRM everywhere, 99.99% uptime.", tween: 1400 },
      { caption: "3% of 300 million watching on a Friday night is ~10 million streams. At 5 Mbps that is 50 Tbps, far too much to send from a few cloud regions.", tween: 1400, loop: true },
      { caption: "18,000 titles in about 30 encodes each, ~20 GB a title: 360 TB for one copy, ~36 PB once replicated across the CDN near viewers.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Two planes: a control plane on AWS for sign-in, browsing, recommendations and playback authorization, and a data plane for the video.", tween: 1000 },
      { caption: "Pressing play asks the control plane what this user may watch and from where. It returns a manifest of playback URLs on nearby appliances.", tween: 1200, loop: true },
      { caption: "From then on every byte comes from an Open Connect appliance inside the viewer's ISP, the shortest path, with a 90%+ cache hit rate.", tween: 1200, loop: true },
      { caption: "Behind it, three tiers: the S3 origin holds everything, IXP appliances most of the catalogue, and ISP appliances what's popular.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Adaptive bitrate: a ladder from 240p at 235 Kbps up to 4K HDR at 25 Mbps, cut into 2 to 4 second chunks the player can switch between.", tween: 1600, loop: true },
      { caption: "The player picks the highest rung where bitrate × 1.2 fits, drops to the lowest when the buffer falls under 5 s, and climbs back slowly.", tween: 1400, loop: true },
      { caption: "Why build a CDN: third-party delivery would cost $7 to 18 billion a year. One appliance holds 120 TB and serves ~40,000 streams at ~200 Gbps.", tween: 1400, loop: true },
      { caption: "Placement: the most popular 20% goes on every regional server; the long tail is spread by hash, once per region, keeping it off the origin.", tween: 1400, loop: true },
      { caption: "Every service call sits behind a circuit breaker: if recommendations fail 3 times, the homepage falls back to popular titles instead of erroring.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A season drops worldwide at midnight. Cold caches would send the herd to the origin, so pre-position the episodes everywhere the day before.", tween: 1400, loop: true },
      { caption: "If the ISP appliance dies, the client moves to the next one in its manifest, often at the IXP, and ABR absorbs the distance with a brief dip.", tween: 1200 },
      { caption: "If an AWS region fails, the control plane fails over to another region and shows cached recommendations. The two planes fail independently.", tween: 1200, loop: true },
      { caption: "Going live: 20 million viewers at 5 Mbps is 100 Tbps. Encode in real time, coalesce each segment's misses, cap the top bitrate if needed.", tween: 1400, loop: true },
      { caption: "The lesson: split the planes. Small, consistent requests run in the cloud; huge, identical video bytes come from inside the viewer's ISP.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
