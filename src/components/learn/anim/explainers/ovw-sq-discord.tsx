/**
 * The whole side quest, Discord: the scale (90M+ daily active users; 10M+ members and 1M+ online in
 * one server; 25,000+ SFU instances), the estimate (quadratic fan-out: 1,000 online saying one thing is
 * 1M notifications, 100,000 online is 10B; ~31M sessions, ~50,000 messages/s and ~6M dispatches/s at an
 * assumed peak), the architecture (in over HTTP and stored first; one guild process per server that
 * orders and fans out; gateways and a session per device; a separate voice plane), the deep dives
 * (passive sessions, relays and workers, bounded buffers and resume, presence sent only to who's
 * looking, (channel, bucket) storage and the move to ScyllaDB, drop-in voice placement dated 2018 and
 * 2026) and edge cases (Ishaan's tournament final, a spam raid, the 25 March 2026 voice outage).
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
  ishaan: { x: 16, y: 40, w: 88, h: 44, l: "Ishaan" },
  members: { x: 16, y: 96, w: 88, h: 48, l: "Members", n: "Users" },
  push: { x: 16, y: 156, w: 88, h: 40, l: "Push" },
  api: { x: 128, y: 40, w: 92, h: 44, l: "API" },
  gw: { x: 128, y: 96, w: 92, h: 48, l: "Gateway", n: "Gates" },
  relays: { x: 128, y: 156, w: 92, h: 40, l: "Relays" },
  data: { x: 248, y: 40, w: 120, h: 44, l: "Data service", n: "Data" },
  guild: { x: 248, y: 96, w: 120, h: 48, l: "Guild" },
  presence: { x: 248, y: 156, w: 120, h: 40, l: "Presence" },
  db: { x: 400, y: 40, w: 184, h: 44, l: "ScyllaDB" },
  syncer: { x: 400, y: 96, w: 184, h: 48, l: "Voice syncers", n: "Syncers" },
  sfu: { x: 400, y: 156, w: 184, h: 40, l: "SFU fleet", n: "SFUs" },
};
const E: [string, string][] = [
  ["ishaan", "api"],
  ["ishaan", "gw"],
  ["api", "data"],
  ["data", "db"],
  ["api", "guild"],
  ["guild", "relays"],
  ["relays", "gw"],
  ["gw", "members"],
  ["push", "members"],
  ["relays", "presence"],
  ["presence", "guild"],
  ["guild", "syncer"],
  ["syncer", "sfu"],
];
const ALL = { ishaan: 1, members: 1, push: 1, api: 1, gw: 1, relays: 1, data: 1, guild: 1, presence: 1, db: 1, syncer: 1, sfu: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Discord · the scale", on: { members: "lit", gw: 1, guild: 1 }, figs: [["90M+", ["daily active users", "daily users"], "lit"], ["10M+", ["members in one server", "in one server"]], ["1M+", ["online in it at once", "online at once"]]], note: ["Midjourney's server (2023); 25,000+ SFU instances forward voice (2026)", "Midjourney's server, 2023"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["servers, channels, roles", "servers, roles"], ["every event to who may see it", "live fan-out"], ["presence, a live member list", "presence"], ["drop-in voice and video", "drop-in voice"], ["every message, forever", "history forever"], ["limits for users and bots", "rate limits"]],
      ctn: ["lit", "lit", "lit"],
    },
    { k: ["the work grows with the square", "it's quadratic"], kt: "warn", on: { guild: "warn", relays: 1, gw: 1, members: "lit" }, fl: [["guild", "relays"], ["relays", "gw"], ["gw", "members"]], figs: [["1M", ["at 1,000 online", "1,000 online"]], ["100M", ["at 10,000 online", "10,000 online"], "warn"], ["10B", ["at 100,000 online", "100,000 online"], "bad"]], note: ["Discord's example: everyone online says \"I love jello\" once", "everyone says it once"] },
    { k: ["~6 million dispatches a second", "~6M dispatches/s"], on: { ishaan: 1, api: "lit", guild: "lit", relays: 1, gw: "lit", members: 1 }, fl: [["ishaan", "api"], ["api", "guild"], ["guild", "relays"], ["relays", "gw"], ["gw", "members"]], figs: [["~31M", ["sessions at peak", "sessions"]], ["~50K/s", ["messages at peak", "messages/s"]], ["~6M/s", ["dispatches to clients", "dispatches"], "lit"]], note: ["all assumed: ~30% of 90M online, ~40 active sessions a message", "all assumed"] },
  ],
  arch: [
    { k: ["1 · in over HTTP, stored first", "1 · store first"], on: { ishaan: 1, api: "lit", data: "lit", db: "lit" }, sub: { api: ["rate limits", "limits"] }, fl: [["ishaan", "api"], ["api", "data"], ["data", "db"]], note: ["limits and permission checked, then stored before anyone is told", "stored, then dispatched"] },
    { k: ["2 · one process per server", "2 · the guild"], on: { api: 1, guild: "lit", relays: "lit", gw: 1, members: 1 }, sub: { guild: ["one per server", "per server"] }, fl: [["api", "guild"], ["guild", "relays"], ["relays", "gw"]], note: ["members, roles, channels, voice states and sessions; one order of events", "one order per server"] },
    { k: ["3 · out over the websocket", "3 · the gateway"], on: { relays: 1, gw: "lit", members: "lit", ishaan: 1 }, sub: { gw: ["websockets", "sockets"] }, fl: [["relays", "gw"], ["gw", "members"], ["gw", "ishaan"]], note: ["a session per device; each event carries a sequence number", "a session per device"] },
    { k: ["4 · voice is its own plane", "4 · the voice plane"], on: { guild: 1, syncer: "lit", sfu: "lit" }, sub: { sfu: ["UDP media", "UDP"] }, fl: [["guild", "syncer"], ["syncer", "sfu"]], note: ["voice never touches the gateway; clients send media to the call's SFU", "media over UDP"] },
  ],
  deep: [
    { k: ["1 · a million online in one server", "1 · huge servers"], on: { api: 1, guild: "lit", relays: "lit", gw: 1, members: 1 }, fl: [["api", "guild"], ["guild", "relays"], ["relays", "gw"]], figs: [["~90%", ["of sessions passive", "passive"], "ok"], ["15,000", ["sessions per relay", "per relay"], "lit"], ["~67", ["sends per message", "sends"]]], note: ["1M online ÷ 15,000 a relay; slow jobs go to a worker reading ETS", "slow jobs: a worker"] },
    { k: ["2 · millions of sockets", "2 · the gateway"], on: { relays: 1, gw: "lit", members: "warn" }, fl: [["relays", "gw"], ["gw", "members", "warn"]], chips: [["every session buffer capped", "capped buffers"], ["overflow: a resumable close", "resumable close"], ["resume from sequence n", "resume from n"], ["jitter, semaphores, fail fast", "jitter, fail fast"]], ctn: ["warn", "lit", "ok", "sky"] },
    { k: ["3 · presence, only to who's looking", "3 · presence"], on: { members: 1, gw: 1, relays: "lit", presence: "lit", guild: "lit" }, fl: [["relays", "presence"], ["presence", "guild"], ["guild", "relays"], ["relays", "gw"]], figs: [["~3,300/s", ["changes, one server", "changes/s"]], ["3.3B/s", ["if sent to everyone", "to everyone"], "bad"], ["~100", ["rows a client sees", "rows seen"], "ok"]], note: ["assumed rates; a change goes only to sessions viewing that row", "only to who's looking"] },
    { k: ["4 · trillions of messages", "4 · messages"], on: { api: 1, data: "lit", db: "lit" }, sub: { data: ["coalesces", "coalesce"] }, fl: [["api", "data"], ["data", "db"]], figs: [["177 → 72", ["Cassandra to Scylla nodes", "nodes"], "ok"], ["15 ms", ["p99 reads, was 40–125", "p99 reads"], "lit"], ["3.2M/s", ["peak copy rate", "copy peak"]]], note: ["keyed by (channel, ~10-day bucket); copied in days, not months", "days, not months"] },
    { k: ["5 · voice you can drop into", "5 · voice"], on: { ishaan: "lit", guild: 1, syncer: "lit", sfu: "lit" }, fl: [["guild", "syncer"], ["syncer", "sfu"]], chips: [["2018: a voice server per guild", "2018: per guild"], ["2026: syncers place each call", "2026: per call"], ["silence sends no packets", "silence is free"], ["2026: every call E2EE (DAVE)", "2026: E2EE"]], ctn: ["sky", "lit", "sky", "ok"] },
  ],
  scale: [
    { k: ["Ishaan's tournament final", "the final"], on: { ishaan: "lit", api: 1, data: 1, db: 1, guild: "lit", relays: 1, gw: 1, members: "lit", push: 1 }, fl: [["ishaan", "api"], ["api", "guild"], ["guild", "relays"], ["relays", "gw"], ["gw", "members"], ["push", "members"]], figs: [["71,204", ["online in Lobby 91", "online"], "lit"], ["8:55", ["@everyone, once a relay", "@everyone"]], ["~20,000", ["history reads, coalesced", "reads"], "ok"]], note: ["illustrative; offline members get a push, which may shed in a burst", "pushes may shed"] },
    { k: ["8:57 · the raid", "the raid"], kt: "warn", on: { ishaan: "ok", api: "warn", members: "bad", guild: 1 }, fl: [["ishaan", "api", "ok"]], chips: [["200 fresh accounts, one link", "200 raiders"], ["AutoMod blocks the link", "AutoMod"], ["slowmode: 10 s in #live-chat", "slowmode 10 s"], ["invites paused, raiders banned", "pause, ban"]], ctn: ["bad", "ok", "warn", "sky"] },
    { k: ["25 March 2026 · 17% of sessions", "17% of sessions"], kt: "bad", on: { ...ALL, members: "warn", gw: "bad", syncer: "bad", sfu: "warn" }, fl: [["members", "gw", "bad"], ["guild", "syncer", "bad"], ["syncer", "sfu"]], figs: [["17%", ["sessions gone at once", "sessions"], "bad"], ["25,000+", ["SFUs, 15 syncers", "SFUs"], "warn"], ["3 h+", ["voice degraded", "degraded"]]], note: ["cut demand first with spawn limits, then double the syncers", "cut demand, add supply"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, guild: "ok", relays: "ok", presence: "ok" }, fl: [["api", "guild", "ok"], ["guild", "relays", "ok"], ["relays", "gw"]], cols: 3, chips: [["one process a server", "one per server"], ["fan-out to relays", "fan out wide"], ["only what they see", "only what's seen"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Discord counts 90 million+ daily active users (Q4 2025); Midjourney's server has 10 million+ members with 1 million+ online at once (2023), and 25,000+ SFU instances forward voice and video (2026).", tween: 1400 },
      { caption: "Servers with channels, roles and permissions; every message, reaction and status change delivered live to each online member who may see it; presence and a member list; drop-in voice; history forever; and rate limits.", tween: 1400 },
      { caption: "Discord's own example: 1,000 people online each saying \"I love jello\" once is 1 million notifications; at 10,000 online it's 100 million and at 100,000 it's 10 billion, so ten times the people is a hundred times the work.", tween: 1400, loop: true },
      { caption: "On stated assumptions, ~30% of daily users online is ~31 million sessions; ~1.5 billion messages a day peaks near 50,000 a second, and ~40 active sessions a message plus reactions, typing and presence is ~6 million dispatches a second.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Ishaan's message goes in over HTTP: the API rate-limits it, checks he may mention everyone, gives it a time-sortable Snowflake id, and a data service stores it in ScyllaDB before anyone is told.", tween: 1200, loop: true },
      { caption: "The API then dispatches it over gRPC to the server's guild process: one Elixir process per server that holds its members, roles, channels, voice states and connected sessions, orders its events and fans them out.", tween: 1200, loop: true },
      { caption: "Gateways hold the websockets, with a session process per device; the socket only carries events down, each with a sequence number, so a dropped connection loses the live copy, never the message.", tween: 1200, loop: true },
      { caption: "Voice and video never touch the gateway: the guild passes voice states to the voice control plane, which picks the one SFU that hosts each call, and clients send their media to it over UDP.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "About 90% of connections in large servers are passive and get periodic summaries; relays own up to 15,000 sessions each and do the permission checks and sends, so a million online costs the guild ~67 sends a message.", tween: 1400, loop: true },
      { caption: "A phone that stops reading can't grow an unbounded queue: each session's buffer is capped, overflow closes the socket with a resumable code, the client replays from its last sequence number, and jitter and semaphores spread a mass reconnect.", tween: 1400, loop: true },
      { caption: "Presence is combined from a user's sessions, and offline is a session exiting; at an assumed ~3,300 changes a second in one huge server, sending each to everyone would be 3.3 billion a second, so a change goes only to sessions viewing that row.", tween: 1400, loop: true },
      { caption: "Messages are keyed by channel and a ~10-day bucket; data services routed by channel coalesce identical reads, and the move from 177 Cassandra nodes to 72 ScyllaDB nodes, copied in days, not months, cut p99 reads from 40–125 ms to 15 ms.", tween: 1400, loop: true },
      { caption: "In 2018 all of a guild's voice channels shared the least-used voice server in its region; in 2026 voice syncers place each call on one SFU, so joining a busy channel is a state write and two handshakes. Since early March 2026 every call outside stage channels is end-to-end encrypted.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Lobby 91's final (illustrative): at 8:55 Ishaan's @everyone is stored once and sent once per relay to 71,204 online, offline members get a push through a pipeline that may shed, and ~20,000 history reads coalesce into a handful of queries.", tween: 1400, loop: true },
      { caption: "At 8:57, 200 fresh accounts post the same link, one message a second each, too slow for per-user limits: AutoMod blocks the reported link, slowmode goes to 10 s, invites are paused and the raiders are banned.", tween: 1400, loop: true },
      { caption: "On 25 March 2026 a pod resize stopped 17% of sessions at once; reconnects ran a zone's gateways out of memory, and 15 voice syncers recreating calls flooded 25,000+ SFUs: lower the spawn limits first, then double the syncers.", tween: 1400, loop: true },
      { caption: "The lesson: one ordered process per server, with the expensive part, fan-out, pushed outwards to relays, passive summaries and the rows a client can see, keeps millions of small servers simple and the one with a million online standing.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
