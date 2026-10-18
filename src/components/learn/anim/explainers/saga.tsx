/**
 * Saga with compensations (week 5, day 2 · 2.1 / 2.2 / 4.1): the lesson's order saga, T1 Reserve
 * inventory, T2 Create payment, T3 Ship (the pivot), T4 Send confirmation. Before the pivot a
 * failure compensates backwards; after it the saga retries forward.
 */
import { Box, defineExplainer, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 644;
const H = 344;
const X = [24, 176, 328, 480];
const BW = 140;
const TY = 92;
const CY = 214;
const T = [
  { id: "T1", name: "Reserve inventory", short: "Reserve", c: "C1", cn: "Release inventory", cs: "Release" },
  { id: "T2", name: "Create payment", short: "Payment", c: "C2", cn: "Refund payment", cs: "Refund" },
  { id: "T3", name: "Ship order", short: "Ship", c: "no C3", cn: "can't unship", cs: "none" },
  { id: "T4", name: "Send confirmation", short: "Confirm", c: "no C4", cn: "just a notice", cs: "none" },
];

type S = "idle" | "run" | "ok" | "fail" | "retry";
type Frame = { ts: S[]; cs: ("idle" | "run" | "ok")[]; at: number; dir: "f" | "b" | null; verdict?: { text: string; tone: Tone } };

function frame(variant: string, step: number, t: number): Frame {
  const f: Frame = { ts: ["idle", "idle", "idle", "idle"], cs: ["idle", "idle", "idle", "idle"], at: -1, dir: null };
  const done = (n: number) => {
    for (let i = 0; i < n; i++) f.ts[i] = "ok";
  };
  if (variant === "happy") {
    done(step);
    if (step < 4) {
      f.ts[step] = t < 1 ? "run" : "ok";
      f.at = step;
      f.dir = "f";
    }
    if (step >= 4) f.verdict = { text: "saga complete", tone: "ok" };
    return f;
  }
  if (variant === "back") {
    if (step <= 1) {
      done(step);
      f.ts[step] = t < 1 ? "run" : "ok";
      f.at = step;
      f.dir = "f";
      return f;
    }
    done(2);
    f.ts[2] = step === 2 && t < 0.6 ? "run" : "fail";
    if (step === 2) [f.at, f.dir] = [2, "f"];
    if (step >= 3) f.cs[1] = step === 3 && t < 1 ? "run" : "ok";
    if (step === 3) [f.at, f.dir] = [1, "b"];
    if (step >= 4) f.cs[0] = step === 4 && t < 1 ? "run" : "ok";
    if (step === 4) [f.at, f.dir] = [0, "b"];
    if (step >= 5) f.verdict = { text: "order cancelled · nothing charged", tone: "warn" };
    return f;
  }
  // forward recovery after the pivot
  if (step === 0) {
    done(1);
    f.ts[1] = t < 1 ? "run" : "ok";
    [f.at, f.dir] = [1, "f"];
    return f;
  }
  done(2);
  if (step === 1) {
    f.ts[2] = t < 1 ? "run" : "ok";
    [f.at, f.dir] = [2, "f"];
    return f;
  }
  f.ts[2] = "ok";
  if (step === 2) {
    f.ts[3] = t < 0.6 ? "run" : "fail";
    [f.at, f.dir] = [3, "f"];
  }
  if (step === 3) {
    f.ts[3] = seg(t, 0, 1) < 1 ? "retry" : "ok";
    [f.at, f.dir] = [3, "f"];
  }
  if (step >= 4) {
    f.ts[3] = "ok";
    f.verdict = { text: "saga complete (eventually)", tone: "ok" };
  }
  return f;
}

const toneOf = (s: S | "idle" | "run" | "ok"): Tone => (s === "ok" ? "ok" : s === "fail" ? "bad" : s === "run" ? "lit" : s === "retry" ? "warn" : undefined);

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const label = (s: S) => (s === "ok" ? "committed ✓" : s === "fail" ? "failed ✗" : s === "run" ? "running…" : s === "retry" ? "retrying…" : "");
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "local transactions" : "each step: one local transaction in one service"}
      </Txt>
      {/* the pivot */}
      <rect x={X[2] - 8} y={TY - 30} width={BW + 16} height={CY - TY + 92} className="sg-pivot" />
      <Txt x={X[2] + BW / 2} y={TY - 38} k="k" tone="lit">
        pivot
      </Txt>
      <Txt x={X[1] + BW + 8} y={CY + 84} k="s" anchor="end" tone={f.dir === "b" ? "warn" : "mute"}>
        {narrow ? "← compensate" : "before pivot: compensate ←"}
      </Txt>
      <Txt x={X[3]} y={CY + 84} k="s" anchor="start" tone={variant === "forward" && step >= 2 ? "warn" : "mute"}>
        {narrow ? "retry →" : "after pivot: retry →"}
      </Txt>
      {T.map((s, i) => {
        const st = f.ts[i];
        const cs = f.cs[i];
        const none = i >= 2;
        return (
          <g key={s.id}>
            <Box x={X[i]} y={TY} w={BW} h={66} label={s.id} sub={narrow ? s.short : s.name} tone={toneOf(st)} />
            <Txt x={X[i] + BW / 2 + 8} y={TY + 92} k="s" tone={toneOf(st)}>
              {label(st)}
            </Txt>
            {i < 3 && <Wire d={`M${X[i] + BW} ${TY + 33}H${X[i + 1]}`} arrow tone={f.ts[i + 1] !== "idle" ? "ok" : undefined} />}
            <Box x={X[i]} y={CY} w={BW} h={56} label={s.c} sub={narrow ? s.cs : s.cn} tone={toneOf(cs)} dim={none || cs === "idle"} />
            <Wire d={`M${X[i] + 12} ${TY + 66}V${CY}`} dash tone={cs !== "idle" ? "warn" : "mute"} />
          </g>
        );
      })}
      {f.at >= 0 && (
        <Token
          x={X[f.at] + BW - 14}
          y={(f.dir === "b" ? CY : TY) + 14}
          s={12}
          tone={f.dir === "b" ? "warn" : f.ts[f.at] === "fail" ? "bad" : f.ts[f.at] === "retry" ? "warn" : "lit"}
          opacity={t < 1 || f.ts[f.at] === "fail" ? 1 : 0}
        />
      )}
      {f.verdict && (
        <Txt x={W / 2} y={H - 10} k="k" tone={f.verdict.tone}>
          {f.verdict.text}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sg-pivot{fill:none;stroke:var(--ax-accent);stroke-width:1.5;stroke-dasharray:6 5;opacity:.75}`,
  variants: [
    {
      id: "happy",
      label: "Happy path",
      steps: [
        { caption: "T1: the inventory service reserves the stock in its own local transaction.", tween: 1000, ms: 1600 },
        { caption: "T2: the payment service creates the payment and charges the card.", tween: 1000, ms: 1600 },
        { caption: "T3: ship the order. This is the pivot: once it commits, the saga is committed to finishing.", tween: 1000, ms: 2600 },
        { caption: "T4: send the confirmation.", tween: 1000, ms: 1600 },
        { caption: "Every local transaction committed: the saga is complete, with no distributed lock or two-phase commit anywhere.", ms: 3200 },
      ],
    },
    {
      id: "back",
      label: "Fails before pivot",
      steps: [
        { caption: "T1 reserves the stock and commits.", tween: 1000, ms: 1600 },
        { caption: "T2 creates the payment and commits: the customer is charged.", tween: 1000, ms: 1800 },
        { caption: "T3, shipping, fails. The pivot was never reached, so the saga recovers backwards.", tween: 1400, ms: 2600 },
        { caption: "C2 refunds the payment: a NEW transaction that reverses the charge. The original charge stays in the history.", tween: 1400, ms: 3000 },
        { caption: "C1 releases the stock. Compensations run in reverse order, and each is idempotent so a retry can't refund twice.", tween: 1400, ms: 3000 },
        { caption: "The saga ends with the order cancelled: nothing charged, nothing reserved, and the audit trail shows every step.", ms: 3400 },
      ],
    },
    {
      id: "forward",
      label: "Fails after pivot",
      steps: [
        { caption: "T1 and T2 commit: stock reserved, payment taken.", tween: 1000, ms: 1600 },
        { caption: "T3 ships the order. The pivot has committed: there is no undo for shipping.", tween: 1000, ms: 2400 },
        { caption: "T4, the confirmation, fails.", tween: 1200, ms: 2200 },
        { caption: "After the pivot there is nothing to compensate: forward recovery retries T4 (it is idempotent) until it succeeds.", tween: 2200, ms: 2600 },
        { caption: "The saga completes, eventually consistent. Before the pivot: compensate; after it: retry until done.", ms: 3400 },
      ],
    },
  ],
  Scene,
});
