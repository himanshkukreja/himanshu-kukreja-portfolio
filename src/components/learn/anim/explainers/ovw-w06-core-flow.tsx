/**
 * Whole-lesson overview (week 6, day 2 · core notification flow): one notification down the happy
 * path and its failure branches. Ingest (idempotency, validation → 400, notification + outbox in one
 * transaction, the 100ms outbox processor, at-least-once), route (global / category opt-out, quiet
 * hours, device-token availability, channel.{channel} keyed by user_id), deliver (locale fallback,
 * DeliveryResult: SENT, retry 2/4/8 s + jitter → DLQ, UNREGISTERED → fallback), track (state
 * machine, signed webhooks, duplicate callbacks ignored, Status API).
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const BX = (i: number) => 10 + i * 98;
const BW = 90;
const BY = 112;
const BH = 60;
const NODES: [string, string, string][] = [
  ["Send API", "API", "validate"],
  ["Outbox", "Outbox", "same txn"],
  ["Kafka", "Kafka", "priority"],
  ["Router", "Router", "prefs"],
  ["Worker", "Worker", "render"],
  ["FCM", "FCM", "provider"],
];
const STATES = ["PENDING", "QUEUED", "ROUTING", "SENDING", "SENT", "DELIVERED", "READ"];
const SW = [78, 72, 78, 78, 56, 96, 56];
const SX = SW.map((_, i) => 12 + SW.slice(0, i).reduce((a, b) => a + b + 10, 0));

type Chip = [label: string, narrow: string, tone?: Tone];
type St = {
  caption: string;
  k: string;
  lit: number[];
  tone?: [number, Tone];
  go?: [number, number];
  chips: Chip[];
  st: number;
  note?: [string, Tone];
  tween?: number;
  loop?: boolean;
};

const V: { id: string; label: string; s: St[] }[] = [
  {
    id: "ingest",
    label: "Ingest",
    s: [
      { caption: "A service calls POST /v1/notifications. First the idempotency check: a key seen before returns the existing notification, no duplicate.", k: "send api · idempotent", lit: [0], go: [-1, 0], chips: [["idempotency_key", "idem. key"], ["seen before?", "seen?"], ["→ same ID", "→ same ID", "ok"]], st: 0 },
      { caption: "Validate early: the user exists and is active, the template exists, required variables are there. If not, 400: no garbage in the queue.", k: "send api · validated", lit: [0], chips: [["user active", "user ok"], ["template", "template"], ["variables", "variables"], ["else → 400", "else 400", "bad"]], st: 0 },
      { caption: "The notification and its outbox row are saved in one transaction, and the caller gets the notification_id right away.", k: "transactional outbox", lit: [0, 1], go: [0, 1], chips: [["notification row", "row"], ["outbox row", "outbox"], ["one transaction", "one txn", "lit"], ["← ID, QUEUED", "← ID", "ok"]], st: 1 },
      { caption: "The outbox processor polls every 100ms, publishes to the priority topic, then marks rows published. A crash in between means at-least-once.", k: "outbox processor", lit: [1, 2], go: [1, 2], chips: [["every 100ms", "100ms"], ["SKIP LOCKED", "SKIP LOCKED"], ["publish, ack", "publish"], ["mark published", "mark", "ok"]], st: 1, note: ["crash before mark → published twice", "warn"], loop: true },
    ],
  },
  {
    id: "route",
    label: "Route",
    s: [
      { caption: "The router consumes the priority topic and reads the user's preferences. Globally disabled, or opted out of the category: nothing is sent.", k: "router · preferences", lit: [2, 3], go: [2, 3], chips: [["global on?", "global?"], ["category on?", "category?"], ["no → nothing", "no → none", "bad"]], st: 2 },
      { caption: "Quiet hours, say 22:00 to 08:00 in the user's timezone: non-critical traffic keeps only email and in-app. Critical alerts bypass them.", k: "router · quiet hours", lit: [3], chips: [["22:00–08:00", "22–08"], ["push ✗", "push ✗", "bad"], ["email ✓", "email ✓", "ok"], ["in-app ✓", "in-app ✓", "ok"]], st: 2 },
      { caption: "Push needs an active device token. Each remaining channel goes to its channel topic, keyed by user_id to keep that user's order.", k: "router · availability", lit: [3, 4], go: [3, 4], chips: [["push: token?", "token?"], ["channel.push", "channel.*", "lit"], ["key = user_id", "key user", "ok"]], st: 3 },
    ],
  },
  {
    id: "deliver",
    label: "Deliver",
    s: [
      { caption: "The worker renders the template with locale fallback, es-MX to es to en-US, and caches it in Redis for 10 minutes.", k: "worker · template", lit: [4], chips: [["es-MX", "es-MX"], ["→ es", "→ es", "lit"], ["→ en-US", "→ en-US"], ["cache 10 min", "10 min"]], st: 3 },
      { caption: "Each provider maps its answer to one DeliveryResult, so one worker loop handles them all. Success means accepted: SENT.", k: "provider · success", lit: [4, 5], tone: [5, "ok"], go: [4, 5], chips: [["DeliveryResult", "Result"], ["should_retry", "retry?"], ["should_fallback", "fallback?"], ["SUCCESS", "SUCCESS", "ok"]], st: 4 },
      { caption: "A 429, 5xx or connection error is retried with backoff: 2, 4, 8 seconds plus jitter. Out of retries, it is FAILED and goes to the DLQ.", k: "provider · retry", lit: [4], tone: [5, "warn"], go: [4, 5], chips: [["429 / 5xx", "429/5xx", "warn"], ["2s, 4s, 8s", "2, 4, 8 s"], ["+ jitter", "+ jitter"], ["max → DLQ", "→ DLQ", "bad"]], st: 3, note: ["FAILED → QUEUED: retry", "warn"], loop: true },
      { caption: "UNREGISTERED is permanent, so there is no retry. The token is marked invalid and the notification falls back to another channel.", k: "provider · invalid token", lit: [4], tone: [5, "bad"], go: [4, 5], chips: [["UNREGISTERED", "UNREG.", "bad"], ["no retry", "no retry"], ["token invalid", "invalid"], ["→ fallback", "fallback", "ok"]], st: 3, note: ["FAILED · should_fallback = true", "bad"] },
    ],
  },
  {
    id: "track",
    label: "Track",
    s: [
      { caption: "Later the provider calls our webhook. Once its signature checks out, SENT becomes DELIVERED; a user interaction later makes it READ.", k: "webhooks", lit: [5], tone: [5, "ok"], go: [5, 9], chips: [["webhook", "webhook"], ["signature ✓", "signed ✓", "ok"], ["SENT → DELIVERED", "→ DELIVERED", "ok"]], st: 5 },
      { caption: "Only valid transitions are applied. A duplicate delivered webhook is logged and ignored, so status and events stay clean.", k: "state machine", lit: [5], go: [5, 9], chips: [["DELIVERED again", "again", "warn"], ["not a valid move", "invalid"], ["ignored", "ignored", "ok"]], st: 5 },
      { caption: "The whole happy path: validate, outbox, priority topic, router, worker, provider, webhook. The caller polls the Status API.", k: "the happy path", lit: [0, 1, 2, 3, 4, 5], chips: [["GET /v1/notifications/{id}", "GET status", "lit"]], st: 6, loop: true, tween: 1200 },
    ],
  },
];

const cx = (i: number) => BX(i) + BW / 2;
const MID = BY + BH / 2;

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const v = V.find((x) => x.id === variant) ?? V[0];
  const s = v.s[Math.min(step, v.s.length - 1)];
  const p = seg(t, 0.05, 0.95);
  const retry = s.note?.[0].startsWith("FAILED");
  const chipW = s.chips.length === 1 ? 300 : 138;
  const chipX = (i: number) => (s.chips.length === 1 ? 150 : 12 + i * 146 + ((4 - s.chips.length) * 146) / 2);
  const q = s.loop ? (t + clock * 0.6) % 1 : p;
  const f = retry ? (q < 0.5 ? q * 2 : 2 - q * 2) : q;
  let tok: { x: number; y: number } | null = null;
  if (s.go && f > 0.06 && f < 0.94) {
    const [a, b] = s.go;
    if (a < 0) tok = { x: cx(0), y: lerp(88, MID, f) };
    else if (b === 9) tok = { x: cx(5), y: lerp(BY + BH, 222, f) };
    else tok = { x: lerp(cx(a), cx(b), f), y: MID };
  }
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {s.k}
      </Txt>
      {s.chips.map(([w, n, tone], i) => (
        <g key={w} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
          <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={chipX(i)} y={48} width={chipW} height={32} />
          <Txt x={chipX(i) + chipW / 2} y={69} k="s" tone={tone}>
            {narrow ? n : w}
          </Txt>
        </g>
      ))}
      {NODES.map(([w, n, sub], i) => {
        const tone: Tone = s.tone && s.tone[0] === i ? s.tone[1] : s.lit.includes(i) ? "lit" : undefined;
        return (
          <g key={w}>
            {i > 0 && <Wire d={`M${BX(i - 1) + BW} ${MID}H${BX(i)}`} arrow tone={s.lit.includes(i) && s.lit.includes(i - 1) ? "lit" : undefined} />}
            <Box x={BX(i)} y={BY} w={BW} h={BH} label={narrow ? n : w} sub={narrow ? undefined : sub} tone={tone} dim={!s.lit.includes(i) && tone === undefined} />
          </g>
        );
      })}
      {s.go?.[1] === 9 && <Wire d={`M${cx(5)} ${BY + BH}V214`} arrow dash tone="ok" />}
      {v.id === "track" && step === 2 && [0, 1, 2].map((k) => <Token key={k} x={lerp(cx(0), cx(5), (clock * 0.25 + k / 3) % 1)} y={BY - 12} s={8} tone="ok" />)}
      {tok && <Token x={tok.x} y={tok.y} s={11} tone={retry ? "warn" : s.tone?.[1] === "bad" ? "bad" : "lit"} />}
      {narrow ? (
        <Txt x={W / 2} y={252} tone="lit">
          {`status · ${STATES[s.st]}`}
        </Txt>
      ) : (
        STATES.map((n, i) => {
          const tone: Tone = i === s.st ? "lit" : i < s.st ? "ok" : undefined;
          return (
            <g key={n} opacity={i <= s.st ? 1 : 0.4}>
              {i > 0 && <Wire d={`M${SX[i] - 10} 238H${SX[i]}`} />}
              <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={SX[i]} y={222} width={SW[i]} height={32} />
              <Txt x={SX[i] + SW[i] / 2} y={243} k="s" tone={tone}>
                {n}
              </Txt>
            </g>
          );
        })
      )}
      {s.note && (
        <Txt x={W / 2} y={292} k="s" tone={s.note[1]} opacity={seg(t, 0.5, 0.9)}>
          {s.note[0]}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.caption, tween: s.tween ?? 1300, loop: s.loop })) })),
  Scene,
});
