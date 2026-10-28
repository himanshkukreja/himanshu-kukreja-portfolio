/**
 * The whole side quest, Truecaller caller ID and spam detection: the scale (500M+ users across iOS
 * and Android; 411.1M daily users outside iOS; 68B+ spam calls identified in 2025), the estimate (~1B
 * lookups a day, ~35,000/s at peak, a 100,000/s target; ~6B numbers in ~0.9 TB, a ~45 GB hot set; a
 * ~4.5 MB on-device list), the architecture (the phone first; one precomputed record read with an
 * 800 ms deadline; a streaming scorer writing new record versions and hourly deltas; a PIR service
 * behind Apple's relay for iPhone), the deep dives (hash keys and the ring budget, 8 copies of hot
 * numbers, evidence with call proof and trust, signed base lists plus deltas, private lookups and name
 * lineage) and edge cases (a scam number's morning, a spoofed bank number, CNAP in a festival scam wave).
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
  sunita: { x: 16, y: 40, w: 88, h: 44, l: "Sunita" },
  list: { x: 16, y: 96, w: 88, h: 48, l: "List" },
  rohit: { x: 16, y: 156, w: 88, h: 40, l: "Rohit" },
  edge: { x: 128, y: 40, w: 92, h: 44, l: "Edge" },
  cdn: { x: 128, y: 96, w: 92, h: 48, l: "CDN" },
  relay: { x: 128, y: 156, w: 92, h: 40, l: "Relay" },
  lookup: { x: 248, y: 40, w: 120, h: 44, l: "Lookup" },
  scorer: { x: 248, y: 96, w: 120, h: 48, l: "Scorer" },
  pir: { x: 248, y: 156, w: 120, h: 40, l: "PIR" },
  redis: { x: 400, y: 40, w: 184, h: 44, l: "Redis · hot copies", n: "Redis" },
  store: { x: 400, y: 96, w: 184, h: 48, l: "Store · Cassandra", n: "Store" },
  names: { x: 400, y: 156, w: 184, h: 40, l: "Names · per region", n: "Names" },
};
const E: [string, string][] = [
  ["sunita", "edge"],
  ["edge", "lookup"],
  ["lookup", "redis"],
  ["redis", "store"],
  ["sunita", "list"],
  ["edge", "scorer"],
  ["scorer", "store"],
  ["scorer", "cdn"],
  ["cdn", "list"],
  ["rohit", "relay"],
  ["relay", "pir"],
  ["store", "pir"],
  ["names", "store"],
];
const ALL = { sunita: 1, list: 1, rohit: 1, edge: 1, cdn: 1, relay: 1, lookup: 1, scorer: 1, pir: 1, redis: 1, store: 1, names: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Truecaller · the scale", on: { sunita: "lit", lookup: 1, scorer: 1 }, figs: [["500M+", ["users, iOS and Android", "users"]], ["411M", ["daily, outside iOS", "daily users"], "lit"], ["68B+", ["spam calls, 2025", "spam, 2025"]]], note: ["350 million+ in India, as reported; 68 billion a year is ~2,150 a second", "350M+ in India; ~2,150/s"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["a verdict within the first ring", "first ring"], ["block spam, even offline", "block offline"], ["learn from the crowd", "crowd reports"], ["resist abuse of reports", "resist abuse"], ["private lookups on iPhone", "private on iPhone"], ["unlist within 24 hours", "unlist in 24 h"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~35,000 lookups a second at peak", "~35K lookups/s"], on: { sunita: "lit", edge: "lit", lookup: "lit", redis: 1 }, fl: [["sunita", "edge"], ["edge", "lookup"], ["lookup", "redis"]], figs: [["~1B", ["lookups a day", "a day"]], ["~35K/s", ["evening peak", "peak"], "lit"], ["100K/s", ["design target", "target"]]], note: ["~1.2 unknown calls per user a day (assumed), doubled for searches and SMS", "unknown calls, doubled"] },
    { k: ["a directory that fits in memory", "the directory"], on: { lookup: 1, redis: "lit", store: "lit", list: 1 }, figs: [["~6B", ["numbers (assumed)", "numbers"]], ["~0.9 TB", ["serving records", "records"]], ["~45 GB", ["hot set in RAM", "hot set"], "lit"]], note: ["the phone carries its region's ~500,000 worst numbers in ~4.5 MB", "phone list: ~4.5 MB"] },
  ],
  arch: [
    { k: ["1 · the phone answers first", "1 · phone first"], on: { sunita: "lit", list: "lit" }, sub: { list: ["daily list", "offline"] }, fl: [["sunita", "list"]], note: ["a saved contact wins, then the region's spam list: under 20 ms, no network", "contacts, then list, < 20 ms"] },
    { k: ["2 · one read with a deadline", "2 · one read"], on: { sunita: 1, edge: "lit", lookup: "lit", redis: "lit", store: 1 }, sub: { lookup: ["800 ms limit", "800 ms"] }, fl: [["sunita", "edge"], ["edge", "lookup"], ["lookup", "redis"]], note: ["one precomputed record, about 140 bytes back: the read path never computes", "one record, ~140 bytes"] },
    { k: ["3 · the crowd writes the records", "3 · the write path"], on: { sunita: 1, edge: 1, scorer: "lit", store: "lit", cdn: 1, list: 1 }, sub: { scorer: ["stream + batch", "stream"] }, fl: [["edge", "scorer"], ["scorer", "store"], ["scorer", "cdn"], ["cdn", "list"]], note: ["~12,000 call outcomes a second, ~22 reports; a new version per change", "~12K outcomes, ~22 reports/s"] },
    { k: ["4 · iPhone asks privately", "4 · iPhone"], on: { rohit: "lit", relay: "lit", pir: "lit", store: 1 }, sub: { pir: ["shards in RAM", "in RAM"] }, fl: [["rohit", "relay"], ["relay", "pir"], ["store", "pir"]], note: ["Apple's relay hides who asked; PIR hides which number", "relay hides who, PIR what"] },
  ],
  deep: [
    { k: ["1 · the lookup in milliseconds", "1 · the ring budget"], on: { sunita: 1, list: 1, edge: 1, lookup: "lit", redis: "lit", store: "lit" }, fl: [["sunita", "edge"], ["edge", "lookup"], ["lookup", "redis"]], bars: [[["contacts and device list", "on the phone"], 20, 800, "ok"], [["lookup server, p99", "server p99"], 30, 800, "lit"], [["the network's deadline", "deadline"], 800, 800, "sky"]], note: ["keys are a hash of the E.164 number, not prefix ranges", "hash, not prefix"] },
    { k: ["2 · hot numbers", "2 · hot numbers"], kt: "warn", on: { lookup: 1, redis: "warn", store: 1, scorer: 1 }, fl: [["lookup", "redis"], ["scorer", "store"]], figs: [["8", ["copies of a hot record", "copies"], "lit"], ["2,000/s", ["a courier's number", "courier"], "warn"], ["250/s", ["per node", "per node"], "ok"]], note: ["a new verdict overwrites every copy; it never deletes, so nothing misses", "overwrite, never delete"] },
    { k: ["3 · weigh evidence, not votes", "3 · the crowd"], on: { sunita: 1, edge: 1, scorer: "lit", store: 1 }, fl: [["edge", "scorer"], ["scorer", "store"]], chips: [["a report needs call proof", "call proof"], ["distinct reporters, by trust", "trusted reporters"], ["outcomes ~500 to 1", "outcomes count"], ["bands with hysteresis", "no flicker"]], ctn: ["ok", "lit", "sky", "warn"] },
    { k: ["4 · the phone as a cache", "4 · offline"], on: { scorer: 1, cdn: "lit", list: "lit", sunita: 1 }, fl: [["scorer", "cdn"], ["cdn", "list"]], figs: [["4.5 MB", ["~500,000 numbers", "the list"]], ["~225 KB", ["a day of changes", "daily delta"], "lit"], ["7 days", ["of deltas kept", "deltas kept"]]], note: ["a signed base plus hourly deltas; removals ship as fast as additions", "base + hourly deltas"] },
    { k: ["5 · private by construction", "5 · privacy"], on: { rohit: 1, relay: "lit", pir: "lit", store: 1, names: "lit" }, fl: [["rohit", "relay"], ["relay", "pir"], ["names", "store"]], chips: [["relay hides who asked", "relay: who"], ["PIR hides which number", "PIR: which"], ["every name keeps its source", "name lineage"], ["unlisted within 24 hours", "unlist in 24 h"]], ctn: ["sky", "lit", "ok", "warn"] },
  ],
  scale: [
    { k: ["a scam number's morning", "one morning"], kt: "warn", on: { sunita: 1, edge: 1, scorer: "warn", store: "lit", cdn: 1, list: 1 }, fl: [["edge", "scorer", "warn"], ["scorer", "store"], ["scorer", "cdn"]], figs: [["9:12", ["first calls", "first call"]], ["10:22", ["Likely fraud", "fraud"], "warn"], ["10:30", ["hourly delta", "delta"]]], note: ["at 10:41 Sunita's list misses, and the server answers in about 700 ms", "server answers, ~700 ms"] },
    { k: ["a bank's number, spoofed", "spoofed number"], kt: "bad", on: { edge: 1, scorer: "bad", store: "ok", names: 1 }, fl: [["edge", "scorer", "bad"], ["scorer", "store"]], chips: [["reports against a real bank", "reports pour in"], ["the owner's call log disagrees", "call log disagrees"], ["a verified floor holds", "verified floor"], ["show \"often spoofed\"", "often spoofed"]], ctn: ["bad", "sky", "ok", "warn"] },
    { k: ["CNAP in a festival scam wave", "CNAP week"], kt: "warn", on: { ...ALL, scorer: "warn", cdn: "warn" }, fl: [["sunita", "edge"], ["edge", "scorer", "warn"], ["scorer", "cdn", "warn"]], figs: [["~5,000", ["new numbers a day", "numbers/day"], "warn"], ["5 min", ["windows, new numbers", "windows"]], ["15 min", ["deltas in the wave", "deltas"]]], note: ["CNAP shows whose SIM it is; the verdict says whether it's a scam", "a name is not a verdict"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, list: "ok", store: "ok", names: "ok" }, fl: [["sunita", "edge"], ["edge", "lookup"], ["scorer", "cdn", "ok"], ["names", "store", "ok"]], cols: 3, chips: [["precompute the verdict", "precompute"], ["worst on the phone", "phone first"], ["keep names' origin", "name origin"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Truecaller has 500 million+ users across iOS and Android, more than 350 million of them in India as reported, and 411.1 million daily users outside iOS; it identified 68 billion+ spam calls in 2025.", tween: 1400 },
      { caption: "Put a name and a spam verdict on screen within the first ring, block known spammers even offline, learn from the crowd's reports without being gamed, answer privately on iPhone and let anyone unlist their number.", tween: 1400 },
      { caption: "On stated assumptions, ~411 million daily users with ~1.2 unknown calls each, doubled for searches and SMS senders, is ~1 billion lookups a day: ~35,000 a second at the evening peak, with 100,000 as the design target.", tween: 1400, loop: true },
      { caption: "The directory holds ~6 billion numbers at ~150 bytes each, ~0.9 TB; the ~300 million that call strangers this week fit in ~45 GB of memory, and the phone carries its region's ~500,000 worst numbers in ~4.5 MB.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "The phone is the first tier: a saved contact wins, then the region's spam list, refreshed daily, answers in under 20 ms with no network; only strangers go to the server.", tween: 1200, loop: true },
      { caption: "Then one small request with an 800 ms deadline: the lookup service reads one precomputed serving record from Redis or a local Cassandra replica and sends back about 140 bytes.", tween: 1200, loop: true },
      { caption: "The write path does the expensive work: reports and call outcomes are scored in a stream plus a daily batch, each change is a new record version, and hourly deltas reach phones through the CDN.", tween: 1200, loop: true },
      { caption: "Rohit's iPhone asks through Apple's Oblivious HTTP relay, and a PIR service answers from encrypted shards in memory, rebuilt from the same records, without learning who asked or which number.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Keys are a hash of the E.164 number, not prefix ranges, because new number blocks get hot together; contacts and the device list take under 20 ms, the server under 30 ms, and the rest of the 800 ms is the network.", tween: 1400, loop: true },
      { caption: "A hot record is kept as 8 copies on different nodes, so a courier's 2,000 lookups a second become 250 per node, and a new verdict overwrites every copy instead of deleting it, so there is no miss to stampede.", tween: 1400, loop: true },
      { caption: "The scorer weighs evidence: a report counts only with proof of the call, distinct reporters are weighted by trust from a daily batch, call outcomes outnumber reports ~500 to 1, and bands use hysteresis so a verdict doesn't flicker.", tween: 1400, loop: true },
      { caption: "The phone keeps a signed base list plus hourly deltas: ~500,000 numbers in ~4.5 MB and ~225 KB of changes a day; removals ship as fast as additions, and a phone more than 7 days behind fetches a fresh base.", tween: 1400, loop: true },
      { caption: "On iPhone the relay hides who asked, single-use tokens prove it's a user and PIR hides the number; every name keeps its source and region, and an unlisted number goes within 24 hours unless the community marked it as spam.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A new number starts calling at 9:12, is Suspected spam by 9:40 and Likely fraud at 10:22, and the 10:30 delta adds it; at 10:41 Sunita's list misses, but the server answers in about 700 ms.", tween: 1400, loop: true },
      { caption: "Scammers spoof a bank's number and reports pour in: the owner's call log contradicts them, a verified business has a floor the crowd can't push through, and the screen says the number is often spoofed, not spam.", tween: 1400, loop: true },
      { caption: "From 1 November 2026 operators show the caller's registered name (CNAP), but a name isn't a verdict: a SIM farm rotating ~5,000 numbers a day needs 5-minute windows, campaign-level features and 15-minute deltas.", tween: 1400, loop: true },
      { caption: "The lesson: precompute the verdict, carry the worst numbers on the phone, and keep every name's origin, so the answer arrives before the second ring and can be taken back when it should be.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
