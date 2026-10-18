/**
 * Scatter-gather over a document-sharded index (side quest 5 · Deep Dive 3, "the slowest shard
 * sets the pace"): "best pizza near me" fans out to every shard, each returns its local top-k and
 * the root merges ~10,000 candidates inside the 100 ms retrieval budget. Waiting for all lets one
 * slow shard (0.99^1000 ≈ 0.004% of queries avoid one) set the latency; a deadline plus a hedged
 * request to the slow shard's replica keeps the query on budget.
 */
import { Box, clamp, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 284;
type Pt = { x: number; y: number };
const N = 6;
const SLOW = 3; // S4
const ROWY = (i: number) => 30 + i * 40;
const CY = (i: number) => ROWY(i) + 15;
const GX = 330;
const ROOT: Pt = { x: 148, y: 92 };
const R1 = (i: number): Pt => ({ x: 342, y: CY(i) });
const R2: Pt = { x: 514, y: CY(SLOW) + 15 };
const HEDGE: Pt[] = [ROOT, { x: GX, y: CY(SLOW) }, { x: GX, y: ROWY(SLOW) + 35 }, { x: 514, y: ROWY(SLOW) + 35 }, R2];
const BX = 24;
const BL = 256;
const BY = 214;
const DEADLINE = BX + (BL * 2) / 3;

function along(pts: Pt[], p: number): Pt {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let d = clamp(p) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

type S = "idle" | "work" | "done" | "slow" | "late";
type Tok = { pts: Pt[]; p: number; tone: Tone };
type Frame = { shards: S[]; rep: "off" | "idle" | "work" | "won"; toks: Tok[]; used: number; root: string; rootT?: Tone; status: string; statusT?: Tone; msg?: string };

const out = (i: number, p: number, tone: Tone = "lit"): Tok => ({ pts: [ROOT, R1(i)], p, tone });
const back = (i: number, p: number, tone: Tone = "ok"): Tok => ({ pts: [R1(i), ROOT], p, tone });

function frame(variant: string, step: number, t: number): Frame {
  const hedge = variant === "hedge";
  const shards: S[] = Array(N).fill("idle");
  const toks: Tok[] = [];
  const f: Frame = { shards, rep: hedge ? "idle" : "off", toks, used: 0, root: "fan out", status: "" };
  const fan = (p: number) => {
    for (let i = 0; i < N; i++) {
      shards[i] = p >= 1 ? "work" : "idle";
      if (p > 0 && p < 1) toks.push(out(i, p));
    }
  };
  // which shard answers when, during step 1 (the slow one never does)
  const AT = [0.1, 0.3, 0.2, 2, 0.45, 0.25];
  const returns = (tt: number) => {
    for (let i = 0; i < N; i++) {
      if (i === SLOW) {
        shards[i] = tt > 0.5 ? "slow" : "work";
        continue;
      }
      const p = seg(tt, AT[i], AT[i] + 0.3);
      shards[i] = p >= 1 ? "done" : "work";
      if (p > 0 && p < 1) toks.push(back(i, p));
    }
  };
  if (step === 0) {
    fan(seg(t, 0, 0.7));
    f.used = lerp(0, 0.15, t);
    f.msg = "scatter: query to every shard";
    f.status = hedge ? "deadline set per shard" : "waiting for all";
  } else if (step === 1) {
    returns(t);
    f.used = lerp(0.15, 0.4, t);
    f.msg = "gather: local top-k lists";
    f.status = t > 0.5 ? "waiting on S4" : "results arriving";
    f.statusT = t > 0.5 ? "warn" : undefined;
    if (hedge && t > 0.6) {
      toks.push({ pts: HEDGE, p: seg(t, 0.6, 0.95), tone: "sky" });
      if (t >= 0.95) f.rep = "work";
      f.msg = "hedge: same request to S4's replica";
    }
  } else if (!hedge) {
    returns(1);
    const p = seg(t, 0.75, 1);
    shards[SLOW] = p >= 1 ? "late" : "slow";
    if (p > 0 && p < 1) toks.push(back(SLOW, p, "warn"));
    f.used = lerp(0.4, 1, t);
    f.msg = "still waiting on the slowest shard";
    f.status = p >= 1 ? "over budget" : "waiting on S4";
    f.statusT = p >= 1 ? "bad" : "warn";
    f.root = p >= 1 ? "late" : "waiting";
    f.rootT = p >= 1 ? "bad" : undefined;
  } else if (step === 2) {
    returns(1);
    f.rep = t >= 0.45 ? "won" : "work";
    const p = seg(t, 0, 0.45);
    if (p > 0 && p < 1) toks.push({ pts: [...HEDGE].reverse(), p, tone: "ok" });
    f.used = lerp(0.4, 0.52, t);
    f.msg = "first answer wins";
    f.status = t >= 0.45 ? "6 of 6, on budget" : "waiting on S4";
    f.statusT = t >= 0.45 ? "ok" : "warn";
  } else {
    returns(1);
    f.rep = "won";
    f.used = lerp(0.52, 0.62, t);
    f.msg = "merge top-k → scoring";
    f.root = t >= 0.5 ? "~10,000 cand." : "merging";
    f.rootT = t >= 0.5 ? "ok" : "lit";
    f.status = "merged within budget";
    f.statusT = "ok";
  }
  return f;
}

const shardTone = (s: S): Tone => (s === "done" ? "ok" : s === "work" ? "lit" : s === "slow" ? "warn" : s === "late" ? "bad" : undefined);

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const hedge = variant === "hedge";
  const got = f.shards.filter((s, i) => s === "done" || s === "late" || (i === SLOW && f.rep === "won")).length;
  const over = f.used > 2 / 3;
  return (
    <g>
      <Txt x={24} y={18} k="k" anchor="start">
        {narrow ? "1,000 shards · 6 drawn" : "1,000 document shards in parallel · 6 drawn"}
      </Txt>
      <Txt x={24} y={44} k="s" anchor="start" tone="mute">
        {narrow ? "“best pizza near me”" : "query: “best pizza near me”"}
      </Txt>
      <Box x={24} y={60} w={124} h={64} label="Root" sub={narrow && f.root === "~10,000 cand." ? "~10,000" : f.root} tone={f.rootT} />
      {Array.from({ length: N }, (_, i) => (
        <g key={i}>
          <Wire d={`M${ROOT.x} ${ROOT.y}L${GX} ${CY(i)}`} />
          <rect className="sq-row" x={GX} y={ROWY(i)} width={246} height={30} />
          <Box x={336} y={ROWY(i) + 3} w={112} h={24} label={f.shards[i] === "slow" ? "S4 slow" : f.shards[i] === "late" ? "S4 late" : `S${i + 1}`} tone={shardTone(f.shards[i])} />
          <Box
            x={458}
            y={ROWY(i) + 3}
            w={112}
            h={24}
            label="replica"
            tone={i === SLOW && f.rep === "won" ? "ok" : i === SLOW && f.rep === "work" ? "sky" : undefined}
            dim={!(i === SLOW && hedge && f.rep !== "idle")}
          />
        </g>
      ))}
      {hedge && step >= 1 && <Wire d={`M${HEDGE.map((p) => `${p.x} ${p.y}`).join("L")}`} dash tone="mute" opacity={step === 1 && t < 0.6 ? 0 : 1} />}
      {f.toks.map((k, i) => {
        const p = along(k.pts, k.p);
        return <Token key={i} x={p.x} y={p.y} s={10} tone={k.tone} />;
      })}
      {f.msg && (
        <Txt x={24} y={150} k="s" anchor="start" tone="mute">
          {narrow ? `${got} of 6 in` : f.msg}
        </Txt>
      )}
      {/* the retrieval budget */}
      <Txt x={BX} y={BY - 12} k="k" anchor="start" tone="mute">
        {narrow ? "time used" : "retrieval · 100 ms budget"}
      </Txt>
      <rect className="ax-meter" x={BX} y={BY} width={BL} height={14} />
      <rect className={over ? "sq-fill bad" : "sq-fill"} x={BX} y={BY} width={BL * clamp(f.used)} height={14} />
      <line className="sq-deadline" x1={DEADLINE} x2={DEADLINE} y1={BY - 6} y2={BY + 20} />
      <Txt x={DEADLINE} y={BY + 36} k="s" tone={over ? "bad" : "mute"}>
        {narrow ? "100 ms" : "100 ms deadline"}
      </Txt>
      <Txt x={24} y={272} k="t" anchor="start" tone={f.statusT}>
        {f.status}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sq-row{fill:none;stroke:var(--ax-line-soft);stroke-width:1}
.sq-fill{fill:var(--ax-accent)}.sq-fill.bad{fill:var(--ax-bad)}
.sq-deadline{stroke:var(--ax-fg2);stroke-width:2;stroke-dasharray:3 3}`,
  variants: [
    {
      id: "wait",
      label: "Wait for all",
      steps: [
        { caption: "“best pizza near me” fans out to every document shard in parallel; each scores only its own documents.", tween: 1800 },
        { caption: "Five shards return their local top-k quickly. Shard 4 is having one of its occasional slow moments.", tween: 2400 },
        { caption: "Waiting for all, the slowest shard sets the pace: at 1,000 shards only ~0.004% of queries avoid a slow one.", tween: 3200, ms: 3600 },
      ],
    },
    {
      id: "hedge",
      label: "Deadline + hedge",
      steps: [
        { caption: "Same fan-out, but now the query carries a deadline inside the 100 ms retrieval budget.", tween: 1800 },
        { caption: "Shard 4 hasn't answered within a few milliseconds, so the root sends a hedged request to one of its replicas.", tween: 2800 },
        { caption: "The replica answers first and wins. Had nothing come by the deadline, the root would merge what it had.", tween: 1800, ms: 3200 },
        { caption: "The root merges the local top-k lists into ~10,000 candidates and hands them to scoring, within budget.", tween: 1600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
