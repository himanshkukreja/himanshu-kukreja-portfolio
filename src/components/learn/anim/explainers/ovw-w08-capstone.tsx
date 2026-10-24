/**
 * Whole-capstone overview (week 8 capstone · streaming analytics for a video platform): the
 * requirements (150M subscribers, 10M peak viewers, Trending Now under 60 s), the estimate (1M
 * events/s, 50B a day, 3TB/day compressed), the architecture (regional collectors → Kafka → Flink
 * + ClickHouse for live, Spark + BigQuery for history), and the hard parts (late mobile events,
 * trending by unique viewers, query layers, and the 10x plan).
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
type Id = "dev" | "ing" | "kaf" | "fli" | "spa" | "ch" | "bq" | "api";
const N: Record<Id, { x: number; y: number; w: number; h: number; l: string; n: string }> = {
  dev: { x: 12, y: 85, w: 80, h: 60, l: "Devices", n: "Apps" },
  ing: { x: 108, y: 85, w: 80, h: 60, l: "Ingest", n: "Ingest" },
  kaf: { x: 204, y: 85, w: 80, h: 60, l: "Kafka", n: "Kafka" },
  fli: { x: 300, y: 52, w: 84, h: 50, l: "Flink", n: "Flink" },
  spa: { x: 300, y: 132, w: 84, h: 50, l: "Spark", n: "Spark" },
  ch: { x: 400, y: 52, w: 96, h: 50, l: "ClickHouse", n: "CH" },
  bq: { x: 400, y: 132, w: 96, h: 50, l: "BigQuery", n: "BQ" },
  api: { x: 512, y: 85, w: 76, h: 60, l: "API", n: "API" },
};
const IDS = Object.keys(N) as Id[];
const EDGES: [Id, Id][] = [
  ["dev", "ing"],
  ["ing", "kaf"],
  ["kaf", "fli"],
  ["kaf", "spa"],
  ["fli", "ch"],
  ["spa", "bq"],
  ["ch", "api"],
  ["bq", "api"],
];
const out = (i: Id) => ({ x: N[i].x + N[i].w, y: N[i].y + N[i].h / 2 });
const inn = (i: Id) => ({ x: N[i].x, y: N[i].y + N[i].h / 2 });
const along = (a: Id, b: Id, p: number) => ({ x: lerp(out(a).x, inn(b).x, p), y: lerp(out(a).y, inn(b).y, p) });

type St = Partial<Record<Id, Tone | "dim">>;

function System({ st, subs, narrow, flow, clock }: { st: St; subs?: Partial<Record<Id, [string, string]>>; narrow: boolean; flow?: [Id, Id][]; clock: number }) {
  const tn = (i: Id) => (st[i] === undefined ? "dim" : st[i]);
  return (
    <g>
      {EDGES.map(([a, b]) => {
        const on = tn(a) !== "dim" && tn(b) !== "dim";
        return <Wire key={a + b} d={`M${out(a).x} ${out(a).y}C${out(a).x + 8} ${out(a).y} ${inn(b).x - 8} ${inn(b).y} ${inn(b).x} ${inn(b).y}`} tone={on ? "lit" : undefined} opacity={on ? 1 : 0.35} />;
      })}
      {IDS.map((i) => {
        const s = subs?.[i];
        const t = tn(i);
        return <Box key={i} x={N[i].x} y={N[i].y} w={N[i].w} h={N[i].h} label={narrow ? N[i].n : N[i].l} sub={s ? (narrow ? s[1] || undefined : s[0]) : undefined} tone={t === "dim" ? undefined : t} dim={t === "dim"} />;
      })}
      {flow?.map(([a, b], k) => <Token key={a + b} {...along(a, b, (clock * 0.7 + k * 0.37 + 0.5) % 1)} s={8} tone="lit" />)}
    </g>
  );
}

function Fig({ x, y, d, s, tone, o = 1 }: { x: number; y: number; d: string; s: string; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <Txt x={x} y={y} k="d" tone={tone}>
        {d}
      </Txt>
      <Txt x={x} y={y + 24} k="s">
        {s}
      </Txt>
    </g>
  );
}

function Chips({ items, t, y = 214, tone = "lit", cols = 2 }: { items: string[]; t: number; y?: number; tone?: Tone; cols?: number }) {
  const w = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      {items.map((c, i) => (
        <g key={c} opacity={seg(t, i * 0.12, i * 0.12 + 0.3)}>
          <rect className={`ax-box ${tone}`} x={24 + (i % cols) * (w + 8)} y={y + Math.floor(i / cols) * 32} width={w} height={26} />
          <Txt x={24 + (i % cols) * (w + 8) + w / 2} y={y + 18 + Math.floor(i / cols) * 32} k="s" tone={tone}>
            {c}
          </Txt>
        </g>
      ))}
    </g>
  );
}

function Bar({ parts, y, t, narrow }: { parts: [string, string, number, Tone][]; y: number; t: number; narrow: boolean }) {
  const starts = parts.map((_, i) => 24 + 552 * parts.slice(0, i).reduce((a, p) => a + p[2], 0));
  return (
    <g opacity={seg(t, 0.1, 0.6)}>
      {parts.map(([l, nl, f, tone], i) => {
        const w = 552 * f;
        const x = starts[i];
        return (
          <g key={l + i}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={34} />
            <Txt x={x + w / 2} y={y + 22} k="s" tone={tone}>
              {narrow ? nl : l}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Reqs({ step, t, narrow }: SceneProps) {
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "video streaming analytics" : "analytics for a video streaming platform"}
      </Txt>
      <System narrow={narrow} clock={0} st={step === 2 ? { dev: "lit", api: "lit" } : { dev: "lit" }} />
      {step === 0 && (
        <g>
          <Fig x={110} y={244} d="150M" s="subscribers" o={seg(t, 0, 0.4)} />
          <Fig x={300} y={244} d="10M" s={narrow ? "peak viewers" : "peak concurrent"} o={seg(t, 0.3, 0.7)} tone="lit" />
          <Fig x={490} y={244} d="50K" s="titles" o={seg(t, 0.6, 1)} />
        </g>
      )}
      {step === 1 && (
        <g>
          <Bar
            y={222}
            t={t}
            narrow={narrow}
            parts={[
              ["Mobile 40%", "Mob 40", 0.4, "warn"],
              ["Smart TV 35%", "TV 35", 0.35, undefined],
              ["Web 15%", "15", 0.15, undefined],
              ["Gaming", "10", 0.1, undefined],
            ]}
          />
          <Txt x={24} y={282} k="s" anchor="start" tone="warn" opacity={seg(t, 0.6, 1)}>
            {narrow ? "mobile: hours late (plane, subway)" : "mobile events: real-time to several hours late (plane, subway)"}
          </Txt>
        </g>
      )}
      {step === 2 && <Chips t={t} items={narrow ? ["track events", "Trending < 60 s", "creator stats", "A/B, daily", "2 years history", "live ≠ final"] : ["track play, pause, seek", "Trending Now < 60 s", "creator analytics", "A/B tests, daily", "2 years of history", "live vs final numbers"]} />}
    </g>
  );
}

function Estimate({ step, t, clock, narrow }: SceneProps) {
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "peak event rate" : "peak event rate", narrow ? "events per day" : "events per day", narrow ? "storage" : "storage per day and per 90 days"][step]}
      </Txt>
      <System narrow={narrow} clock={clock} st={step === 2 ? { dev: "lit", ing: "lit", kaf: "lit", spa: "lit", bq: "lit" } : { dev: "lit", ing: "lit", kaf: "lit" }} flow={step === 0 ? [["dev", "ing"], ["ing", "kaf"]] : undefined} />
      {step === 0 && (
        <g>
          <Fig x={110} y={244} d="10M" s="viewers" />
          <Txt x={205} y={244} k="d">
            /
          </Txt>
          <Fig x={300} y={244} d="10 s" s={narrow ? "per event" : "one event each"} o={seg(t, 0.2, 0.5)} />
          <Txt x={395} y={244} k="d" opacity={seg(t, 0.4, 0.6)}>
            =
          </Txt>
          <Fig x={490} y={244} d="1M/s" s={narrow ? "at peak" : "events at peak"} o={seg(t, 0.5, 0.9)} tone="lit" />
        </g>
      )}
      {step === 1 && (
        <g>
          <Txt x={24} y={212} k="s" anchor="start">
            {narrow ? "~37B a day · plan for 50B" : "peak + high + normal hours ≈ 37B a day · plan for 50B"}
          </Txt>
          <Bar
            y={222}
            t={t}
            narrow={narrow}
            parts={[
              ["heartbeats 70% · 35B", "heartbeats 35B", 0.7, "lit"],
              ["playback 10B", "10B", 0.2, undefined],
              ["", "", 0.1, undefined],
            ]}
          />
          <Txt x={W - 24} y={282} k="s" anchor="end" opacity={seg(t, 0.6, 1)}>
            {narrow ? "browse 4B · quality 1B" : "browse/search 4B · quality 1B"}
          </Txt>
        </g>
      )}
      {step === 2 && (
        <Chips
          t={t}
          cols={4}
          y={222}
          tone="sky"
          items={narrow ? ["15TB raw", "3TB", "270TB", "810TB"] : ["15TB/day raw", "3TB compressed", "270TB · 90 days", "810TB · 3 copies"]}
        />
      )}
      {step === 2 && (
        <Txt x={24} y={212} k="s" anchor="start">
          {narrow ? "50B × 300 bytes" : "50B events × ~300 bytes"}
        </Txt>
      )}
    </g>
  );
}

function Arch({ step, t, clock, narrow }: SceneProps) {
  const st: St[] = [
    { dev: "lit", ing: "lit", kaf: "lit" },
    { ing: undefined, kaf: "lit", fli: undefined, spa: undefined },
    { kaf: "lit", fli: "lit", ch: "lit", api: "lit" },
    { kaf: "lit", spa: "sky", bq: "sky", api: "sky" },
  ];
  const st1: St = { dev: "mute", ing: "mute", kaf: "lit", fli: "mute", spa: "mute" };
  const subs: Partial<Record<Id, [string, string]>>[] = [
    { ing: ["batch 100", "batch"] },
    { kaf: ["7 days", "7 days"] },
    { fli: ["trending", ""], ch: ["live", "live"], api: ["30 s", "30 s"] },
    { spa: ["daily ETL", ""], bq: ["history", ""], api: ["/explore", ""] },
  ];
  const flows: [Id, Id][][] = [[["dev", "ing"], ["ing", "kaf"]], [], [["kaf", "fli"], ["fli", "ch"], ["ch", "api"]], [["kaf", "spa"], ["spa", "bq"], ["bq", "api"]]];
  const notes: string[][] = [
    narrow ? ["5 regions, ~200K/s each", "validate, enrich, batch"] : ["5 regions, ~200K events/s each", "validate · enrich (geo, device) · batch 100 events or 100ms"],
    narrow ? ["playback · browse · quality", "playback keyed by user_id", "dead_letter for bad events"] : ["topics: events.playback · browse · quality · dead_letter", "playback partitioned by user_id: each viewer's events in order", "7-day retention for replay"],
    narrow ? ["1-hour window, every minute", "unique viewers (HLL)"] : ["Trending Now: 1-hour windows sliding every minute", "unique viewers per title with HyperLogLog → ClickHouse"],
    narrow ? ["daily ETL, late data, A/B", "/explore: no cache"] : ["Spark: daily ETL · late data reprocessing · A/B analysis", "BigQuery for ad-hoc history · /explore is not cached"],
  ];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "regional ingestion" : "regional collectors → Kafka", narrow ? "Kafka backbone" : "Kafka: the backbone", narrow ? "live path" : "live path: Flink → ClickHouse", narrow ? "batch path" : "batch path: Spark → BigQuery"][step]}
      </Txt>
      <System narrow={narrow} clock={clock} st={step === 1 ? st1 : st[step]} subs={subs[step]} flow={flows[step]} />
      {notes[step].map((s, i) => (
        <Txt key={s} x={24} y={226 + i * 26} k="s" anchor="start" tone={i === 0 ? "lit" : undefined} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
          {s}
        </Txt>
      ))}
    </g>
  );
}

function Hard({ step, t, clock, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const st: St[] = [
    { dev: "warn", ing: "lit" },
    { ing: "lit", kaf: "lit", fli: "lit", ch: "lit", spa: "ok", bq: "ok" },
    { kaf: "lit", fli: "lit", ch: "lit" },
    { ch: "ok", bq: "ok", api: "ok" },
    { dev: "lit", ing: "lit", kaf: "lit", fli: "lit", spa: "lit", ch: "lit", bq: "lit", api: "lit" },
  ];
  const subs: Partial<Record<Id, [string, string]>>[] = [
    { dev: ["SQLite", ""] },
    { fli: ["5-min WM", ""], ch: ["provisional", ""], spa: ["T+1, T+7", ""], bq: ["final", "final"] },
    { fli: ["score", ""] },
    { api: ["cache", ""] },
    {},
  ];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {[narrow ? "late mobile events" : "hard part: late mobile events", narrow ? "provisional vs final" : "provisional now, final later", narrow ? "trending done right" : "hard part: trending done right", narrow ? "fast queries" : "fast creator dashboards", narrow ? "the 10x plan" : "the decision at 10x"][step]}
      </Txt>
      <System narrow={narrow} clock={clock} st={st[step]} subs={subs[step]} />
      {step === 0 && (
        <g>
          {t < 1 && <Token {...along("dev", "ing", p)} s={10} tone="warn" />}
          <Fig x={160} y={244} d="3 h" s={narrow ? "airplane" : "airplane mode"} tone="warn" />
          <Fig x={420} y={244} d="45 min" s="subway" tone="warn" o={seg(t, 0.3, 0.7)} />
          <Txt x={W / 2} y={300} k="s" opacity={seg(t, 0.6, 1)}>
            {narrow ? "keeps event_time, deletes on ack" : "buffered on device with the original event_time, deleted only after ack"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <Chips
          t={t}
          cols={3}
          y={222}
          tone="ok"
          items={narrow ? ["live", "T+1 · 6 AM", "T+7 · final"] : ["< 5 min late → live", "T+1 preliminary · 6 AM", "T+7 final · all events"]}
        />
      )}
      {step === 2 && (
        <Chips
          t={t}
          cols={2}
          y={214}
          items={narrow ? ["unique viewers", "category baseline", "velocity boost", "not raw plays"] : ["unique viewers, not events", "normalize by category baseline", "boost growing velocity", "not raw play counts"]}
        />
      )}
      {step === 3 && (
        <g>
          <Fig x={110} y={244} d="90%" s={narrow ? "use rollups" : "of queries use rollups"} tone="ok" />
          <Fig x={300} y={244} d="80%" s={narrow ? "cache hits" : "cache hit rate"} tone="ok" o={seg(t, 0.25, 0.6)} />
          <Fig x={490} y={244} d="<1%" s={narrow ? "data scanned" : "of data scanned"} tone="ok" o={seg(t, 0.5, 0.9)} />
        </g>
      )}
      {step === 4 && (
        <g>
          <Chips t={t} cols={3} y={210} items={narrow ? ["500 partitions", "1000 Flink", "10% heartbeats"] : ["500 partitions", "1000 Flink workers", "sample heartbeats 10%"]} />
          <Txt x={W / 2} y={280} k="t" tone="ok" opacity={seg(t, 0.6, 1)}>
            {narrow ? "10x traffic ≈ 3–4x cost" : "10x traffic ≈ 3–4x cost, with optimizations"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "reqs" ? <Reqs {...p} /> : p.variant === "est" ? <Estimate {...p} /> : p.variant === "arch" ? <Arch {...p} /> : <Hard {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "reqs",
      label: "Requirements",
      steps: [
        { caption: "Design analytics for a video streaming service: 150 million subscribers, 10 million peak concurrent viewers, 50K titles.", tween: 1400 },
        { caption: "They watch on mobile (40%), smart TVs (35%), web (15%) and consoles (10%). Mobile events can arrive hours late.", tween: 1400 },
        { caption: "Track every play, pause and seek; a Trending Now under 60 seconds old; creator analytics; daily A/B results; 2 years of history.", tween: 1600 },
      ],
    },
    {
      id: "est",
      label: "Estimate",
      steps: [
        { caption: "10 million viewers, each sending about one event every 10 seconds: 1 million events per second at peak.", tween: 1400, loop: true },
        { caption: "Peak, high and normal hours add up to about 37 billion events a day; plan for 50 billion. Heartbeats are 70%: 35 billion.", tween: 1400 },
        { caption: "At ~300 bytes each that is 15TB a day raw, 3TB compressed: 270TB for 90 days, 810TB with three replicas.", tween: 1600 },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        { caption: "Regional collectors validate, enrich and batch events (100 events or 100ms) and produce them to Kafka.", tween: 900, loop: true },
        { caption: "Kafka is the backbone. Playback events are partitioned by user_id, so each viewer's events stay in order, and kept 7 days for replay.", tween: 900 },
        { caption: "The live path: Flink counts unique viewers in 1-hour windows sliding every minute, into ClickHouse. /trending is cached 30 seconds.", tween: 900, loop: true },
        { caption: "The batch path: Spark runs daily ETL, late data reprocessing and A/B analysis into BigQuery, for history and ad-hoc queries.", tween: 900, loop: true },
      ],
    },
    {
      id: "hard",
      label: "Hard parts",
      steps: [
        { caption: "Late data: a 3-hour flight or a subway ride. The app buffers events in SQLite with their original event_time until the server acks.", tween: 1600 },
        { caption: "Flink's 5-minute watermark feeds provisional live numbers; later events go to late_events for the T+1 and T+7 jobs.", tween: 1400 },
        { caption: "Trending counts unique viewers, not events, since raw plays favor long content. Normalize by category baseline and boost velocity.", tween: 1400 },
        { caption: "Creator dashboards stay fast: 90% of queries hit rollups, caches hit 80%, and date partitions clustered by content_id scan under 1%.", tween: 1400 },
        { caption: "At 10x, scale out (500 partitions, 1000 Flink workers) and sample heartbeats at 10%. 10x traffic costs about 3 to 4x.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
