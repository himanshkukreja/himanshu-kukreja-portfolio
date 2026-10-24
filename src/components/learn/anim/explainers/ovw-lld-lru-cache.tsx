/**
 * The whole low-level design lesson, Design an LRU Cache: the round (O(1) get and put, no
 * OrderedDict, the rules to pin down, map + list), the classes (the cache owns values and capacity,
 * the policy only keys, four hooks, a sentinel list), get and put on a capacity-3 cache (A, B, C,
 * get A, put D evicts B, an update), and why reads take the lock, the thread demo and follow-ups.
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
/** a class on the diagram: box, label, short label for narrow stages */
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an object's state, drawn as a small square: [label, tone, caption under it] */
type Tile = [Two, Tone?, Two?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** classes in play (plain 1 or a tone); every other class is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** calls flowing in this frame: [from, to, tone]; a reversed pair runs the wire backwards */
  fl?: [string, string, Tone?][];
  /** object state row (spots, seats, cache order, balances…) */
  tiles?: Tile[];
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
  const f = at(step, F[variant] || F[V[0].id]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  // the lower band stacks: tiles, figures, chips, meters
  let y = 206;
  const tY = y;
  if (f.tiles) y += f.tiles.some((x) => x[2] !== undefined) ? 58 : 42;
  const fY = y;
  if (f.figs) y += 64;
  const cols = f.cols || 2;
  const cY = y;
  if (f.chips) y += Math.ceil(f.chips.length / cols) * 34;
  const bY = y;
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cw = (552 - (cols - 1) * 8) / cols;
  const nt = f.tiles?.length || 0;
  const tw = Math.min(96, (568 - (nt - 1) * 6) / Math.max(1, nt));
  const tx = (W - nt * tw - (nt - 1) * 6) / 2;
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
      {f.tiles?.map(([l, tone, c], i) => {
        const x = tx + i * (tw + 6);
        return (
          <g key={i} opacity={fade(i, nt)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={tY} width={tw} height={30} />
            <Txt x={x + tw / 2} y={tY + 20} k="s" tone={tone}>
              {pick(l, nr)}
            </Txt>
            {c !== undefined && (
              <Txt x={x + tw / 2} y={tY + 46} k="s" tone={tone}>
                {pick(c, nr)}
              </Txt>
            )}
          </g>
        );
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={fY + 30} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={fY + 52} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const cy = cY + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={cy} width={cw} height={26} />
            <Txt x={x + cw / 2} y={cy + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={bY + 10 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={bY + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars || f.tiles ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  client: { x: 16, y: 40, w: 92, h: 44, l: "Caller" },
  cache: { x: 140, y: 40, w: 140, h: 44, l: "BoundedCache", n: "Cache" },
  data: { x: 320, y: 40, w: 120, h: 44, l: "dict K→V", n: "dict" },
  evict: { x: 140, y: 150, w: 140, h: 44, l: "on_evict" },
  policy: { x: 320, y: 150, w: 120, h: 44, l: "LRUPolicy", n: "Policy" },
  list: { x: 472, y: 150, w: 112, h: 44, l: "Linked list", n: "List" },
};
const E: [string, string][] = [
  ["client", "cache"],
  ["cache", "data"],
  ["cache", "evict"],
  ["cache", "policy"],
  ["policy", "list"],
];
const ALL = { client: 1, cache: 1, data: 1, evict: 1, policy: 1, list: 1 } as const;
const RUN = { client: 1, cache: "lit", data: 1, policy: 1, list: 1 } as const;

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["O(1)", ["get and put", "get, put"]], ["2", ["structures", "structures"]], ["0", "OrderedDict", "bad"]] },
    {
      k: "clarify the rules",
      on: { client: 1, cache: "lit" },
      chips: [["update = a use, no eviction", "update: no evict"], ["miss returns None", "miss: None"], ["get is a use: it reorders", "get reorders"], ["capacity < 1 rejected", "capacity ≥ 1"], ["shared by worker threads", "threads share it"], ["tell us what was evicted", "on_evict"]],
      ctn: [undefined, undefined, "warn", undefined, "warn"],
    },
    { k: "map + list", on: { data: "lit", policy: 1, list: "lit" }, chips: [["dict: find a node in O(1)", "dict: find"], ["list: reorder in O(1)", "list: reorder"]], ct: "sky", note: ["neither works alone", "neither alone"] },
  ],
  classes: [
    { k: "values vs order", on: ALL, sub: { cache: ["values, capacity", "values"], policy: ["keys only", "keys"] }, note: ["the policy answers one question: who leaves next?", "who leaves next?"] },
    { k: "four hooks", on: { cache: 1, policy: "lit", list: 1 }, fl: [["cache", "policy"]], chips: ["on_insert(key)", "on_access(key)", "on_delete(key)", "victim() → key"], ct: "sky", note: ["LRU and FIFO both fit; LFU would too", "LRU, FIFO, LFU fit"] },
    { k: "sentinels", on: { policy: 1, list: "lit" }, tiles: [["head", "mute"], ["C", "lit"], ["B"], ["A"], ["tail", "mute"]], note: ["dummy ends: no None checks when linking", "no None checks"] },
  ],
  ops: [
    { k: "put A, B, C", on: RUN, fl: [["client", "cache"], ["cache", "data"], ["cache", "policy"]], tiles: [["C", "lit", "newest"], ["B"], ["A", undefined, "oldest"]], sub: { data: ["3 of 3", "3/3"] } },
    { k: "get(A) moves A", on: RUN, fl: [["client", "cache"], ["cache", "policy"], ["policy", "list"]], tiles: [["A", "lit", "newest"], ["C"], ["B", "warn", "oldest"]], note: ["now B is the least recently used", "B is now oldest"] },
    { k: "put(D) evicts B", kt: "warn", on: { client: 1, cache: "lit", data: 1, policy: 1, list: 1, evict: "warn" }, fl: [["cache", "policy"], ["cache", "evict", "warn"]], tiles: [["D", "lit", "newest"], ["A"], ["C", undefined, "oldest"]], sub: { evict: ["evicted B", "B"] }, note: ["the callback runs after the lock is released", "callback after the lock"] },
    { k: "put(C) is an update", on: RUN, fl: [["client", "cache"], ["cache", "data"], ["cache", "policy"]], tiles: [["C", "lit", "newest"], ["D"], ["A", undefined, "oldest"]], note: ["new value, moved to the front, nothing evicted", "updated, no eviction"], nt: "ok" },
  ],
  threads: [
    { k: "a get is a write", kt: "bad", on: { client: "bad", cache: 1, policy: 1, list: "bad" }, fl: [["client", "cache", "bad"], ["policy", "list", "bad"]], chips: [["two gets reorder at once", "two gets at once"], ["pointers left broken", "broken pointers"]], ct: "bad", note: ["so reads take the lock too", "reads take the lock"] },
    { k: "8 threads", kt: "ok", on: { client: "lit", cache: "ok", data: 1, policy: 1, list: 1 }, fl: [["client", "cache"]], figs: [["8", "threads"], ["16,000", "lookups"], ["100", ["entries at the end", "entries"], "ok"]] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["LFU → a new policy", "LFU: new policy"], ["TTL → lazy expiry, a clock", "TTL: lazy expiry"], ["bytes → evict in a loop", "bytes: loop"], ["64 threads → shard the lock", "shard the lock"]],
      ct: "ok",
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: a fixed-capacity cache where get and put are O(1), the least recently used entry leaves when it's full, and no OrderedDict.", tween: 1200 },
      { caption: "Pin down the rules: an update is a use and never evicts, a miss returns None, get reorders, and worker threads share the cache.", tween: 1400 },
      { caption: "A dict finds an entry in O(1) but can't reorder. A doubly linked list unlinks any node in O(1) once the dict hands it over.", tween: 1200 },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "BoundedCache owns the values and the capacity. The eviction policy only sees keys and answers one question: who leaves next?", tween: 1200 },
      { caption: "Any eviction rule needs four hooks: on_insert, on_access, on_delete and victim. LRU and FIFO both fit, and LFU would too.", tween: 1400, loop: true },
      { caption: "The list has a dummy head and tail that never leave, so pushing to the front and unlinking need no special cases at the ends.", tween: 1200 },
    ],
  },
  {
    id: "ops",
    label: "get & put",
    steps: [
      { caption: "Capacity 3: put A, B and C. Each new key goes to the front of the list, so from newest to oldest the order is C, B, A.", tween: 1400, loop: true },
      { caption: "get(A) is a use: its node is unlinked and pushed to the front. Now B is the least recently used entry.", tween: 1400, loop: true },
      { caption: "put(D) at capacity asks the policy for a victim: B. It leaves the dict and the list, and on_evict hears about it after the lock.", tween: 1400, loop: true },
      { caption: "put(C) on an existing key updates the value and moves C to the front. An update never evicts anything.", tween: 1200, loop: true },
    ],
  },
  {
    id: "threads",
    label: "Threads & follow-ups",
    steps: [
      { caption: "A get moves a node: four pointer writes. Two threads doing that at once can corrupt the list, so reads take the lock too.", tween: 1200, loop: true },
      { caption: "The demo runs 8 threads and 16,000 lookups against a capacity of 100, and the cache ends with exactly 100 entries.", tween: 1400, loop: true },
      { caption: "Follow-ups: LFU is a new policy, a TTL is lazy expiry with a clock, a byte limit evicts in a loop, and sharding splits the lock.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
