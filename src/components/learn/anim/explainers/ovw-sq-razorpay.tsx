/**
 * The whole side quest, Razorpay: the mission and scale ($180B+ a year, 1B+ payments a quarter,
 * 802M UPI payments a day nationally), the estimate (~127/s average, a 10,000 TPS design peak,
 * ~150K internal ops/s, ~13,500 unknowns at once), the architecture (idempotent API, payment state
 * machine, router, ledger with an outbox, reconciler), the deep dives (state machine, routing,
 * unknown outcomes, the ledger and settlement, webhooks) and scale and edge cases (a sale midnight,
 * one slow issuer, the daily three-way match).
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
  merch: { x: 16, y: 96, w: 84, h: 52, l: "Merchant", n: "Shop" },
  api: { x: 124, y: 96, w: 104, h: 44, l: "Idem API", n: "API" },
  pay: { x: 252, y: 96, w: 104, h: 44, l: "Payment", n: "Pay" },
  route: { x: 380, y: 40, w: 96, h: 44, l: "Router", n: "Route" },
  bank: { x: 500, y: 40, w: 84, h: 44, l: "Banks" },
  rec: { x: 252, y: 152, w: 104, h: 44, l: "Reconcile", n: "Recon" },
  led: { x: 380, y: 152, w: 96, h: 44, l: "Ledger" },
  wh: { x: 500, y: 152, w: 84, h: 44, l: "Webhook", n: "Hook" },
};
const E: [string, string][] = [
  ["merch", "api"],
  ["api", "pay"],
  ["pay", "route"],
  ["route", "bank"],
  ["pay", "rec"],
  ["pay", "led"],
  ["led", "wh"],
];
const ALL = { merch: 1, api: 1, pay: 1, route: 1, bank: 1, rec: 1, led: 1, wh: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "the scale", on: { merch: 1, pay: "lit", bank: 1 }, figs: [["$180B+", ["a year", "a year"]], ["1B+", ["payments a quarter", "a quarter"], "lit"], ["802M", ["UPI a day, India", "UPI/day"]]], note: ["every payment needs exactly one final answer", "one final answer each"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["charge at most once", "at most once"], ["one final state each", "one final state"], ["route to who says yes", "smart routing"], ["tell the merchant, reliably", "reliable hooks"], ["settle from escrow", "escrow, T+2"], ["no card numbers outside the vault", "card vault"]],
      ctn: ["bad", "lit", undefined, undefined, "ok", "ok"],
    },
    { k: "the work per payment", on: { api: 1, pay: "lit", led: 1, wh: 1, route: 1 }, fl: [["api", "pay"], ["pay", "led"]], figs: [["~127/s", ["average", "average"]], ["10,000", ["TPS design peak", "TPS peak"], "lit"], ["~150K/s", ["internal operations", "internal ops"]]], note: ["one payment fans out into ~15 writes and events", "~15 writes a payment"] },
    { k: "unknown is normal", kt: "warn", on: { pay: "warn", rec: "lit", bank: "warn" }, fl: [["pay", "rec", "warn"]], figs: [["50/s", ["new unknowns", "new"], "warn"], ["3 × 90 s", ["UPI status checks", "checks"]], ["~13,500", ["unknown at once", "at once"], "warn"]], note: ["silence must never turn into an answer", "silence isn't an answer"] },
  ],
  arch: [
    { k: "1 · the idempotent API", on: { merch: 1, api: "lit", pay: 1 }, fl: [["merch", "api"], ["api", "pay"]], chips: [["key + request hash", "key + hash"], ["stored with the effect", "same commit"]], ctn: ["lit", "ok"] },
    { k: "2 · route and process", on: { pay: 1, route: "lit", bank: 1 }, sub: { route: ["per slice", "slice"] }, fl: [["pay", "route"], ["route", "bank"]], note: ["success rate per method, issuer and processor", "rate per slice"] },
    { k: "3 · ledger and events", kt: "ok", on: { pay: 1, led: "lit", wh: "ok" }, fl: [["pay", "led"], ["led", "wh", "ok"]], note: ["state, entries and event commit together (outbox)", "one commit (outbox)"] },
    { k: "4 · reconcile", kt: "warn", on: { pay: "warn", rec: "lit", bank: 1 }, fl: [["pay", "rec", "warn"]], note: ["status checks first, then the settlement file decides", "checks, then the file"] },
  ],
  deep: [
    {
      k: "1 · the state machine",
      on: { api: 1, pay: "lit" },
      fl: [["api", "pay"]],
      cols: 3,
      chips: ["CREATED", ["AUTHORIZED", "AUTH"], ["CAPTURED", "CAPTURE"], "UNKNOWN", "FAILED", ["LATE_SUCCESS", "LATE"]],
      ctn: [undefined, undefined, "ok", "warn", "bad", "warn"],
      ct: "mute",
    },
    { k: "2 · routing", kt: "warn", on: { pay: 1, route: "lit", bank: "warn" }, fl: [["pay", "route"], ["route", "bank", "warn"]], chips: [["method · issuer · processor", "per slice"], ["down for 20 minutes", "down 20 min"], ["2% probes to recover", "2% probes"], ["ignore customer declines", "skip declines"]], ctn: [undefined, "warn", "lit", undefined] },
    { k: "3 · the bank didn't answer", kt: "warn", on: { pay: "warn", rec: "lit" }, fl: [["pay", "rec", "warn"]], chips: [["UNKNOWN, not FAILED", "UNKNOWN"], ["checks at 90, 180, 270 s", "90/180/270 s"], ["the settlement file decides", "file decides"], ["late success: capture or refund", "late: refund"]], ctn: ["warn", undefined, "lit", "ok"] },
    { k: "4 · the ledger", kt: "ok", on: { pay: 1, led: "lit" }, fl: [["pay", "led"]], figs: [["₹1,999", ["captured", "captured"]], ["− ₹547.18", ["fee, GST, refund", "fee+refund"], "warn"], ["₹1,451.82", ["settled at T+2", "settled"], "ok"]], note: ["every posting sums to zero, and is never edited", "postings sum to zero"] },
    { k: "5 · webhooks", on: { led: 1, wh: "lit", merch: 1 }, fl: [["led", "wh"]], chips: [["a queue per merchant", "per merchant"], ["5 s to answer", "5 s timeout"], ["retries for 24 hours", "retry 24 h"], ["dedupe on event id", "event ids"]], ctn: ["lit", undefined, undefined, "ok"] },
  ],
  scale: [
    { k: "a sale midnight", on: ALL, fl: [["merch", "api"], ["api", "pay"], ["pay", "route"]], chips: [["per-merchant limits", "merchant limits"], ["route around bad slices", "route around"], ["unknowns absorbed", "unknowns ok"], ["the books still balance", "books balance"]], ctn: ["lit", undefined, "warn", "ok"] },
    { k: "one slow issuer", kt: "bad", on: { pay: "warn", route: 1, bank: "bad", merch: 1 }, sub: { bank: ["20 s", "20 s"] }, fl: [["route", "bank", "bad"]], chips: [["routing can't fix an issuer", "can't route around"], ["warn before they pay", "warn early"], ["no 2nd try while unknown", "no 2nd try"]], ctn: ["bad", "ok", "ok"] },
    { k: "the daily proof", kt: "ok", on: { led: "ok", rec: 1, bank: 1 }, cols: 3, chips: [["ledger", "ledger"], ["escrow statement", "escrow"], ["processor files", "files"]], ct: "ok", note: ["three views of the same money must match", "three views must match"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, pay: "ok", led: "ok" }, fl: [["api", "pay"], ["pay", "led", "ok"], ["pay", "rec"]], chips: [["silence is never an answer", "silence ≠ answer"], ["prove every rupee", "prove every rupee"]], ctn: ["ok", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Razorpay handles more than $180 billion a year and a billion-plus payments a quarter; UPI alone carried 802 million payments a day in September 2026.", tween: 1400 },
      { caption: "Charge at most once, give every payment one final state, route to whoever is most likely to say yes, tell the merchant, and settle from escrow.", tween: 1400 },
      { caption: "That's ~127 payments a second on average; designed for a 10,000 TPS peak, each fanning out into ~15 writes and events: ~150,000 a second.", tween: 1400, loop: true },
      { caption: "At the peak, ~50 payments a second get no answer, and NPCI allows three UPI status checks 90 s apart: ~13,500 are unknown at any moment.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Every write API takes an idempotency key, bound to a hash of the request and stored in the same commit as the effect.", tween: 1200, loop: true },
      { caption: "The payment service owns each payment's state; the router picks a processor by live success rates per method, issuer and processor.", tween: 1200, loop: true },
      { caption: "Each state change commits with its ledger entries and an outbox event; webhooks and reconciliation consume the events.", tween: 1200, loop: true },
      { caption: "Payments we hear nothing about go to the reconciler: status checks first, then the processor's settlement file decides.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Transitions are conditional updates on one row, so a duplicate callback changes nothing. A timeout is UNKNOWN; money after a no is LATE_SUCCESS.", tween: 1400, loop: true },
      { caption: "Route per slice: a route whose success rate falls is marked down for 20 minutes, 2% probes test it, and customer declines don't count.", tween: 1400, loop: true },
      { caption: "When the bank doesn't answer: tell the customer not to pay again, check at 90, 180 and 270 s, then let the settlement file decide.", tween: 1400, loop: true },
      { caption: "The ledger is double-entry and append-only: ₹1,999 captured, ₹47.18 fee with GST and a ₹500 refund leave ₹1,451.82 to settle at T+2.", tween: 1400 },
      { caption: "Webhooks are at least once: a queue per merchant, 5 s to answer, retries for 24 hours, and an event id so merchants drop duplicates.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "At a sale midnight, per-merchant limits keep one spike in its own lane, routing avoids bad slices, and unknowns are absorbed by reconciliation.", tween: 1400, loop: true },
      { caption: "When one issuer itself is slow, no route avoids it: warn its customers before they pay, and block a second attempt while one is unknown.", tween: 1400, loop: true },
      { caption: "Every day, the ledger, the escrow bank's statement and the processors' files must agree. That match is the proof nothing was lost.", tween: 1200 },
      { caption: "The lesson: never mistake silence for an answer, and be able to prove where every rupee is.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
