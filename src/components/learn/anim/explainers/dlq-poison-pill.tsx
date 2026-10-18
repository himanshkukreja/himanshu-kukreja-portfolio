/**
 * Poison pill vs dead letter queue (week 3, day 4 · preface / 1.3 / 2.1 / 4.2): message #4,521,892
 * ("items" is a string) crash-loops the consumer while 50,000 messages wait behind it; with a DLQ
 * the ValueError is caught, retried up to 3 times, quarantined in orders.dlq and later replayed.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;
const QY = 120;
const Q = { x: 20, y: QY - 22, w: 290, h: 44 };
const CON = { x: 340, y: QY - 30, w: 120, h: 60 };
const DONE = { x: 496, y: QY - 30, w: 80, h: 60 };
const DLQ = { x: 340, y: 204, w: 120, h: 56 };
const HEAD = { x: Q.x + Q.w - 20, y: QY };
const IN = { x: CON.x - 10, y: QY };
const N = 9;
const GAP = 28;

type Pt = { x: number; y: number };
/** position along a polyline, equal time per leg */
function along(pts: Pt[], p: number): Pt {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, p * n));
  const i = Math.floor(f);
  const q = f - i;
  return { x: lerp(pts[i].x, pts[i + 1].x, q), y: lerp(pts[i].y, pts[i + 1].y, q) };
}

