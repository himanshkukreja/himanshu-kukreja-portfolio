/**
 * The whole side quest, WhatsApp: the mission and its scale (100B+ messages a day, ~3M/s at
 * peak, 50M connections), the estimate (500 vs 25 connection servers, 50 TB/day vs ~2.5 TB
 * active), the architecture (Erlang chat servers, the user registry, ticks, media off the chat
 * path), the deep dives (Erlang processes, the Signal Protocol, offline queues, presence) and the
 * edge cases (celebrity status, big groups, linked devices) to the small-team takeaway.
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
  alice: { x: 16, y: 64, w: 88, h: 52, l: "Alice" },
  media: { x: 16, y: 148, w: 88, h: 44, l: "Media" },
  cs1: { x: 144, y: 64, w: 120, h: 52, l: "Chat server", n: "Chat" },
  reg: { x: 144, y: 148, w: 120, h: 44, l: "Registry", n: "Users" },
  cs2: { x: 304, y: 64, w: 120, h: 52, l: "Server 7", n: "Srv 7" },
  q: { x: 304, y: 148, w: 120, h: 44, l: "Bob's queue", n: "Queue" },
  bob: { x: 464, y: 64, w: 120, h: 52, l: "Bob" },
};
const E: [string, string][] = [
  ["alice", "cs1"],
  ["alice", "media"],
  ["cs1", "reg"],
  ["cs1", "cs2"],
  ["cs2", "q"],
  ["cs2", "bob"],
];
const PATH = { alice: 1, cs1: 1, cs2: 1, bob: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "WhatsApp · the scale", on: { alice: 1, bob: 1 }, figs: [["100B+", "messages a day"], ["~3M", ["messages/s at peak", "msgs/s peak"], "lit"], ["50M", "connections"]], note: ["once, in order, and the server can never read them", "once, in order, unreadable"] },
    {
      k: "requirements",
      on: PATH,
      chips: [["< 500 ms to online users", "< 500 ms online"], ["offline: never lost", "never lost"], ["end-to-end encrypted", "E2E encrypted"], ["groups up to 1,024", "groups ≤ 1,024"], ["sent · delivered · read", "ticks"], ["< 100 engineers", "< 100 engineers"]],
      ctn: ["lit", undefined, "ok", undefined, undefined, "warn"],
    },
    {
      k: "connections set the size",
      on: { alice: 1, cs1: "lit", bob: 1, cs2: "lit" },
      sub: { cs1: ["2M conns", "2M"], cs2: ["2M conns", "2M"] },
      bars: [[["100K per server: 500 servers", "100K each: 500"], 500, 500, "bad"], [["2M per server: 25 servers", "2M each: 25"], 25, 500, "ok"]],
      note: ["500M daily users × 10% online at peak = 50M connections", "500M × 10% = 50M online"],
    },
    { k: "storage", on: { cs2: 1, q: "lit", media: 1 }, figs: [["50 TB", ["a day, if kept", "a day if kept"], "bad"], ["~2.5 TB", ["active (~5% wait)", "active"], "ok"], ["~1 PB", "media a day"]], note: ["delivered messages are deleted from the server", "delivered = deleted"], nt: "ok" },
  ],
  arch: [
    { k: "persistent connections", on: PATH, sub: { cs1: ["Erlang", "Erlang"], cs2: ["Erlang", "Erlang"] }, note: ["TCP + TLS · FreeBSD · one ~2 KB process per connection", "one process per phone"] },
    { k: "send: one tick", on: { alice: "lit", cs1: "lit" }, sub: { alice: ["1 tick", "1 tick"], cs1: ["blob only", "blob"] }, fl: [["alice", "cs1"], ["cs1", "alice", "ok"]], note: ["encrypted on the phone with Bob's key", "encrypted on the phone"] },
    { k: "where is Bob?", on: { alice: 1, cs1: "lit", reg: "sky", cs2: "lit" }, sub: { reg: ["Bob → srv 7", "Bob → 7"] }, fl: [["cs1", "reg", "sky"], ["cs1", "cs2"]], note: ["server to server, process to process", "process to process"] },
    { k: "delivered, then read", kt: "ok", on: { ...PATH, bob: "ok", alice: "ok" }, sub: { alice: ["2 ticks", "2 ticks"], bob: ["ACK, read", "ACK"], cs2: ["deletes copy", "delete"] }, fl: [["cs2", "bob"], ["bob", "cs2", "ok"], ["cs1", "alice", "ok"]], note: ["two ticks on delivery, blue on the read receipt", "2 ticks, then blue"], nt: "ok" },
    { k: "media goes around", on: { alice: "lit", media: "sky", cs1: 1 }, sub: { media: ["encrypted", "E2E"], cs1: ["a reference", "ref"] }, fl: [["alice", "media", "sky"], ["alice", "cs1"]], note: ["big files never pass through the chat servers", "chat servers stay light"] },
  ],
  deep: [
    {
      k: "1 · why Erlang",
      on: { cs1: "lit", cs2: "lit" },
      sub: { cs1: ["2M processes", "2M"], cs2: ["2M processes", "2M"] },
      bars: [[["OS threads ~1 MB: ~2 TB", "threads: ~2 TB"], 2000, 2000, "bad"], [["processes ~2 KB: ~4 GB", "procs: ~4 GB"], 4, 2000, "ok"]],
      note: ["a crashed process is restarted by its supervisor; others never notice", "let it crash: supervisor restarts"],
    },
    { k: "2 · Signal Protocol", kt: "ok", on: PATH, sub: { cs1: ["random bytes", "bytes"], cs2: ["random bytes", "bytes"], alice: ["encrypts", "key"], bob: ["decrypts", "key"] }, fl: [["alice", "cs1"], ["cs1", "cs2"], ["cs2", "bob"]], chips: [["X3DH shared secret", "X3DH"], ["a new key per message", "ratchet"], "forward secrecy", ["server sees metadata", "metadata only"]], ctn: [undefined, undefined, "ok", "warn"] },
    {
      k: "3 · Bob is offline",
      kt: "warn",
      on: { alice: 1, cs1: 1, cs2: "lit", q: "warn" },
      sub: { q: ["ID + sequence", "waiting"], bob: ["offline", "offline"] },
      fl: [["cs2", "q", "warn"]],
      chips: [["delete only on ACK", "delete on ACK"], ["resend if not ACKed", "resend"], ["dedupe by message ID", "dedupe by ID"], ["expire after 30 days", "30-day expiry"]],
      ctn: ["ok", undefined, undefined, "warn"],
    },
    { k: "4 · presence", kt: "warn", on: { alice: 1, cs1: "warn", bob: 1 }, sub: { cs1: ["memory + TTL", "TTL"] }, figs: [["~1T", ["presence events/day", "events a day"], "warn"], ["10x", "message traffic"], ["60 s", "online TTL"]], note: ["typing: at most 1 update a second per chat, no acks", "typing: 1 a second, no acks"] },
  ],
  scale: [
    { k: "celebrity status", on: { cs1: "lit", alice: 1 }, sub: { cs1: ["edge cache", "cache"] }, fl: [["cs1", "alice"]], cols: 3, chips: [["pull, not push", "pull"], ["edge caches", "cache"], ["no per-follower push", "no push"]], note: ["one status, 10 million followers", "10M followers"] },
    { k: "a 1,000-member group", on: { alice: "lit", cs1: 1, cs2: 1, bob: 1 }, sub: { alice: ["sender key", "key"] }, fl: [["alice", "cs1"], ["cs1", "cs2"], ["cs2", "bob"]], figs: [["1×", "encryption", "ok"], ["1,000", "deliveries"]], note: ["a member leaves: rekey, so they can't read what follows", "a leaver triggers a rekey"] },
    { k: "linked devices", on: { alice: "lit", cs1: 1, cs2: 1, bob: "lit", q: 1 }, sub: { bob: ["4 devices", "4 dev"], q: ["1 per device", "per dev"] }, fl: [["alice", "cs1"], ["cs2", "bob"]], figs: [["4", "devices per account"], ["5", ["copies from Alice", "copies"], "lit"], ["30 days", "per-device queue"]] },
    { k: "the takeaway", kt: "ok", on: { ...PATH, cs1: "ok", cs2: "ok" }, fl: [["alice", "cs1"], ["cs1", "cs2"], ["cs2", "bob"]], figs: [["32", "engineers (2014)", "ok"], ["~550", "servers"], ["~50B", "messages a day"]], note: ["store almost nothing; route encrypted blobs", "store little, route blobs"], nt: "ok" },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "100 billion+ messages a day, ~3 million a second at peak, to 50 million connected phones: once, in order, and unreadable by the server.", tween: 1400 },
      { caption: "Under 500 ms to online users, offline queues so nothing is lost, end-to-end encryption, groups of 1,024, ticks, and fewer than 100 engineers.", tween: 1400 },
      { caption: "500 million daily users, 10% online at peak: 50 million connections. At 100,000 per server that is 500 servers; at 2 million, just 25.", tween: 1400 },
      { caption: "Keeping everything would be 50 TB a day, but delivered messages are deleted: only ~5% wait, about 2.5 TB. Media is separate, ~1 PB a day.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Phones hold a persistent connection to Erlang chat servers on FreeBSD, 1 to 2 million each. Every connection is one ~2 KB process.", tween: 1000 },
      { caption: "Alice's phone encrypts with Bob's public key and sends the blob. The server ACKs it, one tick, and never decrypts the message.", tween: 1200, loop: true },
      { caption: "Where is Bob? The user registry maps him to server 7, and Alice's server sends the blob straight there.", tween: 1200, loop: true },
      { caption: "Bob's device ACKs: two ticks for Alice. A read receipt turns them blue, and the server deletes its delivered copy.", tween: 1200, loop: true },
      { caption: "Media takes another path: uploaded encrypted to blob storage, with only a reference in the message, so chat servers never carry big files.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Why Erlang: a connection is a ~2 KB process, not a ~1 MB OS thread, so 2 million connections need ~4 GB of RAM instead of 2 TB.", tween: 1400 },
      { caption: "Signal Protocol: X3DH agrees a shared secret from uploaded public keys, then the Double Ratchet derives a fresh key for every message.", tween: 1200, loop: true },
      { caption: "Bob is offline, so messages wait in his queue. On reconnect it drains, resending anything not ACKed; each is deleted only after his ACK.", tween: 1200, loop: true },
      { caption: "Presence is the chattiest part: ~1 trillion events a day, 10x messages. It lives in memory with a 60 s TTL, and typing is throttled.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Edge cases",
    steps: [
      { caption: "A celebrity's status for 10 million followers isn't pushed: phones pull it when they open the Status tab, served from edge caches.", tween: 1200, loop: true },
      { caption: "A 1,000-member group uses Sender Keys: encrypted once, delivered to each member, and a member who leaves triggers a rekey.", tween: 1200, loop: true },
      { caption: "Linked devices: each has its own keys, so Alice's phone encrypts 5 copies, for Bob's 4 devices and her own second one.", tween: 1200, loop: true },
      { caption: "The lesson: store almost nothing, route encrypted blobs, pick tools that fit. ~50 billion a day ran on ~550 servers with 32 engineers.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
