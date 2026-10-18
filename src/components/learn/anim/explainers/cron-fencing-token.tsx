/**
 * Distributed cron: lock timeout vs fencing token (week 2, day 5 · 1.1 / 2.3): the 5-minute lock
 * expires under a slow job, Server 2 runs the same job and Server 1 then releases Server 2's lock;
 * with fencing tokens the deposed leader's token 1 is rejected once token 2 has been accepted.
 */
import { Box, defineExplainer, ease, lerp, seg, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;

/* ---------------------------------------------------------------- lock timeout (Gantt) */
const X0 = 120;
const X1 = 576;
const SPAN = 600; // seconds, 10:00:00 → 10:10:00
const sx = (s: number) => X0 + ((X1 - X0) * s) / SPAN;
const LANES = [
  { id: "lock", label: "Lock", y: 112 },
  { id: "s1", label: "Server 1", y: 162 },
  { id: "s2", label: "Server 2", y: 212 },
];
const BH = 26;
const AXIS = 240;
const clock = (s: number) => {
  const r = Math.round(s);
  return `10:${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};

function Bar({ lane, a, b, cur, tone, label, hatch }: { lane: number; a: number; b: number; cur: number; tone: Tone; label: string; hatch?: boolean }) {
  if (cur <= a) return null;
  const x = sx(a);
  const w = sx(Math.min(b, cur)) - x;
  const y = LANES[lane].y - BH / 2;
  return (
    <g>
      <rect className={hatch ? "cf-free" : `cf-bar ${tone || ""}`} x={x} y={y} width={w} height={BH} />
      {w > label.length * 10 + 12 && (
        <text className={hatch ? "ax-s bad" : "cf-in"} x={x + 6} y={y + BH / 2 + 4}>
          {label}
        </text>
      )}
    </g>
  );
}

function LockScene({ step, t, narrow }: SceneProps) {
  const e = ease(t);
  const cur = step === 0 ? lerp(0, 240, e) : step === 1 ? lerp(240, 420, e) : step === 2 ? lerp(420, 481, e) : lerp(481, 600, e);
  const copies = (cur > 1 && cur < 480 ? 1 : 0) + (cur > 301 ? 1 : 0);
  const ranTwice = step === 3 && t >= 1;
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start" tone="mute">
        now
      </Txt>
      <Txt x={24} y={60} k="d" anchor="start">
        {clock(cur)}
      </Txt>
      <Txt x={X1} y={24} k="k" anchor="end" tone={copies > 1 || ranTwice ? "bad" : "mute"}>
        {ranTwice ? "job ran" : "copies running"}
      </Txt>
      <Txt x={X1} y={60} k="d" anchor="end" tone={copies > 1 || ranTwice ? "bad" : undefined}>
        {ranTwice ? "twice" : String(copies)}
      </Txt>
      {/* both copies at once */}
      {cur > 301 && <rect className="cf-dup" x={sx(301)} y={LANES[1].y - BH / 2 - 6} width={sx(Math.min(cur, 480)) - sx(301)} height={LANES[2].y - LANES[1].y + BH + 12} />}
      {LANES.map((l) => (
        <g key={l.id}>
          <Txt x={24} y={l.y + 5} anchor="start" tone={l.id === "lock" ? "lit" : undefined}>
            {narrow ? l.label.replace("Server ", "S") : l.label}
          </Txt>
          <line className="cf-lane" x1={X0} x2={X1} y1={l.y} y2={l.y} />
        </g>
      ))}
      <Bar lane={0} a={0} b={300} cur={cur} tone="lit" label={narrow ? "S1" : "held by S1"} />
      <Bar lane={0} a={301} b={481} cur={cur} tone="sky" label={narrow ? "S2" : "held by S2"} />
      <Bar lane={0} a={481} b={600} cur={cur} tone="bad" label={narrow ? "free!" : "released by S1!"} hatch />
      <Bar lane={1} a={1} b={480} cur={cur} tone="lit" label={narrow ? "job" : "report job"} />
      <Bar lane={2} a={301} b={600} cur={cur} tone="sky" label={narrow ? "same job" : "SAME job"} />
      {/* the lock's expiry */}
      <line className="cf-exp" x1={sx(300)} x2={sx(300)} y1={LANES[0].y - BH / 2 - 8} y2={LANES[0].y + BH / 2 + 4} />
      <Txt x={sx(300)} y={LANES[0].y - BH / 2 - 12} k="s" tone={cur >= 300 ? "bad" : "warn"}>
        {narrow ? "expires" : "lock expires 10:05"}
      </Txt>
      {/* axis */}
      <line className="cf-axis" x1={X0} x2={X1} y1={AXIS} y2={AXIS} />
      {[0, 120, 240, 360, 480, 600].map((s, k) => (
        <g key={s}>
          <line className="cf-axis" x1={sx(s)} x2={sx(s)} y1={AXIS} y2={AXIS + 5} />
          <Txt x={sx(s)} y={AXIS + 22} k="s" anchor={k === 0 ? "start" : k === 5 ? "end" : "middle"}>
            {`10:${String(s / 60).padStart(2, "0")}`}
          </Txt>
        </g>
      ))}
      {cur <= 600 && <line className="cf-now" x1={sx(cur)} x2={sx(cur)} y1={LANES[0].y - BH / 2 - 2} y2={AXIS} />}
    </g>
  );
}

/* ---------------------------------------------------------------- fencing token */
const A = { x: 24, y: 36, w: 156, h: 64 };
const B = { x: 24, y: 190, w: 156, h: 64 };
const DB = { x: 412, y: 98, w: 164, h: 100 };
const AP = { x: A.x + A.w, y: A.y + A.h / 2 };
const BP = { x: B.x + B.w, y: B.y + B.h / 2 };
const DA = { x: DB.x, y: DB.y + 34 };
const DBB = { x: DB.x, y: DB.y + DB.h - 34 };

function Chip({ x, y, n, tone, o = 1 }: { x: number; y: number; n: number; tone: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box ${tone || ""}`} x={x - 13} y={y - 13} width={26} height={26} />
      <text className={`ax-t ${tone || ""}`} x={x} y={y + 5} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

function FenceScene({ step, t, narrow }: SceneProps) {
  const partition = step === 1 ? seg(t, 0, 0.3) : step === 2 ? 1 - seg(t, 0, 0.2) : 0;
  const bLeader = step >= 1 && (step > 1 || t > 0.3);
  const aLeads = step <= 2; // A still believes it leads until it is rejected
  const dbToken = step === 0 ? (t >= 0.6 ? 1 : 0) : step === 1 ? (t >= 0.9 ? 2 : 1) : 2;
  let chip: { x: number; y: number; n: number; tone: Tone } | null = null;
  if (step === 0 && t < 0.6) {
    const p = ease(seg(t, 0, 0.6));
    chip = { x: lerp(AP.x + 16, DA.x - 16, p), y: lerp(AP.y, DA.y, p), n: 1, tone: "lit" };
  } else if (step === 1 && t > 0.4 && t < 0.9) {
    const p = ease(seg(t, 0.4, 0.9));
    chip = { x: lerp(BP.x + 16, DBB.x - 16, p), y: lerp(BP.y, DBB.y, p), n: 2, tone: "sky" };
  } else if (step === 2 && t > 0.2 && t < 1) {
    const go = seg(t, 0.2, 0.6);
    const back = seg(t, 0.6, 0.95);
    const p = back > 0 ? 1 - ease(back) * 0.85 : ease(go);
    chip = { x: lerp(AP.x + 16, DA.x - 16, p), y: lerp(AP.y, DA.y, p), n: 1, tone: back > 0 ? "bad" : "warn" };
  }
  const rejected = (step === 2 && t >= 0.6) || step === 3;
  const accepted = (step === 0 && t >= 0.6) || (step === 1 && t >= 0.9);
  const aSub = step === 3 ? "steps down" : narrow ? "token 1" : "leader · token 1";
  const bSub = bLeader ? (narrow ? "token 2" : "leader · token 2") : "follower";
  return (
    <g>
      <Box x={A.x} y={A.y} w={A.w} h={A.h} label="Server A" sub={aSub} tone={aLeads && step < 2 ? "lit" : step === 2 ? "warn" : undefined} dim={step === 3} />
      <Box x={B.x} y={B.y} w={B.w} h={B.h} label="Server B" sub={bSub} tone={bLeader ? "lit" : undefined} />
      {partition > 0 && (
        <g opacity={partition}>
          <rect className="cf-part" x={A.x - 10} y={A.y - 12} width={A.w + 20} height={A.h + 24} />
          <Txt x={A.x + A.w + 18} y={A.y - 2} k="k" anchor="start" tone="bad">
            partition
          </Txt>
        </g>
      )}
      <Wire d={`M${AP.x} ${AP.y}L${DA.x} ${DA.y}`} arrow tone={partition > 0.5 ? "mute" : undefined} dash={partition > 0.5} />
      <Wire d={`M${BP.x} ${BP.y}L${DBB.x} ${DBB.y}`} arrow />
      <rect className={`ax-box ${rejected ? "bad" : accepted ? "ok" : ""}`} x={DB.x} y={DB.y} width={DB.w} height={DB.h} />
      <Txt x={DB.x + DB.w / 2} y={DB.y + 24}>
        Database
      </Txt>
      <Txt x={DB.x + DB.w / 2} y={DB.y + 46} k="s">
        {narrow ? "current token" : "current fencing token"}
      </Txt>
      <Txt x={DB.x + DB.w / 2} y={DB.y + 86} k="d" tone={dbToken === 2 ? "sky" : dbToken ? "lit" : "mute"}>
        {dbToken ? String(dbToken) : "–"}
      </Txt>
      {chip && <Chip {...chip} />}
      {(accepted || rejected) && (
        <Txt x={DB.x + DB.w / 2} y={DB.y + DB.h + 26} k="k" tone={rejected ? "bad" : "ok"}>
          {rejected ? "rejected · 1 < 2" : `token ${dbToken} accepted`}
        </Txt>
      )}
      {!narrow && (
        <Txt x={DB.x + DB.w / 2} y={DB.y - 14} k="s">
          older tokens rejected
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.cf-lane{stroke:var(--ax-line-soft);stroke-width:1.5}
.cf-axis{stroke:var(--ax-line);stroke-width:1.5}
.cf-now{stroke:var(--ax-fg);stroke-width:1.5}
.cf-exp{stroke:var(--ax-amber);stroke-width:2;stroke-dasharray:4 3}
.cf-dup{fill:none;stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:4 4}
.cf-free{fill:none;stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:5 4}
.cf-bar{stroke-width:1.5;fill-opacity:.22}.cf-bar.lit{fill:var(--ax-accent);stroke:var(--ax-accent)}.cf-bar.sky{fill:var(--ax-sky);stroke:var(--ax-sky)}
.cf-in{font:600 12px var(--ax-mono);letter-spacing:.04em;fill:var(--ax-fg)}
.ax-d.sky{fill:var(--ax-sky)}
.cf-part{fill:none;stroke:var(--ax-bad);stroke-width:2;stroke-dasharray:6 5}
@container ax (max-width:520px){.cf-in{font-size:16px}}
`,
  variants: [
    {
      id: "lock",
      label: "Lock timeout",
      steps: [
        { caption: "10:00: Server 1 takes the lock, which expires at 10:05, and starts a slow report job.", tween: 2600 },
        { caption: "10:05: the lock expires while the job is still running. Server 2 acquires it and starts the SAME job.", tween: 2600, ms: 3200 },
        { caption: "10:08: Server 1 finishes and releases the lock, but it's Server 2's lock now.", tween: 1600 },
        { caption: "10:10: Server 2 finishes. The job ran twice, and the lock state is corrupted.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "fence",
      label: "Fencing token",
      steps: [
        { caption: "Server A becomes leader with token 1. Its job run carries token=1, and the database accepts it.", tween: 1800 },
        { caption: "A network partition cuts A off. Server B becomes leader with token 2; the database accepts token 2.", tween: 2600 },
        { caption: "The partition heals. A, still thinking it leads, runs the job with token 1: rejected, 1 < 2.", tween: 2400, ms: 3200 },
        { caption: "Server A realizes it's no longer leader and steps down. Each new leader gets a higher token.", ms: 3400 },
      ],
    },
  ],
  Scene: (p) => (p.variant === "fence" ? <FenceScene {...p} /> : <LockScene {...p} />),
});
