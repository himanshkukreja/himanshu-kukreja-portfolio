/**
 * Whole-lesson overview (week 8, day 4 · late-arriving data): the problem (the weekend flash sale
 * that grew by $127,000 overnight, and the 14:30 subway purchase that lands 75 minutes late), the
 * mechanism (event time, watermarks, allowed lateness, side output, tolerance from measured
 * lateness), and corrections (patch vs reprocess, versioned results, T+1 / T+7 finalization,
 * live vs final labels).
 */
import { Box, defineExplainer, lerp, seg, Token, tween, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const SX = 12;
const SW = 96;
const SRC: [string, string][] = [
  ["Web", "Web"],
  ["Mobile", "Mobile"],
  ["Partners", "Partner"],
];
const SY = (i: number) => 52 + i * 46;
const SH = 34;
const BY = 52;
const BH = 126;
const BW = 134;
const BX = [128, 272];
const DX = 426;
const DW = 162;
/** event-time axis: minutes after 14:00 → x (14:00 at the first window's left edge, 16:00 at the second's right) */
const ax = (m: number) => (m <= 60 ? lerp(128, 267, m / 60) : lerp(267, 406, (m - 60) / 60));
const AY = 262;

type Tn = Tone | "dim";

function Sources({ tones, narrow }: { tones: Tn[]; narrow: boolean }) {
  return (
    <g>
      {SRC.map(([w, n], i) => (
        <Box key={w} x={SX} y={SY(i)} w={SW} h={SH} label={narrow ? n : w} tone={tones[i] === "dim" ? undefined : tones[i]} dim={tones[i] === "dim"} />
      ))}
    </g>
  );
}

function Bucket({ i, head, value, sub, tone, dim, dash }: { i: number; head: string; value?: string; sub?: string; tone?: Tone; dim?: boolean; dash?: boolean }) {
  const x = BX[i];
  return (
    <g opacity={dim ? 0.32 : 1}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}${dash ? " ax-dash" : ""}`} x={x} y={BY} width={BW} height={BH} />
      <Txt x={x + BW / 2} y={BY + 22} k="s">
        {head}
      </Txt>
      {value && (
        <Txt x={x + BW / 2} y={BY + 72} k="t" tone={tone || undefined}>
          {value}
        </Txt>
      )}
      {sub && (
        <Txt x={x + BW / 2} y={BY + 104} k="s" tone={tone || undefined}>
          {sub}
        </Txt>
      )}
    </g>
  );
}

function Dash({ head, value, sub, tone, dim }: { head: string; value?: string; sub?: string; tone?: Tone; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.32 : 1}>
      <Wire d={`M${BX[1] + BW} ${BY + BH / 2}H${DX}`} arrow />
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={DX} y={BY} width={DW} height={BH} />
      <Txt x={DX + DW / 2} y={BY + 22} k="s">
        {head}
      </Txt>
      {value && (
        <Txt x={DX + DW / 2} y={BY + 72} k="t">
          {value}
        </Txt>
      )}
      {sub && (
        <Txt x={DX + DW / 2} y={BY + 104} k="s" tone={tone || undefined}>
          {sub}
        </Txt>
      )}
    </g>
  );
}

/** a token flying from source row s into bucket b, p in 0..1 */
const fly = (s: number, b: number, p: number, dy = 0) => ({ x: lerp(SX + SW, BX[b] + BW / 2, p), y: lerp(SY(s) + SH / 2, BY + BH - 30 + dy, p) });

const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

function Problem({ step, t, narrow }: SceneProps) {
  const hours = step >= 3;
  const p = seg(t, 0.05, 0.75);
  const sat = tween(step, t, [1250000, 1312000]);
  const sun = tween(step, t, [1180000, 1245000]);
  const chips = narrow ? ["offline mobile", "payments late", "manual entries", "timezones"] : ["offline mobile purchases", "payment confirmations late", "manual entries on Monday", "timezone date shifts"];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {hours ? (narrow ? "event vs processing time" : "event time vs processing time") : step === 0 ? (narrow ? "Sun 11:59 PM" : "weekend flash sale · Sunday 11:59 PM") : narrow ? "Mon 9:00 AM" : "the same weekend · Monday 9:00 AM"}
      </Txt>
      <Sources narrow={narrow} tones={hours ? ["dim", "lit", "dim"] : step === 0 ? [undefined, "dim", "dim"] : step === 2 ? ["dim", "warn", "warn"] : [undefined, "warn", "warn"]} />
      {!hours ? (
        <g>
          <Bucket i={0} head="Saturday" value={money(sat)} sub={step >= 1 ? "+$62,000" : undefined} tone={step >= 1 ? "warn" : undefined} />
          <Bucket i={1} head="Sunday" value={money(sun)} sub={step >= 1 ? "+$65,000" : undefined} tone={step >= 1 ? "warn" : undefined} />
          <Dash head={narrow ? "total" : "dashboard total"} value={money(sat + sun)} sub={step === 0 ? "looks final" : narrow ? "which one?" : "which one is right?"} tone={step === 0 ? undefined : "bad"} />
          {step === 1 && t < 1 && [1, 2].map((s) => [0, 1].map((b) => <Token key={`${s}${b}`} {...fly(s, b, p)} s={9} tone="warn" />))}
          {step >= 1 && (
            <Txt x={W / 2} y={232} k="d" tone="warn" opacity={step === 1 ? seg(t, 0.5, 1) : 1}>
              +$127,000
            </Txt>
          )}
          {step === 1 && (
            <Txt x={W / 2} y={262} k="s" opacity={seg(t, 0.6, 1)}>
              {narrow ? "incomplete, not wrong" : "the dashboard wasn't wrong, it was incomplete"}
            </Txt>
          )}
          {step === 2 &&
            chips.map((c, i) => (
              <g key={c} opacity={seg(t, i * 0.15, i * 0.15 + 0.35)}>
                <rect className="ax-box warn" x={narrow ? 24 + (i % 2) * 280 : 28 + (i % 2) * 276} y={250 + Math.floor(i / 2) * 32} width={268} height={26} />
                <Txt x={(narrow ? 24 + (i % 2) * 280 : 28 + (i % 2) * 276) + 134} y={268 + Math.floor(i / 2) * 32} k="s" tone="warn">
                  {c}
                </Txt>
              </g>
            ))}
        </g>
      ) : (
        <g>
          <Bucket i={0} head="14:00–15:00" sub={step === 4 ? (narrow ? "correct" : "event time ✓") : undefined} tone={step === 4 ? "ok" : undefined} />
          <Bucket i={1} head="15:00–16:00" sub={step === 3 ? (narrow ? "wrong hour" : "wrong hour ✗") : undefined} tone={step === 3 ? "bad" : undefined} dim={step === 4} />
          <Dash head={narrow ? "hourly" : "hourly revenue"} dim />
          <Token {...fly(1, step === 3 ? 1 : 0, step === 3 ? p : 1, -20)} s={12} tone={step === 3 ? "bad" : "ok"} label="14:30" />
          <Wire d={`M${ax(30)} ${AY}H${ax(105)}`} tone="warn" dash />
          <Token x={ax(30)} y={AY} s={10} tone="ok" />
          <Token x={ax(105)} y={AY} s={10} tone="bad" />
          <Txt x={ax(30)} y={AY + 26} k="s" tone="ok">
            {narrow ? "14:30" : "event 14:30"}
          </Txt>
          <Txt x={ax(105)} y={AY + 26} k="s" tone="bad">
            {narrow ? "15:45" : "arrives 15:45"}
          </Txt>
          <Txt x={(ax(30) + ax(105)) / 2} y={AY - 12} k="s" tone="warn">
            75 min late
          </Txt>
          <Txt x={DX + DW / 2} y={AY + 4} k="s" tone="mute">
            {narrow ? "subway" : "bought on the subway"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const WM = [45, 62, 70, 95, 95];
const MAXS = [50, 67, 75, 100, 100];

function Marks({ step, t, narrow }: SceneProps) {
  const wm = tween(step, t, WM);
  const mx = tween(step, t, MAXS);
  const fired = wm >= 60;
  const freed = step === 3 && seg(t, 0, 0.5) >= 1;
  const p = seg(t, 0.2, 0.85);
  const pct = [["p50", "2 s"], ["p90", "30 s"], ["p99", "5 min"], ["max", "72 h"]];
  const w0: { value?: string; sub?: string; tone?: Tone } =
    step === 0 ? { sub: "open" } : step === 1 ? { value: "$50,000", sub: "fired", tone: fired ? "lit" : undefined } : step === 2 ? { value: "updated", sub: "late update", tone: "ok" } : step === 3 ? { sub: freed ? "state freed" : "fired", tone: undefined } : { sub: "fired" };
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {step === 4 ? (narrow ? "tolerance from data" : "tolerance comes from measured lateness") : narrow ? "watermark = max − 5 min" : "watermark = max event time seen − 5 min"}
      </Txt>
      <Sources narrow={narrow} tones={step === 2 ? ["dim", "lit", "dim"] : step === 3 ? ["dim", "dim", "bad"] : step === 4 ? [undefined, undefined, undefined] : [undefined, undefined, "dim"]} />
      {step < 4 ? (
        <g>
          <Bucket i={0} head="14:00–15:00" value={w0.value} sub={w0.sub} tone={w0.tone} dash={step === 3 && freed} />
          <Bucket i={1} head="15:00–16:00" sub={step >= 3 ? "fired" : "open"} />
        </g>
      ) : (
        ["5 minutes", "4 hours", "24 hours"].map((v, i) => (
          <g key={v} opacity={seg(t, 0.5 + i * 0.15, 0.7 + i * 0.15)}>
            <Wire d={`M${SX + SW} ${SY(i) + SH / 2}H${BX[0] - 4}`} tone="lit" />
            <Txt x={BX[0]} y={SY(i) + SH / 2 + 5} k="t" tone="lit" anchor="start">
              {v}
            </Txt>
          </g>
        ))
      )}
      <Dash head="dashboard" value={step === 1 ? "$50,000" : step === 2 ? "updated" : undefined} sub={step === 1 || step === 2 ? "live" : undefined} tone={step === 1 || step === 2 ? "lit" : undefined} dim={step === 0 || step === 4} />
      {step === 2 && t < 1 && <Token {...fly(1, 0, p, -60)} s={11} tone="ok" label="late" />}
      {step === 3 && (
        <g>
          <Wire d={`M${SX + SW} ${SY(2) + SH / 2}C${SX + SW + 60} ${SY(2) + SH / 2} ${DX - 40} ${232} ${DX} ${232}`} tone="bad" dash />
          <Box x={DX} y={214} w={DW} h={36} label="late_events" tone="bad" opacity={seg(t, 0.3, 0.7)} />
          {t < 1 && <Token x={lerp(SX + SW, DX, seg(t, 0.4, 1))} y={lerp(SY(2) + SH / 2, 232, seg(t, 0.4, 1))} s={10} tone="bad" />}
          <Txt x={DX + DW / 2} y={272} k="s" tone="bad">
            side output
          </Txt>
        </g>
      )}
      {step < 4 ? (
        <g>
          <line className="ax-wire" x1={ax(0)} x2={ax(120)} y1={AY} y2={AY} />
          {[0, 60, 120].map((m) => (
            <Txt key={m} x={ax(m)} y={AY + 22} k="s">
              {["14:00", "15:00", "16:00"][m / 60]}
            </Txt>
          ))}
          {step >= 2 && (
            <g>
              <rect className="ax-fill warn" x={ax(60)} y={AY - 4} width={ax(90) - ax(60)} height={8} opacity={0.5} />
              {!narrow && (
                <Txt x={ax(75)} y={AY + 40} k="s" tone="warn">
                  allowed lateness 30 min
                </Txt>
              )}
            </g>
          )}
          <line className="ax-wire lit" x1={ax(wm)} x2={ax(wm)} y1={BY + BH + 12} y2={AY + 6} />
          <Txt x={ax(wm) - 6} y={BY + BH + 26} k="s" tone="lit" anchor="end">
            W
          </Txt>
          <Token x={ax(mx)} y={AY} s={9} tone="sky" />
          {!narrow && (
            <Txt x={ax(mx) + 8} y={AY - 10} k="s" tone="sky" anchor="start">
              max
            </Txt>
          )}
        </g>
      ) : (
        pct.map(([a, b], i) => (
          <g key={a} opacity={seg(t, i * 0.15, i * 0.15 + 0.35)}>
            <rect className={`ax-box${i === 2 ? " lit" : ""}`} x={128 + i * 117} y={210} width={109} height={62} />
            <Txt x={128 + i * 117 + 54.5} y={234} k="s">
              {a}
            </Txt>
            <Txt x={128 + i * 117 + 54.5} y={260} k="t" tone={i === 2 ? "lit" : undefined}>
              {b}
            </Txt>
          </g>
        ))
      )}
      {step === 4 && (
        <Txt x={128} y={298} k="s" anchor="start" tone="lit">
          {narrow ? "p99 5 min → ~99%" : "5 minutes captures ~99% of events"}
        </Txt>
      )}
    </g>
  );
}

const VERS: [string, string, string][] = [
  ["v1", "$50,000", "initial"],
  ["v2", "$52,500", "late_data"],
  ["v3", "$53,200", "final"],
];
const TIERS: [string, string, string, Tone][] = [
  ["T+0", "$10M", "live", "lit"],
  ["T+1", "$10.2M", "preliminary", "warn"],
  ["T+7", "$10.25M", "final", "ok"],
];
const RULES: [string, string][] = [
  ["event time", "event time"],
  ["measured watermarks", "watermarks"],
  ["nothing dropped silently", "no silent drops"],
  ["versions, not overwrites", "versions"],
];

function Fix({ step, t, narrow }: SceneProps) {
  const vi = Math.min(2, Math.floor(seg(t, 0, 0.99) * 3));
  const ver = step === 1 ? vi : 2;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {["patch or reprocess", narrow ? "versions" : "versions, not overwrites", narrow ? "finalize" : "finalize on a schedule", narrow ? "live vs final" : "label live vs final"][step]}
      </Txt>
      <Sources narrow={narrow} tones={["dim", "dim", "dim"]} />
      {step === 0 ? (
        <g>
          <Bucket i={0} head="PATCH" value="+$500" sub="$100,500" tone="ok" />
          <Bucket i={1} head="REPROCESS" value={narrow ? "raw → all" : "re-read raw"} sub="overwrite" tone="sky" />
          <Txt x={BX[0] + BW / 2} y={214} k="s" tone="ok">
            {narrow ? "SUM, COUNT" : "SUM · COUNT"}
          </Txt>
          <Txt x={BX[1] + BW / 2} y={214} k="s" tone="sky">
            {narrow ? "AVG, DISTINCT" : "AVG · DISTINCT"}
          </Txt>
          <Txt x={W / 2} y={262} k="s">
            {narrow ? "additive → patch" : "additive and small → patch · non-additive → reprocess"}
          </Txt>
        </g>
      ) : (
        <g>
          <Bucket i={0} head="14:00–15:00" value={step === 1 ? VERS[ver][1] : undefined} sub={step === 1 ? VERS[ver][0] : step === 2 ? "streaming" : undefined} tone={step === 1 ? (ver === 2 ? "ok" : "lit") : undefined} dim={step === 3} />
          <Bucket i={1} head={narrow ? "batch" : "daily batch"} sub={step === 2 ? "T+1, T+7" : undefined} tone={step === 2 ? "sky" : undefined} dim={step !== 2} />
          <Dash
            head="dashboard"
            value={step === 1 ? VERS[ver][1] : step === 2 ? TIERS[2][1] : narrow ? "live" : "Today (live)"}
            sub={step === 1 ? (ver === 2 ? "final" : "live") : step === 2 ? "final" : narrow ? "+ yesterday" : "Yesterday (final)"}
            tone={step === 1 ? (ver === 2 ? "ok" : "lit") : step === 2 ? "ok" : "lit"}
          />
        </g>
      )}
      {step === 1 &&
        VERS.map(([v, val, why], i) => (
          <g key={v} opacity={i <= vi ? 1 : 0.25}>
            <rect className={`ax-box${i === ver ? (i === 2 ? " ok" : " lit") : ""}`} x={128 + i * 154} y={206} width={146} height={56} />
            <Txt x={128 + i * 154 + 73} y={228} k="t">
              {`${v} ${val}`}
            </Txt>
            <Txt x={128 + i * 154 + 73} y={250} k="s">
              {why}
            </Txt>
          </g>
        ))}
      {step === 1 && (
        <Txt x={W - 12} y={292} k="s" anchor="end" tone="ok" opacity={vi === 2 ? 1 : 0}>
          {narrow ? "+6.4% total" : "+6.4% from initial to final"}
        </Txt>
      )}
      {step === 2 &&
        TIERS.map(([d, v, l, tn], i) => (
          <g key={d} opacity={seg(t, i * 0.25, i * 0.25 + 0.35)}>
            <rect className={`ax-box ${tn}`} x={128 + i * 154} y={206} width={146} height={66} />
            <Txt x={128 + i * 154 + 73} y={226} k="s" tone={tn}>
              {d}
            </Txt>
            <Txt x={128 + i * 154 + 73} y={248} k="t">
              {v}
            </Txt>
            <Txt x={128 + i * 154 + 73} y={266} k="s">
              {l}
            </Txt>
          </g>
        ))}
      {step === 2 && (
        <Txt x={W - 12} y={300} k="s" anchor="end" opacity={seg(t, 0.8, 1)}>
          {narrow ? "day 8+: adjustments" : "day 8+: immutable, changes are adjustments"}
        </Txt>
      )}
      {step === 3 &&
        RULES.map(([w, n], i) => (
          <g key={w} opacity={seg(t, i * 0.15, i * 0.15 + 0.35)}>
            <rect className="ax-box ok" x={24 + (i % 2) * 280} y={214 + Math.floor(i / 2) * 36} width={268} height={28} />
            <Txt x={24 + (i % 2) * 280 + 134} y={233 + Math.floor(i / 2) * 36} k="s" tone="ok">
              {narrow ? n : w}
            </Txt>
          </g>
        ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "problem" ? <Problem {...p} /> : p.variant === "marks" ? <Marks {...p} /> : <Fix {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The time problem",
      steps: [
        { caption: "Sunday 11:59 PM: the dashboard shows $2,430,000 of weekend flash sale revenue.", tween: 900 },
        { caption: "Monday 9 AM, the same weekend reads $2,557,000: $127,000 more. The dashboard wasn't wrong, it was incomplete.", tween: 1800 },
        { caption: "Mobile purchases made offline synced late, payment confirmations were delayed, and manual orders posted on Monday.", tween: 1600 },
        { caption: "A user buys at 14:30 on the subway, and the event arrives at 15:45. Windowed by processing time, it lands in the wrong hour.", tween: 1600 },
        { caption: "Event time is when it happened, the business truth. Windowed by event time, the purchase counts in the 14:00 hour.", tween: 900 },
      ],
    },
    {
      id: "marks",
      label: "Watermarks",
      steps: [
        { caption: "A watermark says: all events up to W have probably arrived. It trails the max event time seen by a 5-minute bound.", tween: 900 },
        { caption: "When the watermark passes 15:00, the 14:00 window fires and the dashboard gets a number. It is live, not final.", tween: 1600 },
        { caption: "A late event for the 14:00 hour arrives after the window fired. Within 30 minutes of allowed lateness, the result still updates.", tween: 1600 },
        { caption: "Past window end plus allowed lateness, the state is freed. Later events go to a side output, late_events: never dropped silently.", tween: 1800 },
        { caption: "Set tolerance from measured lateness: p99 of 5 minutes captures about 99%. And per source: web 5 minutes, mobile 4 hours.", tween: 1400 },
      ],
    },
    {
      id: "fix",
      label: "Corrections",
      steps: [
        { caption: "Additive metrics like SUM and COUNT can be patched: $100,000 plus a $500 late event is $100,500. AVG or DISTINCT need a reprocess.", tween: 900 },
        { caption: "Store versions, not overwrites. The 14:00 window: $50,000 initial, $52,500 after late data, $53,200 final: +6.4%.", tween: 2400 },
        { caption: "Finalize on a schedule: $10M live on day 0, $10.2M preliminary at T+1, $10.25M final at T+7. After that, only adjustments.", tween: 1600 },
        { caption: "Label every number live or final, and alert on final numbers. The rules: event time, measured watermarks, no silent drops, versions.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
