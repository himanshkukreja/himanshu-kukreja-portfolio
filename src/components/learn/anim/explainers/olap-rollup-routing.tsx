/**
 * Rollups and query routing (week 8, day 5 · preface / 2.1 / 4.1–4.2): the 90-day dashboard query
 * scans ~2.7B of fact_sales' ~11B rows (50GB shuffled, 47 s) until it reads agg_daily_sales
 * (~90K rows); then each question routes to the coarsest rollup that still answers it.
 */
import { defineExplainer, lerp, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const BX = 256;
const rowY = (i: number) => 74 + i * 62;
const CARD = { x: 24, y: 70, w: 196, h: 118 };

const LEVELS = [
  { name: "fact_sales", short: "raw", rows: 11e9, size: "~11B rows · 2TB", sizeN: "11B" },
  { name: "agg_hourly_sales", short: "hourly", rows: 8.7e6, size: "8.7M rows", sizeN: "8.7M" },
  { name: "agg_daily_sales", short: "daily", rows: 365e3, size: "365K rows", sizeN: "365K" },
  { name: "agg_monthly_sales", short: "monthly", rows: 12e3, size: "12K rows", sizeN: "12K" },
];
const barW = (rows: number) => (Math.log10(rows) - 3) * 44;

function Levels({ narrow, pick, tone, scan }: { narrow: boolean; pick: number; tone: Tone; scan?: number }) {
  return (
    <g>
      {LEVELS.map((l, i) => {
        const y = rowY(i);
        const on = i === pick;
        return (
          <g key={l.name} opacity={on ? 1 : 0.55}>
            <Txt x={BX} y={y - 10} k="s" anchor="start" tone={on ? tone : undefined}>
              {narrow ? `${l.short} · ${l.sizeN}` : `${l.name} · ${l.size}`}
            </Txt>
            <rect className={`or-bar${on ? ` ${tone || "lit"}` : ""}`} x={BX} y={y} width={barW(l.rows)} height={20} />
            {on && scan !== undefined && <rect className="or-scan" x={BX} y={y} width={barW(l.rows) * scan} height={20} />}
          </g>
        );
      })}
    </g>
  );
}

function Card({ lines, kicker, tone }: { lines: string[]; kicker: string; tone?: Tone }) {
  return (
    <g>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} />
      <Txt x={CARD.x + 12} y={CARD.y + 22} k="k" anchor="start">
        {kicker}
      </Txt>
      {lines.map((l, i) => (
        <Txt key={i} x={CARD.x + 12} y={CARD.y + 50 + i * 22} k="s" anchor="start" tone={i === 0 ? undefined : "mute"}>
          {l}
        </Txt>
      ))}
    </g>
  );
}

function route(from: number, to: number, p: number) {
  const y = lerp(rowY(from), rowY(to), p) + 10;
  return `M${CARD.x + CARD.w} ${CARD.y + CARD.h / 2}C${CARD.x + CARD.w + 20} ${CARD.y + CARD.h / 2} ${BX - 22} ${y} ${BX - 4} ${y}`;
}

function Scan({ step, t, narrow }: SceneProps) {
  const pick = step >= 2 ? 2 : 0;
  const move = step === 2 ? seg(t, 0, 0.6) : 1;
  const scan = step === 1 ? seg(t, 0.05, 0.9) : step === 0 ? 0 : 1;
  const secs = Math.round(scan * 47);
  const fast = step >= 2;
  const tone: Tone = fast ? "ok" : step === 1 ? "bad" : "lit";
  const big = step === 0 ? "~11B" : step === 1 ? `${secs} s` : step === 2 ? "365K" : "~90K";
  const done = step === 1 && secs >= 47;
  const small: string[] =
    step === 0
      ? [narrow ? "rows · ~30M/day" : "rows in fact_sales · ~30M/day"]
      : step === 1
        ? done
          ? ["~2.7B rows scanned", "50GB shuffled · timeout"]
          : [narrow ? "scanning 2.7B" : "scanning Q1 · ~2.7B rows"]
        : step === 2
          ? narrow ? ["rows a year", "day × category × region"] : ["rows a year:", "date × category × region"]
          : narrow ? ["rows: 90 d × 1,000", "milliseconds"] : ["rows read: 90 days × 1,000", "milliseconds, not 47 s"];
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={done ? "bad" : fast ? "ok" : undefined}>
        {fast ? (narrow ? "pre-aggregated" : "rollup · pre-aggregated") : narrow ? "raw scan" : "raw facts · no pre-aggregation"}
      </Txt>
      <Card kicker="dashboard" lines={narrow ? ["revenue by", "category, region,", "day · 90 days"] : ["revenue by", "category, region,", "day · last 90 days"]} tone={done ? "bad" : undefined} />
      <path className={`or-route ${tone}`} d={route(0, pick, step === 2 ? move : 1)} />
      <Levels narrow={narrow} pick={pick} tone={tone} scan={step === 1 ? scan * (2.7 / 11) : undefined} />
      <Txt x={CARD.x} y={252} k="d" anchor="start" tone={done ? "bad" : fast ? "ok" : undefined}>
        {big}
      </Txt>
      {small.map((l, i) => (
        <Txt key={i} x={CARD.x} y={278 + i * 20} k="s" anchor="start" tone={done ? "bad" : fast ? "ok" : undefined}>
          {l}
        </Txt>
      ))}
    </g>
  );
}

