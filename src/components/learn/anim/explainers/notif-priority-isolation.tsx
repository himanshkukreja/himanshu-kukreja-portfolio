/**
 * Priority isolation (week 6, day 4 · 1.1 / 1.3): a 10M campaign bursts at 100,000+/sec. In one
 * shared topic a fraud alert waits behind it; with a topic and worker pool per priority, the
 * campaign sits in notifications.low (2K/sec) while notifications.critical (no rate limit,
 * dedicated 10-50 workers) delivers the alert straight away.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const CAMP = { x: 24, y: 36, w: 128, h: 60 };
const ALERT = { x: 24, y: 224, w: 128, h: 60 };
const QX = 196;
const QW = 210;
const WX = 436;
const WW = 140;

const LANES: { id: string; label: string; rate: string; pool: string; poolN: string }[] = [
  { id: "critical", label: "critical", rate: "no limit", pool: "10–50 dedicated", poolN: "10–50" },
  { id: "high", label: "high", rate: "10K/sec", pool: "20–100 dedicated", poolN: "20–100" },
  { id: "medium", label: "medium", rate: "5K/sec", pool: "", poolN: "" },
  { id: "low", label: "low", rate: "2K/sec", pool: "5–200 shared", poolN: "5–200" },
];
const LY = (i: number) => 44 + i * 64;

function Shared({ step, t, clock, narrow }: SceneProps) {
  const fill = step === 0 ? lerp(0.05, 0.92, t) : 0.92 - (step === 2 ? clock * 0.004 : 0);
  const QY = 132;
  const tail = QX + QW * (1 - fill); // the queue drains to the right; new work joins at the left end
  const alertIn = step === 0 ? -1 : step === 1 ? seg(t, 0.1, 0.8) : 1;
  const ax = lerp(ALERT.x + ALERT.w, tail - 10, Math.max(0, alertIn));
  const ay = lerp(ALERT.y + ALERT.h / 2, QY + 22, Math.max(0, alertIn));
  return (
    <g>
      <Box x={CAMP.x} y={CAMP.y} w={CAMP.w} h={CAMP.h} label="Campaign" sub={narrow ? "10M" : "10M · LOW"} tone={step === 0 ? "warn" : undefined} />
      <Box x={ALERT.x} y={ALERT.y} w={ALERT.w} h={ALERT.h} label="Fraud alert" sub="CRITICAL" tone={step >= 1 ? "bad" : undefined} />
      <Wire d={`M${CAMP.x + CAMP.w} ${CAMP.y + CAMP.h / 2}C180 66 170 154 ${QX} 154`} arrow tone={step === 0 ? "lit" : undefined} />
      <Wire d={`M${ALERT.x + ALERT.w} ${ALERT.y + ALERT.h / 2}C180 254 170 154 ${QX} 154`} arrow tone={step >= 1 ? "lit" : undefined} />
      <Txt x={QX} y={QY - 14} k="s" anchor="start">
        {narrow ? "one shared topic" : "notifications · one shared topic"}
      </Txt>
      <rect x={QX} y={QY} width={QW} height={44} className="ax-meter" />
      <rect x={tail} y={QY} width={QX + QW - tail} height={44} className="ax-fill warn" />
      <Txt x={QX + QW} y={QY + 68} k="t" anchor="end" tone={step === 0 ? "lit" : "warn"}>
        {step === 0 ? "100,000+/sec" : narrow ? "millions ahead" : "millions queued ahead"}
      </Txt>
      {alertIn >= 0 && <Token x={ax} y={ay} s={14} tone="bad" />}
      {step >= 1 && alertIn >= 1 && (
        <Txt x={tail - 10} y={QY + 92} k="k" tone="bad">
          alert
        </Txt>
      )}
      <Wire d={`M${QX + QW} 154H${WX}`} arrow />
      <Box x={WX} y={124} w={WW} h={60} label="Workers" sub={narrow ? undefined : "in order"} />
      {step === 2 && (
        <Txt x={WX + WW / 2} y={214} k="s" tone="bad">
          {narrow ? "alert waits" : "alert still waiting"}
        </Txt>
      )}
    </g>
  );
}

function Isolated({ step, t, clock, narrow }: SceneProps) {
  const lowFill = step === 0 ? lerp(0.05, 0.85, t) : 0.85 + (step === 2 ? Math.min(0.1, clock * 0.01) : 0);
  const alertP = step === 1 ? seg(t, 0.05, 0.95) : step > 1 ? 1 : 0;
  // alert path: source → critical lane → workers → delivered
  const ax = alertP < 0.5 ? lerp(ALERT.x + ALERT.w, QX + QW, alertP / 0.5) : lerp(QX + QW, WX + WW / 2, (alertP - 0.5) / 0.5);
  const ay = alertP < 0.25 ? lerp(ALERT.y + ALERT.h / 2, LY(0) + 14, alertP / 0.25) : LY(0) + 14;
  const flow = (k: number) => (clock * 0.6 + k / 3) % 1;
  return (
    <g>
      <Box x={CAMP.x} y={CAMP.y + 140} w={CAMP.w} h={CAMP.h} label="Campaign" sub={narrow ? "10M" : "10M · LOW"} tone={step === 0 ? "warn" : undefined} />
      <Box x={ALERT.x} y={CAMP.y} w={ALERT.w} h={ALERT.h} label="Fraud alert" sub="CRITICAL" tone={step >= 1 ? "bad" : undefined} />
      <Wire d={`M${CAMP.x + CAMP.w} ${CAMP.y + 170}C176 206 172 ${LY(3) + 14} ${QX} ${LY(3) + 14}`} arrow tone={step === 0 ? "lit" : undefined} />
      <Wire d={`M${ALERT.x + ALERT.w} ${CAMP.y + 30}C176 66 172 ${LY(0) + 14} ${QX} ${LY(0) + 14}`} arrow tone={step === 1 ? "lit" : undefined} />
      <Txt x={QX} y={18} k="k" anchor="start" tone="mute">
        {narrow ? "topic per priority" : "notifications.<priority>"}
      </Txt>
      {LANES.map((l, i) => {
        const y = LY(i);
        const low = l.id === "low";
        const crit = l.id === "critical";
        const v = low ? lowFill : 0.04;
        const tone: Tone = low ? "warn" : crit && step >= 1 ? "bad" : "sky";
        return (
          <g key={l.id}>
            <Txt x={QX} y={y - 8} k="s" anchor="start" tone={(crit && step >= 1) || (low && step !== 1) ? undefined : "mute"}>
              {l.label}
            </Txt>
            <Txt x={QX + QW} y={y - 8} k="s" anchor="end" tone={low && step === 0 ? "lit" : "mute"}>
              {l.rate}
            </Txt>
            <Meter x={QX} y={y} w={QW} h={28} value={v} max={1} tone={tone} />
            <Wire d={`M${QX + QW} ${y + 14}H${WX}`} arrow tone={crit && step === 1 ? "lit" : undefined} />
            <rect x={WX} y={y} width={WW} height={28} className={`ax-box${crit && step >= 1 ? " ok" : low && step === 2 ? " lit" : ""}`} />
            <Txt x={WX + WW / 2} y={y + 19} k="s" tone={crit && step >= 1 ? "ok" : undefined}>
              {narrow ? l.poolN || "workers" : l.pool || "workers"}
            </Txt>
            {low && step === 2 && [0, 1, 2].map((k) => <Token key={k} x={lerp(QX + QW + 4, WX - 6, flow(k))} y={y + 14} s={7} tone="warn" />)}
          </g>
        );
      })}
      {alertP > 0 && alertP < 1 && <Token x={ax} y={ay} s={14} tone="bad" />}
      {alertP >= 1 && (
        <Txt x={WX + WW / 2} y={LY(0) - 8} k="k" tone="ok">
          delivered
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "shared" ? <Shared {...p} /> : <Isolated {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "shared",
      label: "One shared topic",
      steps: [
        { caption: "10:00:00: marketing clicks Send and 10M campaign messages burst into one topic at 100,000+/sec.", tween: 2600 },
        { caption: "A fraud alert arrives and joins the back of the same queue, behind millions of campaign messages.", tween: 2000 },
        { caption: "Workers drain in order, so the CRITICAL alert waits behind marketing.", ms: 3400, loop: true },
      ],
    },
    {
      id: "isolated",
      label: "Topic per priority",
      steps: [
        { caption: "Separate topics per priority: the campaign lands in notifications.low, rate-limited to 2K/sec.", tween: 2600 },
        { caption: "The fraud alert goes to notifications.critical: no rate limit, dedicated workers, delivered straight away.", tween: 2200 },
        { caption: "Low's lag grows during the campaign; its pool scales to 200 workers. Critical and high pools are never shared.", ms: 3800, loop: true },
      ],
    },
  ],
  Scene,
});
