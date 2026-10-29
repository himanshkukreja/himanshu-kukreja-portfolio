/**
 * The whole side quest, Slack: the scale (12.5M connected users in 2020, tens of millions of clients and
 * 500 ms delivery in 2023, 2.3M database queries a second, 1.4B jobs on the busiest days), the estimate
 * (~30M websockets, ~20,000 messages a second at a peak minute, ~2.4M deliveries a second; ~50 channel
 * servers at half load), the architecture (store first in Vitess, two hops of fan-out through channel and
 * gateway servers, slim boots from the Flannel edge cache, a Kafka-fronted job queue), the deep dives
 * (one copy of a shared channel, hashing channels not tenants, sharding by the query's key, the job log,
 * notifications and permission-scoped search) and the day (Meera's Monday, the edge cases, 4 January 2021).
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
  cache: { x: 16, y: 40, w: 84, h: 44, l: "Memcached", n: "Cache" },
  vitess: { x: 16, y: 96, w: 84, h: 48, l: "Vitess" },
  flannel: { x: 16, y: 156, w: 84, h: 40, l: "Flannel", n: "Edge" },
  kafka: { x: 124, y: 40, w: 92, h: 44, l: "Kafka" },
  webapp: { x: 124, y: 96, w: 92, h: 48, l: "Webapp" },
  clients: { x: 124, y: 156, w: 92, h: 40, l: "Clients", n: "Client" },
  relay: { x: 240, y: 40, w: 168, h: 44, l: "Redis queue", n: "Redis" },
  cs: { x: 240, y: 96, w: 168, h: 48, l: "Channel servers", n: "Ch. servers" },
  gw: { x: 240, y: 156, w: 168, h: 40, l: "Gateway servers", n: "Gateways" },
  push: { x: 432, y: 40, w: 152, h: 44, l: "Push service", n: "Push" },
  workers: { x: 432, y: 96, w: 152, h: 48, l: "Workers" },
  search: { x: 432, y: 156, w: 152, h: 40, l: "Solr search", n: "Search" },
};
const E: [string, string][] = [
  ["clients", "webapp"],
  ["webapp", "vitess"],
  ["webapp", "cache"],
  ["cache", "vitess"],
  ["clients", "flannel"],
  ["webapp", "cs"],
  ["cs", "gw"],
  ["gw", "clients"],
  ["webapp", "kafka"],
  ["kafka", "relay"],
  ["relay", "workers"],
  ["workers", "push"],
  ["workers", "search"],
];
const ALL = { cache: 1, vitess: 1, flannel: 1, kafka: 1, webapp: 1, clients: 1, relay: 1, cs: 1, gw: 1, push: 1, workers: 1, search: 1 } as const;

const F: Record<string, Fr[]> = {
  why: [
    { k: "Slack · the scale", on: { clients: "lit", gw: 1, cs: 1, vitess: 1 }, figs: [["12.5M", ["connected at once, 2020", "connected, 2020"], "lit"], ["500 ms", ["delivery, worldwide", "delivery"]], ["2.3M/s", ["database queries, 2020", "DB queries"]]], note: ["1.4B jobs on the busiest days, 33,000 a second at peak (2017)", "1.4B jobs a day"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["workspaces, orgs, shared channels", "tenants that overlap"], ["store, then deliver in 500 ms", "store, then deliver"], ["typing events, never stored", "transient events"], ["search only what you may read", "scoped search"], ["notify by each person's rules", "notifications"], ["jobs never block a send", "jobs never block"]],
      ctn: ["lit", "lit", "sky"],
    },
    { k: ["~30M websockets", "~30M websockets"], on: { webapp: 1, cs: "lit", gw: "lit", clients: "lit" }, fl: [["webapp", "cs"], ["cs", "gw"], ["gw", "clients"]], figs: [["~30M", ["websockets, assumed", "websockets"], "lit"], ["~20K/s", ["messages, peak minute", "messages/s"]], ["~2.4M/s", ["event deliveries, peak", "deliveries"], "warn"]], note: ["writes are modest; deliveries are millions a second", "deliveries dominate"] },
    { k: ["a small, stateful core", "the routing core"], on: { cs: "lit", gw: 1 }, sub: { cs: ["~16M IDs each", "~16M IDs"] }, fl: [["cs", "gw"]], figs: [["16M", ["per server, at peak", "per server"]], ["~50", ["at half load, assumed", "servers"], "lit"], ["<20 s", ["to replace one", "to replace"]]], note: ["a \"channel\" is any ID events go to: user, workspace, file…", "any event address"] },
  ],
  arch: [
    { k: ["1 · store, then send", "1 · store first"], on: { clients: 1, webapp: "lit", vitess: "lit", cache: 1 }, sub: { vitess: ["by channel", "sharded"] }, fl: [["clients", "webapp"], ["webapp", "vitess"]], note: ["the webapp checks membership and @here, then writes", "check, then write"] },
    { k: ["2 · two hops of fan-out", "2 · fan-out"], on: { webapp: 1, cs: "lit", gw: "lit", clients: "lit" }, sub: { cs: ["hashed by channel ID", "hash ring"], gw: ["one copy each", "one copy each"] }, fl: [["webapp", "cs"], ["cs", "gw"], ["gw", "clients"]], note: ["one copy per gateway server, then one per websocket", "one copy per gateway"] },
    { k: ["3 · boot what's on screen", "3 · slim boots"], on: { clients: "lit", flannel: "lit", webapp: 1, vitess: 1 }, sub: { flannel: ["edge cache", "cache"] }, fl: [["clients", "flannel"]], note: ["lazy boots: 7× smaller on 1,500 users, 44× on 32,000", "7× to 44× smaller"] },
    { k: ["4 · everything else is a job", "4 · jobs"], on: { webapp: 1, kafka: "lit", relay: "lit", workers: "lit", push: 1, search: 1 }, fl: [["webapp", "kafka"], ["kafka", "relay"], ["relay", "workers"], ["workers", "push"], ["workers", "search"]], note: ["notifications, unfurls, indexing, reminders: after the send", "after the send"] },
  ],
  deep: [
    { k: ["1 · one copy of every channel", "1 · shared channels"], on: { clients: 1, webapp: "lit", vitess: "lit", cs: 1 }, sub: { vitess: ["one copy", "1 copy"] }, fl: [["clients", "webapp"], ["webapp", "vitess"]], chips: [["one channels row, owner's shard", "one copy"], ["a shared_channels row per side", "per-side rows"], ["is_private per side, not in the ID", "privacy per side"], ["membership decides, not workspace", "membership decides"]], ctn: ["lit", "sky", "warn", "ok"] },
    { k: ["2 · hash channels, not tenants", "2 · the ring"], kt: "warn", on: { webapp: 1, cs: "warn", gw: "lit", clients: 1 }, sub: { cs: ["one dies: <20 s", "<20 s"] }, fl: [["webapp", "cs"], ["cs", "gw", "warn"], ["gw", "clients"]], chips: [["one company over every server", "spread out"], ["a dead server: a sliver, <20 s", "a sliver, <20 s"], ["gateways resubscribe moved IDs", "resubscribe"], ["gaps fetched from history", "gaps from history"]], ctn: ["lit", "warn", "sky", "ok"] },
    { k: ["3 · shard by the query's key", "3 · Vitess"], kt: "warn", on: { clients: "warn", webapp: 1, cache: "bad", vitess: "bad" }, fl: [["clients", "webapp"], ["webapp", "cache", "bad"], ["cache", "vitess", "bad"]], figs: [["2.3M/s", ["queries at peak, 2020", "queries/s"]], ["50%", ["query growth in one week", "in a week"], "warn"], ["22 Feb", ["2022: scatter overload", "2022"], "bad"]], note: ["membership written twice: by user and by channel", "by user and by channel"] },
    { k: ["4 · a log in front of the queue", "4 · the job log"], on: { webapp: 1, kafka: "lit", relay: "lit", workers: 1 }, fl: [["webapp", "kafka"], ["kafka", "relay"], ["relay", "workers"]], figs: [["1.4B", ["jobs on the busiest days", "jobs a day"]], ["33K/s", ["job peak, 2017", "peak"], "lit"], ["2 days", ["of jobs kept in Kafka", "in Kafka"]]], note: ["the relay is the throttle: a backlog is lag on disk, not a full Redis", "the relay throttles"] },
    { k: ["5 · notify, and search what you may read", "5 · notify, search"], on: { relay: 1, workers: "lit", push: "lit", search: "lit" }, fl: [["relay", "workers"], ["workers", "push"], ["workers", "search"]], chips: [["@here: only active members", "@here: active only"], ["decide once, push per device", "decide, then push"], ["readable channels filter in Solr", "filter in the engine"], ["real time + batch rebuild", "two index paths"]], ctn: ["lit", "sky", "ok", "warn"] },
  ],
  scale: [
    { k: ["Meera's Monday", "Meera's Monday"], on: { ...ALL, flannel: "lit", cs: "lit", kafka: "lit" }, fl: [["clients", "flannel"], ["webapp", "cs"], ["cs", "gw"], ["webapp", "kafka"]], figs: [["6,000", ["laptops booting cold", "cold boots"], "warn"], ["9:58", ["@here to 900 members", "@here"], "lit"], ["10:00", ["reminders fire everywhere", "top of the hour"]]], note: ["slim boots, the edge cache and the job queue absorb all three", "absorbed"] },
    {
      k: "the cases that bite",
      kt: "warn",
      on: { clients: 1, webapp: "warn", cs: 1, gw: "lit", search: 1, vitess: 1 },
      chips: [["stale load-balancer slots, 2020", "stale LB slots"], ["half a zone fails: drain it", "zone drain"], ["a company leaves a shared channel", "company leaves"], ["monitoring off the failure path", "monitoring apart"]],
      ctn: ["warn", "bad", "sky", "lit"],
    },
    { k: ["4 January 2021", "4 Jan 2021"], kt: "bad", on: { ...ALL, webapp: "bad", gw: "warn", clients: "warn" }, fl: [["clients", "webapp", "bad"]], figs: [["99%", ["messages sent at 6:57", "at 6:57"], "warn"], ["1,200", ["servers asked for, 7:01–7:15", "servers asked"], "bad"], ["10:40", ["network normal again", "recovered"], "lit"]], note: ["\"scales automatically\" has a speed limit: pre-scale for a known spike", "pre-scale known spikes"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, cs: "ok", vitess: "ok", kafka: "ok" }, fl: [["webapp", "vitess", "ok"], ["webapp", "cs", "ok"], ["webapp", "kafka", "ok"]], cols: 3, chips: [["route by channel", "by channel"], ["store, then send", "store, then send"], ["jobs on a durable log", "durable jobs"]], ctn: ["lit", "sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Slack had 12.5 million simultaneously connected users in March 2020 and by 2023 served tens of millions of connected clients, delivering messages across the world in 500 ms; its database peaked at 2.3 million queries a second (p99 11 ms, 2020), and its job queue ran 1.4 billion jobs on the busiest days (2017).", tween: 1400 },
      { caption: "Workspaces, orgs of many workspaces and channels shared by up to 250 organisations; every message stored, then delivered to every connected member in about 500 ms; typing events that are never stored; search over exactly what each user may read; notifications by each person's rules; and background jobs that never block a send.", tween: 1400 },
      { caption: "Assuming ~20 million people connected at the daily peak on ~1.5 clients each, that's ~30 million websockets; ~20,000 messages a second in a top-of-the-hour minute, to ~30 connected clients each, with ~4 events per message, is ~2.4 million deliveries a second (all assumed).", tween: 1400, loop: true },
      { caption: "At peak a channel server holds about 16 million channels, where a channel is any ID events are addressed to (a user, a workspace, an org, a file, a huddle or a conversation); at an assumed ~400 million IDs that's ~25 servers, ~50 at half load, and a replacement is in service in under 20 seconds.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Meera's @here goes over HTTPS to the webapp, which checks she's a member and may use @here, then writes the message to MySQL behind Vitess, on the shard that owns the channel's ID, before anyone sees it.", tween: 1200, loop: true },
      { caption: "Through an admin server, the message reaches the one channel server that owns the channel's ID on a consistent-hash ring; it sends one copy to every gateway server, in every region, with a subscribed client, and each gateway pushes it down its own websockets.", tween: 1200, loop: true },
      { caption: "Flannel, an edge cache at the points of presence, boots clients with a slim payload (the user, their channels, one channel's messages) and answers their queries; a workspace's clients in one region share an instance, so the core sees one fetch per workspace per region.", tween: 1200, loop: true },
      { caption: "Notifications, link unfurls, index updates and reminders are jobs: the webapp writes them to Kafka through Kafkagate, a relay moves them into Redis at a rate the workers can take, and workers decide who to notify, push to phones and update the search index.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "A shared channel has one channels row and one history on the owner's shard, plus a shared_channels row per workspace that overrides its name, topic and privacy for that side: one copy means one order, and every access check asks about membership, not workspace.", tween: 1400, loop: true },
      { caption: "Channel IDs are hashed onto the ring, so one company's channels spread over every channel server; when a server dies, a replacement is in service in under 20 seconds, gateways resubscribe the moved channels, and in our design a client that sees a sequence gap fetches it from history.", tween: 1400, loop: true },
      { caption: "Workspace shards capped the biggest customers at the biggest host, so Slack moved to Vitess and shards each table by its queries' key: messages by channel, membership by user and by channel. On 22 February 2022 an emptied cache turned a group-DM lookup into scatter queries over every shard, until boots were throttled and only missing keys fetched.", tween: 1400, loop: true },
      { caption: "A full Redis once stopped both enqueues and dequeues, so Slack put Kafka in front: Kafkagate writes each job to Kafka (2 days' retention), and JQRelay moves jobs into Redis at a rate the workers can sustain, so a backlog becomes lag on disk and posting never stops. The peak was 33,000 jobs a second.", tween: 1400, loop: true },
      { caption: "One job per message decides who to notify, by preferences, do-not-disturb and device, then one job per device pushes; @here reaches only active members. Search passes the channel IDs the searcher can read into Solr as a filter, indexes new messages in seconds and rebuilds from the full data in batch.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "Meera's Monday: from 9:30, 6,000 Paylane laptops boot with cold caches; at 9:58 her @here reaches the 900 members of #inc-payments; at 10:00:00 reminders fire across thousands of companies. Slim boots, the edge cache and the job queue absorb all three.", tween: 1400, loop: true },
      { caption: "In May 2020 HAProxy's backend list went stale and scale-down removed the only servers it knew; in June 2021 a bad link in one zone degraded everything until critical services were siloed per zone and drainable from the edge in 1% steps; and a company that leaves a shared channel loses its subscriptions, search and notifications at once.", tween: 1400 },
      { caption: "4 January 2021: one AWS Transit Gateway didn't scale for the first-Monday return and dropped packets; waiting threads cut CPU, so autoscaling scaled down, then asked for 1,200 servers that provisioning couldn't set up, and the network was normal again at 10:40. The fix: pre-scale for the known spike and load-test provisioning.", tween: 1400, loop: true },
      { caption: "The lesson: make the channel the unit of routing and storage while the organisation stays the unit of policy, store every message before sending it, and put everything a message causes on a log that never refuses a job.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
