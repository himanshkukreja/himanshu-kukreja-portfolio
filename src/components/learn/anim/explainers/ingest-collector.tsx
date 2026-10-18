/**
 * Event collection (week 8, day 1 · 3.1 / 3.2 / 5.1): a 500-event batch is validated per event,
 * 497 go to Kafka in one batch and 3 to events.dead_letter; a retried batch is dropped by its
 * client-generated event_ids; keying by user_id keeps one user's events in one partition, in order.
 */
import { defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const SDK = { x: 24, y: 120, w: 116, h: 84 };
const COL = { x: 196, y: 108, w: 156, h: 108 };
const K = { x: 412, y: 40, w: 164, h: 156 };
const DLQ = { x: 412, y: 228, w: 164, h: 50 };
const N = 10; // squares in the batch: 9 valid, 1 standing for the 3 invalid events
const BAD = 9;
const laneY = (p: number) => K.y + 54 + p * 34;

type P = { x: number; y: number };
const sdkSlot = (i: number): P => ({ x: SDK.x + 26 + (i % 5) * 16, y: SDK.y + 52 + Math.floor(i / 5) * 16 });
const colSlot = (i: number): P => ({ x: COL.x + 46 + (i % 5) * 16, y: COL.y + 70 + Math.floor(i / 5) * 16 });
const laneSlot = (i: number): P => ({ x: K.x + 58 + Math.floor(i / 3) * 18, y: laneY(i % 3) });
const dlqSlot = (): P => ({ x: DLQ.x + DLQ.w - 22, y: DLQ.y + 36 });
const mv = (a: P, b: P, p: number): P => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

function Frame({ narrow, colSub, colTone, dlqSub }: { narrow: boolean; colSub: string; colTone?: Tone; dlqSub: string }) {
  return (
    <g>
      <rect className="ax-box" x={SDK.x} y={SDK.y} width={SDK.w} height={SDK.h} />
      <Txt x={SDK.x + SDK.w / 2} y={SDK.y + 24}>
        {narrow ? "SDK" : "Mobile SDK"}
      </Txt>
      <rect className={`ax-box ${colTone || ""}`} x={COL.x} y={COL.y} width={COL.w} height={COL.h} />
      <Txt x={COL.x + COL.w / 2} y={COL.y + 24}>
        Collector
      </Txt>
      <Txt x={COL.x + COL.w / 2} y={COL.y + 44} k="s" tone={colTone}>
        {colSub}
      </Txt>
      <rect className="ax-box" x={K.x} y={K.y} width={K.w} height={K.h} />
      <Txt x={K.x + 14} y={K.y + 24} k="k" anchor="start">
        {narrow ? "Kafka" : "Kafka · events.*"}
      </Txt>
      {[0, 1, 2].map((p) => (
        <g key={p}>
          <Txt x={K.x + 14} y={laneY(p) + 5} k="s" anchor="start">{`P${p}`}</Txt>
          <rect className="ic-lane" x={K.x + 46} y={laneY(p) - 12} width={K.w - 58} height={24} />
        </g>
      ))}
      <rect className="ax-box" x={DLQ.x} y={DLQ.y} width={DLQ.w} height={DLQ.h} />
      <Txt x={DLQ.x + 14} y={DLQ.y + 22} k="s" anchor="start">
        {narrow ? "DLQ" : "events.dead_letter"}
      </Txt>
      <Txt x={DLQ.x + 14} y={DLQ.y + 40} k="s" anchor="start" tone={dlqSub ? "bad" : "mute"}>
        {dlqSub || "empty"}
      </Txt>
      <Wire d={`M${SDK.x + SDK.w} ${SDK.y + SDK.h / 2}H${COL.x}`} arrow />
      <Wire d={`M${COL.x + COL.w} ${COL.y + 30}C${COL.x + COL.w + 30} ${COL.y + 30} ${K.x - 30} ${laneY(1)} ${K.x} ${laneY(1)}`} arrow />
      <Wire d={`M${COL.x + COL.w} ${COL.y + COL.h - 20}C${COL.x + COL.w + 30} ${COL.y + COL.h - 20} ${K.x - 30} ${DLQ.y + 25} ${K.x} ${DLQ.y + 25}`} arrow tone="bad" dash />
    </g>
  );
}

function Response({ text, tone, opacity }: { text: string; tone: Tone; opacity: number }) {
  return (
    <g opacity={opacity}>
      <Wire d={`M${COL.x + 40} ${COL.y + COL.h}V${H - 40}H${SDK.x + SDK.w / 2}V${SDK.y + SDK.h + 4}`} tone={tone === "bad" ? "bad" : "ok"} dash arrow />
      <Txt x={COL.x + 40} y={H - 16} k="s" tone={tone}>
        {text}
      </Txt>
    </g>
  );
}

function Batch({ step, t, narrow }: SceneProps) {
  const valid = step >= 1 && t > 0.5 ? true : step >= 2;
  const toks = Array.from({ length: N }, (_, i) => {
    let p: P = sdkSlot(i);
    let tone: Tone = "sky";
    if (step === 0) p = mv(sdkSlot(i), colSlot(i), seg(t, i * 0.04, 0.55 + i * 0.04));
    else if (step === 1) {
      p = colSlot(i);
      tone = seg(t, 0.2 + i * 0.05, 0.3 + i * 0.05) >= 1 ? (i === BAD ? "bad" : "ok") : "sky";
    } else {
      tone = i === BAD ? "bad" : "ok";
      const dest = i === BAD ? dlqSlot() : laneSlot(i);
      p = step === 2 ? mv(colSlot(i), dest, seg(t, 0.1 + (i % 3) * 0.08, 0.7 + (i % 3) * 0.08)) : dest;
    }
    return { p, tone };
  });
  const sub = step === 0 ? `${Math.round(seg(t, 0.1, 0.9) * 500)} received` : valid ? "497 ✓ · 3 ✗" : "validating…";
  return (
    <g>
      <Txt x={24} y={34} anchor="start">
        {narrow ? "POST /batch · 500" : "POST /v1/events/batch · 500 events"}
      </Txt>
      <Frame narrow={narrow} colSub={sub} colTone={step === 1 ? "lit" : undefined} dlqSub={step >= 3 || (step === 2 && t > 0.8) ? "3 events" : ""} />
      {toks.map((k, i) => (
        <Token key={i} x={k.p.x} y={k.p.y} s={11} tone={k.tone} label={i === BAD && step === 1 ? "3" : undefined} />
      ))}
      {step >= 3 && <Response text={narrow ? "497 ✓ · 3 ✗ · errors" : "accepted 497 · rejected 3 · errors[]"} tone="ok" opacity={t} />}
    </g>
  );
}

function Retry({ step, t, narrow }: SceneProps) {
  const stored = Array.from({ length: N - 1 }, (_, i) => laneSlot(i));
  const copy = Array.from({ length: N - 1 }, (_, i) => {
    if (step === 0) return { p: sdkSlot(i), o: 1, tone: "mute" as Tone };
    if (step === 1) {
      const go = seg(t, i * 0.03, 0.5 + i * 0.03);
      const drop = seg(t, 0.7, 1);
      return { p: mv(sdkSlot(i), colSlot(i), go), o: 1 - drop * 0.85, tone: (go >= 1 ? "warn" : "sky") as Tone };
    }
    return { p: colSlot(i), o: 0, tone: "warn" as Tone };
  });
  const colSub = step === 0 ? "already stored" : step === 1 ? (t > 0.55 ? "duplicate → drop" : "batch again…") : "0 duplicates";
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={step === 0 ? "bad" : undefined}>
        {step === 0 ? "response timed out" : step === 1 ? (narrow ? "retry · same batch" : "SDK retries · same batch") : narrow ? "stored once" : "each event stored once"}
      </Txt>
      <Frame narrow={narrow} colSub={colSub} colTone={step === 1 && t > 0.55 ? "warn" : undefined} dlqSub="" />
      {stored.map((p, i) => (
        <Token key={`s${i}`} x={p.x} y={p.y} s={11} tone="ok" />
      ))}
      {!narrow && (
        <Txt x={laneSlot(0).x - 6} y={laneSlot(0).y - 16} k="s" anchor="start" tone="ok">
          evt_abc123
        </Txt>
      )}
      {copy.map((k, i) => (
        <Token key={`c${i}`} x={k.p.x} y={k.p.y} s={11} tone={k.tone} opacity={k.o} />
      ))}
      {step === 0 && <Response text={narrow ? "ack lost ✗" : "ack lost: did it arrive? ✗"} tone="bad" opacity={1} />}
      {step === 2 && (
        <Txt x={COL.x + COL.w / 2} y={H - 22} k="s" tone="mute" opacity={t}>
          {narrow ? "received_time ≠ dedup key" : "received_time differs per send: no dedup key"}
        </Txt>
      )}
      <Txt x={K.x} y={K.y + K.h + 20} k="s" anchor="start" tone="ok">
        497 stored
      </Txt>
    </g>
  );
}

