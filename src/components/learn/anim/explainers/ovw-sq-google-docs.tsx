/**
 * The whole side quest, Google Docs collaboration: the limits (100 people at once, 1.02M characters,
 * 40 named versions), the estimate (one 100-person document: 200 changes/s in, ~20,000 messages/s out;
 * the assumed fleet: 15M changes/s, ~10 TB of documents in memory, ~41 TB of log a day), the
 * architecture (apply locally → one document server transforms and numbers revisions → append, then
 * ack → cursors shift locally), the deep dives (OT for text, one change in flight, cursors and
 * comment anchors, history by snapshot plus replay and restore as a new revision) and scale and edge
 * cases (limits, undo, crashes, and merging three days offline by composition).
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
  ananya: { x: 16, y: 40, w: 88, h: 44, l: "Ananya" },
  kabir: { x: 16, y: 152, w: 88, h: 44, l: "Kabir" },
  gw: { x: 128, y: 96, w: 92, h: 52, l: "Gateway", n: "Gate" },
  router: { x: 248, y: 40, w: 120, h: 40, l: "Router" },
  ds: { x: 248, y: 96, w: 120, h: 52, l: "Doc server", n: "Owner" },
  pres: { x: 248, y: 156, w: 120, h: 40, l: "Presence", n: "Cursors" },
  log: { x: 400, y: 40, w: 184, h: 44, l: "Revision log", n: "Log" },
  snap: { x: 400, y: 96, w: 184, h: 44, l: "Snapshots", n: "Snap" },
  others: { x: 400, y: 152, w: 184, h: 44, l: "40 others", n: "Others" },
};
const E: [string, string][] = [
  ["ananya", "gw"],
  ["kabir", "gw"],
  ["gw", "ds"],
  ["ds", "router"],
  ["ds", "pres"],
  ["ds", "log"],
  ["ds", "snap"],
  ["ds", "others"],
];
const ALL = { ananya: 1, kabir: 1, gw: 1, router: 1, ds: 1, pres: 1, log: 1, snap: 1, others: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Google Docs · the limits", on: { ananya: "lit", kabir: 1, ds: 1 }, figs: [["100", ["people at once", "at once"], "lit"], ["1.02M", ["characters, at most", "characters"]], ["40", ["named versions", "versions"]]], note: ["past 100 people, only the owner and some editors can edit", "past 100: few editors"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["your typing: the next frame", "own typing instant"], ["others: p95 < 200 ms", "p95 < 200 ms"], ["every copy converges", "converge"], ["live cursors", "live cursors"], ["full history, restore", "history"], ["offline, then merge", "offline merge"]],
      ctn: ["lit", "lit", "bad"],
    },
    { k: "one busy document", on: { ananya: 1, kabir: 1, gw: 1, ds: "lit", others: "warn" }, fl: [["ananya", "gw"], ["kabir", "gw"], ["gw", "ds"], ["ds", "others", "warn"]], figs: [["200/s", ["changes in", "in"]], ["~20K/s", ["messages out", "out"], "warn"], ["~30", ["concurrent per change", "concurrent"]]], note: ["40 typists × 5 changes a second, sent to 99 others", "40 × 5 a second, to 99"] },
    { k: "the fleet (assumed)", on: { ds: 1, log: "lit", snap: 1 }, figs: [["15M/s", ["changes, design peak", "changes/s"]], ["~10 TB", ["documents in memory", "in memory"]], ["~41 TB", ["log a day", "log/day"], "lit"]], note: ["Google hasn't published Docs usage: these are assumptions", "assumptions, not Google's"] },
  ],
  arch: [
    { k: "1 · apply at once", on: { ananya: "lit", kabir: "lit", gw: 1, ds: 1 }, sub: { ananya: ["Ins 40", "Ins"], kabir: ["Del 20–35", "Del"] }, fl: [["ananya", "gw"], ["kabir", "gw"], ["gw", "ds"]], note: ["both edit revision 811; nobody waits to see their own change", "nobody waits"] },
    { k: "2 · transform past 812", on: { ananya: 1, kabir: "ok", gw: 1, ds: "lit" }, sub: { ds: ["40 → 24", "→ 24"], kabir: ["ack 812", "812"] }, fl: [["ds", "gw", "ok"], ["gw", "kabir", "ok"]], note: ["his delete came first, so her insert shifts left by 16", "her insert moves to 24"] },
    { k: "3 · append, then ack", kt: "ok", on: { ds: 1, log: "lit", snap: 1, router: 1 }, sub: { log: ["if last = N", "last = N"], snap: ["every 1,000", "1,000"] }, fl: [["ds", "log"], ["ds", "snap", "sky"]], note: ["the revision number orders changes and fences stale owners", "the revision is the fence"], nt: "ok" },
    { k: "4 · cursors move locally", on: { ananya: 1, kabir: 1, ds: 1, pres: "lit", others: "ok" }, sub: { pres: ["memory, TTL", "TTL"] }, fl: [["ds", "others", "ok"], ["ds", "pres", "sky"]], note: ["editors shift every cursor as they apply a change", "no cursor messages needed"] },
  ],
  deep: [
    { k: "1 · OT for text", on: { ananya: 1, kabir: 1, gw: 1, ds: "lit" }, fl: [["ananya", "gw"], ["kabir", "gw"], ["gw", "ds"]], chips: [["EASY AS 123", "EASY AS 123"], ["insert before: shift right", "shift"], ["same spot: tie-break", "tie-break"], ["TP1: both orders agree", "TP1"]], ctn: [undefined, "lit", "lit", "ok"] },
    { k: "2 · one change in flight", on: { ananya: "lit", gw: 1, ds: "lit" }, sub: { ananya: ["pending", "pending"] }, fl: [["ananya", "gw"], ["gw", "ds"]], chips: [["sent: at most one", "one in flight"], ["pending: composed", "pending"], ["server: one history", "one history"], ["(client, seq) dedupe", "dedupe"]], ctn: ["lit", undefined, "ok", undefined] },
    { k: "3 · cursors and comments", on: { ds: 1, pres: "lit", others: 1 }, fl: [["ds", "pres"], ["ds", "others"]], chips: [["position + revision", "pos + rev"], ["others' typing: shift locally", "shift locally"], ["comments: anchored ranges", "anchors"], ["deleted word: flagged", "orphaned"]], ctn: [undefined, "ok", undefined, "warn"] },
    { k: "4 · history and restore", on: { ds: 1, log: "lit", snap: "lit" }, fl: [["ds", "log"], ["ds", "snap"]], figs: [["47,000", ["nearest snapshot", "snapshot"]], ["310", ["revisions replayed", "replayed"], "lit"], ["48,001", ["restore = new revision", "restore"], "ok"]], note: ["history is never rewritten; a restore can itself be undone", "never rewrite history"] },
  ],
  scale: [
    { k: "edge cases", kt: "warn", on: { ...ALL, ds: "warn" }, chips: [["101st person: read-only", "read-only"], ["undo: your own inverse", "undo"], ["revoked: change rejected", "revoked"], ["crash: snapshot + log", "recover"]], ctn: [undefined, "lit", "bad", "ok"] },
    { k: "three days offline", kt: "bad", on: { kabir: "warn", gw: 1, ds: "lit", log: 1 }, sub: { kabir: ["2,400", "2,400"] }, fl: [["kabir", "gw", "warn"], ["gw", "ds"]], figs: [["144M", ["naive transforms", "naive"], "bad"], ["~144 s", ["at 1 µs each", "144 s"], "warn"], ["ms", ["after composing", "composed"], "ok"]] },
    { k: "merge off the hot path", on: { kabir: "lit", gw: 1, ds: 1, log: "lit" }, fl: [["ds", "log"], ["kabir", "gw"]], chips: [["compose 60,000 revisions", "compose server"], ["compose his 2,400", "compose his"], ["transform one vs one", "one vs one"], ["save a version first", "version first"]], ctn: ["lit", "lit", "ok", "ok"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, ds: "ok", log: "ok" }, fl: [["ananya", "gw"], ["gw", "ds"], ["ds", "log", "ok"], ["gw", "kabir", "ok"]], cols: 3, chips: [["one owner per document", "one owner"], ["one change in flight", "one in flight"], ["log = document", "log = doc"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Google Docs: up to 100 people in one file at once, documents up to 1.02 million characters, and up to 40 named versions each.", tween: 1400 },
      { caption: "Your own typing shows on the next frame, others' within 200 ms; every copy must converge, cursors are live, history is complete and offline work merges.", tween: 1400 },
      { caption: "A 100-person document with 40 typing: 200 changes a second in, ~20,000 messages a second out. Fan-out grows with the square of the room.", tween: 1400, loop: true },
      { caption: "Google hasn't published Docs usage, so the fleet is sized on assumptions: 15 million changes a second, ~10 TB in memory, ~41 TB of log a day.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Ananya inserts at 40 while Kabir deletes 20 to 35, both against revision 811. Each change shows on its author's screen at once.", tween: 1200, loop: true },
      { caption: "Kabir's delete arrives first and becomes revision 812. The server transforms Ananya's insert past it: position 40 becomes 24, revision 813.", tween: 1200, loop: true },
      { caption: "Each revision is appended to the log only if the log ends at the revision before, then acknowledged. Snapshots every 1,000 revisions keep opens fast.", tween: 1200, loop: true },
      { caption: "Cursors live in memory with an expiry. When editors apply a change they shift every cursor themselves, so typing needs no cursor messages.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "OT: on EASY AS 123, Ananya's insert of IT'S before Kabir's delete shifts it right by 5. Same-spot inserts use a fixed tie-break; TP1 holds.", tween: 1400, loop: true },
      { caption: "The client keeps one change in flight and composes the rest. Every change is based on a revision the server has, so the server keeps one history.", tween: 1400, loop: true },
      { caption: "A cursor is a position plus a revision, transformed like any change. Comments are anchored ranges; a deleted word leaves its comment flagged.", tween: 1400 },
      { caption: "To show 11:45, load snapshot 47,000 and replay 310 revisions. Restoring appends the difference as revision 48,001; history is never rewritten.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "The 101st person gets a live read-only view; undo submits the inverse of your own change; a revoked editor's next change is rejected.", tween: 1400 },
      { caption: "Three days offline: 2,400 changes past 60,000 revisions is 144 million transforms, ~144 s. Composed, it is one transform of two bounded changes.", tween: 1400, loop: true },
      { caption: "The merge runs on Kabir's client and a background worker, and lands as one ordinary change, after saving a version to compare against.", tween: 1400, loop: true },
      { caption: "The lesson: one owner per document, one change in flight, and a revision log that is the document, its fence and its history.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
