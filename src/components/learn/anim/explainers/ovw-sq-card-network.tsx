/**
 * The whole side quest, Visa/Mastercard: the mission and scale (~434B transactions a year,
 * 65,000+ messages/s tested, ~14,500 banks), the estimate (~13,800 TPS average, ~55,000 peak,
 * build ~100,000; ~32 PB), the four-party architecture (POS → acquirer → network → issuer, then
 * clearing and settlement), the deep dives (the low-latency path, fraud in < 1 ms, tiered timeouts
 * and stand-in, data centres, interchange) and scale and edge cases (10x, duplicates, degradation,
 * card testing).
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
  pos: { x: 16, y: 92, w: 84, h: 52, l: "POS" },
  acq: { x: 120, y: 92, w: 104, h: 52, l: "Acquirer", n: "Acq" },
  si: { x: 252, y: 36, w: 124, h: 44, l: "Stand-in", n: "Stand-in" },
  net: { x: 252, y: 92, w: 124, h: 52, l: "Network", n: "Net" },
  fraud: { x: 252, y: 156, w: 124, h: 44, l: "Fraud" },
  iss: { x: 404, y: 92, w: 180, h: 52, l: "Issuer" },
  clr: { x: 404, y: 156, w: 180, h: 44, l: "Clearing", n: "Clearing" },
};
const E: [string, string][] = [
  ["pos", "acq"],
  ["acq", "net"],
  ["net", "si"],
  ["net", "fraud"],
  ["net", "iss"],
  ["net", "clr"],
];
const PATH = { pos: 1, acq: 1, net: "lit", iss: 1 } as const;
const ALL = { pos: 1, acq: 1, si: 1, net: 1, fraud: 1, iss: 1, clr: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "card networks · the scale", on: { net: "lit" }, figs: [["~434B", ["transactions a year", "a year"]], ["65,000+", ["messages/s tested", "msgs/s"], "lit"], ["~14,500", "banks"]], note: ["≈ $27 trillion a year · 200+ countries · 160+ currencies", "≈ $27T a year · 200+ countries"] },
    {
      k: "requirements",
      on: PATH,
      chips: [["< 2 s end to end", "< 2 s total"], ["< 200 ms in the network", "< 200 ms ours"], ["< 1 ms fraud score", "< 1 ms fraud"], ["99.9999% uptime", "six 9s"], ["never double-charge", "no double charge"], ["stand in for issuers", "stand-in"]],
      ctn: [undefined, "lit", undefined, "ok", "bad"],
    },
    { k: "back of the envelope", on: PATH, fl: [["acq", "net"], ["net", "iss"]], figs: [["~13,800", "average TPS"], ["~55,000", ["Black Friday, 4x", "peak, 4x"], "warn"], ["~100,000", ["TPS to build", "build for"], "lit"]], note: ["434B a year ÷ 365 ≈ 1.19B a day", "≈ 1.19B a day"] },
    { k: "bytes and storage", on: { net: 1, clr: "sky" }, figs: [["~600 B", "per message"], ["~1 Gbps", ["per data centre", "per DC"]], ["~32 PB", ["7 years, 3 copies", "7 years"], "sky"]], note: ["the hard parts: latency, availability, correctness", "latency, not volume"] },
  ],
  arch: [
    { k: "the four-party model", on: PATH, sub: { acq: ["merchant's", "merch"], net: ["routes only", "routes"], iss: ["cardholder's bank", "card bank"] }, note: ["the network holds no funds and issues no cards", "the network holds no funds"] },
    { k: "authorization request", on: { ...PATH, fraud: "sky" }, sub: { net: ["BIN lookup", "BIN"], fraud: ["risk score", "score"] }, fl: [["pos", "acq"], ["acq", "net"], ["net", "fraud", "sky"], ["net", "iss"]], note: ["ISO 8583 · the BIN picks the issuer", "ISO 8583 · BIN → issuer"] },
    { k: "the answer", kt: "ok", on: { ...PATH, iss: "ok", pos: "ok" }, sub: { iss: ["approves", "OK"], pos: ["auth code", "code"] }, fl: [["iss", "net", "ok"], ["net", "acq", "ok"], ["acq", "pos", "ok"]], note: ["back at the terminal by about 1,800 ms", "back by ~1,800 ms"], nt: "ok" },
    { k: "clearing and settlement", on: { acq: 1, net: 1, iss: 1, clr: "lit" }, sub: { clr: ["T+1 net positions", "T+1 net"] }, fl: [["acq", "net"], ["net", "clr"]], note: ["authorization moves no money; banks settle T+1 to T+2", "money moves at T+1 to T+2"] },
  ],
  deep: [
    {
      k: "1 · the 200 ms path",
      on: PATH,
      sub: { net: ["in memory", "RAM"] },
      fl: [["acq", "net"], ["net", "iss"]],
      chips: [["dedicated leased lines", "leased lines"], ["FPGA / ASIC parsing", "FPGA parse"], ["BIN lookup < 1 μs", "BIN < 1 μs"], ["WAL overlapped", "WAL overlap"]],
    },
    {
      k: "2 · fraud in < 1 ms",
      on: { net: 1, fraud: "lit" },
      sub: { fraud: ["< 1 ms", "< 1 ms"] },
      fl: [["net", "fraud"]],
      chips: [["features in memory", "in memory"], ["velocity in Redis", "Redis counts"], ["pre-compiled model", "compiled model"], ["overrun → rules", "late → rules"]],
      ctn: [undefined, undefined, undefined, "warn"],
    },
    {
      k: "3 · the issuer is silent",
      kt: "warn",
      on: { acq: 1, net: 1, si: "lit", iss: "bad" },
      sub: { iss: ["no answer", "down"], si: ["issuer rules", "rules"] },
      fl: [["net", "iss", "bad"], ["net", "si"]],
      cols: 3,
      chips: [["primary 500 ms", "500 ms"], ["backup 300 ms", "300 ms"], ["stand-in 200 ms", "200 ms"], ["≤ $500 a txn", "≤ $500"], ["≤ $2,000 a day", "$2,000/day"], ["risk ≤ 80", "risk ≤ 80"]],
      ctn: [undefined, undefined, "lit", "mute", "mute", "mute"],
    },
    { k: "4 · six nines", kt: "ok", on: { ...ALL, net: "ok" }, sub: { net: ["sync peer", "sync"] }, chips: [["sync to the regional peer", "sync in region"], ["async across regions", "async remote"], ["failover < 30 s", "< 30 s"], ["7 data centres (Visa)", "7 DCs"]], ctn: [undefined, undefined, "ok"] },
    { k: "5 · who gets the $100", on: { acq: 1, net: 1, iss: 1, clr: "lit" }, sub: { clr: ["interchange", "fees"] }, figs: [["$97.50", "merchant"], ["$2.00", ["issuer interchange", "issuer"], "lit"], ["$0.50", ["acquirer + network", "acq + net"]]], note: ["acquirer $0.30 · network $0.20", "acquirer $0.30 · network $0.20"] },
  ],
  scale: [
    { k: "10x: 650,000 TPS", on: ALL, sub: { net: ["stateless", "x10"] }, chips: [["gateways 100 → 1,000", "gateways x10"], ["fraud 200 → 2,000", "fraud x10"], ["Redis 50 → 500 shards", "Redis re-shard"], ["routers by BIN range", "BIN ranges"]] },
    { k: "a retried authorization", on: { acq: "warn", net: "ok", iss: 1 }, sub: { acq: ["timeout", "retry"], net: ["cached reply", "cache"], iss: ["asked once", "once"] }, fl: [["acq", "net", "warn"]], chips: [["key: acquirer + txn ID", "acquirer + txn ID"], ["responses kept 24 h", "kept 24 h"]], ct: "ok" },
    { k: "degrade, don't stop", kt: "warn", on: { ...ALL, fraud: "warn", si: "lit" }, cols: 3, chips: [["Redis: safe limits", "Redis: limits"], ["fraud: rules", "fraud: rules"], ["DC: failover < 30 s", "DC: < 30 s"]], ct: "warn", note: ["a cache outage must not become a network outage", "keep commerce moving"] },
    {
      k: "the card-testing bot",
      kt: "bad",
      on: { pos: "bad", acq: 1, net: "lit", iss: 1 },
      sub: { pos: ["$1 tries", "$1"], net: ["sees it all", "sees all"] },
      fl: [["pos", "acq", "bad"], ["acq", "net", "bad"]],
      chips: [["count per BIN range", "per BIN range"], ["per merchant and device", "per device"], ["3-D Secure on CNP", "3-D Secure"], ["tell the issuers", "tell issuers"]],
    },
    { k: "the takeaway", kt: "ok", on: { ...ALL, net: "ok", si: "ok" }, fl: [["acq", "net"], ["net", "iss"]], chips: [["latency is king", "latency first"], ["hot path in memory", "in memory"], ["availability for auth", "availability"], ["stand in, don't fail", "stand in"]], ct: "ok" },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Card networks process about 434 billion transactions a year, tested at 65,000+ messages a second, between roughly 14,500 banks.", tween: 1400 },
      { caption: "Under 2 seconds end to end with under 200 ms in the network, fraud scored in under 1 ms, six 9s of uptime, and never a double charge.", tween: 1400 },
      { caption: "434 billion a year is ~1.19 billion a day, ~13,800 a second. Black Friday runs 4x, about 55,000, so build for ~100,000 TPS.", tween: 1400, loop: true },
      { caption: "Messages are tiny, ~600 bytes: about 1 Gbps per data centre. At 3.5 KB a transaction, 7 years with 3 copies is ~32 PB.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Four parties: cardholder, merchant, the acquirer (the merchant's bank) and the issuer (the cardholder's bank). The network sits between.", tween: 1000 },
      { caption: "A purchase travels POS to acquirer to network. The router finds the issuer from the card's BIN, and the fraud engine adds a risk score.", tween: 1400, loop: true },
      { caption: "The issuer checks the limit and its rules and approves. The auth code travels back and is at the terminal by about 1,800 ms.", tween: 1400, loop: true },
      { caption: "No money moved yet. Clearing files are matched and netted overnight, and each bank settles one net position at T+1 to T+2.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "The network's 200 ms: leased lines, hardware parsing, BIN tables in memory (under 1 μs), and the WAL write overlapped with processing.", tween: 1400, loop: true },
      { caption: "Fraud in under 1 ms: 500+ attributes from in-memory features and Redis velocity counters, a pre-compiled model, and rules if it overruns.", tween: 1400, loop: true },
      { caption: "Issuer silent? Primary 500 ms, backup 300 ms, then stand in for 200 ms on its rules: $500 a transaction, $2,000 a day, risk 80 or less.", tween: 1400, loop: true },
      { caption: "Six 9s: auth state syncs to the regional peer, replicates asynchronously across regions, and a data centre fails over in under 30 seconds.", tween: 1400 },
      { caption: "On a $100 restaurant bill the merchant gets $97.50, the issuer $2.00 interchange, the acquirer $0.30 and the network $0.20.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "At 10x, 650,000 TPS: stateless gateways go from 100 to 1,000 nodes, Redis re-shards by PAN hash, and routers partition by BIN range.", tween: 1400 },
      { caption: "An acquirer times out and resends. The key, acquirer ID plus transaction ID, finds the cached response, kept 24 hours: nobody pays twice.", tween: 1200, loop: true },
      { caption: "Degrade, don't stop: Redis down means conservative limits, a slow fraud model falls back to rules, and a data centre fails over in under 30 s.", tween: 1400 },
      { caption: "A bot sends 20,000 $1 guesses a minute across thousands of merchants. Only the network sees it all: count by BIN range, step up to 3-D Secure.", tween: 1400, loop: true },
      { caption: "The lessons: latency is king, keep the hot path in memory, prefer availability for auth and reconcile later, and stand in rather than fail.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
