/**
 * The whole side quest, India's UPI: the mission and its scale (~800M payments a day, 740+ banks,
 * < 2 s p99), the estimate (~9,300 TPS average, 28-46K peak, ~2.3 PB over 7 years), the three
 * layers (apps/PSPs → NPCI switch → banks, money settled bank to bank), the deep dives (VPA
 * resolution, the transaction state machine and DEEMED_SUCCESS, per-bank circuit breakers,
 * security) and scale and failures (a 5x Diwali, a data center down, duplicates, April 2025).
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
  app: { x: 16, y: 76, w: 100, h: 52, l: "App (PSP)", n: "App" },
  npci: { x: 168, y: 72, w: 136, h: 60, l: "NPCI switch", n: "NPCI" },
  cache: { x: 168, y: 152, w: 136, h: 44, l: "VPA cache", n: "Cache" },
  hdfc: { x: 360, y: 48, w: 120, h: 52, l: "HDFC", n: "HDFC" },
  axis: { x: 360, y: 136, w: 120, h: 52, l: "Axis", n: "Axis" },
  rbi: { x: 508, y: 92, w: 80, h: 52, l: "RBI", n: "RBI" },
};
const E: [string, string][] = [
  ["app", "npci"],
  ["npci", "cache"],
  ["npci", "hdfc"],
  ["npci", "axis"],
  ["hdfc", "rbi"],
  ["axis", "rbi"],
];
const ALL = { app: 1, npci: 1, cache: 1, hdfc: 1, axis: 1, rbi: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "UPI · the scale", on: { app: "lit" }, figs: [["~800M", "payments a day"], ["740+", "banks", "lit"], ["550M+", "users"]], note: ["any two accounts, from a phone, in a couple of seconds", "any account, from a phone"] },
    {
      k: "requirements",
      on: { app: 1, npci: 1, hdfc: 1, axis: 1 },
      chips: [["< 2 s end to end, p99", "< 2 s p99"], "99.9% available", "zero money lost", ["700+ legacy bank systems", "700+ banks"], ["works on 2G / 3G", "2G / 3G"], ["P2P and P2M", "P2P, P2M"]],
      ctn: ["lit", undefined, "bad"],
    },
    { k: "back of the envelope", on: { app: 1, npci: "lit" }, figs: [["~9,300", "average TPS"], ["28–46K", ["peak TPS, 3–5x", "peak, 3–5x"], "lit"], ["170K+", ["backend ops/s", "ops/s"], "warn"]], note: ["one payment = a lookup, 2 bank calls, audit writes, 2 pushes", "lookup + 2 bank calls + audit + 2 pushes"] },
    { k: "storage", on: { npci: 1 }, figs: [["~500 B", "per record"], ["~900 GB", ["a day, with audit", "a day"]], ["~2.3 PB", ["7-year retention", "7 years"], "sky"]], note: ["~330 TB a year", "~330 TB a year"] },
  ],
  arch: [
    { k: "three layers", on: { app: 1, npci: "lit", hdfc: 1, axis: 1 }, sub: { app: ["UI only", "UI"], npci: ["routes only", "routes"], hdfc: ["accounts", "money"], axis: ["accounts", "money"] }, note: ["information flows app → PSP → NPCI → banks", "app → PSP → NPCI → banks"] },
    { k: "₹500 to bob@okaxis", on: { app: 1, npci: "lit", axis: "sky" }, sub: { app: ["+ PIN", "PIN"], axis: ["resolve VPA", "VPA"] }, fl: [["app", "npci"], ["npci", "axis", "sky"]], note: ["resolve first: a bad VPA fails before any debit", "resolve before any debit"] },
    { k: "debit, then credit", on: { app: 1, npci: "lit", hdfc: "lit", axis: "ok" }, sub: { hdfc: ["debit ABC123", "debit"], axis: ["credit XYZ789", "credit"], npci: ["< 2 s total", "< 2 s"] }, fl: [["npci", "hdfc"], ["npci", "axis", "ok"]], note: ["audit, fraud check and notifications run alongside", "audit + fraud in parallel"] },
    { k: "where the money goes", kt: "ok", on: { npci: 1, hdfc: "ok", axis: "ok", rbi: "ok" }, sub: { npci: ["no money", "no money"], rbi: ["settles", "settle"] }, fl: [["hdfc", "rbi", "ok"], ["axis", "rbi", "ok"]], note: ["money moves bank to bank, netted and settled at the RBI", "money: bank to bank via RBI"], nt: "ok" },
  ],
  deep: [
    {
      k: "1 · VPA resolution",
      on: { app: 1, npci: "lit", cache: "lit", axis: 1 },
      sub: { npci: ["okaxis → Axis", "suffix"], cache: ["15–30 min TTL", "TTL"], axis: ["owns its VPAs", "owner"] },
      fl: [["npci", "cache"]],
      chips: [["< 10 ms per lookup", "< 10 ms"], ["50,000+ lookups/s", "50K+/s"]],
    },
    {
      k: "2 · a state machine",
      on: { npci: "lit", hdfc: 1, axis: 1 },
      sub: { npci: ["saved first", "saved"] },
      cols: 3,
      chips: ["CREATED", "DEBITED", "COMPLETED", "FAILED", "REVERSED", ["DEEMED SUCCESS", "DEEMED"]],
      ctn: [undefined, undefined, "ok", "bad", "bad", "warn"],
      ct: "mute",
    },
    {
      k: "credit timed out",
      kt: "warn",
      on: { npci: "warn", hdfc: "lit", axis: "bad" },
      sub: { npci: ["DEEMED_SUCCESS", "deemed"], hdfc: ["debited", "debited"], axis: ["timeout", "timeout"] },
      fl: [["npci", "axis", "bad"]],
      chips: [["don't re-debit, don't guess", "don't guess"], ["same transaction ID", "same ID"], ["into the settlement file", "settlement file"], ["auto-reverse by T+1", "reverse by T+1"]],
      ctn: ["warn", undefined, undefined, "ok"],
    },
    {
      k: "3 · 740+ bank integrations",
      on: { npci: "lit", hdfc: "ok", axis: "bad" },
      sub: { npci: ["adapter per bank", "adapters"], hdfc: ["CLOSED", "CLOSED"], axis: ["OPEN · 30 s", "OPEN"] },
      fl: [["npci", "hdfc", "ok"]],
      chips: [["5 failures → OPEN", "5 fails → OPEN"], ["HALF-OPEN probes", "HALF-OPEN"], ["3 successes → CLOSED", "3 OK → CLOSED"], ["fail fast, not hang", "fail fast"]],
      ctn: ["bad", "warn", "ok"],
    },
    {
      k: "4 · security in layers",
      on: { app: "lit", npci: 1, hdfc: "lit" },
      sub: { app: ["device + PIN", "PIN"], npci: ["fraud score", "fraud"], hdfc: ["PIN in HSM", "HSM"] },
      chips: [["device + SIM binding", "device + SIM"], ["PIN encrypted (RSA)", "PIN encrypted"], ["every txn signed", "signed"], ["real-time fraud checks", "fraud checks"]],
    },
  ],
  scale: [
    { k: "a 5x Diwali", kt: "warn", on: { ...ALL, npci: "warn" }, sub: { npci: ["pre-scaled 6x", "6x"], cache: ["warmed", "warm"] }, fl: [["app", "npci", "warn"]], figs: [["~4B", "a day at 5x"], ["140K+", "peak TPS", "warn"], ["~170K", ["TPS pre-scaled", "pre-scaled"], "ok"]], note: ["shed promos · 5 txn/min per user · queue mandates", "shed promos · 5 txn/min"] },
    { k: "a data center fails", on: ALL, sub: { npci: ["Chennai + Hyd", "2 DCs"] }, chips: ["active-active", ["synchronous replication", "sync replicas"], "RPO 0", "RTO < 30 s"], ctn: [undefined, undefined, "ok", "ok"] },
    { k: "a double tap", on: { app: "warn", npci: "ok", hdfc: 1 }, sub: { app: ["same ID", "retry"], npci: ["return result", "dedupe"], hdfc: ["one debit", "1 debit"] }, fl: [["app", "npci", "warn"]], note: ["the ID is created once, with the payment, and reused verbatim", "one ID, reused on every retry"], nt: "ok" },
    { k: "April 2025", kt: "bad", on: { app: "bad", npci: "bad" }, sub: { app: ["status API", "status"], npci: ["~50% success", "~50%"] }, fl: [["app", "npci", "bad"]], chips: [["rate-limit every API", "rate-limit all"], ["isolate status checks", "isolate status"]], note: ["nearly two hours of degraded payments", "~2 hours degraded"], nt: "bad" },
    { k: "the takeaway", kt: "ok", on: { ...ALL, npci: "ok" }, sub: { npci: ["routes, no money", "router"] }, fl: [["app", "npci"], ["npci", "hdfc"], ["npci", "axis"]], note: ["any app, any bank · no counterparty risk · scales out", "any app, any bank"], nt: "ok" },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "UPI moves money between any two accounts at 740+ banks, from a phone: about 800 million payments a day for 550 million users.", tween: 1400 },
      { caption: "The rules: under 2 seconds end to end at p99, 99.9% availability and zero lost money, across 700+ legacy banks and 2G phones.", tween: 1400 },
      { caption: "800 million over 86,400 seconds is ~9,300 a second. Peaks run 3 to 5x: 28,000 to 46,000 TPS, or 170,000+ backend ops a second.", tween: 1400 },
      { caption: "Each record is about 500 bytes. With audit logs that is ~900 GB a day, ~330 TB a year, and ~2.3 PB for 7-year retention.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Three layers: apps partner with a PSP bank, the NPCI switch routes every request, and banks hold the accounts. The app holds no money.", tween: 1000 },
      { caption: "Alice pays ₹500 to bob@okaxis. Her app sends it with the encrypted PIN, and NPCI first asks Axis whose account bob@okaxis is.", tween: 1200, loop: true },
      { caption: "NPCI debits Alice at HDFC (ref ABC123), then credits Bob at Axis (ref XYZ789), and confirms to Alice in under 2 seconds.", tween: 1200, loop: true },
      { caption: "Money moves bank to bank: accounts post in real time, and interbank obligations are netted and settled in batches at the RBI.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "VPA resolution runs on every payment: under 10 ms, 50,000+ a second. The suffix picks the bank; hot VPAs are cached 15 to 30 minutes.", tween: 1200, loop: true },
      { caption: "Money can't vanish, so each payment is a state machine saved before any bank call: CREATED, DEBITED, then COMPLETED or REVERSED.", tween: 1400 },
      { caption: "If the credit times out, NPCI doesn't guess: it marks DEEMED_SUCCESS, and reconciliation completes it or auto-reverses by T+1.", tween: 1400, loop: true },
      { caption: "Each of 740+ banks gets an adapter and its own circuit breaker. After 5 failures Axis is skipped for 30 s, failing fast, not hanging.", tween: 1400, loop: true },
      { caption: "Security in layers: the PIN is bound to device and SIM, encrypted on the phone, verified in the bank's HSM; fraud is scored in real time.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & failures",
    steps: [
      { caption: "Design for a 5x Diwali: ~4 billion a day, 140,000+ TPS at the evening peak. Pre-scale to about 170,000 TPS and warm the VPA caches.", tween: 1400, loop: true },
      { caption: "If one NPCI data center fails, the other takes over: active-active in Chennai and Hyderabad, replicated synchronously, RPO 0, RTO under 30 s.", tween: 1400 },
      { caption: "A user taps Pay twice: the retry reuses the original transaction ID, so NPCI returns the stored result instead of debiting again.", tween: 1000, loop: true },
      { caption: "April 2025: PSP banks flooded the status-check API, and success fell to about 50% for nearly two hours. Rate-limit every API.", tween: 1200, loop: true },
      { caption: "The big idea: NPCI routes information but never touches the money, so any app works with any bank, and the switch scales out.", tween: 1000, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
