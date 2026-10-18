/**
 * Load balancing algorithms (week 0, part 2 · 1.2 "Load Balancing Algorithms — Detailed"): round
 * robin cycles A, B, C; weighted round robin splits 10 requests 5 / 3 / 2 by weight; least
 * connections sends the next request to the server with the fewest active connections (B, 75).
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const LB = { x: 150, y: 118, w: 128, h: 84 };
const SV = [0, 1, 2].map((i) => ({ x: 400, y: 28 + i * 96, w: 176, h: 72 }));
const NAMES = ["A", "B", "C"];
// smooth weighted round robin for weights 5, 3, 2 (A B C A A B A C B A)
const WRR = [0, 1, 2, 0, 0, 1, 0, 2, 1, 0];

type Plan = { reqs: number[]; first: number; base: number[] };

function plan(variant: string, step: number): Plan {
  if (variant === "rr") return { reqs: [0, 1, 2], first: step * 3 + 1, base: [step, step, step] };
  if (variant === "weighted") return step === 0 ? { reqs: [], first: 1, base: [0, 0, 0] } : { reqs: WRR, first: step * 10 - 9, base: step === 1 ? [0, 0, 0] : [5, 3, 2] };
  // least connections: base = active connections
  return step === 0 ? { reqs: [], first: 1, base: [150, 75, 120] } : step === 1 ? { reqs: [1], first: 1, base: [150, 75, 120] } : { reqs: [1], first: 2, base: [150, 75, 120] };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const { reqs, base } = plan(variant, step);
  const n = reqs.length;
  const win = (i: number) => {
    if (variant === "least" && step === 2) return ease(seg(t, 0.4, 0.95));
    const a = n > 1 ? (i / n) * 0.78 : 0.15;
    return ease(seg(t, a, a + (n > 1 ? 0.22 : 0.6)));
  };
  const arrived = [0, 0, 0];
  reqs.forEach((s, i) => {
    if (win(i) >= 1) arrived[s] += 1;
  });
  const least = variant === "least";
  // least connections, step 2: B's request completes first (76 → 75), then the next request picks B again
  const doneBack = least && step === 2 ? ease(seg(t, 0, 0.35)) : 0;
  const counts = least ? (step === 0 ? base : step === 1 ? [150, 75 + arrived[1], 120] : [150, 76 - (doneBack >= 1 ? 1 : 0) + arrived[1], 120]) : base.map((b, i) => b + arrived[i]);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const pending = reqs.length - reqs.filter((_, i) => win(i) > 0).length;
  const rrSlow = variant === "rr" && step === 2;
  const target = least && step >= 1 ? 1 : -1;
  const lbSub =
    variant === "rr" ? `counter = ${plan("rr", step).first - 1 + arrived.reduce((a, b) => a + b, 0)}` : variant === "weighted" ? "5 : 3 : 2" : narrow ? "fewest" : "fewest conns";
  const kicker = variant === "rr" ? (narrow ? "round robin" : "round robin · counter % len(servers)") : variant === "weighted" ? (narrow ? "weighted RR" : "weighted round robin · out of 10") : narrow ? "least connections" : "least connections · fewest active";
  const toks: { x: number; y: number; tone: Tone; label?: string }[] = [];
  reqs.forEach((s, i) => {
    const p = win(i);
    if (p <= 0 || p >= 1) return;
    const a = { x: LB.x + LB.w, y: LB.y + LB.h / 2 };
    const b = { x: SV[s].x - 8, y: SV[s].y + SV[s].h / 2 };
    toks.push({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), tone: "lit", label: variant === "rr" ? `#${plan("rr", step).first + i}` : undefined });
  });
  if (least && step === 2 && doneBack > 0 && doneBack < 1) {
    const s = SV[1];
    toks.push({ x: lerp(s.x - 8, LB.x + LB.w, doneBack), y: lerp(s.y + s.h / 2, LB.y + LB.h / 2 + 14, doneBack), tone: "ok", label: "done" });
  }
  const sub = (i: number) => {
    if (variant === "rr") {
      const got = Array.from({ length: counts[i] }, (_, k) => k * 3 + i + 1);
      return got.length ? got.join(" · ") : "–";
    }
    if (variant === "weighted") {
      const w = [5, 3, 2][i];
      const cores = [8, 4, 2][i];
      return step === 0 ? (narrow ? `w${w} · ${cores} cores` : `weight ${w} · ${cores} cores`) : `${counts[i]} req${counts[i] === 1 ? "" : "s"} · ${Math.round((counts[i] / total) * 100)}%`;
    }
    return `${counts[i]} active`;
  };
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {kicker}
      </Txt>
      {/* incoming requests waiting at the LB */}
      <Txt x={24} y={LB.y - 10} k="s" anchor="start">
        {narrow ? "in" : "incoming"}
      </Txt>
      {Array.from({ length: Math.min(pending, 10) }, (_, k) => (
        <Token key={k} x={30 + (k % 5) * 18} y={LB.y + 10 + Math.floor(k / 5) * 18} s={12} tone="mute" />
      ))}
      <Wire d={`M${24 + 96} ${LB.y + LB.h / 2}H${LB.x}`} arrow />
      <Box x={LB.x} y={LB.y} w={LB.w} h={LB.h} label={narrow ? "LB" : "Load balancer"} sub={lbSub} tone="lit" />
      {SV.map((s, i) => {
        const hot = target === i || (n > 0 && reqs.some((r, k) => r === i && win(k) > 0 && win(k) < 1));
        return <Wire key={i} d={`M${LB.x + LB.w} ${LB.y + LB.h / 2}L${s.x} ${s.y + s.h / 2}`} arrow tone={hot ? "lit" : undefined} />;
      })}
      {SV.map((s, i) => {
        const tone: Tone = rrSlow && i === 1 ? "warn" : target === i ? "lit" : undefined;
        return (
          <g key={i}>
            <Box x={s.x} y={s.y} w={s.w} h={s.h} label={`Server ${NAMES[i]}`} sub={sub(i)} tone={tone} />
            <Meter x={s.x + 10} y={s.y + s.h - 12} w={s.w - 20} h={5} value={least ? counts[i] : counts[i] / total} max={least ? 200 : 1} tone={rrSlow && i === 1 ? "warn" : least && i === 1 ? "lit" : "sky"} />
          </g>
        );
      })}
      {rrSlow && (
        <Txt x={LB.x + LB.w / 2} y={LB.y + LB.h + 26} k="s" tone="warn">
          {narrow ? "B: slow request" : "B busy with a slow request"}
        </Txt>
      )}
      {least && step >= 1 && (
        <Txt x={LB.x + LB.w / 2} y={LB.y + LB.h + 26} k="s" tone="lit">
          {narrow ? "min = B" : "min(150, 75, 120) = B"}
        </Txt>
      )}
      {variant === "weighted" && step === 2 && (
        <Txt x={LB.x + LB.w / 2} y={LB.y + LB.h + 26} k="s" tone="warn">
          {narrow ? "static weights" : "weights stay static"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "rr",
      label: "Round robin",
      steps: [
        { caption: "Round robin: request 1 goes to Server A, request 2 to B, request 3 to C.", tween: 2000, ms: 2200 },
        { caption: "Request 4 goes back to A and the cycle repeats: next = servers[counter % len(servers)].", tween: 2000, ms: 2400 },
        { caption: "It ignores current load: B is still busy with a slow request, yet request 8 goes to B anyway.", tween: 2000, ms: 3200 },
      ],
    },
    {
      id: "weighted",
      label: "Weighted",
      steps: [
        { caption: "Weighted round robin: A has weight 5 (8 cores), B weight 3 (4 cores), C weight 2 (2 cores).", tween: 600, ms: 2600 },
        { caption: "Out of 10 requests, A gets 5 (50%), B gets 3 (30%), C gets 2 (20%).", tween: 3200, ms: 2600 },
        { caption: "The next 10 split 5 / 3 / 2 again, whatever the real load: weights are static and tuned by hand.", tween: 3200, ms: 3200 },
      ],
    },
    {
      id: "least",
      label: "Least conns",
      steps: [
        { caption: "Least connections: the LB tracks active connections per server. A has 150, B 75, C 120.", tween: 600, ms: 2600 },
        { caption: "A new request goes to the server with the fewest connections, B, and B's count rises to 76.", tween: 1600, ms: 2600 },
        { caption: "B's response completes, so its count drops back to 75; the next request again picks B. Self-balancing.", tween: 2400, ms: 3200 },
      ],
    },
  ],
  Scene,
});
