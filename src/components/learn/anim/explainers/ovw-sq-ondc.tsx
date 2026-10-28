/**
 * The whole side quest, ONDC: the scale (500M transactions by July 2026; 218M in FY 2025–26; 1.16 lakh+
 * retail sellers in 630+ cities and towns), the estimate (~7 transactions/s on average; an assumed
 * ~200 orders/s target at ~25 signed calls each; live search to ~150 seller apps per city as the real
 * load), the architecture (a gateway that multicasts search only; orders peer to peer as ACK and on_
 * callback pairs; every edge signed and checked against the registry; logistics and settlement as
 * participants), the deep dives (signing and key caching, catalogue refresh instead of live search,
 * hold-then-release confirmation with 999 and 998, cascaded logistics, two-sided settlement) and edge
 * cases (Rehana's Dhanteras evening, a dented diya over IGM, a seller app that goes quiet).
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
  cache: { x: 16, y: 40, w: 88, h: 44, l: "Cache" },
  buyer: { x: 16, y: 96, w: 88, h: 48, l: "Buyer" },
  igm: { x: 16, y: 156, w: 88, h: 40, l: "Issues", n: "IGM" },
  gw: { x: 128, y: 40, w: 92, h: 44, l: "Gateway", n: "Gate" },
  bap: { x: 128, y: 96, w: 92, h: 48, l: "Buyer app", n: "BAP" },
  obs: { x: 128, y: 156, w: 92, h: 40, l: "Health" },
  reg: { x: 248, y: 40, w: 120, h: 44, l: "Registry" },
  bpp: { x: 248, y: 96, w: 120, h: 48, l: "Seller app", n: "Seller" },
  sa: { x: 248, y: 156, w: 120, h: 40, l: "Settlement", n: "Settle" },
  lsp: { x: 400, y: 40, w: 184, h: 44, l: "Logistics app", n: "Logistics" },
  shop: { x: 400, y: 96, w: 184, h: 48, l: "Rehana's shop", n: "Rehana" },
  bank: { x: 400, y: 156, w: 184, h: 40, l: "Banks" },
};
const E: [string, string][] = [
  ["buyer", "bap"],
  ["bap", "cache"],
  ["bap", "gw"],
  ["gw", "bpp"],
  ["bap", "bpp"],
  ["bpp", "reg"],
  ["bpp", "lsp"],
  ["bpp", "shop"],
  ["bap", "igm"],
  ["bap", "obs"],
  ["bap", "sa"],
  ["bpp", "sa"],
  ["sa", "bank"],
];
const ALL = { cache: 1, buyer: 1, igm: 1, gw: 1, bap: 1, obs: 1, reg: 1, bpp: 1, sa: 1, lsp: 1, shop: 1, bank: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "ONDC · the scale", on: { bap: 1, bpp: 1, shop: "lit" }, figs: [["500M", ["transactions by July 2026", "by July 2026"], "lit"], ["218M", ["in FY 2025–26", "FY 2025–26"]], ["630+", ["cities and towns", "cities"]]], note: ["1.16 lakh+ retail sellers (Dec 2025); counts include rides and tickets", "1.16 lakh+ sellers"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["one protocol, search to return", "one protocol"], ["discovery across seller apps", "discovery"], ["every message signed", "signed messages"], ["on both sides or neither", "both or neither"], ["logistics as a participant", "logistics"], ["money and complaints", "money, complaints"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["~7 transactions a second", "~7 a second"], on: { bap: "lit", bpp: "lit", lsp: 1 }, fl: [["bap", "bpp"], ["bpp", "lsp"]], figs: [["~7/s", ["on average", "average"]], ["~200/s", ["design target, assumed", "target"], "lit"], ["~25", ["signed calls an order", "calls/order"]]], note: ["~5,000 signed calls a second at the target; orders aren't the load", "orders aren't the load"] },
    { k: ["search is a broadcast", "the broadcast"], kt: "warn", on: { bap: 1, gw: "warn", bpp: "warn" }, fl: [["bap", "gw"], ["gw", "bpp", "warn"]], figs: [["~150", ["seller apps a city", "seller apps"]], ["150K/s", ["live search requests", "requests/s"], "warn"], ["~100 GB", ["of catalogue JSON", "catalogues"]]], note: ["all assumed: 1,000 searches a second, ~300 items a seller", "all assumed"] },
  ],
  arch: [
    { k: ["1 · search through a gateway", "1 · the gateway"], on: { bap: 1, gw: "lit", bpp: 1, cache: "lit" }, sub: { cache: ["catalogue", "index"] }, fl: [["bap", "gw"], ["gw", "bpp"], ["bpp", "bap"], ["bap", "cache"]], note: ["the gateway multicasts by domain and city; replies go straight back", "replies go direct"] },
    { k: ["2 · orders go peer to peer", "2 · peer to peer"], on: { buyer: 1, bap: "lit", bpp: "lit", shop: 1 }, sub: { bpp: ["orders", "orders"] }, fl: [["buyer", "bap"], ["bap", "bpp"], ["bpp", "shop"]], note: ["every call is ACKed at once; the answer comes later as an on_ callback", "ACK now, on_ later"] },
    { k: ["3 · every edge is signed", "3 · signed edges"], on: { bap: 1, bpp: "lit", reg: "lit" }, sub: { reg: ["public keys", "keys"] }, fl: [["bap", "bpp"], ["bpp", "reg"]], note: ["Ed25519 over a BLAKE-512 digest; checked against the registry's key", "verified via registry"] },
    { k: ["4 · logistics and money", "4 · logistics, money"], on: { bap: 1, bpp: "lit", lsp: "lit", sa: "lit", bank: 1 }, fl: [["bpp", "lsp"], ["bap", "sa"], ["bpp", "sa"], ["sa", "bank"]], note: ["the seller app buys delivery; an agency settles both sides' books", "delivery, settlement"] },
  ],
  deep: [
    { k: ["1 · a request from a stranger", "1 · signing"], on: { bap: 1, bpp: "lit", reg: "lit" }, fl: [["bap", "bpp"], ["bpp", "reg"]], chips: [["hash the raw bytes received", "hash raw bytes"], ["cache keys by subscriber, key id", "cache keys"], ["±10 s timestamps, expiry", "±10 s, expiry"], ["rotate: a second key", "rotate keys"]], ctn: ["lit", "ok", "warn", "sky"] },
    { k: ["2 · a broadcast you pay once", "2 · discovery"], on: { bap: "lit", cache: "lit", gw: 1, bpp: 1 }, fl: [["bpp", "bap"], ["bap", "cache"], ["bap", "gw"]], chips: [["full catalogue, by city", "full refresh"], ["pushes every 1–30 min", "1–30 min pushes"], ["the newest timestamp wins", "newest wins"], ["absence isn't deletion", "no silent deletes"]], ctn: ["lit", "sky", "ok", "warn"] },
    { k: ["3 · one order, two databases", "3 · confirm"], on: { bap: "lit", bpp: "lit", shop: 1 }, fl: [["bap", "bpp"], ["bpp", "bap"]], chips: [["the buyer app names the order", "buyer app names it"], ["held until on_confirm is ACKed", "hold, then release"], ["no ACK: 999, refund", "999: buyer app"], ["on_confirm unACKed: 998", "998: seller app"]], ctn: ["lit", "ok", "bad", "bad"] },
    { k: ["4 · logistics is a participant", "4 · logistics"], on: { bap: 1, bpp: "lit", lsp: "lit", shop: 1 }, fl: [["bpp", "lsp"], ["bpp", "bap"]], figs: [["₹68", ["first quote, cancelled", "cancelled"], "bad"], ["₹90", ["replacement courier", "replacement"], "warn"], ["₹22", ["seller app's, our design", "seller app's"]]], note: ["re-procure before cancelling; statuses cascade one by one", "re-procure first"] },
    { k: ["5 · money moves on a match", "5 · settlement"], on: { bap: 1, bpp: 1, sa: "lit", bank: "lit" }, fl: [["bap", "sa"], ["bpp", "sa"], ["sa", "bank"]], figs: [["₹1,050", ["collected by buyer app", "collected"]], ["₹1,000", ["owed to the seller app", "to seller app"], "lit"], ["₹800", ["to the seller's bank", "to the seller"], "ok"]], note: ["both send /settle; a mismatch is NOT_SETTLED, then /recon or IGM", "match, or not settled"] },
  ],
  scale: [
    { k: ["Rehana's Dhanteras", "Dhanteras"], on: { buyer: "lit", bap: 1, bpp: "lit", shop: "lit", lsp: 1 }, fl: [["buyer", "bap"], ["bap", "bpp"], ["bpp", "shop"], ["bpp", "lsp"]], figs: [["7:41", ["four orders, four apps", "four orders"]], ["7:44", ["one idol, two carts", "two carts"], "warn"], ["8:10", ["rider reads the code", "pickup"], "ok"]], note: ["illustrative; a silent confirm is retried with the same order id", "same id on retry"] },
    { k: ["a dented diya in Kolkata", "a complaint"], kt: "warn", on: { buyer: 1, bap: "lit", igm: "lit", bpp: 1, lsp: "warn" }, fl: [["buyer", "bap"], ["bap", "igm"], ["bap", "bpp"], ["bpp", "lsp"]], figs: [["48 h", ["for a first response", "to respond"], "lit"], ["30 days", ["to resolve", "to resolve"]], ["₹120", ["refund proposed", "refund"], "ok"]], note: ["IGM: the issue cascades to the courier; then ONDC's portal, ODR", "cascades to the courier"] },
    { k: ["8:40 pm · a seller app goes quiet", "a quiet seller app"], kt: "bad", on: { ...ALL, bpp: "bad", bap: "warn", shop: "ok", obs: "lit" }, fl: [["bap", "bpp", "bad"], ["bap", "obs"]], figs: [["~2,700", ["callbacks never sent", "stuck callbacks"], "bad"], ["999", ["buyer apps cancel, refund", "cancel, refund"], "warn"], ["0", ["phantom orders at shops", "phantom orders"], "ok"]], note: ["fictional; alert on confirms ACKed with no on_confirm sent", "alert on the edges"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, bap: "ok", bpp: "ok", sa: "ok" }, fl: [["bap", "bpp", "ok"], ["bap", "sa"], ["bpp", "sa"]], cols: 3, chips: [["one side names it", "one names it"], ["release when heard", "hold, release"], ["pay when books match", "pay on a match"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "ONDC reached 500 million transactions on 25 July 2026, four years after its first order, with 218 million in FY 2025–26 alone, counting rides, tickets and financial products as well as retail; 1.16 lakh+ retail sellers were live in 630+ cities and towns in December 2025.", tween: 1400 },
      { caption: "One protocol from search to return between any two companies, discovery across every seller app, every message signed, an order that exists on both sides or on neither, logistics as another participant, and settlement and complaints across company lines.", tween: 1400 },
      { caption: "218 million a year is ~600,000 a day, ~7 a second; a 10× festival evening is ~70, and designing for 3× that, ~200 orders a second at ~25 signed calls each (assumed), is ~5,000 calls a second across the whole network.", tween: 1400, loop: true },
      { caption: "The load is search: assuming ~150 seller apps per domain and city, 1,000 live searches a second would be 150,000 requests a second into seller apps, each search waiting for the slowest, while the whole retail catalogue is ~100 GB (assumed).", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "A buyer app's search goes to a gateway, which multicasts it to every seller app registered for that domain and city; seller apps answer the buyer app directly, and it serves most searches from its own catalogue cache.", tween: 1200, loop: true },
      { caption: "Select, init, confirm and everything after go directly between the buyer app and the seller app: the receiver answers only ACK or NACK at once and sends the real answer later, as a callback named on_ plus the request's name.", tween: 1200, loop: true },
      { caption: "Every request and callback is signed with the sender's Ed25519 key over a BLAKE-512 digest of the body, and the receiver verifies it with the sender's public key from the registry, so a participant can be held to what it sent.", tween: 1200, loop: true },
      { caption: "The seller app buys delivery from logistics apps through the same protocol, and money after the payment moves through a settlement agency; no box in the middle knows the order.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Sign the bytes you send and verify the bytes you got; cache public keys by subscriber and key id, since the registry's recommended /lookup limit is 7,600 a minute; reject stale messages by expiry and timestamp; rotate keys by publishing a second one.", tween: 1400, loop: true },
      { caption: "Pay the broadcast once per refresh: a full catalogue by city, then incremental pushes every 1 to 30 minutes, ordered by the seller's timestamps. A seller app that didn't answer keeps its items, and cached stock is only a hint that /select checks.", tween: 1400, loop: true },
      { caption: "The buyer app creates a network-unique order id that every retry carries; the seller app ACKs /confirm and holds the order, releasing it to the shop only when its /on_confirm is acknowledged. Silence ends in 999 from the buyer app or 998 from the seller app.", tween: 1400, loop: true },
      { caption: "The seller app buys delivery inside the retail select and cascades the charge into /on_select; when the ₹68 courier cancels before pickup it re-procures, and the ₹22 extra is its own in our design, because the order value can't rise.", tween: 1400, loop: true },
      { caption: "In ONDC's example a ₹1,050 order is collected by the buyer app, which keeps its ₹50 fee; ₹1,000 is owed to the seller app, which keeps ₹200 and sends ₹800 to the seller. Both sides send /settle, and the agency moves money only when they match.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Rehana's evening (illustrative): four orders from four apps in four minutes; two carts race for her last idol and one /select gets \"not available\"; a silent confirm is retried with the same order id and creates one order; at 8:10 a rider reads the pickup code.", tween: 1400, loop: true },
      { caption: "The family complains in their bank's app, which must respond within 48 hours and resolve within 30 days; over IGM the issue cascades to the seller app and the courier, who proposes a ₹120 refund, and unresolved complaints escalate to ONDC's portal.", tween: 1400, loop: true },
      { caption: "In a fictional incident a seller app ACKs every /confirm but never sends /on_confirm: buyer apps cancel with 999 and refund, the held orders never reach shops, and ~2,700 stale callbacks are cancelled, not replayed; edge metrics would catch it in minutes.", tween: 1400, loop: true },
      { caption: "The lesson: name the order on one side, keep it on both, release it only when both have heard, and move money only when both books agree, so consistency comes from the protocol, not from a shared database.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
