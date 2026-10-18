/**
 * Transactional outbox (week 3, day 2 · 1.3 / 2.1 / 2.2 / 3.2): the dual-write loss, the outbox's
 * single transaction + relay, and the relay crash that makes publishing at-least-once.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const APP = { x: 24, y: 56, w: 124, h: 60 };
const DB = { x: 196, y: 26, w: 224, h: 178 };
const ORD = { x: 210, y: 58, w: 196, h: 48 };
const OUT = { x: 210, y: 124, w: 196, h: 64 };
const RELAY = { x: 210, y: 252, w: 196, h: 54 };
const KAFKA = { x: 456, y: 124, w: 120, h: 64 };
const CONS = { x: 456, y: 26, w: 120, h: 54 };

type Pt = { x: number; y: number };
const mid = (b: typeof APP, side: "l" | "r" | "t" | "b"): Pt =>
  side === "l" ? { x: b.x, y: b.y + b.h / 2 } : side === "r" ? { x: b.x + b.w, y: b.y + b.h / 2 } : side === "t" ? { x: b.x + b.w / 2, y: b.y } : { x: b.x + b.w / 2, y: b.y + b.h };
const go = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

function Scene({ variant, step, t, narrow }: SceneProps) {
  const toks: (Pt & { tone: Tone; o?: number })[] = [];
  let orderRow = true;
  let eventRow = variant !== "dual";
  let published = "NULL";
  let kafkaCount = variant === "crash" ? 0 : 0;
  let relayTone: Tone = undefined;
  let appTone: Tone = undefined;
  let txLit = false;
  let consumerNote = "";
  let lost = false;
  if (variant === "dual") {
    eventRow = false;
    if (step === 0) {
      orderRow = t > 0.6;
      if (t < 0.6) toks.push({ ...go(mid(APP, "r"), mid(ORD, "l"), t / 0.6), tone: "lit" });
    }
    if (step >= 1) {
      appTone = "bad";
      if (step === 1 && t < 0.5) toks.push({ ...go(mid(APP, "r"), { x: 300, y: 18 }, seg(t, 0, 0.5) * 0.3), tone: "mute" });
    }
    if (step === 2) lost = true;
  } else if (variant === "outbox") {
    if (step === 0) {
      orderRow = t > 0.5;
      eventRow = t > 0.5;
      if (t < 0.5) {
        toks.push({ ...go(mid(APP, "r"), mid(ORD, "l"), t / 0.5), tone: "lit" });
        toks.push({ ...go(mid(APP, "r"), mid(OUT, "l"), t / 0.5), tone: "lit" });
      }
      txLit = true;
    }
    if (step === 1) txLit = true;
    if (step === 2) {
      relayTone = "lit";
      toks.push({ ...go(mid(OUT, "b"), mid(RELAY, "t"), t), tone: "sky", o: t >= 1 ? 0 : 1 });
    }
    if (step === 3) {
      relayTone = "lit";
      toks.push({ ...go(mid(RELAY, "r"), mid(KAFKA, "b"), t), tone: "sky", o: t >= 1 ? 0 : 1 });
      kafkaCount = t >= 1 ? 1 : 0;
    }
    if (step >= 4) {
      kafkaCount = 1;
      published = step === 4 && t < 0.4 ? "NULL" : "NOW()";
      relayTone = step === 4 ? "ok" : undefined;
    }
    if (step === 5) {
      toks.push({ ...go(mid(KAFKA, "t"), mid(CONS, "b"), t), tone: "sky", o: t >= 1 ? 0 : 1 });
      consumerNote = t >= 1 ? "OrderCreated ✓" : "";
    }
  } else {
    // relay crash
    if (step === 0) {
      relayTone = "lit";
      const p = seg(t, 0, 0.45);
      const q = seg(t, 0.5, 1);
      if (p < 1) toks.push({ ...go(mid(OUT, "b"), mid(RELAY, "t"), p), tone: "sky" });
      else if (q < 1) toks.push({ ...go(mid(RELAY, "r"), mid(KAFKA, "b"), q), tone: "sky" });
      kafkaCount = q >= 1 ? 1 : 0;
    }
    if (step === 1) {
      kafkaCount = 1;
      relayTone = "bad";
    }
    if (step === 2) {
      kafkaCount = t >= 1 ? 2 : 1;
      relayTone = "lit";
      const p = seg(t, 0, 0.45);
      const q = seg(t, 0.5, 1);
      if (p < 1) toks.push({ ...go(mid(OUT, "b"), mid(RELAY, "t"), p), tone: "warn" });
      else if (q < 1) toks.push({ ...go(mid(RELAY, "r"), mid(KAFKA, "b"), q), tone: "warn" });
    }
    if (step >= 3) kafkaCount = 2;
    if (step === 3) published = "NOW()";
    if (step === 4) {
      published = "NOW()";
      const p = seg(t, 0, 0.6);
      if (p < 1) {
        toks.push({ ...go(mid(KAFKA, "t"), mid(CONS, "b"), p), tone: "sky" });
        toks.push({ ...go(mid(KAFKA, "t"), mid(CONS, "b"), Math.max(0, p - 0.25)), tone: "warn" });
      }
      consumerNote = t >= 0.6 ? "dup skipped" : "";
    }
  }
  const dual = variant === "dual";
  return (
    <g>
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label="Order API" sub={appTone === "bad" ? "crashed ✗" : "create_order()"} tone={appTone} />
      {/* database */}
      <rect x={DB.x} y={DB.y} width={DB.w} height={DB.h} className={`ob-db${txLit ? " lit" : ""}`} />
      <Txt x={DB.x + 12} y={DB.y + 20} k="k" anchor="start" tone={txLit ? undefined : "mute"}>
        {txLit ? (narrow ? "one transaction" : "Postgres · one transaction") : "Postgres"}
      </Txt>
      <Box x={ORD.x} y={ORD.y} w={ORD.w} h={ORD.h} label="orders" sub={orderRow ? "#1042 · created" : "—"} tone={orderRow && (txLit || dual) ? "ok" : undefined} />
      <Box
        x={OUT.x}
        y={OUT.y}
        w={OUT.w}
        h={OUT.h}
        label="outbox"
        sub={eventRow ? `OrderCreated · ${published}` : "—"}
        tone={eventRow ? (published === "NULL" ? "warn" : "ok") : undefined}
        dim={dual}
      />
      <Box x={RELAY.x} y={RELAY.y} w={RELAY.w} h={RELAY.h} label="Outbox relay" sub={relayTone === "bad" ? (narrow ? "crashed" : "crashed before UPDATE") : narrow ? "polls" : "polls unpublished rows"} tone={relayTone} dim={dual} />
      <Box x={KAFKA.x} y={KAFKA.y} w={KAFKA.w} h={KAFKA.h} label="Kafka" sub={dual && lost ? "no event" : kafkaCount === 2 ? "2 copies" : kafkaCount ? "1 event" : "order.events"} tone={kafkaCount === 2 ? "warn" : dual && lost ? "bad" : kafkaCount ? "sky" : undefined} />
      <Box x={CONS.x} y={CONS.y} w={CONS.w} h={CONS.h} label="Consumer" sub={consumerNote || (variant === "crash" ? "dedupe by ID" : "shipping")} tone={consumerNote ? "ok" : undefined} dim={dual} />
      {/* wiring */}
      <Wire d={`M${APP.x + APP.w} ${APP.y + APP.h / 2}H${DB.x}`} arrow />
      {dual && <Wire d={`M${APP.x + APP.w / 2} ${APP.y}V14H436V${KAFKA.y + KAFKA.h / 2}H${KAFKA.x}`} arrow dash tone={lost ? "bad" : undefined} />}
      <Wire d={`M${mid(OUT, "b").x} ${OUT.y + OUT.h}V${DB.y + DB.h}`} opacity={dual ? 0.3 : 1} />
      <Wire d={`M${mid(OUT, "b").x} ${DB.y + DB.h}V${RELAY.y}`} arrow opacity={dual ? 0.3 : 1} />
      <Wire d={`M${RELAY.x + RELAY.w} ${RELAY.y + RELAY.h / 2}H${KAFKA.x + KAFKA.w / 2}V${KAFKA.y + KAFKA.h}`} arrow opacity={dual ? 0.3 : 1} />
      <Wire d={`M${KAFKA.x + KAFKA.w / 2} ${KAFKA.y}V${CONS.y + CONS.h}`} arrow opacity={dual ? 0.3 : 1} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} opacity={k.o} />
      ))}
      {dual && lost && (
        <Txt x={KAFKA.x + KAFKA.w / 2} y={KAFKA.y - 12} k="k" tone="bad">
          event lost
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ob-db{fill:none;stroke:var(--ax-line);stroke-width:1.5;stroke-dasharray:4 5}.ob-db.lit{stroke:var(--ax-accent);stroke-width:2;stroke-dasharray:none}`,
  variants: [
    {
      id: "dual",
      label: "Dual write",
      steps: [
        { caption: "Without an outbox the app writes to two systems. First the database: the order row commits.", tween: 1400 },
        { caption: "Then Kafka. But the app crashes between the two calls, so OrderCreated is never sent.", tween: 1400 },
        { caption: "Nothing retries a call that never happened: the order exists, the event is silently lost, and downstream services never hear about it.", ms: 3600 },
      ],
    },
    {
      id: "outbox",
      label: "Outbox",
      steps: [
        { caption: "The app writes the order row and its OrderCreated event row in ONE database transaction.", tween: 1600 },
        { caption: "Commit: both rows exist or neither does. The broker is not part of the transaction, so there is no dual write left to fail." },
        { caption: "The relay polls for unpublished events: SELECT … WHERE published_at IS NULL, FOR UPDATE SKIP LOCKED.", tween: 1200 },
        { caption: "It publishes each event to Kafka, keyed by aggregate_id so one order's events stay in order.", tween: 1200 },
        { caption: "Then it marks the row: UPDATE outbox SET published_at = NOW().", tween: 1000 },
        { caption: "Consumers read OrderCreated from Kafka. Publishing lags the commit by the poll interval (CDC with Debezium cuts that to milliseconds).", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "crash",
      label: "Relay crash",
      steps: [
        { caption: "The relay reads an unpublished event and publishes it to Kafka: success.", tween: 2000 },
        { caption: "It crashes before UPDATE outbox SET published_at = NOW() runs, so the row still says NULL." },
        { caption: "After the restart it reads the same row again and publishes the event a second time.", tween: 2000 },
        { caption: "Kafka now holds the event twice: the outbox gives at-least-once publishing, not exactly-once." },
        { caption: "Consumers make that safe by deduplicating on the event ID: the second copy is skipped.", tween: 1800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
