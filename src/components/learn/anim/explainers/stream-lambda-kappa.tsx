/**
 * Lambda vs Kappa (week 8, day 2 · 2.1–2.3 / 3.1–3.3): the 14:30 query merges the 12:00 batch view
 * ($50,000) with the speed layer ($12,000) = $62,000; the 18:00 batch run makes the speed layer's
 * 12:00–18:00 results obsolete. Kappa replays 1B events at 100K/s (~3 hours) into V2, then switches.
 */
import { Box, defineExplainer, lerp, seg, tween, Txt, Wire, type SceneProps } from "../kit";

const W = 600;
const H = 320;
const X0 = 116;
const X1 = 566;
const hx = (h: number) => X0 + (h * (X1 - X0)) / 24;
const ROW = { batch: 104, speed: 154 };
const BAR = 26;

const clock = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function Lambda({ step, t, narrow }: SceneProps) {
  const now = tween(step, t, [14.5, 14.5, 18, 18]);
  const batchEnd = step >= 2 ? (step === 2 ? lerp(12, 18, seg(t, 0.45, 0.8)) : 18) : 12;
  const discard = step >= 2 ? (step === 2 ? seg(t, 0.55, 0.9) : 1) : 0;
  const merge = step === 1 ? seg(t, 0.2, 0.8) : step >= 1 ? 1 : 0;
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? `today · now ${clock(now)}` : `lambda · today's revenue · now ${clock(now)}`}
      </Txt>
      <Txt x={24} y={ROW.batch + 1} anchor="start">
        Batch
      </Txt>
      <Txt x={24} y={ROW.batch + (narrow ? 24 : 18)} k="s" anchor="start">
        Spark
      </Txt>
      <Txt x={24} y={ROW.speed + 1} anchor="start">
        Speed
      </Txt>
      <Txt x={24} y={ROW.speed + (narrow ? 24 : 18)} k="s" anchor="start">
        Flink
      </Txt>
      {/* axis */}
      <line className="sk-axis" x1={X0} x2={X1} y1={186} y2={186} />
      {[0, 6, 12, 18, 24].map((h) => (
        <g key={h}>
          <line className="sk-axis" x1={hx(h)} x2={hx(h)} y1={182} y2={190} />
          <Txt x={hx(h)} y={206} k="s">
            {narrow ? String(h) : `${String(h).padStart(2, "0")}:00`}
          </Txt>
        </g>
      ))}
      {/* batch view */}
      <rect className="sk-bar sky" x={hx(0)} y={ROW.batch - BAR / 2} width={hx(batchEnd) - hx(0)} height={BAR} />
      <Txt x={hx(0) + 10} y={ROW.batch + 5} k="s" anchor="start">
        {step >= 2 && discard > 0.5 ? (narrow ? "to 18:00" : "batch view to 18:00") : "$50,000"}
      </Txt>
      {/* speed view: 12:00 → now, discarded once batch catches up */}
      {step < 2 ? (
        <g>
          <rect className="sk-bar lit" x={hx(12)} y={ROW.speed - BAR / 2} width={hx(now) - hx(12)} height={BAR} />
          <Txt x={hx(now) + 8} y={ROW.speed + 5} k="s" anchor="start" tone="lit">
            $12,000
          </Txt>
        </g>
      ) : (
        <g>
          <rect className="sk-bar lit" x={hx(12)} y={ROW.speed - BAR / 2} width={hx(now) - hx(12)} height={BAR} opacity={1 - discard * 0.8} />
          <rect className="sk-gone" x={hx(12)} y={ROW.speed - BAR / 2} width={hx(18) - hx(12)} height={BAR} opacity={discard} />
          <Txt x={(hx(12) + hx(18)) / 2} y={ROW.speed + 5} k="s" tone="bad" opacity={discard}>
            discarded
          </Txt>
          <rect className="sk-bar lit" x={hx(18)} y={ROW.speed - BAR / 2} width={6} height={BAR} opacity={discard} />
          <Txt x={hx(18) + 14} y={ROW.speed + 5} k="s" anchor="start" tone="lit" opacity={discard}>
            {narrow ? "from 18:00" : "fills from 18:00"}
          </Txt>
        </g>
      )}
      {/* now */}
      <line className="sk-now" x1={hx(now)} x2={hx(now)} y1={ROW.batch - 26} y2={190} />
      <Txt x={hx(now)} y={ROW.batch - 32} k="s" tone="lit">
        now
      </Txt>
      {/* serving layer */}
      {step < 3 ? (
        <g opacity={step === 0 ? 0.5 : 1}>
          <rect className={`ax-box${merge >= 1 && step === 1 ? " lit" : ""}`} x={X0} y={228} width={X1 - X0} height={60} />
          <Txt x={X0 + 14} y={252} k="k" anchor="start">
            serving layer
          </Txt>
          <Txt x={X0 + 14} y={276} anchor="start" opacity={step === 0 ? 0.6 : 1}>
            {step === 0
              ? narrow
                ? "batch + speed"
                : "query = batch view + speed view"
              : step === 1
                ? narrow
                  ? `$50K + $12K = ${merge >= 1 ? "$62K" : "…"}`
                  : `$50,000 + $12,000 = ${merge >= 1 ? "$62,000" : "…"}`
                : narrow
                  ? "batch to 18:00 + speed"
                  : "batch (to 18:00) + speed (from 18:00)"}
          </Txt>
        </g>
      ) : (
        <g opacity={seg(t, 0, 0.6)}>
          <Box x={X0} y={228} w={180} h={60} label="Spark job" sub="revenue / hour" tone="sky" />
          <Box x={X1 - 180} y={228} w={180} h={60} label="Flink job" sub="revenue / hour" tone="lit" />
          <Txt x={(X0 + X1) / 2} y={268} k="d" tone="bad">
            ≠
          </Txt>
        </g>
      )}
    </g>
  );
}

