/**
 * Synchronous vs asynchronous communication (week 0, part 1 · 4.1): request-response blocks the
 * client until the server answers (and fails with it); a queue ACKs the producer at once, so the
 * producer keeps working while the consumer processes and ACKs later.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const TR = { x: 132, w: 444, h: 20 };

type Seg = { a: number; b: number; c: "wait" | "work" | "err" | "send"; label?: string };

function Track({ y, label, segs, upto, narrow }: { y: number; label: string; segs: Seg[]; upto: number; narrow: boolean }) {
  return (
    <g>
      <Txt x={24} y={y + 15} k="s" anchor="start">
        {label}
      </Txt>
      <rect className="sa-track" x={TR.x} y={y} width={TR.w} height={TR.h} />
      {segs.map((s, i) => {
        const b = Math.min(s.b, upto);
        if (b <= s.a) return null;
        const x = TR.x + s.a * TR.w;
        const w = (b - s.a) * TR.w;
        const fits = s.label && w > s.label.length * (narrow ? 9.8 : 7.4) + 10;
        const tone: Tone = s.c === "wait" ? "warn" : s.c === "err" ? "bad" : s.c === "work" ? "ok" : "lit";
        return (
          <g key={i}>
            <rect className={`sa-${s.c}`} x={x} y={y} width={w} height={TR.h} />
            {fits && (
              <Txt x={x + w / 2} y={y + 15} k="s" tone={tone}>
                {s.label}
              </Txt>
            )}
          </g>
        );
      })}
    </g>
  );
}

const along = (a: { x: number; y: number }, b: { x: number; y: number }, p: number) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

function SyncScene({ step, t, narrow }: SceneProps) {
  const C = { x: 40, y: 64, w: 156, h: 72 };
  const S = { x: 404, y: 64, w: 156, h: 72 };
  const up = { a: { x: C.x + C.w, y: C.y + 24 }, b: { x: S.x, y: S.y + 24 } };
  const dn = { a: { x: S.x, y: S.y + 48 }, b: { x: C.x + C.w, y: C.y + 48 } };
  const down = step === 3;
  const toks: { x: number; y: number; tone: Tone; label?: string }[] = [];
  if (step === 0 || down) {
    const p = ease(seg(t, 0, down ? 0.45 : 0.8));
    if (p < 1) toks.push({ ...along(up.a, up.b, p), tone: down ? "bad" : "lit", label: "request" });
  }
  if (step === 2) {
    const p = ease(seg(t, 0.05, 0.85));
    if (p < 1) toks.push({ ...along(dn.a, dn.b, p), tone: "ok", label: "response" });
  }
  if (down && t > 0.55) {
    const p = ease(seg(t, 0.55, 0.9));
    if (p < 1) toks.push({ ...along(dn.a, dn.b, p), tone: "bad", label: "error" });
  }
  const failed = down && t >= 0.9;
  const cSub = step === 0 ? "sends request" : step === 1 ? "waiting…" : step === 2 ? (t > 0.85 ? "continues" : "waiting…") : failed ? "error" : "waiting…";
  const cTone: Tone = step === 1 || (step === 2 && t <= 0.85) || (down && !failed) ? "warn" : failed ? "bad" : step === 2 ? "ok" : undefined;
  const sSub = down ? "DOWN" : step === 0 ? (t > 0.8 ? "received" : "idle") : step === 1 ? "processing…" : "done";
  const proc = step === 1 ? t : step === 2 ? 1 : 0;
  const upto = step === 0 ? lerp(0, 0.1, t) : step === 1 ? lerp(0.1, 0.78, t) : step === 2 ? lerp(0.78, 1, t) : t;
  const client: Seg[] = down
    ? [
        { a: 0, b: 0.08, c: "send" },
        { a: 0.08, b: 0.72, c: "wait", label: "waiting" },
        { a: 0.72, b: 1, c: "err", label: "error" },
      ]
    : [
        { a: 0, b: 0.08, c: "send" },
        { a: 0.08, b: 0.8, c: "wait", label: "blocked" },
        { a: 0.8, b: 1, c: "work", label: narrow ? "go" : "continues" },
      ];
  const server: Seg[] = down ? [{ a: 0, b: 1, c: "err", label: "down" }] : [{ a: 0.1, b: 0.78, c: "work", label: "processing" }];
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={down ? "bad" : undefined}>
        {down ? (narrow ? "server down" : "server down · single point of failure") : narrow ? "request-response" : "synchronous · request-response"}
      </Txt>
      <Box x={C.x} y={C.y} w={C.w} h={C.h} label="Client" sub={cSub} tone={cTone} />
      <Box x={S.x} y={S.y} w={S.w} h={S.h} label="Server" sub={sSub} tone={down ? "bad" : step === 1 ? "lit" : undefined} />
      <Wire d={`M${up.a.x} ${up.a.y}H${up.b.x}`} arrow tone={step === 0 ? "lit" : down ? "bad" : undefined} />
      <Wire d={`M${dn.a.x} ${dn.a.y}H${dn.b.x}`} arrow tone={step === 2 ? "ok" : down && t > 0.55 ? "bad" : undefined} />
      {down && (
        <Txt x={S.x - 16} y={up.a.y + 6} k="t" tone="bad" anchor="end">
          ✕
        </Txt>
      )}
      <Meter x={S.x} y={S.y + S.h + 12} w={S.w} h={10} value={proc} max={1} tone={step === 2 ? "ok" : "lit"} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} label={narrow ? undefined : k.label} />
      ))}
      <Txt x={24} y={206} k="k" anchor="start" tone="mute">
        time →
      </Txt>
      <Track y={220} label="client" segs={client} upto={upto} narrow={narrow} />
      <Track y={256} label="server" segs={server} upto={upto} narrow={narrow} />
    </g>
  );
}

function AsyncScene({ step, t, narrow }: SceneProps) {
  const P = { x: 24, y: 64, w: 140, h: 72 };
  const Q = { x: 230, y: 64, w: 140, h: 72 };
  const C = { x: 436, y: 64, w: 140, h: 72 };
  const lane = (a: typeof P, b: typeof P, top: boolean) =>
    top ? { a: { x: a.x + a.w, y: a.y + 24 }, b: { x: b.x, y: b.y + 24 } } : { a: { x: b.x, y: b.y + 48 }, b: { x: a.x + a.w, y: a.y + 48 } };
  const pq = lane(P, Q, true);
  const qp = lane(P, Q, false);
  const qc = lane(Q, C, true);
  const cq = lane(Q, C, false);
  const toks: { x: number; y: number; tone: Tone; label?: string }[] = [];
  let inQueue = false;
  if (step === 0) {
    const m = ease(seg(t, 0, 0.5));
    if (m < 1) toks.push({ ...along(pq.a, pq.b, m), tone: "lit", label: "message" });
    else inQueue = true;
    const a = ease(seg(t, 0.55, 1));
    if (t > 0.55 && a < 1) toks.push({ ...along(qp.a, qp.b, a), tone: "ok", label: "ACK" });
  }
  if (step === 1) inQueue = true;
  if (step === 2) {
    const m = ease(seg(t, 0, 0.5));
    if (m < 1) toks.push({ ...along(qc.a, qc.b, m), tone: "lit", label: "push" });
  }
  if (step === 3) {
    const a = ease(seg(t, 0.1, 0.8));
    if (a < 1) toks.push({ ...along(cq.a, cq.b, a), tone: "ok", label: "ACK" });
  }
  const proc = step === 2 ? seg(t, 0.5, 1) : step === 3 ? 1 : 0;
  const pSub = step === 0 ? (t > 0.95 ? "continues" : "sends") : narrow ? "working" : "keeps working";
  const qSub = inQueue ? "1 message" : step === 3 ? (t > 0.8 ? "processed ✓" : "delivered") : step === 2 ? "delivered" : "empty";
  const cSub = step < 2 ? "idle" : step === 2 ? (t > 0.5 ? "processing…" : "receives") : "done";
  const upto = step === 0 ? lerp(0, 0.16, t) : step === 1 ? lerp(0.16, 0.5, t) : step === 2 ? lerp(0.5, 0.82, t) : lerp(0.82, 1, t);
  const prod: Seg[] = [
    { a: 0, b: 0.08, c: "send" },
    { a: 0.08, b: 1, c: "work", label: narrow ? "working" : "keeps working, never blocked" },
  ];
  const cons: Seg[] = [{ a: 0.52, b: 0.86, c: "work", label: "processing" }];
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "message-based" : "asynchronous · message-based"}
      </Txt>
      <Box x={P.x} y={P.y} w={P.w} h={P.h} label="Producer" sub={pSub} tone={step >= 1 || t > 0.95 ? "ok" : undefined} />
      <Box x={Q.x} y={Q.y} w={Q.w} h={Q.h} label="Queue" sub={qSub} tone={inQueue ? "lit" : undefined} />
      <Box x={C.x} y={C.y} w={C.w} h={C.h} label="Consumer" sub={cSub} tone={step === 2 && t > 0.5 ? "lit" : step === 3 ? "ok" : undefined} />
      {[pq, qp, qc, cq].map((l, i) => (
        <Wire key={i} d={`M${l.a.x} ${l.a.y}H${l.b.x}`} arrow tone={(i === 0 && step === 0) || (i === 2 && step === 2) ? "lit" : (i === 1 && step === 0 && t > 0.55) || (i === 3 && step === 3) ? "ok" : undefined} />
      ))}
      {inQueue && <rect className="sa-msg" x={Q.x + Q.w - 22} y={Q.y + Q.h + 10} width={12} height={12} />}
      <Meter x={C.x} y={C.y + C.h + 12} w={C.w} h={10} value={proc} max={1} tone={proc >= 1 ? "ok" : "lit"} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} label={narrow ? undefined : k.label} />
      ))}
      <Txt x={24} y={206} k="k" anchor="start" tone="mute">
        time →
      </Txt>
      <Track y={220} label="producer" segs={prod} upto={upto} narrow={narrow} />
      <Track y={256} label="consumer" segs={cons} upto={upto} narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "async" ? <AsyncScene {...p} /> : <SyncScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sa-track{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.sa-send,.sa-msg{fill:var(--ax-accent)}
.sa-wait{fill:var(--ax-amber);fill-opacity:.22;stroke:var(--ax-amber);stroke-width:1.5}
.sa-work{fill:var(--ax-ok);fill-opacity:.2;stroke:var(--ax-ok);stroke-width:1.5}
.sa-err{fill:var(--ax-bad);fill-opacity:.22;stroke:var(--ax-bad);stroke-width:1.5}`,
  variants: [
    {
      id: "sync",
      label: "Synchronous",
      steps: [
        { caption: "Request-response: the client sends a request to the server.", tween: 1400, ms: 2200 },
        { caption: "The server processes, which could be slow. The client is blocked, waiting, unable to move on.", tween: 2200, ms: 2600 },
        { caption: "The response arrives and only now the client continues. Simple, immediate feedback, but tightly coupled.", tween: 1400, ms: 3000 },
        { caption: "If the server is down, the waiting client gets an error: a single point of failure.", tween: 2200, ms: 3200 },
      ],
    },
    {
      id: "async",
      label: "Asynchronous",
      steps: [
        { caption: "The producer sends a message to the queue, which ACKs right away: received.", tween: 1800, ms: 2200 },
        { caption: "The producer continues its work without waiting. The message waits in the queue as a buffer.", tween: 1400, ms: 2600 },
        { caption: "The queue pushes the message to the consumer (or the consumer polls), which processes it.", tween: 1800, ms: 2600 },
        { caption: "The consumer ACKs once processed. Neither side ever waited on the other: loose coupling.", tween: 1400, ms: 3200 },
      ],
    },
  ],
  Scene,
});
