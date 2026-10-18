/**
 * Canary deployment (week 6, day 5 · 4.1): the API's DEPLOYMENT_CONFIG sends 10% of traffic to
 * the new version for 15 minutes; success needs error rate < 1% and p99 < 500 ms. Pass: full
 * rollout, then 30 minutes of watching. Fail: rollback_on_failure sends everything back.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const LB = { x: 24, y: 120, w: 104, h: 64 };
const OLD = { x: 168, y: 44, w: 146, h: 64 };
const NEW = { x: 168, y: 196, w: 146, h: 64 };
const MX = 346; // metrics panel
const MW = 230;
const CX = 148; // wire curve control x

function Gauge({ y, label, limit, value, bad, narrow }: { y: number; label: string; limit: string; value: number; bad: boolean; narrow: boolean }) {
  // value: 0 → 1 of the bar; the limit sits at 60%
  const lim = MX + 12 + (MW - 24) * 0.6;
  const tone: Tone = bad ? "bad" : value > 0 ? "ok" : undefined;
  return (
    <g>
      <Txt x={MX + 12} y={y} k="s" anchor="start">
        {label}
      </Txt>
      <Txt x={MX + MW - 12} y={y} k="s" anchor="end" tone={tone}>
        {value <= 0 ? "" : bad ? (narrow ? "over" : `over ${limit}`) : narrow ? "ok" : `under ${limit}`}
      </Txt>
      <rect x={MX + 12} y={y + 8} width={MW - 24} height={14} className="ax-meter" />
      <rect x={MX + 12} y={y + 8} width={(MW - 24) * Math.min(1, value)} height={14} className={`ax-fill ${bad ? "bad" : "ok"}`} />
      <line x1={lim} x2={lim} y1={y + 2} y2={y + 28} className="cd-lim" />
      <Txt x={lim} y={y + 42} k="s" tone="mute">
        {limit}
      </Txt>
    </g>
  );
}

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const bad = variant === "bad";
  // share of traffic on the new version
  const share = step === 0 ? lerp(0, 0.1, t) : step === 1 ? 0.1 : bad ? lerp(0.1, 0, seg(t, 0, 0.6)) : lerp(0.1, 1, seg(t, 0, 0.8));
  const timer = step === 1 ? t : step > 1 ? 1 : 0;
  const err = step === 0 ? 0 : step === 1 ? (bad ? lerp(0.15, 0.9, t) : lerp(0.1, 0.25, t)) : bad ? 0.9 : 0.25;
  const p99 = step === 0 ? 0 : step === 1 ? (bad ? lerp(0.2, 0.5, t) : lerp(0.2, 0.35, t)) : bad ? 0.5 : 0.35;
  const errBad = bad && err > 0.6;
  const verdict = step === 2 ? (bad ? "rolled back" : "full rollout") : step === 1 && t >= 1 ? (bad ? "criteria fail" : "criteria pass") : "";
  const vTone: Tone = bad ? "bad" : "ok";
  const oldPct = Math.round((1 - share) * 100);
  const newPct = Math.round(share * 100);
  const flow = (k: number, n: number) => (clock * 0.7 + k / n) % 1;
  const lbR = { x: LB.x + LB.w, y: LB.y + LB.h / 2 };
  const toOld = `M${lbR.x} ${lbR.y}C${CX} ${lbR.y} ${CX} ${OLD.y + 32} ${OLD.x} ${OLD.y + 32}`;
  const toNew = `M${lbR.x} ${lbR.y}C${CX} ${lbR.y} ${CX} ${NEW.y + 32} ${NEW.x} ${NEW.y + 32}`;
  const bez = (y1: number, p: number) => {
    const u = 1 - p;
    return { x: u * u * u * lbR.x + 3 * u * u * p * CX + 3 * u * p * p * CX + p * p * p * OLD.x, y: u * u * u * lbR.y + 3 * u * u * p * lbR.y + 3 * u * p * p * y1 + p * p * p * y1 };
  };
  const nOld = oldPct > 50 ? 4 : oldPct > 0 ? 1 : 0;
  const nNew = newPct > 50 ? 4 : newPct > 0 ? 1 : 0;
  return (
    <g>
      <Box x={LB.x} y={LB.y} w={LB.w} h={LB.h} label="API" sub={narrow ? undefined : "traffic"} />
      <Wire d={toOld} arrow tone={oldPct > 0 ? undefined : "mute"} />
      <Wire d={toNew} arrow tone={newPct > 0 ? "lit" : "mute"} />
      {Array.from({ length: nOld }, (_, k) => {
        const p = bez(OLD.y + 32, flow(k, nOld));
        return <Token key={`o${k}`} x={p.x} y={p.y} s={7} tone="mute" />;
      })}
      {Array.from({ length: nNew }, (_, k) => {
        const p = bez(NEW.y + 32, flow(k, nNew));
        return <Token key={`n${k}`} x={p.x} y={p.y} s={7} tone={errBad && step === 1 ? "bad" : "lit"} />;
      })}
      <Box x={OLD.x} y={OLD.y} w={OLD.w} h={OLD.h} label="current" sub={`${oldPct}%`} dim={oldPct === 0} />
      <Box x={NEW.x} y={NEW.y} w={NEW.w} h={NEW.h} label={newPct >= 100 ? "new (all)" : narrow ? "canary" : "new · canary"} sub={`${newPct}%`} tone={step === 2 ? vTone : errBad ? "bad" : newPct > 0 ? "lit" : undefined} dim={step === 2 && bad && share === 0} />
      {/* the canary's checks */}
      <rect x={MX} y={24} width={MW} height={272} className={`ax-box${verdict ? ` ${vTone}` : ""}`} />
      <Txt x={MX + 12} y={48} k="k" anchor="start" tone={verdict ? vTone : undefined}>
        canary checks
      </Txt>
      <Gauge y={80} label="error rate" limit="1%" value={err} bad={errBad} narrow={narrow} />
      <Gauge y={150} label="p99 latency" limit="500 ms" value={p99} bad={false} narrow={narrow} />
      <Txt x={MX + 12} y={232} k="s" anchor="start">
        watch
      </Txt>
      <Txt x={MX + MW - 12} y={232} k="s" anchor="end" tone={timer >= 1 ? undefined : "lit"}>
        {`${Math.round(timer * 15)} / 15 min`}
      </Txt>
      <rect x={MX + 12} y={240} width={MW - 24} height={8} className="ax-meter" />
      <rect x={MX + 12} y={240} width={(MW - 24) * timer} height={8} className="ax-fill" />
      <Txt x={MX + MW / 2} y={280} k="t" tone={vTone}>
        {verdict}
      </Txt>
      {step === 2 && !bad && (
        <Txt x={LB.x} y={304} k="s" anchor="start" tone="ok">
          {narrow ? "then watch 30 min" : "then verify metrics for 30 min"}
        </Txt>
      )}
      {step === 2 && bad && (
        <Txt x={LB.x} y={304} k="s" anchor="start" tone="bad">
          {narrow ? "only 10% exposed" : "only 10% of traffic exposed"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cd-lim{stroke:var(--ax-fg2);stroke-width:2;stroke-dasharray:3 3}`,
  variants: [
    {
      id: "good",
      label: "Healthy canary",
      steps: [
        { caption: "Canary: the new API version gets 10% of traffic; 90% stays on the current version.", tween: 1600, loop: true },
        { caption: "For 15 minutes the canary is checked: error rate under 1%, p99 latency under 500 ms.", tween: 3200, ms: 2200, loop: true },
        { caption: "Both pass, so the new version rolls out to 100%; then metrics are watched for 30 minutes.", tween: 2000, ms: 3400, loop: true },
      ],
    },
    {
      id: "bad",
      label: "Bad canary",
      steps: [
        { caption: "Same start: the new API version takes 10% of traffic.", tween: 1600, loop: true },
        { caption: "Inside the 15-minute window, the canary's error rate climbs past 1%: the success criteria fail.", tween: 3200, ms: 2200, loop: true },
        { caption: "rollback_on_failure: all traffic returns to the current version. Only 10% ever saw the bad build.", tween: 2000, ms: 3400, loop: true },
      ],
    },
  ],
  Scene,
});
