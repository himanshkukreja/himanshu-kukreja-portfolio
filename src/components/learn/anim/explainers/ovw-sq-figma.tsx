/**
 * The whole side quest, Figma multiplayer: the mission and scale (13M+ users, 500 people in a
 * file, 2.2B+ changes a day), the estimate (~600K open files, 100K edits/s vs 3.6M cursor
 * updates/s; ~12 TB of documents in memory on ~175 servers), the architecture (optimistic local
 * edit → one owner per file sequences it → echo and ack → journal every 0.5 s, checkpoints; cursors
 * on a side path), the deep dives (per-property LWW, the tree, the flicker rule, cursor fan-out,
 * crash and fencing) and scale and edge cases (offline merge, huge files, draining a 500-person
 * review).
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[Object.keys(F)[0]]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  priya: { x: 16, y: 40, w: 88, h: 44, l: "Priya" },
  arjun: { x: 16, y: 152, w: 88, h: 44, l: "Arjun" },
  gw: { x: 128, y: 96, w: 92, h: 52, l: "Gateway", n: "Gate" },
  lock: { x: 248, y: 40, w: 120, h: 40, l: "Lock table", n: "Lock" },
  mp: { x: 248, y: 96, w: 120, h: 52, l: "Multiplayer", n: "Owner" },
  pres: { x: 248, y: 156, w: 120, h: 40, l: "Presence", n: "Cursors" },
  journal: { x: 400, y: 40, w: 184, h: 44, l: "Journal" },
  ckpt: { x: 400, y: 96, w: 184, h: 44, l: "Checkpoints", n: "Ckpt" },
  viewers: { x: 400, y: 152, w: 184, h: 44, l: "150 viewers", n: "Viewers" },
};
const E: [string, string][] = [
  ["priya", "gw"],
  ["arjun", "gw"],
  ["gw", "mp"],
  ["mp", "lock"],
  ["mp", "pres"],
  ["mp", "journal"],
  ["mp", "ckpt"],
  ["mp", "viewers"],
];
const ALL = { priya: 1, arjun: 1, gw: 1, lock: 1, mp: 1, pres: 1, journal: 1, ckpt: 1, viewers: 1 } as const;
const ECHO: [string, string, Tone?][] = [
  ["mp", "gw", "ok"],
  ["gw", "arjun", "ok"],
  ["mp", "viewers", "ok"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Figma · the scale", on: { priya: "lit", arjun: 1, mp: 1 }, figs: [["13M+", "monthly users"], ["500", ["people in one file", "in one file"], "lit"], ["2.2B+", "changes a day"]], note: ["200 of them editing, 200 visible cursors", "200 editing, 200 cursors"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["your edit: the next frame", "own edit instant"], ["others: p95 < 150 ms", "p95 < 150 ms"], ["no saved edit ever lost", "no lost edits"], ["live cursors", "live cursors"], ["offline, then merge", "offline merge"], ["huge files open fast", "huge files"]],
      ctn: ["lit", "lit", "bad"],
    },
    { k: "edits vs cursors", on: { priya: 1, arjun: 1, gw: 1, mp: "lit", pres: "warn" }, fl: [["priya", "gw"], ["gw", "mp"], ["mp", "pres", "warn"]], figs: [["600K", "open files"], ["100K/s", ["edits, design peak", "edits/s"]], ["3.6M/s", ["cursor updates", "cursors/s"], "warn"]], note: ["1.5 million sessions ÷ 2.5 per file", "1.5M sessions ÷ 2.5"] },
    { k: "memory runs out first", kt: "warn", on: { mp: "warn", journal: 1 }, sub: { mp: ["whole file", "in RAM"] }, figs: [["~12 TB", ["documents in memory", "in memory"], "warn"], ["~175", "servers"], ["~432 GB", ["journal a day", "journal/day"]]], note: ["600,000 files × ~20 MB each", "600K files × ~20 MB"] },
  ],
  arch: [
    { k: "1 · apply at once", on: { priya: "lit", gw: 1, mp: "lit" }, sub: { priya: ["x = 112", "112"], mp: ["seq 9,012", "9,012"] }, fl: [["priya", "gw"], ["gw", "mp"]], note: ["Priya never waits for the network to see her own edit", "no wait for the network"] },
    { k: "2 · echo and ack", kt: "ok", on: { priya: "ok", arjun: "lit", gw: 1, mp: 1, viewers: 1 }, sub: { priya: ["acked", "ack"], arjun: ["x = 112", "112"] }, fl: [["gw", "priya", "ok"], ...ECHO], note: ["the server's order is the truth; no clock decides", "server order, not clocks"], nt: "ok" },
    { k: "3 · save behind it", on: { mp: 1, lock: 1, journal: "lit", ckpt: 1 }, sub: { journal: ["every 0.5 s", "0.5 s"], ckpt: ["every 10 min", "10 min"] }, fl: [["mp", "journal"], ["mp", "ckpt", "sky"]], note: ["95% of edits saved within 600 ms · writes need the lock", "95% saved in 600 ms"] },
    { k: "4 · cursors on the side", on: { priya: 1, arjun: 1, gw: 1, mp: 1, pres: "lit" }, sub: { pres: ["memory only", "memory"] }, fl: [["priya", "gw", "sky"], ["mp", "pres", "sky"]], note: ["20 updates a second, never sequenced, never saved", "never saved"] },
  ],
  deep: [
    { k: "1 · per-property LWW", on: { priya: 1, arjun: 1, gw: 1, mp: "lit" }, fl: [["priya", "gw"], ["arjun", "gw"], ["gw", "mp"]], chips: [["Map<ID, Map<Prop, Value>>", "two-level map"], ["x and fill: no conflict", "no conflict"], ["same property: last arrival", "LWW by arrival"], ["the seq is the only clock", "seq is the clock"]], ctn: [undefined, "ok", "lit", "lit"] },
    { k: "2 · the tree", on: { mp: "lit" }, sub: { mp: ["checks moves", "checks"] }, chips: [["the parent is a property", "parent property"], ["sibling order: fractions", "fractions"], ["IDs carry the client: 17:204", "client IDs"], ["cycles rejected", "no cycles"]], ctn: [undefined, undefined, undefined, "bad"] },
    { k: "3 · no flicker", kt: "warn", on: { priya: "warn", gw: 1, mp: 1 }, sub: { priya: ["unacked x", "unacked"] }, fl: [["priya", "gw", "warn"], ["gw", "priya"]], chips: [["drag: 100, 105, 112", "100, 105, 112"], ["Meera's 140 echoed", "140 echoed"], ["ignored: x is unacked", "ignore it"], ["a reject rolls back", "reject → undo"]], ctn: [undefined, "warn", "ok", "bad"] },
    { k: "4 · 200 cursors", on: { mp: 1, pres: "lit", viewers: "warn" }, sub: { pres: ["coalesce", "latest"] }, fl: [["mp", "pres"], ["mp", "viewers", "warn"]], figs: [["2M/s", ["naive, 500 people", "naive"], "bad"], ["256 Mbps", ["from one server", "one server"]], ["~6 KB/s", ["per viewer, tuned", "tuned"], "ok"]] },
    { k: "5 · the owner crashes", kt: "bad", on: { mp: "bad", lock: "lit", journal: 1, ckpt: 1, priya: "warn" }, sub: { mp: ["crashed", "down"], lock: ["new UUID", "UUID"], priya: ["outbox", "outbox"] }, chips: [["checkpoint + journal replay", "replay"], ["unsaved edits in outboxes", "outboxes resend"], ["a new lock UUID fences", "fencing"], ["resends are idempotent", "idempotent"]], ctn: [undefined, "warn", "lit", "ok"] },
  ],
  scale: [
    { k: "three hours offline", kt: "warn", on: { arjun: "warn", gw: 1, mp: "lit" }, sub: { arjun: ["outbox", "outbox"] }, fl: [["arjun", "gw", "warn"], ["gw", "mp"]], chips: [["outbox on disk", "outbox on disk"], ["fresh copy, replay on top", "replay on top"], ["5 buttons: Arjun's win", "his colours win"], ["deleted frame: rejected", "deleted: rejected"]], ctn: [undefined, undefined, "warn", "bad"] },
    { k: "huge files", on: { mp: "lit", viewers: 1, priya: 1, gw: 1 }, sub: { mp: ["whole file", "all"] }, fl: [["gw", "priya"]], figs: [["70%", ["fewer objects loaded", "fewer objects"], "ok"], ["33%", ["faster slow loads", "faster"], "ok"], ["5 s+", ["decode, largest", "decode"], "warn"]], note: ["load the first page and its dependencies, the rest on demand", "first page first"] },
    { k: "a 500-person drain", kt: "warn", on: { ...ALL, mp: "warn", lock: "lit" }, sub: { lock: ["flip UUID", "flip"] }, fl: [["mp", "lock"], ["mp", "journal"]], figs: [["20 GB", ["naive: 500 × 40 MB", "naive"], "bad"], ["0.2 s", ["load the checkpoint", "checkpoint"]], ["~1 s", ["warmed handoff", "handoff"], "ok"]] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, mp: "ok", journal: "ok" }, fl: [["priya", "gw"], ["gw", "mp"], ["mp", "journal", "ok"], ["gw", "arjun", "ok"]], cols: 3, chips: [["one owner per file", "one owner"], ["in memory", "in memory"], ["fenced journal", "fenced journal"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Figma: 13 million+ monthly users, up to 500 people in one file with 200 editing, and 2.2 billion+ changes a day through its journal.", tween: 1400 },
      { caption: "Your own edit shows on the next frame, others' within 150 ms; no edit anyone saw applied is lost; cursors are live; offline work merges back.", tween: 1400 },
      { caption: "1.5 million sessions at peak is ~600,000 open files and up to 100,000 edits a second. Cursors are 36 times that: 3.6 million a second.", tween: 1400, loop: true },
      { caption: "Each open file lives whole in memory: ~12 TB on ~175 servers, so memory runs out long before CPU. The journal adds ~432 GB a day.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Priya nudges the Pay button: her editor applies x = 112 at once. The file's one multiplayer server checks it and gives it sequence 9,012.", tween: 1200, loop: true },
      { caption: "The server acks Priya and echoes seq 9,012 to Arjun and the 150 viewers. Its order is the truth; nobody's clock decides.", tween: 1200, loop: true },
      { caption: "Every half second the owner appends a batch to the journal, if its lock matches: 95% of edits are saved within 600 ms. Checkpoints come rarely.", tween: 1200, loop: true },
      { caption: "Cursors share the connection but take a side path: 20 updates a second, kept in memory, never sequenced and never saved.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "A file is a map of objects to properties. Arjun's fill and Priya's x never conflict; for one property, the last to reach the server wins.", tween: 1400, loop: true },
      { caption: "The tree: each layer's parent is just a property, sibling order is a fraction, and the server rejects any move that would make a cycle.", tween: 1400 },
      { caption: "While Priya drags (100, 105, 112), Meera's earlier 140 is echoed to her. Her editor ignores values for a property not yet acknowledged.", tween: 1400, loop: true },
      { caption: "200 cursors × 20 a second × 499 viewers is 2 million entries a second. Coalesce, drop to 10 a second, filter by viewport: ~6 KB/s each.", tween: 1400, loop: true },
      { caption: "The owner crashes: the new one loads the checkpoint, replays the journal and fences the old with a new lock UUID. Unsaved edits wait in outboxes.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "After 3 hours offline, Arjun's outbox replays on a fresh copy: his 5 colours win as the last writes, and his move of a deleted frame is rejected.", tween: 1400, loop: true },
      { caption: "Huge files: load the first page and its dependencies, the rest on demand: 70% fewer objects in the client, 33% faster for the slowest files.", tween: 1400, loop: true },
      { caption: "Draining a 500-person review: reloading the file for everyone is 20 GB. Warm the new owner first, flip the lock, and the pause is about a second.", tween: 1400, loop: true },
      { caption: "The lesson: one owner per file, in memory, with a fenced journal behind it. Ordering is local, saving is background, moving is a handoff.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
