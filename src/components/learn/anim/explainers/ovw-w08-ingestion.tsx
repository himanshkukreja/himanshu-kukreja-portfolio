/**
 * Whole-lesson overview (week 8, day 1 · event ingestion): why events (flying blind without them),
 * what a good event is (an immutable, uniquely identified, timestamped fact, named
 * domain.entity.action, with a schema that only evolves backward-compatibly), the pipeline
 * (collection API → validation → enrichment → Kafka topics by category → stream, batch and lake),
 * and what goes wrong (synchronous ingestion, spikes absorbed by Kafka and load shedding, the DLQ).
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const SRC = [84, 144, 204];
const SX = 12;
const SW = 98;
const RH = 32;
const C = { x: 136, y: 64, w: 124, h: 184 };
const STAGE = (i: number) => C.y + 40 + i * 44;
const K = { x: 290, y: 40, w: 160, h: 200 };
const LANE = (i: number) => K.y + 36 + i * 38;
const DLQ = { x: 290, y: 256, w: 160, h: 40 };
const DX = 482;
const DW = 106;
const DOWN = [52, 128, 204];
const TOPICS: [string, string, string][] = [
  ["events.user", "user", "30d"],
  ["events.product", "product", "30d"],
  ["events.order", "order", "90d"],
  ["events.payment", "payment", "∞"],
];

type P = { x: number; y: number };
const mv = (a: P, b: P, p: number): P => ({
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p),
});
const srcOut = (i: number): P => ({ x: SX + SW, y: SRC[i] + RH / 2 });
const colIn: P = { x: C.x, y: C.y + C.h / 2 };
const colOut: P = { x: C.x + C.w, y: C.y + C.h / 2 };
const laneIn = (i: number): P => ({ x: K.x + 8, y: LANE(i) + 15 });

type St = {
  src?: (i: number) => Tone | "dim";
  col?: Tone;
  stage?: number;
  kafka?: Tone | "dim";
  dlq?: Tone | "dim";
  down?: Tone | "dim";
  srcNames?: string[];
  fill?: number;
  note?: string;
  dlqSub?: string;
};

function Frame({ narrow, s }: { narrow: boolean; s: St }) {
  const kop = s.kafka === "dim" ? 0.25 : 1;
  const names = s.srcNames ?? ["Web", "Mobile", "Backend"];
  return (
    <g>
      {SRC.map((y, i) => {
        const tn = s.src?.(i);
        return (
          <g key={y} opacity={tn === "dim" ? 0.3 : 1}>
            <Wire d={`M${SX + SW} ${y + RH / 2}C${SX + SW + 14} ${y + RH / 2} ${C.x - 14} ${colIn.y} ${C.x} ${colIn.y}`} />
            <rect className={`ax-box${tn && tn !== "dim" ? ` ${tn}` : ""}`} x={SX} y={y} width={SW} height={RH} />
            <Txt x={SX + SW / 2} y={y + 21} k="s" tone={tn === "dim" ? undefined : tn}>
              {names[i]}
            </Txt>
          </g>
        );
      })}
      <rect className={`ax-box${s.col ? ` ${s.col}` : ""}`} x={C.x} y={C.y} width={C.w} height={C.h} />
      <Txt x={C.x + C.w / 2} y={C.y + 26}>
        Collector
      </Txt>
      {["validate", "enrich"].map((l, i) => (
        <g key={l}>
          <rect className={`ax-box${s.stage === i ? " lit" : ""}`} x={C.x + 12} y={STAGE(i)} width={C.w - 24} height={30} />
          <Txt x={C.x + C.w / 2} y={STAGE(i) + 20} k="s" tone={s.stage === i ? "lit" : undefined}>
            {l}
          </Txt>
        </g>
      ))}
      {s.note && (
        <Txt x={C.x + C.w / 2} y={C.y + C.h - 18} k="s" tone="lit">
          {s.note}
        </Txt>
      )}
      <g opacity={kop}>
        {s.kafka !== "dim" && (
          <g>
            {TOPICS.map((_, i) => (
              <Wire key={i} d={`M${colOut.x} ${colOut.y}C${colOut.x + 16} ${colOut.y} ${K.x - 16} ${LANE(i) + 15} ${K.x} ${LANE(i) + 15}`} />
            ))}
            <rect className={`ax-box${s.kafka ? ` ${s.kafka}` : ""}`} x={K.x} y={K.y} width={K.w} height={K.h} />
            <Txt x={K.x + K.w / 2} y={K.y + 24}>
              Kafka
            </Txt>
            {TOPICS.map(([w, n, r], i) => (
              <g key={w}>
                {s.fill !== undefined ? (
                  <Meter x={K.x + 8} y={LANE(i) + 24} w={K.w - 16} h={6} value={s.fill * (1 - i * 0.12)} max={1} tone="warn" />
                ) : (
                  <rect className={`ax-box${s.kafka === "lit" ? " lit" : ""}`} x={K.x + 8} y={LANE(i)} width={K.w - 16} height={30} />
                )}
                <Txt x={K.x + 16} y={LANE(i) + 20} k="s" anchor="start">
                  {narrow ? n : w}
                </Txt>
                {s.kafka === "lit" && i >= 2 && (
                  <Txt x={K.x + K.w - 16} y={LANE(i) + 20} k="s" anchor="end" tone="lit">
                    {r}
                  </Txt>
                )}
              </g>
            ))}
          </g>
        )}
        {DOWN.map((y, i) => (
          <g key={y} opacity={s.down === "dim" ? 0.3 : 1}>
            <Wire d={`M${K.x + K.w} ${K.y + K.h / 2}C${DX - 14} ${K.y + K.h / 2} ${DX - 14} ${y + 22} ${DX} ${y + 22}`} arrow />
            <Box x={DX} y={y} w={DW} h={44} label={["Flink", "Spark", "S3 lake"][i]} tone={s.down === "dim" ? undefined : s.down} />
          </g>
        ))}
      </g>
      <g opacity={s.dlq === "dim" ? 0.3 : 1}>
        <Wire d={`M${C.x + C.w / 2} ${C.y + C.h}V${DLQ.y + 20}H${DLQ.x}`} dash />
        <Box x={DLQ.x} y={DLQ.y} w={DLQ.w} h={DLQ.h} label={narrow ? "DLQ" : s.dlqSub ? undefined : "dead_letter"} tone={s.dlq === "dim" ? undefined : s.dlq} />
        {s.dlqSub && !narrow && (
          <Txt x={DLQ.x + DLQ.w / 2} y={DLQ.y + 25} k="s" tone="ok">
            {s.dlqSub}
          </Txt>
        )}
      </g>
    </g>
  );
}

const KICK = ["the ingestion pipeline", "the pipeline"];

function Pipe({ step, t, clock, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const flow = (k: number) => (clock * 0.4 + k / 3) % 1;
  const states: St[] = [
    {
      src: (i) => (i === 1 ? "lit" : undefined),
      col: "lit",
      note: narrow ? undefined : "+received_time",
      dlq: "dim",
      down: "dim",
    },
    { stage: 0, dlq: "bad", down: "dim" },
    { stage: 1, note: narrow ? "+geo" : "+geo +agent", down: "dim" },
    { kafka: "lit", down: "dim" },
    { down: "lit" },
  ];
  const s = states[step];
  return (
    <g>
      <Txt x={W / 2} y={24} k="k">
        {narrow ? KICK[1] : KICK[0]}
      </Txt>
      {!narrow && step === 0 && (
        <Txt x={C.x + C.w / 2} y={C.y - 8} k="s" tone="lit">
          /events · /batch
        </Txt>
      )}
      <Frame narrow={narrow} s={s} />
      {step === 0 && <Token {...mv(srcOut(1), colIn, p)} s={10} tone="lit" />}
      {step === 1 && (
        <g>
          <Token {...mv({ x: C.x + C.w / 2, y: C.y + C.h }, { x: DLQ.x + 20, y: DLQ.y + 20 }, p)} s={10} tone="bad" />
          <Token x={C.x + C.w - 18} y={STAGE(0) + 15} s={9} tone="ok" />
        </g>
      )}
      {step === 2 && <Token {...mv(colOut, laneIn(1), p)} s={10} tone="lit" />}
      {step === 4 && DOWN.map((y, k) => <Token key={y} {...mv({ x: K.x + K.w, y: K.y + K.h / 2 }, { x: DX, y: y + 22 }, flow(k))} s={9} tone="lit" />)}
    </g>
  );
}

function Fail({ step, t, clock, narrow }: SceneProps) {
  const pile = step === 0 ? Math.round(lerp(1, 5, t)) : 0;
  const shed = (k: number) => (clock * 0.45 + k / 2) % 1;
  const states: St[] = [
    { col: "bad", kafka: "dim", dlq: "dim", src: () => "warn" },
    { fill: lerp(0.15, 0.85, t), down: "lit", dlq: "dim" },
    {
      col: "warn",
      note: narrow ? ">90% full" : "queue >90% full",
      srcNames: narrow ? ["views", "orders", "payments"] : ["page.viewed", "orders", "payments"],
      src: (i) => (i === 0 ? "mute" : "lit"),
      dlq: "dim",
    },
    {
      note: narrow ? undefined : "event_id dedup",
      dlq: "ok",
      dlqSub: "replay later",
    },
  ];
  return (
    <g>
      <Txt x={W / 2} y={24} k="k" tone={step === 0 ? "bad" : undefined}>
        {["wrong: synchronous ingestion", "spike: Kafka buffers", "overload: shed load", "never drop silently"][step]}
      </Txt>
      <Frame narrow={narrow} s={states[step]} />
      {step === 0 && (
        <g>
          <Box x={K.x} y={96} w={K.w} h={88} label="Database" sub={narrow ? undefined : "save() blocks"} tone="bad" />
          <Wire d={`M${colOut.x} ${colOut.y}H${K.x}`} tone="bad" arrow />
          {Array.from({ length: pile }, (_, k) => (
            <Token key={k} x={SX + SW + 8 + (k % 2) * 10} y={SRC[1] + RH / 2 - 16 + k * 8} s={8} tone="warn" />
          ))}
        </g>
      )}
      {step === 1 && !narrow && (
        <Txt x={DX + DW / 2} y={272} k="s" tone="ok">
          scale out
        </Txt>
      )}
      {step === 1 && <Meter x={C.x + 12} y={C.y + C.h - 28} w={C.w - 24} h={10} value={0.3} max={1} tone="ok" />}
      {step === 2 && (
        <g>
          <Token {...mv(srcOut(0), { x: SX + SW + 14, y: SRC[0] + 60 }, shed(0))} s={9} tone="mute" opacity={1 - shed(0)} />
          <Token {...mv(srcOut(1), colIn, seg(t, 0, 1) * 0.9)} s={10} tone="lit" />
          <Txt x={SX + SW / 2} y={SRC[0] - 10} k="s" tone="mute">
            shed
          </Txt>
          <Txt x={SX + SW / 2} y={SRC[2] + RH + 18} k="s" tone="lit">
            {narrow ? "kept" : "never shed"}
          </Txt>
        </g>
      )}
      {step === 3 && <Token {...mv({ x: C.x + C.w / 2, y: C.y + C.h }, { x: DLQ.x + 20, y: DLQ.y + 20 }, seg(t, 0.1, 0.9))} s={10} tone="bad" />}
    </g>
  );
}

const CARD: [string, string, string][] = [
  ["event_id: evt_abc123", "event_id: evt_abc123", "unique"],
  ["event_type: product.viewed", "type: product.viewed", "typed"],
  ["timestamp: 2024-01-15T10:30:00Z", "time: …T10:30:00Z", "timestamped"],
  ["user_id: user_456", "user_id: user_456", "contextual"],
  ["data.product_id: prod_789", "product: prod_789", "contextual"],
];
const NAMES: [string, Tone][] = [
  ["order.placed", "ok"],
  ["user.signed_up", "ok"],
  ["create_user", "bad"],
  ["userSignup", "bad"],
];
const SCHEMA: [string, string, string, string, Tone][] = [
  ["+ source, optional", "+source optional", "safe", "safe", "ok"],
  ["+ session_id, required", "+session_id req.", "old events break", "breaks", "bad"],
  ["+ session_id = “unknown”", "+session_id dflt", "safe: has a default", "safe", "ok"],
];
const RX = 352;
const RW = 236;

function Why({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const qs = narrow ? ["conversion?", "trending?", "drop-off?", "revenue -20%?"] : ["conversion rate?", "trending products?", "where users drop off?", "why revenue fell 20%?"];
    return (
      <g>
        <Txt x={W / 2} y={30} k="k" tone="bad">
          {narrow ? "flying blind" : "without events, you're flying blind"}
        </Txt>
        <Txt x={150} y={150} k="d">
          50,000
        </Txt>
        <Txt x={150} y={176} k="s">
          {narrow ? "users now" : "users browsing right now"}
        </Txt>
        {qs.map((q, i) => (
          <g key={q} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
            <rect className="ax-box" x={RX - 30} y={70 + i * 50} width={RW + 30} height={36} />
            <Txt x={RX - 15 + RW / 2} y={93 + i * 50} k="s" tone="bad">
              {q}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {["", "an event: an immutable fact", "naming: domain.entity.action", "schema registry: a contract"][step]}
      </Txt>
      <rect className="ax-box lit" x={16} y={52} width={318} height={236} />
      {CARD.map(([w, n, tag], i) => (
        <g key={w}>
          <Txt x={30} y={92 + i * 42} k="s" anchor="start" tone={step === 2 && i === 1 ? "lit" : undefined}>
            {narrow ? n : w}
          </Txt>
          {step === 1 && (
            <g opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
              <Wire d={`M322 ${88 + i * 42}H${RX}`} tone="lit" />
              <rect className="ax-box lit" x={RX} y={73 + i * 42} width={150} height={30} />
              <Txt x={RX + 75} y={93 + i * 42} k="s" tone="lit">
                {tag}
              </Txt>
            </g>
          )}
        </g>
      ))}
      {step === 2 &&
        NAMES.map(([n, tone], i) => (
          <g key={n} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
            <rect className={`ax-box ${tone}`} x={RX} y={70 + i * 50} width={RW} height={36} />
            <Txt x={RX + RW / 2} y={93 + i * 50} k="s" tone={tone}>
              {n}
            </Txt>
          </g>
        ))}
      {step === 2 && (
        <Txt x={RX + RW / 2} y={292} k="s" tone="ok">
          {narrow ? "past tense" : "past tense, ISO 8601 UTC"}
        </Txt>
      )}
      {step === 3 &&
        SCHEMA.map(([w, n, v, vn, tone], i) => (
          <g key={w} opacity={seg(t, i * 0.25, i * 0.25 + 0.3)}>
            <rect className={`ax-box ${tone}`} x={RX} y={60 + i * 76} width={RW} height={62} />
            <Txt x={RX + RW / 2} y={86 + i * 76} k="s">
              {narrow ? n : w}
            </Txt>
            <Txt x={RX + RW / 2} y={108 + i * 76} k="s" tone={tone}>
              {narrow ? vn : v}
            </Txt>
          </g>
        ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "why" ? <Why {...p} /> : p.variant === "pipe" ? <Pipe {...p} /> : <Fail {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "why",
      label: "Good events",
      steps: [
        {
          caption: "50,000 users are browsing right now, but what's the conversion rate? Why did revenue drop 20%? Without events, you're flying blind.",
          tween: 1400,
        },
        {
          caption: "An event is an immutable fact: a unique event_id for dedup, a type, a timestamp, and who and what it was about.",
          tween: 1600,
        },
        {
          caption: "Names follow domain.entity.action in the past tense, like order.placed. Not create_user, not userSignup. Timestamps are always ISO 8601 UTC.",
          tween: 1400,
        },
        {
          caption: "The schema is a contract. Adding an optional field is safe; a new required field breaks old events, so add it with a default.",
          tween: 2000,
        },
      ],
    },
    {
      id: "pipe",
      label: "The pipeline",
      steps: [
        {
          caption: "Clients post events to a lightweight collection API, /events or /batch. The collector stamps a server-side received_time.",
          tween: 1400,
        },
        {
          caption: "It validates each event against the schema registry. Invalid events go to the dead letter queue, not into analytics.",
          tween: 1400,
        },
        {
          caption: "Valid events are enriched, with geolocation from the IP and a parsed user agent, then sent to Kafka asynchronously.",
          tween: 1400,
        },
        {
          caption: "Topics by category scale independently. Orders are kept 90 days and payments indefinitely; keying by user_id keeps a user's events in order.",
          tween: 900,
        },
        {
          caption: "Flink for real time, Spark for batch and the S3 raw lake all read from Kafka, which keeps events for replay.",
          tween: 1200,
          loop: true,
        },
      ],
    },
    {
      id: "fail",
      label: "Spikes & failures",
      steps: [
        {
          caption: "The mistake: write each event to the database before returning OK. A slow database means a slow API, with no buffer for spikes.",
          tween: 1600,
        },
        {
          caption: "Write to Kafka instead. When producers outrun consumers, lag grows but nothing is lost, and consumers scale out horizontally.",
          tween: 2000,
        },
        {
          caption: "Past 90% queue capacity the collector sheds load: page views can go, but critical events like orders and payments never do.",
          tween: 1600,
          loop: true,
        },
        {
          caption: "Failures go to the dead letter queue to investigate and replay. Delivery is at-least-once, and event_id dedup makes it safe.",
          tween: 1400,
        },
      ],
    },
  ],
  Scene,
});
