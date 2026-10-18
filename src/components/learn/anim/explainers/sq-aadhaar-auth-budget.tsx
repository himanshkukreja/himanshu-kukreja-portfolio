/**
 * Aadhaar authentication in 200 ms (side quest 3 · Deep Dive 2): the lesson's latency budget
 * walked hop by hop. The AUA's encrypted PID block travels via the ASA to CIDR (25 ms), the HSM
 * decrypts it and checks the signature (15 ms), the record and template load (20 ms), the 1:1
 * match takes the largest slice (80 ms), the signed yes/no returns (15 + 25 ms) with 20 ms
 * overhead. A failed match still answers in budget ("n"), and the bank falls back to another mode.
 */
import { Box, clamp, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 276;
type Pt = { x: number; y: number };
const Y = 70;
const AU = { x: 24, y: 40, w: 116, h: 60 };
const AS = { x: 186, y: 40, w: 104, h: 60 };
const CI = { x: 336, y: 24, w: 240, h: 168 };
const IN = [
  { y: 50, label: "HSM: decrypt PID", short: "HSM decrypt" },
  { y: 96, label: "record + template", short: "template" },
  { y: 142, label: "1:1 match", short: "1:1 match" },
];
const P1: Pt = { x: 140, y: Y };
const P2: Pt = { x: 186, y: Y };
const P3: Pt = { x: 290, y: Y };
const P4: Pt = { x: 336, y: Y };

/** the budget, in the lesson's order (ms) */
const SEGS = [
  { ms: 25, label: "net", lit: [0] },
  { ms: 15, label: "HSM", lit: [1] },
  { ms: 20, label: "load", lit: [1] },
  { ms: 80, label: "1:1 match", lit: [2] },
  { ms: 15, label: "sign", lit: [3] },
  { ms: 25, label: "net", lit: [3] },
  { ms: 20, label: "+20", lit: [3] },
];
const STARTS = SEGS.map((_, i) => SEGS.slice(0, i).reduce((n, s) => n + s.ms, 0));
const BX = 24;
const BW = 552;
const BY = 222;
const sx = (ms: number) => BX + (BW * ms) / 200;

type Leg = { a: number; b: number; from: Pt; to: Pt; tone: Tone; label: string };
type Frame = { ms: number; legs: Leg[]; active: number; done: number; matchTone: Tone; matchLabel?: string; answer?: string; answerTone?: Tone; fallback?: number };

function frame(variant: string, step: number, t: number): Frame {
  const no = variant === "n";
  const go = (a: number, b: number, from: Pt, to: Pt, tone: Tone, label: string): Leg => ({ a, b, from, to, tone, label });
  if (!no) {
    if (step === 0) return { ms: lerp(0, 25, t), legs: [go(0, 0.5, P1, P2, "lit", "encrypted PID block (fingerprint)"), go(0.5, 1, P3, P4, "lit", "ASA → CIDR, secure leased line")], active: -1, done: -1, matchTone: undefined };
    if (step === 1) return { ms: lerp(25, 60, t), legs: [], active: t < 0.43 ? 0 : 1, done: t < 0.43 ? -1 : 0, matchTone: undefined };
    if (step === 2) return { ms: lerp(60, 140, t), legs: [], active: 2, done: 1, matchTone: t < 1 ? "lit" : "ok", matchLabel: t < 1 ? undefined : "match: yes" };
    const ms = lerp(140, 200, t);
    return {
      ms,
      legs: [go(0.25, 0.46, P4, P3, "ok", "signed response: “y” + auth token"), go(0.46, 0.67, P2, P1, "ok", "signed response: “y” + auth token")],
      active: -1,
      done: 2,
      matchTone: "ok",
      matchLabel: "match: yes",
      answer: t >= 0.67 ? "answer: y" : undefined,
      answerTone: "ok",
    };
  }
  if (step === 0)
    return {
      ms: lerp(0, 60, t),
      legs: [go(0, 0.2, P1, P2, "lit", "encrypted PID block (worn finger)"), go(0.2, 0.42, P3, P4, "lit", "ASA → CIDR")],
      active: t < 0.42 ? -1 : t < 0.68 ? 0 : 1,
      done: t < 0.68 ? -1 : 0,
      matchTone: undefined,
    };
  if (step === 1) {
    const ms = lerp(60, 200, t);
    return {
      ms,
      legs: [go(0.7, 0.82, P4, P3, "bad", "signed response: “n” + error code"), go(0.82, 0.94, P2, P1, "bad", "signed response: “n” + error code")],
      active: ms < 140 ? 2 : -1,
      done: 1,
      matchTone: ms < 140 ? "lit" : "bad",
      matchLabel: ms < 140 ? undefined : "no match",
      answer: t >= 0.94 ? "answer: n" : undefined,
      answerTone: "bad",
    };
  }
  return { ms: 200, legs: [], active: -1, done: 1, matchTone: "bad", matchLabel: "no match", answer: "answer: n", answerTone: "bad", fallback: t };
}

const CHIPS = ["finger", "iris", "OTP", "face"];

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const msg = live[0];
  const ms = Math.round(f.ms);
  return (
    <g>
      <Box x={AU.x} y={AU.y} w={AU.w} h={AU.h} label="Bank" sub={f.answer ?? "AUA"} tone={f.answer ? f.answerTone : undefined} />
      <Box x={AS.x} y={AS.y} w={AS.w} h={AS.h} label="ASA" sub={narrow ? "link" : "leased line"} />
      <rect className="sq-cidr" x={CI.x} y={CI.y} width={CI.w} height={CI.h} />
      <Txt x={CI.x + 14} y={CI.y + 18} k="k" anchor="start">
        CIDR
      </Txt>
      <Txt x={CI.x + CI.w - 12} y={CI.y + 18} k="s" anchor="end" tone="mute">
        {narrow ? "1 template" : "1 record, not 1.4B"}
      </Txt>
      {IN.map((b, i) => (
        <Box
          key={i}
          x={CI.x + 16}
          y={b.y + 6}
          w={CI.w - 32}
          h={36}
          label={i === 2 && f.matchLabel ? f.matchLabel : narrow ? b.short : b.label}
          tone={i === 2 && f.matchTone ? f.matchTone : f.active === i ? "lit" : f.done >= i ? "ok" : undefined}
          dim={f.active < i && f.done < i && !(i === 2 && f.matchTone)}
        />
      ))}
      <Wire d={`M${P1.x} ${Y}H${P2.x}`} />
      <Wire d={`M${P3.x} ${Y}H${P4.x}`} />
      {live.map((l, i) => {
        const p = seg(t, l.a, l.b);
        return <Token key={i} x={lerp(l.from.x, l.to.x, p)} y={Y} s={11} tone={l.tone} />;
      })}
      {msg && (
        <Txt x={24} y={24} k="s" anchor="start" tone={msg.tone}>
          {msg.label}
        </Txt>
      )}
      {f.answer && (
        <Txt x={24} y={124} k="s" anchor="start" tone="mute">
          {narrow ? "y/n only, no PII" : "returns y/n + token only, no PII"}
        </Txt>
      )}
      {f.fallback !== undefined && (
        <g opacity={seg(f.fallback, 0, 0.5)}>
          <Txt x={24} y={150} k="k" anchor="start" tone="warn">
            {narrow ? "fall back" : "fall back to another mode"}
          </Txt>
          {CHIPS.map((c, i) => (
            <g key={c} opacity={seg(f.fallback ?? 1, 0.2 + i * 0.15, 0.4 + i * 0.15)}>
              <rect className="sq-chip" x={24 + i * 78} y={160} width={72} height={30} />
              <Txt x={60 + i * 78} y={180} k="s">
                {c}
              </Txt>
            </g>
          ))}
        </g>
      )}
      {/* the 200 ms budget */}
      <Txt x={BX} y={BY - 10} k="k" anchor="start" tone="mute">
        {narrow ? "200 ms budget" : "latency budget · 200 ms"}
      </Txt>
      <Txt x={BX + BW} y={BY - 8} anchor="end" tone={ms >= 200 ? (variant === "n" ? "warn" : "ok") : undefined}>
        {`${ms} ms`}
      </Txt>
      <rect className="ax-meter" x={BX} y={BY} width={BW} height={18} />
      {SEGS.map((s, i) => {
        const a = STARTS[i];
        const fill = clamp((f.ms - a) / s.ms);
        const x0 = sx(a);
        const w = sx(a + s.ms) - x0;
        const showLabel = !narrow || s.label === "1:1 match";
        return (
          <g key={i}>
            <rect className={f.ms > a && f.ms < a + s.ms ? "sq-seg lit" : "sq-seg"} x={x0} y={BY} width={w * fill} height={18} />
            {i > 0 && <line className="ax-tick" x1={x0} x2={x0} y1={BY} y2={BY + 18} />}
            {showLabel && (
              <Txt x={x0 + w / 2} y={BY + 38} k="s" tone={s.label === "1:1 match" ? "lit" : "mute"}>
                {narrow ? "match 80" : s.label}
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
  css: `.sq-cidr{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:6 5}
.sq-seg{fill:var(--ax-fg4)}.sq-seg.lit{fill:var(--ax-accent)}
.sq-chip{fill:var(--ax-box);stroke:var(--ax-amber);stroke-width:1.5}`,
  variants: [
    {
      id: "y",
      label: "Match",
      steps: [
        { caption: "The bank (AUA) encrypts the fingerprint as a PID block and sends it via the ASA to CIDR: 25 ms.", tween: 2000 },
        { caption: "CIDR's HSM decrypts the PID and checks the signature (15 ms). Then the record and stored template load (20 ms).", tween: 2200 },
        { caption: "The 1:1 match compares the capture with that one template: the largest slice, 80 ms. It matches.", tween: 2600 },
        { caption: "Signing (15 ms), the trip back (25 ms) and 20 ms overhead: 200 ms in all. Only “y” returns.", tween: 2600, ms: 3600 },
      ],
    },
    {
      id: "n",
      label: "No match",
      steps: [
        { caption: "A worn fingerprint takes the same path: PID to CIDR, decrypted, template loaded. 60 ms gone.", tween: 2800 },
        { caption: "The 1:1 match fails. CIDR still answers within the budget: just “n” and an error code, no data.", tween: 3000 },
        { caption: "No dead end: the bank retries with another finger, iris, an OTP to the registered mobile, or face.", tween: 1800, ms: 3600 },
      ],
    },
  ],
  Scene,
});
