/**
 * Card authorization and stand-in (side quest 4 · Phase 3 data flow / Deep Dive 1 edge cases):
 * the lesson's $100 purchase through POS → acquirer → network (BIN lookup, ~1 ms fraud score) →
 * issuer and back by ~1,800 ms, with money moving only at settlement; and the issuer that doesn't
 * answer: primary 500 ms, backup 300 ms, then stand-in decides in 200 ms on the issuer's rules
 * ($500 single limit, $2,000 daily, risk ≤ 80, not lost or stolen) and queues it for reconciliation.
 */
import { Box, clamp, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 292;
type Pt = { x: number; y: number };
const Y = 70;
const XS = [20, 168, 316, 464];
const BW = 116;
const out = (i: number): Pt => ({ x: XS[i] + BW, y: Y });
const inn = (i: number): Pt => ({ x: XS[i], y: Y });
const HALF: Pt = { x: (XS[2] + BW + XS[3]) / 2, y: Y };
const NB: Pt = { x: XS[2] + BW / 2, y: 100 };
const SI = { x: 300, y: 136, w: 148, h: 56 };
const ST: Pt = { x: NB.x, y: SI.y };

type Leg = { a: number; b: number; from: Pt; to: Pt; tone: Tone; label: string };
const go = (a: number, b: number, from: Pt, to: Pt, tone: Tone, label: string): Leg => ({ a, b, from, to, tone, label });

const RULES = [
  { w: "$100 ≤ $500 single txn", n: "$100 ≤ $500" },
  { w: "within $2,000 daily", n: "≤ $2,000/day" },
  { w: "risk score ≤ 80", n: "risk ≤ 80" },
  { w: "not lost or stolen", n: "not stolen" },
];

type Frame = {
  legs: Leg[];
  net: string;
  netT?: Tone;
  iss: string;
  issT?: Tone;
  pos: string;
  posT?: Tone;
  ms: number;
  standin?: { sub: string; tone?: Tone; rules: number; queued?: boolean };
  cut?: boolean;
};

function frame(variant: string, step: number, t: number): Frame {
  const after = (x: number) => t >= x;
  if (variant === "ok") {
    if (step === 0)
      return { legs: [go(0, 0.45, out(0), inn(1), "lit", "ISO 8583 · $100"), go(0.5, 0.95, out(1), inn(2), "lit", "acquirer → network")], net: "router", iss: "card bank", pos: "$100", ms: lerp(0, 400, t) };
    if (step === 1) return { legs: [], net: t < 0.5 ? "BIN → issuer" : "risk scored", netT: "lit", iss: "card bank", pos: "$100", ms: lerp(400, 401, t) };
    if (step === 2)
      return {
        legs: [go(0, 0.25, out(2), inn(3), "lit", "authorization request + risk score"), go(0.78, 1, inn(3), out(2), "ok", "approved · auth code")],
        net: "waiting",
        iss: after(0.6) ? "approved" : after(0.25) ? "limit + rules" : "card bank",
        issT: after(0.6) ? "ok" : after(0.25) ? "lit" : undefined,
        pos: "$100",
        ms: lerp(401, 1400, t),
      };
    return {
      legs: [go(0, 0.4, inn(2), out(1), "ok", "approved · auth code"), go(0.45, 0.85, inn(1), out(0), "ok", "approved · auth code")],
      net: "router",
      iss: "approved",
      issT: "ok",
      pos: after(0.85) ? "approved ✓" : "$100",
      posT: after(0.85) ? "ok" : undefined,
      ms: lerp(1400, 1800, t),
    };
  }
  if (step === 0)
    return {
      legs: [go(0, 0.14, out(0), inn(1), "lit", "ISO 8583 · $100"), go(0.16, 0.3, out(1), inn(2), "lit", "acquirer → network"), go(0.35, 0.6, out(2), HALF, "warn", "tier 1: primary endpoint")],
      net: "waiting",
      iss: after(0.6) ? "no answer" : "card bank",
      issT: after(0.6) ? "bad" : undefined,
      pos: "$100",
      ms: lerp(0, 500, seg(t, 0.35, 1)),
      cut: after(0.6),
    };
  if (step === 1)
    return { legs: [go(0, 0.35, out(2), HALF, "warn", "tier 2: backup endpoint")], net: "waiting", iss: "no answer", issT: "bad", pos: "$100", ms: lerp(500, 800, t), cut: true };
  if (step === 2)
    return {
      legs: [go(0, 0.22, NB, ST, "lit", "tier 3: stand-in, issuer's rules")],
      net: "stand-in",
      netT: "lit",
      iss: "no answer",
      issT: "bad",
      pos: "$100",
      ms: lerp(800, 1000, t),
      standin: { sub: after(0.9) ? "approve" : "checking", tone: after(0.9) ? "ok" : "lit", rules: clamp(Math.floor(seg(t, 0.25, 0.9) * 4 + 0.001), 0, 4) },
      cut: true,
    };
  return {
    legs: [go(0, 0.35, inn(2), out(1), "ok", "approved (stand-in)"), go(0.4, 0.75, inn(1), out(0), "ok", "approved (stand-in)")],
    net: "router",
    iss: "no answer",
    issT: "bad",
    pos: after(0.75) ? "approved ✓" : "$100",
    posT: after(0.75) ? "ok" : undefined,
    ms: 1000,
    standin: { sub: "approve", tone: "ok", rules: 4, queued: after(0.8) },
    cut: true,
  };
}

const PHASES = [
  { a: 0, b: 200, w: "card", n: "card" },
  { a: 200, b: 400, w: "acquirer", n: "acq" },
  { a: 400, b: 401, w: "", n: "" },
  { a: 401, b: 1400, w: "issuer decides", n: "issuer" },
  { a: 1400, b: 1800, w: "return", n: "back" },
];
const TIERS = [
  { a: 0, b: 500, w: "primary 500", n: "500" },
  { a: 500, b: 800, w: "backup 300", n: "300" },
  { a: 800, b: 1000, w: "stand-in 200", n: "200" },
];

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const msg = live[0];
  const ok = variant === "ok";
  const span = ok ? 1800 : 1000;
  const bars = ok ? PHASES : TIERS;
  const BX = 24;
  const BL = 552;
  const BY = 244;
  const bx = (ms: number) => BX + (BL * ms) / span;
  return (
    <g>
      <Box x={XS[0]} y={40} w={BW} h={60} label="Merchant" sub={f.pos} tone={f.posT} />
      <Box x={XS[1]} y={40} w={BW} h={60} label="Acquirer" sub="bank" />
      <Box x={XS[2]} y={40} w={BW} h={60} label="Network" sub={f.net} tone={f.netT} />
      <Box x={XS[3]} y={40} w={BW} h={60} label="Issuer" sub={f.iss} tone={f.issT} dim={f.cut} />
      {[0, 1, 2].map((i) => (
        <Wire key={i} d={`M${XS[i] + BW} ${Y}H${XS[i + 1]}`} tone={i === 2 && f.cut ? "bad" : undefined} dash={i === 2 && f.cut} />
      ))}
      {f.cut && (
        <path className="sq-x" d={`M${HALF.x - 7} ${Y - 7}L${HALF.x + 7} ${Y + 7}M${HALF.x + 7} ${Y - 7}L${HALF.x - 7} ${Y + 7}`} />
      )}
      {!ok && (
        <g>
          <Wire d={`M${NB.x} ${NB.y}V${ST.y}`} dash tone={f.standin ? "lit" : "mute"} />
          <Box x={SI.x} y={SI.y} w={SI.w} h={SI.h} label="Stand-in" sub={f.standin?.sub ?? "issuer's rules"} tone={f.standin?.tone} dim={!f.standin} />
          {f.standin?.queued && (
            <Txt x={SI.x + SI.w / 2} y={SI.y + SI.h + 18} k="s" tone="sky">
              {narrow ? "→ reconcile" : "→ queued to reconcile"}
            </Txt>
          )}
          {RULES.map((r, i) => (
            <Txt key={i} x={24} y={140 + i * 22} k="s" anchor="start" tone="ok" opacity={(f.standin?.rules ?? 0) > i ? 1 : 0}>
              {`✓ ${narrow ? r.n : r.w}`}
            </Txt>
          ))}
        </g>
      )}
      {ok && step >= 3 && t >= 0.85 && (
        <Txt x={24} y={146} k="s" anchor="start" tone="mute">
          {narrow ? "money moves at T+1 to T+2" : "no money has moved: settlement is T+1 to T+2"}
        </Txt>
      )}
      {live.map((l, i) => {
        const p = seg(t, l.a, l.b);
        return <Token key={i} x={lerp(l.from.x, l.to.x, p)} y={lerp(l.from.y, l.to.y, p)} s={11} tone={l.tone} />;
      })}
      {msg && (
        <Txt x={24} y={24} k="s" anchor="start" tone={msg.tone}>
          {`→ ${msg.label}`}
        </Txt>
      )}
      {/* timeline */}
      <Txt x={BX} y={BY - 12} k="k" anchor="start" tone="mute">
        {ok ? (narrow ? "elapsed" : "authorization · under 2 s") : narrow ? "~1,000 ms budget" : "issuer timeouts · ~1,000 ms budget"}
      </Txt>
      <Txt x={BX + BL} y={BY - 10} anchor="end" tone={!ok && f.ms >= 1000 ? "ok" : undefined}>
        {`${Math.round(f.ms).toLocaleString("en-US")} ms`}
      </Txt>
      <rect className="ax-meter" x={BX} y={BY} width={BL} height={16} />
      {bars.map((b, i) => {
        const x0 = bx(b.a);
        const w = bx(b.b) - x0;
        const fill = clamp((f.ms - b.a) / (b.b - b.a));
        const on = f.ms > b.a && f.ms < b.b;
        const cls = ok ? (on ? "sq-seg lit" : "sq-seg") : i === 2 ? "sq-seg ok" : on ? "sq-seg warn" : "sq-seg bad";
        return (
          <g key={i}>
            <rect className={cls} x={x0} y={BY} width={Math.max(0, w * fill)} height={16} />
            {i > 0 && <line className="ax-tick" x1={x0} x2={x0} y1={BY} y2={BY + 16} />}
            {(narrow ? b.n : b.w) && (
              <Txt x={x0 + w / 2} y={BY + 36} k="s" tone="mute">
                {narrow ? b.n : b.w}
              </Txt>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sq-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}
.sq-seg{fill:var(--ax-fg4)}.sq-seg.lit{fill:var(--ax-accent)}.sq-seg.warn{fill:var(--ax-amber)}.sq-seg.bad{fill:var(--ax-bad)}.sq-seg.ok{fill:var(--ax-ok)}`,
  variants: [
    {
      id: "ok",
      label: "Issuer answers",
      steps: [
        { caption: "A $100 purchase: the POS builds an ISO 8583 message and the acquirer passes it to the network (0–400 ms).", tween: 2000 },
        { caption: "The network's BIN lookup finds the issuer; the fraud engine attaches a risk score in about 1 ms.", tween: 1600 },
        { caption: "The issuer checks the credit limit and its fraud rules, then approves (401–1,400 ms).", tween: 2600 },
        { caption: "The auth code returns through network and acquirer by ~1,800 ms. No money moves until settlement, T+1 to T+2.", tween: 2000, ms: 3600 },
      ],
    },
    {
      id: "standin",
      label: "Issuer down",
      steps: [
        { caption: "The same $100 request reaches the network, but the issuer's primary endpoint gives no answer within 500 ms.", tween: 2800 },
        { caption: "Tier 2 fails over to the issuer's backup endpoint: still nothing within 300 ms.", tween: 1800 },
        { caption: "Stand-in applies the issuer's rules within 200 ms: $100 is under the $500 limit and risk ≤ 80. Approved.", tween: 2800, ms: 3200 },
        { caption: "The approval reaches the till inside the ~1,000 ms budget; the decision is queued for the issuer to reconcile.", tween: 2000, ms: 3600 },
      ],
    },
  ],
  Scene,
});
