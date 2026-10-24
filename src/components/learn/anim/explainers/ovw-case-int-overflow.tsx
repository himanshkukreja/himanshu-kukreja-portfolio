/**
 * The whole case file "The integer overflow crisis": event_log's 32-bit auto-increment ID hits
 * 2,147,483,647 after ~18 months at ~4M events a day, and inserts fail silently; how each database
 * fails; the three emergency options (BIGINT, table split, reset); then UUIDs, Snowflake-style IDs,
 * ID-space alerts at 50/70/90%, and "default to BIGINT".
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Txt, Wire, type SceneProps, type Tone } from "../kit";


const W = 600;
const H = 340;
type L = string | readonly [string, string];
const pk = (l: L, n: boolean) => (typeof l === "string" ? l : n ? l[1] : l[0]);
const fade = (t: number, i = 0, n = 0.14) => ease(seg(t, 0.1 + i * n, 0.4 + i * n));

function Head({ k, c, tone, narrow }: { k: L; c?: L; tone?: Tone; narrow: boolean }) {
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={tone}>
        {pk(k, narrow)}
      </Txt>
      {c && (
        <Txt x={W - 16} y={28} k="k" anchor="end" tone={tone || "mute"}>
          {pk(c, narrow)}
        </Txt>
      )}
    </g>
  );
}

function Chips({ items, t, y = 290, tone, narrow }: { items: L[]; t: number; y?: number; tone?: Tone; narrow: boolean }) {
  const w = (W - 32 - (items.length - 1) * 8) / items.length;
  return (
    <g>
      {items.map((l, i) => {
        const x = 16 + i * (w + 8);
        return (
          <g key={i} opacity={fade(t, i)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={32} />
            <Txt x={x + w / 2} y={y + 21} k="s" tone={tone}>
              {pk(l, narrow)}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Figs({ items, t, y = 288, narrow }: { items: [L, L, Tone?][]; t: number; y?: number; narrow: boolean }) {
  const w = W / items.length;
  return (
    <g>
      {items.map(([d, s, tone], i) => (
        <g key={i} opacity={fade(t, i, 0.18)}>
          <Txt x={w * (i + 0.5)} y={y} k="d" tone={tone}>
            {pk(d, narrow)}
          </Txt>
          <Txt x={w * (i + 0.5)} y={y + 28} k="s">
            {pk(s, narrow)}
          </Txt>
        </g>
      ))}
    </g>
  );
}

const MAX = 2147483647;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Ceiling({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["2 AM · PagerDuty", "2 AM"]} c="event_log" tone="bad" narrow={narrow} />
        <Txt x={300} y={110} k="d" tone="bad">
          {fmt(MAX)}
        </Txt>
        <Txt x={300} y={140} k="s">
          {narrow ? "max 32-bit signed int" : "the largest 32-bit signed integer"}
        </Txt>
        <Box x={16} y={168} w={180} h={56} label="INSERT" sub="fails" tone="bad" />
        <Wire d="M196 196H222" arrow tone="bad" />
        <Box x={222} y={168} w={180} h={56} label="Writer" sub={narrow ? "swallows it" : "swallows errors"} tone="warn" />
        <Wire d="M402 196H428" arrow />
        <Box x={428} y={168} w={156} h={56} label={narrow ? "Silence" : "No new events"} tone="mute" />
        <Chips items={[["no crash", "no crash"], ["no DB error seen", "no alert"], ["just nothing", "nothing"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const used = ease(t);
    return (
      <g>
        <Head k={["the math catches up", "the math"]} c={["~18 months", "18 months"]} narrow={narrow} />
        <Txt x={16} y={70} k="s" anchor="start">
          {narrow ? "ID space used" : "32-bit ID space used"}
        </Txt>
        <Meter x={16} y={82} w={568} h={26} value={used} max={1} tone={used > 0.9 ? "bad" : used > 0.5 ? "warn" : "ok"} ticks={10} />
        <Txt x={584} y={136} k="t" anchor="end" tone={used > 0.99 ? "bad" : undefined}>
          {fmt(lerp(0, MAX, used))}
        </Txt>
        <Figs items={[["~4M", narrow ? "events/day" : "events a day"], ["~540", narrow ? "days" : "days running"], ["~2.15B", narrow ? "IDs used" : "IDs, all of them", "bad"]]} y={230} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const dbs: [string, string, string, Tone][] = [
      ["MySQL", "duplicate-key errors", "dup key", "warn"],
      ["PostgreSQL", "integer out of range", "out of range", "warn"],
      ["SQL Server", "arithmetic overflow", "overflow", "warn"],
      ["Oracle CYCLE", "wraps, reissues old IDs", "reuses IDs", "bad"],
    ];
    return (
      <g>
        <Head k={["past the ceiling", "past the max"]} narrow={narrow} />
        {dbs.map(([l, w, n, tone], i) => (
          <g key={l} opacity={fade(t, i, 0.15)}>
            <rect className={`ax-box ${tone}`} x={16} y={50 + i * 56} width={568} height={44} />
            <Txt x={30} y={77 + i * 56} k="t" anchor="start">
              {l}
            </Txt>
            <Txt x={570} y={77 + i * 56} k="s" anchor="end" tone={tone}>
              {narrow ? n : w}
            </Txt>
          </g>
        ))}
        <Chips items={[["MySQL hands out the same value again", "same value again"]]} t={seg(t, 0.5, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["the silent killer", "silent"]} tone="bad" narrow={narrow} />
      <Box x={16} y={56} w={270} h={70} label="Reads" sub={narrow ? "look healthy" : "respond normally"} tone="ok" />
      <Box x={314} y={56} w={270} h={70} label="Writes" sub={narrow ? "fail quietly" : "fail quietly, unseen"} tone="bad" />
      <Box x={16} y={150} w={270} h={70} label="Connections" sub="stay up" tone="ok" />
      <Box x={314} y={150} w={270} h={70} label="Metrics" sub={narrow ? "“stable”" : "show “stable”"} tone="warn" />
      <Chips items={[["analytics dead", "analytics"], ["recs failing", "recs"], ["revenue broken", "revenue"]]} t={t} tone="bad" narrow={narrow} />
    </g>
  );
}

function Fix({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["option 1 · INT → BIGINT", "1 · BIGINT"]} c={["permanent fix", "permanent"]} tone="ok" narrow={narrow} />
        <Box x={16} y={60} w={220} h={70} label="INT" sub="4 bytes · 2.1B" tone="bad" />
        <Wire d="M236 95H364" arrow tone="ok" />
        <Txt x={300} y={84} k="s" tone="ok">
          {narrow ? "online" : "online copy"}
        </Txt>
        <Box x={364} y={60} w={220} h={70} label="BIGINT" sub={narrow ? "8 B · 9.2 quint." : "8 bytes · 9.2 quintillion"} tone="ok" />
        <Txt x={300} y={176} k="s">
          {narrow ? "pt-online-schema-change" : "pt-online-schema-change · test on a replica first"}
        </Txt>
        <Figs items={[["~5–11 h", narrow ? "to recover" : "to full recovery"], ["near zero", narrow ? "downtime" : "downtime, online", "ok"]]} y={252} t={seg(t, 0.3, 1)} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["option 2 · split the table", "2 · split"]} c={["zero downtime", "no downtime"]} tone="sky" narrow={narrow} />
        <Box x={16} y={110} w={150} h={64} label="App" sub={narrow ? "dual write" : "writes both"} tone="lit" />
        <Wire d="M166 130H210V86H250" arrow />
        <Wire d="M166 154H210V198H250" arrow tone="ok" />
        <Box x={250} y={56} w={200} h={60} label="event_log" sub="INT, full" tone="mute" />
        <Box x={250} y={168} w={200} h={60} label={narrow ? "event_log_v2" : "event_log_v2"} sub={narrow ? "BIGINT" : "BIGINT, high start"} tone="ok" />
        <Wire d="M450 86H480V142H500" arrow dash />
        <Wire d="M450 198H480V142H500" arrow dash />
        <Box x={500} y={110} w={84} h={64} label="Reads" sub="union" />
        <Chips items={[["low risk", "low risk"], ["high complexity", "complex"], ["weeks to finish", "weeks"]]} t={t} tone="sky" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["option 3 · reset", "3 · reset"]} c={["high risk", "high risk"]} tone="bad" narrow={narrow} />
        <Box x={16} y={70} w={260} h={80} label="TRUNCATE" sub={narrow ? "restart at 1" : "restart the ID at 1"} tone="bad" />
        <Wire d="M276 110H324" arrow tone="bad" />
        <Box x={324} y={70} w={260} h={80} label={narrow ? "History" : "All history"} sub="lost" tone="bad" />
        <Txt x={300} y={196} k="s" opacity={fade(t, 2)}>
          {narrow ? "only if data is replaceable" : "only if the data is archived or replaceable"}
        </Txt>
        <Chips items={[["minutes to do", "fast"], ["complete data loss", "data loss"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  const rows: [string, string, string, Tone][] = [
    ["critical table", "BIGINT migration", "BIGINT", "ok"],
    ["analytics / logs", "table split or UUID", "split / UUID", "sky"],
    ["replaceable data", "reset", "reset", "bad"],
  ];
  return (
    <g>
      <Head k={["choose by the table", "which option?"]} narrow={narrow} />
      {rows.map(([k, v, n, tone], i) => (
        <g key={k} opacity={fade(t, i, 0.16)}>
          <rect className={`ax-box ${tone}`} x={16} y={56 + i * 62} width={568} height={50} />
          <Txt x={30} y={86 + i * 62} k="s" anchor="start">
            {k}
          </Txt>
          <Txt x={570} y={86 + i * 62} k="t" anchor="end" tone={tone}>
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
      <Chips items={[["first 15 minutes: confirm, scope, alert", "assess in 15 min"]]} t={seg(t, 0.5, 1)} narrow={narrow} />
    </g>
  );
}

function Never({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["UUID keys", "UUID"]} c="128 bits" tone="sky" narrow={narrow} />
        <Box x={16} y={60} w={270} h={70} label="Benefits" sub={narrow ? "unique anywhere" : "unique, no coordination"} tone="ok" />
        <Box x={314} y={60} w={270} h={70} label="Costs" sub={narrow ? "16 B, fragments" : "16 bytes, index fragments"} tone="warn" />
        <Txt x={300} y={180} k="s" opacity={fade(t, 2)}>
          {narrow ? "UUIDv7: time-ordered" : "random v4 has no order; time-ordered UUIDv7 fixes that"}
        </Txt>
        <Chips items={[["never realistically overflows", "no overflow"]]} t={t} tone="sky" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const parts: [string, number, Tone][] = [
      ["timestamp", 41, "lit"],
      ["machine", 10, "sky"],
      ["sequence", 12, "ok"],
    ];
    let x = 16;
    return (
      <g>
        <Head k={["Snowflake IDs", "Snowflake"]} c={["64-bit integer", "64 bits"]} tone="lit" narrow={narrow} />
        {parts.map(([l, b, tone], i) => {
          const w = (568 * b) / 63;
          const el = (
            <g key={l} opacity={fade(t, i, 0.16)}>
              <rect className={`ax-box ${tone}`} x={x} y={70} width={w - 4} height={60} />
              <Txt x={x + (w - 4) / 2} y={106} k="t" tone={tone}>
                {i ? String(b) : narrow ? "41 bits" : "41 bits"}
              </Txt>
              <Txt x={x + (w - 4) / 2} y={152} k="s">
                {l}
              </Txt>
            </g>
          );
          x += w;
          return el;
        })}
        <Txt x={300} y={204} k="s" opacity={fade(t, 3)}>
          {narrow ? "4,096 IDs/ms/machine" : "1,024 machines · 4,096 IDs per millisecond each"}
        </Txt>
        <Chips items={[["roughly time-ordered", "time-ordered"], ["still an integer", "integer"], ["Instagram: 41·13·10", "Instagram too"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const marks: [number, string, Tone][] = [
      [0.5, "50% warn", "warn"],
      [0.7, "70% critical", "bad"],
      [0.9, "90% emergency", "bad"],
    ];
    return (
      <g>
        <Head k={["monitor the math", "monitor"]} c={["ID utilisation", "utilisation"]} tone="warn" narrow={narrow} />
        <Meter x={16} y={90} w={568} h={26} value={ease(t) * 0.95} max={1} tone={t > 0.75 ? "bad" : "warn"} />
        {marks.map(([f, l, tone], i) => (
          <g key={l} opacity={fade(t, i, 0.2)}>
            <line className="ax-wire" x1={16 + 568 * f} x2={16 + 568 * f} y1={80} y2={126} />
            <Txt x={16 + 568 * f} y={150 + (narrow ? (i % 2) * 22 : 0)} k="s" tone={tone}>
              {narrow ? l.split(" ")[0] : l}
            </Txt>
          </g>
        ))}
        <Chips items={[["max ID / type max", "max / limit"], ["growth per day", "growth"], ["projected date", "ETA"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Txt x={300} y={120} k="d" tone="lit">
        {narrow ? "BIGINT" : "default to BIGINT"}
      </Txt>
      <Txt x={300} y={160} k="s">
        {narrow ? "4 bytes saved ≠ a 2 AM fix" : "4 bytes saved per row is not worth a 2 AM migration"}
      </Txt>
      <Chips items={[["audit auto-increments", "audit"], ["alert on ID space", "alert"], ["practise migrations", "practise"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "fix") return <Fix {...p} />;
  if (p.variant === "never") return <Never {...p} />;
  return <Ceiling {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "ceiling",
      label: "The ceiling",
      steps: [
        { caption: "2 AM: event_log has gone silent. Its ID has reached 2,147,483,647, the largest 32-bit signed integer, and every INSERT now fails.", tween: 1400 },
        { caption: "About 4 million events a day for roughly 540 days is about 2.15 billion IDs: every value the column can hold.", tween: 2200 },
        { caption: "Past the max, MySQL hands out the same value and inserts fail with duplicate keys. Oracle with CYCLE is worse: it reissues old IDs.", tween: 1400 },
        { caption: "It's silent: reads look healthy, connections stay up and metrics look stable, while the writer swallows every failed write.", tween: 1200 },
      ],
    },
    {
      id: "fix",
      label: "The fix",
      steps: [
        { caption: "Option 1: change the column to BIGINT, about 9.2 quintillion values, with an online schema change. On 2 billion rows that takes hours.", tween: 1400 },
        { caption: "Option 2: route new writes to event_log_v2 with a BIGINT ID, write both for a while and union the reads. Zero downtime, but complex.", tween: 1400 },
        { caption: "Option 3: truncate and restart at 1. It takes minutes but loses all history, so only for data that's archived or replaceable.", tween: 1200 },
        { caption: "Choose by the table: BIGINT for critical tables, a split or UUIDs for analytics logs, a reset only when the data can be replaced.", tween: 1400 },
      ],
    },
    {
      id: "never",
      label: "Never again",
      steps: [
        { caption: "Long term, UUIDs are unique anywhere and never realistically overflow, at the cost of 16 bytes and index fragmentation.", tween: 1200 },
        { caption: "Snowflake-style IDs pack a 41-bit timestamp, a 10-bit machine ID and a 12-bit sequence into one sortable 64-bit integer.", tween: 1600 },
        { caption: "Monitor the math: current max ID over the type's limit, with alerts at 50%, 70% and 90% and a projected exhaustion date.", tween: 1800 },
        { caption: "The lesson: those 4 saved bytes per row were a time bomb. Audit your auto-increment columns, and default to BIGINT.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
