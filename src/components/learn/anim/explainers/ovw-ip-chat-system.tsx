/**
 * The whole problem, interview problem bank 08 (design a chat system): requirements and the estimate
 * (2B messages a day ≈ 23,000 a second, 10M open connections ≈ 200 gateways, ~400 GB a day); the design
 * (stateful WebSocket gateways, stateless chat service, Cassandra by conversation, Redis session registry,
 * push for offline users); the deep dives (client IDs, per-conversation seq, sync, routing, groups,
 * presence); and failure modes (gateway crash, deploys, end-to-end encryption).
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 380;
type Pt = { x: number; y: number };
type Nd = { x: number; y: number; w: number; h: number; label: string; nl?: string };
type St = { tone?: Tone; sub?: string; ns?: string; dim?: boolean };
type Row = { k: string; v: string; nv?: string; tone?: Tone; m?: number };
type Go = { r: string[]; a: number; b: number; tone?: Tone };
type Fr = { kick: string; kt?: Tone; on?: string[]; st?: Record<string, St>; rows?: Row[]; mx?: number; go?: Go[]; l: [string, string]; nl?: [string, string] };
type Sp = { c: string; f: Fr; tween?: number; ms?: number };

const N: Record<string, Nd> = {
  a: { x: 16, y: 60, w: 88, h: 52, label: "Alice" },
  b: { x: 16, y: 250, w: 88, h: 52, label: "Bob" },
  g1: { x: 130, y: 60, w: 116, h: 52, label: "Gateway 1", nl: "GW 1" },
  g2: { x: 130, y: 250, w: 116, h: 52, label: "Gateway 2", nl: "GW 2" },
  cs: { x: 290, y: 150, w: 110, h: 56, label: "Chat svc", nl: "Chat" },
  st: { x: 440, y: 60, w: 144, h: 52, label: "Messages" },
  sr: { x: 440, y: 150, w: 144, h: 56, label: "Sessions" },
  pn: { x: 440, y: 250, w: 144, h: 52, label: "Push" },
};
const EDGES: [string, string, boolean?][] = [
  ["a", "g1"],
  ["g1", "cs"],
  ["cs", "st"],
  ["cs", "sr"],
  ["cs", "g2"],
  ["g2", "b"],
  ["cs", "pn"],
];
const CORE = ["a", "g1", "cs", "st", "sr"];
const ALLN = [...CORE, "g2", "b", "pn"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "One-to-one and group chats up to 500 members, on several devices each, with sent, delivered and read ticks, presence and synced history.",
        f: {
          kick: "the brief",
          rows: [
            { k: "chats", v: "1:1 and groups up to 500", nv: "1:1, groups ≤ 500" },
            { k: "online", v: "delivered instantly", nv: "instant" },
            { k: "offline", v: "push now, message on reconnect", nv: "push, then sync" },
            { k: "receipts", v: "sent · delivered · read", nv: "3 ticks" },
            { k: "devices", v: "phone, web, desktop: same history", nv: "same history" },
          ],
          l: ["a system that holds connections open", "and pushes messages down them"],
          nl: ["connections held open", "messages pushed down"],
        },
      },
      {
        c: "Under 500 ms when both are online. Once Alice sees sent, the message is never lost, never shown twice, and in one order everywhere.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "latency", v: "< 500 ms both online", nv: "< 500 ms", tone: "lit" },
            { k: "no loss", v: "sent = durable", nv: "sent = durable", tone: "ok" },
            { k: "ordered", v: "same order on every device", nv: "same order" },
            { k: "no duplicates", v: "retries never show twice", nv: "never twice", tone: "ok" },
          ],
          l: ["a gateway crash disconnects some users briefly", "it never loses a message"],
          nl: ["crashes disconnect briefly", "they never lose messages"],
        },
      },
      {
        c: "2 billion messages a day is about 23,000 a second. 10 million open connections at 50,000 per gateway means about 200 gateways.",
        f: {
          kick: "estimate",
          mx: 70000,
          rows: [
            { k: "messages", v: "2B a day ≈ 23,000/s · peak 70,000", nv: "≈ 23,000/s", m: 70000 },
            { k: "connections", v: "20% of 50M online = 10M", nv: "10M open", tone: "lit" },
            { k: "gateways", v: "÷ 50,000 each ≈ 200 servers", nv: "≈ 200 gateways" },
            { k: "storage", v: "200 B each ≈ 400 GB a day", nv: "≈ 400 GB/day" },
            { k: "groups", v: "1 send → up to 500 deliveries", nv: "1 → 500" },
          ],
          l: ["the unusual number is the connections", "stateful gateways need routing"],
          nl: ["connections are unusual", "gateways need routing"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "Each device keeps one WebSocket to a gateway. On connect the gateway records user, device and gateway in the session registry.",
        f: {
          kick: "connect",
          on: CORE,
          st: { g1: { tone: "lit", sub: "WebSocket", ns: "WS" }, sr: { tone: "sky", sub: "alice → gw-1", ns: "→ gw-1" } },
          go: [{ r: ["a", "g1", "cs", "sr"], a: 0.05, b: 0.95, tone: "sky" }],
          l: ["gateways are the only stateful part", "a layer-4 load balancer spreads new connections"],
          nl: ["gateways hold state", "L4 LB spreads them"],
        },
      },
      {
        c: "Alice sends. The chat service assigns the next sequence number in the conversation, stores the message, then acks: one tick, sent.",
        f: {
          kick: "send and store",
          on: CORE,
          st: { cs: { tone: "lit", sub: "seq 1042", ns: "1042" }, st: { tone: "ok", sub: "by conversation", ns: "by conv" } },
          go: [{ r: ["a", "g1", "cs", "st"], a: 0.05, b: 0.8, tone: "lit" }],
          l: ["store first, then the sent tick", "Cassandra: partition by conversation, sort by seq"],
          nl: ["store, then tick", "partition by conversation"],
        },
      },
      {
        c: "The chat service looks up Bob's devices in the registry and forwards the message to gateway 2, which pushes it down Bob's socket.",
        f: {
          kick: "route",
          kt: "ok",
          on: ALLN,
          st: { sr: { tone: "sky", sub: "bob → gw-2", ns: "→ gw-2" }, g2: { tone: "ok", sub: "deliver", ns: "send" }, b: { tone: "ok", sub: "receives", ns: "gets it" } },
          go: [{ r: ["cs", "sr"], a: 0.05, b: 0.35, tone: "sky" }, { r: ["cs", "g2", "b"], a: 0.4, b: 0.95, tone: "ok" }],
          l: ["Bob's receipt turns Alice's tick into two", "his other devices get it too"],
          nl: ["receipt: two ticks", "all his devices"],
        },
      },
      {
        c: "If Bob has no live connection, the push service wakes his phone through APNs or FCM. The app then fetches the message when it reconnects.",
        f: {
          kick: "offline",
          kt: "warn",
          on: ALLN,
          st: { b: { dim: true, sub: "offline", ns: "offline" }, g2: { dim: true }, pn: { tone: "warn", sub: "APNs · FCM", ns: "APNs/FCM" } },
          go: [{ r: ["cs", "pn"], a: 0.1, b: 0.9, tone: "warn" }],
          l: ["the push is a nudge, not the message", "the message waits in the store"],
          nl: ["push is a nudge", "message waits in store"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "The client names each message once with client_msg_id, so a retry gets the same seq. Every device sorts by seq: one order everywhere.",
        f: {
          kick: "1 · ordering and duplicates",
          rows: [
            { k: "client_msg_id", v: "generated once, reused on retry", nv: "reused on retry", tone: "ok" },
            { k: "seq", v: "next number in the conversation", nv: "per conversation" },
            { k: "sent", v: "stored, then acked", nv: "stored first" },
            { k: "delivered", v: "\"up to 1042\": cumulative", nv: "cumulative", tone: "lit" },
            { k: "read", v: "\"up to 1042\" too", nv: "cumulative too" },
          ],
          l: ["at-least-once delivery + dedupe by seq", "looks exactly-once to the user"],
          nl: ["at-least-once + dedupe", "looks exactly-once"],
        },
      },
      {
        c: "Each device remembers its last seq per chat. After an hour offline, one sync call returns everything after it, already in order.",
        f: {
          kick: "1 · catching up",
          kt: "ok",
          on: ALLN,
          st: { b: { tone: "ok", sub: "after 1038", ns: "> 1038" }, g2: { sub: "sync", ns: "sync" }, st: { tone: "ok", sub: "1039–1042", ns: "1039+" } },
          go: [{ r: ["b", "g2", "cs", "st"], a: 0.05, b: 0.9, tone: "ok" }],
          l: ["not a replay of push notifications", "or a download of the whole history"],
          nl: ["not a push replay", "not the whole history"],
        },
      },
      {
        c: "A group message is stored once and delivered to each member's online devices. Very large channels switch to pull: badge now, fetch on open.",
        f: {
          kick: "2 · groups",
          rows: [
            { k: "≤ 500 members", v: "store once, deliver per device", nv: "store once" },
            { k: "offline members", v: "catch up by seq, like any chat", nv: "sync by seq" },
            { k: "huge channels", v: "deliver only to those viewing", nv: "only viewers", tone: "warn" },
            { k: "the rest", v: "a badge; pull on open", nv: "pull on open", tone: "ok" },
          ],
          l: ["the celebrity problem from news feeds, again", "fan-out to 100,000 members isn't needed live"],
          nl: ["the celebrity problem", "no live mega fan-out"],
        },
      },
      {
        c: "Presence changes constantly: heartbeat every 30 s, offline after about two misses, debounce flaps, tell only contacts viewing the chat.",
        f: {
          kick: "2 · presence",
          rows: [
            { k: "heartbeat", v: "every 30 s (assumed)", nv: "every 30 s" },
            { k: "offline", v: "after ~2 missed heartbeats", nv: "~2 misses" },
            { k: "debounce", v: "ignore quick flaps", nv: "ignore flaps" },
            { k: "fan-out", v: "only contacts with the chat open", nv: "only viewers", tone: "ok" },
          ],
          l: ["everyone else reads last seen on demand", "presence is cheap to get wrong, costly to broadcast"],
          nl: ["last seen on demand", "don't broadcast it"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "If a gateway crashes, its clients reconnect to others with random delays and sync from their last seq. Nothing sent is lost.",
        f: {
          kick: "a gateway crashes",
          kt: "warn",
          on: ALLN,
          st: { g2: { tone: "bad", sub: "crashed", ns: "down" }, sr: { tone: "warn", sub: "TTL expires", ns: "expire" }, b: { tone: "warn", sub: "reconnect", ns: "retry" } },
          l: ["~50,000 clients move, with jitter", "stale registry entries expire on their own"],
          nl: ["~50,000 move, jittered", "stale entries expire"],
        },
      },
      {
        c: "Restarting 200 gateways at once reconnects 10 million clients at once. Drain a few at a time and have clients reconnect with jitter.",
        f: {
          kick: "deploying gateways",
          rows: [
            { k: "all at once", v: "10M reconnects: a thundering herd", nv: "10M reconnects", tone: "bad" },
            { k: "drain", v: "stop new connections on a few", nv: "a few at a time", tone: "ok" },
            { k: "move", v: "ask clients to reconnect, jittered", nv: "jittered moves" },
            { k: "hot group", v: "rate-limit, batch per gateway", nv: "rate-limit" },
          ],
          l: ["stateful servers need careful rollouts", "bucket long conversations by time"],
          nl: ["stateful = careful rollout", "bucket long chats"],
        },
      },
      {
        c: "With end-to-end encryption the server routes ciphertext. Ordering and receipts still work; server-side search and rich push previews don't.",
        f: {
          kick: "end-to-end encryption",
          rows: [
            { k: "still works", v: "routing, seq, receipts, sync", nv: "routing, seq", tone: "ok" },
            { k: "lost", v: "server search, content scanning", nv: "server search", tone: "bad" },
            { k: "harder", v: "keys per device, adding devices", nv: "keys per device", tone: "warn" },
            { k: "multi-region", v: "one home region assigns seq", nv: "home region seq" },
          ],
          l: ["the server stores what it can't read", "design the plain version first, then say this"],
          nl: ["server can't read it", "plain version first"],
        },
      },
    ],
  },
];

const ALL = Object.keys(N);
/** orthogonal wire from box a to box b: an elbow when they sit side by side, straight when stacked */
function pts(a: string, b: string): Pt[] {
  const p = N[a];
  const q = N[b];
  const pc = p.y + p.h / 2;
  const qc = q.y + q.h / 2;
  if (q.x >= p.x + p.w) {
    const m = Math.round((p.x + p.w + q.x) / 2);
    return [{ x: p.x + p.w, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x, y: qc }];
  }
  if (q.x + q.w <= p.x) {
    const m = Math.round((q.x + q.w + p.x) / 2);
    return [{ x: p.x, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x + q.w, y: qc }];
  }
  const x = Math.round((Math.max(p.x, q.x) + Math.min(p.x + p.w, q.x + q.w)) / 2);
  return q.y >= p.y + p.h ? [{ x, y: p.y + p.h }, { x, y: q.y }] : [{ x, y: p.y }, { x, y: q.y + q.h }];
}
const path = (ps: Pt[]) => "M" + ps.map((p) => `${p.x} ${p.y}`).join("L");
function walk(ps: Pt[], k: number): Pt {
  const lens = ps.slice(1).map((q, i) => Math.abs(q.x - ps[i].x) + Math.abs(q.y - ps[i].y));
  let d = k * lens.reduce((s, v) => s + v, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(ps[i].x, ps[i + 1].x, u), y: lerp(ps[i].y, ps[i + 1].y, u) };
    }
    d -= lens[i];
  }
  return ps[ps.length - 1];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const v = V.find((x) => x.id === variant) || V[0];
  const i = Math.min(step, v.steps.length - 1);
  const f = v.steps[i].f;
  const before = i > 0 ? v.steps[i - 1].f.on || [] : [];
  const on = f.on || [];
  const l = narrow && f.nl ? f.nl : f.l;
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      {f.rows ? (
        <g>
          <rect className="ax-box lit" x={16} y={44} width={W - 32} height={Math.min(270, 24 + f.rows.length * 50)} />
          {f.rows.map((r, j) => {
            const y = 76 + j * 50;
            return (
              <g key={r.k} opacity={ease(seg(t, j * 0.12, j * 0.12 + 0.4))}>
                <Txt x={32} y={y} k="k" anchor="start" tone="mute">
                  {r.k}
                </Txt>
                <Txt x={32} y={y + 24} anchor="start" tone={r.tone}>
                  {narrow ? r.nv || r.v : r.v}
                </Txt>
                {r.m !== undefined && <Meter x={420} y={y + 12} w={148} h={14} value={r.m * ease(seg(t, 0.2, 0.9))} max={f.mx || r.m} tone={r.tone || "sky"} />}
              </g>
            );
          })}
        </g>
      ) : (
        <g>
          {EDGES.filter(([a, b]) => on.includes(a) && on.includes(b)).map(([a, b, dash]) => (
            <Wire key={a + b} d={path(pts(a, b))} arrow dash={dash} />
          ))}
          {ALL.filter((k) => on.includes(k)).map((k) => {
            const n = N[k];
            const s = f.st?.[k] || {};
            const sub = narrow ? (s.ns ?? s.sub) : s.sub;
            return (
              <g key={k} opacity={before.includes(k) ? 1 : ease(seg(t, 0, 0.4))}>
                <Box x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.nl || n.label : n.label} sub={sub || undefined} tone={s.tone} dim={s.dim} />
              </g>
            );
          })}
          {f.go?.map((g, j) => {
            const q = seg(t, g.a, g.b);
            if (q <= 0 || q >= 1) return null;
            const p = walk(g.r.slice(1).flatMap((b, n) => pts(g.r[n], b)), ease(q));
            return <Token key={j} x={p.x} y={p.y} tone={g.tone} />;
          })}
        </g>
      )}
      <Txt x={16} y={H - 34} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={16} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.steps.map((s) => ({ caption: s.c, tween: s.tween ?? 1400, ms: s.ms ?? 3600 })) })),
  Scene,
});