const QS = [
  { q: ["last 24 hours", "by hour"], to: 1, why: "365 days × 24 h × 1,000", whyN: "hours × 1,000 combos" },
  { q: ["last 90 days", "by day"], to: 2, why: "monthly can't split by day", whyN: "monthly has no days" },
  { q: ["last 2 years", "by month"], to: 3, why: "12 months × 1,000 combos", whyN: "12 months × 1,000" },
  { q: ["specific", "transactions"], to: 0, why: "rollups hold sums, not rows", whyN: "only raw has rows" },
];

function Routing({ step, t, narrow }: SceneProps) {
  const q = QS[step];
  const prev = QS[Math.max(0, step - 1)];
  const p = step === 0 ? seg(t, 0, 0.7) : seg(t, 0.1, 0.7);
  const from = step === 0 ? q.to : prev.to;
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "query routing" : "query routing · coarsest table that answers"}
      </Txt>
      <Card kicker={`question ${step + 1}/4`} lines={q.q} tone="lit" />
      <path className="or-route lit" d={route(from, q.to, step === 0 ? 1 : p)} opacity={step === 0 ? p : 1} />
      <Levels narrow={narrow} pick={q.to} tone={q.to === 0 ? "warn" : "ok"} />
      <Txt x={CARD.x} y={CARD.y + CARD.h + 36} k="t" anchor="start" tone={q.to === 0 ? "warn" : "ok"} opacity={seg(t, 0.4, 0.9)}>
        {`→ ${narrow ? LEVELS[q.to].short : LEVELS[q.to].name}`}
      </Txt>
      <Txt x={CARD.x} y={CARD.y + CARD.h + 60} k="s" anchor="start" opacity={seg(t, 0.4, 0.9)}>
        {narrow ? q.whyN : q.why}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "routing" ? <Routing {...p} /> : <Scan {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.or-bar{fill:var(--ax-fg4);opacity:.5}.or-bar.lit{fill:var(--ax-accent);opacity:.8}.or-bar.ok{fill:var(--ax-ok);opacity:.75}.or-bar.bad{fill:var(--ax-bad);opacity:.45}.or-bar.warn{fill:var(--ax-amber);opacity:.75}
.or-scan{fill:var(--ax-bad);opacity:.85}
.or-route{fill:none;stroke:var(--ax-line);stroke-width:2}.or-route.lit{stroke:var(--ax-accent);stroke-width:2.5}.or-route.ok{stroke:var(--ax-ok);stroke-width:2.5}.or-route.bad{stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "scan",
      label: "Raw vs rollup",
      steps: [
        { caption: "The marketing dashboard asks for revenue by category, region and day over 90 days. fact_sales holds ~11B rows.", ms: 3200 },
        { caption: "Even with the date filter, the query scans ~2.7B rows and shuffles 50GB: 47 seconds, and the dashboard times out.", tween: 3000, ms: 2800 },
        { caption: "The daily rollup agg_daily_sales keeps one row per date, category and region: 365K rows for a whole year.", tween: 1400, ms: 3000 },
        { caption: "The same question reads 90 days × 1,000 combos, about 90K rows instead of 2.7B: milliseconds, not 47 seconds.", ms: 3600 },
      ],
    },
    {
      id: "routing",
      label: "Query routing",
      steps: [
        { caption: "Last 24 hours by hour → agg_hourly_sales, 8.7M rows: 365 days × 24 hours × 1,000 combos.", tween: 1200, ms: 3000 },
        { caption: "Last 90 days by day → agg_daily_sales, 365K rows. Monthly is smaller but can't break down by day.", tween: 1200, ms: 3200 },
        { caption: "Last 2 years by month → agg_monthly_sales, the smallest table: 12 months × 1,000 combos per year.", tween: 1200, ms: 3000 },
        { caption: "Drilling into specific transactions → only raw fact_sales has them: ~11B rows, 2TB. Rollups hold sums, not rows.", tween: 1200, ms: 3400 },
      ],
    },
  ],
  Scene,
});
