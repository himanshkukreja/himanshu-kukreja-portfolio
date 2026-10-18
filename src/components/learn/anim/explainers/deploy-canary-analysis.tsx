/**
 * Canary deployment with automated analysis (week 10, day 3 · 3.1 / 3.2): the lesson's stages
 * (1% → 10% → 50% → 100%, 15 minutes each, pods 10+1, 9+1, 5+5, 10) and its analysis thresholds
 * (canary error rate at most +1 point over stable, p99 at most +10%). A failed analysis sets the
 * canary weight to 0 and deletes the canary pods. The per-stage metric readings are illustrative.
 */
import { defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const LB = { x: 20, y: 120, w: 96, h: 60 };
const POD = 22;
const GAP = 4;
const PX = 158;
const SY = 94; // stable row
const CY = 208; // canary row
const PANEL = { x: 440, y: 76, w: 136, h: 186 };

type Stage = { pct: number; stable: number; canary: number; err: string; p99: string; verdict: string; tone: Tone };
const PROMOTE: Stage[] = [
  { pct: 1, stable: 10, canary: 1, err: "+0.1 pt", p99: "+3%", verdict: "PASS", tone: "ok" },
  { pct: 10, stable: 9, canary: 1, err: "+0.1 pt", p99: "+2%", verdict: "PASS", tone: "ok" },
  { pct: 50, stable: 5, canary: 5, err: "+0.0 pt", p99: "+4%", verdict: "PASS", tone: "ok" },
  { pct: 100, stable: 10, canary: 0, err: "", p99: "", verdict: "PROMOTED", tone: "ok" },
];
const ROLLBACK: Stage[] = [
  { pct: 1, stable: 10, canary: 1, err: "+0.1 pt", p99: "+3%", verdict: "PASS", tone: "ok" },
  { pct: 10, stable: 9, canary: 1, err: "+1.6 pt", p99: "+6%", verdict: "FAIL", tone: "bad" },
  { pct: 0, stable: 9, canary: 0, err: "+1.6 pt", p99: "+6%", verdict: "ROLLED BACK", tone: "bad" },
];
const CHIPS = ["1%", "10%", "50%", "100%"];

function Scene({ variant, step, t, clock, narrow, reduced }: SceneProps) {
  const rb = variant === "rollback";
  const stages = rb ? ROLLBACK : PROMOTE;
  const st = stages[Math.min(step, stages.length - 1)];
  const prev = stages[Math.max(0, step - 1)];
  const shift = step === 0 ? ease(seg(t, 0, 0.5)) : ease(seg(t, 0, 0.6));
  const pct = step === 0 ? lerp(0, st.pct, shift) : lerp(prev.pct, st.pct, shift);
  const verdictOn = seg(t, 0.6, 1) > 0 || reduced;
  const chipAt = rb && step === 2 ? 1 : step; // which stage chip is current
  const allV11 = !rb && step === 3 && shift >= 1;
  const canaryBad = rb && step >= 1;
  // share routed to the canary row; once promoted, v1.1 *is* the stable row
  const canaryShare = allV11 ? 0 : pct;
  // pods: fade between the previous and current counts
  const stableN = Math.round(lerp(prev.stable, st.stable, shift));
  const canaryN = step === 0 ? st.canary : prev.canary > st.canary ? (shift < 1 ? prev.canary : st.canary) : Math.round(lerp(prev.canary, st.canary, shift));
  const canaryFade = prev.canary > st.canary && step > 0 ? 1 - shift : 1;
  // flowing requests: deterministic route per (cycle, slot)
  const toks: { x: number; y: number; tone: Tone }[] = [];
  const N = 8;
  for (let k = 0; k < N; k++) {
    const u = clock * 0.7 + k / N;
    const p = u % 1;
    const id = Math.floor(u) * N + k;
    const canary = (id * 61) % 100 < canaryShare;
    const ty = canary ? CY + POD / 2 : SY + POD / 2;
    const tone: Tone = canary ? (canaryBad && id % 3 === 0 ? "bad" : allV11 ? "ok" : "lit") : allV11 ? "ok" : "sky";
    if (!reduced && clock > 0) toks.push({ x: lerp(LB.x + LB.w, PX - 6, p), y: lerp(LB.y + LB.h / 2, ty, p), tone });
  }
  const ver = allV11 ? "v1.1" : "v1.0";
  const stableLabel = narrow ? `STABLE ${ver}` : `STABLE ${ver} · ${stableN} pods`;
  const canaryLabel = narrow ? "CANARY v1.1" : `CANARY v1.1 · ${canaryN} pod${canaryN === 1 ? "" : "s"}`;
  return (
    <g>
      {/* stages */}
      {CHIPS.map((c, i) => {
        const x = 20 + i * 104;
        const on = i === chipAt;
        const done = i < chipAt || (allV11 && i === 3);
        const tone: Tone = on ? (rb && step >= 1 ? "bad" : "lit") : done ? "ok" : undefined;
        return (
          <g key={c}>
            <rect x={x} y={14} width={84} height={32} className={`ax-box${tone ? ` ${tone}` : ""}`} opacity={on || done ? 1 : 0.5} />
            <Txt x={x + 42} y={35} tone={tone || "mute"}>
              {c}
            </Txt>
            {i < 3 && <Wire d={`M${x + 86} 30H${x + 102}`} tone={done ? "ok" : undefined} />}
          </g>
        );
      })}
      {!narrow && (
        <Txt x={PANEL.x + PANEL.w} y={35} k="s" anchor="end">
          15 min each
        </Txt>
      )}
      {/* load balancer and routes */}
      <rect x={LB.x} y={LB.y} width={LB.w} height={LB.h} className="ax-box" />
      <Txt x={LB.x + LB.w / 2} y={LB.y + 36}>
        LB
      </Txt>
      <Wire d={`M${LB.x + LB.w} ${LB.y + LB.h / 2}L${PX - 6} ${SY + POD / 2}`} tone={allV11 ? "ok" : undefined} />
      <Wire d={`M${LB.x + LB.w} ${LB.y + LB.h / 2}L${PX - 6} ${CY + POD / 2}`} tone={canaryShare > 0 ? (canaryBad ? "bad" : "lit") : "mute"} />
      <Txt x={LB.x + LB.w / 2} y={LB.y - 12} k="t" tone={allV11 ? "ok" : "sky"}>
        {`${Math.round(100 - canaryShare)}%`}
      </Txt>
      <Txt x={LB.x + LB.w / 2} y={LB.y + LB.h + 26} k="t" tone={canaryShare > 0 ? (canaryBad ? "bad" : "lit") : "mute"}>
        {`${canaryShare < 1 && canaryShare > 0 ? canaryShare.toFixed(1) : Math.round(canaryShare)}%`}
      </Txt>
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={8} tone={k.tone} />
      ))}
      {/* pods */}
      <Txt x={PX} y={SY - 12} k="k" anchor="start" tone={allV11 ? "ok" : "mute"}>
        {stableLabel}
      </Txt>
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={PX + i * (POD + GAP)} y={SY} width={POD} height={POD} className={`cn-pod ${i < stableN ? (allV11 ? "v11" : "v10") : "off"}`} />
      ))}
      <Txt x={PX} y={CY - 12} k="k" anchor="start" tone={allV11 ? "mute" : canaryBad ? "bad" : undefined}>
        {allV11 ? (narrow ? "promoted" : "canary promoted to stable") : rb && step === 2 && shift >= 1 ? (narrow ? "deleted" : "canary pods deleted") : canaryLabel}
      </Txt>
      {Array.from({ length: 5 }, (_, i) => (
        <rect
          key={i}
          x={PX + i * (POD + GAP)}
          y={CY}
          width={POD}
          height={POD}
          opacity={i < canaryN ? canaryFade : 1}
          className={`cn-pod ${i < canaryN && !allV11 ? (canaryBad ? "bad" : "can") : "off"}`}
        />
      ))}
      {/* analysis */}
      <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} className={`ax-box${verdictOn && st.tone === "bad" ? " bad" : ""}`} />
      <Txt x={PANEL.x + 10} y={PANEL.y + 22} k="k" anchor="start">
        {narrow ? "vs stable" : "canary vs stable"}
      </Txt>
      {st.err ? (
        <g>
          <Txt x={PANEL.x + 10} y={PANEL.y + 46} k="s" anchor="start">
            errors
          </Txt>
          <Txt x={PANEL.x + 10} y={PANEL.y + 68} k="t" anchor="start" tone={canaryBad ? "bad" : undefined}>
            {st.err}
          </Txt>
          <Txt x={PANEL.x + PANEL.w - 10} y={PANEL.y + 46} k="s" anchor="end">
            {"≤ +1"}
          </Txt>
          <Txt x={PANEL.x + 10} y={PANEL.y + 96} k="s" anchor="start">
            p99
          </Txt>
          <Txt x={PANEL.x + 10} y={PANEL.y + 118} k="t" anchor="start">
            {st.p99}
          </Txt>
          <Txt x={PANEL.x + PANEL.w - 10} y={PANEL.y + 96} k="s" anchor="end">
            {"≤ +10%"}
          </Txt>
        </g>
      ) : (
        <Txt x={PANEL.x + 10} y={PANEL.y + 68} k="s" anchor="start">
          {narrow ? "all on v1.1" : "100% on v1.1"}
        </Txt>
      )}
      <Txt x={PANEL.x + 10} y={PANEL.y + 164} k="t" anchor="start" tone={verdictOn ? st.tone : "mute"}>
        {verdictOn ? (narrow && st.verdict === "ROLLED BACK" ? "ROLLBACK" : st.verdict) : "watching…"}
      </Txt>
      {/* traffic split */}
      <rect x={20} y={290} width={W - 40} height={14} className="cn-bar" />
      <rect x={20 + (W - 40) * (1 - pct / 100)} y={290} width={((W - 40) * pct) / 100} height={14} className={`cn-fill${canaryBad ? " bad" : allV11 ? " ok" : ""}`} />
      <Txt x={20} y={282} k="s" anchor="start">
        {narrow ? "traffic" : "traffic split"}
      </Txt>
      <Txt x={W - 20} y={282} k="s" anchor="end" tone={pct > 0 ? (canaryBad ? "bad" : allV11 ? "ok" : "lit") : undefined}>
        {`v1.1 ${pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.cn-pod{stroke-width:1.5}
.cn-pod.v10{fill:var(--ax-box);stroke:var(--ax-sky)}
.cn-pod.v11{fill:var(--ax-box);stroke:var(--ax-ok)}
.cn-pod.can{fill:var(--ax-accent);stroke:var(--ax-accent)}
.cn-pod.bad{fill:var(--ax-bad);stroke:var(--ax-bad)}
.cn-pod.off{fill:none;stroke:var(--ax-line-soft);stroke-dasharray:3 4}
.cn-bar{fill:var(--ax-sky);opacity:.35}
.cn-fill{fill:var(--ax-accent)}.cn-fill.bad{fill:var(--ax-bad)}.cn-fill.ok{fill:var(--ax-ok)}
`,
  variants: [
    {
      id: "promote",
      label: "Healthy canary",
      steps: [
        { caption: "Stage 1: one v1.1 canary pod gets 1% of traffic. For 15 minutes, its errors and p99 are compared with stable.", tween: 2000, ms: 2400, loop: true },
        { caption: "Errors within +1 point and p99 within +10% of stable: pass. Expand to 10% for another 15 minutes.", tween: 2000, ms: 2400, loop: true },
        { caption: "Stage 3: half the traffic, five pods of each version, still compared side by side.", tween: 2000, ms: 2400, loop: true },
        { caption: "Stage 4: v1.1 takes 100% and is promoted to the new stable version, ten pods.", tween: 2000, ms: 3000, loop: true },
      ],
    },
    {
      id: "rollback",
      label: "Bad canary",
      steps: [
        { caption: "Stage 1 at 1%: the canary's errors and p99 latency match stable, so analysis passes.", tween: 2000, ms: 2400, loop: true },
        { caption: "Stage 2 at 10%: canary errors rise 1.6 points above stable, past the 1-point limit. Analysis fails.", tween: 2000, ms: 2800, loop: true },
        { caption: "Automatic rollback: canary weight set to 0, canary pods deleted. Only canary traffic, at most 10%, saw v1.1.", tween: 2000, ms: 3200, loop: true },
      ],
    },
  ],
  Scene,
});