function Keys({ step, t, narrow }: SceneProps) {
  const byUser = step >= 1;
  const scatter = [2, 0, 1];
  const toks = [0, 1, 2].map((i) => {
    const from = { x: COL.x + 46 + i * 32, y: COL.y + 78 };
    const lane = byUser ? 1 : scatter[i];
    const to = { x: K.x + 64 + i * 30, y: laneY(lane) };
    return { p: mv(from, to, seg(t, 0.15 + i * 0.12, 0.6 + i * 0.12)), lane };
  });
  return (
    <g>
      <Txt x={24} y={34} anchor="start" tone={byUser ? "ok" : "warn"}>
        {byUser ? "key = user_id" : "key = event_id"}
      </Txt>
      <Frame narrow={narrow} colSub={narrow ? "user_456" : "user_456 · 1 2 3"} dlqSub="" />
      {toks.map((k, i) => (
        <Token key={i} x={k.p.x} y={k.p.y} s={12} tone={byUser ? "ok" : "warn"} label={String(i + 1)} />
      ))}
      <Txt x={SDK.x} y={H - 20} k="s" anchor="start" tone={byUser ? "ok" : "warn"} opacity={seg(t, 0.75, 1)}>
        {byUser
          ? narrow
            ? "1 partition: in order"
            : "one partition: user_456's events stay in order"
          : narrow
            ? "3 partitions: order lost"
            : "three partitions: Kafka can't keep their order"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "retry") return <Retry {...p} />;
  if (p.variant === "key") return <Keys {...p} />;
  return <Batch {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ic-lane{fill:none;stroke:var(--ax-line);stroke-width:1.5}`,
  variants: [
    {
      id: "batch",
      label: "Batch",
      steps: [
        { caption: "A mobile SDK posts a buffered batch of 500 events to /v1/events/batch, each with a client-generated event_id.", tween: 1800 },
        { caption: "The collector stamps received_time, then validates each event on its own: 497 pass, 3 fail.", tween: 1600 },
        { caption: "The 497 are enriched and sent to Kafka in one batch; the 3 go to events.dead_letter.", tween: 1800 },
        { caption: "The response lists 497 accepted and 3 rejected, with errors. One bad event never costs the good ones.", ms: 3400 },
      ],
    },
    {
      id: "retry",
      label: "Retry",
      steps: [
        { caption: "The server already stored the batch, but the response timed out. The SDK can't tell, so it resends.", ms: 3200 },
        { caption: "The copies carry the same client-generated event_ids, so the dedup check drops them instead of storing twice.", tween: 2200, ms: 3000 },
        { caption: "Each event is stored once. received_time differs on every send, so it could never reveal a duplicate.", ms: 3400 },
      ],
    },
    {
      id: "key",
      label: "Partition key",
      steps: [
        { caption: "Keyed by event_id, load spreads evenly, but user_456's three events scatter over three partitions and lose their order.", tween: 1800, ms: 3400 },
        { caption: "Kafka orders only within a partition. Keyed by user_id, all of user_456's events land in one partition, in order.", tween: 1800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
