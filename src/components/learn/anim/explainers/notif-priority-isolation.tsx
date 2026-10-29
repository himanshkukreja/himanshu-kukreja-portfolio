/**
 * Priority isolation (week 6, day 5 · 3.3 priority lanes all the way to the provider). One shared
 * queue: a 10M campaign lands at once and Rohan's OTP waits behind 9.2M messages until ~20:08. A topic
 * per class (notifications.critical / transactional / bulk) with its own workers: the campaign is
 * paced into bulk at ~5,500/s and the OTP never has anything in front of it. Lanes that end at our
 * border still merge at the provider (FCM's 600,000 a minute per project, one queue per SMS sender),
 * so token buckets reserve a share bulk can't touch (Day 2: 4,000/s, leaving 6,000/s for bulk) and
 * OTPs get their own SMS sender with a 120 s validity period.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const SRC = { x: 24, w: 128, h: 56 };
const QX = 196;
const QW = 210;
const WX = 436;
const WW = 140;

function Shared({ step, t, clock, narrow }: SceneProps) {
  const QY = 132;
  const fill = step === 0 ? lerp(0.05, 0.92, t) : 0.92 - (step === 2 ? Math.min(0.08, clock * 0.004) : 0);
  const tail = QX + QW * (1 - fill); // the queue drains to the right; new work joins at the left end
  const otpIn = step === 0 ? -1 : step === 1 ? seg(t, 0.1, 0.8) : 1;
  const ax = lerp(SRC.x + SRC.w, tail - 10, Math.max(0, otpIn));
  const ay = lerp(252, QY + 22, Math.max(0, otpIn));
  return (
    <g>
      <Box x={SRC.x} y={40} w={SRC.w} h={SRC.h} label="Campaign" sub={narrow ? undefined : "10M at once"} tone={step === 0 ? "warn" : undefined} />
      <Box x={SRC.x} y={224} w={SRC.w} h={SRC.h} label="OTP" sub={narrow ? undefined : "Rohan, 20:00:40"} tone={step >= 1 ? "bad" : undefined} />
      <Wire d={`M${SRC.x + SRC.w} 68C180 68 170 154 ${QX} 154`} arrow tone={step === 0 ? "lit" : undefined} />
      <Wire d={`M${SRC.x + SRC.w} 252C180 252 170 154 ${QX} 154`} arrow tone={step >= 1 ? "lit" : undefined} />
      <Txt x={QX} y={QY - 14} k="s" anchor="start">
        {narrow ? "one shared queue" : "notifications · one shared queue"}
      </Txt>
      <rect x={QX} y={QY} width={QW} height={44} className="ax-meter" />
      <rect x={tail} y={QY} width={QX + QW - tail} height={44} className="ax-fill warn" />
      <Txt x={QX + QW} y={QY + 68} k="t" anchor="end" tone={step === 0 ? "lit" : "warn"}>
        {step === 0 ? "10M queued" : "9.2M ahead"}
      </Txt>
      {otpIn >= 0 && <Token x={ax} y={ay} s={14} tone="bad" />}
      <Wire d={`M${QX + QW} 154H${WX}`} arrow />
      <Box x={WX} y={124} w={WW} h={60} label="Workers" sub={narrow ? undefined : "20,000/s, FIFO"} />
      {step === 2 && (
        <g>
          <Txt x={WX + WW / 2} y={214} k="s" tone="bad">
            {narrow ? "out ~20:08" : "OTP leaves ~20:08"}
          </Txt>
          <Txt x={WX + WW / 2} y={236} k="s" tone="bad">
            {narrow ? "code expired" : "its code has expired"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const LANES: {
  id: string;
  label: string;
  src: string;
  rate: string;
  rateN: string;
  pool: string;
  poolN: string;
}[] = [
  {
    id: "critical",
    label: "critical",
    src: "OTP",
    rate: "< 1 s, never shed",
    rateN: "< 1 s",
    pool: "own pool",
    poolN: "own pool",
  },
  {
    id: "transactional",
    label: "transactional",
    src: "Payment",
    rate: "< 2 s",
    rateN: "< 2 s",
    pool: "own pool",
    poolN: "own pool",
  },
  {
    id: "bulk",
    label: "bulk",
    src: "Campaign",
    rate: "paced ~5,500/s",
    rateN: "~5,500/s",
    pool: "kill switch, ramp",
    poolN: "kill switch",
  },
];
const LY = (i: number) => 64 + i * 80;

function Lanes({ step, t, clock, narrow }: SceneProps) {
  const bulkFill = step === 0 ? lerp(0.05, 0.85, t) : 0.85 + (step === 2 ? Math.min(0.1, clock * 0.01) : 0);
  const otpP = step === 1 ? seg(t, 0.05, 0.95) : step > 1 ? 1 : 0;
  const ox = otpP < 0.5 ? lerp(SRC.x + SRC.w, QX + QW, otpP / 0.5) : lerp(QX + QW, WX + WW / 2, (otpP - 0.5) / 0.5);
  const flow = (k: number) => (clock * 0.6 + k / 3) % 1;
  return (
    <g>
      <Txt x={QX} y={24} k="k" anchor="start" tone="mute">
        {narrow ? "a topic per class" : "notifications.<lane>"}
      </Txt>
      {LANES.map((l, i) => {
        const y = LY(i);
        const bulk = l.id === "bulk";
        const crit = l.id === "critical";
        const v = bulk ? bulkFill : 0.04;
        const tone: Tone = bulk ? "warn" : crit && step >= 1 ? "bad" : "sky";
        const srcOn = (bulk && step === 0) || (crit && step >= 1);
        return (
          <g key={l.id}>
            <Box x={SRC.x} y={y - 14} w={SRC.w} h={SRC.h} label={l.src} tone={srcOn ? (bulk ? "warn" : "bad") : undefined} />
            <Wire d={`M${SRC.x + SRC.w} ${y + 14}H${QX}`} arrow tone={srcOn ? "lit" : undefined} />
            <Txt x={QX} y={y - 8} k="s" anchor="start" tone={(crit && step >= 1) || (bulk && step !== 1) ? undefined : "mute"}>
              {l.label}
            </Txt>
            <Txt x={QX + QW} y={y - 8} k="s" anchor="end" tone={bulk && step === 0 ? "lit" : "mute"}>
              {narrow ? l.rateN : l.rate}
            </Txt>
            <Meter x={QX} y={y} w={QW} h={28} value={v} max={1} tone={tone} />
            <Wire d={`M${QX + QW} ${y + 14}H${WX}`} arrow tone={crit && step === 1 ? "lit" : undefined} />
            <g>
              <rect x={WX} y={y} width={WW} height={28} className={`ax-box${crit && step >= 1 ? " ok" : bulk && step === 2 ? " lit" : ""}`} />
              <Txt x={WX + WW / 2} y={y + 19} k="s" tone={crit && step >= 1 ? "ok" : undefined}>
                {narrow ? l.poolN : l.pool}
              </Txt>
            </g>
            {bulk && step === 2 && [0, 1, 2].map((k) => <Token key={k} x={lerp(QX + QW + 4, WX - 6, flow(k))} y={y + 14} s={7} tone="warn" />)}
          </g>
        );
      })}
      {otpP > 0 && otpP < 1 && <Token x={ox} y={LY(0) + 14} s={14} tone="bad" />}
      {otpP >= 1 && (
        <Txt x={WX + WW / 2} y={LY(0) - 8} k="k" tone="ok">
          sent
        </Txt>
      )}
      {step === 2 && (
        <Txt x={QX} y={LY(2) + 56} k="s" anchor="start" tone="warn">
          {narrow ? "bulk lag: the plan" : "bulk lag at 20:00 is the plan; critical lag pages"}
        </Txt>
      )}
    </g>
  );
}

/** the provider: one FCM quota for every lane unless part of it is reserved */
function Provider({ step, t, narrow }: SceneProps) {
  const FX = 360;
  const FW = 216;
  const reserved = step >= 2;
  const bulkShare = reserved ? 0.6 : lerp(0.6, 0.98, step === 0 ? seg(t, 0.2, 0.9) : 1);
  const bounce = step === 1 ? seg(t, 0.2, 0.9) : 0;
  const tokX = bounce < 0.6 ? lerp(SRC.x + SRC.w, FX - 6, bounce / 0.6) : lerp(FX - 6, FX - 40, (bounce - 0.6) / 0.4);
  const tokY = bounce < 0.6 ? lerp(74, 120, bounce / 0.6) : 120;
  const lanes = ["critical", "transactional", "bulk"];
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start" tone={reserved ? "ok" : "warn"}>
        {reserved ? (narrow ? "lanes reach the provider" : "lanes all the way to the provider") : narrow ? "lanes merge again" : "the lanes merge again at the provider"}
      </Txt>
      {lanes.map((l, i) => {
        const y = 52 + i * 62;
        return (
          <g key={l}>
            <Box x={SRC.x} y={y} w={SRC.w} h={44} label={l === "transactional" && narrow ? "trans." : l} tone={i === 0 && step >= 1 ? "bad" : i === 2 ? "warn" : undefined} />
            <Wire d={`M${SRC.x + SRC.w} ${y + 22}C${200} ${y + 22} ${200} 120 ${FX} 120`} arrow tone={i === 0 && step === 1 ? "lit" : undefined} />
          </g>
        );
      })}
      {/* FCM quota */}
      <g>
        <rect x={FX} y={52} width={FW} height={132} className={`ax-box${reserved ? " ok" : step === 1 ? " bad" : ""}`} />
        <Txt x={FX + FW / 2} y={78} k="t">
          {narrow ? "FCM quota" : "FCM · 600K a minute"}
        </Txt>
        <Txt x={FX + FW / 2} y={100} k="s">
          {narrow ? "per project" : "per project: 10,000/s"}
        </Txt>
        <rect x={FX + 12} y={116} width={(FW - 24) * (1 - bulkShare)} height={24} className={`ax-fill ${reserved ? "ok" : "bad"}`} />
        <rect x={FX + 12 + (FW - 24) * (1 - bulkShare)} y={116} width={(FW - 24) * bulkShare} height={24} className="ax-fill warn" />
        <rect x={FX + 12} y={116} width={FW - 24} height={24} className="ax-meter pi-frame" />
        <Txt x={FX + 12} y={166} k="s" anchor="start" tone={reserved ? "ok" : "bad"}>
          {reserved ? (narrow ? "4K kept" : "4,000/s kept") : step === 1 ? "429" : ""}
        </Txt>
        <Txt x={FX + FW - 12} y={166} k="s" anchor="end" tone="warn">
          {reserved ? (narrow ? "6K bulk" : "6,000/s bulk") : narrow ? "bulk" : "bulk takes it"}
        </Txt>
      </g>
      {step === 1 && bounce > 0 && bounce < 1 && <Token x={tokX} y={tokY} s={12} tone="bad" />}
      {/* SMS senders */}
      <g>
        <rect x={FX} y={206} width={FW} height={40} className={`ax-box${reserved ? " ok" : ""}`} />
        <Txt x={FX + FW / 2} y={231} k="s" tone={reserved ? "ok" : undefined}>
          {reserved ? (narrow ? "sender A: OTPs" : "SMS sender A · OTPs, 120 s") : narrow ? "one SMS sender" : "one SMS sender, one queue"}
        </Txt>
      </g>
      {reserved && (
        <g>
          <rect x={FX} y={258} width={FW} height={40} className="ax-box warn" />
          <Txt x={FX + FW / 2} y={283} k="s" tone="warn">
            {narrow ? "sender B: promos" : "SMS sender B · marketing"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <Txt x={24} y={256} k="s" anchor="start" tone="bad" opacity={seg(t, 0.6, 1)}>
          {narrow ? "OTP: 429" : "the OTP gets a 429"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "shared" ? <Shared {...p} /> : p.variant === "provider" ? <Provider {...p} /> : <Lanes {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ax-meter.pi-frame{fill:none}`,
  variants: [
    {
      id: "shared",
      label: "One shared queue",
      steps: [
        {
          caption: "Someone clicks Send at 20:00 and a 10M-message campaign lands at once in the platform's only queue.",
          tween: 2600,
        },
        {
          caption: "Rohan's sign-in OTP joins the back of the same queue at 20:00:40, with 9.2M campaign messages still ahead of it.",
          tween: 2000,
        },
        {
          caption: "Workers drain in order at 20,000 a second, so the OTP leaves about 460 s later, at ~20:08: after its 5-minute code has expired.",
          ms: 3400,
          loop: true,
        },
      ],
    },
    {
      id: "isolated",
      label: "A topic per class",
      steps: [
        {
          caption: "A topic per class: the campaign is paced into notifications.bulk at ~5,500 a second (10M over 30 minutes), ramped, instead of landing at once.",
          tween: 2600,
        },
        {
          caption: "Rohan's OTP goes to notifications.critical, with its own workers: nothing is ever in front of it, so it's sent straight away.",
          tween: 2200,
        },
        {
          caption: "Each lane has its own topic, worker pool and lag alert: millions waiting in bulk at 20:00 is the plan, while a few hundred on critical pages someone.",
          ms: 3800,
          loop: true,
        },
      ],
    },
    {
      id: "provider",
      label: "To the provider",
      steps: [
        {
          caption: "Most designs stop there, and the OTP is still late: the lanes merge again at the provider. FCM's quota is per project, 600,000 a minute (10,000 a second), shared by every lane.",
          tween: 2200,
        },
        {
          caption: "If bulk takes 590,000 of the 600,000 a minute, a critical push gets a 429. And an OTP sent from the same number as a 500,000-text promotion joins the back of that sender's queue.",
          tween: 2200,
        },
        {
          caption: "So the lanes reach the provider: token buckets reserve a share bulk can't touch (Day 2 assumes 4,000/s for critical and transactional, leaving 6,000/s for bulk), and OTPs get their own SMS sender with a 120 s validity.",
          tween: 1800,
          ms: 3800,
        },
      ],
    },
  ],
  Scene,
});