const LOG = { x: 24, y: 62, w: 552, h: 28 };
const V1 = { x: 24, y: 134, w: 150, h: 54 };
const V2 = { x: 24, y: 220, w: 150, h: 54 };
const O1 = { x: 222, y: 134, w: 140, h: 54 };
const O2 = { x: 222, y: 220, w: 140, h: 54 };
const SV = { x: 430, y: 150, w: 146, h: 100 };

function Kappa({ step, t, narrow }: SceneProps) {
  const head = LOG.x + LOG.w - 8;
  const prog = step < 2 ? 0 : step === 2 ? seg(t, 0.05, 0.95) : 1;
  const v2x = lerp(LOG.x + 8, head, prog);
  const hasV2 = step >= 1;
  const v2o = step === 1 ? seg(t, 0, 0.5) : hasV2 ? 1 : 0;
  const switched = step === 3 ? seg(t, 0.2, 0.6) : 0;
  const deleted = step === 3 ? seg(t, 0.6, 1) : 0;
  const secs = Math.round(prog * 10000);
  return (
    <g>
      <Txt x={LOG.x} y={LOG.y - 12} k="k" anchor="start">
        {narrow ? "Kafka log · 1B events" : "immutable Kafka log · 1 year · 1B events"}
      </Txt>
      <rect className="sk-log" x={LOG.x} y={LOG.y} width={LOG.w} height={LOG.h} />
      {Array.from({ length: 23 }, (_, i) => (
        <line key={i} className="sk-tick" x1={LOG.x + (i + 1) * 23} x2={LOG.x + (i + 1) * 23} y1={LOG.y + 6} y2={LOG.y + LOG.h - 6} />
      ))}
      {hasV2 && <rect className="sk-bar sky" x={LOG.x} y={LOG.y} width={v2x - LOG.x} height={LOG.h} opacity={0.45 * v2o} />}
      <Txt x={LOG.x + 8} y={LOG.y + 19} k="s" anchor="start">
        offset 0
      </Txt>
      <Txt x={LOG.x + LOG.w - 8} y={LOG.y + 19} k="s" anchor="end">
        head
      </Txt>
      {/* V2's read position (drawn first, so boxes sit on top) */}
      <g opacity={v2o}>
        <Wire d={`M${v2x} ${LOG.y + LOG.h}V${LOG.y + LOG.h + 12}H12V${V2.y + V2.h / 2}H${V2.x}`} tone="ok" arrow />
      </g>
      {/* V1 reads at the head */}
      <Wire d={`M${head} ${LOG.y + LOG.h}V${V1.y - 12}H${V1.x + V1.w / 2}V${V1.y}`} tone="lit" arrow opacity={1 - deleted * 0.7} />
      <Box x={V1.x} y={V1.y} w={V1.w} h={V1.h} label="V1 · Flink" sub={deleted >= 1 ? "stopped" : "live"} tone={deleted >= 1 ? "mute" : "lit"} dim={deleted >= 1} />
      <Wire d={`M${V1.x + V1.w} ${V1.y + V1.h / 2}H${O1.x}`} arrow opacity={1 - deleted * 0.7} />
      <Box x={O1.x} y={O1.y} w={O1.w} h={O1.h} label="Output V1" sub={deleted >= 1 ? "deleted" : undefined} tone={deleted >= 1 ? "bad" : undefined} dim={deleted >= 1} />
      {/* V2 replays from offset 0 */}
      <g opacity={v2o}>
        <Box x={V2.x} y={V2.y} w={V2.w} h={V2.h} label="V2 · Flink" sub={narrow ? "fixed" : "fixed logic"} tone="ok" />
        <Wire d={`M${V2.x + V2.w} ${V2.y + V2.h / 2}H${O2.x}`} arrow tone="ok" />
        <Box x={O2.x} y={O2.y} w={O2.w} h={O2.h} label="Output V2" sub={prog >= 1 ? "caught up" : "catching up"} tone={prog >= 1 ? "ok" : undefined} />
      </g>
      {/* serving */}
      <Wire d={`M${O1.x + O1.w} ${O1.y + O1.h / 2}H${SV.x}`} arrow tone={switched >= 1 ? "mute" : "lit"} opacity={1 - switched * 0.8} />
      <Wire d={`M${O2.x + O2.w} ${O2.y + O2.h / 2}C${SV.x - 30} ${O2.y + O2.h / 2} ${SV.x - 30} ${SV.y + SV.h - 24} ${SV.x} ${SV.y + SV.h - 24}`} arrow tone="lit" opacity={switched} />
      <Box x={SV.x} y={SV.y} w={SV.w} h={SV.h} label="Serving" sub={switched >= 1 ? "reads V2" : "reads V1"} tone="lit" />
      {step >= 2 && (
        <Txt x={SV.x + SV.w} y={H - 12} k="s" anchor="end" tone={prog >= 1 ? "ok" : "sky"}>
          {narrow
            ? `${secs.toLocaleString("en-US")} s ≈ ${(secs / 3600).toFixed(1)} h`
            : `1B ÷ 100K/s · ${secs.toLocaleString("en-US")} s ≈ ${(secs / 3600).toFixed(1)} h`}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "kappa" ? <Kappa {...p} /> : <Lambda {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sk-axis{stroke:var(--ax-line);stroke-width:1.5}
.sk-bar{fill:var(--ax-fg4)}.sk-bar.sky{fill:var(--ax-sky);opacity:.55}.sk-bar.lit{fill:var(--ax-accent);opacity:.75}
.sk-gone{fill:none;stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:5 5}
.sk-now{stroke:var(--ax-accent);stroke-width:1.5;stroke-dasharray:4 4}
.sk-log{fill:var(--ax-box);stroke:var(--ax-line);stroke-width:1.5}.sk-tick{stroke:var(--ax-line-soft);stroke-width:1.5}`,
  variants: [
    {
      id: "lambda",
      label: "Lambda",
      steps: [
        { caption: "Lambda: Spark's batch view, from the 12:00 run, covers 00:00–12:00; Flink's speed layer fills 12:00 to now.", tween: 1200 },
        { caption: "Query at 14:30 for today's revenue: the serving layer adds batch $50,000 and speed $12,000 = $62,000.", tween: 1400, ms: 3200 },
        { caption: "At 18:00 a new batch run covers everything to 18:00. The speed layer's 12:00–18:00 results are discarded.", tween: 2600, ms: 3400 },
        { caption: "The catch: the same logic lives twice, in Spark and in Flink. Two codebases drift, and the numbers disagree.", ms: 3600 },
      ],
    },
    {
      id: "kappa",
      label: "Kappa",
      steps: [
        { caption: "Kappa: one immutable Kafka log with long retention, one Flink codebase, one serving layer. V1 processes live events.", ms: 3200 },
        { caption: "A bug in the revenue logic? Start V2 with the fix, reading the log from the earliest offset.", tween: 1200 },
        { caption: "V2 replays 1B events at 100K/s: 10,000 seconds, about 3 hours. V1 keeps serving meanwhile.", tween: 3200, ms: 2800 },
        { caption: "V2 has caught up: switch the serving layer to Output V2, then delete Output V1.", tween: 1600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
