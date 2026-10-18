/**
 * Zerodha Kite side quest (deep dive 3): a ticker server keeps only the latest encoded packet per
 * instrument (ten ticks in a second overwrite one slot), flushes once a second, encodes each
 * 44-byte quote packet once and copies the same bytes to every subscriber (~20 packets, ~922 bytes
 * per connection); a socket with more than 64 KB unsent is skipped and its missed instruments
 * remembered, it is closed (4008, slow consumer) after ~10 s behind, and the app reconnects,
 * resubscribes and gets the latest snapshot in the next flush.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;

type Pt = { x: number; y: number };
const mv = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

const EX = { x: 24, y: 104, w: 112, h: 64 };
const TB = { x: 180, y: 52, w: 196, h: 168 };
const ROWS = ["408065", "token 2", "token 3"];
const rowY = (i: number) => TB.y + 44 + i * 40;
const CX = 446;
const CW = 130;
const CONNS = [0, 1, 2, 3].map((i) => ({ x: CX, y: 32 + i * 58, w: CW, h: 44 }));
const SLOW = 2;

function Table({ ticks, hotRow, narrow, label }: { ticks: number; hotRow: boolean; narrow: boolean; label: string }) {
  return (
    <g>
      <Txt x={TB.x} y={TB.y - 10} k="k" anchor="start">
        {label}
      </Txt>
      <rect className="ax-box" x={TB.x} y={TB.y} width={TB.w} height={TB.h} />
      <Txt x={TB.x + 12} y={TB.y + 22} k="s" anchor="start" tone="mute">
        token
      </Txt>
      <Txt x={TB.x + TB.w - 12} y={TB.y + 22} k="s" anchor="end" tone="mute">
        {narrow ? "slot" : "latest packet"}
      </Txt>
      {ROWS.map((r, i) => (
        <g key={r}>
          <rect className={`ax-box${i === 0 && hotRow ? " lit" : ""}`} x={TB.x + 8} y={rowY(i) - 16} width={TB.w - 16} height={30} />
          <Txt x={TB.x + 18} y={rowY(i) + 4} k="s" anchor="start" tone={i === 0 ? undefined : "mute"}>
            {narrow && i > 0 ? `#${i + 1}` : r}
          </Txt>
          <Txt x={TB.x + TB.w - 18} y={rowY(i) + 4} k="s" anchor="end" tone={i === 0 && hotRow ? "lit" : "mute"}>
            {i === 0 ? (ticks ? `tick ${ticks}` : "—") : "tick 1"}
          </Txt>
        </g>
      ))}
    </g>
  );
}

function Conns({ state, narrow }: { state: (i: number) => { sub: string; tone: Tone; dim?: boolean } ; narrow: boolean }) {
  return (
    <g>
      <Txt x={CX} y={22} k="k" anchor="start" tone="mute">
        {narrow ? "sockets" : "subscribers"}
      </Txt>
      {CONNS.map((c, i) => {
        const s = state(i);
        return <Box key={i} x={c.x} y={c.y + 4} w={c.w} h={c.h} label={`phone ${i + 1}`} sub={s.sub} tone={s.tone} dim={s.dim} />;
      })}
    </g>
  );
}

const TR: Pt = { x: TB.x + TB.w, y: TB.y + TB.h / 2 };
const connL = (i: number): Pt => ({ x: CX, y: CONNS[i].y + 4 + CONNS[i].h / 2 });

function CoalesceScene({ step, t, narrow }: SceneProps) {
  const toks: (Pt & { tone: Tone; s?: number })[] = [];
  const exR: Pt = { x: EX.x + EX.w, y: EX.y + EX.h / 2 };
  const ticks = step === 0 ? Math.min(10, Math.floor(seg(t, 0, 0.9) * 10) + (t > 0 ? 1 : 0)) : 10;
  if (step === 0)
    for (let k = 0; k < 10; k++) {
      const p = seg(t, k * 0.085, k * 0.085 + 0.12);
      if (p > 0 && p < 1) toks.push({ ...mv(exR, { x: TB.x + 8, y: rowY(0) }, p), tone: "lit", s: 8 });
    }
  const flushed = step >= 1 && t >= 0.75;
  if (step === 1)
    CONNS.forEach((_, i) => {
      const p = seg(t, 0.25, 0.75);
      if (p > 0 && p < 1) toks.push({ ...mv(TR, connL(i), ease(p)), tone: "ok" });
    });
  const flush = step === 0 ? seg(t, 0, 1) : 1;
  return (
    <g>
      <Box x={EX.x} y={EX.y} w={EX.w} h={EX.h} label="Exchange" sub={narrow ? "ticks" : "feed ticks"} tone={step === 0 ? "lit" : undefined} />
      <Wire d={`M${exR.x} ${exR.y}L${TB.x} ${exR.y}`} arrow tone={step === 0 ? "lit" : undefined} />
      <Table ticks={ticks} hotRow={step === 0 || !flushed} narrow={narrow} label={narrow ? "latest per token" : "latest per instrument"} />
      {CONNS.map((_, i) => (
        <Wire key={i} d={`M${TR.x} ${TR.y}L${connL(i).x} ${connL(i).y}`} tone={step === 1 ? "ok" : undefined} opacity={step === 0 ? 0.4 : 1} />
      ))}
      <Conns narrow={narrow} state={() => (step === 0 ? { sub: "waiting", tone: undefined } : flushed ? { sub: step === 2 ? "~922 B/s" : "tick 10 ✓", tone: "ok" } : { sub: "waiting", tone: undefined })} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={k.s ?? 10} tone={k.tone} />
      ))}
      <Txt x={24} y={44} k="k" anchor="start" tone="mute">
        {narrow ? "this second" : "ticks this second"}
      </Txt>
      <Txt x={24} y={82} k="d" anchor="start" tone={step === 0 ? "lit" : undefined}>
        {String(ticks)}
      </Txt>
      <Txt x={TB.x} y={TB.y + TB.h + 22} k="s" anchor="start">
        {step === 0 ? (narrow ? "flush every 1 s" : "flush once a second") : step === 1 ? (narrow ? "encode once, copy" : "encoded once, same bytes to all") : narrow ? "1 msg/s, ~20 pkts" : "1 message/s · ~20 packets"}
      </Txt>
      <Meter x={TB.x} y={TB.y + TB.h + 32} w={TB.w} h={6} value={flush} max={1} tone={flush >= 1 ? "ok" : "lit"} />
      <Txt x={24} y={226} k="k" anchor="start" tone="mute">
        {narrow ? "sent each" : "sent to each"}
      </Txt>
      <Txt x={24} y={262} anchor="start" tone={flushed ? "ok" : "mute"}>
        {flushed ? (step === 2 ? (narrow ? "20 × 46 B" : "20 × 46 B + 2") : narrow ? "1 packet" : "1 packet, 46 B") : "nothing yet"}
      </Txt>
      <Txt x={24} y={286} k="s" anchor="start" tone="mute">
        {step === 2 ? (narrow ? "not 10 ticks" : "not every tick: snapshots") : narrow ? "44 B + 2 B length" : "44 B quote + 2 B length"}
      </Txt>
    </g>
  );
}

function SlowScene({ step, t, narrow }: SceneProps) {
  const toks: (Pt & { tone: Tone })[] = [];
  const closed = step === 1 && t >= 0.7;
  const back = step === 2 && t >= 0.4;
  const buf = step === 0 ? lerp(40, 70, seg(t, 0, 0.5)) : step === 1 && !closed ? 70 : 0;
  const behind = step === 0 ? 1 : step === 1 ? Math.round(lerp(1, 10, seg(t, 0, 0.6))) : 0;
  CONNS.forEach((_, i) => {
    if (i === SLOW && !(step === 2 && t >= 0.6)) return;
    if (step === 1 && i !== SLOW) {
      const p = seg(t, 0.05, 0.45);
      if (p > 0 && p < 1) toks.push({ ...mv(TR, connL(i), ease(p)), tone: "ok" });
      return;
    }
    const p = seg(t, step === 2 && i === SLOW ? 0.6 : 0.2, step === 2 && i === SLOW ? 0.92 : 0.6);
    if (p > 0 && p < 1) toks.push({ ...mv(TR, connL(i), ease(p)), tone: "ok" });
  });
  if (step === 2) {
    const p = seg(t, 0.05, 0.4);
    if (p > 0 && p < 1) toks.push({ ...mv(connL(SLOW), TR, ease(p)), tone: "sky" });
  }
  const slowSub = step === 0 ? (t >= 0.5 ? (narrow ? "skipped" : "skipped · missed") : narrow ? "in a lift" : "in a lift") : step === 1 ? (closed ? "closed 4008" : `${behind} s behind`) : back ? (t >= 0.92 ? (narrow ? "latest ✓" : "latest values ✓") : "resubscribed") : "reconnecting";
  const slowTone: Tone = step === 2 ? (t >= 0.92 ? "ok" : "sky") : closed ? "bad" : "warn";
  return (
    <g>
      <Table ticks={10} hotRow={false} narrow={narrow} label={narrow ? "ticker server" : "one ticker server"} />
      {CONNS.map((_, i) => (
        <Wire key={i} d={`M${TR.x} ${TR.y}L${connL(i).x} ${connL(i).y}`} tone={i === SLOW ? (step === 2 ? (back ? "ok" : "mute") : closed ? "mute" : "bad") : "ok"} dash={i === SLOW && !back} />
      ))}
      <Conns narrow={narrow} state={(i) => (i === SLOW ? { sub: slowSub, tone: slowTone, dim: closed } : { sub: "live ✓", tone: "ok" })} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
      <Txt x={24} y={44} k="k" anchor="start" tone={buf > 64 ? "bad" : "mute"}>
        {narrow ? "buffer" : "send buffer"}
      </Txt>
      <Meter x={24} y={56} w={130} h={12} value={buf} max={80} tone={buf > 64 ? "bad" : "warn"} />
      <line className="lim" x1={24 + (130 * 64) / 80} x2={24 + (130 * 64) / 80} y1={50} y2={74} />
      <Txt x={24 + (130 * 64) / 80} y={90} k="s" tone="bad">
        64 KB
      </Txt>
      <Txt x={24} y={130} k="s" anchor="start" tone="mute">
        missed
      </Txt>
      <Txt x={24} y={152} anchor="start" tone={step === 2 ? "ok" : "warn"}>
        {step === 2 ? (back ? (narrow ? "next flush" : "→ in next flush") : "—") : closed ? "dropped" : "{408065, …}"}
      </Txt>
      <Txt x={TB.x} y={TB.y + TB.h + 22} k="s" anchor="start">
        {step === 0 ? (narrow ? "others: no delay" : "others flush on time") : step === 1 ? (narrow ? "close at ~10 s" : "behind ~10 s → close") : narrow ? "backoff + jitter" : "jittered backoff, resubscribe"}
      </Txt>
      <Txt x={24} y={226} k="k" anchor="start" tone="mute">
        server memory
      </Txt>
      <Txt x={24} y={262} anchor="start" tone="ok">
        {narrow ? "bounded" : "bounded: 64 KB"}
      </Txt>
      <Txt x={24} y={286} k="s" anchor="start" tone="mute">
        {narrow ? "snapshots: skip is safe" : "ticks are snapshots: skipping is safe"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "slow" ? <SlowScene {...p} /> : <CoalesceScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "coalesce",
      label: "Coalescing",
      steps: [
        { caption: "At the open, instrument 408065 ticks ten times in one second. Each tick overwrites its one latest-packet slot.", tween: 2600 },
        { caption: "Once a second the flush sends the latest packet, encoded once: the same bytes go to every subscriber.", tween: 1800 },
        { caption: "Each phone gets one binary message a second, ~20 changed packets in ~922 bytes, never a backlog of old ticks.", tween: 900, ms: 3400 },
      ],
    },
    {
      id: "slow",
      label: "Slow phone",
      steps: [
        { caption: "Phone 3 stops reading in a lift. Past 64 KB unsent, flushes skip it and remember what it missed.", tween: 2200 },
        { caption: "Everyone else stays live, and the server holds no growing backlog. Still behind at ~10 s: closed, 4008 slow consumer.", tween: 2600 },
        { caption: "Out of the lift, the app reconnects with jittered backoff and resubscribes; the next flush brings the latest values.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  css: `.lim{stroke:var(--ax-bad);stroke-width:2}`,
  Scene,
});