function Scene({ variant, step, t, clock, narrow, reduced }: SceneProps) {
  const dlq = variant === "dlq";
  let pill: (Pt & { tone: Tone }) | null = null;
  let conTone: Tone = undefined;
  let conSub = "orders";
  let err = "";
  let stuck = 0;
  let dlqCount = 0;
  let flowing = false;
  let replay = false;
  let attempts = 0;
  if (!dlq) {
    if (step === 0) {
      const p = ease(seg(t, 0, 0.5));
      pill = { ...along([HEAD, IN], p), tone: "bad" };
      if (t >= 0.5) {
        conTone = "bad";
        conSub = "crashed";
        err = "invalid items";
      }
    } else {
      // crash loop: restart, fetch the same message, crash again
      const c = reduced ? 0.9 : (clock * 0.6) % 1;
      const p = c < 0.35 ? 1 - ease(c / 0.35) : c < 0.5 ? 0 : ease((c - 0.5) / 0.35);
      pill = { ...along([HEAD, IN], Math.min(1, p)), tone: "bad" };
      const crashed = c >= 0.85 || c < 0.05;
      conTone = crashed ? "bad" : "warn";
      conSub = crashed ? "crashed" : "restarting";
      err = "same message";
      if (step === 2) stuck = Math.round(50000 * ease(t));
    }
  } else {
    if (step === 0) {
      pill = { ...along([HEAD, IN], ease(seg(t, 0, 0.45))), tone: "bad" };
      attempts = t >= 0.45 ? 1 : 0;
    } else if (step === 1) {
      // two more tries: out and back in, each fails the same way
      const k = t < 0.5 ? 0 : 1;
      const q = (t - k * 0.5) / 0.5;
      const p = q < 0.4 ? 1 - ease(q / 0.4) * 0.6 : q < 0.8 ? 0.4 + ease((q - 0.4) / 0.4) * 0.6 : 1;
      pill = { ...along([HEAD, IN], t >= 1 ? 1 : p), tone: "bad" };
      attempts = t >= 1 ? 3 : q >= 0.8 ? 2 + k : 1 + k;
    } else if (step === 2) {
      const p = ease(seg(t, 0, 0.45));
      if (p < 1) pill = { ...along([IN, { x: CON.x + CON.w / 2, y: CON.y + CON.h + 8 }, { x: CON.x + CON.w / 2, y: DLQ.y + DLQ.h / 2 }], p), tone: "bad" };
      dlqCount = p >= 1 ? 1 : 0;
      attempts = 3;
      flowing = t >= 0.5;
    } else {
      const p = ease(seg(t, 0, 0.9));
      const path = [{ x: DLQ.x, y: DLQ.y + DLQ.h / 2 }, { x: 200, y: DLQ.y + DLQ.h / 2 }, { x: 200, y: QY }, HEAD, IN, { x: CON.x + CON.w + 8, y: QY }, { x: DONE.x + DONE.w / 2, y: QY }];
      if (p < 1) pill = { ...along(path, p), tone: "ok" };
      dlqCount = p > 0.05 ? 0 : 1;
      replay = p >= 1;
      flowing = true;
    }
    if (attempts) {
      conTone = step >= 2 ? (flowing ? "ok" : "warn") : "warn";
      conSub = step >= 2 ? (flowing ? "processing" : narrow ? "max 3" : "max retries") : narrow ? `try ${attempts}/3` : `attempt ${attempts}/3`;
      err = step < 2 ? "ValueError" : "";
    }
  }
  // the queue behind the head (k = 0 is right behind it); in the crash loop it backs up and packs tight
  const backlog = !dlq && step === 2;
  const qTone: Tone = backlog ? "warn" : "sky";
  const gap = backlog ? lerp(GAP, 15, ease(t)) : GAP;
  const drift = flowing && !reduced ? (clock * 1.2) % 1 : 0;
  const queue = Array.from({ length: backlog ? 20 : N }, (_, k) => ({ x: HEAD.x - (k + 1) * gap + drift * gap, tone: qTone }));
  const outflow = flowing ? [0, 1].map((k) => ({ x: lerp(CON.x + CON.w, DONE.x + DONE.w / 2, reduced ? 0.5 : (clock * 1.2 + k / 2) % 1) })) : [];
  const healthy = dlq && step >= 2;
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start" tone={dlq ? undefined : "bad"}>
        {dlq ? "max retries 3" : "poison pill"}
      </Txt>
      <Txt x={24} y={52} anchor="start" tone={dlq ? undefined : "bad"}>
        {dlq ? (narrow ? "then orders.dlq" : "then quarantine in orders.dlq") : "#4,521,892"}
      </Txt>
      <Txt x={W - 24} y={24} k="k" anchor="end" tone={stuck ? "bad" : "mute"}>
        {narrow ? "stuck" : "stuck behind it"}
      </Txt>
      <Txt x={W - 24} y={58} k="d" anchor="end" tone={stuck ? "bad" : healthy ? "ok" : undefined}>
        {stuck.toLocaleString("en-US")}
      </Txt>

      {/* the partition */}
      <rect className={`dq-q${backlog ? " bad" : ""}`} x={Q.x} y={Q.y} width={Q.w} height={Q.h} />
      <Txt x={Q.x + 6} y={Q.y + Q.h + 20} k="s" anchor="start" tone={!dlq && step === 2 ? "bad" : undefined}>
        {!dlq && step === 2 ? (narrow ? "checkout frozen" : "04:00 · customers can't check out") : "orders"}
      </Txt>
      <clipPath id="dq-clip">
        <rect x={Q.x} y={Q.y} width={Q.w} height={Q.h} />
      </clipPath>
      <g clipPath="url(#dq-clip)">
        {queue.map((m, k) => (
          <Token key={k} x={m.x} y={QY} s={14} tone={m.tone} />
        ))}
      </g>
      <Wire d={`M${Q.x + Q.w} ${QY}H${CON.x}`} arrow />
      <Wire d={`M${CON.x + CON.w} ${QY}H${DONE.x}`} arrow tone={flowing ? "ok" : undefined} />
      <Wire d={`M${CON.x + CON.w / 2} ${CON.y + CON.h}V${DLQ.y}`} arrow dash={!dlq} opacity={dlq ? 1 : 0.3} />
      {dlq && step === 3 && <Wire d={`M${DLQ.x} ${DLQ.y + DLQ.h / 2}H200V${Q.y + Q.h}`} dash tone="ok" />}

      <Box x={CON.x} y={CON.y} w={CON.w} h={CON.h} label="Consumer" sub={conSub} tone={conTone} />
      <Box x={DONE.x} y={DONE.y} w={DONE.w} h={DONE.h} label="done" sub={replay && !narrow ? "+ fixed" : flowing ? "✓" : "–"} tone={flowing ? "ok" : undefined} />
      <Box x={DLQ.x} y={DLQ.y} w={DLQ.w} h={DLQ.h} label={dlq ? (narrow ? "DLQ" : "orders.dlq") : "no DLQ"} sub={dlq ? (dlqCount ? "1 message" : step === 3 ? "replayed" : "empty") : undefined} tone={dlqCount ? "bad" : undefined} dim={!dlq} />
      {err && (
        <Txt x={W - 24} y={CON.y + CON.h + 26} k="s" anchor="end" tone="bad">
          {err}
        </Txt>
      )}
      {outflow.map((o, k) => (
        <Token key={`o${k}`} x={o.x} y={QY} s={10} tone="ok" />
      ))}
      {pill && <Token x={pill.x} y={pill.y} s={16} tone={pill.tone} />}
      {dlq && dlqCount > 0 && !narrow && (
        <Txt x={DLQ.x + DLQ.w + 10} y={DLQ.y + 24} k="s" anchor="start">
          retry_count: 3
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.dq-q{fill:none;stroke:var(--ax-line);stroke-width:1.5}.dq-q.bad{stroke:var(--ax-bad);stroke-width:2}`,
  variants: [
    {
      id: "none",
      label: "No DLQ",
      steps: [
        { caption: "Message #4,521,892 has items as a string, not an array. The consumer throws and crashes.", tween: 1600 },
        { caption: "Kubernetes restarts it, it fetches the same message and crashes again. The offset never moves.", loop: true, ms: 4200 },
        { caption: "By 04:00, after ~50 restarts, 50,000 messages are stuck behind it and customers can't check out.", tween: 2400, loop: true, ms: 3600 },
      ],
    },
    {
      id: "dlq",
      label: "With a DLQ",
      steps: [
        { caption: "Attempt 1: ValueError, items is not a list. The consumer catches it instead of crashing.", tween: 1600 },
        { caption: "Attempts 2 and 3 fail the same way. The retry count reaches the maximum of 3.", tween: 2800 },
        { caption: "The message moves to orders.dlq with its error and retry_count, the offset commits and the queue flows.", tween: 1800, loop: true, ms: 3400 },
        { caption: "An engineer fixes the producer, corrects the message and replays it to orders, where it succeeds.", tween: 3200, loop: true, ms: 3000 },
      ],
    },
  ],
  Scene,
});
