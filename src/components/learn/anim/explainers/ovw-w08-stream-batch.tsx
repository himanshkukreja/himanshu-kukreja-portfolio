/**
 * Whole-lesson overview (week 8, day 2 · streaming vs batch): the three business questions (revenue
 * right now, this hour, yesterday), batch vs stream and their trade-off, Lambda vs Kappa and how to
 * choose, then the pitfalls the lesson walks through: watermarks, late data, unbounded state,
 * checkpoints, non-idempotent batch appends and key skew.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const K = { x: 12, y: 110, w: 96, h: 100 };
const EX = 160;
const EW = 120;
const OX = 316;
const OW = 120;
const TOP = 52;
const BOT = 196;
const LH = 64;
const QX = 470;
const QW = 118;
const QS: [string, string, number][] = [
  ["Right now?", "1-2% off ok", 44],
  ["This hour?", "some lag ok", 110],
  ["Yesterday?", "100% exact", 204],
];

type Lane = Tone | "dim";

function Lanes({ narrow, top, bot, kSub, kTone }: { narrow: boolean; top: Lane; bot: Lane; kSub?: string; kTone?: Tone }) {
  const kc = K.y + K.h / 2;
  const lane = (y: number, tone: Lane, eng: string, sub: string, out: string, osub: string) => (
    <g opacity={tone === "dim" ? 0.3 : 1}>
      <Wire d={`M${K.x + K.w} ${kc}C${K.x + K.w + 26} ${kc} ${EX - 26} ${y + LH / 2} ${EX} ${y + LH / 2}`} arrow tone={tone === "lit" ? "lit" : undefined} />
      <Box x={EX} y={y} w={EW} h={LH} label={eng} sub={narrow ? undefined : sub} tone={tone === "dim" ? undefined : tone} />
      <Wire d={`M${EX + EW} ${y + LH / 2}H${OX}`} arrow />
      <Box x={OX} y={y} w={OW} h={LH} label={out} sub={narrow ? undefined : osub} tone={tone === "dim" ? undefined : tone} />
    </g>
  );
  return (
    <g>
      <Box x={K.x} y={K.y} w={K.w} h={K.h} label="Kafka" sub={narrow ? undefined : kSub ?? "1,000/s"} tone={kTone} />
      {lane(TOP, top, "Flink", "stream", narrow ? "Live" : "Real-time", "view")}
      {lane(BOT, bot, "Spark", "batch", "Table", "batch view")}
    </g>
  );
}

function Worlds({ step, t, clock, narrow }: SceneProps) {
  const top: Lane = step === 2 || step === 3 ? "lit" : "dim";
  const bot: Lane = step === 1 ? "lit" : step === 3 ? "ok" : "dim";
  const f = (k: number) => (clock * 0.4 + t * 0.6 + k / 4) % 1;
  const chunk = seg(t, 0.2, 1);
  return (
    <g>
      <Txt x={W / 2} y={24} k="k">
        {["three questions, one firehose", "batch: large chunks", "stream: every event", "most systems need both"][step]}
      </Txt>
      <Lanes narrow={narrow} top={top} bot={bot} />
      {QS.map(([q, s, y], i) => {
        const tn: Tone = step === 3 ? (i < 2 ? "lit" : "ok") : undefined;
        return (
          <g key={q}>
            {step === 3 && <Wire d={`M${OX + OW} ${i < 2 ? TOP + LH / 2 : BOT + LH / 2}C${QX - 14} ${i < 2 ? TOP + LH / 2 : BOT + LH / 2} ${QX - 14} ${y + 22} ${QX} ${y + 22}`} tone={tn} />}
            <rect className={`ax-box${tn ? ` ${tn}` : ""}`} x={QX} y={y} width={QW} height={44} />
            <Txt x={QX + QW / 2} y={y + (narrow ? 28 : 19)} k="s" tone={tn}>
              {q}
            </Txt>
            {!narrow && (
              <Txt x={QX + QW / 2} y={y + 36} k="s" tone={i === 2 ? "ok" : "warn"}>
                {s}
              </Txt>
            )}
          </g>
        );
      })}
      {step === 1 && (
        <g>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <Token key={k} x={lerp(K.x + K.w + 8 + k * 6, EX - 12 - (k % 3) * 10, chunk)} y={lerp(K.y + K.h / 2, BOT + 22 + Math.floor(k / 3) * 12, chunk)} s={8} tone="lit" />
          ))}
          <Txt x={EX + EW / 2 + 78} y={292} k="s" tone="lit">
            {narrow ? "hours · exact" : "hours · exact · cheaper, periodic"}
          </Txt>
        </g>
      )}
      {(step === 2 || step === 3) && (
        <g>
          {[0, 1, 2].map((k) => (
            <Token key={k} x={lerp(K.x + K.w, EX, f(k))} y={lerp(K.y + K.h / 2, TOP + LH / 2, f(k))} s={8} tone="lit" />
          ))}
          {step === 2 && (
            <Txt x={EX + EW / 2 + 78} y={146} k="s" tone="lit">
              {narrow ? "seconds · approx" : "seconds · approximate · always on"}
            </Txt>
          )}
        </g>
      )}
    </g>
  );
}

function Arch({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  return (
    <g>
      <Txt x={W / 2} y={24} k="k">
        {["Lambda: batch + speed, merged", "Kappa: stream only, replay", "choosing"][step]}
      </Txt>
      <Lanes narrow={narrow} top={step === 2 ? undefined : step === 0 ? "warn" : "lit"} bot={step === 0 ? "warn" : step === 1 ? "dim" : undefined} kSub={step === 1 ? "kept long" : undefined} kTone={step === 1 ? "lit" : undefined} />
      {step === 0 && (
        <g>
          {[TOP, BOT].map((y) => (
            <Wire key={y} d={`M${OX + OW} ${y + LH / 2}C${QX - 14} ${y + LH / 2} ${QX - 14} 160 ${QX} 160`} arrow />
          ))}
          <Box x={QX} y={120} w={QW} h={80} label="Serving" sub={narrow ? undefined : "batch + speed"} tone="lit" />
          <Txt x={EX + EW / 2} y={154} k="s" tone="warn" opacity={seg(t, 0.4, 1)}>
            {narrow ? "2 codebases" : "same logic, two codebases"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <g>
          <Token x={lerp(K.x + K.w, EX, p)} y={lerp(K.y + K.h / 2, TOP + LH / 2, p)} s={10} tone="lit" />
          <Txt x={EX + EW / 2 + 78} y={150} k="s" tone="lit" opacity={seg(t, 0.4, 1)}>
            {narrow ? "1B at 100K/s ≈ 3 h" : "replay 1B events at 100K/s ≈ 3 hours"}
          </Txt>
        </g>
      )}
      {step === 2 &&
        (narrow ? ["PB history → Lambda", "replay fits → Kappa"] : ["petabytes, batch ML → Lambda", "real-time, replay fits → Kappa"]).map((c, i) => (
          <g key={c} opacity={seg(t, i * 0.3, i * 0.3 + 0.4)}>
            <rect className="ax-box lit" x={16 + i * 288} y={274} width={280} height={32} />
            <Txt x={156 + i * 288} y={295} k="s" tone="lit">
              {c}
            </Txt>
          </g>
        ))}
    </g>
  );
}

const TX = (m: number) => 60 + ((m + 10) * 480) / 16; // minutes after 10:00, from 9:50 to 10:06
const EVS: [string, number][] = [["A", -2], ["B", -5], ["C", 1], ["D", -1], ["E", 2]];
const AY = 220;

function Pit({ step, t, narrow }: SceneProps) {
  const batch = step >= 4;
  return (
    <g>
      <Txt x={W / 2} y={24} k="k" tone={step >= 2 ? "bad" : undefined}>
        {["watermarks", "late data", "unbounded state", "no checkpoints", "batch: non-idempotent append", "batch: skew"][step]}
      </Txt>
      {[narrow ? "Kafka" : "Kafka", batch ? "Spark" : "Flink", batch ? "Table" : narrow ? "Live" : "Real-time"].map((l, i) => (
        <g key={i}>
          {i > 0 && <Wire d={`M${12 + (i - 1) * 222 + 110} 64H${12 + i * 222}`} arrow />}
          <Box x={12 + i * 222} y={44} w={110} h={40} label={l} tone={i === 1 ? "lit" : undefined} />
        </g>
      ))}
      {step <= 1 && (
        <g>
          <line className="ax-wire" x1={TX(-10)} x2={TX(6)} y1={AY} y2={AY} />
          {[-10, -5, 0, 5].map((m) => (
            <Txt key={m} x={TX(m)} y={AY + 22} k="s">
              {m < 0 ? `9:${60 + m}` : `10:0${m}`}
            </Txt>
          ))}
          <Wire d={`M${TX(0)} 112V${AY + 6}`} tone={step === 1 ? "ok" : "warn"} dash />
          <Txt x={TX(0)} y={106} k="s" tone={step === 1 ? "ok" : "warn"}>
            {step === 1 ? (narrow ? "fired" : "[9:00-10:00) fired") : narrow ? "window end" : "[9:00-10:00) ends"}
          </Txt>
          {step === 0 &&
            EVS.map(([n, m], i) => (
              <g key={n} opacity={seg(t, i * 0.14, i * 0.14 + 0.2)}>
                <Token x={TX(m)} y={AY - 24 - (i % 2) * 22} s={10} tone="lit" label={narrow ? undefined : n} />
              </g>
            ))}
          {step === 0 && (
            <g opacity={seg(t, 0.75, 1)}>
              <Wire d={`M${TX(-3)} 130V${AY + 6}`} tone="lit" />
              <Txt x={TX(-3) - 8} y={142} k="s" tone="lit" anchor="end">
                {narrow ? "WM 9:57" : "WM = 10:02 − 5 min = 9:57"}
              </Txt>
            </g>
          )}
          {step === 1 && (
            <g>
              <Token x={lerp(TX(6), TX(-3), seg(t, 0, 0.5))} y={AY - 30} s={10} tone="warn" />
              <Txt x={TX(-6)} y={AY - 50} k="s" tone="ok" opacity={seg(t, 0.5, 0.8)}>
                {narrow ? "≤1h: update" : "allowed lateness 1h: update"}
              </Txt>
              <Box x={TX(0) + 40} y={130} w={170} h={40} label={narrow ? "side out" : "side output"} sub={undefined} tone="warn" opacity={seg(t, 0.6, 1)} />
              <Txt x={TX(0) + 125} y={190} k="s" tone="warn" opacity={seg(t, 0.6, 1)}>
                {narrow ? "later still" : "later still: not dropped"}
              </Txt>
            </g>
          )}
        </g>
      )}
      {step === 2 &&
        [
          ["no TTL", lerp(0.4, 1, t), "bad", "OOM"],
          ["TTL 7 days", 0.4, "ok", "bounded"],
        ].map(([l, v, tn, r], i) => (
          <g key={l as string}>
            <Txt x={40} y={150 + i * 70} k="s" anchor="start">
              {l as string}
            </Txt>
            <Meter x={180} y={136 + i * 70} w={300} h={18} value={v as number} max={1} tone={tn as Tone} />
            <Txt x={560} y={150 + i * 70} k="s" anchor="end" tone={tn as Tone} opacity={i === 0 ? seg(t, 0.8, 1) : 1}>
              {r as string}
            </Txt>
          </g>
        ))}
      {step === 3 && (
        <g>
          <line className="ax-wire" x1={60} x2={540} y1={AY} y2={AY} />
          {[0, 1, 2, 3].map((m) => (
            <g key={m}>
              <rect className="ax-tok ok" x={80 + m * 120 - 5} y={AY - 5} width={10} height={10} />
              <Txt x={80 + m * 120} y={AY + 24} k="s">{`${m} min`}</Txt>
            </g>
          ))}
          <Txt x={W / 2} y={140} k="s" tone="ok">
            {narrow ? "checkpoint → S3" : "checkpoint every minute → s3://checkpoints/"}
          </Txt>
          <Txt x={510} y={AY - 18} k="t" tone="bad" opacity={seg(t, 0.3, 0.6)}>
            ✕
          </Txt>
          <Wire d={`M505 ${AY - 34}C470 ${AY - 70} 470 ${AY - 70} 440 ${AY - 14}`} tone="ok" arrow />
          <Txt x={440} y={AY + 54} k="s" tone="ok" opacity={seg(t, 0.6, 1)}>
            {narrow ? "restore" : "crash → restore, not scratch"}
          </Txt>
        </g>
      )}
      {step === 4 &&
        [
          ["run 1 (fails)", 0.5, "warn"],
          ["retry", 1, "warn"],
          [narrow ? "overwrite" : "overwrite partition", 1, "ok"],
        ].map(([l, v, tn], i) => (
          <g key={l as string} opacity={i === 2 ? seg(t, 0.5, 0.9) : 1}>
            <Txt x={40} y={140 + i * 50} k="s" anchor="start">
              {l as string}
            </Txt>
            <Meter x={220} y={126 + i * 50} w={260} h={18} value={v as number} max={1} tone={tn as Tone} />
            {i === 1 && (
              <Txt x={560} y={190} k="s" anchor="end" tone="bad">
                {narrow ? "dupes" : "= duplicates"}
              </Txt>
            )}
          </g>
        ))}
      {step === 5 &&
        [0, 1].map((g) => (
          <g key={g} opacity={g === 1 ? seg(t, 0.4, 0.9) : 1}>
            {Array.from({ length: 10 }, (_, i) => {
              const h = g === 0 ? (i === 0 ? 130 : 10) : 40;
              return <rect key={i} className={`ax-fill ${g === 0 && i === 0 ? "bad" : g === 0 ? "" : "ok"}`} x={40 + g * 290 + i * 24} y={262 - h} width={18} height={h} />;
            })}
            <Txt x={154 + g * 290} y={290} k="s" tone={g === 0 ? "bad" : "ok"}>
              {g === 0 ? (narrow ? "1 task: 90%" : "one task: 90% of data") : narrow ? "salted ×10" : "salted over 10 tasks"}
            </Txt>
          </g>
        ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "worlds" ? <Worlds {...p} /> : p.variant === "arch" ? <Arch {...p} /> : <Pit {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "worlds",
      label: "Two worlds",
      steps: [
        { caption: "Events flow into Kafka at 1,000 a second. Revenue right now can be 1-2% off; yesterday's revenue for finance must be 100% exact.", tween: 900 },
        { caption: "Batch processes data in large chunks with Spark: hours of latency, but exact, and cheaper because it only runs periodically.", tween: 1600 },
        { caption: "Streaming processes every event as it arrives with Flink: seconds of latency, but approximate, since late events may be missed, and always on.", tween: 1400, loop: true },
        { caption: "Most systems need both: stream for what's happening now, batch for what happened exactly. The question is how to combine them.", tween: 1000, loop: true },
      ],
    },
    {
      id: "arch",
      label: "Lambda or Kappa",
      steps: [
        { caption: "Lambda runs both: batch for accuracy, a speed layer for the gap since the last batch, merged at query time. The same logic lives twice.", tween: 1400 },
        { caption: "Kappa streams only: one immutable log, one codebase. Reprocessing is a replay: 1B events at 100K/s take about 3 hours.", tween: 1600 },
        { caption: "Petabytes of history and batch ML favour Lambda; real-time first with a replay that fits favours Kappa. Tools like Beam write the logic once.", tween: 1400 },
      ],
    },
    {
      id: "pit",
      label: "Pitfalls",
      steps: [
        { caption: "Events arrive out of order. Watermark = latest event time minus 5 minutes: 10:02 gives 9:57, so the 9:00–10:00 window waits.", tween: 2000 },
        { caption: "Don't drop late events; mobile events routinely arrive late. Allowed lateness updates the window, and anything later goes to a side output.", tween: 1800 },
        { caption: "Keep every session in state forever and it grows until out of memory. A 7-day state TTL, or cleanup timers, keep it bounded.", tween: 1600 },
        { caption: "Without checkpoints, a crash means starting from scratch. Checkpoint every minute to S3 and restore from the last one.", tween: 1600 },
        { caption: "In batch, a job that appends, fails halfway and is retried leaves duplicates. Overwrite the date partition so reruns are safe.", tween: 1600 },
        { caption: "Group by a celebrity's user_id and one task gets 90% of the data. Salt the key over 10 tasks, then merge the partial counts.", tween: 2000 },
      ],
    },
  ],
  Scene,
});
