/**
 * Figma multiplayer side quest (deep dives 1 and 2): Priya sets the button's x to 112, Arjun its
 * fill to coral and Meera its x to 140 at the same moment; edits apply locally at once, the server
 * that owns the file sequences them, different properties never conflict and for x the last to
 * arrive at the server wins. While Priya drags (x = 100, 105, 112) Meera's x = 140, sequenced just
 * before, is echoed to her: applying it would flicker, so a property with an unacknowledged local
 * change ignores incoming values, and her 112 wins anyway.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;

type Pt = { x: number; y: number };
const mv = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

const NAMES = ["Priya", "Arjun", "Meera"];
const ED = NAMES.map((_, i) => ({ x: 24, y: 28 + i * 88, w: 292, h: 78 }));
const TX0 = 128; // canvas track inside each editor
const TXW = 150;
const BW = 34;
const bx = (v: number) => TX0 + ((v - 90) / 60) * TXW; // x = 90 … 150 → track
const SV = { x: 372, y: 30, w: 204, h: 56 };
const svL: Pt = { x: SV.x, y: SV.y + SV.h / 2 };
const edR = (i: number): Pt => ({ x: ED[i].x + ED[i].w, y: ED[i].y + ED[i].h / 2 });

type View = { x: number; coral: boolean; ghost?: number; tag?: string; tagTone?: Tone };
type Entry = { text: string; tone?: Tone };

function Editor({ i, v, lit, narrow }: { i: number; v: View; lit?: Tone; narrow: boolean }) {
  const e = ED[i];
  const by = e.y + 28;
  return (
    <g>
      <rect className={`ax-box${lit ? " " + lit : ""}`} x={e.x} y={e.y} width={e.w} height={e.h} />
      <Txt x={e.x + 12} y={e.y + 22} k="s" anchor="start">
        {NAMES[i]}
      </Txt>
      <Txt x={e.x + 12} y={e.y + 46} anchor="start" tone={lit === "lit" ? "lit" : undefined}>
        {`x ${Math.round(v.x)}`}
      </Txt>
      <Txt x={e.x + 12} y={e.y + 68} k="s" anchor="start" tone={v.coral ? "lit" : "mute"}>
        {v.coral ? "coral" : narrow ? "fill —" : "fill as-is"}
      </Txt>
      <line className="trk" x1={TX0} x2={TX0 + TXW + BW} y1={by + 30} y2={by + 30} />
      {v.ghost !== undefined && <rect className="ghost" x={bx(v.ghost)} y={by} width={BW} height={22} />}
      <rect className={v.coral ? "btn coral" : "btn"} x={bx(v.x)} y={by} width={BW} height={22} />
      {v.tag && (
        <Txt x={e.x + e.w - 8} y={e.y + 18} k="s" anchor="end" tone={v.tagTone}>
          {v.tag}
        </Txt>
      )}
    </g>
  );
}

function Log({ entries, narrow }: { entries: Entry[]; narrow: boolean }) {
  return (
    <g>
      <Txt x={SV.x} y={SV.y + SV.h + 26} k="k" anchor="start" tone="mute">
        {narrow ? "server order" : "server order (seq)"}
      </Txt>
      {entries.map((e, i) => (
        <Txt key={i} x={SV.x} y={SV.y + SV.h + 52 + i * 26} k="s" anchor="start" tone={e.tone}>
          {e.text}
        </Txt>
      ))}
    </g>
  );
}

function LwwScene({ step, t, narrow }: SceneProps) {
  const toks: (Pt & { tone: Tone })[] = [];
  let views: View[] = [
    { x: 112, coral: false },
    { x: 120, coral: true },
    { x: 140, coral: false },
  ];
  let entries: Entry[] = [];
  const lit: Tone[] = [undefined, undefined, undefined];
  if (step === 0) {
    const a = seg(t, 0, 0.3);
    views = [
      { x: lerp(120, 112, a), coral: false },
      { x: 120, coral: a >= 0.5 },
      { x: lerp(120, 140, a), coral: false },
    ];
    [0, 1, 2].forEach((i) => {
      const p = seg(t, 0.35 + i * 0.04, 0.85 + i * 0.04);
      if (p > 0 && p < 1) toks.push({ ...mv(edR(i), svL, ease(p)), tone: i === 1 ? "lit" : "sky" });
    });
    views.forEach((v) => (v.tag = narrow ? "local" : "applied locally"));
  } else if (step === 1) {
    entries = [
      { text: narrow ? "1 · x = 112 (P)" : "1 · x = 112 · Priya", tone: t >= 0.15 ? "sky" : "mute" },
      { text: narrow ? "2 · fill coral (A)" : "2 · fill = coral · Arjun", tone: t >= 0.45 ? "lit" : "mute" },
      { text: narrow ? "3 · x = 140 (M)" : "3 · x = 140 · Meera", tone: t >= 0.75 ? "sky" : "mute" },
    ];
  } else {
    entries = [
      { text: narrow ? "1 · x = 112 (P)" : "1 · x = 112 · Priya", tone: "mute" },
      { text: narrow ? "2 · fill coral (A)" : "2 · fill = coral · Arjun", tone: "lit" },
      { text: narrow ? "3 · x = 140 (M) ✓" : "3 · x = 140 · Meera ✓", tone: "ok" },
    ];
    const p = ease(seg(t, 0.05, 0.6));
    [0, 1, 2].forEach((i) => {
      if (p > 0 && p < 1) toks.push({ ...mv(svL, edR(i), p), tone: "ok" });
    });
    const done = t >= 0.6;
    views = [
      { x: done ? 140 : 112, coral: done, ghost: done ? 112 : undefined, tag: done ? (narrow ? "was 112" : "showed 112 briefly") : undefined, tagTone: "mute" },
      { x: done ? 140 : 120, coral: true },
      { x: 140, coral: done },
    ];
    if (done) lit.fill("ok");
  }
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <Wire key={i} d={`M${edR(i).x} ${edR(i).y}L${svL.x} ${svL.y}`} tone={step === 2 ? "ok" : undefined} opacity={0.7} />
      ))}
      {[0, 1, 2].map((i) => (
        <Editor key={i} i={i} v={views[i]} lit={lit[i]} narrow={narrow} />
      ))}
      <Box x={SV.x} y={SV.y} w={SV.w} h={SV.h} label={narrow ? "Server" : "Multiplayer server"} sub={step === 0 ? (narrow ? "owns the file" : "one owner per file") : step === 1 ? (narrow ? "orders arrivals" : "orders by arrival") : narrow ? "x: last wins" : "x: last to arrive wins"} tone="lit" />
      <Log entries={entries} narrow={narrow} />
      {step >= 1 && (
        <Txt x={SV.x} y={284} k="s" anchor="start" tone={step === 2 ? "ok" : "mute"}>
          {step === 1 ? (narrow ? "fill, x: separate" : "fill and x: no conflict") : narrow ? "all: coral, x 140" : "every screen: coral, x 140"}
        </Txt>
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
    </g>
  );
}

function FlickerScene({ step, t, narrow }: SceneProps) {
  const toks: (Pt & { tone: Tone })[] = [];
  const drag = [100, 105, 112];
  const entries: Entry[] = [
    { text: narrow ? "1 · x = 140 (M)" : "1 · x = 140 · Meera", tone: "sky" },
    { text: narrow ? "2–4 · x 100…112 (P)" : "2–4 · x = 100…112 · Priya", tone: step === 0 ? (t >= 0.8 ? "lit" : "mute") : "lit" },
  ];
  let pv: View;
  let other = 140;
  if (step === 0) {
    const k = seg(t, 0.1, 0.7);
    const x = k <= 0 ? 120 : k < 0.34 ? drag[0] : k < 0.67 ? drag[1] : drag[2];
    pv = { x, coral: false, tag: narrow ? "x unacked" : "x: unacknowledged", tagTone: "warn" };
    for (let n = 0; n < 3; n++) {
      const p = seg(t, 0.15 + n * 0.2, 0.5 + n * 0.2);
      if (p > 0 && p < 1) toks.push({ ...mv(edR(0), svL, ease(p)), tone: "lit" });
    }
  } else if (step === 1) {
    // naive: the echo of 140 is applied, then the acks bring back 112
    const echo = ease(seg(t, 0, 0.3));
    if (echo > 0 && echo < 1) toks.push({ ...mv(svL, edR(0), echo), tone: "bad" });
    const x = t < 0.3 ? 112 : t < 0.7 ? 140 : 112;
    pv = { x, coral: false, ghost: t >= 0.7 ? 140 : undefined, tag: t >= 0.3 ? (narrow ? "flicker" : "naive: jumped to 140") : narrow ? "x unacked" : "x: unacknowledged", tagTone: t >= 0.3 ? "bad" : "warn" };
    const ack = ease(seg(t, 0.5, 0.7));
    if (ack > 0 && ack < 1) toks.push({ ...mv(svL, edR(0), ack), tone: "ok" });
    other = t >= 0.8 ? 112 : 140;
  } else {
    const echo = ease(seg(t, 0, 0.3));
    if (echo > 0 && echo < 1) toks.push({ ...mv(svL, edR(0), echo), tone: "sky" });
    const ack = ease(seg(t, 0.45, 0.7));
    if (ack > 0 && ack < 1) toks.push({ ...mv(svL, edR(0), ack), tone: "ok" });
    const acked = t >= 0.7;
    pv = { x: 112, coral: false, tag: acked ? (narrow ? "acked ✓" : "acked · 112 won") : t >= 0.3 ? (narrow ? "140 ignored" : "echo 140 ignored") : narrow ? "x unacked" : "x: unacknowledged", tagTone: acked ? "ok" : t >= 0.3 ? "sky" : "warn" };
    other = acked ? 112 : 140;
  }
  if (step >= 1) {
    const b = ease(seg(t, 0.6, 0.85));
    if (b > 0 && b < 1) [1, 2].forEach((i) => toks.push({ ...mv(svL, edR(i), b), tone: "ok" }));
  }
  const views: View[] = [pv, { x: other, coral: false }, { x: other, coral: false }];
  const final = step === 2 && t >= 0.85;
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <Wire key={i} d={`M${edR(i).x} ${edR(i).y}L${svL.x} ${svL.y}`} tone={i === 0 ? "lit" : undefined} opacity={0.7} />
      ))}
      {[0, 1, 2].map((i) => (
        <Editor key={i} i={i} v={views[i]} lit={i === 0 ? (step === 1 && t >= 0.3 ? "bad" : final ? "ok" : "lit") : final ? "ok" : undefined} narrow={narrow} />
      ))}
      <Box x={SV.x} y={SV.y} w={SV.w} h={SV.h} label={narrow ? "Server" : "Multiplayer server"} sub={step === 0 ? (narrow ? "140 came first" : "Meera's 140 came first") : narrow ? "echo, then acks" : "echo 140, then acks"} tone="lit" />
      <Log entries={entries} narrow={narrow} />
      <Txt x={SV.x} y={284} k="s" anchor="start" tone={step === 1 ? "bad" : step === 2 ? "ok" : "mute"}>
        {step === 0 ? (narrow ? "drag: 150 ms" : "drag over 150 ms") : step === 1 ? (narrow ? "flicker: 140 → 112" : "140, then 112: flicker") : narrow ? "no flicker: 112" : "no flicker, 112 everywhere"}
      </Txt>
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "flicker" ? <FlickerScene {...p} /> : <LwwScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "lww",
      label: "Per-property LWW",
      steps: [
        { caption: "At once: Priya sets x to 112, Arjun sets fill to coral, Meera sets x to 140. Each applies locally.", tween: 2000 },
        { caption: "The file's server orders the changes as they arrive. fill and x are different properties, so they never conflict.", tween: 1800 },
        { caption: "For x, the last to arrive wins: 140. Every screen applies the server's order: coral, at x 140.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "flicker",
      label: "No flicker",
      steps: [
        { caption: "Priya drags x through 100, 105, 112, applied at once and sent. Meera's x = 140 reached the server first.", tween: 2400 },
        { caption: "A naive editor applies the echoed 140: the button jumps under her cursor, then back to 112. Flicker.", tween: 2600 },
        { caption: "The rule: while x is unacknowledged, ignore incoming x. 140 was sequenced first, so 112 wins anyway.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  css: `.btn{fill:var(--ax-box);stroke:var(--ax-fg2);stroke-width:2}.btn.coral{fill:var(--ax-accent);stroke:var(--ax-accent)}.ghost{fill:none;stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:4 4}.trk{stroke:var(--ax-line-soft);stroke-width:1.5}`,
  Scene,
});
