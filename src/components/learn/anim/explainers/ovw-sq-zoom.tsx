/**
 * The whole side quest, Zoom video meetings at scale: the scale (10M daily meeting participants in
 * December 2019 to 300M in April 2020, a count of joins, not people; 3.5T annualized meeting minutes),
 * the estimate (~20M people in meetings at the peak hour, ~30 Tbps of media out, ~60K joins/s on the
 * hour; forwarding needs ~4,500 servers where mixing would need ~360K), the architecture (a control
 * plane with one controller per meeting → multimedia routers that forward packets they never decode →
 * a cascade across regions, plus a recorder), the deep dives (mesh vs MCU vs SFU, simulcast/SVC layers
 * per receiver, UDP loss repair and TLS fallback, placement and cascades, meeting state with fencing)
 * and scale and edge cases (the top-of-hour herd, a dead router, a 40,000-person town hall).
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
  kavya: { x: 16, y: 40, w: 88, h: 44, l: "Kavya" },
  arjun: { x: 16, y: 152, w: 88, h: 44, l: "Arjun" },
  mmr: { x: 128, y: 96, w: 92, h: 52, l: "MMR" },
  ctrl: { x: 248, y: 40, w: 120, h: 40, l: "Controller", n: "Ctrl" },
  layers: { x: 248, y: 96, w: 120, h: 52, l: "Layer picker", n: "Layers" },
  rec: { x: 248, y: 156, w: 120, h: 40, l: "Recorder", n: "Rec" },
  zone: { x: 400, y: 40, w: 184, h: 44, l: "Zones · state", n: "Zones" },
  remote: { x: 400, y: 96, w: 184, h: 44, l: "MMR San Jose", n: "San Jose" },
  store: { x: 400, y: 152, w: 184, h: 44, l: "Object storage", n: "Storage" },
};
const E: [string, string][] = [
  ["kavya", "mmr"],
  ["arjun", "mmr"],
  ["kavya", "ctrl"],
  ["ctrl", "zone"],
  ["mmr", "layers"],
  ["layers", "remote"],
  ["mmr", "rec"],
  ["rec", "store"],
];
const ALL = { kavya: 1, arjun: 1, mmr: 1, ctrl: 1, layers: 1, rec: 1, zone: 1, remote: 1, store: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Zoom · the scale", on: { kavya: "lit", arjun: 1, mmr: 1 }, figs: [["10M", ["daily participants, 2019", "Dec 2019"]], ["300M", ["daily participants, 2020", "Apr 2020"], "lit"], ["3.5T", ["meeting minutes a year", "min/year"]]], note: ["a participant is one person in one meeting: a count of joins, not people", "joins, not people"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["join in under 3 s", "join < 3 s"], ["audio under 150 ms", "audio < 150 ms"], ["a layer per receiver", "per receiver"], ["survive loss and firewalls", "loss, firewalls"], ["host controls, in order", "host controls"], ["2 to 40,000 people", "2 to 40,000"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~20M people at the peak hour", "~20M at peak"], on: { kavya: "lit", arjun: "lit", mmr: 1, layers: 1, remote: 1 }, fl: [["kavya", "mmr"], ["arjun", "mmr"], ["mmr", "layers"], ["layers", "remote"]], figs: [["~20M", ["in meetings at peak", "at peak"]], ["~30 Tbps", ["media out", "media out"], "lit"], ["~60K/s", ["joins on the hour", "joins/s"], "warn"]], note: ["9.6 billion minutes a day over 1,440 minutes, a 3× peak (assumed)", "9.6B min/day, 3× peak"] },
    { k: "mixing can't keep up", kt: "warn", on: { mmr: "warn", layers: "warn" }, fl: [["mmr", "layers", "warn"]], figs: [["~4,500", ["forwarding servers", "forward"], "ok"], ["~360K", ["mixing servers", "mixing"], "bad"], ["80×", ["more to mix", "ratio"], "warn"]], note: ["mixing decodes every camera and encodes a picture for every receiver", "mixing decodes everything"] },
  ],
  arch: [
    { k: ["1 · control: one owner per meeting", "1 · control"], on: { kavya: "lit", ctrl: "lit", zone: "lit", mmr: 1 }, sub: { zone: ["nearest with room", "nearest"] }, fl: [["kavya", "ctrl"], ["ctrl", "zone"]], note: ["passcode, waiting room, then a 60 s media token for a nearby router", "a token for a nearby MMR"] },
    { k: ["2 · media: forward, never decode", "2 · media"], on: { kavya: "lit", arjun: "lit", mmr: "lit", layers: 1 }, sub: { layers: ["per receiver", "each"] }, fl: [["kavya", "mmr"], ["mmr", "arjun"], ["mmr", "layers"]], note: ["UDP straight to the router; it reads headers and copies packets", "UDP, headers only"] },
    { k: ["3 · across regions: a cascade", "3 · cascade"], kt: "ok", on: { mmr: 1, layers: 1, remote: "lit" }, sub: { remote: ["one copy per layer", "1 copy"] }, fl: [["mmr", "layers"], ["layers", "remote", "ok"]], note: ["Rahul joins San Jose; each stream crosses the Pacific once", "one copy across the ocean"], nt: "ok" },
    { k: "4 · recording", on: { mmr: 1, rec: "lit", store: "lit" }, sub: { store: ["~360 TB a day", "360 TB/d"] }, fl: [["mmr", "rec"], ["rec", "store"]], note: ["a recorder joins like a silent client and writes to object storage", "a silent participant"] },
  ],
  deep: [
    { k: "1 · route, don't mix", on: { kavya: 1, arjun: 1, mmr: "lit" }, fl: [["kavya", "mmr"], ["mmr", "arjun"]], chips: [["mesh: 13 uploads a phone", "mesh: 13 up"], ["mixing: decode everything", "mixing"], ["forward: copy packets", "forward"], ["only the 3 loudest voices", "top 3 audio"]], ctn: ["bad", "bad", "ok", "lit"] },
    { k: "2 · a layer per receiver", on: { kavya: "lit", mmr: 1, layers: "lit", arjun: "warn" }, fl: [["kavya", "mmr"], ["mmr", "layers"], ["mmr", "arjun", "warn"]], bars: [[["720p layer, 1,500 kbps", "720p"], 1500, 1500, "sky"], [["Arjun's estimate, 600 kbps", "Arjun"], 600, 1500, "warn"], [["360p layer for him, 400 kbps", "360p"], 400, 1500, "ok"]] },
    { k: ["3 · late is the same as lost", "3 · late = lost"], kt: "warn", on: { arjun: "warn", mmr: "lit" }, fl: [["mmr", "arjun", "warn"]], chips: [["UDP, not TCP", "UDP"], ["FEC: no round trip", "FEC"], ["NACK on short hops", "NACK"], ["adaptive jitter buffer", "jitter buffer"], ["TLS on 443 if UDP is blocked", "TLS on 443"], ["measure loss after repair", "residual loss"]], ctn: ["lit", undefined, undefined, "sky", "warn", "ok"] },
    { k: ["4 · nearest zone, cascaded", "4 · zones"], kt: "ok", on: { kavya: 1, mmr: "lit", layers: 1, remote: "lit" }, fl: [["kavya", "mmr"], ["mmr", "layers"], ["layers", "remote", "ok"]], figs: [["1", ["copy per layer per link", "per link"], "ok"], ["< 150 ms", ["one way, in region", "in region"], "lit"], ["50%", ["spare in every zone", "spare"]]], note: ["Bengaluru to San Jose can't meet 150 ms: keep the one long hop clean", "one clean long hop"] },
    { k: ["5 · one controller per meeting", "5 · controller"], on: { kavya: 1, ctrl: "lit", zone: 1 }, fl: [["kavya", "ctrl"], ["ctrl", "zone"]], chips: [["commands applied in order", "in order"], ["versioned events out", "versions"], ["lease + epoch fencing", "fencing"], ["E2EE: up to 200, no cloud rec", "E2EE ≤ 200"]], ctn: ["lit", undefined, "ok", "sky"] },
  ],
  scale: [
    { k: "the top of the hour", kt: "warn", on: { kavya: "warn", arjun: 1, ctrl: "warn", zone: 1 }, fl: [["kavya", "ctrl", "warn"], ["ctrl", "zone"]], chips: [["pre-warm before :00 and :30", "pre-warm"], ["join in one round trip", "1 round trip"], ["jittered client retries", "jittered retries"], ["the herd never reaches MMRs", "MMRs spared"]], ctn: ["warn", "lit", undefined, "ok"] },
    { k: "a router dies", kt: "bad", on: { kavya: 1, arjun: 1, mmr: "bad", ctrl: 1 }, chips: [["400 people lose media", "400 frozen"], ["reconnect, same session", "same session"], ["state lives in the controller", "state is safe"], ["seconds, not the meeting", "seconds"]], ctn: ["bad", "lit", "ok", "ok"] },
    { k: ["results day: 40,000 watching", "40,000 watching"], kt: "warn", on: { ...ALL, mmr: "warn", remote: "warn" }, fl: [["kavya", "mmr"], ["mmr", "layers", "warn"], ["layers", "remote", "warn"]], figs: [["72 Gbps", ["to 40,000 viewers", "egress"], "warn"], ["~16", ["leaf routers", "routers"]], ["330/s", ["joins, one meeting", "joins/s"], "warn"]], note: ["no roster for attendees, keyframe asks merged, video degrades first", "degrade video, never audio"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, mmr: "ok", ctrl: "ok" }, fl: [["kavya", "mmr"], ["mmr", "arjun", "ok"], ["mmr", "layers", "ok"], ["layers", "remote", "ok"]], cols: 3, chips: [["keep control apart", "control"], ["forward, don't mix", "forward"], ["a layer per receiver", "layers"]], ctn: ["sky", "lit", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Zoom went from 10 million daily meeting participants in December 2019 to 300 million in April 2020: a count of joins, not people.", tween: 1400 },
      { caption: "Join in under 3 seconds, hear each other in under 150 ms, give each receiver its own quality, survive loss and firewalls, and keep host controls in order.", tween: 1400 },
      { caption: "3.5 trillion meeting minutes a year is ~9.6 billion a day: ~20 million people in meetings at the peak hour, ~30 Tbps of media out, ~60,000 joins a second on the hour.", tween: 1400, loop: true },
      { caption: "Forwarding packets needs ~4,500 servers at peak; mixing every camera into a picture per receiver would need ~360,000.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The control plane: Kavya's join goes to the meeting's one controller, which picks the nearest zone with room and issues a 60-second media token.", tween: 1200, loop: true },
      { caption: "The media plane: audio and video go over UDP straight to a multimedia router, which reads headers and forwards packets without decoding them.", tween: 1200, loop: true },
      { caption: "Rahul connects to a router in San Jose; the two routers cascade, so each stream crosses the Pacific once.", tween: 1200, loop: true },
      { caption: "A recording is a silent participant that writes to object storage, an estimated ~360 TB a day.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Mesh makes a phone upload 13 copies; mixing decodes everything; forwarding copies packets, and only the 3 loudest voices are sent on.", tween: 1400, loop: true },
      { caption: "Kavya sends 180p, 360p and 720p layers; Arjun's estimate falls to 600 kbps, so the router sends him 360p and everyone else 720p.", tween: 1400, loop: true },
      { caption: "Late is the same as lost: UDP with FEC and NACK, an adaptive jitter buffer, TLS on port 443 when UDP is blocked, and loss measured after repair.", tween: 1400, loop: true },
      { caption: "Each person joins the nearest zone; routers cascade with one copy per layer per link, and every zone keeps 50% spare capacity.", tween: 1400, loop: true },
      { caption: "One controller per meeting applies host commands in order and fences stale owners with lease epochs; end-to-end encryption allows up to 200 people and no cloud recording.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "At the top of the hour ~60,000 joins a second hit the control plane: pre-warm, join in one round trip, jitter retries, and spare the routers.", tween: 1400, loop: true },
      { caption: "A router dies with 400 people on it: they reconnect with the same session to another router in the zone, and lose seconds, not the meeting.", tween: 1400 },
      { caption: "A 40,000-person town hall: 72 Gbps through a tree of ~16 leaf routers, no roster to attendees, collapsed keyframe requests, video degraded before audio.", tween: 1400, loop: true },
      { caption: "The lesson: keep control apart from media, forward rather than mix, and give every receiver the best layer its network can take.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
